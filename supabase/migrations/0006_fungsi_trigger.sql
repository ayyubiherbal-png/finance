-- =====================================================================
-- 0006  Fungsi bisnis & trigger
--
--  Prinsip yang dipegang di file ini:
--   1. stok_mutasi bersifat APPEND-ONLY. Update/delete ditolak.
--      Pembatalan dokumen = jurnal balik, bukan hapus baris.
--   2. Tabel `stok` hanya boleh diubah oleh trigger, tidak oleh aplikasi.
--   3. Dokumen gudang (surat jalan, penerimaan barang, penyesuaian,
--      transfer, retur) baru menyentuh stok saat status menjadi 'selesai'.
--   4. Total header dokumen selalu dihitung ulang dari itemnya.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Penomoran dokumen otomatis
-- ---------------------------------------------------------------------
create or replace function fn_set_nomor()
returns trigger language plpgsql as $$
begin
  if new.nomor is null or new.nomor = '' then
    new.nomor := generate_nomor(tg_argv[0], new.tanggal);
  end if;
  return new;
end;
$$;

create trigger trg_nomor_so     before insert on sales_order          for each row execute function fn_set_nomor('SO');
create trigger trg_nomor_sj     before insert on surat_jalan          for each row execute function fn_set_nomor('SJ');
create trigger trg_nomor_fp     before insert on faktur_penjualan     for each row execute function fn_set_nomor('INV');
create trigger trg_nomor_kas    before insert on penerimaan_kas       for each row execute function fn_set_nomor('BKM');
create trigger trg_nomor_rj     before insert on retur_penjualan      for each row execute function fn_set_nomor('RJ');
create trigger trg_nomor_po     before insert on purchase_order       for each row execute function fn_set_nomor('PO');
create trigger trg_nomor_pb     before insert on penerimaan_barang    for each row execute function fn_set_nomor('GR');
create trigger trg_nomor_fb     before insert on faktur_pembelian     for each row execute function fn_set_nomor('FB');
create trigger trg_nomor_bys    before insert on pembayaran_supplier  for each row execute function fn_set_nomor('BKK');
create trigger trg_nomor_rb     before insert on retur_pembelian      for each row execute function fn_set_nomor('RB');
create trigger trg_nomor_adj    before insert on penyesuaian_stok     for each row execute function fn_set_nomor('ADJ');
create trigger trg_nomor_trf    before insert on transfer_gudang      for each row execute function fn_set_nomor('TRF');

-- ---------------------------------------------------------------------
-- B. Inti persediaan: kartu stok, saldo, dan HPP rata-rata bergerak
-- ---------------------------------------------------------------------

-- B1. Sebelum mutasi dicatat: stempel HPP untuk barang keluar + cek stok minus.
create or replace function fn_mutasi_sebelum()
returns trigger language plpgsql as $$
declare
  v_saldo_gudang numeric(18,4);
begin
  -- Barang keluar memakai HPP rata-rata yang berlaku saat ini.
  if new.qty_dasar < 0 and new.hpp_satuan is null then
    select hpp_rata2 into new.hpp_satuan from produk where id = new.produk_id;
  end if;

  -- Cegah stok minus (saldo awal dikecualikan untuk kebutuhan migrasi data).
  if new.qty_dasar < 0 and new.jenis <> 'saldo_awal' then
    select coalesce(qty, 0) into v_saldo_gudang
      from stok where produk_id = new.produk_id and gudang_id = new.gudang_id;

    if coalesce(v_saldo_gudang, 0) + new.qty_dasar < 0 then
      raise exception
        'Stok tidak mencukupi. Produk %, gudang %: sisa %, diminta %',
        new.produk_id, new.gudang_id, coalesce(v_saldo_gudang, 0), abs(new.qty_dasar)
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_mutasi_sebelum before insert on stok_mutasi
  for each row execute function fn_mutasi_sebelum();

-- B2. Setelah mutasi dicatat: perbarui saldo stok dan HPP rata-rata bergerak.
--     Rumus: HPP_baru = (qty_lama * HPP_lama + qty_masuk * harga_masuk)
--                       / (qty_lama + qty_masuk)
--     qty_lama dihitung lintas gudang (HPP dipelihara di level produk).
create or replace function fn_mutasi_sesudah()
returns trigger language plpgsql as $$
declare
  v_qty_lama numeric(18,4);
  v_hpp_lama numeric(18,4);
  v_hpp_baru numeric(18,4);
