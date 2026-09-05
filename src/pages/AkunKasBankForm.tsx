import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/Toast'
import { rupiah } from '@/lib/format'
import { Button, Card, CardContent, Input, InputAngka, Label, PesanError, Select, Spinner } from '@/components/ui'
import type { AkunKasBank, JenisAkunKas, VSaldoKasBank } from '@/types/db'

interface FormState {
  kode: string
  nama: string
  jenis: JenisAkunKas
  bank_nama: string
  nomor_rekening: string
  atas_nama: string
  saldo_awal: number
  catatan: string
}

const KOSONG: FormState = {
  kode: '',
  nama: '',
  jenis: 'kas',
  bank_nama: '',
  nomor_rekening: '',
  atas_nama: '',
  saldo_awal: 0,
  catatan: '',
}

export function AkunKasBankForm() {
  const { id } = useParams<{ id: string }>()
  const isBaru = !id || id === 'baru'
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<FormState>(KOSONG)
  const [aktif, setAktif] = useState(true)
  const [menyimpan, setMenyimpan] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const { data: existing, isLoading } = useQuery({
    queryKey: ['akun-kas-bank-detail', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('akun_kas_bank').select('*').eq('id', id as string).single()
      if (error) throw error
      return data as AkunKasBank
    },
    enabled: !isBaru,
  })

  const { data: saldo } = useQuery({
    queryKey: ['akun-kas-bank-saldo', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_saldo_kas_bank')
        .select('saldo')
        .eq('akun_id', id as string)
        .single()
      if (error) throw error
      return data as Pick<VSaldoKasBank, 'saldo'>
    },
    enabled: !isBaru,
  })

  useEffect(() => {
    if (!existing) return
    setForm({
      kode: existing.kode,
      nama: existing.nama,
      jenis: existing.jenis,
      bank_nama: existing.bank_nama ?? '',
      nomor_rekening: existing.nomor_rekening ?? '',
      atas_nama: existing.atas_nama ?? '',
      saldo_awal: existing.saldo_awal,
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
      jenis: form.jenis,
      bank_nama: form.jenis === 'bank' ? form.bank_nama || null : null,
      nomor_rekening: form.jenis === 'bank' ? form.nomor_rekening || null : null,
      atas_nama: form.jenis === 'bank' ? form.atas_nama || null : null,
      saldo_awal: form.saldo_awal,
      catatan: form.catatan || null,
    }

    setMenyimpan(true)
    try {
      if (isBaru) {
        const { data, error } = await supabase.from('akun_kas_bank').insert(payload).select('id').single()
        if (error) throw error
        toast('Akun tersimpan.')
        navigate(`/kas-bank/${data.id}`, { replace: true })
      } else {
        const { error } = await supabase.from('akun_kas_bank').update(payload).eq('id', id)
        if (error) throw error
        toast('Akun tersimpan.')
        queryClient.invalidateQueries({ queryKey: ['akun-kas-bank-detail', id] })
        queryClient.invalidateQueries({ queryKey: ['akun-kas-bank-saldo', id] })
        queryClient.invalidateQueries({ queryKey: ['akun-kas-bank'] })
        navigate('/kas-bank')
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
      const { error } = await supabase.from('akun_kas_bank').update({ aktif: nilai }).eq('id', id)
      if (error) setError(error)
      else {
        queryClient.invalidateQueries({ queryKey: ['akun-kas-bank-detail', id] })
        queryClient.invalidateQueries({ queryKey: ['akun-kas-bank'] })
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
          <Link to="/kas-bank">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{isBaru ? 'Akun Kas/Bank Baru' : form.nama || '...'}</h1>
        </div>
        {!isBaru && saldo ? (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Saldo berjalan</p>
            <p className="tabular text-lg font-semibold">{rupiah(saldo.saldo)}</p>
          </div>
        ) : null}
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Kode</Label>
              <Input value={form.kode} onChange={(e) => ubah('kode', e.target.value.toUpperCase())} />
            </div>
            <div className="space-y-1.5">
              <Label>Jenis</Label>
              <Select value={form.jenis} onChange={(e) => ubah('jenis', e.target.value as JenisAkunKas)}>
                <option value="kas">Kas (tunai)</option>
                <option value="bank">Bank</option>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Nama</Label>
            <Input placeholder="mis. Kas Toko, BCA Ayyubi Food" value={form.nama} onChange={(e) => ubah('nama', e.target.value)} />
          </div>

          {form.jenis === 'bank' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Nama bank</Label>
                  <Input placeholder="BCA, Mandiri, ..." value={form.bank_nama} onChange={(e) => ubah('bank_nama', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>No. rekening</Label>
                  <Input value={form.nomor_rekening} onChange={(e) => ubah('nomor_rekening', e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Atas nama</Label>
                <Input value={form.atas_nama} onChange={(e) => ubah('atas_nama', e.target.value)} />
              </div>
            </>
          ) : null}

          <div className="space-y-1.5">
            <Label>Saldo awal</Label>
            <InputAngka value={form.saldo_awal} onChange={(nilai) => ubah('saldo_awal', nilai)} />
            {!isBaru ? (
              <p className="text-xs text-muted-foreground">
                Saldo dihitung ulang otomatis (saldo awal + semua transaksi), jadi mengubah ini langsung
                mengubah saldo berjalan di kanan atas -- pakai kalau ada salah input di awal, bukan buat "menambah" saldo.
              </p>
            ) : null}
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
              <Link to="/kas-bank">Batal</Link>
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
