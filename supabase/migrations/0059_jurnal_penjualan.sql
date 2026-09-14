-- =====================================================================
-- 0059  Posting Jurnal Umum -- Penjualan (3/5)
--
-- Faktur Penjualan (piutang+pendapatan), Surat Jalan (HPP saat barang
-- keluar), Retur Penjualan (kontra-pendapatan+kembalikan/kerugian
-- persediaan). Semua fungsi yang sudah ada di-CREATE OR REPLACE dengan
-- logika ASLI dipertahankan persis -- cuma ditambah panggilan jurnal
-- di titik yang sama.
--
-- Bagian E (disetujui user): perbaikan celah lama -- Retur Penjualan
-- yang selesai TIDAK PERNAH mengurangi faktur_penjualan.sisa (cuma
-- dinetralkan di view laporan). Diperbaiki dengan mengubah RUMUS
-- terbayar jadi (alokasi pembayaran + retur yang selesai), bukan
-- nge-update terbayar langsung -- supaya tidak ketiban timpa oleh
-- fn_refresh_terbayar_jual yang menghitung ulang dari nol tiap kali
-- ada pembayaran baru. Untuk faktur yang tidak pernah ada retur,
-- rumus ini menghasilkan angka PERSIS SAMA seperti sebelumnya (retur
-- sum = 0) -- nol risiko ke faktur yang tidak tersentuh retur.
-- =====================================================================