begin
  select coalesce(sum(qty), 0) into v_qty_lama
    from stok where produk_id = new.produk_id;

  insert into stok (produk_id, gudang_id, qty, updated_at)
  values (new.produk_id, new.gudang_id, new.qty_dasar, now())
  on conflict (produk_id, gudang_id)
  do update set qty = stok.qty + excluded.qty, updated_at = now();

  -- HPP hanya bergerak saat barang MASUK dengan harga diketahui.
  if new.qty_dasar > 0 and new.hpp_satuan is not null then
    select hpp_rata2 into v_hpp_lama from produk where id = new.produk_id;

    if greatest(v_qty_lama, 0) + new.qty_dasar > 0 then
      v_hpp_baru := ((greatest(v_qty_lama, 0) * coalesce(v_hpp_lama, 0))
                     + (new.qty_dasar * new.hpp_satuan))
                    / (greatest(v_qty_lama, 0) + new.qty_dasar);
    else
      v_hpp_baru := new.hpp_satuan;
    end if;

    update produk set hpp_rata2 = round(v_hpp_baru, 4) where id = new.produk_id;
  end if;

  return null;
end;
$$;

create trigger trg_mutasi_sesudah after insert on stok_mutasi
  for each row execute function fn_mutasi_sesudah();

-- B3. Kartu stok tidak boleh diubah atau dihapus.
create or replace function fn_mutasi_kunci()
returns trigger language plpgsql as $$
begin
  raise exception
    'stok_mutasi bersifat append-only. Untuk mengoreksi, buat mutasi balik (jurnal balik).'
    using errcode = 'restrict_violation';
end;
$$;

create trigger trg_mutasi_kunci before update or delete on stok_mutasi
  for each row execute function fn_mutasi_kunci();

-- ---------------------------------------------------------------------
-- C. Total header dokumen
-- ---------------------------------------------------------------------

-- C1. Generik: hitung dpp / ppn / total dari subtotal.
--     Dipakai tabel yang punya kolom subtotal, diskon_header, ppn_persen.
create or replace function fn_hitung_total_header()
returns trigger language plpgsql as $$
begin
  new.dpp       := new.subtotal - new.diskon_header;
  new.ppn_nilai := round(new.dpp * new.ppn_persen / 100, 2);
  new.total     := new.dpp + new.ppn_nilai;
  return new;
end;
$$;

create trigger trg_total_so before insert or update on sales_order
  for each row execute function fn_hitung_total_header();
create trigger trg_total_po before insert or update on purchase_order
  for each row execute function fn_hitung_total_header();

-- C2. Faktur: sama seperti di atas, plus status pembayaran.
create or replace function fn_hitung_total_faktur()
returns trigger language plpgsql as $$
begin
  new.dpp       := new.subtotal - new.diskon_header;
  new.ppn_nilai := round(new.dpp * new.ppn_persen / 100, 2);
  new.total     := new.dpp + new.ppn_nilai;

  new.status_bayar := case
    when new.terbayar <= 0          then 'belum'::status_bayar
    when new.terbayar >= new.total  then 'lunas'::status_bayar
    else 'sebagian'::status_bayar
  end;
  return new;
end;
$$;

create trigger trg_total_fp before insert or update on faktur_penjualan
  for each row execute function fn_hitung_total_faktur();
create trigger trg_total_fb before insert or update on faktur_pembelian
  for each row execute function fn_hitung_total_faktur();

-- C3. Item berubah -> subtotal header dihitung ulang.
create or replace function fn_subtotal_so() returns trigger language plpgsql as $$
declare v_id uuid;
begin
  v_id := case when tg_op = 'DELETE' then old.so_id else new.so_id end;
  update sales_order set subtotal = coalesce(
    (select sum(subtotal) from sales_order_item where so_id = v_id), 0)
  where id = v_id;
  return null;
end; $$;

create or replace function fn_subtotal_fp() returns trigger language plpgsql as $$
declare v_id uuid;
begin
  v_id := case when tg_op = 'DELETE' then old.faktur_id else new.faktur_id end;
  update faktur_penjualan set subtotal = coalesce(
    (select sum(subtotal) from faktur_penjualan_item where faktur_id = v_id), 0)
  where id = v_id;
  return null;
