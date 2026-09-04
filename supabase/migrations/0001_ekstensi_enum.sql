-- =====================================================================
-- 0001  Ekstensi, enum, dan utilitas dasar
-- =====================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "pg_trgm";       -- pencarian nama produk/pelanggan

-- ---------- Enum ----------
create type peran_pengguna as enum ('owner','admin','sales','gudang','finance');

create type status_dokumen as enum (
  'draf',              -- masih bisa diubah bebas
  'menunggu',          -- diajukan, menunggu approval
  'disetujui',         -- terkunci, siap diproses
  'sebagian',          -- sebagian terkirim / terterima
  'selesai',           -- tuntas
  'ditolak',
  'dibatalkan'
);

create type jenis_mutasi_stok as enum (
  'saldo_awal',
  'pembelian',
  'penjualan',
  'retur_pembelian',
  'retur_penjualan',
  'transfer_masuk',
  'transfer_keluar',
  'penyesuaian'
);

create type status_bayar as enum ('belum','sebagian','lunas');

create type metode_bayar as enum ('tunai','transfer','qris','giro','kartu');

create type termin_bayar as enum ('cod','tempo');

create type tipe_pelanggan as enum ('perorangan','toko','grosir','instansi');

-- ---------- updated_at otomatis ----------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- Penomoran dokumen otomatis ----------
-- Contoh hasil: SO/2026/09/00014
create table dokumen_counter (
  prefix   text not null,
  periode  text not null,           -- 'YYYYMM'
  urutan   integer not null default 0,
  primary key (prefix, periode)
);

create or replace function generate_nomor(p_prefix text, p_tanggal date default current_date)
returns text language plpgsql as $$
declare
  v_periode text := to_char(p_tanggal, 'YYYYMM');
  v_urutan  integer;
begin
  insert into dokumen_counter (prefix, periode, urutan)
  values (p_prefix, v_periode, 1)
  on conflict (prefix, periode)
  do update set urutan = dokumen_counter.urutan + 1
  returning urutan into v_urutan;

  return p_prefix || '/' || to_char(p_tanggal,'YYYY') || '/' || to_char(p_tanggal,'MM')
         || '/' || lpad(v_urutan::text, 5, '0');
end;
$$;
