import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { tt } from '@/lib/i18nText'
import { ambilSemuaBertahap } from '@/lib/ambilSemua'
import { useKonfirmasi } from '@/components/Konfirmasi'
import { toast } from '@/components/Toast'
import { Button, Card, CardContent, Input, Label, PesanError, Select, Spinner } from '@/components/ui'
import type { AkunCoa, SaldoNormalCoa, TipeAkunCoa } from '@/types/db'

interface FormState {
  kode: string
  nama: string
  tipe: TipeAkunCoa
  saldo_normal: SaldoNormalCoa
  induk_id: string
}

const KOSONG: FormState = { kode: '', nama: '', tipe: 'aset', saldo_normal: 'debit', induk_id: '' }

const OPSI_TIPE: { nilai: TipeAkunCoa; label: string; saldoNormalDefault: SaldoNormalCoa }[] = [
  { nilai: 'aset', label: 'Aset', saldoNormalDefault: 'debit' },
  { nilai: 'liabilitas', label: 'Liabilitas', saldoNormalDefault: 'kredit' },
  { nilai: 'ekuitas', label: 'Ekuitas', saldoNormalDefault: 'kredit' },
  { nilai: 'pendapatan', label: 'Pendapatan', saldoNormalDefault: 'kredit' },
  { nilai: 'beban', label: 'Beban', saldoNormalDefault: 'debit' },
]

