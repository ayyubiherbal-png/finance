-- =====================================================================
-- 0052  Ongkir pembelian sebagai beban, bukan HPP persediaan
--
-- Kebijakan:
--   - HPP persediaan hanya berisi harga bersih barang setelah diskon.
--   - Ongkir tetap menjadi bagian tagihan/utang supplier.
--   - Ongkir diakui sebagai beban operasional saat Faktur Pembelian
--     disetujui, tanpa membuat Pengeluaran Kas kedua. Pembayaran Supplier
--     tetap menjadi satu-satunya pengurang kas agar kas tidak terpotong
--     dua kali.
--   - Data PO/2026/09/00001 dikoreksi dari HPP lama ke nilai barang
--     bersih Rp664.000. Ongkir Rp46.000 masuk laporan beban.
-- =====================================================================

-- ---------- Posting PB berikutnya: ongkir tidak lagi dialokasikan ke HPP ----------
create or replace function fn_posting_penerimaan_barang()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r     record;
  v_hpp numeric(18,4);
begin
  if new.status = 'selesai' and old.status is distinct from 'selesai' then
    for r in select * from penerimaan_barang_item where pb_id = new.id loop
      v_hpp := case
        when r.qty_dasar > 0 then (r.qty * r.harga_satuan) / r.qty_dasar
        else 0
      end;

      update penerimaan_barang_item
         set hpp_satuan = round(v_hpp, 4)
       where id = r.id;

      insert into stok_mutasi (
        tanggal, produk_id, gudang_id, jenis, qty_dasar, hpp_satuan,
        ref_tabel, ref_id, ref_nomor, dibuat_oleh
      ) values (
        new.tanggal, r.produk_id, new.gudang_id, 'pembelian',
        r.qty_dasar, round(v_hpp, 4), 'penerimaan_barang', new.id,
        new.nomor, new.dibuat_oleh
      );
    end loop;

  elsif new.status = 'dibatalkan' and old.status = 'selesai' then
    insert into stok_mutasi (
      tanggal, produk_id, gudang_id, jenis, qty_dasar, hpp_satuan,
      ref_tabel, ref_id, ref_nomor, catatan, dibuat_oleh
    )
    select
      current_date, m.produk_id, m.gudang_id, 'penyesuaian',
      -m.qty_dasar, m.hpp_satuan, 'penerimaan_barang', new.id,
      new.nomor, 'Pembatalan ' || new.nomor, new.dibuat_oleh
    from stok_mutasi m
    where m.ref_tabel = 'penerimaan_barang'
      and m.ref_id = new.id
      and m.qty_dasar > 0;
  end if;
  return null;
end;
$$;

-- ---------- Master klasifikasi otomatis untuk ongkir pembelian ----------
insert into kategori_biaya (kode, nama, operasional)
values ('BOP-KIRIM', 'Biaya Pengiriman', true)
on conflict (kode) do update
set nama = excluded.nama, operasional = true;

insert into nama_pengeluaran (kategori_biaya_id, kode, nama)
select id, 'BOP-KIRIM-01', 'Ongkir Pembelian'
from kategori_biaya
where kode = 'BOP-KIRIM'
on conflict (kode) do update
set kategori_biaya_id = excluded.kategori_biaya_id,
    nama = excluded.nama;

-- Satu sumber laporan untuk Pengeluaran Kas dan beban ongkir yang masih
-- berupa utang supplier. View ini tidak memengaruhi saldo Kas & Bank.
create or replace view v_beban_rinci with (security_invoker = true) as
select
  p.id::text              as id,
  p.tanggal,
  p.jumlah,
  kb.id                   as kategori_id,
  kb.kode                 as kode_kategori,
  kb.nama                 as nama_kategori,
  kb.operasional,
  'pengeluaran_kas'::text as sumber,
  p.nomor                 as nomor_referensi
from pengeluaran_kas p
join nama_pengeluaran np on np.id = p.nama_pengeluaran_id
join kategori_biaya kb on kb.id = np.kategori_biaya_id
where p.status not in ('dibatalkan', 'ditolak')

union all

select
  fb.id::text,
  fb.tanggal,
  fb.biaya_tambahan,
  kb.id,
  kb.kode,
  kb.nama,
  kb.operasional,
  'ongkir_pembelian'::text,
  fb.nomor
from faktur_pembelian fb
join nama_pengeluaran np on np.kode = 'BOP-KIRIM-01'
join kategori_biaya kb on kb.id = np.kategori_biaya_id
where fb.status in ('disetujui', 'selesai')
  and fb.biaya_tambahan > 0;

grant select on v_beban_rinci to authenticated;

create or replace view v_pengeluaran_harian with (security_invoker = true) as
select
  tanggal,
  count(*) as jumlah_pengeluaran,
  sum(jumlah) as total_keluar
from v_beban_rinci
where operasional
group by tanggal;

create or replace view v_ringkasan_laba_biaya with (security_invoker = true) as
select
  (select coalesce(sum(laba_kotor), 0) from v_penjualan_harian)
    as total_laba_kotor,
  (select coalesce(sum(jumlah), 0) from v_beban_rinci where operasional)
    as total_biaya_operasional,
  (select coalesce(sum(laba_kotor), 0) from v_penjualan_harian)
    - (select coalesce(sum(jumlah), 0) from v_beban_rinci where operasional)
    as laba_bersih,
  (select coalesce(sum(jumlah), 0) from v_beban_rinci where not operasional)
    as total_biaya_non_operasional;

