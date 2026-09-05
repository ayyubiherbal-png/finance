import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/Toast'
import {
  useWilayahProvinsi,
  useWilayahKabupatenKota,
  useWilayahKecamatan,
  useWilayahKelurahan,
  buatCariWilayah,
} from '@/lib/queries'
import { Button, Card, CardContent, Input, Label, PesanError, Spinner } from '@/components/ui'
import { Combobox } from '@/components/Combobox'
import type { Supplier } from '@/types/db'

interface FormState {
  kode: string
  nama: string
  kontak_nama: string
  telepon: string
  email: string
  provinsi_kode: string
  kabupaten_kode: string
  kecamatan_kode: string
  kelurahan_kode: string
  alamat: string
  npwp: string
  termin_hari: number
  catatan: string
}

const KOSONG: FormState = {
  kode: '',
  nama: '',
  kontak_nama: '',
  telepon: '',
  email: '',
  provinsi_kode: '',
  kabupaten_kode: '',
  kecamatan_kode: '',
  kelurahan_kode: '',
  alamat: '',
  npwp: '',
  termin_hari: 0,
  catatan: '',
}

export function SupplierForm() {
  const { id } = useParams<{ id: string }>()
  const isBaru = !id || id === 'baru'
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<FormState>(KOSONG)
  const { data: provinsiList } = useWilayahProvinsi()
  const { data: kabupatenList } = useWilayahKabupatenKota(form.provinsi_kode || null)
  const { data: kecamatanList } = useWilayahKecamatan(form.kabupaten_kode || null)
  const { data: kelurahanList } = useWilayahKelurahan(form.kecamatan_kode || null)
  const [aktif, setAktif] = useState(true)
  const [menyimpan, setMenyimpan] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const provinsiTerpilih = provinsiList?.find((p) => p.kode === form.provinsi_kode)
  const kabupatenTerpilih = kabupatenList?.find((k) => k.kode === form.kabupaten_kode)
  const kecamatanTerpilih = kecamatanList?.find((k) => k.kode === form.kecamatan_kode)
  const kelurahanTerpilih = kelurahanList?.find((k) => k.kode === form.kelurahan_kode)

  const { data: existing, isLoading } = useQuery({
    queryKey: ['supplier-detail', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('supplier').select('*').eq('id', id as string).single()
      if (error) throw error
      return data as Supplier
    },
    enabled: !isBaru,
  })

  useEffect(() => {
    if (!existing) return
    setForm({
      kode: existing.kode,
      nama: existing.nama,
      kontak_nama: existing.kontak_nama ?? '',
      telepon: existing.telepon ?? '',
      email: existing.email ?? '',
      provinsi_kode: existing.provinsi_kode ?? '',
      kabupaten_kode: existing.kabupaten_kode ?? '',
      kecamatan_kode: existing.kecamatan_kode ?? '',
      kelurahan_kode: existing.kelurahan_kode ?? '',
      alamat: existing.alamat ?? '',
      npwp: existing.npwp ?? '',
      termin_hari: existing.termin_hari,
      catatan: existing.catatan ?? '',
    })
    setAktif(existing.aktif)
  }, [existing])

  function ubah<K extends keyof FormState>(kunci: K, nilai: FormState[K]) {
    setForm((f) => ({ ...f, [kunci]: nilai }))
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

    const payload = {
      kode: form.kode.trim(),
      nama: form.nama.trim(),
      kontak_nama: form.kontak_nama || null,
      telepon: form.telepon || null,
      email: form.email || null,
      provinsi_kode: form.provinsi_kode || null,
      kabupaten_kode: form.kabupaten_kode || null,
      kecamatan_kode: form.kecamatan_kode || null,
      kelurahan_kode: form.kelurahan_kode || null,
      alamat: form.alamat || null,
      npwp: form.npwp || null,
      termin_hari: form.termin_hari,
      catatan: form.catatan || null,
    }

    setMenyimpan(true)
    try {
      if (isBaru) {
        const { data, error } = await supabase.from('supplier').insert(payload).select('id').single()
        if (error) throw error
        toast('Supplier tersimpan.')
        navigate(`/supplier/${data.id}`, { replace: true })
      } else {
        const { error } = await supabase.from('supplier').update(payload).eq('id', id)
        if (error) throw error
        toast('Supplier tersimpan.')
        queryClient.invalidateQueries({ queryKey: ['supplier-detail', id] })
        queryClient.invalidateQueries({ queryKey: ['supplier'] })
        navigate('/supplier')
      }
    } catch (e) {
      setError(e)
    } finally {
      setMenyimpan(false)
    }
  }

  async function ubahAktif(nilai: boolean) {
    setAktif(nilai)
    if (!isBaru) {
      const { error } = await supabase.from('supplier').update({ aktif: nilai }).eq('id', id)
      if (error) setError(error)
      else {
        queryClient.invalidateQueries({ queryKey: ['supplier-detail', id] })
        queryClient.invalidateQueries({ queryKey: ['supplier'] })
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
          <Link to="/supplier">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">{isBaru ? 'Supplier Baru' : form.nama || '...'}</h1>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Kode</Label>
              <Input value={form.kode} onChange={(e) => ubah('kode', e.target.value.toUpperCase())} />
            </div>
            <div className="space-y-1.5">
              <Label>Nama</Label>
              <Input value={form.nama} onChange={(e) => ubah('nama', e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Kontak</Label>
              <Input value={form.kontak_nama} onChange={(e) => ubah('kontak_nama', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Telepon</Label>
              <Input value={form.telepon} onChange={(e) => ubah('telepon', e.target.value)} />
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
              <Label>Alamat (nama jalan, nomor, RT/RW)</Label>
              <Input value={form.alamat} onChange={(e) => ubah('alamat', e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>NPWP</Label>
              <Input value={form.npwp} onChange={(e) => ubah('npwp', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Termin bayar (hari)</Label>
              <Input
                type="number"
                min={0}
                value={form.termin_hari}
                onChange={(e) => ubah('termin_hari', Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Catatan</Label>
            <Input value={form.catatan} onChange={(e) => ubah('catatan', e.target.value)} />
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
              <Link to="/supplier">Batal</Link>
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
