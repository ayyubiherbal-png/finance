-- =====================================================================
-- 0062  Laporan turunan Jurnal Umum -- Buku Besar, Neraca, Arus Kas
--
-- Semua 5 migrasi posting (0057-0061) sudah live & tervalidasi. Migrasi
-- ini murni "hadiah" dari GL yang sudah berjalan -- tidak menambah
-- trigger atau mengubah perilaku posting apa pun, hanya cara membaca
-- data yang sudah ada.
--
-- v_buku_besar   : satu baris per baris jurnal, dipakai halaman Buku
--                  Besar (drill-down transaksi per akun/periode).
-- fn_neraca()    : saldo tiap akun (aset/liabilitas/ekuitas/pendapatan/
--                  beban) kumulatif SEJAK AWAL sampai tanggal cutoff --
--                  bukan view biasa karena butuh agregasi per akun,
--                  dan supaya "opening balance" Buku Besar bisa pakai
--                  fungsi yang SAMA (tinggal filter 1 baris akunnya),
--                  tidak ada rumus saldo yang dihitung dua kali dengan
--                  cara berbeda.
-- fn_arus_kas()  : arus kas per ref_tabel dalam rentang tanggal,
--                  dikelompokkan Operasi/Pendanaan (Investasi belum
--                  ada sumbernya di sistem saat ini -- akan otomatis
--                  terisi begitu ada modul aset tetap, tanpa migrasi
--                  baru, karena kategorinya dihitung dari kode akun
--                  lawan tiap jurnal, bukan daftar tetap).
-- =====================================================================

create view v_buku_besar with (security_invoker = true) as
select
  jb.id as baris_id,
  ju.id as jurnal_id,
  ju.nomor,
  ju.tanggal,
  ju.created_at,
  ju.ref_tabel,
  ju.ref_id,
  ju.ref_nomor,
  ju.keterangan,
  jb.akun_id,
  ak.kode as kode_akun,
  ak.nama as nama_akun,
  ak.tipe as tipe_akun,
  ak.saldo_normal,
  jb.debit,
  jb.kredit,
  jb.keterangan as keterangan_baris
from jurnal_umum_baris jb
join jurnal_umum ju on ju.id = jb.jurnal_id
join akun_coa ak on ak.id = jb.akun_id;

grant select on v_buku_besar to authenticated;

-- ---------- Saldo tiap akun kumulatif s/d tanggal cutoff ----------
create or replace function fn_neraca(p_tanggal date default current_date)
returns table (
  akun_id      uuid,
  kode         text,
  nama         text,
  tipe         tipe_akun_coa,
  saldo_normal saldo_normal_coa,
  induk_id     uuid,
  saldo        numeric
)
language sql
stable
as $$
  select
    ak.id,
    ak.kode,
    ak.nama,
    ak.tipe,
    ak.saldo_normal,
    ak.induk_id,
    case when ak.saldo_normal = 'debit'
      then coalesce(sum(x.debit), 0) - coalesce(sum(x.kredit), 0)
      else coalesce(sum(x.kredit), 0) - coalesce(sum(x.debit), 0)
    end as saldo
  from akun_coa ak
  left join (
    select jb.akun_id, jb.debit, jb.kredit
    from jurnal_umum_baris jb
    join jurnal_umum ju on ju.id = jb.jurnal_id
    where ju.tanggal <= p_tanggal
  ) x on x.akun_id = ak.id
  group by ak.id, ak.kode, ak.nama, ak.tipe, ak.saldo_normal, ak.induk_id;
$$;

-- ---------- Arus kas per ref_tabel dalam satu rentang tanggal ----------
create or replace function fn_arus_kas(p_dari date, p_sampai date)
returns table (
  kategori     text,
  ref_tabel    text,
  arus_bersih  numeric
)
language sql
stable
as $$
  select
    case
      when ju.ref_tabel = 'pengeluaran_kas' and exists (
        select 1 from jurnal_umum_baris jb2
        join akun_coa ak2 on ak2.id = jb2.akun_id
        where jb2.jurnal_id = ju.id and ak2.kode = '3-2000'
      ) then 'pendanaan'
      else 'operasi'
    end as kategori,
    ju.ref_tabel,
    sum(jb.debit - jb.kredit) as arus_bersih
  from jurnal_umum_baris jb
  join jurnal_umum ju on ju.id = jb.jurnal_id
  join akun_coa ak on ak.id = jb.akun_id
  where ak.kode like '1-10%' and ju.tanggal between p_dari and p_sampai
  group by 1, 2;
$$;
