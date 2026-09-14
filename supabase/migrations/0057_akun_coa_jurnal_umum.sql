-- =====================================================================
-- 0057  Fondasi Chart of Accounts (COA) + Jurnal Umum (General Ledger)
--
-- Bagian 1 dari rencana bertahap (0057-0061) untuk membangun pondasi
-- akuntansi double-entry di atas sistem direct-effect yang sudah ada.
-- Lihat rencana lengkap untuk konteks & alasan tiap keputusan desain.
--
-- Migrasi ini SENGAJA murni fondasi -- TIDAK ADA satu trigger pun yang
-- memanggil fn_posting_jurnal() di sini. Menambah tabel & fungsi baru
-- tanpa mengubah perilaku sistem yang sudah live sama sekali. Trigger
-- yang benar-benar memposting jurnal menyusul di 0058-0061 setelah
-- fondasi ini diverifikasi aman.
--
-- Prinsip (mengikuti pola stok_mutasi yang sudah ada):
--   - jurnal_umum/jurnal_umum_baris APPEND-ONLY. Tidak ada policy tulis
--     untuk klien -- satu-satunya jalan masuk adalah fn_posting_jurnal(),
--     security definer, dipanggil dari trigger dokumen sumber.
--   - Pembatalan dokumen = jurnal balik (baris baru, debit/kredit
--     tertukar), bukan update/delete baris lama.
-- =====================================================================

-- ---------- Tabel akun (Chart of Accounts) ----------
create type tipe_akun_coa as enum ('aset', 'liabilitas', 'ekuitas', 'pendapatan', 'beban');
create type saldo_normal_coa as enum ('debit', 'kredit');

