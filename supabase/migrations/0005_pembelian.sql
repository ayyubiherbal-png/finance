-- =====================================================================
-- 0005  Siklus Pembelian (Procure to Pay)
--       Purchase Order -> Penerimaan Barang -> Faktur Beli -> Pembayaran
--       plus Retur Pembelian
-- =====================================================================

-- ---------- Purchase Order ----------
create table purchase_order (
  id            uuid primary key default gen_random_uuid(),
  nomor         text not null unique,
  tanggal       date not null default current_date,
  supplier_id   uuid not null references supplier(id) on delete restrict,
  gudang_id     uuid not null references gudang(id) on delete restrict,
  tanggal_kirim date,
  termin_hari   smallint not null default 0,
  status        status_dokumen not null default 'draf',
  subtotal      numeric(18,2) not null default 0,
  diskon_header numeric(18,2) not null default 0 check (diskon_header >= 0),
  dpp           numeric(18,2) not null default 0,
  ppn_persen    numeric(5,2)  not null default 0,
  ppn_nilai     numeric(18,2) not null default 0,
  total         numeric(18,2) not null default 0,
  catatan       text,
  dibuat_oleh   uuid references profil(id) on delete set null,
  disetujui_oleh uuid references profil(id) on delete set null,
  disetujui_pada timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_po_supplier on purchase_order(supplier_id, tanggal desc);
create index idx_po_status on purchase_order(status) where status <> 'selesai';
create trigger trg_po_updated before update on purchase_order
  for each row execute function set_updated_at();

create table purchase_order_item (
  id            uuid primary key default gen_random_uuid(),
  po_id         uuid not null references purchase_order(id) on delete cascade,
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
  qty_diterima  numeric(18,4) not null default 0,  -- diisi trigger dari penerimaan barang
  urutan        smallint not null default 0
);
create index idx_po_item_header on purchase_order_item(po_id);
create index idx_po_item_produk on purchase_order_item(produk_id);

-- ---------- Penerimaan Barang (Goods Receipt) ----------
-- Titik di mana stok bertambah DAN HPP rata-rata bergerak dihitung ulang.
create table penerimaan_barang (
  id            uuid primary key default gen_random_uuid(),
  nomor         text not null unique,
  tanggal       date not null default current_date,
  po_id         uuid references purchase_order(id) on delete restrict,
  supplier_id   uuid not null references supplier(id) on delete restrict,
  gudang_id     uuid not null references gudang(id) on delete restrict,
  surat_jalan_supplier text,
  status        status_dokumen not null default 'draf',
  -- Biaya angkut/bongkar yang dibebankan ke HPP (landed cost),
  -- dialokasikan proporsional ke nilai tiap item oleh trigger.
  biaya_tambahan numeric(18,2) not null default 0 check (biaya_tambahan >= 0),
  catatan       text,
  dibuat_oleh   uuid references profil(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_pb_po on penerimaan_barang(po_id);
create index idx_pb_supplier on penerimaan_barang(supplier_id, tanggal desc);
create trigger trg_pb_updated before update on penerimaan_barang
  for each row execute function set_updated_at();

create table penerimaan_barang_item (
  id            uuid primary key default gen_random_uuid(),
  pb_id         uuid not null references penerimaan_barang(id) on delete cascade,
  po_item_id    uuid references purchase_order_item(id) on delete set null,
  produk_id     uuid not null references produk(id) on delete restrict,
  satuan_id     uuid not null references satuan(id),
  konversi      numeric(18,4) not null default 1 check (konversi > 0),
  qty           numeric(18,4) not null check (qty > 0),
  qty_dasar     numeric(18,4) generated always as (qty * konversi) stored,
  harga_satuan  numeric(18,2) not null default 0,   -- harga beli per satuan transaksi
  -- HPP per satuan dasar setelah dibebani biaya tambahan.
  -- Diisi trigger di 0006, jangan diisi manual.
  hpp_satuan    numeric(18,4) not null default 0,
  catatan       text
);
create index idx_pb_item_header on penerimaan_barang_item(pb_id);
create index idx_pb_item_poitem on penerimaan_barang_item(po_item_id);

-- ---------- Faktur Pembelian (tagihan dari supplier) ----------
create table faktur_pembelian (
  id            uuid primary key default gen_random_uuid(),
  nomor         text not null unique,               -- nomor internal
  nomor_supplier text,                              -- nomor faktur dari supplier
  tanggal       date not null default current_date,
  jatuh_tempo   date not null default current_date,
  supplier_id   uuid not null references supplier(id) on delete restrict,
  po_id         uuid references purchase_order(id) on delete set null,
  status        status_dokumen not null default 'draf',
  subtotal      numeric(18,2) not null default 0,
  diskon_header numeric(18,2) not null default 0 check (diskon_header >= 0),
  dpp           numeric(18,2) not null default 0,
  ppn_persen    numeric(5,2)  not null default 0,
  ppn_nilai     numeric(18,2) not null default 0,
  total         numeric(18,2) not null default 0,
  terbayar      numeric(18,2) not null default 0,
  sisa          numeric(18,2) generated always as (total - terbayar) stored,
  status_bayar  status_bayar not null default 'belum',
  catatan       text,
  dibuat_oleh   uuid references profil(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_fb_supplier on faktur_pembelian(supplier_id, tanggal desc);
create index idx_fb_outstanding on faktur_pembelian(jatuh_tempo)
  where status_bayar <> 'lunas' and status <> 'dibatalkan';
create trigger trg_fb_updated before update on faktur_pembelian
  for each row execute function set_updated_at();

create table faktur_pembelian_item (
  id            uuid primary key default gen_random_uuid(),
  faktur_id     uuid not null references faktur_pembelian(id) on delete cascade,
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
  urutan        smallint not null default 0
);
create index idx_fb_item_header on faktur_pembelian_item(faktur_id);

-- Satu faktur supplier boleh mencakup beberapa penerimaan barang (3-way match).
create table faktur_pembelian_pb (
  faktur_id uuid not null references faktur_pembelian(id) on delete cascade,
  pb_id     uuid not null references penerimaan_barang(id) on delete restrict,
  primary key (faktur_id, pb_id)
);

-- ---------- Pembayaran ke Supplier ----------
create table pembayaran_supplier (
  id            uuid primary key default gen_random_uuid(),
  nomor         text not null unique,
  tanggal       date not null default current_date,
  supplier_id   uuid not null references supplier(id) on delete restrict,
  metode        metode_bayar not null default 'transfer',
  bank_nama     text,
  nomor_referensi text,
  tanggal_cair  date,
  jumlah        numeric(18,2) not null check (jumlah > 0),
  status        status_dokumen not null default 'disetujui',
  catatan       text,
  dibuat_oleh   uuid references profil(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_bayar_supplier on pembayaran_supplier(supplier_id, tanggal desc);
create trigger trg_bayar_supplier_updated before update on pembayaran_supplier
  for each row execute function set_updated_at();

create table pembayaran_supplier_alokasi (
  id             uuid primary key default gen_random_uuid(),
  pembayaran_id  uuid not null references pembayaran_supplier(id) on delete cascade,
  faktur_id      uuid not null references faktur_pembelian(id) on delete restrict,
  jumlah         numeric(18,2) not null check (jumlah > 0),
  unique (pembayaran_id, faktur_id)
);
create index idx_bayar_alokasi_faktur on pembayaran_supplier_alokasi(faktur_id);

-- ---------- Retur Pembelian ----------
create table retur_pembelian (
  id          uuid primary key default gen_random_uuid(),
  nomor       text not null unique,
  tanggal     date not null default current_date,
  supplier_id uuid not null references supplier(id) on delete restrict,
  pb_id       uuid references penerimaan_barang(id) on delete set null,
  gudang_id   uuid not null references gudang(id) on delete restrict,
  status      status_dokumen not null default 'draf',
  alasan      text,
  total       numeric(18,2) not null default 0,
  dibuat_oleh uuid references profil(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_retur_beli_updated before update on retur_pembelian
  for each row execute function set_updated_at();

create table retur_pembelian_item (
  id           uuid primary key default gen_random_uuid(),
  retur_id     uuid not null references retur_pembelian(id) on delete cascade,
  produk_id    uuid not null references produk(id) on delete restrict,
  satuan_id    uuid not null references satuan(id),
  konversi     numeric(18,4) not null default 1 check (konversi > 0),
  qty          numeric(18,4) not null check (qty > 0),
  qty_dasar    numeric(18,4) generated always as (qty * konversi) stored,
  harga_satuan numeric(18,2) not null default 0,
  subtotal     numeric(18,2) generated always as (round(qty * harga_satuan, 2)) stored
);
create index idx_retur_beli_item_header on retur_pembelian_item(retur_id);
