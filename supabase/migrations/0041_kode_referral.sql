-- =====================================================================
-- 0041  Sistem kode referral sungguhan
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  Celah #5 dari 7 (customer journey Tahap 5, Advokasi): pesan WA di
--  tahap "Aktivasi Referral" (0034/0035) cuma teks chat -- "mau saya
--  kirimkan kodenya?" -- TIDAK ADA sistem kode sungguhan di baliknya
--  (0011 malah eksplisit bilang "referral ... SENGAJA belum
--  ditambahkan"). Sekarang benar-benar dibuat.
--
--  Setiap pelanggan otomatis dapat 1 kode referral (dibuat trigger saat
--  baris pelanggan dibuat, format "REF" + kode pelanggan tanpa strip --
--  otomatis unik karena `pelanggan.kode` sudah unik, tidak perlu
--  random suffix). Bonus poin (terintegrasi ke 0040, BUKAN tabel poin
--  terpisah) diberikan ke PEREFERENSI begitu pelanggan yang direferensi
--  menyelesaikan faktur LUNAS PERTAMANYA -- bukan langsung saat kode
--  dipakai, supaya tidak gampang disalahgunakan (buat akun kosong lalu
--  klaim bonus tanpa transaksi nyata).
-- =====================================================================

create table kode_referral (
  id            uuid primary key default gen_random_uuid(),
  pelanggan_id  uuid not null unique references pelanggan(id) on delete cascade,
  kode          text not null unique,
  dibuat_pada   timestamptz not null default now()
);

create table referral_pemakaian (
  id                 uuid primary key default gen_random_uuid(),
  kode_referral_id   uuid not null references kode_referral(id) on delete cascade,
  pelanggan_baru_id  uuid not null unique references pelanggan(id) on delete cascade,
  bonus_poin         integer not null default 50,
  bonus_diberikan    boolean not null default false,
  dipakai_pada       timestamptz not null default now()
);
create index idx_referral_pemakaian_kode on referral_pemakaian(kode_referral_id);

alter table kode_referral enable row level security;
alter table referral_pemakaian enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'kode_referral' and policyname = 'baca') then
    create policy baca on kode_referral for select to authenticated using (user_aktif());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'referral_pemakaian' and policyname = 'baca') then
    create policy baca on referral_pemakaian for select to authenticated using (user_aktif());
  end if;
  -- Tidak ada policy insert/update -- kode_referral diisi trigger saat
  -- pelanggan dibuat, referral_pemakaian cuma lewat RPC pakai_kode_referral().
end $$;

grant select on kode_referral, referral_pemakaian to authenticated;

-- ---------- Kode referral otomatis untuk pelanggan baru ----------
create or replace function fn_buat_kode_referral()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into kode_referral (pelanggan_id, kode)
  values (new.id, 'REF' || upper(regexp_replace(new.kode, '[^A-Za-z0-9]', '', 'g')))
  on conflict (pelanggan_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_buat_kode_referral on pelanggan;
create trigger trg_buat_kode_referral after insert on pelanggan
  for each row execute function fn_buat_kode_referral();

-- Backfill: pelanggan yang sudah ada sebelum migrasi ini juga dapat kode.
insert into kode_referral (pelanggan_id, kode)
select id, 'REF' || upper(regexp_replace(kode, '[^A-Za-z0-9]', '', 'g'))
from pelanggan
on conflict (pelanggan_id) do nothing;

-- ---------- Pakai kode referral (dipanggil sekali, saat pelanggan baru dibuat lewat referral) ----------
create or replace function pakai_kode_referral(p_kode text, p_pelanggan_baru_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_kode_id uuid;
  v_pereferensi_id uuid;
begin
  select id, pelanggan_id into v_kode_id, v_pereferensi_id from kode_referral where kode = upper(trim(p_kode));
  if v_kode_id is null then
    raise exception 'Kode referral tidak ditemukan.';
  end if;
  if v_pereferensi_id = p_pelanggan_baru_id then
    raise exception 'Tidak bisa pakai kode referral sendiri.';
  end if;

  insert into referral_pemakaian (kode_referral_id, pelanggan_baru_id)
  values (v_kode_id, p_pelanggan_baru_id);
end;
$$;

grant execute on function pakai_kode_referral(text, uuid) to authenticated;

-- ---------- Beri bonus ke pereferensi begitu pelanggan barunya lunas faktur PERTAMA ----------
create or replace function fn_bonus_referral_faktur()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rp record;
  v_faktur_lunas_sebelumnya integer;
begin
  if new.status_bayar <> 'lunas' or new.status = 'dibatalkan' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status_bayar = 'lunas' then
    return new; -- bukan transisi baru jadi lunas, lewati (dijaga sama seperti fn_akrual_poin_faktur)
  end if;

  select rp.*, kr.pelanggan_id as pereferensi_id
  into v_rp
  from referral_pemakaian rp
  join kode_referral kr on kr.id = rp.kode_referral_id
  where rp.pelanggan_baru_id = new.pelanggan_id and rp.bonus_diberikan = false;

  if v_rp.id is null then
    return new; -- pelanggan ini tidak direferensikan siapa pun, atau bonus sudah diberikan
  end if;

  select count(*) into v_faktur_lunas_sebelumnya
  from faktur_penjualan
  where pelanggan_id = new.pelanggan_id and status_bayar = 'lunas' and status <> 'dibatalkan' and id <> new.id;

  if v_faktur_lunas_sebelumnya = 0 then
    -- Ini faktur lunas PERTAMA pelanggan yang direferensikan -- beri bonus ke pereferensi.
    insert into riwayat_poin (pelanggan_id, perubahan, alasan, referensi_tipe, referensi_id)
    values (v_rp.pereferensi_id, v_rp.bonus_poin, 'Bonus referral -- pelanggan rujukan order pertama', 'referral_pemakaian', v_rp.id);

    insert into poin_pelanggan (pelanggan_id, saldo_poin)
    values (v_rp.pereferensi_id, v_rp.bonus_poin)
    on conflict (pelanggan_id) do update set saldo_poin = poin_pelanggan.saldo_poin + v_rp.bonus_poin;

    update referral_pemakaian set bonus_diberikan = true where id = v_rp.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bonus_referral_faktur on faktur_penjualan;
create trigger trg_bonus_referral_faktur after insert or update on faktur_penjualan
  for each row execute function fn_bonus_referral_faktur();
