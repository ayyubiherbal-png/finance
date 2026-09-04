-- =====================================================================
-- 0004  Siklus Penjualan (Order to Cash)
--       Sales Order -> Surat Jalan -> Faktur -> Penerimaan Kas
--       plus Retur Penjualan
-- =====================================================================

-- ---------- Sales Order ----------
create table sales_order (
  id             uuid primary key default gen_random_uuid(),
  nomor          text not null unique,
  tanggal        date not null default current_date,
  pelanggan_id   uuid not null references pelanggan(id) on delete restrict,
  sales_id       uuid references profil(id) on delete set null,
  gudang_id      uuid not null references gudang(id) on delete restrict,
  tier_harga_id  uuid references tier_harga(id),
  termin         termin_bayar not null default 'cod',
  termin_hari    smallint not null default 0,
  status         status_dokumen not null default 'draf',
  -- Kolom total di bawah dihitung ulang otomatis oleh trigger dari itemnya.
  subtotal       numeric(18,2) not null default 0,
  diskon_header  numeric(18,2) not null default 0 check (diskon_header >= 0),
  dpp            numeric(18,2) not null default 0,
  ppn_persen     numeric(5,2)  not null default 0 check (ppn_persen >= 0),
  ppn_nilai      numeric(18,2) not null default 0,
  total          numeric(18,2) not null default 0,
  alamat_kirim   text,
  catatan        text,
  dibuat_oleh    uuid references profil(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_so_pelanggan on sales_order(pelanggan_id, tanggal desc);
create index idx_so_status on sales_order(status) where status <> 'selesai';
create index idx_so_sales on sales_order(sales_id, tanggal desc);
create trigger trg_so_updated before update on sales_order
  for each row execute function set_updated_at();

create table sales_order_item (
  id            uuid primary key default gen_random_uuid(),
  so_id         uuid not null references sales_order(id) on delete cascade,
  produk_id     uuid not null references produk(id) on delete restrict,
  satuan_id     uuid not null references satuan(id),
  konversi      numeric(18,4) not null default 1 check (konversi > 0),
  qty           numeric(18,4) not null check (qty > 0),
  qty_dasar     numeric(18,4) generated always as (qty * konversi) stored,
  harga_satuan  numeric(18,2) not null check (harga_satuan >= 0),
  diskon_persen numeric(5,2)  not null default 0 check (diskon_persen between 0 and 100),
  diskon_nilai  numeric(18,2) not null default 0 check (diskon_nilai >= 0),
  subtotal      numeric(18,2) generated always as (
                  round(qty * harga_satuan * (1 - diskon_persen / 100), 2) - diskon_nilai
                ) stored,
  qty_terkirim  numeric(18,4) not null default 0,  -- diisi trigger dari surat jalan
  catatan       text,
  urutan        smallint not null default 0
);
create index idx_so_item_header on sales_order_item(so_id);
create index idx_so_item_produk on sales_order_item(produk_id);

-- ---------- Surat Jalan (pengiriman barang) ----------
-- Satu SO boleh dikirim bertahap: 1 SO -> banyak Surat Jalan.
create table surat_jalan (
  id             uuid primary key default gen_random_uuid(),
  nomor          text not null unique,
  tanggal        date not null default current_date,
  so_id          uuid references sales_order(id) on delete restrict,
  pelanggan_id   uuid not null references pelanggan(id) on delete restrict,
  gudang_id      uuid not null references gudang(id) on delete restrict,
  status         status_dokumen not null default 'draf',
  alamat_kirim   text,
  ekspedisi      text,
  nomor_kendaraan text,
  nama_sopir     text,
  diterima_oleh  text,
  tanggal_terima date,
  catatan        text,
  dibuat_oleh    uuid references profil(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_sj_so on surat_jalan(so_id);
create index idx_sj_pelanggan on surat_jalan(pelanggan_id, tanggal desc);
create trigger trg_sj_updated before update on surat_jalan
  for each row execute function set_updated_at();

create table surat_jalan_item (
  id          uuid primary key default gen_random_uuid(),
  sj_id       uuid not null references surat_jalan(id) on delete cascade,
  so_item_id  uuid references sales_order_item(id) on delete set null,
  produk_id   uuid not null references produk(id) on delete restrict,
  satuan_id   uuid not null references satuan(id),
  konversi    numeric(18,4) not null default 1 check (konversi > 0),
  qty         numeric(18,4) not null check (qty > 0),
  qty_dasar   numeric(18,4) generated always as (qty * konversi) stored,
  catatan     text
);
create index idx_sj_item_header on surat_jalan_item(sj_id);
create index idx_sj_item_soitem on surat_jalan_item(so_item_id);

-- ---------- Faktur Penjualan ----------
create table faktur_penjualan (
  id            uuid primary key default gen_random_uuid(),
  nomor         text not null unique,
  nomor_efaktur text,
  tanggal       date not null default current_date,
  jatuh_tempo   date not null default current_date,
  pelanggan_id  uuid not null references pelanggan(id) on delete restrict,
  so_id         uuid references sales_order(id) on delete set null,
  sales_id      uuid references profil(id) on delete set null,
  status        status_dokumen not null default 'draf',
  subtotal      numeric(18,2) not null default 0,
  diskon_header numeric(18,2) not null default 0 check (diskon_header >= 0),
  dpp           numeric(18,2) not null default 0,
  ppn_persen    numeric(5,2)  not null default 0,
  ppn_nilai     numeric(18,2) not null default 0,
  total         numeric(18,2) not null default 0,
  terbayar      numeric(18,2) not null default 0,   -- diisi trigger dari alokasi pembayaran
  sisa          numeric(18,2) generated always as (total - terbayar) stored,
  status_bayar  status_bayar not null default 'belum',
  catatan       text,
  dibuat_oleh   uuid references profil(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_fp_pelanggan on faktur_penjualan(pelanggan_id, tanggal desc);
create index idx_fp_outstanding on faktur_penjualan(jatuh_tempo)
  where status_bayar <> 'lunas' and status <> 'dibatalkan';
create trigger trg_fp_updated before update on faktur_penjualan
  for each row execute function set_updated_at();

create table faktur_penjualan_item (
  id            uuid primary key default gen_random_uuid(),
  faktur_id     uuid not null references faktur_penjualan(id) on delete cascade,
  produk_id     uuid not null references produk(id) on delete restrict,
  satuan_id     uuid not null references satuan(id),
  konversi      numeric(18,4) not null default 1 check (konversi > 0),
  qty           numeric(18,4) not null check (qty > 0),
  qty_dasar     numeric(18,4) generated always as (qty * konversi) stored,
  harga_satuan  numeric(18,2) not null check (harga_satuan >= 0),
  diskon_persen numeric(5,2)  not null default 0 check (diskon_persen between 0 and 100),
  diskon_nilai  numeric(18,2) not null default 0 check (diskon_nilai >= 0),
  subtotal      numeric(18,2) generated always as (
                  round(qty * harga_satuan * (1 - diskon_persen / 100), 2) - diskon_nilai
                ) stored,
  -- Snapshot HPP per satuan dasar saat faktur dibuat. Ini yang dipakai
  -- untuk hitung laba kotor; disimpan supaya laporan periode lalu tidak
  -- ikut berubah ketika HPP rata-rata bergerak.
  hpp_satuan    numeric(18,4) not null default 0,
  hpp_total     numeric(18,2) generated always as (round(qty * konversi * hpp_satuan, 2)) stored,
  urutan        smallint not null default 0
);
create index idx_fp_item_header on faktur_penjualan_item(faktur_id);
create index idx_fp_item_produk on faktur_penjualan_item(produk_id);

-- Satu faktur boleh menagih beberapa surat jalan sekaligus.
create table faktur_penjualan_sj (
  faktur_id uuid not null references faktur_penjualan(id) on delete cascade,
  sj_id     uuid not null references surat_jalan(id) on delete restrict,
  primary key (faktur_id, sj_id)
);

-- ---------- Penerimaan Kas (pembayaran dari pelanggan) ----------
-- Satu pembayaran boleh dialokasikan ke beberapa faktur sekaligus.
create table penerimaan_kas (
  id            uuid primary key default gen_random_uuid(),
  nomor         text not null unique,
  tanggal       date not null default current_date,
  pelanggan_id  uuid not null references pelanggan(id) on delete restrict,
  metode        metode_bayar not null default 'transfer',
  bank_nama     text,
  nomor_referensi text,                                  -- no. giro / no. transaksi
  tanggal_cair  date,                                    -- untuk giro
  jumlah        numeric(18,2) not null check (jumlah > 0),
  status        status_dokumen not null default 'disetujui',
  catatan       text,
  dibuat_oleh   uuid references profil(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_kas_pelanggan on penerimaan_kas(pelanggan_id, tanggal desc);
create trigger trg_kas_updated before update on penerimaan_kas
  for each row execute function set_updated_at();

create table penerimaan_kas_alokasi (
  id              uuid primary key default gen_random_uuid(),
  penerimaan_id   uuid not null references penerimaan_kas(id) on delete cascade,
  faktur_id       uuid not null references faktur_penjualan(id) on delete restrict,
  jumlah          numeric(18,2) not null check (jumlah > 0),
  unique (penerimaan_id, faktur_id)
);
create index idx_kas_alokasi_faktur on penerimaan_kas_alokasi(faktur_id);

-- ---------- Retur Penjualan ----------
create table retur_penjualan (
  id           uuid primary key default gen_random_uuid(),
  nomor        text not null unique,
  tanggal      date not null default current_date,
  pelanggan_id uuid not null references pelanggan(id) on delete restrict,
  faktur_id    uuid references faktur_penjualan(id) on delete set null,
  gudang_id    uuid not null references gudang(id) on delete restrict,
  status       status_dokumen not null default 'draf',
  masuk_stok   boolean not null default true,  -- false bila barang rusak / dimusnahkan
  alasan       text,
  total        numeric(18,2) not null default 0,
  dibuat_oleh  uuid references profil(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger trg_retur_jual_updated before update on retur_penjualan
  for each row execute function set_updated_at();

create table retur_penjualan_item (
  id           uuid primary key default gen_random_uuid(),
  retur_id     uuid not null references retur_penjualan(id) on delete cascade,
  produk_id    uuid not null references produk(id) on delete restrict,
  satuan_id    uuid not null references satuan(id),
  konversi     numeric(18,4) not null default 1 check (konversi > 0),
  qty          numeric(18,4) not null check (qty > 0),
  qty_dasar    numeric(18,4) generated always as (qty * konversi) stored,
  harga_satuan numeric(18,2) not null default 0,
  subtotal     numeric(18,2) generated always as (round(qty * harga_satuan, 2)) stored
);
create index idx_retur_jual_item_header on retur_penjualan_item(retur_id);
