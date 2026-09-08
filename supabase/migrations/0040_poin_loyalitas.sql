-- =====================================================================
-- 0040  Program loyalitas -- poin pelanggan
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  Celah #4 dari 7 (customer journey Tahap 4, Retensi): tidak ada
--  program loyalitas/poin sama sekali -- `tier_harga` yang ada di
--  skema itu murni harga grosir B2B yang ditentukan STAF, bukan tier
--  otomatis dari perilaku beli pelanggan.
--
--  Aturan akrual (SEDERHANA & mudah diubah kalau perlu): 1 poin per
--  Rp10.000 dari total faktur, diberikan begitu faktur LUNAS (bukan
--  saat dibuat -- supaya tidak memberi poin untuk transaksi yang belum
--  benar-benar dibayar). Kalau faktur yang sudah lunas kemudian
--  dibatalkan, poinnya ditarik balik otomatis (jurnal balik, bukan
--  hapus baris -- konsisten dengan prinsip stok_mutasi append-only di
--  0006).
--
--  Penukaran poin SENGAJA cuma lewat RPC `tukar_poin()` (bukan update
--  langsung ke `poin_pelanggan`/`riwayat_poin` dari klien) -- supaya
--  saldo & riwayat selalu konsisten (satu transaksi atomik) dan saldo
--  tidak bisa jadi negatif.
-- =====================================================================

create table poin_pelanggan (
  pelanggan_id  uuid primary key references pelanggan(id) on delete cascade,
  saldo_poin    integer not null default 0 check (saldo_poin >= 0),
  updated_at    timestamptz not null default now()
);

create table riwayat_poin (
  id             uuid primary key default gen_random_uuid(),
  pelanggan_id   uuid not null references pelanggan(id) on delete cascade,
  perubahan      integer not null,   -- positif = dapat poin, negatif = ditukar/ditarik balik
  alasan         text not null,
  referensi_tipe text,               -- mis. 'faktur_penjualan' -- polymorphic, bukan FK (lihat 0029)
  referensi_id   uuid,
  dibuat_oleh    uuid references profil(id) on delete set null,  -- null = otomatis (trigger)
  dibuat_pada    timestamptz not null default now()
);
create index idx_riwayat_poin_pelanggan on riwayat_poin(pelanggan_id, dibuat_pada desc);

drop trigger if exists trg_poin_pelanggan_updated on poin_pelanggan;
create trigger trg_poin_pelanggan_updated before update on poin_pelanggan
  for each row execute function set_updated_at();

alter table poin_pelanggan enable row level security;
alter table riwayat_poin enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'poin_pelanggan' and policyname = 'baca') then
    create policy baca on poin_pelanggan for select to authenticated using (user_aktif());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'riwayat_poin' and policyname = 'baca') then
    create policy baca on riwayat_poin for select to authenticated using (user_aktif());
  end if;
  -- Tidak ada policy insert/update untuk kedua tabel ini -- semua
  -- perubahan HARUS lewat trigger (akrual otomatis) atau RPC
  -- tukar_poin() (SECURITY DEFINER), sama prinsipnya dengan
  -- dokumen_counter di 0001/0008.
end $$;

grant select on poin_pelanggan, riwayat_poin to authenticated;

-- ---------- Akrual otomatis saat faktur lunas / tarik balik saat dibatalkan ----------
create or replace function fn_akrual_poin_faktur()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_poin integer;
begin
  -- Faktur BARU LUNAS (belum lunas sebelumnya) -- beri poin.
  if new.status_bayar = 'lunas' and new.status <> 'dibatalkan'
     and (tg_op = 'INSERT' or old.status_bayar is distinct from 'lunas') then
    v_poin := floor(new.total / 10000)::integer;
    if v_poin > 0 then
      insert into riwayat_poin (pelanggan_id, perubahan, alasan, referensi_tipe, referensi_id)
      values (new.pelanggan_id, v_poin, 'Pembelian faktur ' || new.nomor, 'faktur_penjualan', new.id);

      insert into poin_pelanggan (pelanggan_id, saldo_poin)
      values (new.pelanggan_id, v_poin)
      on conflict (pelanggan_id) do update set saldo_poin = poin_pelanggan.saldo_poin + v_poin;
    end if;
  end if;

  -- Faktur yang SUDAH LUNAS dibatalkan -- tarik balik poin yang pernah diberikan untuk faktur ini.
  if tg_op = 'UPDATE' and new.status = 'dibatalkan' and old.status <> 'dibatalkan' then
    select coalesce(sum(perubahan), 0) into v_poin
    from riwayat_poin
    where referensi_tipe = 'faktur_penjualan' and referensi_id = new.id and perubahan > 0;

    if v_poin > 0 then
      insert into riwayat_poin (pelanggan_id, perubahan, alasan, referensi_tipe, referensi_id)
      values (new.pelanggan_id, -v_poin, 'Faktur ' || new.nomor || ' dibatalkan -- poin ditarik balik', 'faktur_penjualan', new.id);

      update poin_pelanggan set saldo_poin = greatest(0, saldo_poin - v_poin) where pelanggan_id = new.pelanggan_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_akrual_poin_faktur on faktur_penjualan;
create trigger trg_akrual_poin_faktur after insert or update on faktur_penjualan
  for each row execute function fn_akrual_poin_faktur();

-- ---------- Penukaran poin (manual, oleh staf) ----------
create or replace function tukar_poin(p_pelanggan_id uuid, p_jumlah integer, p_alasan text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_saldo integer;
begin
  if not boleh_sales() then
    raise exception 'Tidak punya izin menukar poin.';
  end if;
  if p_jumlah <= 0 then
    raise exception 'Jumlah poin harus lebih dari 0.';
  end if;

  select saldo_poin into v_saldo from poin_pelanggan where pelanggan_id = p_pelanggan_id for update;
  if v_saldo is null or v_saldo < p_jumlah then
    raise exception 'Saldo poin tidak cukup.';
  end if;

  insert into riwayat_poin (pelanggan_id, perubahan, alasan, dibuat_oleh)
  values (p_pelanggan_id, -p_jumlah, coalesce(nullif(trim(p_alasan), ''), 'Ditukar'), auth.uid());

  update poin_pelanggan set saldo_poin = saldo_poin - p_jumlah where pelanggan_id = p_pelanggan_id;
end;
$$;

grant execute on function tukar_poin(uuid, integer, text) to authenticated;
