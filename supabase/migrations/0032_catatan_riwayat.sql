-- =====================================================================
-- 0032  Catatan FU jadi riwayat multi-entry
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  Fitur #4 dari 5 yang disepakati user ("Kerjakan berurut"). Sebelum
--  ini, kolom `catatan` di `pembeli_marketplace` cuma satu baris teks
--  bebas -- tiap kali diedit, isi lamanya HILANG, tidak ada jejak "apa
--  yang pernah dicatat sebelumnya". Untuk follow-up (kapan dihubungi,
--  hasilnya apa, janji apa yang dibuat) itu masalah nyata: sales
--  berikutnya yang pegang akun ini kehilangan konteks.
--
--  Desain yang dipilih: TIDAK mengubah cara sales mengedit catatan sama
--  sekali (tetap satu kolom `catatan`, tetap diedit lewat form inline
--  yang sudah ada di Pembeli Marketplace) -- perubahan murni di
--  BELAKANG LAYAR lewat trigger. Setiap kali `catatan` berubah nilainya
--  (dan tidak kosong), nilai BARU otomatis disalin jadi satu baris baru
--  di tabel riwayat ini. Sales tidak perlu belajar UI baru, riwayatnya
--  terkumpul otomatis dari kebiasaan kerja yang sudah ada.
--
--  `entitas_tipe`/`entitas_id` polymorphic mengikuti pola yang sama
--  dengan `riwayat_follow_up` (0029) -- disiapkan untuk `pelanggan` juga
--  kalau nanti dibutuhkan, walau pemicu (trigger) yang aktif sekarang
--  baru untuk `pembeli_marketplace` (satu-satunya tempat kolom
--  `catatan` benar-benar dipakai user lewat UI saat ini).
-- =====================================================================

create table if not exists catatan_riwayat (
  id            uuid primary key default gen_random_uuid(),
  entitas_tipe  text not null check (entitas_tipe in ('pelanggan', 'pembeli_marketplace')),
  entitas_id    uuid not null,
  isi           text not null,
  dibuat_oleh   uuid references profil(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_catatan_riwayat_entitas on catatan_riwayat(entitas_tipe, entitas_id, created_at desc);

alter table catatan_riwayat enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'catatan_riwayat' and policyname = 'baca') then
    create policy baca on catatan_riwayat for select to authenticated using (user_aktif());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'catatan_riwayat' and policyname = 'tulis') then
    create policy tulis on catatan_riwayat for insert to authenticated with check (boleh_sales());
  end if;
end $$;

grant select, insert on catatan_riwayat to authenticated;

-- ---------- Backfill: catatan yang sudah ada jadi entri riwayat pertama ----------
insert into catatan_riwayat (entitas_tipe, entitas_id, isi, created_at)
select 'pembeli_marketplace', pm.id, pm.catatan, pm.updated_at
from pembeli_marketplace pm
where pm.catatan is not null
  and trim(pm.catatan) <> ''
  and not exists (
    select 1 from catatan_riwayat cr
    where cr.entitas_tipe = 'pembeli_marketplace' and cr.entitas_id = pm.id
  );

-- ---------- Trigger: catatan baru (beda dari sebelumnya) otomatis jadi riwayat ----------
create or replace function fn_catatan_riwayat_pembeli_mp()
returns trigger language plpgsql as $$
begin
  if new.catatan is not null and trim(new.catatan) <> '' and new.catatan is distinct from old.catatan then
    insert into catatan_riwayat (entitas_tipe, entitas_id, isi, dibuat_oleh)
    values ('pembeli_marketplace', new.id, new.catatan, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_catatan_riwayat_pembeli_mp on pembeli_marketplace;
create trigger trg_catatan_riwayat_pembeli_mp after update on pembeli_marketplace
  for each row execute function fn_catatan_riwayat_pembeli_mp();
