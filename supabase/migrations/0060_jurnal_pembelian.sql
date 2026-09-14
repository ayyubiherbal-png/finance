-- =====================================================================
-- 0060  Posting Jurnal Umum -- Pembelian (4/5)
--
-- Penerimaan Barang (barang fisik masuk) dan Faktur Pembelian (tagihan
-- resmi dari supplier) adalah DUA peristiwa TERPISAH dalam siklus
-- procure-to-pay aplikasi ini (satu Faktur bisa mencakup beberapa PB,
-- via tabel `faktur_pembelian_pb`) -- persis seperti Surat Jalan
-- (barang keluar) terpisah dari Faktur Penjualan (tagihan) di 0059.
-- Supaya nilai persediaan TIDAK tercatat dua kali (sekali di PB, sekali
-- lagi di Faktur), dipakai akun perantara standar akuntansi:
-- 2-1050 "Utang Barang Belum Difaktur" (GR/IR clearing).
--   - Penerimaan Barang: Debit Persediaan / Kredit GR/IR clearing.
--   - Faktur Pembelian:  Debit GR/IR clearing (melunasi utang sementara
--     itu) + Debit Biaya Pengiriman/PPN Masukan / Kredit Utang Usaha.
-- Kalau nilai barang di Faktur PERSIS SAMA dengan yang di-PB (kasus
-- normal -- FakturPembelianForm.tsx menyalin harga bersih dari PB),
-- saldo akun GR/IR otomatis kembali nol setelah faktur turun.
--
-- Bagian E sisi beli: sama seperti 0059, Retur Pembelian yang selesai
-- kini ikut mengurangi sisa utang faktur terkait (dicari lewat
-- retur_pembelian.pb_id -> faktur_pembelian_pb -> faktur_id, karena
-- retur tidak tertaut faktur secara langsung).
-- =====================================================================

insert into akun_coa (kode, nama, tipe, saldo_normal) values
  ('2-1050', 'Utang Barang Belum Difaktur (GR/IR)', 'liabilitas', 'kredit');

