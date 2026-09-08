-- =====================================================================
-- 0035  Draf tahap treatment lanjutan -- nurture menuju Juara
--
--  Migrasi tambahan, aman dijalankan berkali-kali (guard `not exists`
--  per kategori+label, jadi kalau dijalankan ulang tidak dobel, dan
--  TIDAK menimpa baris yang sudah diedit user lewat panel Tahapan
--  Treatment sejak 0034).
--
--  User setelah lihat panel Tahapan Treatment kosongan (cuma 1 tahap
--  per kategori dari seed 0034): "setiap tahapan customer menjadi
--  champions, itu pasti gak dalam 1 kali FU mereka langsung jadi
--  champions" -- benar, satu sapaan H+1 saja tidak realistis membawa
--  pembeli baru jadi Juara (3x order). Migrasi ini nambah draf tahap
--  LANJUTAN di tiap kategori supaya perjalanannya lebih bertahap:
--
--   baru         : H+1 (sudah ada) -> H+7 cek pemakaian -> H+14 ajak
--                  order lagi selagi momentum pemakaian masih terasa.
--   naik_setia   : H+0 ucapan (sudah ada) -> H+20 ajak jadi pelanggan
--                  reguler/langganan bulanan, dorongan menuju order ke-3.
--   naik_juara   : H+0 ucapan (sudah ada) -> H+20 aktivasi kode
--                  referral -- menjaga hubungan setelah jadi Juara,
--                  sekalian buka jalur akuisisi pelanggan baru dari word
--                  of mouth.
--   mulai_hilang : H+61 check-in (sudah ada) -> H+70 tindak lanjut
--                  kalau check-in pertama belum direspons/order.
--   tidur        : H+121 tarik balik (sudah ada) -> H+150 penawaran
--                  terakhir dengan insentif lebih kuat (voucher).
--
--  Ini DRAF -- kata-kata & timing-nya silakan diedit langsung lewat
--  panel "Tahapan Treatment" (Tugas Follow-Up) kalau kurang pas dengan
--  gaya bicara ke pelanggan Ayyubi Food.
-- =====================================================================

insert into tahapan_treatment_fu (kategori, label, hari_min, hari_max, pesan_template, urutan)
select v.kategori, v.label, v.hari_min, v.hari_max, v.pesan_template, v.urutan
from (values
  ('baru', 'Cek Pemakaian H+7', 7, 10,
    'Halo {nama}, sudah seminggu pemakaiannya nih -- gimana hasilnya sejauh ini? Kalau ada kendala pemakaian atau pertanyaan, kabari saya ya.', 1),
  ('baru', 'Ajak Order Lagi H+14', 14, 17,
    'Halo {nama}, biasanya di minggu ke-2 hasilnya mulai kelihatan. Kalau cocok, yuk stok lagi sebelum kehabisan -- ada juga produk pelengkap kalau mau dicoba, mau saya infokan?', 2),
  ('naik_setia', 'Ajak Jadi Reguler H+20', 20, 25,
    'Halo {nama}, makasih sudah jadi pelanggan setia kami. Kalau mau order rutin tiap bulan, saya bisa bantu ingatkan & kasih harga khusus langganan -- mau saya infokan?', 1),
  ('naik_juara', 'Aktivasi Referral H+20', 20, 25,
    '{nama}, sebagai pelanggan Juara kami mau kasih kode referral khusus -- kalau ada teman/keluarga yang order pakai kode ini, {nama} dapat bonus. Mau saya kirimkan kodenya?', 1),
  ('mulai_hilang', 'Tindak Lanjut H+70', 70, 74,
    'Halo {nama}, kemarin saya sempat kabari tapi belum sempat dibalas -- semoga sehat-sehat selalu. Kalau butuh info promo atau produk baru, saya siap bantu kapan saja.', 1),
  ('tidur', 'Penawaran Terakhir H+150', 150, 155,
    'Halo {nama}, kami kangen banget sama Kakak. Sebagai apresiasi pelanggan lama, ada voucher spesial untuk order berikutnya -- masih berlaku beberapa hari, mau saya kirim kodenya?', 1)
) as v(kategori, label, hari_min, hari_max, pesan_template, urutan)
where not exists (
  select 1 from tahapan_treatment_fu t where t.kategori = v.kategori and t.label = v.label
);