end; $$;

create or replace function fn_subtotal_po() returns trigger language plpgsql as $$
declare v_id uuid;
begin
  v_id := case when tg_op = 'DELETE' then old.po_id else new.po_id end;
  update purchase_order set subtotal = coalesce(
    (select sum(subtotal) from purchase_order_item where po_id = v_id), 0)
  where id = v_id;
  return null;
end; $$;

create or replace function fn_subtotal_fb() returns trigger language plpgsql as $$
declare v_id uuid;
begin
  v_id := case when tg_op = 'DELETE' then old.faktur_id else new.faktur_id end;
  update faktur_pembelian set subtotal = coalesce(
    (select sum(subtotal) from faktur_pembelian_item where faktur_id = v_id), 0)
  where id = v_id;
  return null;
end; $$;

create or replace function fn_total_retur_jual() returns trigger language plpgsql as $$
declare v_id uuid;
begin
  v_id := case when tg_op = 'DELETE' then old.retur_id else new.retur_id end;
  update retur_penjualan set total = coalesce(
    (select sum(subtotal) from retur_penjualan_item where retur_id = v_id), 0)
  where id = v_id;
  return null;
end; $$;

create or replace function fn_total_retur_beli() returns trigger language plpgsql as $$
declare v_id uuid;
begin
  v_id := case when tg_op = 'DELETE' then old.retur_id else new.retur_id end;
  update retur_pembelian set total = coalesce(
    (select sum(subtotal) from retur_pembelian_item where retur_id = v_id), 0)
  where id = v_id;
  return null;
end; $$;

create trigger trg_subtotal_so after insert or update or delete on sales_order_item
  for each row execute function fn_subtotal_so();
create trigger trg_subtotal_fp after insert or update or delete on faktur_penjualan_item
  for each row execute function fn_subtotal_fp();
create trigger trg_subtotal_po after insert or update or delete on purchase_order_item
  for each row execute function fn_subtotal_po();
create trigger trg_subtotal_fb after insert or update or delete on faktur_pembelian_item
  for each row execute function fn_subtotal_fb();
create trigger trg_total_rj after insert or update or delete on retur_penjualan_item
  for each row execute function fn_total_retur_jual();
create trigger trg_total_rb after insert or update or delete on retur_pembelian_item
  for each row execute function fn_total_retur_beli();

-- ---------------------------------------------------------------------
-- D. Harga jual & limit kredit
-- ---------------------------------------------------------------------

-- D1. Ambil harga jual berlaku: tier + satuan + kuantitas + tanggal.
--     Dipakai frontend lewat RPC saat memilih produk di form Sales Order.
create or replace function harga_produk(
  p_produk  uuid,
  p_tier    uuid,
  p_satuan  uuid,
  p_qty     numeric default 1,
  p_tanggal date default current_date
) returns numeric language sql stable as $$
  select h.harga
  from produk_harga h
  where h.produk_id     = p_produk
    and h.tier_harga_id = p_tier
    and h.satuan_id     = p_satuan
    and h.min_qty      <= p_qty
    and h.berlaku_mulai <= p_tanggal
    and (h.berlaku_sampai is null or h.berlaku_sampai >= p_tanggal)
  order by h.min_qty desc, h.berlaku_mulai desc
  limit 1;
$$;

-- D2. Sisa piutang berjalan seorang pelanggan.
create or replace function piutang_pelanggan(p_pelanggan uuid)
returns numeric language sql stable as $$
  select coalesce(sum(sisa), 0)
  from faktur_penjualan
  where pelanggan_id = p_pelanggan
    and status       <> 'dibatalkan'
    and status_bayar <> 'lunas';
$$;

-- D3. Blokir persetujuan Sales Order bila melewati limit kredit.
create or replace function fn_cek_limit_kredit()
returns trigger language plpgsql as $$
declare
  p record;
  v_piutang numeric(18,2);
begin
  if new.status = 'disetujui' and old.status is distinct from 'disetujui' then
    select nama, termin, limit_kredit into p from pelanggan where id = new.pelanggan_id;

    if p.termin = 'tempo' and p.limit_kredit > 0 then
      v_piutang := piutang_pelanggan(new.pelanggan_id);

      if v_piutang + new.total > p.limit_kredit then
        raise exception
          'Limit kredit % terlampaui. Limit %, piutang berjalan %, order ini %',
          p.nama, p.limit_kredit, v_piutang, new.total
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_limit_kredit before update of status on sales_order
  for each row execute function fn_cek_limit_kredit();

