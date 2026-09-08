-- =====================================================================
-- 0029  Riwayat Follow-Up -- "Tandai Selesai" di Tugas Follow-Up
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  Fitur #1 dari 5 yang disepakati user untuk dikerjakan berurutan
--  (turunan dari analisis fitur CRM pihak ketiga, 2026-09-08): pondasi
--  untuk fitur #2-5 lainnya -- tanpa ini, "Tingkat Follow-Up Selesai"
--  dan "Riwayat Follow-Up" (dibahas waktu membandingkan Session
--  Resolution Rate & Session List punya CRM lain) tidak punya data
--  untuk dihitung.
--
--  `TugasFollowUp.tsx` MENGHITUNG ULANG daftar tugas tiap kali dibuka
--  (tidak disimpan) -- jadi begitu tugas "ditandai selesai", perlu
--  cara supaya tugas yang SAMA tidak muncul lagi besok padahal jendela
--  harinya belum lewat. Solusinya: `tugas_id` yang SAMA PERSIS dengan
--  id deterministik yang sudah dipakai di kode frontend (mis.
--  "pelanggan-naik_setia-<uuid>") dicatat di sini begitu selesai;
--  frontend tinggal menyaring tugas yang id-nya sudah ada di tabel ini.
--
--  `entitas_id` SENGAJA tidak diberi foreign key -- ini polymorphic
--  (bisa merujuk ke `pelanggan.id` ATAU `pembeli_marketplace.id`
--  tergantung `entitas_tipe`), Postgres tidak punya FK kondisional.
--  `nama` disalin (snapshot) supaya riwayatnya tetap terbaca apa adanya
--  walau nama induknya nanti berubah atau baris induknya dihapus.
-- =====================================================================

create table if not exists riwayat_follow_up (
  id             uuid primary key default gen_random_uuid(),
  tugas_id       text not null,
  kategori       text not null,
  entitas_tipe   text not null check (entitas_tipe in ('pelanggan', 'pembeli_marketplace')),
  entitas_id     uuid not null,
  nama           text,
  catatan        text,
  selesai_oleh   uuid references profil(id) on delete set null,
  selesai_pada   timestamptz not null default now(),
  unique (tugas_id)
);
create index if not exists idx_riwayat_fu_selesai_pada on riwayat_follow_up(selesai_pada desc);

alter table riwayat_follow_up enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'riwayat_follow_up' and policyname = 'baca') then
    create policy baca on riwayat_follow_up for select to authenticated using (user_aktif());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'riwayat_follow_up' and policyname = 'tulis') then
    create policy tulis on riwayat_follow_up for insert to authenticated with check (boleh_sales());
  end if;
end $$;

grant select, insert on riwayat_follow_up to authenticated;
