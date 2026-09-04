-- =====================================================================
-- 0008  Row Level Security
--
--  Model hak akses:
--    owner   : semua
--    admin   : semua kecuali kelola pengguna
--    sales   : master pelanggan + dokumen penjualan
--    gudang  : dokumen barang keluar/masuk + penyesuaian + transfer
--    finance : faktur, pembayaran, penerimaan kas
--
--  Tabel `stok` dan `stok_mutasi` sengaja TIDAK punya policy tulis.
--  Keduanya hanya boleh diisi lewat trigger SECURITY DEFINER di 0006,
--  supaya saldo persediaan mustahil dimanipulasi dari sisi klien.
-- =====================================================================

-- ---------- Fungsi bantu ----------
create or replace function peran_saya()
returns peran_pengguna language sql stable security definer set search_path = public as $$
  select peran from profil where id = auth.uid() and aktif;
$$;

create or replace function user_aktif()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profil where id = auth.uid() and aktif);
$$;

create or replace function is_admin()
returns boolean language sql stable as $$
  select peran_saya() in ('owner','admin');
$$;

create or replace function is_owner()
returns boolean language sql stable as $$
  select peran_saya() = 'owner';
$$;

create or replace function boleh_sales()
returns boolean language sql stable as $$
  select peran_saya() in ('owner','admin','sales');
$$;

create or replace function boleh_gudang()
returns boolean language sql stable as $$
  select peran_saya() in ('owner','admin','gudang');
$$;

create or replace function boleh_finance()
returns boolean language sql stable as $$
  select peran_saya() in ('owner','admin','finance');
$$;

-- ---------- Trigger dan fungsi yang harus menembus RLS ----------
alter function generate_nomor(text, date)          security definer;
alter function fn_mutasi_sebelum()                 security definer;
alter function fn_mutasi_sesudah()                 security definer;
alter function fn_posting_surat_jalan()            security definer;
alter function fn_posting_penerimaan_barang()      security definer;
alter function fn_posting_penyesuaian()            security definer;
alter function fn_posting_transfer()               security definer;
alter function fn_posting_retur_jual()             security definer;
alter function fn_posting_retur_beli()             security definer;
alter function fn_subtotal_so()                    security definer;
alter function fn_subtotal_fp()                    security definer;
alter function fn_subtotal_po()                    security definer;
alter function fn_subtotal_fb()                    security definer;
alter function fn_total_retur_jual()               security definer;
alter function fn_total_retur_beli()               security definer;
alter function refresh_status_so(uuid)             security definer;
alter function refresh_status_po(uuid)             security definer;
alter function fn_sinkron_so()                     security definer;
alter function fn_sinkron_so_dari_sj()             security definer;
alter function fn_sinkron_po()                     security definer;
alter function fn_sinkron_po_dari_pb()             security definer;
alter function fn_refresh_terbayar_jual()          security definer;
alter function fn_refresh_terbayar_jual_header()   security definer;
alter function fn_refresh_terbayar_beli()          security definer;
alter function fn_refresh_terbayar_beli_header()   security definer;
alter function fn_cek_limit_kredit()               security definer;
alter function fn_snapshot_hpp_faktur()            security definer;

-- Kunci search_path pada fungsi SECURITY DEFINER (praktik wajib Postgres).
do $$
declare f text;
begin
  foreach f in array array[
    'generate_nomor(text, date)', 'fn_mutasi_sebelum()', 'fn_mutasi_sesudah()',
    'fn_posting_surat_jalan()', 'fn_posting_penerimaan_barang()', 'fn_posting_penyesuaian()',
    'fn_posting_transfer()', 'fn_posting_retur_jual()', 'fn_posting_retur_beli()',
    'fn_subtotal_so()', 'fn_subtotal_fp()', 'fn_subtotal_po()', 'fn_subtotal_fb()',
    'fn_total_retur_jual()', 'fn_total_retur_beli()',
    'refresh_status_so(uuid)', 'refresh_status_po(uuid)',
    'fn_sinkron_so()', 'fn_sinkron_so_dari_sj()', 'fn_sinkron_po()', 'fn_sinkron_po_dari_pb()',
    'fn_refresh_terbayar_jual()', 'fn_refresh_terbayar_jual_header()', 'fn_refresh_terbayar_beli()',
    'fn_refresh_terbayar_beli_header()',
    'fn_cek_limit_kredit()', 'fn_snapshot_hpp_faktur()'
  ] loop
    execute format('alter function %s set search_path = public', f);
  end loop;
end $$;

