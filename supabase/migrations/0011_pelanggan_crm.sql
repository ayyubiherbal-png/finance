-- =====================================================================
-- 0011  Pelanggan -- field persiapan CRM (Fase 3)
--
--  Migrasi tambahan, aman untuk database yang sudah berisi data:
--  semua kolom baru nullable, tidak ada backfill/NOT NULL yang perlu
--  ditangani.
--
--  Fase 3 (CRM sungguhan -- pipeline, tugas follow-up, kampanye) belum
--  dirancang di sini. Ini cuma field-field murah yang jelas akan
--  dibutuhkan begitu Fase 3 digarap, ditambahkan sekarang supaya tidak
--  ada migrasi "ubah struktur" yang menyakitkan nanti setelah data
--  pelanggan sudah menumpuk. Lihat supabase/README.md untuk daftar
--  yang SENGAJA belum ditambahkan (poin, referral, tahap pipeline) dan
--  alasannya.
-- =====================================================================

alter table pelanggan
  add column if not exists whatsapp text,
  add column if not exists sosial_media text,      -- bebas: "IG: @nama / TikTok: @nama"
  add column if not exists tanggal_lahir date,
  add column if not exists kanal_akuisisi kanal_penjualan,  -- dari mana pelanggan ini pertama kali datang
  add column if not exists tag text[] not null default '{}';  -- label bebas: VIP, reseller, dst.

create index idx_pelanggan_tag on pelanggan using gin (tag);

-- ---------------------------------------------------------------------
-- Wilayah administratif Indonesia (Provinsi/Kab-Kota/Kecamatan/Kelurahan)
--
-- Data resmi Kemendagri, dari emsifa/api-wilayah-indonesia (static API,
-- update mingguan otomatis dari sumber mereka). Kode berjenjang dan apa
-- adanya dari sumber (mis. "32" / "32.73" / "32.73.01" / "32.73.01.1001")
-- supaya gampang dicocokkan ulang kalau perlu sinkron di masa depan.
--
-- Tabel referensi murni -- baca untuk semua, tidak ada policy tulis
-- (RLS default Postgres = tolak semua tulis kalau tidak ada policy).
-- Provinsi diisi lewat seed di bawah (kecil, 38 baris); Kabupaten/Kota,
-- Kecamatan, dan Kelurahan diimpor terpisah lewat CSV (lihat catatan
-- di bagian bawah file ini) -- datanya terlalu besar untuk SQL Editor.
-- ---------------------------------------------------------------------

create table wilayah_provinsi (
  kode text primary key,
  nama text not null
);

create table wilayah_kabupaten_kota (
  kode          text primary key,
  provinsi_kode text not null references wilayah_provinsi(kode),
  nama          text not null
);
create index idx_wilayah_kabkota_provinsi on wilayah_kabupaten_kota(provinsi_kode);

create table wilayah_kecamatan (
  kode           text primary key,
  kabupaten_kode text not null references wilayah_kabupaten_kota(kode),
  nama           text not null
);
create index idx_wilayah_kecamatan_kabkota on wilayah_kecamatan(kabupaten_kode);

create table wilayah_kelurahan (
  kode           text primary key,
  kecamatan_kode text not null references wilayah_kecamatan(kode),
  nama           text not null,
  kode_pos       text
);
create index idx_wilayah_kelurahan_kecamatan on wilayah_kelurahan(kecamatan_kode);

alter table wilayah_provinsi enable row level security;
alter table wilayah_kabupaten_kota enable row level security;
alter table wilayah_kecamatan enable row level security;
alter table wilayah_kelurahan enable row level security;

create policy baca on wilayah_provinsi for select to authenticated using (true);
create policy baca on wilayah_kabupaten_kota for select to authenticated using (true);
create policy baca on wilayah_kecamatan for select to authenticated using (true);
create policy baca on wilayah_kelurahan for select to authenticated using (true);