-- ---------- Bagian E: rumus terbayar mencakup retur yang selesai ----------
create or replace function fn_hitung_ulang_terbayar_beli(p_faktur_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_faktur_id is null then return; end if;
  update faktur_pembelian f
  set terbayar = coalesce((
        select sum(a.jumlah)
        from pembayaran_supplier_alokasi a
        join pembayaran_supplier b on b.id = a.pembayaran_id
        where a.faktur_id = p_faktur_id and b.status not in ('dibatalkan','ditolak')
      ), 0)
      + coalesce((
        select sum(r.total)
        from retur_pembelian r
        join faktur_pembelian_pb fp on fp.pb_id = r.pb_id
        where fp.faktur_id = p_faktur_id and r.status = 'selesai'
      ), 0)
  where f.id = p_faktur_id;
end;
$$;

create or replace function fn_refresh_terbayar_beli()
returns trigger language plpgsql as $$
declare v_faktur uuid;
begin
  v_faktur := case when tg_op = 'DELETE' then old.faktur_id else new.faktur_id end;
  perform fn_hitung_ulang_terbayar_beli(v_faktur);
  return null;
end;
$$;

create or replace function fn_refresh_terbayar_beli_header()
returns trigger language plpgsql as $$
declare v_faktur uuid;
begin
  for v_faktur in select faktur_id from pembayaran_supplier_alokasi where pembayaran_id = new.id loop
    perform fn_hitung_ulang_terbayar_beli(v_faktur);
  end loop;
  return null;
end;
$$;

-- Pulihkan security definer + search_path (direset diam-diam oleh CREATE OR REPLACE).
alter function fn_refresh_terbayar_beli() security definer;
alter function fn_refresh_terbayar_beli() set search_path = public;
alter function fn_refresh_terbayar_beli_header() security definer;
alter function fn_refresh_terbayar_beli_header() set search_path = public;

-- Retur tidak tertaut faktur secara langsung -- dicari lewat pb_id.
create or replace function fn_refresh_terbayar_beli_dari_retur()
returns trigger language plpgsql as $$
declare v_faktur uuid;
begin
  if new.pb_id is null then return null; end if;
  if (new.status = 'selesai' and old.status is distinct from 'selesai')
     or (new.status = 'dibatalkan' and old.status = 'selesai') then
    for v_faktur in select faktur_id from faktur_pembelian_pb where pb_id = new.pb_id loop
      perform fn_hitung_ulang_terbayar_beli(v_faktur);
    end loop;
  end if;
  return null;
end;
$$;
create trigger trg_terbayar_beli_dari_retur after update of status on retur_pembelian
  for each row execute function fn_refresh_terbayar_beli_dari_retur();

-- ---------- Penerimaan Barang: Debit Persediaan, Kredit GR/IR clearing ----------
create or replace function fn_posting_penerimaan_barang()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r           record;
  v_hpp       numeric(18,4);
  v_total_nilai numeric(18,2);
begin
  if new.status = 'selesai' and old.status is distinct from 'selesai' then
    for r in select * from penerimaan_barang_item where pb_id = new.id loop
      v_hpp := case
        when r.qty_dasar > 0 then (r.qty * r.harga_satuan) / r.qty_dasar
        else 0
      end;

      update penerimaan_barang_item set hpp_satuan = round(v_hpp, 4) where id = r.id;

      insert into stok_mutasi (tanggal, produk_id, gudang_id, jenis, qty_dasar, hpp_satuan,
                               ref_tabel, ref_id, ref_nomor, dibuat_oleh)
      values (new.tanggal, r.produk_id, new.gudang_id, 'pembelian', r.qty_dasar, round(v_hpp, 4),
              'penerimaan_barang', new.id, new.nomor, new.dibuat_oleh);
    end loop;

    select coalesce(sum(qty_dasar * hpp_satuan), 0) into v_total_nilai
    from stok_mutasi where ref_tabel = 'penerimaan_barang' and ref_id = new.id and qty_dasar > 0;

    if v_total_nilai > 0 then
      perform fn_posting_jurnal(new.tanggal, 'penerimaan_barang', new.id, new.nomor,
        'Penerimaan Barang ' || new.nomor,
        jsonb_build_array(
          jsonb_build_object('akun_kode', '1-3000', 'debit', v_total_nilai, 'kredit', 0),
          jsonb_build_object('akun_kode', '2-1050', 'debit', 0, 'kredit', v_total_nilai)
        ));
    end if;

  elsif new.status = 'dibatalkan' and old.status = 'selesai' then
    insert into stok_mutasi (tanggal, produk_id, gudang_id, jenis, qty_dasar, hpp_satuan,
                             ref_tabel, ref_id, ref_nomor, catatan, dibuat_oleh)
    select current_date, m.produk_id, m.gudang_id, 'penyesuaian', -m.qty_dasar, m.hpp_satuan,
           'penerimaan_barang', new.id, new.nomor, 'Pembatalan ' || new.nomor, new.dibuat_oleh
    from stok_mutasi m
    where m.ref_tabel = 'penerimaan_barang' and m.ref_id = new.id and m.qty_dasar > 0;

    select coalesce(sum(qty_dasar * hpp_satuan), 0) into v_total_nilai
    from stok_mutasi where ref_tabel = 'penerimaan_barang' and ref_id = new.id and qty_dasar > 0;

    if v_total_nilai > 0 then
      perform fn_posting_jurnal(current_date, 'penerimaan_barang', new.id, new.nomor,
        'Pembatalan Penerimaan Barang ' || new.nomor,
        jsonb_build_array(
          jsonb_build_object('akun_kode', '2-1050', 'debit', v_total_nilai, 'kredit', 0),
          jsonb_build_object('akun_kode', '1-3000', 'debit', 0, 'kredit', v_total_nilai)
        ));
    end if;
  end if;
  return null;
end;
$$;

-- ---------- Faktur Pembelian: lunasi GR/IR clearing, tambah beban ongkir/PPN, kredit Utang Usaha ----------
-- Idempoten berbasis STATE, sama seperti fn_jurnal_faktur_penjualan (0059) --
-- lebih aman daripada menebak urutan draf/item/status, meski riset kode
-- FakturPembelianForm.tsx sejauh ini insert item SEBELUM status disetujui.
create or replace function fn_jurnal_faktur_pembelian()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_baris          jsonb;
  v_sudah_posting  boolean;
  v_sudah_reversal boolean;
  v_kode_ongkir    text;
  v_nilai_barang   numeric(18,2);
begin
  select exists(
    select 1 from jurnal_umum
    where ref_tabel = 'faktur_pembelian' and ref_id = new.id and keterangan not like 'Pembatalan%'
  ) into v_sudah_posting;

  v_nilai_barang := new.subtotal - new.diskon_header;

  if new.status = 'disetujui' and new.total > 0 and not v_sudah_posting then
    v_baris := '[]'::jsonb;
    if v_nilai_barang > 0 then
      v_baris := v_baris || jsonb_build_array(jsonb_build_object('akun_kode', '2-1050', 'debit', v_nilai_barang, 'kredit', 0));
    end if;
    if new.biaya_tambahan > 0 then
      select ak.kode into v_kode_ongkir
      from kategori_biaya kb join akun_coa ak on ak.id = kb.akun_coa_id
      where kb.kode = 'BOP-KIRIM';
      if v_kode_ongkir is not null then
        v_baris := v_baris || jsonb_build_array(jsonb_build_object('akun_kode', v_kode_ongkir, 'debit', new.biaya_tambahan, 'kredit', 0));
      end if;
    end if;
    if new.ppn_nilai > 0 then
      v_baris := v_baris || jsonb_build_array(jsonb_build_object('akun_kode', '1-1400', 'debit', new.ppn_nilai, 'kredit', 0));
    end if;
    v_baris := v_baris || jsonb_build_array(jsonb_build_object('akun_kode', '2-1000', 'debit', 0, 'kredit', new.total));
    if jsonb_array_length(v_baris) >= 2 then
      perform fn_posting_jurnal(new.tanggal, 'faktur_pembelian', new.id, new.nomor, 'Faktur Pembelian ' || new.nomor, v_baris);
    end if;

  elsif new.status = 'dibatalkan' and v_sudah_posting then
    select exists(
      select 1 from jurnal_umum
      where ref_tabel = 'faktur_pembelian' and ref_id = new.id and keterangan like 'Pembatalan%'
    ) into v_sudah_reversal;

    if not v_sudah_reversal then
      v_baris := '[]'::jsonb;
      if v_nilai_barang > 0 then
        v_baris := v_baris || jsonb_build_array(jsonb_build_object('akun_kode', '2-1050', 'debit', 0, 'kredit', v_nilai_barang));
      end if;
      if new.biaya_tambahan > 0 then
        select ak.kode into v_kode_ongkir
        from kategori_biaya kb join akun_coa ak on ak.id = kb.akun_coa_id
        where kb.kode = 'BOP-KIRIM';
        if v_kode_ongkir is not null then
          v_baris := v_baris || jsonb_build_array(jsonb_build_object('akun_kode', v_kode_ongkir, 'debit', 0, 'kredit', new.biaya_tambahan));
        end if;
      end if;
      if new.ppn_nilai > 0 then
        v_baris := v_baris || jsonb_build_array(jsonb_build_object('akun_kode', '1-1400', 'debit', 0, 'kredit', new.ppn_nilai));
      end if;
      v_baris := v_baris || jsonb_build_array(jsonb_build_object('akun_kode', '2-1000', 'debit', new.total, 'kredit', 0));
      if jsonb_array_length(v_baris) >= 2 then
        perform fn_posting_jurnal(current_date, 'faktur_pembelian', new.id, new.nomor, 'Pembatalan Faktur Pembelian ' || new.nomor, v_baris);
      end if;
    end if;
  end if;
  return null;
end;
$$;
create trigger trg_jurnal_faktur_pembelian after insert or update on faktur_pembelian
  for each row execute function fn_jurnal_faktur_pembelian();

-- ---------- Retur Pembelian: Debit Utang Usaha, Kredit Persediaan ----------
-- Dipakai SATU nilai (new.total) untuk kedua sisi -- retur_pembelian_item
-- sudah membawa harga pembelian aslinya, jadi tidak perlu re-derive dari
-- hpp_rata2 (yang bisa sedikit bergeser kalau ada pembelian lain di
-- antara waktu beli & retur) seperti di sisi jual.
create or replace function fn_posting_retur_beli()
returns trigger language plpgsql as $$
begin
  if new.status = 'selesai' and old.status is distinct from 'selesai' then
    insert into stok_mutasi (tanggal, produk_id, gudang_id, jenis, qty_dasar,
                             ref_tabel, ref_id, ref_nomor, dibuat_oleh)
    select new.tanggal, i.produk_id, new.gudang_id, 'retur_pembelian', -i.qty_dasar,
           'retur_pembelian', new.id, new.nomor, new.dibuat_oleh
    from retur_pembelian_item i
    where i.retur_id = new.id;

    if new.total > 0 then
      perform fn_posting_jurnal(new.tanggal, 'retur_pembelian', new.id, new.nomor,
        'Retur Pembelian ' || new.nomor,
        jsonb_build_array(
          jsonb_build_object('akun_kode', '2-1000', 'debit', new.total, 'kredit', 0),
          jsonb_build_object('akun_kode', '1-3000', 'debit', 0, 'kredit', new.total)
        ));
    end if;

  elsif new.status = 'dibatalkan' and old.status = 'selesai' then
    insert into stok_mutasi (tanggal, produk_id, gudang_id, jenis, qty_dasar, hpp_satuan,
                             ref_tabel, ref_id, ref_nomor, catatan, dibuat_oleh)
    select current_date, m.produk_id, m.gudang_id, 'penyesuaian', -m.qty_dasar, m.hpp_satuan,
           'retur_pembelian', new.id, new.nomor, 'Pembatalan ' || new.nomor, new.dibuat_oleh
    from stok_mutasi m
    where m.ref_tabel = 'retur_pembelian' and m.ref_id = new.id;

    if new.total > 0 then
      perform fn_posting_jurnal(current_date, 'retur_pembelian', new.id, new.nomor,
        'Pembatalan Retur Pembelian ' || new.nomor,
        jsonb_build_array(
          jsonb_build_object('akun_kode', '1-3000', 'debit', new.total, 'kredit', 0),
          jsonb_build_object('akun_kode', '2-1000', 'debit', 0, 'kredit', new.total)
        ));
    end if;
  end if;
  return null;
end;
$$;

-- Sama seperti 0059 -- pulihkan security definer + search_path.
alter function fn_posting_penerimaan_barang() security definer;
alter function fn_posting_penerimaan_barang() set search_path = public;
alter function fn_posting_retur_beli() security definer;
alter function fn_posting_retur_beli() set search_path = public;
