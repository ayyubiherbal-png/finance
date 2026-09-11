import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { tt } from '@/lib/i18nText'
import { useKonfirmasi } from '@/components/Konfirmasi'
import { toast } from '@/components/Toast'
import { Button, Card, CardContent, Input, Label, PesanError, Spinner } from '@/components/ui'
import type { KategoriBiaya } from '@/types/db'

interface FormState {
  kode: string
  nama: string
  operasional: boolean
}

const KOSONG: FormState = { kode: '', nama: '', operasional: true }

export function KategoriBiayaForm() {
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
    queryKey: ['kategori-biaya-detail', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('kategori_biaya').select('*').eq('id', id as string).single()
      if (error) throw error
      return data as KategoriBiaya
    },
    enabled: !isBaru,
  })

  // Jumlah Nama Pengeluaran di bawah kategori ini -- kategori TIDAK BOLEH
  // dihapus selama masih ada (nama_pengeluaran.kategori_biaya_id itu
  // `on delete restrict`, beda dari pola produk.kategori_id yang boleh
  // `set null`) -- jadi ini blokir dengan pesan jelas, bukan konfirmasi
  // "hapus paksa" yang ujung-ujungnya gagal di database.
  const { data: jumlahItem } = useQuery({
    queryKey: ['kategori-biaya-jumlah-item', id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('nama_pengeluaran')
        .select('id', { count: 'exact', head: true })
        .eq('kategori_biaya_id', id as string)
      if (error) throw error
      return count ?? 0
    },
    enabled: !isBaru,
  })

  useEffect(() => {
    if (!existing) return
    setForm({ kode: existing.kode, nama: existing.nama, operasional: existing.operasional })
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
    const payload = { kode: form.kode.trim().toUpperCase(), nama: form.nama.trim(), operasional: form.operasional }

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
    if (jumlahItem && jumlahItem > 0) {
      setError(new Error(tt('Masih ada {n} nama pengeluaran di kategori ini -- hapus atau pindahkan dulu sebelum menghapus kategorinya.').replace('{n}', String(jumlahItem))))
      return
    }
    if (!(await konfirmasi(tt('Hapus kategori ini?'), { labelSetuju: 'Hapus', berbahaya: true }))) return
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

          <div className="space-y-1.5 rounded-md border border-border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={form.operasional}
                onChange={(e) => ubah('operasional', e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              {tt('Biaya operasional')}
            </label>
            <p className="text-xs text-muted-foreground">
              {form.operasional
                ? tt('Pengeluaran di kategori ini dihitung sebagai Biaya Operasional & mengurangi Laba Bersih di Dashboard/Laporan.')
                : tt('Cocok untuk modal, ambil pribadi, dll -- tetap mengurangi saldo kas, TAPI TIDAK dihitung sebagai Biaya Operasional/Laba Bersih.')}
            </p>
          </div>

          {!isBaru ? (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={aktif} onChange={(e) => ubahAktif(e.target.checked)} className="h-4 w-4 rounded border-input" />
                {tt('Aktif')}
              </label>
              <p className="text-xs text-muted-foreground">
                {jumlahItem === undefined
                  ? tt('Memuat jumlah nama pengeluaran...')
                  : tt('{n} nama pengeluaran di kategori ini.').replace('{n}', String(jumlahItem))}
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
