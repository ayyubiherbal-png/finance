-- =====================================================================
-- 0037  Riwayat tahap per pelanggan -- jejak perjalanan FU
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  Latar belakang: tugas di Tugas Follow-Up SELALU dihitung ulang di
--  frontend dari data live (hari sejak transaksi/ulang tahun) -- tidak
--  ada yang disimpan. Begitu seorang pelanggan lewat jendela hari suatu
--  tahap (mis. H+1..4 "Sapa H+1"), tugasnya hilang dari daftar SELAMANYA
--  kalau tidak sempat ditandai selesai -- tidak ada jejak bahwa tahap
--  itu pernah muncul untuknya sama sekali.
--
--  User: "Riwayat tahap per pelanggan" -- mau tahu tahap H+1/H+7/H+14
--  mana saja yang PERNAH dilewati seorang pelanggan sepanjang waktu,
--  bukan cuma yang sedang aktif hari ini.
--
--  Tabel ini murni CATATAN KEMUNCULAN (bukan catatan penyelesaian --
--  itu tetap `riwayat_follow_up`, 0029). Baris baru masuk begitu tahap
--  tsb PERTAMA KALI terlihat di daftar Tugas Follow-Up siapa pun yang
--  membuka halamannya (idempotent lewat `tugas_id` unik -- dicatat
--  sekali per kejadian, bukan tiap kali halaman dibuka ulang). Gabungkan
--  dengan `riwayat_follow_up` lewat `tugas_id` yang SAMA untuk tahu
--  status: muncul tapi belum ditandai selesai = terlewat/masih berjalan,
--  muncul dan ada di riwayat_follow_up = selesai dikerjakan.
--
--  `tahapan_id` referensi ke `tahapan_treatment_fu` TAPI on delete set
--  null (bukan cascade/restrict) -- tahap boleh dihapus admin kapan
--  saja tanpa merusak riwayat lama, makanya `kategori`/`label` disalin
--  sebagai snapshot juga (sama prinsipnya dengan `nama` di
--  riwayat_follow_up).
-- =====================================================================

create table riwayat_tahap_pelanggan (
  id                    uuid primary key default gen_random_uuid(),
  tugas_id              text not null unique,
  entitas_tipe          text not null check (entitas_tipe in ('pelanggan', 'pembeli_marketplace')),
  entitas_id            uuid not null,
  tahapan_id            uuid references tahapan_treatment_fu(id) on delete set null,
  kategori              text not null,
  label                 text not null,
  nama                  text,
  muncul_pertama_pada   timestamptz not null default now()
);
create index idx_riwayat_tahap_entitas on riwayat_tahap_pelanggan(entitas_tipe, entitas_id, muncul_pertama_pada desc);

alter table riwayat_tahap_pelanggan enable row level security;

do $$
begin
  -- Semua yang aktif boleh baca DAN tulis -- ini murni catatan
  -- kemunculan otomatis (dicatat siapa pun yang membuka Tugas
  -- Follow-Up), bukan aksi bisnis yang perlu dibatasi peran sales
  -- (beda dari riwayat_follow_up yang butuh boleh_sales() karena itu
  -- mewakili keputusan "saya sudah follow-up orang ini").
  if not exists (select 1 from pg_policies where tablename = 'riwayat_tahap_pelanggan' and policyname = 'baca') then
    create policy baca on riwayat_tahap_pelanggan for select to authenticated using (user_aktif());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'riwayat_tahap_pelanggan' and policyname = 'tulis') then
    create policy tulis on riwayat_tahap_pelanggan for insert to authenticated with check (user_aktif());
  end if;
end $$;

grant select, insert on riwayat_tahap_pelanggan to authenticated;
