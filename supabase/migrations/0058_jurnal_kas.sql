-- =====================================================================
-- 0058  Posting Jurnal Umum -- Kas (2/5)
--
-- Penerimaan Kas, Pembayaran Supplier, Pengeluaran Kas dibuat langsung
-- berstatus final (tidak lewat draf, dikonfirmasi lewat riset kode) --
-- jadi jurnal diposting saat INSERT, dan dibalik saat status berubah
-- ke 'dibatalkan'/'ditolak'. Ketiganya sudah dipakai `v_saldo_kas_bank`
-- (0046) sebagai satu-satunya sumber saldo kas/bank -- migrasi ini
-- TIDAK mengubah tabel itu sama sekali, cuma menambah jurnal PARALEL
-- dari titik insert/update yang sama.
--
-- Settlement Marketplace (0054) SENGAJA tidak disentuh di sini: fungsi
-- itu hanya insert ke penerimaan_kas/pengeluaran_kas, jadi jurnalnya
-- otomatis terbentuk lewat trigger generik di bawah tanpa kode
-- tambahan -- termasuk pembatalannya (batalkan_settlement_marketplace
-- men-set status kedua tabel itu ke 'dibatalkan', yang otomatis memicu
-- jurnal balik yang sama).
-- =====================================================================

-- ---------- Penerimaan Kas: Debit Kas/Bank, Kredit Piutang Usaha ----------
create or replace function fn_jurnal_penerimaan_kas()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_kode_kas text;
begin
  select ak.kode into v_kode_kas
  from akun_kas_bank akb join akun_coa ak on ak.id = akb.akun_coa_id
  where akb.id = new.akun_id;

  if tg_op = 'INSERT' then
    if new.status not in ('dibatalkan', 'ditolak') then
      perform fn_posting_jurnal(new.tanggal, 'penerimaan_kas', new.id, new.nomor,
        'Penerimaan Kas ' || new.nomor,
        jsonb_build_array(
          jsonb_build_object('akun_kode', v_kode_kas, 'debit', new.jumlah, 'kredit', 0),
          jsonb_build_object('akun_kode', '1-2000', 'debit', 0, 'kredit', new.jumlah)
        ));
    end if;
  elsif old.status not in ('dibatalkan', 'ditolak') and new.status in ('dibatalkan', 'ditolak') then
    perform fn_posting_jurnal(current_date, 'penerimaan_kas', new.id, new.nomor,
      'Pembatalan Penerimaan Kas ' || new.nomor,
      jsonb_build_array(
        jsonb_build_object('akun_kode', '1-2000', 'debit', new.jumlah, 'kredit', 0),
        jsonb_build_object('akun_kode', v_kode_kas, 'debit', 0, 'kredit', new.jumlah)
      ));
  end if;
  return null;
end;
$$;
create trigger trg_jurnal_penerimaan_kas after insert or update of status on penerimaan_kas
  for each row execute function fn_jurnal_penerimaan_kas();

-- ---------- Pembayaran Supplier: Debit Utang Usaha, Kredit Kas/Bank ----------
create or replace function fn_jurnal_pembayaran_supplier()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_kode_kas text;
begin
  select ak.kode into v_kode_kas
  from akun_kas_bank akb join akun_coa ak on ak.id = akb.akun_coa_id
  where akb.id = new.akun_id;

  if tg_op = 'INSERT' then
    if new.status not in ('dibatalkan', 'ditolak') then
      perform fn_posting_jurnal(new.tanggal, 'pembayaran_supplier', new.id, new.nomor,
        'Pembayaran Supplier ' || new.nomor,
        jsonb_build_array(
          jsonb_build_object('akun_kode', '2-1000', 'debit', new.jumlah, 'kredit', 0),
          jsonb_build_object('akun_kode', v_kode_kas, 'debit', 0, 'kredit', new.jumlah)
        ));
    end if;
  elsif old.status not in ('dibatalkan', 'ditolak') and new.status in ('dibatalkan', 'ditolak') then
    perform fn_posting_jurnal(current_date, 'pembayaran_supplier', new.id, new.nomor,
      'Pembatalan Pembayaran Supplier ' || new.nomor,
      jsonb_build_array(
        jsonb_build_object('akun_kode', v_kode_kas, 'debit', new.jumlah, 'kredit', 0),
        jsonb_build_object('akun_kode', '2-1000', 'debit', 0, 'kredit', new.jumlah)
      ));
  end if;
  return null;
end;
$$;
create trigger trg_jurnal_pembayaran_supplier after insert or update of status on pembayaran_supplier
  for each row execute function fn_jurnal_pembayaran_supplier();

-- ---------- Pengeluaran Kas: Debit Beban (atau Prive kalau non-operasional), Kredit Kas/Bank ----------
create or replace function fn_jurnal_pengeluaran_kas()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_kode_kas   text;
  v_kode_beban text;
  v_operasional boolean;
  v_kode_debit text;
begin
  select ak.kode into v_kode_kas
  from akun_kas_bank akb join akun_coa ak on ak.id = akb.akun_coa_id
  where akb.id = new.akun_id;

  select ak.kode, kb.operasional into v_kode_beban, v_operasional
  from nama_pengeluaran np
  join kategori_biaya kb on kb.id = np.kategori_biaya_id
  join akun_coa ak on ak.id = kb.akun_coa_id
  where np.id = new.nama_pengeluaran_id;

  v_kode_debit := case when coalesce(v_operasional, true) then v_kode_beban else '3-2000' end;

  if tg_op = 'INSERT' then
    if new.status not in ('dibatalkan', 'ditolak') then
      perform fn_posting_jurnal(new.tanggal, 'pengeluaran_kas', new.id, new.nomor,
        'Pengeluaran Kas ' || new.nomor,
        jsonb_build_array(
          jsonb_build_object('akun_kode', v_kode_debit, 'debit', new.jumlah, 'kredit', 0),
          jsonb_build_object('akun_kode', v_kode_kas, 'debit', 0, 'kredit', new.jumlah)
        ));
    end if;
  elsif old.status not in ('dibatalkan', 'ditolak') and new.status in ('dibatalkan', 'ditolak') then
    perform fn_posting_jurnal(current_date, 'pengeluaran_kas', new.id, new.nomor,
      'Pembatalan Pengeluaran Kas ' || new.nomor,
      jsonb_build_array(
        jsonb_build_object('akun_kode', v_kode_kas, 'debit', new.jumlah, 'kredit', 0),
        jsonb_build_object('akun_kode', v_kode_debit, 'debit', 0, 'kredit', new.jumlah)
      ));
  end if;
  return null;
end;
$$;
create trigger trg_jurnal_pengeluaran_kas after insert or update of status on pengeluaran_kas
  for each row execute function fn_jurnal_pengeluaran_kas();
