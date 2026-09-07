-- =====================================================================
-- 0025  Pembeli Marketplace -- kunci dedup pakai username kalau telepon kosong
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  Sinkronisasi (0024) ternyata menghasilkan 0 baris untuk 877 pesanan
--  TikTok yang sudah diimpor -- dicek langsung lewat query oleh user:
--  SEMUA barisnya punya `telepon_penerima` KOSONG total. Ternyata
--  TikTok (kemungkinan juga Shopee) TIDAK menyertakan nomor HP pembeli
--  di file export Seller Centre sama sekali -- alasan privasi yang
--  sama dengan kenapa usernamenya disensor ("m***adam_"). Desain 0024
--  yang mengandalkan telepon sebagai SATU-SATUNYA kunci dedup jadi
--  tidak berguna sama sekali untuk kasus nyata ini.
--
--  Diperbaiki: kunci dedup sekarang `kunci` -- kolom baru yang diisi
--  nomor telepon ternormalisasi KALAU ADA, kalau tidak (kasus paling
--  umum sekarang) jatuh ke username/nama penerima (di-lowercase+trim)
--  sebagai cadangan. Username yang disensor platform tetap KONSISTEN
--  untuk akun yang sama (mis. "m***adam_" akan selalu identik untuk
--  pembeli yang sama), jadi tetap bisa dipakai membedakan satu pembeli
--  dari yang lain walau bukan identitas asli. KETERBATASAN yang
--  disadari: kalau dua pembeli BERBEDA kebetulan mendapat pola sensor
--  yang identik, mereka akan tergabung jadi satu baris di sini --
--  risiko kecil, diterima demi punya cara mengelompokkan sama sekali
--  (drpd tidak ada sama sekali seperti sebelumnya).
--
--  `telepon` tetap ada sebagai kolom TAMPILAN (kalau kelak platform
--  mengekspornya, atau diisi manual), tapi bukan lagi bagian dari
--  kunci unique -- makanya dibuat boleh kosong (drop not null).
-- =====================================================================

alter table pembeli_marketplace alter column telepon drop not null;
alter table pembeli_marketplace add column if not exists kunci text;

update pembeli_marketplace
set kunci = coalesce(telepon, nullif(lower(trim(nama)), ''))
where kunci is null;

delete from pembeli_marketplace where kunci is null;

alter table pembeli_marketplace alter column kunci set not null;

alter table pembeli_marketplace drop constraint if exists pembeli_marketplace_kanal_telepon_key;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pembeli_marketplace_kanal_kunci_key'
  ) then
    alter table pembeli_marketplace add constraint pembeli_marketplace_kanal_kunci_key unique (kanal, kunci);
  end if;
end $$;

create or replace function sinkron_pembeli_marketplace()
returns integer   -- jumlah baris yang ditambah/diperbarui
language plpgsql
security invoker
as $$
declare
  v_jumlah integer;
begin
  with sumber as (
    select
      kanal,
      normalkan_telepon(telepon_penerima) as telepon,
      nullif(lower(trim(nama_penerima)), '') as nama_kunci,
      nama_penerima,
      alamat_kirim,
      total,
      tanggal
    from sales_order
    where kanal in ('shopee', 'tiktok')
      and (normalkan_telepon(telepon_penerima) is not null or nullif(lower(trim(nama_penerima)), '') is not null)
  ),
  berkunci as (
    select coalesce(telepon, nama_kunci) as kunci, kanal, telepon, nama_penerima, alamat_kirim, total, tanggal
    from sumber
  ),
  agregat as (
    select
      kanal,
      kunci,
      (array_agg(telepon order by tanggal desc nulls last) filter (where telepon is not null))[1] as telepon_terakhir,
      (array_agg(nama_penerima order by tanggal desc nulls last))[1] as nama_terakhir,
      (array_agg(alamat_kirim order by tanggal desc nulls last))[1] as alamat_terakhir,
      count(*) as jumlah_pesanan,
      sum(total) as total_belanja,
      max(tanggal) as pesanan_terakhir
    from berkunci
    group by kanal, kunci
  )
  insert into pembeli_marketplace (kanal, kunci, telepon, nama, alamat, jumlah_pesanan, total_belanja, pesanan_terakhir)
  select kanal, kunci, telepon_terakhir, nama_terakhir, alamat_terakhir, jumlah_pesanan, total_belanja, pesanan_terakhir
  from agregat
  on conflict (kanal, kunci) do update
  set
    telepon = coalesce(excluded.telepon, pembeli_marketplace.telepon),
    -- Nama/alamat cuma diperbarui kalau BELUM pernah diedit manual.
    nama = case when pembeli_marketplace.diedit_manual then pembeli_marketplace.nama else excluded.nama end,
    alamat = case when pembeli_marketplace.diedit_manual then pembeli_marketplace.alamat else excluded.alamat end,
    jumlah_pesanan = excluded.jumlah_pesanan,
    total_belanja = excluded.total_belanja,
    pesanan_terakhir = excluded.pesanan_terakhir;

  get diagnostics v_jumlah = row_count;
  return v_jumlah;
end;
$$;
