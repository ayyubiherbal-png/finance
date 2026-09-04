import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, Card, CardContent, Input, Label, PesanError, Spinner } from '@/components/ui'
import type { Supplier } from '@/types/db'

interface FormState {
  kode: string
  nama: string
  kontak_nama: string
  telepon: string
  email: string
  alamat: string
  kota: string
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
  alamat: '',
  kota: '',
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
  const [aktif, setAktif] = useState(true)
  const [menyimpan, setMenyimpan] = useState(false)
  const [error, setError] = useState<unknown>(null)

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
      alamat: existing.alamat ?? '',
      kota: existing.kota ?? '',
      npwp: existing.npwp ?? '',
      termin_hari: existing.termin_hari,
      catatan: existing.catatan ?? '',
    })
    setAktif(existing.aktif)
  }, [existing])

  function ubah<K extends keyof FormState>(kunci: K, nilai: FormState[K]) {
    setForm((f) => ({ ...f, [kunci]: nilai }))
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
      alamat: form.alamat || null,
      kota: form.kota || null,
      npwp: form.npwp || null,
      termin_hari: form.termin_hari,
      catatan: form.catatan || null,
    }

    setMenyimpan(true)
    try {
      if (isBaru) {
        const { data, error } = await supabase.from('supplier').insert(payload).select('id').single()
        if (error) throw error
        navigate(`/supplier/${data.id}`, { replace: true })
      } else {
        const { error } = await supabase.from('supplier').update(payload).eq('id', id)
        if (error) throw error
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => ubah('email', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Kota</Label>
              <Input value={form.kota} onChange={(e) => ubah('kota', e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Alamat</Label>
            <Input value={form.alamat} onChange={(e) => ubah('alamat', e.target.value)} />
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
