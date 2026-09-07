-- =====================================================================
-- 0026  Pembeli Marketplace -- jangan pakai nama yang angka polos
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  Setelah sinkronisasi (0025) berhasil menarik data, muncul baris
--  dengan "Nama" = "100", "1400" dst. -- BUG YANG SAMA seperti yang
--  sudah diperbaiki di daftar Sales Order/Surat Jalan/Faktur
--  (`terlihatSepertiNama()` di `src/lib/format.ts`, 2026-09-07): satu
--  batch impor TikTok lama salah kena kolom angka (berat/ongkir) waktu
--  dipetakan ke "Nama Pembeli/Penerima", bukan kolom nama/username
--  sesungguhnya. Perbaikan sebelumnya cuma di TAMPILAN (frontend) --
--  `sinkron_pembeli_marketplace()` di sini baca `nama_penerima`
--  LANGSUNG dari `sales_order` tanpa saringan yang sama, jadi angka itu
--  bukan cuma salah tampil tapi malah JADI KUNCI dedup (`kunci`) untuk
--  baris-baris yang telepon-nya kosong (lihat 0025) -- lebih parah dari
--  sekadar salah tampil.
--
--  Perbaikan: fungsi SQL baru `terlihat_seperti_nama()` (logika SAMA
--  persis seperti versi TypeScript-nya) dipakai di `sinkron_pembeli_
--  marketplace()` -- pesanan yang nama_penerima-nya cuma angka TIDAK
--  dipakai jadi nama ATAU kunci. Kalau pesanan itu juga tidak punya
--  telepon (kasus TikTok sekarang), pesanan itu otomatis TIDAK ikut
--  disinkronkan sama sekali -- lebih baik tidak muncul daripada muncul
--  dengan identitas "100" yang jelas salah.
--
--  Baris yang SUDAH kadung tersimpan dari sinkronisasi sebelumnya (nama
--  angka polos) dibersihkan sekali di migrasi ini -- KECUALI yang sudah
--  pernah diedit manual (`diedit_manual`), dijaga jangan sampai hasil
--  kerja user ikut kehapus.
-- =====================================================================

create or replace function terlihat_seperti_nama(p_teks text)
returns boolean
language sql immutable as $$
  select p_teks is not null and trim(p_teks) <> '' and trim(p_teks) !~ '^[0-9.,\s]+$';
$$;

delete from pembeli_marketplace
where not diedit_manual
  and not terlihat_seperti_nama(nama);

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
      case when terlihat_seperti_nama(nama_penerima) then lower(trim(nama_penerima)) else null end as nama_kunci,
      nama_penerima,
      alamat_kirim,
      total,
      tanggal
    from sales_order
    where kanal in ('shopee', 'tiktok')
      and (
        normalkan_telepon(telepon_penerima) is not null
        or terlihat_seperti_nama(nama_penerima)
      )
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
      (array_agg(nama_penerima order by tanggal desc nulls last) filter (where terlihat_seperti_nama(nama_penerima)))[1] as nama_terakhir,
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

grant execute on function terlihat_seperti_nama(text) to authenticated;
