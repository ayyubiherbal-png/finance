-- =====================================================================
-- 0042  Umpan balik pelanggan -- survei kepuasan + minta testimoni
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  Celah #6 DAN #7 dari 7 sekaligus (customer journey Tahap 3
--  Evaluasi, dan Tahap 5 Advokasi) -- keduanya butuh infrastruktur yang
--  SAMA: pelanggan tidak punya akun/login di aplikasi ini, jadi
--  satu-satunya cara menangkap jawaban mereka adalah lewat TAUTAN
--  PUBLIK tanpa login. Satu link, satu isian: skor kepuasan (CSAT,
--  1-5) DAN testimoni teks opsional -- daripada bikin 2 sistem
--  terpisah untuk hal yang sama-sama "minta pelanggan mengisi sesuatu
--  lewat link".
--
--  Desain keamanan: TIDAK ADA policy RLS select/insert langsung untuk
--  anon di kedua tabel (kalau ada, `token` acak jadi percuma -- anon
--  bisa `select *` tanpa filter dan lihat SEMUA link/nama/isian orang
--  lain). Sebagai gantinya, satu-satunya jalan masuk untuk pengunjung
--  publik adalah 2 RPC SECURITY DEFINER di bawah, yang keduanya
--  mensyaratkan tahu `token` PERSIS (acak, 32 karakter hex, praktis
--  tidak bisa ditebak) -- pola "magic link" yang umum dipakai untuk
--  akses tanpa akun.
-- =====================================================================

create table link_umpan_balik (
  id            uuid primary key default gen_random_uuid(),
  token         text not null unique default encode(gen_random_bytes(16), 'hex'),
  entitas_tipe  text not null check (entitas_tipe in ('pelanggan', 'pembeli_marketplace')),
  entitas_id    uuid not null,
  faktur_id     uuid references faktur_penjualan(id) on delete set null,
  nama          text,  -- snapshot, sama alasannya dengan riwayat_follow_up (0029)
  sudah_diisi   boolean not null default false,
  dibuat_oleh   uuid references profil(id) on delete set null,
  dibuat_pada   timestamptz not null default now()
);
create index idx_link_umpan_balik_entitas on link_umpan_balik(entitas_tipe, entitas_id, dibuat_pada desc);

create table umpan_balik (
  id                     uuid primary key default gen_random_uuid(),
  link_id                uuid not null unique references link_umpan_balik(id) on delete cascade,
  skor                   smallint check (skor between 1 and 5),
  testimoni              text,
  boleh_dipublikasikan   boolean not null default false,
  dibuat_pada            timestamptz not null default now()
);

alter table link_umpan_balik enable row level security;
alter table umpan_balik enable row level security;

do $$
begin
  -- Staf boleh baca semua (untuk halaman admin "Umpan Balik") dan buat
  -- link baru. TIDAK ada policy untuk `anon` sama sekali -- lihat RPC
  -- di bawah untuk jalur publik.
  if not exists (select 1 from pg_policies where tablename = 'link_umpan_balik' and policyname = 'baca') then
    create policy baca on link_umpan_balik for select to authenticated using (user_aktif());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'link_umpan_balik' and policyname = 'tulis') then
    create policy tulis on link_umpan_balik for insert to authenticated with check (boleh_sales());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'umpan_balik' and policyname = 'baca') then
    create policy baca on umpan_balik for select to authenticated using (user_aktif());
  end if;
end $$;

grant select, insert on link_umpan_balik to authenticated;
grant select on umpan_balik to authenticated;

-- ---------- Jalur publik (anon, tanpa login) lewat RPC SECURITY DEFINER ----------

-- Dipanggil halaman publik saat dibuka -- tampilkan nama & apakah sudah pernah diisi.
create or replace function ambil_link_umpan_balik(p_token text)
returns table (nama text, sudah_diisi boolean) language sql security definer set search_path = public stable as $$
  select nama, sudah_diisi from link_umpan_balik where token = p_token;
$$;

grant execute on function ambil_link_umpan_balik(text) to anon, authenticated;

-- Dipanggil saat pelanggan submit formulirnya. Idempotent secukupnya --
-- `link_id` unique di `umpan_balik` mencegah isi dobel kalau linknya
-- diklik ulang setelah submit pertama (akan gagal kena unique
-- constraint, ditangani sebagai error biasa di frontend).
create or replace function kirim_umpan_balik(p_token text, p_skor smallint, p_testimoni text, p_boleh_publikasi boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_link_id uuid;
begin
  select id into v_link_id from link_umpan_balik where token = p_token and not sudah_diisi;
  if v_link_id is null then
    raise exception 'Tautan tidak ditemukan atau sudah pernah diisi.';
  end if;

  insert into umpan_balik (link_id, skor, testimoni, boleh_dipublikasikan)
  values (v_link_id, p_skor, nullif(trim(p_testimoni), ''), p_boleh_publikasi);

  update link_umpan_balik set sudah_diisi = true where id = v_link_id;
end;
$$;

grant execute on function kirim_umpan_balik(text, smallint, text, boolean) to anon, authenticated;