grant select on v_pengeluaran_harian, v_ringkasan_laba_biaya to authenticated;

-- ---------- Koreksi terarah data lama PO/2026/09/00001 ----------
-- Seluruh pemakaian tabel sementara dibungkus dalam SATU statement DO.
-- Ini aman pada SQL Editor yang dapat menjalankan statement terpisah
-- memakai sesi berbeda.
do $koreksi$
begin
drop table if exists tmp_hpp_po_00001;
drop table if exists tmp_produk_aman_po_00001;

create temporary table tmp_hpp_po_00001 on commit drop as
select
  pbi.id as pb_item_id,
  pbi.pb_id,
  pbi.produk_id,
  pbi.qty_dasar,
  round(poi.subtotal / nullif(poi.qty, 0), 2)
    as harga_neto_satuan_transaksi,
  round(
    (pbi.qty * poi.subtotal / nullif(poi.qty, 0))
      / nullif(pbi.qty_dasar, 0),
    4
  ) as hpp_baru
from purchase_order po
join purchase_order_item poi on poi.po_id = po.id
join penerimaan_barang_item pbi on pbi.po_item_id = poi.id
join penerimaan_barang pb on pb.id = pbi.pb_id
where po.nomor = 'PO/2026/09/00001'
  and pb.status = 'selesai';

-- Koreksi produk hanya bila stok saat ini sama dengan seluruh kuantitas
-- yang diterima dari PO target. Data dengan saldo berbeda dilewati.
create temporary table tmp_produk_aman_po_00001 on commit drop as
with diterima as (
  select
    produk_id,
    sum(qty_dasar) as qty,
    sum(qty_dasar * hpp_baru) as nilai_baru
  from tmp_hpp_po_00001
  group by produk_id
),
saldo as (
  select produk_id, sum(qty) as qty
  from stok
  group by produk_id
)
select
  d.produk_id,
  d.qty,
  round(d.nilai_baru / nullif(d.qty, 0), 4) as hpp_baru
from diterima d
join saldo s on s.produk_id = d.produk_id
where d.qty > 0
  and abs(s.qty - d.qty) < 0.0001;

update penerimaan_barang_item pbi
set
  harga_satuan = k.harga_neto_satuan_transaksi,
  hpp_satuan = k.hpp_baru
from tmp_hpp_po_00001 k
join tmp_produk_aman_po_00001 a on a.produk_id = k.produk_id
where pbi.id = k.pb_item_id;

alter table stok_mutasi disable trigger trg_mutasi_kunci;

update stok_mutasi sm
set hpp_satuan = x.hpp_baru
from (
  select
    k.pb_id,
    k.produk_id,
    round(
      sum(k.qty_dasar * k.hpp_baru) / nullif(sum(k.qty_dasar), 0),
      4
    ) as hpp_baru
  from tmp_hpp_po_00001 k
  join tmp_produk_aman_po_00001 a on a.produk_id = k.produk_id
  group by k.pb_id, k.produk_id
) x
where sm.ref_tabel = 'penerimaan_barang'
  and sm.ref_id = x.pb_id
  and sm.produk_id = x.produk_id
  and sm.qty_dasar > 0;

alter table stok_mutasi enable trigger trg_mutasi_kunci;

update produk p
set hpp_rata2 = a.hpp_baru
from tmp_produk_aman_po_00001 a
where p.id = a.produk_id;

end;
$koreksi$;

-- Hasil audit yang tampil di SQL Editor. Nilai persediaan target adalah
-- Rp664.000; nilai ongkir target di laporan beban adalah Rp46.000.
with item_target as (
  select pbi.produk_id, sum(pbi.qty_dasar) as qty_diterima
  from purchase_order po
  join purchase_order_item poi on poi.po_id = po.id
  join penerimaan_barang_item pbi on pbi.po_item_id = poi.id
  join penerimaan_barang pb on pb.id = pbi.pb_id
  where po.nomor = 'PO/2026/09/00001'
    and pb.status = 'selesai'
  group by pbi.produk_id
),
saldo as (
  select produk_id, sum(qty) as qty
  from stok
  group by produk_id
),
produk_aman as (
  select i.produk_id, s.qty
  from item_target i
  join saldo s on s.produk_id = i.produk_id
  where abs(s.qty - i.qty_diterima) < 0.0001
)
select
  count(*) as jumlah_produk_dikoreksi,
  round(sum(a.qty * p.hpp_rata2), 2) as nilai_persediaan_baru,
  coalesce((
    select sum(fb.biaya_tambahan)
    from faktur_pembelian fb
    where fb.status in ('disetujui', 'selesai')
      and fb.biaya_tambahan > 0
      and exists (
        select 1
        from faktur_pembelian_pb fbp
        join penerimaan_barang pb on pb.id = fbp.pb_id
        join purchase_order po on po.id = pb.po_id
        where fbp.faktur_id = fb.id
          and po.nomor = 'PO/2026/09/00001'
      )
  ), 0) as beban_ongkir
from produk_aman a
join produk p on p.id = a.produk_id;
