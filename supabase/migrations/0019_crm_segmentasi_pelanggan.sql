-- =====================================================================
-- 0019  CRM -- segmentasi pelanggan (RFM) & produk favorit
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  Untuk bisnis dagang/distribusi, inti CRM bukan "pipeline penjualan"
--  (itu pola bisnis proyek/B2B besar), tapi **RFM**: Recency (kapan
--  terakhir beli), Frequency (seberapa sering), Monetary (berapa besar).
--  Semua bahannya SUDAH ADA di riwayat faktur penjualan -- tidak perlu
--  tabel baru, tidak perlu input tambahan dari user. Jadi migrasi ini
--  murni menambah 2 VIEW, tidak menyentuh tabel/data yang ada.
--
--  Ambang batas segmen (60 & 120 hari) dipilih dengan asumsi siklus
--  belanja produk makanan ±1 bulan: lewat 60 hari = sudah 2 siklus
--  terlewat (mulai hilang), lewat 120 hari = praktis berhenti (tidur).
--  Kalau pola belanja riil ternyata beda, cukup ubah 2 angka di CASE
--  bawah ini lalu jalankan ulang -- tidak ada data yang perlu dimigrasi.
-- =====================================================================

-- ---------- Ringkasan RFM + segmen per pelanggan ----------

create or replace view v_pelanggan_crm with (security_invoker = true) as
with transaksi as (
  select
    f.pelanggan_id,
    count(*)               as jumlah_transaksi,
    sum(f.total)           as total_belanja,
    round(avg(f.total), 2) as rata_belanja,
    max(f.tanggal)         as terakhir_order,
    min(f.tanggal)         as pertama_order
  from faktur_penjualan f
  where f.status <> 'dibatalkan'
  group by f.pelanggan_id
)
select
  pl.id as pelanggan_id,
  pl.kode,
  pl.nama,
  pl.tipe,
  pl.telepon,
  pl.whatsapp,
  pl.sales_id,
  pl.aktif,
  pl.akun_agregat,
  coalesce(t.jumlah_transaksi, 0) as jumlah_transaksi,
  coalesce(t.total_belanja, 0)    as total_belanja,
  coalesce(t.rata_belanja, 0)     as rata_belanja,
  t.terakhir_order,
  t.pertama_order,
  (current_date - t.terakhir_order) as hari_sejak_order,
  case
    when t.jumlah_transaksi is null                then 'belum_pernah'
    when current_date - t.terakhir_order > 120     then 'tidur'
    when current_date - t.terakhir_order > 60      then 'mulai_hilang'
    when t.jumlah_transaksi >= 3                   then 'juara'
    when t.jumlah_transaksi = 2                    then 'setia'
    else                                                'baru'
  end as segmen
from pelanggan pl
left join transaksi t on t.pelanggan_id = pl.id;

grant select on v_pelanggan_crm to authenticated;

-- ---------- Produk yang paling sering/banyak dibeli tiap pelanggan ----------
-- Dipakai di halaman profil pelanggan ("produk favorit"). Diagregasi di
-- database, bukan di browser, supaya tidak perlu menarik seluruh baris
-- faktur item ke sisi klien.

create or replace view v_produk_favorit_pelanggan with (security_invoker = true) as
select
  f.pelanggan_id,
  i.produk_id,
  p.kode              as kode_produk,
  p.nama              as nama_produk,
  sum(i.qty_dasar)    as total_qty_dasar,
  sum(i.subtotal)     as total_nilai,
  count(distinct f.id) as jumlah_faktur
from faktur_penjualan_item i
join faktur_penjualan f on f.id = i.faktur_id
join produk p           on p.id = i.produk_id
where f.status <> 'dibatalkan'
group by f.pelanggan_id, i.produk_id, p.kode, p.nama;

grant select on v_produk_favorit_pelanggan to authenticated;
