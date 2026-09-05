import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  useWilayahProvinsi,
  useWilayahKabupatenKota,
  useWilayahKecamatan,
  useWilayahKelurahan,
  buatCariWilayah,
} from '@/lib/queries'
import { Button, Card, CardContent, Input, Label, PesanError, Select, Spinner } from '@/components/ui'
import { Combobox } from '@/components/Combobox'
import { toast } from '@/components/Toast'
import type { Pelanggan, SumberPelanggan, TipePelanggan } from '@/types/db'

interface FormState {
  kode: string
  nama: string
  tipe: TipePelanggan
  sales_id: string
  kontak_nama: string
  telepon: string
  whatsapp: string
  email: string
  provinsi_kode: string
  kabupaten_kode: string
  kecamatan_kode: string
  kelurahan_kode: string
  alamat: string
  sosial_media: string
  tanggal_lahir: string
  sumber: SumberPelanggan | ''
  sumber_custom: string
}

const PREFIX_TIPE: Record<TipePelanggan, string> = {
  customer: 'CST-',
  mitra: 'MTR-',
  horeka: 'HRK-',
  perusahaan: 'B2B-',
}

const KOSONG: FormState = {
  kode: PREFIX_TIPE.customer,
  nama: '',
  tipe: 'customer',
  sales_id: '',
  kontak_nama: '',
  telepon: '',
  whatsapp: '',
  email: '',
  provinsi_kode: '',
  kabupaten_kode: '',
  kecamatan_kode: '',
  kelurahan_kode: '',
  alamat: '',
  sosial_media: '',
  tanggal_lahir: '',
  sumber: '',
  sumber_custom: '',
}

const LABEL_TIPE: Record<TipePelanggan, string> = {
  customer: 'Customer',
  mitra: 'Mitra',
  horeka: 'Horeka',
  perusahaan: 'Perusahaan',
}

const LABEL_SUMBER: Record<SumberPelanggan, string> = {
  relasi: 'Relasi',
  sosmed: 'Sosmed',
  shopee: 'Shopee',
  tiktok: 'TikTok',
  website: 'Website',
  custom: 'Custom...',
}

// ID (kode) dijaga unik di database (constraint, lihat 0002). Kalau
// kena, pesan Postgres-nya teknis -- ganti jadi bahasa yang jelas.
function ramahkanErrorSimpan(e: unknown, kode: string): unknown {
  const err = e as { code?: string; message?: string; details?: string } | null
  if (err?.code === '23505' && `${err.message ?? ''} ${err.details ?? ''}`.toLowerCase().includes('kode')) {
    return new Error(`ID "${kode}" sudah dipakai pelanggan lain. Pakai ID yang berbeda.`)
  }
  return e
}

