-- =====================================================================
-- 0030  CRM -- view "Pelanggan Aktif per Bulan"
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  Fitur #2 dari 5 yang disepakati user ("Kerjakan berurut"), diadaptasi
--  dari dashboard Analytics CRM omnichannel pihak ketiga -- mereka
--  punya "Historical MAU" (Monthly Active Users) berbasis sesi chat.
--  Ayyubi tidak punya live chat, tapi konsepnya bisa dipetakan ke data
--  transaksi yang sudah ada: "pelanggan aktif" = pelanggan (bukan akun
--  agregat marketplace) yang punya minimal 1 faktur penjualan tidak
--  dibatalkan dalam bulan kalender tsb.
--
--  Murni 1 VIEW baru, tidak menyentuh tabel/data yang ada.
-- =====================================================================

create or replace view v_pelanggan_aktif_bulanan with (security_invoker = true) as
select
  date_trunc('month', f.tanggal)::date as bulan,
  count(distinct f.pelanggan_id)       as jumlah_pelanggan_aktif
from faktur_penjualan f
join pelanggan pl on pl.id = f.pelanggan_id
where f.status <> 'dibatalkan'
  and pl.akun_agregat = false
group by 1;

grant select on v_pelanggan_aktif_bulanan to authenticated;
