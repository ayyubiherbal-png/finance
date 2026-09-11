-- P0: rekonsiliasi pencairan marketplace. Faktur dilunasi sebesar omzet
-- bruto, potongan platform dicatat sebagai beban, sehingga kenaikan bank
-- tepat sebesar dana netto yang benar-benar diterima.
create table if not exists settlement_marketplace (
  id                         uuid primary key default gen_random_uuid(),
  kanal                      kanal_penjualan not null check (kanal in ('shopee','tiktok','tokopedia','lainnya')),
  nomor_settlement_platform  text not null,
  tanggal                    date not null default current_date,
  akun_id                    uuid not null references akun_kas_bank(id) on delete restrict,
  bruto                      numeric(18,2) not null check (bruto > 0),
  fee_platform               numeric(18,2) not null default 0 check (fee_platform >= 0),
  voucher_toko               numeric(18,2) not null default 0 check (voucher_toko >= 0),
  ongkir_dipotong            numeric(18,2) not null default 0 check (ongkir_dipotong >= 0),
  refund                     numeric(18,2) not null default 0 check (refund >= 0),
  netto                      numeric(18,2) generated always as (bruto - fee_platform - voucher_toko - ongkir_dipotong - refund) stored,
  status                     status_dokumen not null default 'disetujui',
  pengeluaran_id             uuid references pengeluaran_kas(id) on delete restrict,
  catatan                    text,
  dibuat_oleh                uuid references profil(id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (kanal, nomor_settlement_platform),
  check (bruto >= fee_platform + voucher_toko + ongkir_dipotong + refund)
);

create table if not exists settlement_marketplace_item (
  id              uuid primary key default gen_random_uuid(),
  settlement_id   uuid not null references settlement_marketplace(id) on delete cascade,
  pesanan_id      uuid not null references pesanan_marketplace_impor(id) on delete restrict,
  faktur_id       uuid not null references faktur_penjualan(id) on delete restrict,
  penerimaan_id   uuid not null references penerimaan_kas(id) on delete restrict,
  bruto           numeric(18,2) not null check (bruto > 0),
  unique (settlement_id, pesanan_id)
);

create index if not exists idx_settlement_tanggal on settlement_marketplace(tanggal desc);
create index if not exists idx_settlement_item_header on settlement_marketplace_item(settlement_id);
drop trigger if exists trg_settlement_updated on settlement_marketplace;
create trigger trg_settlement_updated before update on settlement_marketplace for each row execute function set_updated_at();

alter table settlement_marketplace enable row level security;
alter table settlement_marketplace_item enable row level security;
drop policy if exists baca on settlement_marketplace;
drop policy if exists baca on settlement_marketplace_item;
create policy baca on settlement_marketplace for select to authenticated using (boleh_finance());
create policy baca on settlement_marketplace_item for select to authenticated using (boleh_finance());
grant select on settlement_marketplace, settlement_marketplace_item to authenticated;

-- Akun biaya khusus potongan marketplace. Ongkir pembelian tetap memakai
-- BOP-KIRIM-01; ongkir yang dipotong marketplace adalah biaya penjualan.
insert into kategori_biaya(kode, nama) values ('MKT', 'Biaya Marketplace')
on conflict (kode) do nothing;
insert into nama_pengeluaran(kategori_biaya_id, kode, nama)
select id, 'MKT-POT-01', 'Potongan Marketplace' from kategori_biaya where kode = 'MKT'
on conflict (kode) do nothing;

create or replace function posting_settlement_marketplace(
  p_kanal kanal_penjualan,
  p_nomor text,
  p_tanggal date,
  p_akun_id uuid,
  p_fee numeric,
  p_voucher numeric,
  p_ongkir numeric,
  p_refund numeric,
  p_items jsonb,
  p_catatan text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settlement uuid;
  v_pengeluaran uuid;
  v_pengguna uuid := auth.uid();
  v_bruto numeric(18,2);
  v_potongan numeric(18,2);
  v_item jsonb;
  v_pesanan pesanan_marketplace_impor%rowtype;
  v_faktur faktur_penjualan%rowtype;
  v_penerimaan uuid;
  v_nama_pengeluaran uuid;
begin
  if not boleh_finance() then raise exception 'Anda tidak berhak memposting settlement marketplace'; end if;
  if p_kanal not in ('shopee','tiktok','tokopedia','lainnya') then raise exception 'Kanal marketplace tidak valid'; end if;
  if nullif(trim(p_nomor), '') is null then raise exception 'Nomor settlement wajib diisi'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Pilih minimal satu pesanan'; end if;

  select coalesce(sum((x->>'bruto')::numeric), 0) into v_bruto from jsonb_array_elements(p_items) x;
  v_potongan := coalesce(p_fee,0) + coalesce(p_voucher,0) + coalesce(p_ongkir,0) + coalesce(p_refund,0);
  if v_bruto <= 0 or v_potongan < 0 or v_potongan > v_bruto then raise exception 'Nilai bruto/potongan tidak valid'; end if;

  insert into settlement_marketplace(kanal, nomor_settlement_platform, tanggal, akun_id, bruto,
    fee_platform, voucher_toko, ongkir_dipotong, refund, catatan, dibuat_oleh)
  values(p_kanal, trim(p_nomor), p_tanggal, p_akun_id, v_bruto,
    coalesce(p_fee,0), coalesce(p_voucher,0), coalesce(p_ongkir,0), coalesce(p_refund,0), p_catatan, v_pengguna)
  returning id into v_settlement;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into strict v_pesanan from pesanan_marketplace_impor where id = (v_item->>'pesanan_id')::uuid for update;
    if v_pesanan.kanal <> p_kanal then raise exception 'Kanal pesanan % tidak sesuai', v_pesanan.nomor_pesanan_platform; end if;
    if exists(select 1 from settlement_marketplace_item where pesanan_id = v_pesanan.id) then raise exception 'Pesanan % sudah pernah direkonsiliasi', v_pesanan.nomor_pesanan_platform; end if;
    select * into strict v_faktur from faktur_penjualan where id = v_pesanan.faktur_id for update;
    if (v_item->>'bruto')::numeric > v_faktur.total - v_faktur.terbayar then
      raise exception 'Bruto pesanan % melebihi sisa faktur', v_pesanan.nomor_pesanan_platform;
    end if;

    insert into penerimaan_kas(tanggal, pelanggan_id, akun_id, metode, nomor_referensi, jumlah, status, catatan, dibuat_oleh)
    values(p_tanggal, v_faktur.pelanggan_id, p_akun_id, 'transfer', trim(p_nomor), (v_item->>'bruto')::numeric,
      'disetujui', 'Settlement ' || p_kanal::text || ' ' || trim(p_nomor), v_pengguna)
    returning id into v_penerimaan;
    insert into penerimaan_kas_alokasi(penerimaan_id, faktur_id, jumlah)
    values(v_penerimaan, v_faktur.id, (v_item->>'bruto')::numeric);
    insert into settlement_marketplace_item(settlement_id, pesanan_id, faktur_id, penerimaan_id, bruto)
    values(v_settlement, v_pesanan.id, v_faktur.id, v_penerimaan, (v_item->>'bruto')::numeric);
  end loop;

  if v_potongan > 0 then
    select id into strict v_nama_pengeluaran from nama_pengeluaran where kode = 'MKT-POT-01';
    insert into pengeluaran_kas(tanggal, nama_pengeluaran_id, akun_id, metode, nomor_referensi, jumlah, status, catatan, dibuat_oleh)
    values(p_tanggal, v_nama_pengeluaran, p_akun_id, 'transfer', trim(p_nomor), v_potongan, 'disetujui',
      concat_ws('; ', 'Potongan settlement ' || p_kanal::text, 'Fee ' || coalesce(p_fee,0), 'Voucher ' || coalesce(p_voucher,0), 'Ongkir ' || coalesce(p_ongkir,0), 'Refund ' || coalesce(p_refund,0)), v_pengguna)
    returning id into v_pengeluaran;
    update settlement_marketplace set pengeluaran_id = v_pengeluaran where id = v_settlement;
  end if;
  return v_settlement;
end;
$$;

create or replace function batalkan_settlement_marketplace(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v settlement_marketplace%rowtype;
begin
  if not boleh_finance() then raise exception 'Anda tidak berhak membatalkan settlement marketplace'; end if;
  select * into strict v from settlement_marketplace where id = p_id for update;
  if v.status = 'dibatalkan' then return; end if;
  update penerimaan_kas set status = 'dibatalkan' where id in (select penerimaan_id from settlement_marketplace_item where settlement_id = p_id);
  if v.pengeluaran_id is not null then update pengeluaran_kas set status = 'dibatalkan' where id = v.pengeluaran_id; end if;
  -- Bebaskan pesanan agar settlement yang salah bisa dikoreksi dan diposting ulang.
  -- Header, penerimaan, pengeluaran, dan audit log tetap menyimpan jejak pembatalannya.
  delete from settlement_marketplace_item where settlement_id = p_id;
  update settlement_marketplace set status = 'dibatalkan' where id = p_id;
end;
$$;

revoke all on function posting_settlement_marketplace(kanal_penjualan,text,date,uuid,numeric,numeric,numeric,numeric,jsonb,text) from public;
revoke all on function batalkan_settlement_marketplace(uuid) from public;
grant execute on function posting_settlement_marketplace(kanal_penjualan,text,date,uuid,numeric,numeric,numeric,numeric,jsonb,text) to authenticated;
grant execute on function batalkan_settlement_marketplace(uuid) to authenticated;

drop trigger if exists trg_audit_settlement_marketplace on settlement_marketplace;
create trigger trg_audit_settlement_marketplace after insert or update or delete on settlement_marketplace for each row execute function fn_catat_audit();
drop trigger if exists trg_audit_settlement_marketplace_item on settlement_marketplace_item;
create trigger trg_audit_settlement_marketplace_item after insert or update or delete on settlement_marketplace_item for each row execute function fn_catat_audit();