-- ---------- Bagian E: rumus terbayar mencakup retur yang selesai ----------
create or replace function fn_hitung_ulang_terbayar_jual(p_faktur_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_faktur_id is null then return; end if;
  update faktur_penjualan f
  set terbayar = coalesce((
        select sum(a.jumlah)
        from penerimaan_kas_alokasi a
        join penerimaan_kas k on k.id = a.penerimaan_id
        where a.faktur_id = p_faktur_id and k.status not in ('dibatalkan','ditolak')
      ), 0)
      + coalesce((
        select sum(r.total)
        from retur_penjualan r
        where r.faktur_id = p_faktur_id and r.status = 'selesai'
      ), 0)
  where f.id = p_faktur_id;
end;
$$;

create or replace function fn_refresh_terbayar_jual()
returns trigger language plpgsql as $$
declare v_faktur uuid;
begin
  v_faktur := case when tg_op = 'DELETE' then old.faktur_id else new.faktur_id end;
  perform fn_hitung_ulang_terbayar_jual(v_faktur);
  return null;
end;
$$;

create or replace function fn_refresh_terbayar_jual_header()
returns trigger language plpgsql as $$
declare v_faktur uuid;
begin
  for v_faktur in select faktur_id from penerimaan_kas_alokasi where penerimaan_id = new.id loop
    perform fn_hitung_ulang_terbayar_jual(v_faktur);
  end loop;
  return null;
end;
$$;

-- Pulihkan security definer + search_path (lihat catatan di fn_posting_surat_jalan
-- di bawah -- CREATE OR REPLACE mereset keduanya kalau tidak disebut ulang).
alter function fn_refresh_terbayar_jual() security definer;
alter function fn_refresh_terbayar_jual() set search_path = public;
alter function fn_refresh_terbayar_jual_header() security definer;
alter function fn_refresh_terbayar_jual_header() set search_path = public;

-- Retur tidak memicu dua trigger di atas (keduanya cuma memantau
-- penerimaan_kas/alokasinya) -- trigger baru ini yang menutup celahnya.
create or replace function fn_refresh_terbayar_jual_dari_retur()
returns trigger language plpgsql as $$
begin
  if (new.status = 'selesai' and old.status is distinct from 'selesai')
     or (new.status = 'dibatalkan' and old.status = 'selesai') then
    perform fn_hitung_ulang_terbayar_jual(new.faktur_id);
  end if;
  return null;
end;
$$;
create trigger trg_terbayar_jual_dari_retur after update of status on retur_penjualan
  for each row execute function fn_refresh_terbayar_jual_dari_retur();

alter function fn_hitung_ulang_terbayar_jual(uuid) set search_path = public;

-- ---------- Faktur Penjualan: Debit Piutang Usaha, Kredit Penjualan (+PPN Keluaran) ----------
-- Ditemukan lewat pengujian penjualan_cepat() sungguhan: RPC itu INSERT
-- faktur_penjualan dengan status='disetujui' TAPI total=0 (item belum ada),
-- baru SETELAHNYA insert faktur_penjualan_item -- yang memicu fn_subtotal_fp()
-- meng-UPDATE subtotal/total lewat trigger, TANPA menyentuh kolom status sama
-- sekali. Trigger "after update of status" saja tidak pernah melihat momen
-- total yang benar. FakturPenjualanForm.tsx (manual) sebaliknya sudah insert
-- draf dengan item lengkap lalu baru update status -- total sudah benar sejak
-- awal.
--
-- Supaya benar untuk KEDUA jalur tanpa menebak-nebak urutan mana yang
-- terjadi, logikanya dibuat IDEMPOTEN berbasis STATE (bukan transisi):
-- posting terjadi persis sekali begitu (status='disetujui' dan total>0)
-- pertama kali benar, dicek lewat "belum pernah ada jurnal untuk faktur
-- ini" -- bukan lewat mendeteksi kapan tepatnya perubahan terjadi.
create or replace function fn_jurnal_faktur_penjualan()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_baris          jsonb;
  v_sudah_posting  boolean;
  v_sudah_reversal boolean;
begin
  select exists(
    select 1 from jurnal_umum
    where ref_tabel = 'faktur_penjualan' and ref_id = new.id and keterangan not like 'Pembatalan%'
  ) into v_sudah_posting;

  if new.status = 'disetujui' and new.total > 0 and not v_sudah_posting then
    v_baris := jsonb_build_array(jsonb_build_object('akun_kode', '1-2000', 'debit', new.total, 'kredit', 0));
    if new.dpp > 0 then
      v_baris := v_baris || jsonb_build_array(jsonb_build_object('akun_kode', '4-1000', 'debit', 0, 'kredit', new.dpp));
    end if;
    if new.ppn_nilai > 0 then
      v_baris := v_baris || jsonb_build_array(jsonb_build_object('akun_kode', '2-1100', 'debit', 0, 'kredit', new.ppn_nilai));
    end if;
    if jsonb_array_length(v_baris) >= 2 then
      perform fn_posting_jurnal(new.tanggal, 'faktur_penjualan', new.id, new.nomor, 'Faktur Penjualan ' || new.nomor, v_baris);
    end if;

  elsif new.status = 'dibatalkan' and v_sudah_posting then
    select exists(
      select 1 from jurnal_umum
      where ref_tabel = 'faktur_penjualan' and ref_id = new.id and keterangan like 'Pembatalan%'
    ) into v_sudah_reversal;

    if not v_sudah_reversal then
      v_baris := jsonb_build_array(jsonb_build_object('akun_kode', '1-2000', 'debit', 0, 'kredit', new.total));
      if new.dpp > 0 then
        v_baris := v_baris || jsonb_build_array(jsonb_build_object('akun_kode', '4-1000', 'debit', new.dpp, 'kredit', 0));
      end if;
      if new.ppn_nilai > 0 then
        v_baris := v_baris || jsonb_build_array(jsonb_build_object('akun_kode', '2-1100', 'debit', new.ppn_nilai, 'kredit', 0));
      end if;
      if jsonb_array_length(v_baris) >= 2 then
        perform fn_posting_jurnal(current_date, 'faktur_penjualan', new.id, new.nomor, 'Pembatalan Faktur Penjualan ' || new.nomor, v_baris);
      end if;
    end if;
  end if;
  return null;
end;
$$;
create trigger trg_jurnal_faktur_penjualan after insert or update on faktur_penjualan
  for each row execute function fn_jurnal_faktur_penjualan();

-- ---------- Surat Jalan: tambah jurnal HPP di titik posting stok yang sama ----------
create or replace function fn_posting_surat_jalan()
returns trigger language plpgsql as $$
declare
  v_total_hpp numeric(18,2);
begin
  if new.status = 'selesai' and old.status is distinct from 'selesai' then
    insert into stok_mutasi (tanggal, produk_id, gudang_id, jenis, qty_dasar,
                             ref_tabel, ref_id, ref_nomor, dibuat_oleh)
    select new.tanggal, i.produk_id, new.gudang_id, 'penjualan', -i.qty_dasar,
           'surat_jalan', new.id, new.nomor, new.dibuat_oleh
    from surat_jalan_item i
    where i.sj_id = new.id;

    select coalesce(sum(-qty_dasar * hpp_satuan), 0) into v_total_hpp
    from stok_mutasi where ref_tabel = 'surat_jalan' and ref_id = new.id and qty_dasar < 0;

    if v_total_hpp > 0 then
      perform fn_posting_jurnal(new.tanggal, 'surat_jalan', new.id, new.nomor,
        'HPP Surat Jalan ' || new.nomor,
        jsonb_build_array(
          jsonb_build_object('akun_kode', '5-1000', 'debit', v_total_hpp, 'kredit', 0),
          jsonb_build_object('akun_kode', '1-3000', 'debit', 0, 'kredit', v_total_hpp)
        ));
    end if;

  elsif new.status = 'dibatalkan' and old.status = 'selesai' then
    insert into stok_mutasi (tanggal, produk_id, gudang_id, jenis, qty_dasar, hpp_satuan,
                             ref_tabel, ref_id, ref_nomor, catatan, dibuat_oleh)
    select current_date, m.produk_id, m.gudang_id, 'penyesuaian', -m.qty_dasar, m.hpp_satuan,
           'surat_jalan', new.id, new.nomor, 'Pembatalan ' || new.nomor, new.dibuat_oleh
    from stok_mutasi m
    where m.ref_tabel = 'surat_jalan' and m.ref_id = new.id and m.qty_dasar < 0;

    select coalesce(sum(-qty_dasar * hpp_satuan), 0) into v_total_hpp
    from stok_mutasi where ref_tabel = 'surat_jalan' and ref_id = new.id and qty_dasar < 0;

    if v_total_hpp > 0 then
      perform fn_posting_jurnal(current_date, 'surat_jalan', new.id, new.nomor,
        'Pembatalan HPP Surat Jalan ' || new.nomor,
        jsonb_build_array(
          jsonb_build_object('akun_kode', '1-3000', 'debit', v_total_hpp, 'kredit', 0),
          jsonb_build_object('akun_kode', '5-1000', 'debit', 0, 'kredit', v_total_hpp)
        ));
    end if;
  end if;
  return null;
end;
$$;

-- PENTING: CREATE OR REPLACE FUNCTION mereset SECURITY DEFINER dan SET
-- search_path ke default kalau tidak disebut ulang di statement barunya --
-- fungsi ini aslinya dijadikan security definer lewat ALTER terpisah di
-- 0008_rls.sql (supaya bisa menembus RLS stok_mutasi yang memang tanpa
-- policy tulis untuk klien). Wajib dipulihkan di sini, atau posting Surat
-- Jalan akan diam-diam gagal kena RLS untuk semua pengguna biasa.
alter function fn_posting_surat_jalan() security definer;
alter function fn_posting_surat_jalan() set search_path = public;

-- ---------- Retur Penjualan: kontra-pendapatan + kembalikan/kerugian persediaan ----------
-- masuk_stok=true  -> barang kembali ke rak: Persediaan naik, HPP turun (dibalik).
-- masuk_stok=false -> barang rusak/dimusnahkan: TIDAK menambah Persediaan,
--                     nilainya diakui sebagai Kerugian Persediaan (6-9000).
-- Penjualan & Piutang Usaha SELALU dibalik di kedua kasus -- pelanggan
-- tetap tidak lagi berutang untuk barang yang diretur, terlepas apakah
-- barangnya bisa dijual lagi atau tidak.
create or replace function fn_posting_retur_jual()
returns trigger language plpgsql as $$
declare
  v_total_hpp numeric(18,2);
  v_baris     jsonb := '[]'::jsonb;
begin
  if new.status = 'selesai' and old.status is distinct from 'selesai' and new.masuk_stok then
    insert into stok_mutasi (tanggal, produk_id, gudang_id, jenis, qty_dasar, hpp_satuan,
                             ref_tabel, ref_id, ref_nomor, dibuat_oleh)
    select new.tanggal, i.produk_id, new.gudang_id, 'retur_penjualan', i.qty_dasar,
           p.hpp_rata2, 'retur_penjualan', new.id, new.nomor, new.dibuat_oleh
    from retur_penjualan_item i
    join produk p on p.id = i.produk_id
    where i.retur_id = new.id;

  elsif new.status = 'dibatalkan' and old.status = 'selesai' then
    insert into stok_mutasi (tanggal, produk_id, gudang_id, jenis, qty_dasar, hpp_satuan,
                             ref_tabel, ref_id, ref_nomor, catatan, dibuat_oleh)
    select current_date, m.produk_id, m.gudang_id, 'penyesuaian', -m.qty_dasar, m.hpp_satuan,
           'retur_penjualan', new.id, new.nomor, 'Pembatalan ' || new.nomor, new.dibuat_oleh
    from stok_mutasi m
    where m.ref_tabel = 'retur_penjualan' and m.ref_id = new.id;
  end if;

  -- Jurnal: dihitung dari item retur langsung (bukan stok_mutasi), supaya
  -- berlaku sama untuk masuk_stok=true MAUPUN false (yang terakhir tidak
  -- pernah insert stok_mutasi sama sekali).
  if new.status = 'selesai' and old.status is distinct from 'selesai' then
    select coalesce(sum(i.qty_dasar * p.hpp_rata2), 0) into v_total_hpp
    from retur_penjualan_item i join produk p on p.id = i.produk_id
    where i.retur_id = new.id;

    if new.total > 0 then
      v_baris := v_baris || jsonb_build_array(
        jsonb_build_object('akun_kode', '4-2000', 'debit', new.total, 'kredit', 0),
        jsonb_build_object('akun_kode', '1-2000', 'debit', 0, 'kredit', new.total)
      );
    end if;
    if v_total_hpp > 0 then
      v_baris := v_baris || jsonb_build_array(
        jsonb_build_object('akun_kode', case when new.masuk_stok then '1-3000' else '6-9000' end, 'debit', v_total_hpp, 'kredit', 0),
        jsonb_build_object('akun_kode', '5-1000', 'debit', 0, 'kredit', v_total_hpp)
      );
    end if;
    if jsonb_array_length(v_baris) >= 2 then
      perform fn_posting_jurnal(new.tanggal, 'retur_penjualan', new.id, new.nomor,
        case when new.masuk_stok then 'Retur Penjualan ' || new.nomor
             else 'Retur Penjualan (barang rusak/dimusnahkan) ' || new.nomor end,
        v_baris);
    end if;

  elsif new.status = 'dibatalkan' and old.status = 'selesai' then
    select coalesce(sum(i.qty_dasar * p.hpp_rata2), 0) into v_total_hpp
    from retur_penjualan_item i join produk p on p.id = i.produk_id
    where i.retur_id = new.id;

    if new.total > 0 then
      v_baris := v_baris || jsonb_build_array(
        jsonb_build_object('akun_kode', '4-2000', 'debit', 0, 'kredit', new.total),
        jsonb_build_object('akun_kode', '1-2000', 'debit', new.total, 'kredit', 0)
      );
    end if;
    if v_total_hpp > 0 then
      v_baris := v_baris || jsonb_build_array(
        jsonb_build_object('akun_kode', case when new.masuk_stok then '1-3000' else '6-9000' end, 'debit', 0, 'kredit', v_total_hpp),
        jsonb_build_object('akun_kode', '5-1000', 'debit', v_total_hpp, 'kredit', 0)
      );
    end if;
    if jsonb_array_length(v_baris) >= 2 then
      perform fn_posting_jurnal(current_date, 'retur_penjualan', new.id, new.nomor, 'Pembatalan Retur Penjualan ' || new.nomor, v_baris);
    end if;
  end if;

  return null;
end;
$$;

-- Sama seperti fn_posting_surat_jalan() di atas -- pulihkan security definer
-- + search_path yang direset diam-diam oleh CREATE OR REPLACE.
alter function fn_posting_retur_jual() security definer;
alter function fn_posting_retur_jual() set search_path = public;
