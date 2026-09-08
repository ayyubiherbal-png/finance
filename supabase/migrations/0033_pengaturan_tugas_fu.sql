-- =====================================================================
-- 0033  Aturan Tugas Follow-Up bisa diatur sendiri
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  Fitur #5 (terakhir) dari 5 yang disepakati user ("Kerjakan
--  berurut"). Sebelum ini, jendela hari-sejak-transaksi yang menentukan
--  kapan seorang pelanggan/pembeli marketplace masuk daftar Tugas
--  Follow-Up (JENDELA_BARU/JENDELA_NAIK_KELAS/JENDELA_MULAI_HILANG/
--  JENDELA_TIDUR di TugasFollowUp.tsx) HARDCODE di kode -- mengubahnya
--  butuh deploy baru. Tabel ini memindahkan 4 angka itu ke database
--  supaya bisa diubah lewat UI (owner/admin saja, lihat RLS di bawah)
--  tanpa perlu kode baru.
--
--  4 baris (satu per kategori jendela) di-seed dengan nilai default
--  yang SAMA PERSIS dengan konstanta lama, supaya migrasi ini murni
--  "memindahkan tempat penyimpanan", tidak mengubah perilaku sampai
--  ada yang benar-benar mengubah angkanya lewat UI.
-- =====================================================================

create table if not exists pengaturan_tugas_fu (
  kategori      text primary key check (kategori in ('baru', 'naik_kelas', 'mulai_hilang', 'tidur')),
  hari_min      integer not null,
  hari_max      integer not null check (hari_max >= hari_min),
  updated_at    timestamptz not null default now(),
  updated_oleh  uuid references profil(id) on delete set null
);

insert into pengaturan_tugas_fu (kategori, hari_min, hari_max) values
  ('baru', 1, 4),
  ('naik_kelas', 0, 3),
  ('mulai_hilang', 61, 65),
  ('tidur', 121, 125)
on conflict (kategori) do nothing;

drop trigger if exists trg_pengaturan_tugas_fu_updated on pengaturan_tugas_fu;
create trigger trg_pengaturan_tugas_fu_updated before update on pengaturan_tugas_fu
  for each row execute function set_updated_at();

alter table pengaturan_tugas_fu enable row level security;

do $$
begin
  -- Semua yang aktif boleh BACA (jendelanya dipakai untuk menyusun
  -- daftar tugas yang dilihat semua sales), tapi MENGUBAH cadence FU
  -- adalah keputusan kebijakan bisnis -- dibatasi admin/owner saja,
  -- sama seperti pembatasan master data lain (lihat 0008).
  if not exists (select 1 from pg_policies where tablename = 'pengaturan_tugas_fu' and policyname = 'baca') then
    create policy baca on pengaturan_tugas_fu for select to authenticated using (user_aktif());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pengaturan_tugas_fu' and policyname = 'ubah') then
    create policy ubah on pengaturan_tugas_fu for update to authenticated using (is_admin()) with check (is_admin());
  end if;
end $$;

grant select, update on pengaturan_tugas_fu to authenticated;
