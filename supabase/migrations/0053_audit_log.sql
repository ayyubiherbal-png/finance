-- P0: jejak perubahan untuk data bisnis penting. Ditulis hanya oleh trigger;
-- klien tidak mendapat izin INSERT/UPDATE/DELETE agar riwayat tidak dapat dipalsukan.
create table audit_log (
  id              bigint generated always as identity primary key,
  tabel           text not null,
  record_id       text,
  aksi            text not null check (aksi in ('insert', 'update', 'delete')),
  data_lama       jsonb,
  data_baru       jsonb,
  dilakukan_oleh  uuid references profil(id) on delete set null,
  dilakukan_pada timestamptz not null default now()
);

create index idx_audit_log_waktu on audit_log(dilakukan_pada desc);
create index idx_audit_log_record on audit_log(tabel, record_id, dilakukan_pada desc);

create or replace function fn_catat_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lama jsonb;
  baru jsonb;
begin
  lama := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  baru := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;

  -- Abaikan UPDATE tanpa perubahan data bisnis (mis. trigger menyentuh timestamp saja).
  if tg_op = 'UPDATE' and (lama - 'updated_at') = (baru - 'updated_at') then
    return new;
  end if;

  insert into audit_log(tabel, record_id, aksi, data_lama, data_baru, dilakukan_oleh)
  values (
    tg_table_name,
    coalesce(baru ->> 'id', lama ->> 'id'),
    lower(tg_op),
    lama,
    baru,
    auth.uid()
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare nama_tabel text;
begin
  foreach nama_tabel in array array[
    'produk','produk_satuan','produk_harga','pelanggan','supplier','gudang',
    'sales_order','surat_jalan','faktur_penjualan','penerimaan_kas','retur_penjualan',
    'purchase_order','penerimaan_barang','faktur_pembelian','pembayaran_supplier','retur_pembelian',
    'penyesuaian_stok','akun_kas_bank','pengeluaran_kas','kategori_produk','kategori_biaya',
    'nama_pengeluaran','pesanan_marketplace_impor'
  ] loop
    if to_regclass('public.' || nama_tabel) is not null then
      execute format('create trigger trg_audit_%I after insert or update or delete on %I for each row execute function fn_catat_audit()', nama_tabel, nama_tabel);
    end if;
  end loop;
end $$;

alter table audit_log enable row level security;
create policy baca_audit on audit_log for select to authenticated using (is_admin());
grant select on audit_log to authenticated;
grant usage, select on sequence audit_log_id_seq to authenticated;