function useDaftarSales() {
  return useQuery({
    queryKey: ['profil-sales'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profil').select('id, nama').eq('aktif', true).order('nama')
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60_000,
  })
}

export function PelangganForm() {
  const { id } = useParams<{ id: string }>()
  const isBaru = !id || id === 'baru'
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: salesList } = useDaftarSales()

  const [form, setForm] = useState<FormState>(KOSONG)
  const { data: provinsiList } = useWilayahProvinsi()
  const { data: kabupatenList } = useWilayahKabupatenKota(form.provinsi_kode || null)
  const { data: kecamatanList } = useWilayahKecamatan(form.kabupaten_kode || null)
  const { data: kelurahanList } = useWilayahKelurahan(form.kecamatan_kode || null)
  const [aktif, setAktif] = useState(true)
  const [menyimpan, setMenyimpan] = useState(false)
  const [error, setError] = useState<unknown>(null)

  // Kontak (nama PIC) & Telepon cuma relevan buat badan usaha -- Customer/Mitra
  // (kebanyakan B2C perorangan) cukup WhatsApp.
  const tampilkanKontakTelepon = form.tipe === 'horeka' || form.tipe === 'perusahaan'

  const provinsiTerpilih = provinsiList?.find((p) => p.kode === form.provinsi_kode)
  const kabupatenTerpilih = kabupatenList?.find((k) => k.kode === form.kabupaten_kode)
  const kecamatanTerpilih = kecamatanList?.find((k) => k.kode === form.kecamatan_kode)
  const kelurahanTerpilih = kelurahanList?.find((k) => k.kode === form.kelurahan_kode)

  const { data: existing, isLoading } = useQuery({
    queryKey: ['pelanggan-detail', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('pelanggan').select('*').eq('id', id as string).single()
      if (error) throw error
      return data as Pelanggan
    },
    enabled: !isBaru,
  })

  useEffect(() => {
    if (!existing) return
    setForm({
      kode: existing.kode,
      nama: existing.nama,
      tipe: existing.tipe,
      sales_id: existing.sales_id ?? '',
      kontak_nama: existing.kontak_nama ?? '',
      telepon: existing.telepon ?? '',
      whatsapp: existing.whatsapp ?? '',
      email: existing.email ?? '',
      provinsi_kode: existing.provinsi_kode ?? '',
      kabupaten_kode: existing.kabupaten_kode ?? '',
      kecamatan_kode: existing.kecamatan_kode ?? '',
      kelurahan_kode: existing.kelurahan_kode ?? '',
      alamat: existing.alamat ?? '',
      sosial_media: existing.sosial_media ?? '',
      tanggal_lahir: existing.tanggal_lahir ?? '',
      sumber: existing.sumber ?? '',
      sumber_custom: existing.sumber_custom ?? '',
    })
    setAktif(existing.aktif)
  }, [existing])

  function ubah<K extends keyof FormState>(kunci: K, nilai: FormState[K]) {
    setForm((f) => ({ ...f, [kunci]: nilai }))
  }

  // Ganti Tipe -> ID diprefix otomatis (mis. CST-), kecuali pelanggan lama
  // (isBaru false) atau user sudah mengetik sesuatu setelah prefix lama.
  function ubahTipe(tipe: TipePelanggan) {
    setForm((f) => {
      const prefixLama = PREFIX_TIPE[f.tipe]
      const bolehGantiKode = isBaru && (f.kode === '' || f.kode === prefixLama)
      return { ...f, tipe, kode: bolehGantiKode ? PREFIX_TIPE[tipe] : f.kode }
    })
  }

  // Ganti level yang lebih tinggi -> level di bawahnya jadi tidak valid lagi, kosongkan.
  function ubahProvinsi(kode: string) {
    setForm((f) => ({ ...f, provinsi_kode: kode, kabupaten_kode: '', kecamatan_kode: '', kelurahan_kode: '' }))
  }
  function ubahKabupaten(kode: string) {
    setForm((f) => ({ ...f, kabupaten_kode: kode, kecamatan_kode: '', kelurahan_kode: '' }))
  }
  function ubahKecamatan(kode: string) {
    setForm((f) => ({ ...f, kecamatan_kode: kode, kelurahan_kode: '' }))
  }

  async function simpan() {
    setError(null)
    if (!form.kode.trim() || !form.nama.trim()) {
      setError(new Error('Kode dan nama wajib diisi.'))
      return
    }

    // Tier harga, termin, limit kredit, tag, catatan sengaja tidak di sini
    // (form ini dipersingkat) -- kolomnya tetap ada di database dengan
    // default aman (COD, limit 0), dan tidak disentuh sama sekali oleh
    // update ini kalau pelanggan yang diedit sudah punya nilai sendiri.
    const payload = {
      kode: form.kode.trim(),
      nama: form.nama.trim(),
      tipe: form.tipe,
      sales_id: form.sales_id || null,
      kontak_nama: form.kontak_nama || null,
      telepon: form.telepon.trim() || null,
      whatsapp: form.whatsapp || null,
      email: form.email || null,
      provinsi_kode: form.provinsi_kode || null,
      kabupaten_kode: form.kabupaten_kode || null,
      kecamatan_kode: form.kecamatan_kode || null,
      kelurahan_kode: form.kelurahan_kode || null,
      alamat: form.alamat || null,
      sosial_media: form.sosial_media || null,
      tanggal_lahir: form.tanggal_lahir || null,
      sumber: form.sumber || null,
      sumber_custom: form.sumber === 'custom' ? form.sumber_custom || null : null,
    }

    setMenyimpan(true)
    try {
      if (isBaru) {
        const { data, error } = await supabase.from('pelanggan').insert(payload).select('id').single()
        if (error) throw error
        toast('Pelanggan tersimpan.')
        navigate(`/pelanggan/${data.id}`, { replace: true })
      } else {
        const { error } = await supabase.from('pelanggan').update(payload).eq('id', id)
        if (error) throw error
        toast('Pelanggan tersimpan.')
        queryClient.invalidateQueries({ queryKey: ['pelanggan-detail', id] })
        queryClient.invalidateQueries({ queryKey: ['pelanggan'] })
        navigate('/pelanggan')
      }
    } catch (e) {
      setError(ramahkanErrorSimpan(e, payload.kode))
    } finally {
      setMenyimpan(false)
    }
  }

  async function ubahAktif(nilai: boolean) {
    setAktif(nilai)
    if (!isBaru) {
      const { error } = await supabase.from('pelanggan').update({ aktif: nilai }).eq('id', id)
      if (error) setError(error)
      else {
        queryClient.invalidateQueries({ queryKey: ['pelanggan-detail', id] })
        queryClient.invalidateQueries({ queryKey: ['pelanggan'] })
      }
    }
  }

  if (!isBaru && isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/pelanggan">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">{isBaru ? 'Pelanggan Baru' : form.nama || '...'}</h1>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>ID</Label>
              <Input value={form.kode} onChange={(e) => ubah('kode', e.target.value.toUpperCase())} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipe</Label>
              <Select value={form.tipe} onChange={(e) => ubahTipe(e.target.value as TipePelanggan)}>
                {Object.entries(LABEL_TIPE).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Nama</Label>
            <Input value={form.nama} onChange={(e) => ubah('nama', e.target.value)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {tampilkanKontakTelepon ? (
              <div className="space-y-1.5">
                <Label>Kontak</Label>
                <Input
                  placeholder="Nama PIC/penanggung jawab"
                  value={form.kontak_nama}
                  onChange={(e) => ubah('kontak_nama', e.target.value)}
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label>Sales penanggung jawab</Label>
              <Select value={form.sales_id} onChange={(e) => ubah('sales_id', e.target.value)}>
                <option value="">-</option>
                {(salesList ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nama}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {tampilkanKontakTelepon ? (
              <div className="space-y-1.5">
                <Label>Telepon</Label>
                <Input value={form.telepon} onChange={(e) => ubah('telepon', e.target.value)} />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label>WhatsApp</Label>
              <Input
                placeholder={tampilkanKontakTelepon ? 'Kosongkan kalau sama dengan telepon' : undefined}
                value={form.whatsapp}
                onChange={(e) => ubah('whatsapp', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => ubah('email', e.target.value)} />
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Wilayah</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Provinsi</Label>
                <Combobox
                  value={form.provinsi_kode || null}
                  opsiTerpilih={provinsiTerpilih ? { value: provinsiTerpilih.kode, label: provinsiTerpilih.nama } : null}
                  onChange={(kode) => ubahProvinsi(kode)}
                  cariOpsi={buatCariWilayah(provinsiList)}
                  placeholder="Ketik untuk cari provinsi..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Kabupaten/Kota</Label>
                <Combobox
                  value={form.kabupaten_kode || null}
                  opsiTerpilih={kabupatenTerpilih ? { value: kabupatenTerpilih.kode, label: kabupatenTerpilih.nama } : null}
                  onChange={(kode) => ubahKabupaten(kode)}
                  cariOpsi={buatCariWilayah(kabupatenList)}
                  placeholder="Ketik untuk cari kabupaten/kota..."
                  disabled={!form.provinsi_kode}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Kecamatan</Label>
                <Combobox
                  value={form.kecamatan_kode || null}
                  opsiTerpilih={kecamatanTerpilih ? { value: kecamatanTerpilih.kode, label: kecamatanTerpilih.nama } : null}
                  onChange={(kode) => ubahKecamatan(kode)}
                  cariOpsi={buatCariWilayah(kecamatanList)}
                  placeholder="Ketik untuk cari kecamatan..."
                  disabled={!form.kabupaten_kode}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Kelurahan/Desa</Label>
                <Combobox
                  value={form.kelurahan_kode || null}
                  opsiTerpilih={
                    kelurahanTerpilih
                      ? { value: kelurahanTerpilih.kode, label: kelurahanTerpilih.nama, sublabel: kelurahanTerpilih.kode_pos ?? undefined }
                      : null
                  }
                  onChange={(kode) => ubah('kelurahan_kode', kode)}
                  cariOpsi={buatCariWilayah(kelurahanList, (k) => k.kode_pos ?? undefined)}
                  placeholder="Ketik untuk cari kelurahan/desa..."
                  disabled={!form.kecamatan_kode}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Alamat (nama jalan, nomor rumah, RT/RW)</Label>
              <Input value={form.alamat} onChange={(e) => ubah('alamat', e.target.value)} />
            </div>
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Sumber</Label>
                <Select value={form.sumber} onChange={(e) => ubah('sumber', e.target.value as SumberPelanggan | '')}>
                  <option value="">-</option>
                  {Object.entries(LABEL_SUMBER).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tanggal lahir</Label>
                <Input type="date" value={form.tanggal_lahir} onChange={(e) => ubah('tanggal_lahir', e.target.value)} />
              </div>
            </div>
            {form.sumber === 'custom' ? (
              <div className="space-y-1.5">
                <Label>Sumber (custom)</Label>
                <Input
                  placeholder="mis. Tokopedia, WhatsApp, pameran, ..."
                  value={form.sumber_custom}
                  onChange={(e) => ubah('sumber_custom', e.target.value)}
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label>Media sosial</Label>
              <Input
                placeholder="mis. IG: @nama, TikTok: @nama"
                value={form.sosial_media}
                onChange={(e) => ubah('sosial_media', e.target.value)}
              />
            </div>
          </div>

          {!isBaru ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={aktif} onChange={(e) => ubahAktif(e.target.checked)} className="h-4 w-4 rounded border-input" />
              Aktif
            </label>
          ) : null}

          {error ? <PesanError error={error} /> : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" asChild>
              <Link to="/pelanggan">Batal</Link>
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