-- ---------- Aktifkan RLS di semua tabel ----------
do $$
declare t text;
begin
  foreach t in array array[
    'profil','gudang','kategori_produk','satuan','produk','produk_satuan',
    'tier_harga','produk_harga','pelanggan','supplier',
    'stok','stok_mutasi','penyesuaian_stok','penyesuaian_stok_item',
    'transfer_gudang','transfer_gudang_item',
    'sales_order','sales_order_item','surat_jalan','surat_jalan_item',
    'faktur_penjualan','faktur_penjualan_item','faktur_penjualan_sj',
    'penerimaan_kas','penerimaan_kas_alokasi','retur_penjualan','retur_penjualan_item',
    'purchase_order','purchase_order_item','penerimaan_barang','penerimaan_barang_item',
    'faktur_pembelian','faktur_pembelian_item','faktur_pembelian_pb',
    'pembayaran_supplier','pembayaran_supplier_alokasi',
    'retur_pembelian','retur_pembelian_item','dokumen_counter'
  ] loop
    execute format('alter table %I enable row level security', t);
    -- Semua pengguna aktif boleh membaca. Pembatasan per peran ada di sisi tulis.
    execute format(
      'create policy baca on %I for select to authenticated using (user_aktif())', t);
  end loop;
end $$;

-- ---------- Policy tulis per kelompok tabel ----------
do $$
declare
  t text;
  grup record;
begin
  for grup in
    select * from (values
      -- master data: hanya admin/owner
      ('is_admin()', array[
        'gudang','kategori_produk','satuan','produk','produk_satuan',
        'tier_harga','produk_harga','supplier']),
      -- master pelanggan: sales boleh menambah/ubah
      ('boleh_sales()', array['pelanggan']),
      -- dokumen penjualan
      ('boleh_sales()', array[
        'sales_order','sales_order_item','retur_penjualan','retur_penjualan_item']),
      -- dokumen gudang
      ('boleh_gudang()', array[
        'surat_jalan','surat_jalan_item','penerimaan_barang','penerimaan_barang_item',
        'penyesuaian_stok','penyesuaian_stok_item','transfer_gudang','transfer_gudang_item',
        'retur_pembelian','retur_pembelian_item']),
      -- dokumen keuangan
      ('boleh_finance()', array[
        'faktur_penjualan','faktur_penjualan_item','faktur_penjualan_sj',
        'penerimaan_kas','penerimaan_kas_alokasi',
        'faktur_pembelian','faktur_pembelian_item','faktur_pembelian_pb',
        'pembayaran_supplier','pembayaran_supplier_alokasi']),
      -- pengadaan
      ('is_admin()', array['purchase_order','purchase_order_item'])
    ) as g(cek, tabel)
  loop
    foreach t in array grup.tabel loop
      execute format(
        'create policy tulis on %I for insert to authenticated with check (%s)', t, grup.cek);
      execute format(
        'create policy ubah on %I for update to authenticated using (%s) with check (%s)',
        t, grup.cek, grup.cek);
      execute format(
        'create policy hapus on %I for delete to authenticated using (%s)', t, grup.cek);
    end loop;
  end loop;
end $$;

-- ---------- Profil (pengguna) ----------
-- Setiap orang boleh mengubah data dirinya sendiri kecuali kolom peran;
-- perubahan peran dan penonaktifan akun hanya oleh owner.
-- peran_saya() dipakai (bukan subquery ke profil) supaya policy tidak
-- memanggil dirinya sendiri dan memicu infinite recursion.
create policy profil_ubah_sendiri on profil
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and peran = peran_saya());

create policy profil_kelola_owner on profil
  for all to authenticated
  using (is_owner()) with check (is_owner());

-- ---------- Penomoran dokumen ----------
-- Tidak ada policy tulis: hanya generate_nomor() (SECURITY DEFINER) yang mengisi.

-- ---------- Grant tabel (RLS tetap menjadi penjaga sebenarnya) ----------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------- Hak akses view laporan ----------
grant select on
  v_stok_produk, v_stok_gudang, v_kartu_stok,
  v_piutang, v_piutang_aging, v_hutang, v_hutang_aging, v_limit_kredit,
  v_laba_baris, v_laba_produk, v_laba_pelanggan, v_penjualan_harian
to authenticated;

grant execute on function
  harga_produk(uuid, uuid, uuid, numeric, date),
  piutang_pelanggan(uuid),
  peran_saya(), user_aktif(), is_admin(), is_owner(),
  boleh_sales(), boleh_gudang(), boleh_finance()
to authenticated;
