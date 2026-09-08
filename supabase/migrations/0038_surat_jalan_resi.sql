-- =====================================================================
-- 0038  Nomor resi pengiriman di Surat Jalan
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  Celah dari analisa customer journey (Tahap 1, Onboarding): Surat
--  Jalan sudah punya `ekspedisi` (nama kurir, mis. "JNE") sejak 0004,
--  tapi tidak ada tempat menyimpan NOMOR RESI-nya -- padahal itu yang
--  sebenarnya dibutuhkan pelanggan untuk melacak paketnya sendiri.
-- =====================================================================

alter table surat_jalan add column if not exists no_resi text;