-- ---------------------------------------------------------------------
-- E. Posting dokumen gudang ke kartu stok
-- ---------------------------------------------------------------------

-- E1. Surat Jalan selesai -> barang keluar.
create or replace function fn_posting_surat_jalan()
returns trigger language plpgsql as $$
begin
  if new.status = 'selesai' and old.status is distinct from 'selesai' then
    insert into stok_mutasi (tanggal, produk_id, gudang_id, jenis, qty_dasar,
                             ref_tabel, ref_id, ref_nomor, dibuat_oleh)
    select new.tanggal, i.produk_id, new.gudang_id, 'penjualan', -i.qty_dasar,
           'surat_jalan', new.id, new.nomor, new.dibuat_oleh
    from surat_jalan_item i
    where i.sj_id = new.id;

  elsif new.status = 'dibatalkan' and old.status = 'selesai' then
    insert into stok_mutasi (tanggal, produk_id, gudang_id, jenis, qty_dasar, hpp_satuan,
                             ref_tabel, ref_id, ref_nomor, catatan, dibuat_oleh)
    select current_date, m.produk_id, m.gudang_id, 'penyesuaian', -m.qty_dasar, m.hpp_satuan,
           'surat_jalan', new.id, new.nomor, 'Pembatalan ' || new.nomor, new.dibuat_oleh
    from stok_mutasi m
    where m.ref_tabel = 'surat_jalan' and m.ref_id = new.id and m.qty_dasar < 0;
  end if;
  return null;
end;
$$;

create trigger trg_posting_sj after update of status on surat_jalan
  for each row execute function fn_posting_surat_jalan();

-- E2. Penerimaan Barang selesai -> barang masuk + HPP dihitung.
--     Biaya tambahan (ongkos angkut/bongkar) dialokasikan proporsional
--     terhadap nilai tiap baris, lalu dibebankan ke HPP.
create or replace function fn_posting_penerimaan_barang()
returns trigger language plpgsql as $$
declare
  v_nilai_total numeric(18,4);
  r             record;
  v_hpp         numeric(18,4);
begin
  if new.status = 'selesai' and old.status is distinct from 'selesai' then
    select coalesce(sum(qty * harga_satuan), 0) into v_nilai_total
      from penerimaan_barang_item where pb_id = new.id;

    for r in select * from penerimaan_barang_item where pb_id = new.id loop
      v_hpp := case when r.qty_dasar > 0 then
                 ( (r.qty * r.harga_satuan)
                   + case when v_nilai_total > 0
                          then new.biaya_tambahan * (r.qty * r.harga_satuan) / v_nilai_total
                          else 0 end
                 ) / r.qty_dasar
               else 0 end;

      update penerimaan_barang_item set hpp_satuan = round(v_hpp, 4) where id = r.id;

      insert into stok_mutasi (tanggal, produk_id, gudang_id, jenis, qty_dasar, hpp_satuan,
                               ref_tabel, ref_id, ref_nomor, dibuat_oleh)
      values (new.tanggal, r.produk_id, new.gudang_id, 'pembelian', r.qty_dasar, round(v_hpp, 4),
              'penerimaan_barang', new.id, new.nomor, new.dibuat_oleh);
    end loop;

  elsif new.status = 'dibatalkan' and old.status = 'selesai' then
    insert into stok_mutasi (tanggal, produk_id, gudang_id, jenis, qty_dasar, hpp_satuan,
                             ref_tabel, ref_id, ref_nomor, catatan, dibuat_oleh)
    select current_date, m.produk_id, m.gudang_id, 'penyesuaian', -m.qty_dasar, m.hpp_satuan,
           'penerimaan_barang', new.id, new.nomor, 'Pembatalan ' || new.nomor, new.dibuat_oleh
    from stok_mutasi m
    where m.ref_tabel = 'penerimaan_barang' and m.ref_id = new.id and m.qty_dasar > 0;
  end if;
  return null;
end;
$$;

create trigger trg_posting_pb after update of status on penerimaan_barang
  for each row execute function fn_posting_penerimaan_barang();

