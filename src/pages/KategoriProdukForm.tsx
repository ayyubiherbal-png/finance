import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { tt } from '@/lib/i18nText'
import { useKonfirmasi } from '@/components/Konfirmasi'
import { toast } from '@/components/Toast'
import { Button, Card, CardContent, Input, Label, PesanError, Spinner } from '@/components/ui'
import type { KategoriProduk } from '@/types/db'

interface FormState {
  kode: string
  nama: string
}

const KOSONG: FormState = { kode: '', nama: '' }

export function KategoriProdukForm() {
  const konfirmasi = useKonfirmasi()
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
    queryKey: ['kategori-produk-detail', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('kategori_produk').select('*').eq('id', id as string).single()
      if (error) throw error
      return data as KategoriProduk
    },
    enabled: !isBaru,
  })

  // Jumlah produk yang masih pakai kategori ini -- dicek supaya "Hapus" bisa
  // memperingatkan dulu, BUKAN dihapus diam-diam lalu produknya mendadak jadi
  // "Tanpa kategori" tanpa ada yang tahu.
  const { data: jumlahProduk } = useQuery({
    queryKey: ['kategori-produk-jumlah-produk', id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('produk')
        .select('id', { count: 'exact', head: true })
        .eq('kategori_id', id as string)
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
    queryClient.invalidateQueries({ queryKey: ['kategori-produk-list'] })
    queryClient.invalidateQueries({ queryKey: ['kategori-produk'] }) // dipakai dropdown form Produk
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
        const { data, error } = await supabase.from('kategori_produk').insert(payload).select('id').single()
        if (error) throw error
        toast('Kategori tersimpan.')
        invalidateSemua()
        navigate(`/kategori-produk/${data.id}`, { replace: true })
      } else {
        const { error } = await supabase.from('kategori_produk').update(payload).eq('id', id)
        if (error) throw error
        toast('Kategori tersimpan.')
        queryClient.invalidateQueries({ queryKey: ['kategori-produk-detail', id] })
        invalidateSemua()
        navigate('/kategori-produk')
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
      const { error } = await supabase.from('kategori_produk').update({ aktif: nilai }).eq('id', id)
      if (error) setError(error)
      else {
        queryClient.invalidateQueries({ queryKey: ['kategori-produk-detail', id] })
        invalidateSemua()
      }
    }
  }

  async function hapus() {
    const peringatan =
      jumlahProduk && jumlahProduk > 0
        ? tt('{n} produk masih pakai kategori ini -- semuanya akan jadi "Tanpa kategori". Yakin hapus?').replace('{n}', String(jumlahProduk))
        : tt('Hapus kategori ini?')
    if (!(await konfirmasi(peringatan, { labelSetuju: 'Hapus', berbahaya: true }))) return
    setError(null)
    setMenghapus(true)
    try {
      const { error } = await supabase.from('kategori_produk').delete().eq('id', id)
      if (error) throw error
      toast('Kategori dihapus.')
      invalidateSemua()
      navigate('/kategori-produk')
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
          <Link to="/kategori-produk">
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
                {jumlahProduk === undefined
                  ? tt('Memuat jumlah produk...')
                  : tt('{n} produk pakai kategori ini.').replace('{n}', String(jumlahProduk))}
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
                <Link to="/kategori-produk">Batal</Link>
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