grant select on wilayah_provinsi, wilayah_kabupaten_kota, wilayah_kecamatan, wilayah_kelurahan to authenticated;

-- Alamat pelanggan: field jenjang wilayah + jalan/nomor rumah tetap di
-- `alamat` (sudah ada). Semua nullable -- pelanggan lama/online (akun
-- agregat marketplace) tidak wajib punya alamat sedetail ini.
alter table pelanggan
  add column if not exists provinsi_kode text references wilayah_provinsi(kode),
  add column if not exists kabupaten_kode text references wilayah_kabupaten_kota(kode),
  add column if not exists kecamatan_kode text references wilayah_kecamatan(kode),
  add column if not exists kelurahan_kode text references wilayah_kelurahan(kode);

-- ---------- Seed: Provinsi (38 baris, dari data resmi Kemendagri) ----------
insert into wilayah_provinsi (kode, nama) values
  ('11','Aceh'),
  ('12','Sumatera Utara'),
  ('13','Sumatera Barat'),
  ('14','Riau'),
  ('15','Jambi'),
  ('16','Sumatera Selatan'),
  ('17','Bengkulu'),
  ('18','Lampung'),
  ('19','Kepulauan Bangka Belitung'),
  ('21','Kepulauan Riau'),
  ('31','Daerah Khusus Ibukota Jakarta'),
  ('32','Jawa Barat'),
  ('33','Jawa Tengah'),
  ('34','Daerah Istimewa Yogyakarta'),
  ('35','Jawa Timur'),
  ('36','Banten'),
  ('51','Bali'),
  ('52','Nusa Tenggara Barat'),
  ('53','Nusa Tenggara Timur'),
  ('61','Kalimantan Barat'),
  ('62','Kalimantan Tengah'),
  ('63','Kalimantan Selatan'),
  ('64','Kalimantan Timur'),
  ('65','Kalimantan Utara'),
  ('71','Sulawesi Utara'),
  ('72','Sulawesi Tengah'),
  ('73','Sulawesi Selatan'),
  ('74','Sulawesi Tenggara'),
  ('75','Gorontalo'),
  ('76','Sulawesi Barat'),
  ('81','Maluku'),
  ('82','Maluku Utara'),
  ('91','Papua'),
  ('92','Papua Barat'),
  ('93','Papua Selatan'),
  ('94','Papua Tengah'),
  ('95','Papua Pegunungan'),
  ('96','Papua Barat Daya')
on conflict (kode) do nothing;

-- ---------------------------------------------------------------------
-- Seed: Kabupaten/Kota, Kecamatan, Kelurahan/Desa -- TIDAK disertakan
-- sebagai INSERT di file ini.
--
-- Percobaan pertama migrasi ini (dengan ~91.000 baris ditulis sebagai
-- INSERT literal, ~280 KB) gagal ditempel di SQL Editor Supabase --
-- "Failed to rename snippet: request entity too large". Jadi SEMUA
-- data wilayah di bawah level provinsi diimpor lewat cara yang sama:
-- Supabase Studio -> Table Editor -> pilih tabel -> tombol Insert ->
-- "Import data from CSV". Urutan PENTING (kolom kode-nya foreign key
-- berjenjang, tabel induk harus terisi dulu):
--
--   1. wilayah_kabupaten_kota  <- supabase/seed-data/wilayah_kabupaten_kota.csv   (514 baris)
--   2. wilayah_kecamatan       <- supabase/seed-data/wilayah_kecamatan.csv        (7.285 baris)
--   3. wilayah_kelurahan       <- supabase/seed-data/wilayah_kelurahan.csv        (83.762 baris)
--
-- Header tiap CSV sudah sama persis dengan nama kolom tabelnya, jadi
-- mapping kolom saat import harusnya otomatis cocok. Lihat
-- supabase/README.md untuk langkah lengkap dengan screenshot alurnya.
-- ---------------------------------------------------------------------
