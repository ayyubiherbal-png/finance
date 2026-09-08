-- =====================================================================
-- 0027  Pembeli Marketplace -- telepon sekarang bisa diedit manual
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  0024 sengaja membuat `telepon` TIDAK bisa diedit dari UI (dianggap
--  kunci pencocokan). Itu sudah tidak berlaku sejak 0025 -- kunci dedup
--  dipindah ke kolom `kunci` terpisah, `telepon` murni kolom tampilan.
--  User: seluruh alasan dia mau tab Pembeli Marketplace ini justru
--  supaya bisa MENCARI nomor HP secara manual (karena TikTok tidak
--  menyertakannya di file export -- lihat 0025) lalu dipakai follow-up
--  lewat WhatsApp. Jadi `telepon` justru salah satu kolom yang PALING
--  penting untuk bisa diedit, kebalikan dari desain awal 0024.
--
--  Frontend (`PembeliMarketplace.tsx`) sekarang punya kolom Telepon
--  yang bisa diedit + tombol "Chat" (wa.me) begitu terisi. Migrasi ini
--  cuma menyesuaikan `sinkron_pembeli_marketplace()` supaya nomor yang
--  sudah diisi manual TIDAK ketimpa sinkronisasi berikutnya -- pola
--  sama seperti proteksi `nama`/`alamat` yang sudah ada (`diedit_
--  manual`), belum konsisten dipasang di `telepon` sebelumnya.
-- =====================================================================

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
    -- Nama/alamat/telepon cuma diperbarui dari sumber kalau BELUM
    -- pernah diedit manual -- kalau sudah, hasil riset manual user
    -- menang, sinkronisasi cuma memperbarui angka (jumlah pesanan,
    -- total belanja, tanggal terakhir).
    telepon = case when pembeli_marketplace.diedit_manual then pembeli_marketplace.telepon else coalesce(excluded.telepon, pembeli_marketplace.telepon) end,
    nama = case when pembeli_marketplace.diedit_manual then pembeli_marketplace.nama else excluded.nama end,
    alamat = case when pembeli_marketplace.diedit_manual then pembeli_marketplace.alamat else excluded.alamat end,
    jumlah_pesanan = excluded.jumlah_pesanan,
    total_belanja = excluded.total_belanja,
    pesanan_terakhir = excluded.pesanan_terakhir;

  get diagnostics v_jumlah = row_count;
  return v_jumlah;
end;
$$;
