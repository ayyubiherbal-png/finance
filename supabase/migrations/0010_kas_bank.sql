-- =====================================================================
-- 0010  Kas & Bank
--
--  Migrasi tambahan -- dijalankan SETELAH 0001-0009 yang sudah ada di
--  database Anda. Aman dijalankan di database yang sudah berisi data:
--  kolom baru diisi otomatis (backfill) ke akun "Kas Utama" sebelum
--  dikunci NOT NULL, jadi transaksi Penerimaan Kas / Pembayaran
--  Supplier yang sudah ada TIDAK hilang atau rusak.
--
--  Sebelum ini, "Bank" di form Penerimaan Kas/Pembayaran Supplier cuma
--  teks bebas -- tidak benar-benar terhubung ke rekening/kas manapun,
--  jadi tidak ada cara melihat saldo per rekening. Sekarang setiap
--  transaksi WAJIB memilih akun kas/bank tujuan, dan saldo per akun
--  bisa dilihat live dari v_saldo_kas_bank.
-- =====================================================================

create type jenis_akun_kas as enum ('kas', 'bank');

create table akun_kas_bank (
  id             uuid primary key default gen_random_uuid(),
  kode           text not null unique,
  nama           text not null,                 -- "Kas Toko", "BCA Ayyubi Food"
  jenis          jenis_akun_kas not null default 'kas',
  bank_nama      text,                           -- nama bank, hanya relevan kalau jenis='bank'
  nomor_rekening text,
  atas_nama      text,
  saldo_awal     numeric(18,2) not null default 0,
  aktif          boolean not null default true,
  catatan        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger trg_akun_kas_bank_updated before update on akun_kas_bank
  for each row execute function set_updated_at();

-- ---------- Akun default, supaya data lama punya tempat berlabuh ----------
insert into akun_kas_bank (kode, nama, jenis, saldo_awal)
values ('KAS-01', 'Kas Utama', 'kas', 0)
on conflict (kode) do nothing;

-- ---------- Tautkan setiap transaksi kas ke akun ----------
alter table penerimaan_kas
  add column if not exists akun_id uuid references akun_kas_bank(id) on delete restrict;

alter table pembayaran_supplier
  add column if not exists akun_id uuid references akun_kas_bank(id) on delete restrict;

update penerimaan_kas set akun_id = (select id from akun_kas_bank where kode = 'KAS-01')
where akun_id is null;

update pembayaran_supplier set akun_id = (select id from akun_kas_bank where kode = 'KAS-01')
where akun_id is null;

alter table penerimaan_kas alter column akun_id set not null;
alter table pembayaran_supplier alter column akun_id set not null;

create index idx_kas_akun on penerimaan_kas(akun_id, tanggal desc);
create index idx_bayar_akun on pembayaran_supplier(akun_id, tanggal desc);

-- Kolom bank_nama lama di kedua tabel ini DIBIARKAN (tidak dihapus) supaya
-- data yang sudah sempat Anda isi tidak hilang. Sudah tidak dipakai form,
-- murni riwayat/legacy -- boleh dibersihkan belakangan kalau mau.

-- ---------- RLS ----------
alter table akun_kas_bank enable row level security;

create policy baca on akun_kas_bank
  for select to authenticated using (user_aktif());

create policy tulis on akun_kas_bank
  for insert to authenticated with check (is_admin());
create policy ubah on akun_kas_bank
  for update to authenticated using (is_admin()) with check (is_admin());
create policy hapus on akun_kas_bank
  for delete to authenticated using (is_admin());

grant select, insert, update, delete on akun_kas_bank to authenticated;

-- ---------- View: saldo berjalan per akun ----------
create view v_saldo_kas_bank with (security_invoker = true) as
select
  a.id as akun_id, a.kode, a.nama, a.jenis, a.bank_nama, a.nomor_rekening,
  a.atas_nama, a.aktif, a.saldo_awal,
  a.saldo_awal
    + coalesce((
        select sum(k.jumlah) from penerimaan_kas k
        where k.akun_id = a.id and k.status not in ('dibatalkan', 'ditolak')
      ), 0)
    - coalesce((
        select sum(b.jumlah) from pembayaran_supplier b
        where b.akun_id = a.id and b.status not in ('dibatalkan', 'ditolak')
      ), 0) as saldo
from akun_kas_bank a;

-- ---------- View: kartu (mutasi + saldo berjalan) per akun ----------
-- Pola sama dengan v_kartu_stok: window function untuk saldo kumulatif.
create view v_kartu_kas_bank with (security_invoker = true) as
select
  m.ref_id, m.jenis, m.tanggal, m.akun_id, a.kode as kode_akun, a.nama as nama_akun,
  m.ref_nomor, m.masuk, m.keluar, m.catatan,
  a.saldo_awal + sum(m.masuk - m.keluar) over (
    partition by m.akun_id
    order by m.tanggal, m.ref_id
    rows between unbounded preceding and current row
  ) as saldo
from (
  select k.id::text as ref_id, 'penerimaan_kas' as jenis, k.tanggal, k.akun_id,
         k.nomor as ref_nomor, k.jumlah as masuk, 0::numeric as keluar, k.catatan
  from penerimaan_kas k
  where k.status not in ('dibatalkan', 'ditolak')
  union all
  select b.id::text, 'pembayaran_supplier', b.tanggal, b.akun_id,
         b.nomor, 0::numeric, b.jumlah, b.catatan
  from pembayaran_supplier b
  where b.status not in ('dibatalkan', 'ditolak')
) m
join akun_kas_bank a on a.id = m.akun_id;

grant select on v_saldo_kas_bank, v_kartu_kas_bank to authenticated;