-- E3. Penyesuaian stok / saldo awal.
create or replace function fn_posting_penyesuaian()
returns trigger language plpgsql as $$
begin
  if new.status = 'selesai' and old.status is distinct from 'selesai' then
    insert into stok_mutasi (tanggal, produk_id, gudang_id, jenis, qty_dasar, hpp_satuan,
                             ref_tabel, ref_id, ref_nomor, catatan, dibuat_oleh)
    select new.tanggal, i.produk_id, new.gudang_id, new.jenis, i.qty_dasar,
           case when i.qty_dasar > 0 then i.hpp_satuan else null end,
           'penyesuaian_stok', new.id, new.nomor, i.catatan, new.dibuat_oleh
    from penyesuaian_stok_item i
    where i.penyesuaian_id = new.id;
  end if;
  return null;
end;
$$;

create trigger trg_posting_adj after update of status on penyesuaian_stok
  for each row execute function fn_posting_penyesuaian();

-- E4. Transfer antar gudang: keluar dari asal, masuk ke tujuan dengan HPP sama.
create or replace function fn_posting_transfer()
returns trigger language plpgsql as $$
declare r record; v_hpp numeric(18,4);
begin
  if new.status = 'selesai' and old.status is distinct from 'selesai' then
    for r in select * from transfer_gudang_item where transfer_id = new.id loop
      select hpp_rata2 into v_hpp from produk where id = r.produk_id;

      insert into stok_mutasi (tanggal, produk_id, gudang_id, jenis, qty_dasar, hpp_satuan,
                               ref_tabel, ref_id, ref_nomor, dibuat_oleh)
      values (new.tanggal, r.produk_id, new.gudang_asal, 'transfer_keluar', -r.qty_dasar, v_hpp,
              'transfer_gudang', new.id, new.nomor, new.dibuat_oleh);

      insert into stok_mutasi (tanggal, produk_id, gudang_id, jenis, qty_dasar, hpp_satuan,
                               ref_tabel, ref_id, ref_nomor, dibuat_oleh)
      values (new.tanggal, r.produk_id, new.gudang_tujuan, 'transfer_masuk', r.qty_dasar, v_hpp,
              'transfer_gudang', new.id, new.nomor, new.dibuat_oleh);
    end loop;
  end if;
  return null;
end;
$$;

create trigger trg_posting_trf after update of status on transfer_gudang
  for each row execute function fn_posting_transfer();

-- E5. Retur penjualan -> barang masuk kembali (bila masuk_stok = true).
create or replace function fn_posting_retur_jual()
returns trigger language plpgsql as $$
begin
  if new.status = 'selesai' and old.status is distinct from 'selesai' and new.masuk_stok then
    insert into stok_mutasi (tanggal, produk_id, gudang_id, jenis, qty_dasar, hpp_satuan,
                             ref_tabel, ref_id, ref_nomor, dibuat_oleh)
    select new.tanggal, i.produk_id, new.gudang_id, 'retur_penjualan', i.qty_dasar,
           p.hpp_rata2, 'retur_penjualan', new.id, new.nomor, new.dibuat_oleh
    from retur_penjualan_item i
    join produk p on p.id = i.produk_id
    where i.retur_id = new.id;
  end if;
  return null;
end;
$$;

create trigger trg_posting_rj after update of status on retur_penjualan
  for each row execute function fn_posting_retur_jual();

-- E6. Retur pembelian -> barang keluar ke supplier.
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
  end if;
  return null;
end;
$$;

create trigger trg_posting_rb after update of status on retur_pembelian
  for each row execute function fn_posting_retur_beli();

-- ---------------------------------------------------------------------
-- F. Sinkronisasi progres dokumen
-- ---------------------------------------------------------------------

-- F1. Surat jalan -> qty_terkirim di item SO + status SO.
--     qty_terkirim disimpan dalam SATUAN DASAR.
create or replace function refresh_status_so(p_so_id uuid)
returns void language plpgsql as $$
declare v_total int; v_penuh int; v_ada int;
begin
  if p_so_id is null then return; end if;

  update sales_order_item soi
  set qty_terkirim = coalesce((
        select sum(sji.qty_dasar)
        from surat_jalan_item sji
        join surat_jalan sj on sj.id = sji.sj_id
        where sji.so_item_id = soi.id and sj.status not in ('dibatalkan','ditolak')
      ), 0)
  where soi.so_id = p_so_id;

  select count(*),
         count(*) filter (where qty_terkirim >= qty_dasar),
         count(*) filter (where qty_terkirim > 0)
    into v_total, v_penuh, v_ada
  from sales_order_item where so_id = p_so_id;

  update sales_order
  set status = case
        when v_total > 0 and v_penuh = v_total then 'selesai'::status_dokumen
        when v_ada > 0                          then 'sebagian'::status_dokumen
        else status
      end
  where id = p_so_id and status not in ('dibatalkan','ditolak');
