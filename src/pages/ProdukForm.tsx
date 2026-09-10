import { useEffect, useState } from 'react'
import { tt } from '@/lib/i18nText'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/Toast'
import { useTierHarga } from '@/lib/queries'
import { rupiah, tanggal as fmtTanggal, tanggalISO } from '@/lib/format'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  InputAngka,
  KondisiKosong,
  Label,
  PesanError,
  Select,
  Spinner,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui'
import type { KategoriProduk, Produk, Satuan } from '@/types/db'

interface DetailForm {
  kode: string
  barcode: string
  nama: string
  kategori_id: string
  satuan_dasar_id: string
  stok_min: number
  berat_gram: string
  catatan: string
}

const KOSONG: DetailForm = {
  kode: '',
  barcode: '',
  nama: '',
  kategori_id: '',
  satuan_dasar_id: '',
  stok_min: 0,
  berat_gram: '',
  catatan: '',
}

function useSatuan() {
  return useQuery({
    queryKey: ['satuan'],
    queryFn: async () => {
      const { data, error } = await supabase.from('satuan').select('*').order('kode').returns<Satuan[]>()
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60_000,
  })
}

function useKategori() {
  return useQuery({
    queryKey: ['kategori-produk'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kategori_produk')
        .select('*')
        .eq('aktif', true)
        .order('nama')
        .returns<KategoriProduk[]>()
      if (error) throw error
      return data ?? []
    },
    staleTime: 60_000,
  })
}

export function ProdukForm() {
  const { id } = useParams<{ id: string }>()
  const isBaru = !id || id === 'baru'

  if (isBaru) return <FormBaru />
  return <FormEdit produkId={id!} />
}

/* ------------------------------------------------------------- Buat baru */

function FormBaru() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: satuan } = useSatuan()
  const { data: kategori } = useKategori()
  const [searchParams] = useSearchParams()
  const indukId = searchParams.get('induk')

  // Membuat varian dari produk lain -- form ini di-prefill dari data produk
  // induk supaya tidak perlu ketik ulang kategori/satuan/dll dari nol.
  const { data: indukProduk } = useQuery({
    queryKey: ['produk-induk', indukId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('produk')
        .select('kode, nama, kategori_id, satuan_dasar_id, berat_gram, catatan')
        .eq('id', indukId as string)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!indukId,
  })

  const [form, setForm] = useState<DetailForm>(KOSONG)

  useEffect(() => {
    if (!indukProduk) return
    setForm((f) => ({
      ...f,
      nama: f.nama || indukProduk.nama,
      kategori_id: f.kategori_id || indukProduk.kategori_id || '',
      satuan_dasar_id: f.satuan_dasar_id || indukProduk.satuan_dasar_id,
      berat_gram: f.berat_gram || (indukProduk.berat_gram?.toString() ?? ''),
      catatan: f.catatan || indukProduk.catatan || '',
      kode: f.kode || `${indukProduk.kode}-`,
    }))
  }, [indukProduk])
  const [kategoriBaru, setKategoriBaru] = useState('')
  const [kodeKategoriBaru, setKodeKategoriBaru] = useState('')
  const [tampilkanKategoriBaru, setTampilkanKategoriBaru] = useState(false)
  const [menyimpan, setMenyimpan] = useState(false)
  const [error, setError] = useState<unknown>(null)

  function ubah<K extends keyof DetailForm>(kunci: K, nilai: DetailForm[K]) {
    setForm((f) => ({ ...f, [kunci]: nilai }))
  }

  // Pilih kategori -> SKU diprefix otomatis dari kode kategori (mis. MKR-),
  // kecuali user sudah mengetik sesuatu setelah prefix kategori sebelumnya
  // (pola sama dengan prefix ID per Tipe di form Pelanggan).
  function pilihKategori(kategoriId: string, kodeAwal: string) {
    setForm((f) => {
      if (!kodeAwal) return { ...f, kategori_id: kategoriId }
      const prefixBaru = `${kodeAwal}-`
      const kategoriLama = (kategori ?? []).find((k) => k.id === f.kategori_id)
      const prefixLama = kategoriLama ? `${kategoriLama.kode}-` : ''
      const bolehGanti = f.kode === '' || f.kode === prefixLama
      return { ...f, kategori_id: kategoriId, kode: bolehGanti ? prefixBaru : f.kode }
    })
  }

  async function buatKategori() {
    setError(null)
    if (!kategoriBaru.trim() || !kodeKategoriBaru.trim()) {
      setError(new Error('Nama dan kode awal kategori wajib diisi.'))
      return
    }
    // Nama kategori TIDAK unique di database (cuma kode) -- dicek di sini biar
    // tidak diam-diam bikin "Makaroni" dobel cuma karena beda kapitalisasi/spasi.
    const namaBaru = kategoriBaru.trim().toLowerCase()
    const sudahAda = (kategori ?? []).find((k) => k.nama.trim().toLowerCase() === namaBaru)
    if (sudahAda && !window.confirm(tt('Kategori "{nama}" sudah ada -- tetap buat baru?').replace('{nama}', sudahAda.nama))) {
      return
    }
    const kode = kodeKategoriBaru.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 10)
    const { data, error } = await supabase
      .from('kategori_produk')
      .insert({ kode, nama: kategoriBaru.trim() })
      .select('id, kode')
      .single()
    if (error) {
      const err = error as { code?: string }
      setError(err.code === '23505' ? new Error(tt('Kode "{kode}" sudah dipakai kategori lain.').replace('{kode}', kode)) : error)
      return
    }
    queryClient.invalidateQueries({ queryKey: ['kategori-produk'] })
    pilihKategori(data.id, data.kode)
    setKategoriBaru('')
    setKodeKategoriBaru('')
    setTampilkanKategoriBaru(false)
  }

  async function simpan() {
    setError(null)
    if (!form.kode.trim() || !form.nama.trim() || !form.satuan_dasar_id) {
      setError(new Error('Kode, nama, dan satuan dasar wajib diisi.'))
      return
    }

    setMenyimpan(true)
    try {
      const { data: produk, error: errProduk } = await supabase
        .from('produk')
        .insert({
          kode: form.kode.trim(),
          barcode: form.barcode || null,
          nama: form.nama.trim(),
          kategori_id: form.kategori_id || null,
          satuan_dasar_id: form.satuan_dasar_id,
          stok_min: form.stok_min,
          berat_gram: form.berat_gram ? Number(form.berat_gram) : null,
          catatan: form.catatan || null,
          induk_id: indukId || null,
        })
        .select('id')
        .single()
      if (errProduk) throw errProduk

      // Baris satuan dasar (konversi 1) wajib ada supaya transaksi bisa
      // langsung memakai produk ini.
      const { error: errSatuan } = await supabase.from('produk_satuan').insert({
        produk_id: produk.id,
        satuan_id: form.satuan_dasar_id,
        konversi: 1,
        urutan: 0,
      })
      if (errSatuan) throw errSatuan

      toast('Produk tersimpan.')
      navigate(`/produk/${produk.id}`, { replace: true })
    } catch (e) {
      setError(e)
    } finally {
      setMenyimpan(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/produk">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{tt('Produk Baru')}</h1>
      </div>

      {indukId ? (
        <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
          {tt('Membuat varian dari:')} <span className="font-medium text-foreground">{indukProduk?.nama ?? '...'}</span>
        </div>
      ) : null}

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Kode (SKU)</Label>
              <Input value={form.kode} onChange={(e) => ubah('kode', e.target.value.toUpperCase())} />
            </div>
            <div className="space-y-1.5">
              <Label>Barcode</Label>
              <Input value={form.barcode} onChange={(e) => ubah('barcode', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Nama</Label>
            <Input value={form.nama} onChange={(e) => ubah('nama', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Kategori</Label>
            {tampilkanKategoriBaru ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    autoFocus
                    placeholder="Nama kategori baru"
                    value={kategoriBaru}
                    onChange={(e) => setKategoriBaru(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && buatKategori()}
                  />
                  <Input
                    className="w-32"
                    placeholder="Kode awal"
                    value={kodeKategoriBaru}
                    onChange={(e) => setKodeKategoriBaru(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && buatKategori()}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {tt('Kode awal dipakai sebagai awalan SKU produk di kategori ini, mis. "MKR" jadi MKR-001.')}
                </p>
                <div className="flex gap-2">
                  <Button type="button" onClick={buatKategori}>
                    Buat
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setTampilkanKategoriBaru(false)}>
                    Batal
                  </Button>
                </div>
              </div>
            ) : (
              <Select
                value={form.kategori_id}
                onChange={(e) => {
                  if (e.target.value === '__baru__') {
                    setTampilkanKategoriBaru(true)
                    return
                  }
                  const k = (kategori ?? []).find((kat) => kat.id === e.target.value)
                  pilihKategori(e.target.value, k?.kode ?? '')
                }}
              >
                <option value="">Tanpa kategori</option>
                {(kategori ?? []).map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama}
                  </option>
                ))}
                <option value="__baru__">+ Tambah kategori baru...</option>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Satuan dasar</Label>
            <Select value={form.satuan_dasar_id} onChange={(e) => ubah('satuan_dasar_id', e.target.value)}>
              <option value="" disabled>
                Pilih satuan...
              </option>
              {(satuan ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nama} ({s.kode})
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              {tt('Satuan terkecil untuk stok & HPP, mis. PCS. Satuan lain (LUSIN, DUS) ditambahkan setelah produk tersimpan.')}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Stok minimum</Label>
              <Input type="number" min={0} value={form.stok_min} onChange={(e) => ubah('stok_min', Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Berat (gram)</Label>
              <Input type="number" min={0} value={form.berat_gram} onChange={(e) => ubah('berat_gram', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Catatan</Label>
            <Input value={form.catatan} onChange={(e) => ubah('catatan', e.target.value)} />
          </div>

          {error ? <PesanError error={error} /> : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" asChild>
              <Link to="/produk">Batal</Link>
            </Button>
            <Button onClick={simpan} disabled={menyimpan}>
              {menyimpan ? <Spinner /> : null}
              Simpan
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------- Edit / detail */

interface ProdukSatuanBaris {
  id: string
  satuan_id: string
  konversi: number
  barcode: string | null
  satuan: { kode: string; nama: string } | null
}

interface ProdukHargaBaris {
  id: string
  tier_harga_id: string
  satuan_id: string
  min_qty: number
  harga: number
  berlaku_mulai: string
  tier_harga: { nama: string } | null
  satuan: { kode: string } | null
}

function FormEdit({ produkId }: { produkId: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: satuanSemua } = useSatuan()
  const { data: kategori } = useKategori()
  const { data: tierHarga } = useTierHarga()

  const [error, setError] = useState<unknown>(null)

  const { data: produk, isLoading } = useQuery({
    queryKey: ['produk-detail', produkId],
    queryFn: async () => {
      const { data, error } = await supabase.from('produk').select('*').eq('id', produkId).single()
      if (error) throw error
      return data as Produk
    },
  })

  const { data: satuanProduk } = useQuery({
    queryKey: ['produk-satuan-edit', produkId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('produk_satuan')
        .select('id, satuan_id, konversi, barcode, satuan:satuan_id(kode, nama)')
        .eq('produk_id', produkId)
        .order('urutan')
      if (error) throw error
      return (data ?? []) as unknown as ProdukSatuanBaris[]
    },
    enabled: !!produk,
  })

  const { data: hargaProduk } = useQuery({
    queryKey: ['produk-harga-edit', produkId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('produk_harga')
        .select('id, tier_harga_id, satuan_id, min_qty, harga, berlaku_mulai, tier_harga:tier_harga_id(nama), satuan:satuan_id(kode)')
        .eq('produk_id', produkId)
        .order('berlaku_mulai', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as ProdukHargaBaris[]
    },
    enabled: !!produk,
  })

  function invalidateSemua() {
    queryClient.invalidateQueries({ queryKey: ['produk-detail', produkId] })
    queryClient.invalidateQueries({ queryKey: ['produk-satuan-edit', produkId] })
    queryClient.invalidateQueries({ queryKey: ['produk-harga-edit', produkId] })
    queryClient.invalidateQueries({ queryKey: ['produk'] })
    queryClient.invalidateQueries({ queryKey: ['produk-satuan'] }) // dipakai form transaksi
  }

  // ---------- Varian produk (grup SKU kemasan/ukuran berbeda) ----------
  // Maks 2 level: kalau produk ini sendiri varian (induk_id terisi), "keluarga"-
  // nya dipusatkan di induknya, bukan di dirinya sendiri.
  const rootId = produk?.induk_id ?? produk?.id
  const { data: produkKeluarga } = useQuery({
    queryKey: ['produk-varian', rootId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('produk')
        .select('id, kode, nama, induk_id')
        .or(`id.eq.${rootId},induk_id.eq.${rootId}`)
        .neq('id', produkId)
        .order('nama')
      if (error) throw error
      return (data ?? []) as { id: string; kode: string; nama: string; induk_id: string | null }[]
    },
    enabled: !!produk,
  })
  const indukRow = produk?.induk_id ? produkKeluarga?.find((v) => v.id === produk.induk_id) : undefined
  const daftarVarian = (produkKeluarga ?? []).filter((v) => v.id !== produk?.induk_id)

  const [form, setForm] = useState<Omit<DetailForm, 'satuan_dasar_id'> | null>(null)
  const [aktif, setAktif] = useState(true)
  const [menyimpan, setMenyimpan] = useState(false)

  useEffect(() => {
    if (!produk) return
    setForm({
      kode: produk.kode,
      barcode: produk.barcode ?? '',
      nama: produk.nama,
      kategori_id: produk.kategori_id ?? '',
      stok_min: produk.stok_min,
      berat_gram: produk.berat_gram?.toString() ?? '',
      catatan: produk.catatan ?? '',
    })
    setAktif(produk.aktif)
  }, [produk])

  async function simpanDetail() {
    if (!form) return
    setError(null)
    if (!form.kode.trim() || !form.nama.trim()) {
      setError(new Error('Kode dan nama wajib diisi.'))
      return
    }
    setMenyimpan(true)
    try {
      const { error } = await supabase
        .from('produk')
        .update({
          kode: form.kode.trim(),
          barcode: form.barcode || null,
          nama: form.nama.trim(),
          kategori_id: form.kategori_id || null,
          stok_min: form.stok_min,
          berat_gram: form.berat_gram ? Number(form.berat_gram) : null,
          catatan: form.catatan || null,
        })
        .eq('id', produkId)
      if (error) throw error
      toast('Produk tersimpan.')
      invalidateSemua()
    } catch (e) {
      setError(e)
    } finally {
      setMenyimpan(false)
    }
  }

  async function ubahAktif(nilai: boolean) {
    setAktif(nilai)
    const { error } = await supabase.from('produk').update({ aktif: nilai }).eq('id', produkId)
    if (error) setError(error)
    else invalidateSemua()
  }

  // ---------- Hapus produk ----------
  // Tidak ada pre-check manual untuk tiap tabel transaksi (stok, SO, PO, faktur,
  // retur, dst) -- semuanya sudah `references produk(id) on delete restrict` di
  // migrasi, jadi Postgres sendiri yang menolak (23503) kalau produk ini pernah
  // dipakai. produk_satuan/produk_harga ikut cascade delete (memang child-nya).
  const [menghapus, setMenghapus] = useState(false)
  async function hapus() {
    if (!produk) return
    const jumlahAnak = produk.induk_id ? 0 : daftarVarian.length
    const peringatan =
      jumlahAnak > 0
        ? tt('{n} varian produk ini akan kehilangan link ke sini (jadi produk mandiri). Yakin hapus?').replace('{n}', String(jumlahAnak))
        : tt('Hapus produk ini? Produk yang sudah pernah ada transaksi/stok tidak akan bisa dihapus.')
    if (!window.confirm(peringatan)) return
    setError(null)
    setMenghapus(true)
    try {
      const { error } = await supabase.from('produk').delete().eq('id', produkId)
      if (error) throw error
      toast('Produk dihapus.')
      queryClient.invalidateQueries({ queryKey: ['produk'] })
      navigate('/produk')
    } catch (e) {
      const err = e as { code?: string }
      setError(
        err.code === '23503'
          ? new Error(
              tt('Tidak bisa dihapus -- produk ini sudah pernah dipakai di transaksi/stok. Nonaktifkan saja lewat checkbox Aktif di atas.'),
            )
          : e,
      )
      setMenghapus(false)
    }
  }

  // ---------- Satuan dasar (boleh diubah HANYA kalau belum pernah ada transaksi
  // stok, belum ada satuan lain selain satuan dasar sendiri, DAN belum ada
  // harga jual (produk_harga) diset -- begitu salah satu terpenuhi, konversi
  // transaksi lama/satuan lain/acuan harga jual bergantung pada satuan ini dan
  // mengubahnya diam-diam akan salah hitung stok/HPP/harga). ----------
  const { data: pernahAdaMutasi } = useQuery({
    queryKey: ['produk-pernah-mutasi', produkId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('stok_mutasi')
        .select('id', { count: 'exact', head: true })
        .eq('produk_id', produkId)
      if (error) throw error
      return (count ?? 0) > 0
    },
    enabled: !!produk,
  })
  const bisaUbahSatuanDasar = pernahAdaMutasi === false && satuanProduk?.length === 1 && hargaProduk?.length === 0
  const [mengubahSatuanDasar, setMengubahSatuanDasar] = useState(false)

  async function ubahSatuanDasar(satuanIdBaru: string) {
    if (!satuanProduk || satuanProduk.length !== 1) return
    setError(null)
    setMengubahSatuanDasar(true)
    try {
      const { error: errProduk } = await supabase.from('produk').update({ satuan_dasar_id: satuanIdBaru }).eq('id', produkId)
      if (errProduk) throw errProduk
      // Satu-satunya baris produk_satuan yang ada (konversi tetap 1) ikut dialihkan ke satuan baru.
      const { error: errSatuan } = await supabase
        .from('produk_satuan')
        .update({ satuan_id: satuanIdBaru })
        .eq('id', satuanProduk[0]!.id)
      if (errSatuan) throw errSatuan
      toast('Satuan dasar diubah.')
      invalidateSemua()
    } catch (e) {
      setError(e)
    } finally {
      setMengubahSatuanDasar(false)
    }
  }

  // ---------- Satuan berjenjang ----------
  const [satuanBaru, setSatuanBaru] = useState({ satuan_id: '', konversi: 1 })
  async function tambahSatuan() {
    setError(null)
    if (!satuanBaru.satuan_id || satuanBaru.konversi <= 0) {
      setError(new Error('Pilih satuan dan isi konversi lebih dari 0.'))
      return
    }
    const { error } = await supabase.from('produk_satuan').insert({
      produk_id: produkId,
      satuan_id: satuanBaru.satuan_id,
      konversi: satuanBaru.konversi,
      urutan: satuanProduk?.length ?? 0,
    })
    if (error) setError(error)
    else {
      toast('Satuan ditambahkan.')
      setSatuanBaru({ satuan_id: '', konversi: 1 })
      invalidateSemua()
    }
  }
  async function hapusSatuan(baris: ProdukSatuanBaris) {
    if (baris.satuan_id === produk?.satuan_dasar_id) {
      setError(new Error('Satuan dasar tidak bisa dihapus.'))
      return
    }
    if (!window.confirm(tt('Hapus satuan ini?'))) return
    const { error } = await supabase.from('produk_satuan').delete().eq('id', baris.id)
    if (error) setError(error)
    else {
      toast('Satuan dihapus.')
      invalidateSemua()
    }
  }

  // ---------- Harga jual ----------
  const [hargaBaru, setHargaBaru] = useState({
    tier_harga_id: '',
    satuan_id: '',
    min_qty: 1,
    harga: 0,
    berlaku_mulai: tanggalISO(),
  })
  async function tambahHarga() {
    setError(null)
    if (!hargaBaru.tier_harga_id || !hargaBaru.satuan_id || hargaBaru.harga < 0) {
      setError(new Error('Lengkapi tier, satuan, dan harga.'))
      return
    }
    const { error } = await supabase.from('produk_harga').insert({
      produk_id: produkId,
      tier_harga_id: hargaBaru.tier_harga_id,
      satuan_id: hargaBaru.satuan_id,
      min_qty: hargaBaru.min_qty,
      harga: hargaBaru.harga,
      berlaku_mulai: hargaBaru.berlaku_mulai,
    })
    if (error) setError(error)
    else {
      toast('Harga ditambahkan.')
      setHargaBaru({ tier_harga_id: '', satuan_id: '', min_qty: 1, harga: 0, berlaku_mulai: tanggalISO() })
      invalidateSemua()
    }
  }
  async function hapusHarga(id: string) {
    if (!window.confirm(tt('Hapus aturan harga ini?'))) return
    const { error } = await supabase.from('produk_harga').delete().eq('id', id)
    if (error) setError(error)
    else {
      toast('Harga dihapus.')
      invalidateSemua()
    }
  }

  if (isLoading || !form || !produk) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  const satuanDasar = satuanSemua?.find((s) => s.id === produk.satuan_dasar_id)

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/produk">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{form.nama}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detail</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Kode (SKU)</Label>
              <Input value={form.kode} onChange={(e) => setForm({ ...form, kode: e.target.value.toUpperCase() })} />
            </div>
            <div className="space-y-1.5">
              <Label>Barcode</Label>
              <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Nama</Label>
            <Input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} />
          </div>

          <div className="space-y-1.5">
            <Label>Kategori</Label>
            <Select value={form.kategori_id} onChange={(e) => setForm({ ...form, kategori_id: e.target.value })}>
              <option value="">Tanpa kategori</option>
              {(kategori ?? []).map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Satuan dasar</Label>
            {bisaUbahSatuanDasar ? (
              <Select
                value={produk.satuan_dasar_id}
                disabled={mengubahSatuanDasar}
                onChange={(e) => ubahSatuanDasar(e.target.value)}
              >
                {(satuanSemua ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nama} ({s.kode})
                  </option>
                ))}
              </Select>
            ) : (
              <Input disabled value={satuanDasar ? `${satuanDasar.nama} (${satuanDasar.kode})` : '-'} />
            )}
            <p className="text-xs text-muted-foreground">
              {bisaUbahSatuanDasar
                ? tt('Masih boleh diubah -- belum ada transaksi stok maupun satuan lain untuk produk ini.')
                : pernahAdaMutasi
                  ? tt('Tidak bisa diubah -- sudah ada transaksi stok yang konversinya bergantung pada satuan ini.')
                  : (satuanProduk?.length ?? 0) > 1
                    ? tt('Tidak bisa diubah -- hapus dulu semua satuan lain (LUSIN, DUS, dst.) di tabel bawah selain satuan dasar ini.')
                    : tt('Tidak bisa diubah -- hapus dulu semua harga jual yang sudah diset untuk produk ini.')}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Stok minimum</Label>
              <Input
                type="number"
                min={0}
                value={form.stok_min}
                onChange={(e) => setForm({ ...form, stok_min: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Berat (gram)</Label>
              <Input
                type="number"
                min={0}
                value={form.berat_gram}
                onChange={(e) => setForm({ ...form, berat_gram: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Catatan</Label>
            <Input value={form.catatan} onChange={(e) => setForm({ ...form, catatan: e.target.value })} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={aktif}
              onChange={(e) => ubahAktif(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            {tt('Aktif')}
          </label>

          <div className="grid grid-cols-2 gap-4 rounded-md bg-muted/50 p-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">{tt('HPP rata-rata')}</p>
              <p className="tabular font-medium">{rupiah(produk.hpp_rata2)}</p>
            </div>
          </div>

          {error ? <PesanError error={error} /> : null}

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={hapus} disabled={menghapus}>
              {menghapus ? <Spinner className="h-3.5 w-3.5" /> : <Trash2 className="h-4 w-4 text-destructive" />}
              {tt('Hapus')}
            </Button>
            <Button onClick={simpanDetail} disabled={menyimpan}>
              {menyimpan ? <Spinner /> : null}
              Simpan Detail
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Satuan</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          <Table>
            <Thead>
              <Tr>
                <Th>Satuan</Th>
                <Th className="text-right">{`${tt('Konversi ke')} ${satuanDasar?.kode ?? tt('dasar')}`}</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {(satuanProduk ?? []).map((s) => (
                <Tr key={s.id}>
                  <Td className="font-medium">
                    {s.satuan?.nama} ({s.satuan?.kode})
                    {s.satuan_id === produk.satuan_dasar_id ? (
                      <span className="ml-2 text-xs text-muted-foreground">{tt('(satuan dasar)')}</span>
                    ) : null}
                  </Td>
                  <Td className="tabular text-right">{s.konversi}</Td>
                  <Td className="text-right">
                    {s.satuan_id !== produk.satuan_dasar_id ? (
                      <Button variant="ghost" size="icon" onClick={() => hapusSatuan(s)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    ) : null}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>

          <div className="grid gap-2 border-t border-border p-3 sm:grid-cols-[1fr_1fr_auto]">
            <Select
              value={satuanBaru.satuan_id}
              onChange={(e) => setSatuanBaru((s) => ({ ...s, satuan_id: e.target.value }))}
            >
              <option value="" disabled>
                Pilih satuan...
              </option>
              {(satuanSemua ?? [])
                .filter((s) => !(satuanProduk ?? []).some((sp) => sp.satuan_id === s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nama} ({s.kode})
                  </option>
                ))}
            </Select>
            <Input
              type="number"
              min={0}
              placeholder={`Isi = berapa ${satuanDasar?.kode ?? 'dasar'}`}
              value={satuanBaru.konversi}
              onChange={(e) => setSatuanBaru((s) => ({ ...s, konversi: Number(e.target.value) }))}
            />
            <Button onClick={tambahSatuan}>Tambah</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Harga Jual</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          <Table>
            <Thead>
              <Tr>
                <Th>Tier</Th>
                <Th>Satuan</Th>
                <Th className="text-right">Min. qty</Th>
                <Th className="text-right">Harga</Th>
                <Th>Berlaku mulai</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {(hargaProduk ?? []).map((h) => (
                <Tr key={h.id}>
                  <Td className="font-medium">{h.tier_harga?.nama}</Td>
                  <Td className="text-xs text-muted-foreground">{h.satuan?.kode}</Td>
                  <Td className="tabular text-right">{h.min_qty}</Td>
                  <Td className="tabular text-right">{rupiah(h.harga)}</Td>
                  <Td className="text-muted-foreground">{fmtTanggal(h.berlaku_mulai)}</Td>
                  <Td className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => hapusHarga(h.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </Td>
                </Tr>
              ))}
              {(hargaProduk ?? []).length === 0 ? (
                <Tr>
                  <Td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    {tt("Belum ada aturan harga. Tanpa ini, produk tidak akan muncul harganya otomatis di Sales Order.")}
                  </Td>
                </Tr>
              ) : null}
            </Tbody>
          </Table>

          <div className="grid gap-2 border-t border-border p-3 sm:grid-cols-[1fr_1fr_0.7fr_1fr_1fr_auto]">
            <Select
              value={hargaBaru.tier_harga_id}
              onChange={(e) => setHargaBaru((h) => ({ ...h, tier_harga_id: e.target.value }))}
            >
              <option value="" disabled>
                Tier...
              </option>
              {(tierHarga ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nama}
                </option>
              ))}
            </Select>
            <Select
              value={hargaBaru.satuan_id}
              onChange={(e) => setHargaBaru((h) => ({ ...h, satuan_id: e.target.value }))}
            >
              <option value="" disabled>
                Satuan...
              </option>
              {(satuanProduk ?? []).map((s) => (
                <option key={s.satuan_id} value={s.satuan_id}>
                  {s.satuan?.kode}
                </option>
              ))}
            </Select>
            <Input
              type="number"
              min={1}
              value={hargaBaru.min_qty}
              onChange={(e) => setHargaBaru((h) => ({ ...h, min_qty: Number(e.target.value) }))}
            />
            <InputAngka placeholder="Harga" value={hargaBaru.harga} onChange={(nilai) => setHargaBaru((h) => ({ ...h, harga: nilai }))} />
            <Input
              type="date"
              value={hargaBaru.berlaku_mulai}
              onChange={(e) => setHargaBaru((h) => ({ ...h, berlaku_mulai: e.target.value }))}
            />
            <Button onClick={tambahHarga}>Tambah</Button>
          </div>
          <p className="px-3 pb-2 text-xs text-muted-foreground">
            {tt('Isi min. qty lebih dari 1 untuk diskon bertingkat (mis. beli 12+ dapat harga lebih murah).')}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tt('Varian Produk')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0">
          {produk.induk_id ? (
            <p className="text-sm text-muted-foreground">
              {tt('Varian dari:')}{' '}
              <Link to={`/produk/${produk.induk_id}`} className="font-medium text-primary hover:underline">
                {indukRow?.nama ?? '...'}
              </Link>
            </p>
          ) : null}

          {daftarVarian.length === 0 ? (
            <KondisiKosong pesan="Belum ada varian lain." />
          ) : (
            <ul className="space-y-1.5">
              {daftarVarian.map((v) => (
                <li key={v.id}>
                  <Link to={`/produk/${v.id}`} className="flex items-center gap-2 text-sm hover:underline">
                    <span className="font-mono text-xs text-muted-foreground">{v.kode}</span>
                    <span className="text-primary">{v.nama}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <Button variant="outline" asChild>
            <Link to={`/produk/baru?induk=${rootId}`}>
              <Plus className="h-4 w-4" />
              {tt('Tambah Varian')}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
