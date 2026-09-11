-- =====================================================================
-- 0050  Sinkronkan diskon & ongkir sampai Faktur Pembelian
--
-- Bug lama:
--   purchase_order_item.subtotal sudah NETO setelah diskon, tetapi
--   Penerimaan Barang menyalin purchase_order_item.harga_satuan yang
--   masih KOTOR. Faktur Pembelian lalu menyalin harga PB tersebut.
--   Contoh nyata: nilai barang neto PO Rp664.000, harga kotor yang
--   tersalin Rp668.200, dan ongkir PB Rp46.000 belum ikut Faktur.
--   Total utang yang benar adalah Rp664.000 + Rp46.000 = Rp710.000.
--
-- Perbaikan frontend membuat PB baru memakai subtotal/qty. Migrasi ini:
--   1. menambah jejak langsung Faktur-item -> PB-item;
--   2. mengisi jejak historis hanya bila pasangannya unik;
--   3. membawa ongkir/biaya tambahan PB sebagai komponen Faktur;
--   4. mengoreksi faktur lama yang BELUM PERNAH DIBAYAR dan memenuhi
--      sidik bug persis (harga FB = harga PB = harga kotor PO, PO punya
--      diskon). Harga aktual yang pernah diedit manual tidak disentuh.
-- =====================================================================

alter table faktur_pembelian_item
  add column if not exists pb_item_id uuid
  references penerimaan_barang_item(id) on delete set null;

create index if not exists idx_fb_item_pb_item
  on faktur_pembelian_item(pb_item_id);

alter table faktur_pembelian
  add column if not exists biaya_tambahan numeric(18,2) not null default 0
  check (biaya_tambahan >= 0);

-- Faktur Pembelian berbeda dari Faktur Penjualan: total tagihan supplier
-- mencakup nilai barang neto + biaya tambahan dari PB. Biaya ini sudah
-- dialokasikan ke HPP ketika PB diposting; penambahan di sini hanya
-- mencatat utangnya, BUKAN membebankan HPP untuk kedua kalinya.
create or replace function fn_hitung_total_faktur_pembelian()
returns trigger language plpgsql as $$
begin
  new.dpp       := new.subtotal - new.diskon_header + new.biaya_tambahan;
  new.ppn_nilai := round(new.dpp * new.ppn_persen / 100, 2);
  new.total     := new.dpp + new.ppn_nilai;

  new.status_bayar := case
    when new.terbayar <= 0         then 'belum'::status_bayar
    when new.terbayar >= new.total then 'lunas'::status_bayar
    else 'sebagian'::status_bayar
  end;
  return new;
end;
$$;

drop trigger if exists trg_total_fb on faktur_pembelian;
create trigger trg_total_fb before insert or update on faktur_pembelian
  for each row execute function fn_hitung_total_faktur_pembelian();

-- Backfill relasi hanya bila tepat satu item PB cocok dalam daftar PB
-- yang ditagihkan faktur tersebut. Baris ambigu sengaja dibiarkan NULL.
with kandidat as (
  select
    fbi.id as faktur_item_id,
    (array_agg(pbi.id order by pbi.id))[1] as pb_item_id,
    count(*) as jumlah_kandidat
  from faktur_pembelian_item fbi
  join faktur_pembelian_pb fbp
    on fbp.faktur_id = fbi.faktur_id
  join penerimaan_barang_item pbi
    on pbi.pb_id = fbp.pb_id
   and pbi.produk_id = fbi.produk_id
   and pbi.satuan_id = fbi.satuan_id
   and pbi.konversi = fbi.konversi
   and pbi.qty = fbi.qty
   and pbi.harga_satuan = fbi.harga_satuan
  where fbi.pb_item_id is null
  group by fbi.id
)
update faktur_pembelian_item fbi
set pb_item_id = k.pb_item_id
from kandidat k
where fbi.id = k.faktur_item_id
  and k.jumlah_kandidat = 1;

-- Koreksi nominal faktur lama. Trigger subtotal faktur yang sudah ada
-- otomatis menghitung ulang subtotal, total, dan sisa header.
update faktur_pembelian_item fbi
set harga_satuan = round(poi.subtotal / nullif(poi.qty, 0), 2)
from faktur_pembelian fb,
     penerimaan_barang_item pbi,
     purchase_order_item poi
where fb.id = fbi.faktur_id
  and pbi.id = fbi.pb_item_id
  and poi.id = pbi.po_item_id
  and fb.status <> 'dibatalkan'
  and fb.status_bayar = 'belum'
  and fb.terbayar = 0
  and (poi.diskon_persen > 0 or poi.diskon_nilai > 0)
  and fbi.harga_satuan = poi.harga_satuan
  and pbi.harga_satuan = poi.harga_satuan;

-- Bawa total biaya dari seluruh PB yang ditagihkan. Hanya faktur yang
-- belum pernah dibayar yang dibackfill otomatis agar transaksi kas lama
-- tidak berubah diam-diam.
update faktur_pembelian fb
set biaya_tambahan = b.total_biaya
from (
  select fbp.faktur_id, coalesce(sum(pb.biaya_tambahan), 0) as total_biaya
  from faktur_pembelian_pb fbp
  join penerimaan_barang pb on pb.id = fbp.pb_id
  where pb.status <> 'dibatalkan'
  group by fbp.faktur_id
) b
where fb.id = b.faktur_id
  and fb.status <> 'dibatalkan'
  and fb.status_bayar = 'belum'
  and fb.terbayar = 0
  and fb.biaya_tambahan = 0
  and b.total_biaya > 0;

-- PB historis dengan sidik bug yang sama dinormalkan juga, supaya PB
-- yang belum dibuatkan faktur kelak tidak mengulang nominal kotor.
-- hpp_satuan/stok_mutasi yang sudah diposting sengaja tidak ditulis ulang:
-- buku besar stok bersifat append-only dan koreksi nilai persediaan lama
-- harus dilakukan sebagai penyesuaian terpisah, bukan edit diam-diam.
update penerimaan_barang_item pbi
set harga_satuan = round(poi.subtotal / nullif(poi.qty, 0), 2)
from purchase_order_item poi
where poi.id = pbi.po_item_id
  and (poi.diskon_persen > 0 or poi.diskon_nilai > 0)
  and pbi.harga_satuan = poi.harga_satuan;