end;
$$;

create or replace function fn_sinkron_so()
returns trigger language plpgsql as $$
declare v_so uuid;
begin
  select sj.so_id into v_so from surat_jalan sj
  where sj.id = case when tg_op = 'DELETE' then old.sj_id else new.sj_id end;
  perform refresh_status_so(v_so);
  return null;
end;
$$;

create trigger trg_sinkron_so after insert or update or delete on surat_jalan_item
  for each row execute function fn_sinkron_so();

create or replace function fn_sinkron_so_dari_sj()
returns trigger language plpgsql as $$
begin
  perform refresh_status_so(new.so_id);
  return null;
end;
$$;

create trigger trg_sinkron_so_status after update of status on surat_jalan
  for each row execute function fn_sinkron_so_dari_sj();

-- F2. Penerimaan barang -> qty_diterima di item PO + status PO.
create or replace function refresh_status_po(p_po_id uuid)
returns void language plpgsql as $$
declare v_total int; v_penuh int; v_ada int;
begin
  if p_po_id is null then return; end if;

  update purchase_order_item poi
  set qty_diterima = coalesce((
        select sum(pbi.qty_dasar)
        from penerimaan_barang_item pbi
        join penerimaan_barang pb on pb.id = pbi.pb_id
        where pbi.po_item_id = poi.id and pb.status not in ('dibatalkan','ditolak')
      ), 0)
  where poi.po_id = p_po_id;

  select count(*),
         count(*) filter (where qty_diterima >= qty_dasar),
         count(*) filter (where qty_diterima > 0)
    into v_total, v_penuh, v_ada
  from purchase_order_item where po_id = p_po_id;

  update purchase_order
  set status = case
        when v_total > 0 and v_penuh = v_total then 'selesai'::status_dokumen
        when v_ada > 0                          then 'sebagian'::status_dokumen
        else status
      end
  where id = p_po_id and status not in ('dibatalkan','ditolak');
end;
$$;

create or replace function fn_sinkron_po()
returns trigger language plpgsql as $$
declare v_po uuid;
begin
  select pb.po_id into v_po from penerimaan_barang pb
  where pb.id = case when tg_op = 'DELETE' then old.pb_id else new.pb_id end;
  perform refresh_status_po(v_po);
  return null;
end;
$$;

create trigger trg_sinkron_po after insert or update or delete on penerimaan_barang_item
  for each row execute function fn_sinkron_po();

create or replace function fn_sinkron_po_dari_pb()
returns trigger language plpgsql as $$
begin
  perform refresh_status_po(new.po_id);
  return null;
end;
$$;

create trigger trg_sinkron_po_status after update of status on penerimaan_barang
  for each row execute function fn_sinkron_po_dari_pb();

-- ---------------------------------------------------------------------
-- G. Alokasi pembayaran -> kolom terbayar di faktur
-- ---------------------------------------------------------------------
create or replace function fn_refresh_terbayar_jual()
returns trigger language plpgsql as $$
declare v_faktur uuid;
begin
  v_faktur := case when tg_op = 'DELETE' then old.faktur_id else new.faktur_id end;

  update faktur_penjualan f
  set terbayar = coalesce((
        select sum(a.jumlah)
        from penerimaan_kas_alokasi a
        join penerimaan_kas k on k.id = a.penerimaan_id
        where a.faktur_id = v_faktur and k.status not in ('dibatalkan','ditolak')
      ), 0)
  where f.id = v_faktur;

  return null;
end;
$$;

create trigger trg_terbayar_jual after insert or update or delete on penerimaan_kas_alokasi
  for each row execute function fn_refresh_terbayar_jual();

create or replace function fn_refresh_terbayar_jual_header()
returns trigger language plpgsql as $$
begin
  update faktur_penjualan f
  set terbayar = coalesce((
        select sum(a.jumlah)
        from penerimaan_kas_alokasi a
        join penerimaan_kas k on k.id = a.penerimaan_id
        where a.faktur_id = f.id and k.status not in ('dibatalkan','ditolak')
      ), 0)
  where f.id in (select faktur_id from penerimaan_kas_alokasi where penerimaan_id = new.id);
  return null;
