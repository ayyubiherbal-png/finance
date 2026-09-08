-- =====================================================================
-- 0036  Tutup 2 lubang di customer journey: jendela evaluasi (H+15..45)
--       kosong, dan kategori baru "Ulang Tahun" (pakai tanggal_lahir
--       yang sudah ada di skema tapi belum pernah dipakai otomatisasi
--       apa pun)
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  Latar belakang: user membagikan framework customer journey 5 tahap
--  (Onboarding -> Adopsi -> Evaluasi -> Retensi -> Advokasi) dari bisnis
--  lain, tanya apakah sudah ada di aplikasi ini. Dianalisa jujur -- baru
--  Tahap 2 (Adopsi, H+1/H+7/H+14 di kategori "baru") yang benar-benar
--  terbangun. 2 celah yang paling murah & berdampak untuk ditutup dulu:
--
--  1. Tahap 3 (Evaluasi, H+15..45) KOSONG di `tahapan_treatment_fu` --
--     pelanggan baru yang masih di hari ke-20 misalnya tidak dapat
--     follow-up apa pun sampai nanti jatuh ke "Mulai Hilang" di hari 61.
--     Ditambah 2 tahap: cek kepuasan (H+21..25) dan tips lanjutan
--     (H+35..40) -- BUKAN survei NPS/CSAT formal (itu di luar cakupan
--     migrasi data ini), tapi pesan WA percakapan biasa yang menanyakan
--     kepuasan & membagikan tips, konsisten dengan pola tahap lain.
--
--  2. Kolom `pelanggan.tanggal_lahir` sudah ada sejak 0011 tapi cuma
--     tersimpan/ditampilkan, tidak pernah dipakai automasi apa pun.
--     Ditambah kategori BARU "ulang_tahun" -- beda dari 5 kategori lain
--     (semuanya berbasis hari-sejak-transaksi), ini berbasis
--     hari-sejak-ulang-tahun-terakhir (dihitung di frontend, lihat
--     `hariSejakUlangTahunTerakhir()` di TugasFollowUp.tsx). Constraint
--     `kategori` di `tahapan_treatment_fu` diperlebar untuk
--     menampungnya.
-- =====================================================================

alter table tahapan_treatment_fu drop constraint if exists tahapan_treatment_fu_kategori_check;
alter table tahapan_treatment_fu add constraint tahapan_treatment_fu_kategori_check
  check (kategori in ('baru', 'naik_setia', 'naik_juara', 'mulai_hilang', 'tidur', 'ulang_tahun'));

insert into tahapan_treatment_fu (kategori, label, hari_min, hari_max, pesan_template, urutan)
select v.kategori, v.label, v.hari_min, v.hari_max, v.pesan_template, v.urutan
from (values
  ('baru', 'Cek Kepuasan H+21', 21, 25,
    'Halo {nama}, sudah 3 minggu pakai produknya -- gimana, hasilnya sesuai harapan? Kalau ada masukan atau kendala, kami senang dengar langsung dari {nama}.', 3),
  ('baru', 'Tips Lanjutan H+35', 35, 40,
    'Halo {nama}, biar hasilnya makin maksimal, ini ada tips tambahan pemakaian dari kami. Kalau mau tanya-tanya produk pendukung lainnya, langsung chat saya aja ya.', 4),
  ('ulang_tahun', 'Ucapan Ulang Tahun', 0, 1,
    'Selamat ulang tahun, {nama}! Dari kami di Ayyubi Food, semoga sehat & bahagia selalu. Sebagai kado kecil, ada voucher spesial untuk order berikutnya -- mau saya kirim kodenya?', 0)
) as v(kategori, label, hari_min, hari_max, pesan_template, urutan)
where not exists (
  select 1 from tahapan_treatment_fu t where t.kategori = v.kategori and t.label = v.label
);
