-- =====================================================================
-- 0055  Riset Pasar -- brief AI (Fase 2, Level 1: otomatis via Edge
--       Function + Gemini API, dipicu manual dulu dari tombol di UI).
--
-- Ditulis HANYA oleh Edge Function `riset-pasar` (pakai service role,
-- setelah verifikasi pemanggilnya owner/admin) -- klien tidak diberi
-- izin INSERT langsung, supaya tidak ada jalur lain yang memicu
-- pemakaian API di luar kontrol.
-- =====================================================================

create table riset_pasar_brief (
  id                 uuid primary key default gen_random_uuid(),
  ringkasan_internal jsonb not null,   -- snapshot data yang dikirim ke model, untuk ketertelusuran
  hasil_riset        text not null,    -- brief hasil AI (markdown)
  model              text not null,    -- mis. 'gemini-2.0-flash' -- supaya gampang ganti model nanti
  dibuat_oleh        uuid references profil(id) on delete set null,
  dibuat_pada        timestamptz not null default now()
);

create index idx_riset_pasar_brief_waktu on riset_pasar_brief(dibuat_pada desc);

alter table riset_pasar_brief enable row level security;
create policy baca_riset_pasar on riset_pasar_brief for select to authenticated using (is_admin());
grant select on riset_pasar_brief to authenticated;

create trigger trg_audit_riset_pasar_brief after insert or update or delete on riset_pasar_brief
  for each row execute function fn_catat_audit();
