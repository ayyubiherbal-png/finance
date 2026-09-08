-- =====================================================================
-- 0034  Tahapan treatment Follow-Up (mengganti "Aturan Jendela FU", 0033)
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  User setelah mencoba 0033: "CRM saya masih belum puas ... timeline
--  untuk FU juga belum bisa saya atur dari dashboard" -- diperjelas lagi
--  lewat tanya jawab: maksudnya bukan cuma "kapan mulai" (satu jendela
--  hari per kategori, itu yang 0033 kerjakan), tapi TREATMENT -- beberapa
--  titik sentuh berurutan dengan pesan WA berbeda per titik, mis. untuk
--  pembeli baru: H+1 "sapa & cara pakai", H+3 "cek kepuasan", H+7
--  "tawarkan repeat order". Sekaligus menjawab permintaan lain di sesi
--  yang sama: pesan WA yang tadinya hardcode (`pesanUntuk()` di
--  TugasFollowUp.tsx) sekarang bisa diedit sendiri lewat UI.
--
--  Tabel `pengaturan_tugas_fu` (0033) DIHAPUS di sini -- baru dibuat
--  sehari sebelumnya, isinya masih nilai default seed (user cuma sempat
--  klik tombolnya, belum benar-benar mengubah angka), dan sepenuhnya
--  digantikan tabel ini (satu baris per TAHAP, bukan satu baris per
--  kategori) -- bukan pola "jangan pernah drop tabel produksi", ini
--  kasus khusus migrasi kemarin yang belum sempat dipakai sungguhan.
--
--  Beda dari 0033: dikunci ke KATEGORI TUGAS asli (baru/naik_setia/
--  naik_juara/mulai_hilang/tidur -- 5 nilai, sama dengan `Kategori` di
--  TugasFollowUp.tsx), BUKAN 4 nilai gabungan "naik_kelas" seperti
--  0033. Alasannya: naik_setia (order ke-2) dan naik_juara (order ke-3)
--  punya pesan yang beda meski jendela harinya kebetulan sama -- dengan
--  model treatment (banyak tahap + pesan per tahap), tidak perlu lagi
--  digabung, masing-masing bisa diatur bebas dan independen.
--
--  `jadikan_pelanggan` SENGAJA tidak dipindah ke sini -- pemicunya
--  bukan jendela hari sejak transaksi, tapi kelengkapan data kontak
--  (lihat `siapDijadikanPelanggan()`), jadi tetap satu pesan tunggal di
--  kode seperti sebelumnya.
-- =====================================================================

drop trigger if exists trg_pengaturan_tugas_fu_updated on pengaturan_tugas_fu;
drop table if exists pengaturan_tugas_fu;

create table tahapan_treatment_fu (
  id             uuid primary key default gen_random_uuid(),
  kategori       text not null check (kategori in ('baru', 'naik_setia', 'naik_juara', 'mulai_hilang', 'tidur')),
  label          text not null,
  hari_min       integer not null,
  hari_max       integer not null check (hari_max >= hari_min),
  -- {nama} diganti nama pembeli/pelanggan saat pesan dirender -- lihat renderPesan() di TugasFollowUp.tsx.
  pesan_template text not null,
  urutan         integer not null default 0,
  aktif          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_oleh   uuid references profil(id) on delete set null
);
create index idx_tahapan_treatment_kategori on tahapan_treatment_fu(kategori, urutan);

-- Seed: tahap pertama per kategori, angka & pesan SAMA PERSIS dengan
-- yang sebelumnya hardcode -- supaya migrasi ini tidak mengubah
-- perilaku sampai admin/owner benar-benar menambah/mengedit tahap.
insert into tahapan_treatment_fu (kategori, label, hari_min, hari_max, pesan_template, urutan) values
  ('baru', 'Sapa H+1', 1, 4,
    'Halo {nama}, produknya sudah sampai? Ini cara pakainya biar hasilnya maksimal -- kalau ada pertanyaan langsung chat saya ya.', 0),
  ('naik_setia', 'Ucapan order ke-2', 0, 3,
    'Terima kasih {nama} sudah order lagi! Kebetulan ada paket hemat kalau beli 2, mau saya infokan?', 0),
  ('naik_juara', 'Ucapan order ke-3', 0, 3,
    '{nama} termasuk pelanggan setia kami nih. Kalau ada teman yang butuh, ada program referral -- dan produk baru kami akan info {nama} duluan.', 0),
  ('mulai_hilang', 'Check-in H+61', 61, 65,
    'Halo {nama}, sudah lama nggak order nih. Stoknya habis atau ada kendala? Kabari saya ya kalau butuh bantuan.', 0),
  ('tidur', 'Tarik balik H+121', 121, 125,
    'Halo {nama}, kangen order dari Kakak. Ada info promo terbaru dari kami, siapa tahu ada yang cocok.', 0);

alter table tahapan_treatment_fu enable row level security;

do $$
begin
  -- Semua yang aktif boleh BACA (dipakai menyusun daftar tugas yang
  -- dilihat semua sales), tapi MENGUBAH/menambah/menghapus tahap
  -- treatment dibatasi admin/owner saja -- sama seperti 0033.
  if not exists (select 1 from pg_policies where tablename = 'tahapan_treatment_fu' and policyname = 'baca') then
    create policy baca on tahapan_treatment_fu for select to authenticated using (user_aktif());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tahapan_treatment_fu' and policyname = 'tulis') then
    create policy tulis on tahapan_treatment_fu for insert to authenticated with check (is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tahapan_treatment_fu' and policyname = 'ubah') then
    create policy ubah on tahapan_treatment_fu for update to authenticated using (is_admin()) with check (is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tahapan_treatment_fu' and policyname = 'hapus') then
    create policy hapus on tahapan_treatment_fu for delete to authenticated using (is_admin());
  end if;
end $$;

grant select, insert, update, delete on tahapan_treatment_fu to authenticated;

drop trigger if exists trg_tahapan_treatment_updated on tahapan_treatment_fu;
create trigger trg_tahapan_treatment_updated before update on tahapan_treatment_fu
  for each row execute function set_updated_at();
