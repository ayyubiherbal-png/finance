-- =====================================================================
-- 0061  Posting Jurnal Umum -- Penyesuaian Stok (5/5, migrasi terakhir)
-- =====================================================================
-- Menambah panggilan fn_posting_jurnal() tepat di guard status yang sudah
-- ada di fn_posting_penyesuaian() -- pola yang sama seperti 0058-0060.
--
-- jenis='saldo_awal'  : nilai persediaan awal dianggap setoran modal.
--   Debit 1-3000 Persediaan / Kredit 3-1000 Modal Pemilik.
-- jenis='penyesuaian' : koreksi manual (fisik lebih/kurang, rusak, dst).
--   qty>0 (stok bertambah tanpa sumber biaya) -> Debit 1-3000 / Kredit 6-9000
--   qty<0 (stok berkurang -- hilang/rusak)    -> Debit 6-9000 / Kredit 1-3000
--   (satu pasang akun yang sama, arah dibalik sesuai tanda qty -- lihat
--   plan Bagian C baris 13-14; 6-9000 dipakai sebagai kontra saat qty>0
--   karena tidak ada akun "pendapatan lain-lain" tersendiri).
--
-- Nilai per item dihitung dari stok_mutasi SETELAH insert (hpp_satuan utk
-- qty<0 baru terisi oleh trigger fn_mutasi_sebelum yang sudah ada, persis
-- pola yang sudah dipakai di fn_posting_surat_jalan/fn_posting_retur_jual).
-- =====================================================================

create or replace function fn_posting_penyesuaian()
returns trigger language plpgsql as $$
declare
  v_total_naik  numeric(18,2);
  v_total_turun numeric(18,2);
  v_baris       jsonb := '[]'::jsonb;
begin
  if new.status = 'selesai' and old.status is distinct from 'selesai' then
    insert into stok_mutasi (tanggal, produk_id, gudang_id, jenis, qty_dasar, hpp_satuan,
                             ref_tabel, ref_id, ref_nomor, catatan, dibuat_oleh)
    select new.tanggal, i.produk_id, new.gudang_id, new.jenis, i.qty_dasar,
           case when i.qty_dasar > 0 then i.hpp_satuan else null end,
           'penyesuaian_stok', new.id, new.nomor, i.catatan, new.dibuat_oleh
    from penyesuaian_stok_item i
    where i.penyesuaian_id = new.id;

    select coalesce(sum(qty_dasar * hpp_satuan) filter (where qty_dasar > 0), 0),
           coalesce(sum(-qty_dasar * hpp_satuan) filter (where qty_dasar < 0), 0)
      into v_total_naik, v_total_turun
    from stok_mutasi where ref_tabel = 'penyesuaian_stok' and ref_id = new.id;

    if new.jenis = 'saldo_awal' then
      if v_total_naik > 0 then
        perform fn_posting_jurnal(new.tanggal, 'penyesuaian_stok', new.id, new.nomor,
          'Saldo Awal Persediaan ' || new.nomor,
          jsonb_build_array(
            jsonb_build_object('akun_kode', '1-3000', 'debit', v_total_naik, 'kredit', 0),
            jsonb_build_object('akun_kode', '3-1000', 'debit', 0, 'kredit', v_total_naik)
          ));
      end if;
    else
      if v_total_naik > 0 then
        v_baris := v_baris || jsonb_build_array(
          jsonb_build_object('akun_kode', '1-3000', 'debit', v_total_naik, 'kredit', 0),
          jsonb_build_object('akun_kode', '6-9000', 'debit', 0, 'kredit', v_total_naik)
        );
      end if;
      if v_total_turun > 0 then
        v_baris := v_baris || jsonb_build_array(
          jsonb_build_object('akun_kode', '6-9000', 'debit', v_total_turun, 'kredit', 0),
          jsonb_build_object('akun_kode', '1-3000', 'debit', 0, 'kredit', v_total_turun)
        );
      end if;
      if jsonb_array_length(v_baris) >= 2 then
        perform fn_posting_jurnal(new.tanggal, 'penyesuaian_stok', new.id, new.nomor,
          'Penyesuaian Stok ' || new.nomor, v_baris);
      end if;
    end if;

  elsif new.status = 'dibatalkan' and old.status = 'selesai' then
    -- Ambil total ASLI dulu sebelum insert baris pembalik -- item dalam
    -- satu dokumen bisa campur qty naik & turun sekaligus, jadi tidak bisa
    -- dipisah lewat filter tanda setelah baris pembalik ikut masuk tabel
    -- (beda dengan surat_jalan/retur yang arahnya selalu seragam).
    select coalesce(sum(qty_dasar * hpp_satuan) filter (where qty_dasar > 0), 0),
           coalesce(sum(-qty_dasar * hpp_satuan) filter (where qty_dasar < 0), 0)
      into v_total_naik, v_total_turun
    from stok_mutasi where ref_tabel = 'penyesuaian_stok' and ref_id = new.id;

    insert into stok_mutasi (tanggal, produk_id, gudang_id, jenis, qty_dasar, hpp_satuan,
                             ref_tabel, ref_id, ref_nomor, catatan, dibuat_oleh)
    select current_date, m.produk_id, m.gudang_id, 'penyesuaian', -m.qty_dasar, m.hpp_satuan,
           'penyesuaian_stok', new.id, new.nomor, 'Pembatalan ' || new.nomor, new.dibuat_oleh
    from stok_mutasi m
    where m.ref_tabel = 'penyesuaian_stok' and m.ref_id = new.id;

    if new.jenis = 'saldo_awal' then
      if v_total_naik > 0 then
        perform fn_posting_jurnal(current_date, 'penyesuaian_stok', new.id, new.nomor,
          'Pembatalan Saldo Awal Persediaan ' || new.nomor,
          jsonb_build_array(
            jsonb_build_object('akun_kode', '3-1000', 'debit', v_total_naik, 'kredit', 0),
            jsonb_build_object('akun_kode', '1-3000', 'debit', 0, 'kredit', v_total_naik)
          ));
      end if;
    else
      if v_total_naik > 0 then
        v_baris := v_baris || jsonb_build_array(
          jsonb_build_object('akun_kode', '1-3000', 'debit', 0, 'kredit', v_total_naik),
          jsonb_build_object('akun_kode', '6-9000', 'debit', v_total_naik, 'kredit', 0)
        );
      end if;
      if v_total_turun > 0 then
        v_baris := v_baris || jsonb_build_array(
          jsonb_build_object('akun_kode', '6-9000', 'debit', 0, 'kredit', v_total_turun),
          jsonb_build_object('akun_kode', '1-3000', 'debit', v_total_turun, 'kredit', 0)
        );
      end if;
      if jsonb_array_length(v_baris) >= 2 then
        perform fn_posting_jurnal(current_date, 'penyesuaian_stok', new.id, new.nomor,
          'Pembatalan Penyesuaian Stok ' || new.nomor, v_baris);
      end if;
    end if;
  end if;
  return null;
end;
$$;

-- PENTING: CREATE OR REPLACE FUNCTION mereset SECURITY DEFINER dan SET
-- search_path ke default kalau tidak disebut ulang di statement barunya --
-- fn_posting_penyesuaian() aslinya dijadikan security definer lewat ALTER
-- terpisah di 0008_rls.sql. Wajib dipulihkan di sini, atau posting
-- Penyesuaian Stok akan diam-diam gagal kena RLS stok_mutasi untuk semua
-- pengguna biasa.
alter function fn_posting_penyesuaian() security definer;
alter function fn_posting_penyesuaian() set search_path = public;
