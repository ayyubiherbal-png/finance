import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { tt } from '@/lib/i18nText'
import { useKonfirmasi } from '@/components/Konfirmasi'
import { useKategoriBiayaAktif } from '@/lib/queries'
import { toast } from '@/components/Toast'
import { Button, Card, CardContent, Input, Label, PesanError, Select, Spinner } from '@/components/ui'
import type { NamaPengeluaran } from '@/types/db'

interface FormState {
  kategori_biaya_id: string
  kode: string
  nama: string
}

const KOSONG: FormState = { kategori_biaya_id: '', kode: '', nama: '' }

/** Saran kode sub berikutnya di bawah satu kategori -- kode kategori
 * numerik (mis. "6300") lanjut angka berurutan (6301, 6302, ...); kode
 * non-numerik (mis. "OPS") pakai pola "KODE-01", "KODE-02", dst. */
function saranKodeBerikutnya(kodeKategori: string, kodeTerpakai: string[]): string {
  if (/^\d+$/.test(kodeKategori)) {
    const basis = parseInt(kodeKategori, 10)
    const angkaTerpakai = kodeTerpakai.map((k) => parseInt(k, 10)).filter((n) => !Number.isNaN(n))
    const terbesar = angkaTerpakai.length > 0 ? Math.max(...angkaTerpakai) : basis
    return String(terbesar + 1)
  }
  const urutan = kodeTerpakai.filter((k) => k.startsWith(`${kodeKategori}-`)).length + 1
  return `${kodeKategori}-${String(urutan).padStart(2, '0')}`
}

