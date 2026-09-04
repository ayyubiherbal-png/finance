-- =====================================================================
-- 0003  Inventori: saldo stok, kartu stok, penyesuaian, transfer gudang
-- =====================================================================

-- ---------- Saldo stok (materialized, untuk query cepat) ----------
-- Selalu dalam SATUAN DASAR. Diisi/diupdate hanya oleh trigger dari
-- stok_mutasi -- jangan pernah di-UPDATE langsung dari aplikasi.
create table stok (
  produk_id  uuid not null references produk(id) on delete cascade,
  gudang_id  uuid not null references gudang(id) on delete cascade,
  qty        numeric(18,4) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (produk_id, gudang_id)
);
create index idx_stok_gudang on stok(gudang_id);

-- ---------- Kartu stok / buku besar persediaan ----------
-- Append-only. SATU-SATUNYA sumber kebenaran pergerakan stok.
-- qty_dasar positif = masuk, negatif = keluar.
-- hpp_satuan  = harga pokok per satuan dasar pada saat mutasi terjadi.
--               Untuk mutasi keluar diisi otomatis dari produk.hpp_rata2.
create table stok_mutasi (
  id             bigint generated always as identity primary key,
  tanggal        date not null default current_date,
  produk_id      uuid not null references produk(id) on delete restrict,
  gudang_id      uuid not null references gudang(id) on delete restrict,
  jenis          jenis_mutasi_stok not null,
  qty_dasar      numeric(18,4) not null check (qty_dasar <> 0),
  hpp_satuan     numeric(18,4),
  nilai          numeric(18,2) generated always as (round(qty_dasar * coalesce(hpp_satuan, 0), 2)) stored,
  ref_tabel      text,          -- 'surat_jalan', 'penerimaan_barang', ...
  ref_id         uuid,
  ref_nomor      text,
  catatan        text,
  dibuat_oleh    uuid references profil(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index idx_mutasi_produk_tanggal on stok_mutasi(produk_id, tanggal, id);
create index idx_mutasi_gudang on stok_mutasi(gudang_id, tanggal);
create index idx_mutasi_ref on stok_mutasi(ref_tabel, ref_id);

-- ---------- Penyesuaian stok (saldo awal, koreksi, barang rusak) ----------
create table penyesuaian_stok (
  id          uuid primary key default gen_random_uuid(),
  nomor       text not null unique,
  tanggal     date not null default current_date,
  gudang_id   uuid not null references gudang(id) on delete restrict,
  jenis       jenis_mutasi_stok not null default 'penyesuaian'
              check (jenis in ('penyesuaian','saldo_awal')),
  status      status_dokumen not null default 'draf',
  alasan      text,
  dibuat_oleh uuid references profil(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_penyesuaian_updated before update on penyesuaian_stok
  for each row execute function set_updated_at();

create table penyesuaian_stok_item (
  id             uuid primary key default gen_random_uuid(),
  penyesuaian_id uuid not null references penyesuaian_stok(id) on delete cascade,
  produk_id      uuid not null references produk(id) on delete restrict,
  satuan_id      uuid not null references satuan(id),
  konversi       numeric(18,4) not null default 1,
  qty            numeric(18,4) not null check (qty <> 0),   -- + menambah, - mengurangi
  qty_dasar      numeric(18,4) generated always as (qty * konversi) stored,
  hpp_satuan     numeric(18,4),                              -- wajib diisi bila saldo_awal
  catatan        text
);
create index idx_penyesuaian_item_header on penyesuaian_stok_item(penyesuaian_id);

-- ---------- Transfer antar gudang ----------
create table transfer_gudang (
  id            uuid primary key default gen_random_uuid(),
  nomor         text not null unique,
  tanggal       date not null default current_date,
  gudang_asal   uuid not null references gudang(id) on delete restrict,
  gudang_tujuan uuid not null references gudang(id) on delete restrict,
  status        status_dokumen not null default 'draf',
  catatan       text,
  dibuat_oleh   uuid references profil(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (gudang_asal <> gudang_tujuan)
);
create trigger trg_transfer_updated before update on transfer_gudang
  for each row execute function set_updated_at();

create table transfer_gudang_item (
  id          uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references transfer_gudang(id) on delete cascade,
  produk_id   uuid not null references produk(id) on delete restrict,
  satuan_id   uuid not null references satuan(id),
  konversi    numeric(18,4) not null default 1,
  qty         numeric(18,4) not null check (qty > 0),
  qty_dasar   numeric(18,4) generated always as (qty * konversi) stored
);
create index idx_transfer_item_header on transfer_gudang_item(transfer_id);