create table akun_coa (
  id            uuid primary key default gen_random_uuid(),
  kode          text not null unique,
  nama          text not null,
  tipe          tipe_akun_coa not null,
  saldo_normal  saldo_normal_coa not null,
  induk_id      uuid references akun_coa(id) on delete restrict,
  aktif         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_akun_coa_induk on akun_coa(induk_id);
create trigger trg_akun_coa_updated before update on akun_coa
  for each row execute function set_updated_at();

-- ---------- Akun baku (tidak bergantung data yang sudah ada) ----------
insert into akun_coa (kode, nama, tipe, saldo_normal) values
  ('1-1000', 'Kas & Bank',              'aset',        'debit'),
  ('1-1400', 'PPN Masukan',             'aset',        'debit'),
  ('1-2000', 'Piutang Usaha',           'aset',        'debit'),
  ('1-3000', 'Persediaan',              'aset',        'debit'),
  ('2-1000', 'Utang Usaha',             'liabilitas',  'kredit'),
  ('2-1100', 'PPN Keluaran',            'liabilitas',  'kredit'),
  ('3-1000', 'Modal Pemilik',           'ekuitas',     'kredit'),
  ('3-2000', 'Prive (Ambil Pribadi)',   'ekuitas',     'kredit'),
  ('4-1000', 'Penjualan',               'pendapatan',  'kredit'),
  ('4-2000', 'Retur Penjualan',         'pendapatan',  'debit'),   -- kontra-pendapatan, saldo normal debit
  ('5-1000', 'Harga Pokok Penjualan',   'beban',       'debit'),
  ('6-1000', 'Beban Operasional',       'beban',       'debit'),   -- header/induk untuk sub-akun per kategori_biaya
  ('6-9000', 'Kerugian Persediaan',     'beban',       'debit');

update akun_coa set induk_id = (select id from akun_coa where kode = '1-1000')
  where kode in ('1-1400');

-- ---------- Hubungkan Kas & Bank yang sudah ada ke akun anak 1-1001+ ----------
alter table akun_kas_bank add column akun_coa_id uuid references akun_coa(id);

do $$
declare
  r record;
  v_induk_id uuid;
  v_urutan int := 1;
  v_akun_id uuid;
begin
  select id into v_induk_id from akun_coa where kode = '1-1000';
  for r in select id, nama from akun_kas_bank order by kode loop
    insert into akun_coa (kode, nama, tipe, saldo_normal, induk_id)
    values ('1-10' || lpad(v_urutan::text, 2, '0'), r.nama, 'aset', 'debit', v_induk_id)
    returning id into v_akun_id;
    update akun_kas_bank set akun_coa_id = v_akun_id where id = r.id;
    v_urutan := v_urutan + 1;
  end loop;
end $$;

alter table akun_kas_bank alter column akun_coa_id set not null;

-- Form AkunKasBankForm.tsx belum tahu kolom ini -- auto-provision transparan
-- saat baris baru dibuat, supaya form yang sudah ada TIDAK PERLU diubah dan
-- tidak gagal kena constraint not null. Pola sama seperti fn_set_nomor()
-- yang auto-isi `nomor` kalau belum diisi klien.
create or replace function fn_auto_akun_coa_kas_bank()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_induk_id uuid;
  v_urutan   int;
  v_akun_id  uuid;
begin
  if new.akun_coa_id is not null then return new; end if;
  select id into v_induk_id from akun_coa where kode = '1-1000';
  select coalesce(max(substring(kode from '(\d+)$')::int), 0) + 1 into v_urutan
    from akun_coa where induk_id = v_induk_id;
  insert into akun_coa (kode, nama, tipe, saldo_normal, induk_id)
  values ('1-10' || lpad(v_urutan::text, 2, '0'), new.nama, 'aset', 'debit', v_induk_id)
  returning id into v_akun_id;
  new.akun_coa_id := v_akun_id;
  return new;
end;
$$;
create trigger trg_auto_akun_coa_kas_bank before insert on akun_kas_bank
  for each row execute function fn_auto_akun_coa_kas_bank();

-- ---------- Hubungkan Kategori Biaya yang sudah ada ke akun anak 6-1001+ ----------
alter table kategori_biaya add column akun_coa_id uuid references akun_coa(id);

do $$
declare
  r record;
  v_induk_id uuid;
  v_urutan int := 1;
  v_akun_id uuid;
begin
  select id into v_induk_id from akun_coa where kode = '6-1000';
  for r in select id, nama from kategori_biaya order by kode loop
    insert into akun_coa (kode, nama, tipe, saldo_normal, induk_id)
    values ('6-10' || lpad(v_urutan::text, 2, '0'), r.nama, 'beban', 'debit', v_induk_id)
    returning id into v_akun_id;
    update kategori_biaya set akun_coa_id = v_akun_id where id = r.id;
    v_urutan := v_urutan + 1;
  end loop;
end $$;

alter table kategori_biaya alter column akun_coa_id set not null;

-- KategoriBiayaForm.tsx belum tahu kolom ini -- auto-provision transparan
-- sama seperti akun_kas_bank di atas, supaya form yang sudah ada tetap jalan.
create or replace function fn_auto_akun_coa_kategori_biaya()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_induk_id uuid;
  v_urutan   int;
  v_akun_id  uuid;
begin
  if new.akun_coa_id is not null then return new; end if;
  select id into v_induk_id from akun_coa where kode = '6-1000';
  select coalesce(max(substring(kode from '(\d+)$')::int), 0) + 1 into v_urutan
    from akun_coa where induk_id = v_induk_id;
  insert into akun_coa (kode, nama, tipe, saldo_normal, induk_id)
  values ('6-10' || lpad(v_urutan::text, 2, '0'), new.nama, 'beban', 'debit', v_induk_id)
  returning id into v_akun_id;
  new.akun_coa_id := v_akun_id;
  return new;
end;
$$;
create trigger trg_auto_akun_coa_kategori_biaya before insert on kategori_biaya
  for each row execute function fn_auto_akun_coa_kategori_biaya();

-- ---------- Jurnal Umum (header + baris) ----------
create table jurnal_umum (
  id           uuid primary key default gen_random_uuid(),
  nomor        text not null unique,
  tanggal      date not null,
  ref_tabel    text not null,
  ref_id       uuid not null,
  ref_nomor    text not null,
  keterangan   text not null,
  dibuat_oleh  uuid references profil(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index idx_jurnal_ref on jurnal_umum(ref_tabel, ref_id);
create index idx_jurnal_tanggal on jurnal_umum(tanggal);
create trigger trg_nomor_ju before insert on jurnal_umum
  for each row execute function fn_set_nomor('JU');

create table jurnal_umum_baris (
  id         uuid primary key default gen_random_uuid(),
  jurnal_id  uuid not null references jurnal_umum(id) on delete restrict,
  akun_id    uuid not null references akun_coa(id) on delete restrict,
  debit      numeric(18,2) not null default 0 check (debit >= 0),
  kredit     numeric(18,2) not null default 0 check (kredit >= 0),
  keterangan text,
  check ((debit > 0 and kredit = 0) or (kredit > 0 and debit = 0))
);
create index idx_jurnal_baris_jurnal on jurnal_umum_baris(jurnal_id);
create index idx_jurnal_baris_akun on jurnal_umum_baris(akun_id);

-- ---------- Satu-satunya jalan masuk untuk menulis jurnal ----------
-- p_baris: jsonb array [{"akun_kode": "1-2000", "debit": 100000, "kredit": 0, "keterangan": "..."}]
create or replace function fn_posting_jurnal(
  p_tanggal date,
  p_ref_tabel text,
  p_ref_id uuid,
  p_ref_nomor text,
  p_keterangan text,
  p_baris jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jurnal_id uuid;
  v_total_debit numeric(18,2);
  v_total_kredit numeric(18,2);
  v_kode_tak_dikenal text;
begin
  if p_baris is null or jsonb_array_length(p_baris) < 2 then
    raise exception 'Jurnal % butuh minimal 2 baris (debit & kredit)', p_ref_nomor;
  end if;

  select sum((b->>'debit')::numeric), sum((b->>'kredit')::numeric)
    into v_total_debit, v_total_kredit
  from jsonb_array_elements(p_baris) b;

  if round(coalesce(v_total_debit, 0), 2) <> round(coalesce(v_total_kredit, 0), 2) then
    raise exception 'Jurnal % tidak balance: debit % <> kredit %', p_ref_nomor, v_total_debit, v_total_kredit;
  end if;

  select b->>'akun_kode' into v_kode_tak_dikenal
  from jsonb_array_elements(p_baris) b
  where not exists (select 1 from akun_coa ak where ak.kode = b->>'akun_kode')
  limit 1;
  if v_kode_tak_dikenal is not null then
    raise exception 'Kode akun COA tidak ditemukan: % (jurnal %)', v_kode_tak_dikenal, p_ref_nomor;
  end if;

  insert into jurnal_umum (tanggal, ref_tabel, ref_id, ref_nomor, keterangan, dibuat_oleh)
  values (p_tanggal, p_ref_tabel, p_ref_id, p_ref_nomor, p_keterangan, auth.uid())
  returning id into v_jurnal_id;

  insert into jurnal_umum_baris (jurnal_id, akun_id, debit, kredit, keterangan)
  select v_jurnal_id, ak.id, coalesce((b->>'debit')::numeric, 0), coalesce((b->>'kredit')::numeric, 0), b->>'keterangan'
  from jsonb_array_elements(p_baris) b
  join akun_coa ak on ak.kode = b->>'akun_kode';

  return v_jurnal_id;
end;
$$;

alter function fn_posting_jurnal(date, text, uuid, text, text, jsonb) set search_path = public;

-- ---------- RLS: baca boleh_finance(), tulis HANYA lewat fn_posting_jurnal() ----------
alter table akun_coa enable row level security;
create policy baca_akun_coa on akun_coa for select to authenticated using (user_aktif());
create policy tulis_akun_coa on akun_coa for all to authenticated using (is_admin()) with check (is_admin());
grant select, insert, update on akun_coa to authenticated;

alter table jurnal_umum enable row level security;
create policy baca_jurnal_umum on jurnal_umum for select to authenticated using (boleh_finance());
grant select on jurnal_umum to authenticated;

alter table jurnal_umum_baris enable row level security;
create policy baca_jurnal_umum_baris on jurnal_umum_baris for select to authenticated using (boleh_finance());
grant select on jurnal_umum_baris to authenticated;

-- fn_posting_jurnal() adalah helper INTERNAL yang dipanggil dari trigger dokumen
-- sumber (0058-0061), BUKAN RPC publik -- klien tidak boleh memanggilnya langsung
-- untuk menyisipkan jurnal sembarangan tanpa lewat validasi bisnis dokumen aslinya.
revoke execute on function fn_posting_jurnal(date, text, uuid, text, text, jsonb) from public;