export function NamaPengeluaranForm() {
  const konfirmasi = useKonfirmasi()
  const { id } = useParams<{ id: string }>()
  const isBaru = !id || id === 'baru'
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()

  const { data: kategoriAktif } = useKategoriBiayaAktif()

  const [form, setForm] = useState<FormState>({ ...KOSONG, kategori_biaya_id: searchParams.get('kategori') ?? '' })
  const [aktif, setAktif] = useState(true)
  const [menyimpan, setMenyimpan] = useState(false)
  const [menghapus, setMenghapus] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const namaRef = useRef<HTMLInputElement>(null)

  // Kode sub-item berikutnya disarankan otomatis dari kategori terpilih --
  // supaya nambah banyak item berurutan (6301, 6302, 6303, ...) tidak
  // perlu ketik manual tiap kali. `kodeOtomatis` mati begitu user ketik
  // sendiri, supaya tidak menimpa yang sudah diketik.
  const [kodeOtomatis, setKodeOtomatis] = useState(true)
  const { data: kodeSekategori } = useQuery({
    queryKey: ['nama-pengeluaran-oleh-kategori', form.kategori_biaya_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('nama_pengeluaran').select('kode').eq('kategori_biaya_id', form.kategori_biaya_id)
      if (error) throw error
      return (data ?? []).map((r) => r.kode)
    },
    enabled: isBaru && !!form.kategori_biaya_id,
  })
  const kategoriTerpilih = (kategoriAktif ?? []).find((k) => k.id === form.kategori_biaya_id)

  useEffect(() => {
    if (!isBaru || !kodeOtomatis || !kategoriTerpilih || !kodeSekategori) return
    setForm((f) => ({ ...f, kode: saranKodeBerikutnya(kategoriTerpilih.kode, kodeSekategori) }))
  }, [isBaru, kodeOtomatis, kategoriTerpilih, kodeSekategori])

  const { data: existing, isLoading } = useQuery({
    queryKey: ['nama-pengeluaran-detail', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('nama_pengeluaran').select('*').eq('id', id as string).single()
      if (error) throw error
      return data as NamaPengeluaran
    },
    enabled: !isBaru,
  })

  // Jumlah Pengeluaran Kas yang sudah pakai item ini -- nama_pengeluaran_id
  // di pengeluaran_kas itu `on delete restrict`, jadi item TIDAK BOLEH
  // dihapus selama masih dipakai riwayat -- blokir dengan pesan jelas.
  const { data: jumlahPengeluaran } = useQuery({
    queryKey: ['nama-pengeluaran-jumlah-pengeluaran', id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('pengeluaran_kas')
        .select('id', { count: 'exact', head: true })
        .eq('nama_pengeluaran_id', id as string)
      if (error) throw error
      return count ?? 0
    },
    enabled: !isBaru,
  })

  useEffect(() => {
    if (!existing) return
    setForm({ kategori_biaya_id: existing.kategori_biaya_id, kode: existing.kode, nama: existing.nama })
    setAktif(existing.aktif)
  }, [existing])

  function ubah<K extends keyof FormState>(kunci: K, nilai: FormState[K]) {
    setForm((f) => ({ ...f, [kunci]: nilai }))
  }

  function invalidateSemua() {
    queryClient.invalidateQueries({ queryKey: ['kategori-biaya-list'] })
    queryClient.invalidateQueries({ queryKey: ['nama-pengeluaran-aktif'] }) // dipakai dropdown form Pengeluaran Kas
  }

  async function simpan() {
    setError(null)
    if (!form.kategori_biaya_id) {
      setError(new Error('Pilih kategori.'))
      return
    }
    if (!form.kode.trim() || !form.nama.trim()) {
      setError(new Error('Kode dan nama wajib diisi.'))
      return
    }
    const payload = { kategori_biaya_id: form.kategori_biaya_id, kode: form.kode.trim().toUpperCase(), nama: form.nama.trim() }

    setMenyimpan(true)
    try {
      if (isBaru) {
        const { error } = await supabase.from('nama_pengeluaran').insert(payload)
        if (error) throw error
        toast('Nama pengeluaran tersimpan.')
        invalidateSemua()
        // Tetap di form ini (bukan pindah ke halaman detail) supaya nambah
        // banyak item berurutan di kategori yang sama cukup isi Nama lalu
        // Simpan berkali-kali -- tidak perlu klik "Tambah" ulang tiap item.
        queryClient.setQueryData<string[]>(['nama-pengeluaran-oleh-kategori', form.kategori_biaya_id], (lama) => [
          ...(lama ?? []),
          payload.kode,
        ])
        setForm((f) => ({ ...f, kode: '', nama: '' }))
        setKodeOtomatis(true)
        namaRef.current?.focus()
      } else {
        const { error } = await supabase.from('nama_pengeluaran').update(payload).eq('id', id)
        if (error) throw error
        toast('Nama pengeluaran tersimpan.')
        queryClient.invalidateQueries({ queryKey: ['nama-pengeluaran-detail', id] })
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
      const { error } = await supabase.from('nama_pengeluaran').update({ aktif: nilai }).eq('id', id)
      if (error) setError(error)
      else {
        queryClient.invalidateQueries({ queryKey: ['nama-pengeluaran-detail', id] })
        invalidateSemua()
      }
    }
  }

  async function hapus() {
    if (jumlahPengeluaran && jumlahPengeluaran > 0) {
      setError(
        new Error(
          tt('Masih ada {n} Pengeluaran Kas yang pakai nama pengeluaran ini -- tidak bisa dihapus.').replace('{n}', String(jumlahPengeluaran)),
        ),
      )
      return
    }
    if (!(await konfirmasi(tt('Hapus nama pengeluaran ini?'), { labelSetuju: 'Hapus', berbahaya: true }))) return
    setError(null)
    setMenghapus(true)
    try {
      const { error } = await supabase.from('nama_pengeluaran').delete().eq('id', id)
      if (error) throw error
      toast('Nama pengeluaran dihapus.')
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
        <h1 className="text-2xl font-bold tracking-tight">{isBaru ? tt('Nama Pengeluaran Baru') : form.nama || '...'}</h1>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label>Kategori</Label>
            <Select value={form.kategori_biaya_id} onChange={(e) => ubah('kategori_biaya_id', e.target.value)}>
              <option value="" disabled>
                Pilih kategori...
              </option>
              {(kategoriAktif ?? []).map((k) => (
                <option key={k.id} value={k.id}>
                  {k.kode} - {k.nama}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Kode</Label>
              <Input
                value={form.kode}
                onChange={(e) => {
                  setKodeOtomatis(false)
                  ubah('kode', e.target.value.toUpperCase())
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nama Pengeluaran</Label>
              <Input ref={namaRef} value={form.nama} onChange={(e) => ubah('nama', e.target.value)} />
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
                  : tt('{n} Pengeluaran Kas pakai nama pengeluaran ini.').replace('{n}', String(jumlahPengeluaran))}
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
                <Link to="/kategori-biaya">{isBaru ? 'Selesai' : 'Batal'}</Link>
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
