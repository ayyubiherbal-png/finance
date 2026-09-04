-- =====================================================================
-- 0007  View laporan
--       Semua view memakai security_invoker agar RLS tabel dasarnya
--       tetap berlaku bagi pengguna yang membaca.
-- =====================================================================

-- ---------- Stok per produk (lintas gudang) + nilai persediaan ----------
create view v_stok_produk with (security_invoker = true) as
select
  p.id                              as produk_id,
  p.kode,
  p.nama,
  k.nama                            as kategori,
  s.kode                            as satuan_dasar,
  coalesce(sum(st.qty), 0)          as qty,
  p.stok_min,
  p.hpp_rata2,
  round(coalesce(sum(st.qty), 0) * p.hpp_rata2, 2) as nilai_persediaan,
  coalesce(sum(st.qty), 0) <= p.stok_min           as perlu_restock
from produk p
join satuan s              on s.id = p.satuan_dasar_id
left join kategori_produk k on k.id = p.kategori_id
left join stok st           on st.produk_id = p.id
where p.aktif
group by p.id, p.kode, p.nama, k.nama, s.kode, p.stok_min, p.hpp_rata2;

-- ---------- Stok per produk per gudang ----------
create view v_stok_gudang with (security_invoker = true) as
select
  st.produk_id, p.kode, p.nama,
  st.gudang_id, g.kode as kode_gudang, g.nama as nama_gudang,
  st.qty,
  p.hpp_rata2,
  round(st.qty * p.hpp_rata2, 2) as nilai
from stok st
join produk p on p.id = st.produk_id
join gudang g on g.id = st.gudang_id;

-- ---------- Kartu stok dengan saldo berjalan ----------
create view v_kartu_stok with (security_invoker = true) as
select
  m.id,
  m.tanggal,
  m.produk_id, p.kode as kode_produk, p.nama as nama_produk,
  m.gudang_id, g.nama as nama_gudang,
  m.jenis,
  m.ref_nomor,
  case when m.qty_dasar > 0 then  m.qty_dasar else 0 end as masuk,
  case when m.qty_dasar < 0 then -m.qty_dasar else 0 end as keluar,
  sum(m.qty_dasar) over (
    partition by m.produk_id, m.gudang_id
    order by m.tanggal, m.id
    rows between unbounded preceding and current row
  ) as saldo,
  m.hpp_satuan,
  m.nilai,
  m.catatan
from stok_mutasi m
join produk p on p.id = m.produk_id
join gudang g on g.id = m.gudang_id;

-- ---------- Piutang berjalan + umur ----------
create view v_piutang with (security_invoker = true) as
select
  f.id as faktur_id, f.nomor, f.tanggal, f.jatuh_tempo,
  f.pelanggan_id, pl.kode as kode_pelanggan, pl.nama as nama_pelanggan,
  pl.sales_id, pr.nama as nama_sales,
  f.total, f.terbayar, f.sisa,
  (current_date - f.jatuh_tempo) as hari_lewat,
  case
    when current_date <= f.jatuh_tempo                 then 'belum_jatuh_tempo'
    when current_date - f.jatuh_tempo between 1  and 30 then '1-30'
    when current_date - f.jatuh_tempo between 31 and 60 then '31-60'
    when current_date - f.jatuh_tempo between 61 and 90 then '61-90'
    else '90+'
  end as bucket_umur
from faktur_penjualan f
join pelanggan pl      on pl.id = f.pelanggan_id
left join profil pr    on pr.id = pl.sales_id
where f.status <> 'dibatalkan' and f.sisa > 0;

create view v_piutang_aging with (security_invoker = true) as
select
  pelanggan_id, nama_pelanggan,
  sum(sisa)                                                    as total_piutang,
  sum(sisa) filter (where bucket_umur = 'belum_jatuh_tempo')   as belum_jatuh_tempo,
  sum(sisa) filter (where bucket_umur = '1-30')                as umur_1_30,
  sum(sisa) filter (where bucket_umur = '31-60')               as umur_31_60,
  sum(sisa) filter (where bucket_umur = '61-90')               as umur_61_90,
  sum(sisa) filter (where bucket_umur = '90+')                 as umur_90_plus
from v_piutang
group by pelanggan_id, nama_pelanggan;