export function KategoriAkunForm() {
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
    queryKey: ['kategori-akun-detail', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('akun_coa').select('*').eq('id', id as string).single()
      if (error) throw error
      return data as AkunCoa
    },
    enabled: !isBaru,
  })

  const { data: daftarAkun } = useQuery({
    queryKey: ['akun-coa-semua'],
    queryFn: async () =>
      ambilSemuaBertahap<AkunCoa>((dari, sampai) =>
        supabase.from('akun_coa').select('*').order('kode').range(dari, sampai).returns<AkunCoa[]>(),
      ),
  })

  const opsiInduk = useMemo(() => (daftarAkun ?? []).filter((a) => a.id !== id), [daftarAkun, id])

  // Akun ini dipakai di jurnal_umum_baris/akun_kas_bank/kategori_biaya? Kalau
  // ya, JANGAN tawarkan hapus -- Postgres akan menolak (23503, on delete
  // restrict) dan sebagian trigger posting (0058-0061) mengacu ke kode akun
  // ini secara harfiah, jadi kode dikunci begitu akun sudah pernah dibuat.
  const { data: jumlahDipakai } = useQuery({
    queryKey: ['kategori-akun-jumlah-dipakai', id],
    queryFn: async () => {
      const { count, error } = await supabase.from('jurnal_umum_baris').select('id', { count: 'exact', head: true }).eq('akun_id', id as string)
      if (error) throw error
      return count ?? 0
    },
    enabled: !isBaru,
  })

  useEffect(() => {
    if (!existing) return
    setForm({
      kode: existing.kode,
      nama: existing.nama,
      tipe: existing.tipe,
      saldo_normal: existing.saldo_normal,
      induk_id: existing.induk_id ?? '',
    })
    setAktif(existing.aktif)
  }, [existing])

  function ubah<K extends keyof FormState>(kunci: K, nilai: FormState[K]) {
    setForm((f) => ({ ...f, [kunci]: nilai }))
  }

  function ubahTipe(tipe: TipeAkunCoa) {
    const opsi = OPSI_TIPE.find((o) => o.nilai === tipe)
    setForm((f) => ({ ...f, tipe, saldo_normal: opsi?.saldoNormalDefault ?? f.saldo_normal }))
  }

  function invalidateSemua() {
    queryClient.invalidateQueries({ queryKey: ['kategori-akun-list'] })
    queryClient.invalidateQueries({ queryKey: ['akun-coa-semua'] })
  }

  async function simpan() {
    setError(null)
    if (!form.kode.trim() || !form.nama.trim()) {
      setError(new Error(tt('Kode dan nama wajib diisi.')))
      return
    }
    setMenyimpan(true)
    try {
      if (isBaru) {
        const payload = {
          kode: form.kode.trim(),
          nama: form.nama.trim(),
          tipe: form.tipe,
          saldo_normal: form.saldo_normal,
          induk_id: form.induk_id || null,
        }
        const { data, error } = await supabase.from('akun_coa').insert(payload).select('id').single()
        if (error) throw error
        toast(tt('Akun tersimpan.'))
        invalidateSemua()
        navigate(`/kategori-akun/${data.id}`, { replace: true })
      } else {
        // kode SENGAJA tidak dikirim -- lihat catatan input kode di bawah.
        const payload = { nama: form.nama.trim(), tipe: form.tipe, saldo_normal: form.saldo_normal, induk_id: form.induk_id || null }
        const { error } = await supabase.from('akun_coa').update(payload).eq('id', id)
        if (error) throw error
        toast(tt('Akun tersimpan.'))
        queryClient.invalidateQueries({ queryKey: ['kategori-akun-detail', id] })
        invalidateSemua()
        navigate('/kategori-akun')
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
      const { error } = await supabase.from('akun_coa').update({ aktif: nilai }).eq('id', id)
      if (error) setError(error)
      else {
        queryClient.invalidateQueries({ queryKey: ['kategori-akun-detail', id] })
        invalidateSemua()
      }
    }
  }

  async function hapus() {
    if (jumlahDipakai && jumlahDipakai > 0) {
      setError(new Error(tt('Akun ini sudah dipakai di {n} baris jurnal -- tidak bisa dihapus. Nonaktifkan saja lewat checkbox Aktif di atas.').replace('{n}', String(jumlahDipakai))))
      return
    }
    if (!(await konfirmasi(tt('Hapus akun ini?'), { labelSetuju: 'Hapus', berbahaya: true }))) return
    setError(null)
    setMenghapus(true)
    try {
      const { error } = await supabase.from('akun_coa').delete().eq('id', id)
      if (error) throw error
      toast(tt('Akun dihapus.'))
      invalidateSemua()
      navigate('/kategori-akun')
    } catch (e) {
      const err = e as { code?: string }
      setError(
        err.code === '23503'
          ? new Error(tt('Tidak bisa dihapus -- akun ini masih dipakai (kas/bank, kategori biaya, atau akun anak). Nonaktifkan saja lewat checkbox Aktif di atas.'))
          : e,
      )
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
          <Link to="/kategori-akun">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{isBaru ? tt('Akun Baru') : form.nama || '...'}</h1>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Kode</Label>
              <Input value={form.kode} onChange={(e) => ubah('kode', e.target.value)} disabled={!isBaru} />
              {!isBaru ? (
                <p className="text-xs text-muted-foreground">
                  {tt('Kode tidak bisa diubah setelah dibuat -- sebagian logika posting jurnal mengacu ke kode akun ini secara langsung.')}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Nama</Label>
              <Input value={form.nama} onChange={(e) => ubah('nama', e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipe</Label>
              <Select value={form.tipe} onChange={(e) => ubahTipe(e.target.value as TipeAkunCoa)}>
                {OPSI_TIPE.map((o) => (
                  <option key={o.nilai} value={o.nilai}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{tt('Saldo Normal')}</Label>
              <Select value={form.saldo_normal} onChange={(e) => ubah('saldo_normal', e.target.value as SaldoNormalCoa)}>
                <option value="debit">Debit</option>
                <option value="kredit">Kredit</option>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{tt('Akun Induk (opsional)')}</Label>
            <Select value={form.induk_id} onChange={(e) => ubah('induk_id', e.target.value)}>
              <option value="">{tt('-- Tanpa induk --')}</option>
              {opsiInduk.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.kode} -- {a.nama}
                </option>
              ))}
            </Select>
          </div>

          {!isBaru ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={aktif} onChange={(e) => ubahAktif(e.target.checked)} className="h-4 w-4 rounded border-input" />
              {tt('Aktif')}
            </label>
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
                <Link to="/kategori-akun">Batal</Link>
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
