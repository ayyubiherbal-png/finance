import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { tt } from '@/lib/i18nText'
import { toast } from '@/components/Toast'
import { Button, Card, CardContent, Input, Label, PesanError, Spinner } from '@/components/ui'
import type { KategoriBiaya } from '@/types/db'

interface FormState {
  kode: string
  nama: string
}

const KOSONG: FormState = { kode: '', nama: '' }

export function KategoriBiayaForm() {
  const { id } = useParams<{ id: string }>()
  const isBaru = !id || id === 'baru'
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<FormState>(KOSONG)
  const [aktif, setAktif] = useState(true)
  const [menyimpan, setMenyimpan] = useState(false)
  const [menghapus, setMenghapus] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const { data: existing, isLoading } = useQuery({
    queryKey: ['kategori-biaya-detail', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('kategori_biaya').select('*').eq('id', id as string).single()
      if (error) throw error
      return data as KategoriBiaya
    },
    enabled: !isBaru,
  })

  // Jumlah pengeluaran kas yang masih pakai kategori ini -- dicek supaya
  // "Hapus" bisa memperingatkan dulu, BUKAN dihapus diam-diam lalu
  // riwayat pengeluarannya mendadak jadi "Tanpa kategori" tanpa ada yang tahu.
  const { data: jumlahPengeluaran } = useQuery({
    queryKey: ['kategori-biaya-jumlah-pengeluaran', id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('pengeluaran_kas')
        .select('id', { count: 'exact', head: true })
        .eq('kategori_biaya_id', id as string)
      if (error) throw error
      return count ?? 0
    },
    enabled: !isBaru,
  })

  useEffect(() => {
    if (!existing) return
    setForm({ kode: existing.kode, nama: existing.nama })
    setAktif(existing.aktif)
  }, [existing])

  function ubah<K extends keyof FormState>(kunci: K, nilai: FormState[K]) {
    setForm((f) => ({ ...f, [kunci]: nilai }))
  }

  function invalidateSemua() {
    queryClient.invalidateQueries({ queryKey: ['kategori-biaya-list'] })
    queryClient.invalidateQueries({ queryKey: ['kategori-biaya-aktif'] }) // dipakai dropdown form Pengeluaran Kas
  }

  async function simpan() {
    setError(null)
    if (!form.kode.trim() || !form.nama.trim()) {
      setError(new Error('Kode dan nama wajib diisi.'))
      return
    }
    const payload = { kode: form.kode.trim().toUpperCase(), nama: form.nama.trim() }

    setMenyimpan(true)
    try {
      if (isBaru) {
        const { data, error } = await supabase.from('kategori_biaya').insert(payload).select('id').single()
        if (error) throw error
        toast('Kategori tersimpan.')
        invalidateSemua()
        navigate(`/kategori-biaya/${data.id}`, { replace: true })
      } else {
        const { error } = await supabase.from('kategori_biaya').update(payload).eq('id', id)
        if (error) throw error
        toast('Kategori tersimpan.')
        queryClient.invalidateQueries({ queryKey: ['kategori-biaya-detail', id] })
        invalidateSemua()
        navigate('/kategori-biaya')
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
      const { error } = await supabase.from('kategori_biaya').update({ aktif: nilai }).eq('id', id)
      if (error) setError(error)
      else {
        queryClient.invalidateQueries({ queryKey: ['kategori-biaya-detail', id] })
        invalidateSemua()
      }
    }
  }

  async function hapus() {
    const peringatan =
      jumlahPengeluaran && jumlahPengeluaran > 0
        ? tt('{n} pengeluaran kas masih pakai kategori ini -- kategorinya akan jadi kosong. Yakin hapus?').replace(
            '{n}',
            String(jumlahPengeluaran),
          )
        : tt('Hapus kategori ini?')
    if (!window.confirm(peringatan)) return
    setError(null)
    setMenghapus(true)
    try {
      const { error } = await supabase.from('kategori_biaya').delete().eq('id', id)
      if (error) throw error
      toast('Kategori dihapus.')
      invalidateSemua()
      navigate('/kategori-biaya')
    } catch (e) {
      setError(e)
      setMenghapus(false)
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
          <Link to="/kategori-biaya">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{isBaru ? tt('Kategori Baru') : form.nama || '...'}</h1>
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

          {!isBaru ? (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={aktif} onChange={(e) => ubahAktif(e.target.checked)} className="h-4 w-4 rounded border-input" />
                {tt('Aktif')}
              </label>
              <p className="text-xs text-muted-foreground">
                {jumlahPengeluaran === undefined
                  ? tt('Memuat jumlah pengeluaran...')
                  : tt('{n} pengeluaran kas pakai kategori ini.').replace('{n}', String(jumlahPengeluaran))}
              </p>
            </>
          ) : null}

          {error ? <PesanError error={error} /> : null}

          <div className="flex items-center justify-between gap-2 pt-2">
            {!isBaru ? (
              <Button variant="outline" onClick={hapus} disabled={menghapus}>
                {menghapus ? <Spinner className="h-3.5 w-3.5" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                {tt('Hapus')}
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link to="/kategori-biaya">Batal</Link>
              </Button>
              <Button onClick={simpan} disabled={menyimpan}>
                {menyimpan ? <Spinner /> : null}
                Simpan
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
