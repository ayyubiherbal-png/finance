-- =====================================================================
-- 0056  Konten Agent -- draf caption produk per kanal (Fase 2, Level 1)
--
-- Ditulis HANYA oleh Edge Function `buat-draf-konten` (service role,
-- setelah verifikasi pemanggilnya boleh_sales()) -- klien tidak diberi
-- izin INSERT langsung. Draf TIDAK pernah dipublikasikan otomatis;
-- ini murni riwayat teks untuk ditinjau & disalin manual oleh staf.
-- =====================================================================

create table konten_draft (
  id          uuid primary key default gen_random_uuid(),
  produk_id   uuid references produk(id) on delete set null,
  kanal       kanal_penjualan not null,
  draf        text not null,
  model       text not null,
  dibuat_oleh uuid references profil(id) on delete set null,
  dibuat_pada timestamptz not null default now()
);

create index idx_konten_draft_waktu on konten_draft(dibuat_pada desc);

alter table konten_draft enable row level security;
create policy baca_konten_draft on konten_draft for select to authenticated using (user_aktif());
grant select on konten_draft to authenticated;

create trigger trg_audit_konten_draft after insert or update or delete on konten_draft
  for each row execute function fn_catat_audit();
