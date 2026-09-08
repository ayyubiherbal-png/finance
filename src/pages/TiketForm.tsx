import { useEffect, useState } from 'react'
import { tt } from '@/lib/i18nText'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useProfilAktif, cariPelanggan } from '@/lib/queries'
import { tanggalISO, tanggal as fmtTanggal } from '@/lib/format'
import { Combobox, type OpsiCombobox } from '@/components/Combobox'
import { toast } from '@/components/Toast'
import { Badge, Button, Card, CardContent, Input, Label, PesanError, Select, Spinner, Textarea } from '@/components/ui'
import { LABEL_PRIORITAS, LABEL_STATUS_TIKET, VARIAN_STATUS_TIKET } from '@/pages/Tiket'
import type { PrioritasTiket, StatusTiket, Tiket as TiketRow } from '@/types/db'

interface FormState {
  tanggal: string
  pelanggan_id: string | null
  pelangganLabel: OpsiCombobox | null
  faktur_id: string | null
  fakturLabel: OpsiCombobox | null
  judul: string
  deskripsi: string
  prioritas: PrioritasTiket
  ditugaskan_ke: string
}

const KOSONG: FormState = {
  tanggal: tanggalISO(),
  pelanggan_id: null,
  pelangganLabel: null,
  faktur_id: null,
  fakturLabel: null,
  judul: '',
  deskripsi: '',
  prioritas: 'sedang',
  ditugaskan_ke: '',
}

/** Faktur pelanggan yang sedang dipilih -- referensi opsional, bukan trigger apa pun. */
function buatCariFaktur(pelangganId: string | null) {
  return async (kueri: string): Promise<OpsiCombobox[]> => {
    if (!pelangganId) return []
    let q = supabase
      .from('faktur_penjualan')
      .select('id, nomor, tanggal')
      .eq('pelanggan_id', pelangganId)
      .order('tanggal', { ascending: false })
      .limit(20)
    if (kueri.trim()) q = q.ilike('nomor', `%${kueri.trim()}%`)
    const { data } = await q
    return (data ?? []).map((f) => ({ value: f.id, label: f.nomor, sublabel: fmtTanggal(f.tanggal) }))
  }
}

