-- =====================================================================
-- 0023  Perbarui status pesanan marketplace yang sudah pernah diimpor
--
--  Migrasi tambahan, aman dijalankan berkali-kali.
--
--  Latar belakang: pesanan yang sudah pernah diimpor (nomor sudah ada
--  di `pesanan_marketplace_impor`) SELALU ditolak kalau diimpor lagi --
--  itu benar untuk mencegah stok/penjualan tercatat dobel (lihat 0021).
--  Tapi user tanya: "kalau misalkan ada orderan yang statusnya berubah,
--  apakah akan terupdate otomatis?" -- jawabannya waktu itu TIDAK,
--  status yang tersimpan cuma snapshot sekali di awal, tidak pernah
--  ikut berubah walau statusnya di TikTok/Shopee sudah maju (mis. dari
--  "Dikirim" jadi "Selesai").
--
--  Fungsi baru `perbarui_status_impor_marketplace` MEMPERBARUI baris
--  yang sudah ada -- BUKAN membuat SO/Surat Jalan/Faktur baru (itu
--  cuma boleh terjadi SEKALI, saat pertama diimpor lewat
--  `penjualan_cepat`). Dua hal yang dilakukan:
--
--  1. `status_platform` di `pesanan_marketplace_impor` diperbarui ke
--     nilai baru dari file yang diunggah ulang.
--  2. Kalau status barunya "Selesai"/"Completed" (lihat aturan yang
--     sama di 0022/importPesanan.ts) DAN faktur terkait belum lunas,
--     dan akun kas/bank tujuan diisi -- faktur ditandai lunas dengan
--     cara yang sama seperti saat impor pertama (bikin baris
--     Penerimaan Kas sejumlah SISA tagihannya, bukan asal total, jaga-
--     jaga kalau sebelumnya sudah dibayar sebagian).
--
--  `security invoker` (sama seperti `penjualan_cepat`) -- jalan dengan
--  hak akses & RLS user yang login, bukan hak admin. Makanya
--  `pesanan_marketplace_impor` butuh policy UPDATE baru (sebelumnya
--  cuma ada select & insert di 0021).
-- =====================================================================

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'pesanan_marketplace_impor' and policyname = 'perbarui'
  ) then
    create policy perbarui on pesanan_marketplace_impor
      for update to authenticated using (boleh_sales()) with check (boleh_sales());
  end if;
end $$;

grant update on pesanan_marketplace_impor to authenticated;

create or replace function perbarui_status_impor_marketplace(
  p_kanal                   kanal_penjualan,
  p_nomor_pesanan_platform  text,
  p_status_baru             text,
  p_akun_id                 uuid default null,   -- diisi = tandai lunas kalau status barunya final; null = cuma perbarui status
  p_metode                  metode_bayar default 'transfer'
)
returns text   -- 'tidak_ada' | 'tidak_berubah' | 'status_diperbarui' | 'ditandai_lunas'
language plpgsql
security invoker
as $$
declare
  v_profil  uuid;
  v_row     pesanan_marketplace_impor%rowtype;
  v_faktur  faktur_penjualan%rowtype;
  v_kas     uuid;
  v_hasil   text := 'tidak_berubah';
begin
  select id into v_profil from profil where id = auth.uid();

  select * into v_row from pesanan_marketplace_impor
  where kanal = p_kanal and nomor_pesanan_platform = p_nomor_pesanan_platform;

  if not found then
    return 'tidak_ada';
  end if;

  if v_row.status_platform is distinct from p_status_baru then
    update pesanan_marketplace_impor
    set status_platform = p_status_baru
    where id = v_row.id;
    v_hasil := 'status_diperbarui';
  end if;

  if v_row.faktur_id is not null then
    select * into v_faktur from faktur_penjualan where id = v_row.faktur_id;

    if found
       and v_faktur.status_bayar <> 'lunas'
       and v_faktur.sisa > 0
       and p_akun_id is not null
       and lower(trim(coalesce(p_status_baru, ''))) in ('selesai', 'completed')
    then
      insert into penerimaan_kas (tanggal, pelanggan_id, akun_id, metode, jumlah,
                                  status, catatan, dibuat_oleh)
      values (current_date, v_faktur.pelanggan_id, p_akun_id, p_metode, v_faktur.sisa,
              'disetujui', 'Update status impor marketplace -- ' || p_status_baru, v_profil)
      returning id into v_kas;

      insert into penerimaan_kas_alokasi (penerimaan_id, faktur_id, jumlah)
      values (v_kas, v_faktur.id, v_faktur.sisa);

      v_hasil := 'ditandai_lunas';
    end if;
  end if;

  return v_hasil;
end;
$$;

grant execute on function perbarui_status_impor_marketplace(
  kanal_penjualan, text, text, uuid, metode_bayar
) to authenticated;