-- ---------- Hutang berjalan + umur ----------
create view v_hutang with (security_invoker = true) as
select
  f.id as faktur_id, f.nomor, f.nomor_supplier, f.tanggal, f.jatuh_tempo,
  f.supplier_id, sp.kode as kode_supplier, sp.nama as nama_supplier,
  f.total, f.terbayar, f.sisa,
  (current_date - f.jatuh_tempo) as hari_lewat,
  case
    when current_date <= f.jatuh_tempo                 then 'belum_jatuh_tempo'
    when current_date - f.jatuh_tempo between 1  and 30 then '1-30'
    when current_date - f.jatuh_tempo between 31 and 60 then '31-60'
    when current_date - f.jatuh_tempo between 61 and 90 then '61-90'
    else '90+'
  end as bucket_umur
from faktur_pembelian f
join supplier sp on sp.id = f.supplier_id
where f.status <> 'dibatalkan' and f.sisa > 0;

create view v_hutang_aging with (security_invoker = true) as
select
  supplier_id, nama_supplier,
  sum(sisa)                                                   as total_hutang,
  sum(sisa) filter (where bucket_umur = 'belum_jatuh_tempo')  as belum_jatuh_tempo,
  sum(sisa) filter (where bucket_umur = '1-30')               as umur_1_30,
  sum(sisa) filter (where bucket_umur = '31-60')              as umur_31_60,
  sum(sisa) filter (where bucket_umur = '61-90')              as umur_61_90,
  sum(sisa) filter (where bucket_umur = '90+')                as umur_90_plus
from v_hutang
group by supplier_id, nama_supplier;

-- ---------- Limit kredit pelanggan ----------
create view v_limit_kredit with (security_invoker = true) as
select
  pl.id as pelanggan_id, pl.kode, pl.nama, pl.termin, pl.termin_hari,
  pl.limit_kredit,
  coalesce(pi.total_piutang, 0)                       as piutang_berjalan,
  pl.limit_kredit - coalesce(pi.total_piutang, 0)     as sisa_limit,
  case when pl.limit_kredit > 0
       then round(coalesce(pi.total_piutang, 0) / pl.limit_kredit * 100, 1)
       else null end                                  as pemakaian_persen
from pelanggan pl
left join v_piutang_aging pi on pi.pelanggan_id = pl.id
where pl.aktif;

-- ---------- Laba kotor per baris faktur ----------
create view v_laba_baris with (security_invoker = true) as
select
  f.id as faktur_id, f.nomor, f.tanggal,
  f.pelanggan_id, pl.nama as nama_pelanggan, pl.sales_id,
  i.produk_id, p.kode as kode_produk, p.nama as nama_produk,
  p.kategori_id,
  i.qty, i.qty_dasar, i.harga_satuan,
  i.subtotal        as omzet,
  i.hpp_total       as hpp,
  i.subtotal - i.hpp_total as laba_kotor,
  case when i.subtotal > 0
       then round((i.subtotal - i.hpp_total) / i.subtotal * 100, 2)
       else 0 end   as margin_persen
from faktur_penjualan_item i
join faktur_penjualan f on f.id = i.faktur_id
join pelanggan pl       on pl.id = f.pelanggan_id
join produk p           on p.id = i.produk_id
where f.status <> 'dibatalkan';

-- ---------- Laba per produk ----------
create view v_laba_produk with (security_invoker = true) as
select
  produk_id, kode_produk, nama_produk,
  sum(qty_dasar)  as qty_terjual,
  sum(omzet)      as omzet,
  sum(hpp)        as hpp,
  sum(laba_kotor) as laba_kotor,
  case when sum(omzet) > 0
       then round(sum(laba_kotor) / sum(omzet) * 100, 2)
       else 0 end as margin_persen
from v_laba_baris
group by produk_id, kode_produk, nama_produk;

-- ---------- Laba per pelanggan ----------
create view v_laba_pelanggan with (security_invoker = true) as
select
  pelanggan_id, nama_pelanggan,
  count(distinct faktur_id) as jumlah_faktur,
  sum(omzet)      as omzet,
  sum(hpp)        as hpp,
  sum(laba_kotor) as laba_kotor,
  case when sum(omzet) > 0
       then round(sum(laba_kotor) / sum(omzet) * 100, 2)
       else 0 end as margin_persen
from v_laba_baris
group by pelanggan_id, nama_pelanggan;

-- ---------- Penjualan harian (untuk grafik dashboard) ----------
create view v_penjualan_harian with (security_invoker = true) as
select
  tanggal,
  count(distinct faktur_id) as jumlah_faktur,
  sum(omzet)                as omzet,
  sum(laba_kotor)           as laba_kotor
from v_laba_baris
group by tanggal;