export function TiketForm() {
  const { id } = useParams<{ id: string }>()
  const isBaru = !id || id === 'baru'
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { profil } = useAuth()

  const { data: petugas } = useProfilAktif()

  const [form, setForm] = useState<FormState>(KOSONG)
  const [status, setStatus] = useState<StatusTiket>('terbuka')
  const [menyimpan, setMenyimpan] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const { data: existing, isLoading } = useQuery({
    queryKey: ['tiket-detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tiket')
        .select('*, pelanggan:pelanggan_id(nama, kode), faktur:faktur_id(nomor)')
        .eq('id', id as string)
        .single()
      if (error) throw error
      return data as unknown as TiketRow & { pelanggan: { nama: string; kode: string } | null; faktur: { nomor: string } | null }
    },
    enabled: !isBaru,
  })

  useEffect(() => {
    if (!existing) return
    setForm({
      tanggal: existing.tanggal,
      pelanggan_id: existing.pelanggan_id,
      pelangganLabel: existing.pelanggan ? { value: existing.pelanggan_id, label: existing.pelanggan.nama, sublabel: existing.pelanggan.kode } : null,
      faktur_id: existing.faktur_id,
      fakturLabel: existing.faktur_id && existing.faktur ? { value: existing.faktur_id, label: existing.faktur.nomor } : null,
      judul: existing.judul,
      deskripsi: existing.deskripsi ?? '',
      prioritas: existing.prioritas,
      ditugaskan_ke: existing.ditugaskan_ke ?? '',
    })
    setStatus(existing.status)
  }, [existing])

  function ubah<K extends keyof FormState>(kunci: K, nilai: FormState[K]) {
    setForm((f) => ({ ...f, [kunci]: nilai }))
  }

  function pilihPelanggan(idPel: string, opsi: OpsiCombobox) {
    setForm((f) => ({ ...f, pelanggan_id: idPel, pelangganLabel: opsi, faktur_id: null, fakturLabel: null }))
  }

  async function simpan() {
    setError(null)
    if (!form.pelanggan_id) {
      setError(new Error('Pilih pelanggan dulu.'))
      return
    }
    if (!form.judul.trim()) {
      setError(new Error('Judul tiket wajib diisi.'))
      return
    }

    const payload = {
      tanggal: form.tanggal,
      pelanggan_id: form.pelanggan_id,
      faktur_id: form.faktur_id,
      judul: form.judul.trim(),
      deskripsi: form.deskripsi.trim() || null,
      prioritas: form.prioritas,
      ditugaskan_ke: form.ditugaskan_ke || null,
    }

    setMenyimpan(true)
    try {
      if (isBaru) {
        const { data, error } = await supabase
          .from('tiket')
          .insert({ ...payload, dibuat_oleh: profil?.id ?? null })
          .select('id')
          .single()
        if (error) throw error
        toast('Tiket tersimpan.')
        navigate(`/tiket/${data.id}`, { replace: true })
      } else {
        const { error } = await supabase.from('tiket').update(payload).eq('id', id)
        if (error) throw error
        toast('Tiket tersimpan.')
        queryClient.invalidateQueries({ queryKey: ['tiket-detail', id] })
        queryClient.invalidateQueries({ queryKey: ['tiket'] })
      }
    } catch (e) {
      setError(e)
    } finally {
      setMenyimpan(false)
    }
  }

  async function ubahStatus(statusBaru: StatusTiket) {
    setStatus(statusBaru)
    if (isBaru) return
    const { error } = await supabase.from('tiket').update({ status: statusBaru }).eq('id', id)
    if (error) {
      setError(error)
      setStatus(existing?.status ?? status)
    } else {
      toast(`Status diubah jadi "${LABEL_STATUS_TIKET[statusBaru]}".`)
      queryClient.invalidateQueries({ queryKey: ['tiket-detail', id] })
      queryClient.invalidateQueries({ queryKey: ['tiket'] })
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
          <Link to="/tiket">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{isBaru ? tt('Tiket Baru') : existing?.nomor || '...'}</h1>
        </div>
        {!isBaru ? <Badge variant={VARIAN_STATUS_TIKET[status]}>{LABEL_STATUS_TIKET[status]}</Badge> : null}
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tanggal</Label>
              <Input type="date" value={form.tanggal} onChange={(e) => ubah('tanggal', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Prioritas</Label>
              <Select value={form.prioritas} onChange={(e) => ubah('prioritas', e.target.value as PrioritasTiket)}>
                {Object.entries(LABEL_PRIORITAS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Pelanggan</Label>
            <Combobox
              value={form.pelanggan_id}
              opsiTerpilih={form.pelangganLabel}
              onChange={pilihPelanggan}
              cariOpsi={cariPelanggan}
              placeholder="Cari nama atau kode pelanggan..."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Faktur terkait (opsional)</Label>
            <Combobox
              value={form.faktur_id}
              opsiTerpilih={form.fakturLabel}
              onChange={(idFaktur, opsi) => setForm((f) => ({ ...f, faktur_id: idFaktur, fakturLabel: opsi }))}
              cariOpsi={buatCariFaktur(form.pelanggan_id)}
              placeholder={form.pelanggan_id ? 'Cari nomor faktur...' : 'Pilih pelanggan dulu'}
              disabled={!form.pelanggan_id}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Judul</Label>
            <Input
              placeholder="Ringkasan singkat keluhan/permintaan"
              value={form.judul}
              onChange={(e) => ubah('judul', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Deskripsi</Label>
            <Textarea rows={4} value={form.deskripsi} onChange={(e) => ubah('deskripsi', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Ditugaskan ke</Label>
            <Select value={form.ditugaskan_ke} onChange={(e) => ubah('ditugaskan_ke', e.target.value)}>
              <option value="">Belum ditugaskan</option>
              {(petugas ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama}
                </option>
              ))}
            </Select>
          </div>

          {!isBaru ? (
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onChange={(e) => ubahStatus(e.target.value as StatusTiket)}>
                {Object.entries(LABEL_STATUS_TIKET).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          {error ? <PesanError error={error} /> : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" asChild>
              <Link to="/tiket">Batal</Link>
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
