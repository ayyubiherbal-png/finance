-- =====================================================================
-- 0002  Master Data
-- =====================================================================

-- ---------- Pengguna ----------
create table profil (
  id          uuid primary key references auth.users(id) on delete cascade,
  nama        text not null,
  peran       peran_pengguna not null default 'sales',
  telepon     text,
  aktif       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_profil_updated before update on profil
  for each row execute function set_updated_at();

-- Buat profil otomatis saat user baru mendaftar
create or replace function fn_buat_profil_baru()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profil (id, nama)
  values (new.id, coalesce(new.raw_user_meta_data->>'nama', split_part(new.email, '@', 1)));
  return new;
end;
$$;
create trigger trg_user_baru after insert on auth.users
  for each row execute function fn_buat_profil_baru();

-- ---------- Gudang ----------
create table gudang (
  id         uuid primary key default gen_random_uuid(),
  kode       text not null unique,
  nama       text not null,
  alamat     text,
  utama      boolean not null default false,
  aktif      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index uq_gudang_utama on gudang(utama) where utama;
create trigger trg_gudang_updated before update on gudang
  for each row execute function set_updated_at();

-- ---------- Kategori produk (hierarkis) ----------
create table kategori_produk (
  id         uuid primary key default gen_random_uuid(),
  kode       text not null unique,
  nama       text not null,
  induk_id   uuid references kategori_produk(id) on delete set null,
  aktif      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_kategori_updated before update on kategori_produk
  for each row execute function set_updated_at();

-- ---------- Satuan ----------
create table satuan (
  id         uuid primary key default gen_random_uuid(),
  kode       text not null unique,   -- PCS, LSN, DUS, KRT
  nama       text not null,
  created_at timestamptz not null default now()
);

-- ---------- Produk ----------
create table produk (
  id              uuid primary key default gen_random_uuid(),
  kode            text not null unique,              -- SKU
  barcode         text unique,
  nama            text not null,
  kategori_id     uuid references kategori_produk(id) on delete set null,
  satuan_dasar_id uuid not null references satuan(id),
  -- HPP rata-rata bergerak (moving average), selalu dalam SATUAN DASAR.
  -- Dihitung otomatis oleh trigger di 0006 -- jangan diisi manual.
  hpp_rata2       numeric(18,4) not null default 0,
  stok_min        numeric(18,4) not null default 0,  -- reorder point (satuan dasar)
  berat_gram      numeric(18,2),
  pakai_batch     boolean not null default false,    -- disiapkan untuk fase lanjut
  aktif           boolean not null default true,
  catatan         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_produk_nama_trgm on produk using gin (nama gin_trgm_ops);
create index idx_produk_kategori on produk(kategori_id);
create trigger trg_produk_updated before update on produk
  for each row execute function set_updated_at();

-- ---------- Satuan berjenjang per produk ----------
-- konversi = berapa SATUAN DASAR dalam 1 satuan ini.
-- Contoh: PCS konversi 1 (dasar), LUSIN konversi 12, DUS konversi 144.
create table produk_satuan (
  id         uuid primary key default gen_random_uuid(),
  produk_id  uuid not null references produk(id) on delete cascade,
  satuan_id  uuid not null references satuan(id),
  konversi   numeric(18,4) not null check (konversi > 0),
  barcode    text,
  urutan     smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (produk_id, satuan_id)
);
create index idx_produk_satuan_produk on produk_satuan(produk_id);

-- ---------- Tier harga (grosir / semi grosir / retail / kontrak) ----------
create table tier_harga (
  id           uuid primary key default gen_random_uuid(),
  kode         text not null unique,
  nama         text not null,
  urutan       smallint not null default 0,
  jadi_default boolean not null default false,
  aktif        boolean not null default true,
  created_at   timestamptz not null default now()
);
create unique index uq_tier_default on tier_harga(jadi_default) where jadi_default;

-- ---------- Daftar harga jual ----------
-- Satu produk bisa punya harga berbeda per tier, per satuan, dan per
-- minimum kuantitas (diskon bertingkat). Saat transaksi, ambil baris
-- dengan min_qty terbesar yang masih <= qty pesanan.
create table produk_harga (
  id             uuid primary key default gen_random_uuid(),
  produk_id      uuid not null references produk(id) on delete cascade,
  tier_harga_id  uuid not null references tier_harga(id) on delete cascade,
  satuan_id      uuid not null references satuan(id),
  min_qty        numeric(18,4) not null default 1,
  harga          numeric(18,2) not null check (harga >= 0),
  berlaku_mulai  date not null default current_date,
  berlaku_sampai date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (produk_id, tier_harga_id, satuan_id, min_qty, berlaku_mulai),
  check (berlaku_sampai is null or berlaku_sampai >= berlaku_mulai)
);
create index idx_produk_harga_lookup on produk_harga(produk_id, tier_harga_id, satuan_id);
create trigger trg_produk_harga_updated before update on produk_harga
  for each row execute function set_updated_at();

-- ---------- Pelanggan ----------
create table pelanggan (
  id             uuid primary key default gen_random_uuid(),
  kode           text not null unique,
  nama           text not null,
  tipe           tipe_pelanggan not null default 'toko',
  tier_harga_id  uuid references tier_harga(id),
  sales_id       uuid references profil(id) on delete set null, -- salesman penanggung jawab
  kontak_nama    text,
  telepon        text,
  email          text,
  alamat         text,
  kota           text,
  npwp           text,
  termin         termin_bayar not null default 'cod',
  termin_hari    smallint not null default 0 check (termin_hari >= 0),
  limit_kredit   numeric(18,2) not null default 0 check (limit_kredit >= 0),
  aktif          boolean not null default true,
  catatan        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_pelanggan_nama_trgm on pelanggan using gin (nama gin_trgm_ops);
create index idx_pelanggan_sales on pelanggan(sales_id);
create trigger trg_pelanggan_updated before update on pelanggan
  for each row execute function set_updated_at();

-- ---------- Supplier ----------
create table supplier (
  id           uuid primary key default gen_random_uuid(),
  kode         text not null unique,
  nama         text not null,
  kontak_nama  text,
  telepon      text,
  email        text,
  alamat       text,
  kota         text,
  npwp         text,
  termin_hari  smallint not null default 0 check (termin_hari >= 0),
  aktif        boolean not null default true,
  catatan      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_supplier_nama_trgm on supplier using gin (nama gin_trgm_ops);
create trigger trg_supplier_updated before update on supplier
  for each row execute function set_updated_at();