end;
$$;

create trigger trg_terbayar_jual_header after update of status on penerimaan_kas
  for each row execute function fn_refresh_terbayar_jual_header();

create or replace function fn_refresh_terbayar_beli()
returns trigger language plpgsql as $$
declare v_faktur uuid;
begin
  v_faktur := case when tg_op = 'DELETE' then old.faktur_id else new.faktur_id end;

  update faktur_pembelian f
  set terbayar = coalesce((
        select sum(a.jumlah)
        from pembayaran_supplier_alokasi a
        join pembayaran_supplier b on b.id = a.pembayaran_id
        where a.faktur_id = v_faktur and b.status not in ('dibatalkan','ditolak')
      ), 0)
  where f.id = v_faktur;

  return null;
end;
$$;

create trigger trg_terbayar_beli after insert or update or delete on pembayaran_supplier_alokasi
  for each row execute function fn_refresh_terbayar_beli();

-- Padanan fn_refresh_terbayar_jual_header() di sisi beli: perubahan STATUS
-- header pembayaran_supplier (mis. dibatalkan) tidak memicu trigger di atas
-- karena itu hanya memantau tabel alokasi, bukan header pembayarannya.
create or replace function fn_refresh_terbayar_beli_header()
returns trigger language plpgsql as $$
begin
  update faktur_pembelian f
  set terbayar = coalesce((
        select sum(a.jumlah)
        from pembayaran_supplier_alokasi a
        join pembayaran_supplier b on b.id = a.pembayaran_id
        where a.faktur_id = f.id and b.status not in ('dibatalkan','ditolak')
      ), 0)
  where f.id in (select faktur_id from pembayaran_supplier_alokasi where pembayaran_id = new.id);
  return null;
end;
$$;

create trigger trg_terbayar_beli_header after update of status on pembayaran_supplier
  for each row execute function fn_refresh_terbayar_beli_header();

-- Alokasi tidak boleh melebihi sisa tagihan (penjualan).
create or replace function fn_cek_alokasi_jual()
returns trigger language plpgsql as $$
declare v_total numeric(18,2); v_alokasi numeric(18,2);
begin
  select jumlah into v_total from penerimaan_kas where id = new.penerimaan_id;
  select coalesce(sum(jumlah), 0) into v_alokasi
    from penerimaan_kas_alokasi
    where penerimaan_id = new.penerimaan_id and id <> new.id;

  if v_alokasi + new.jumlah > v_total then
    raise exception 'Alokasi (%) melebihi jumlah pembayaran (%)', v_alokasi + new.jumlah, v_total
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_cek_alokasi_jual before insert or update on penerimaan_kas_alokasi
  for each row execute function fn_cek_alokasi_jual();

-- Padanan di sisi beli.
create or replace function fn_cek_alokasi_beli()
returns trigger language plpgsql as $$
declare v_total numeric(18,2); v_alokasi numeric(18,2);
begin
  select jumlah into v_total from pembayaran_supplier where id = new.pembayaran_id;
  select coalesce(sum(jumlah), 0) into v_alokasi
    from pembayaran_supplier_alokasi
    where pembayaran_id = new.pembayaran_id and id <> new.id;

  if v_alokasi + new.jumlah > v_total then
    raise exception 'Alokasi (%) melebihi jumlah pembayaran (%)', v_alokasi + new.jumlah, v_total
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_cek_alokasi_beli before insert or update on pembayaran_supplier_alokasi
  for each row execute function fn_cek_alokasi_beli();

-- ---------------------------------------------------------------------
-- H. Snapshot HPP pada item faktur penjualan (untuk laporan laba)
-- ---------------------------------------------------------------------
create or replace function fn_snapshot_hpp_faktur()
returns trigger language plpgsql as $$
begin
  if new.hpp_satuan is null or new.hpp_satuan = 0 then
    select hpp_rata2 into new.hpp_satuan from produk where id = new.produk_id;
  end if;
  return new;
end;
$$;

create trigger trg_snapshot_hpp before insert on faktur_penjualan_item
  for each row execute function fn_snapshot_hpp_faktur();
