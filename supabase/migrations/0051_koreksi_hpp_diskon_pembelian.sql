-- =====================================================================
-- 0051  Koreksi HPP historis akibat diskon PO yang dulu tidak terbawa
--
-- Setelah 0050:
--   Faktur = nilai barang neto Rp664.000 + ongkir Rp46.000 = Rp710.000.
-- Namun PB yang sudah diposting sebelum perbaikan masih mempunyai
-- snapshot HPP dari harga kotor:
--   HPP lama = Rp668.200 + Rp46.000 = Rp714.200.
--
-- Migrasi ini SENGAJA konservatif. Koreksi otomatis hanya dilakukan bila:
--   - PB selesai dan itemnya berasal dari PO yang memiliki diskon;
--   - satu produk hanya muncul sekali dalam PB tersebut;
--   - tepat satu mutasi masuk cocok dengan PB+produk;
--   - produk BELUM PERNAH memiliki mutasi keluar.
--
-- Syarat terakhir menjamin seluruh selisih nilai masih berada di stok.
-- Produk yang sudah pernah keluar tidak disentuh karena koreksinya harus
-- melalui rekalkulasi COGS historis yang terpisah.
-- =====================================================================

create temporary table tmp_koreksi_hpp_diskon on commit drop as
with dasar as (
  select
    pbi.id as pb_item_id,
    pbi.pb_id,
    pbi.produk_id,
    pbi.qty_dasar,
    pbi.hpp_satuan as hpp_lama,
    pbi.qty * pbi.harga_satuan as nilai_baris,
    pb.biaya_tambahan,
    sum(pbi.qty * pbi.harga_satuan) over (partition by pbi.pb_id) as nilai_pb,
    count(*) over (partition by pbi.pb_id, pbi.produk_id) as jumlah_item_produk
  from penerimaan_barang_item pbi
  join penerimaan_barang pb on pb.id = pbi.pb_id
  join purchase_order_item poi on poi.id = pbi.po_item_id
  where pb.status = 'selesai'
    and (poi.diskon_persen > 0 or poi.diskon_nilai > 0)
),
mutasi_unik as (
  select
    ref_id as pb_id,
    produk_id,
    min(id) as mutasi_id,
    count(*) as jumlah_mutasi
  from stok_mutasi
  where ref_tabel = 'penerimaan_barang'
    and qty_dasar > 0
  group by ref_id, produk_id
),
hitung as (
  select
    d.pb_item_id,
    d.produk_id,
    d.qty_dasar,
    d.hpp_lama,
    m.mutasi_id,
    round(
      (
        d.nilai_baris
        + case
            when d.nilai_pb > 0
              then d.biaya_tambahan * d.nilai_baris / d.nilai_pb
            else 0
          end
      ) / nullif(d.qty_dasar, 0),
      4
    ) as hpp_baru
  from dasar d
  join mutasi_unik m
    on m.pb_id = d.pb_id
   and m.produk_id = d.produk_id
   and m.jumlah_mutasi = 1
  where d.jumlah_item_produk = 1
    and not exists (
      select 1
      from stok_mutasi keluar
      where keluar.produk_id = d.produk_id
        and keluar.qty_dasar < 0
    )
)
select *
from hitung
where abs(hpp_lama - hpp_baru) > 0.00005;

-- Hitung ulang HPP rata-rata produk dari nilai persediaan saat ini,
-- dikurangi selisih yang terbukti masih seluruhnya berada di stok.
with selisih as (
  select
    produk_id,
    sum(qty_dasar * (hpp_lama - hpp_baru)) as nilai_kelebihan
  from tmp_koreksi_hpp_diskon
  group by produk_id
),
saldo as (
  select produk_id, sum(qty) as qty
  from stok
  group by produk_id
)
update produk p
set hpp_rata2 = round(
  ((p.hpp_rata2 * s.qty) - k.nilai_kelebihan) / nullif(s.qty, 0),
  4
)
from selisih k
join saldo s on s.produk_id = k.produk_id
where p.id = k.produk_id
  and s.qty > 0;

-- `stok_mutasi` append-only untuk operasi aplikasi. Di migrasi koreksi
-- terkontrol ini trigger kunci dinonaktifkan hanya selama snapshot HPP
-- baris masuk yang salah diperbaiki; qty, tanggal, dan referensi tidak
-- berubah sama sekali.
alter table stok_mutasi disable trigger trg_mutasi_kunci;

update stok_mutasi sm
set hpp_satuan = k.hpp_baru
from tmp_koreksi_hpp_diskon k
where sm.id = k.mutasi_id;

alter table stok_mutasi enable trigger trg_mutasi_kunci;

update penerimaan_barang_item pbi
set hpp_satuan = k.hpp_baru
from tmp_koreksi_hpp_diskon k
where pbi.id = k.pb_item_id;

-- Hasil terakhir yang tampil di SQL Editor. Untuk kasus pada screenshot,
-- total_nilai_dikoreksi diharapkan sekitar Rp4.200.
select
  count(*) as jumlah_item_dikoreksi,
  round(sum(qty_dasar * (hpp_lama - hpp_baru)), 2) as total_nilai_dikoreksi
from tmp_koreksi_hpp_diskon;
