import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/Toast'
import { Button, Card, CardContent, Input, Label, PesanError, Spinner } from '@/components/ui'
import type { Gudang } from '@/types/db'

interface FormState {
  kode: string
  nama: string
  alamat: string
  utama: boolean
}

const KOSONG: FormState = {
  kode: '',
  nama: '',
  alamat: '',
  utama: false,
}

export function GudangForm() {
  const { id } = useParams<{ id: string }>()
  const isBaru = !id || id === 'baru'
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<FormState>(KOSONG)
  const [aktif, setAktif] = useState(true)
  const [menyimpan, setMenyimpan] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const { data: existing, isLoading } = useQuery({
    queryKey: ['gudang-detail', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('gudang').select('*').eq('id', id as string).single()
      if (error) throw error
      return data as Gudang
    },
    enabled: !isBaru,
  })

  useEffect(() => {
    if (!existing) return
    setForm({
      kode: existing.kode,
      nama: existing.nama,
      alamat: existing.alamat ?? '',
      utama: existing.utama,
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
      alamat: form.alamat || null,
      utama: form.utama,
    }

    setMenyimpan(true)
    try {
      // Cuma boleh 1 gudang utama (dijaga unique partial index di DB juga) --
      // lepas status utama dari gudang lain dulu sebelum set yang ini.
      if (form.utama) {
        const { error: errLepas } = await supabase
          .from('gudang')
          .update({ utama: false })
          .eq('utama', true)
          .neq('id', isBaru ? '00000000-0000-0000-0000-000000000000' : (id as string))
        if (errLepas) throw errLepas
      }

      if (isBaru) {
        const { data, error } = await supabase.from('gudang').insert(payload).select('id').single()
        if (error) throw error
        toast('Gudang tersimpan.')
        navigate(`/gudang/${data.id}`, { replace: true })
      } else {
        const { error } = await supabase.from('gudang').update(payload).eq('id', id)
        if (error) throw error
        toast('Gudang tersimpan.')
        queryClient.invalidateQueries({ queryKey: ['gudang-detail', id] })
        queryClient.invalidateQueries({ queryKey: ['gudang'] })
        queryClient.invalidateQueries({ queryKey: ['gudang-aktif'] })
        navigate('/gudang')
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
      const { error } = await supabase.from('gudang').update({ aktif: nilai }).eq('id', id)
      if (error) setError(error)
      else {
        queryClient.invalidateQueries({ queryKey: ['gudang-detail', id] })
        queryClient.invalidateQueries({ queryKey: ['gudang'] })
        queryClient.invalidateQueries({ queryKey: ['gudang-aktif'] })
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
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/gudang">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">{isBaru ? 'Gudang Baru' : form.nama || '...'}</h1>
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

          <div className="space-y-1.5">
            <Label>Alamat</Label>
            <Input value={form.alamat} onChange={(e) => ubah('alamat', e.target.value)} />
            <p className="text-xs text-muted-foreground">Dipakai di kop dokumen cetak (Invoice, dll.) untuk gudang utama.</p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.utama}
              onChange={(e) => ubah('utama', e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Jadikan gudang utama
          </label>

          {!isBaru ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={aktif} onChange={(e) => ubahAktif(e.target.checked)} className="h-4 w-4 rounded border-input" />
              Aktif
            </label>
          ) : null}

          {error ? <PesanError error={error} /> : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" asChild>
              <Link to="/gudang">Batal</Link>
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
