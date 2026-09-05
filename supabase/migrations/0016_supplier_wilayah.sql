-- =====================================================================
-- 0016  Supplier -- alamat berjenjang (Provinsi/Kab-Kota/Kecamatan/Kelurahan)
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  User minta form Supplier alamatnya dibuat seperti form Pelanggan
--  (0011) -- dropdown wilayah resmi Kemendagri, bukan teks bebas.
--  Tabel wilayah_* sudah ada & terisi dari fitur Pelanggan, jadi di
--  sini cuma nambah 4 kolom referensi ke supplier (pola persis sama
--  dengan pelanggan di 0011). Kolom `kota` (teks bebas lama) DIBIARKAN
--  tidak dipakai lagi oleh form -- bukan di-drop, sama seperti pola
--  pelanggan.kota sebelumnya.
-- =====================================================================

alter table supplier
  add column if not exists provinsi_kode text references wilayah_provinsi(kode),
  add column if not exists kabupaten_kode text references wilayah_kabupaten_kota(kode),
  add column if not exists kecamatan_kode text references wilayah_kecamatan(kode),
  add column if not exists kelurahan_kode text references wilayah_kelurahan(kode);
