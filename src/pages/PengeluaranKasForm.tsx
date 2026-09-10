import { useEffect, useMemo, useState } from 'react'
import { tt } from '@/lib/i18nText'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useAkunKasBankAktif, useNamaPengeluaranAktif, type NamaPengeluaranDenganKategori } from '@/lib/queries'
import { rupiah, tanggal as fmtTanggal, tanggalISO } from '@/lib/format'
import { toast } from '@/components/Toast'
import { Badge, Button, Card, CardContent, Input, InputAngka, Label, PesanError, Select, Spinner } from '@/components/ui'
import { LABEL_STATUS, VARIAN_STATUS } from '@/pages/SalesOrder'
import { LABEL_METODE } from '@/pages/PenerimaanKas'
import type { MetodeBayar, StatusDokumen } from '@/types/db'

/** Kelompokkan Nama Pengeluaran per kategori induknya (urut kode kategori)
 * supaya dropdown-nya jadi <optgroup> -- gampang dicari di kategori mana. */
function kelompokkanPerKategori(item: NamaPengeluaranDenganKategori[]) {
  const peta = new Map<string, { kode: string; nama: string; item: NamaPengeluaranDenganKategori[] }>()
  for (const i of item) {
    const ada = peta.get(i.kategori_biaya_id)
    if (ada) ada.item.push(i)
    else peta.set(i.kategori_biaya_id, { kode: i.kategori?.kode ?? '', nama: i.kategori?.nama ?? '', item: [i] })
  }
  return [...peta.values()].sort((a, b) => a.kode.localeCompare(b.kode))
}

export function PengeluaranKasForm() {
  const { id } = useParams<{ id: string }>()
  const isBaru = !id || id === 'baru'

  if (isBaru) return <FormBaru />
  return <FormDetail pengeluaranId={id!} />
}

/* ------------------------------------------------------------- Buat baru */

function FormBaru() {
  const navigate = useNavigate()
  const { profil } = useAuth()
  const { data: akunAktif } = useAkunKasBankAktif()
  const { data: namaPengeluaranAktif } = useNamaPengeluaranAktif()
  const kelompokPengeluaran = useMemo(() => kelompokkanPerKategori(namaPengeluaranAktif ?? []), [namaPengeluaranAktif])

  const [header, setHeader] = useState({
    tanggal: tanggalISO(),
    nama_pengeluaran_id: '',
    akun_id: '',
    metode: 'transfer' as MetodeBayar,
    nomor_referensi: '',
    tanggal_cair: '',
    jumlah: 0,
    catatan: '',
  })
  const [error, setError] = useState<unknown>(null)
  const [menyimpan, setMenyimpan] = useState(false)

  useEffect(() => {
    if (akunAktif && akunAktif.length === 1 && !header.akun_id) {
      setHeader((h) => ({ ...h, akun_id: akunAktif[0]!.id }))
    }
  }, [akunAktif, header.akun_id])

  async function simpan() {
    setError(null)
    if (!header.nama_pengeluaran_id) {
      setError(new Error('Pilih nama pengeluaran.'))
      return
    }
    if (!header.akun_id) {
      setError(new Error('Pilih akun kas/bank sumber pengeluaran ini.'))
      return
    }
    if (header.jumlah <= 0) {
      setError(new Error('Jumlah harus lebih dari 0.'))
      return
    }

    setMenyimpan(true)
    try {
      const { data, error } = await supabase
        .from('pengeluaran_kas')
        .insert({
          tanggal: header.tanggal,
          nama_pengeluaran_id: header.nama_pengeluaran_id,
          akun_id: header.akun_id,
          metode: header.metode,
          nomor_referensi: header.nomor_referensi || null,
          tanggal_cair: header.metode === 'giro' ? header.tanggal_cair || null : null,
          jumlah: header.jumlah,
          catatan: header.catatan || null,
          dibuat_oleh: profil?.id ?? null,
        })
        .select('id')
        .single()
      if (error) throw error
      toast('Pengeluaran kas tersimpan.')
      navigate(`/pengeluaran-kas/${data.id}`, { replace: true })
    } catch (e) {
      setError(e)
    } finally {
      setMenyimpan(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/pengeluaran-kas">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{tt('Catat Pengeluaran')}</h1>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label>Nama pengeluaran</Label>
            <Select
              value={header.nama_pengeluaran_id}
              onChange={(e) => setHeader((h) => ({ ...h, nama_pengeluaran_id: e.target.value }))}
            >
              <option value="" disabled>
                Pilih nama pengeluaran...
              </option>
              {kelompokPengeluaran.map((k) => (
                <optgroup key={k.kode} label={`${k.kode} - ${k.nama}`}>
                  {k.item.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.kode} - {i.nama}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
            {namaPengeluaranAktif && namaPengeluaranAktif.length === 0 ? (
              <p className="text-xs text-destructive">{tt('Belum ada nama pengeluaran. Tambahkan dulu di menu Kategori Biaya.')}</p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tanggal</Label>
              <Input type="date" value={header.tanggal} onChange={(e) => setHeader((h) => ({ ...h, tanggal: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Metode</Label>
              <Select value={header.metode} onChange={(e) => setHeader((h) => ({ ...h, metode: e.target.value as MetodeBayar }))}>
                {Object.entries(LABEL_METODE).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Uang keluar dari akun</Label>
            <Select value={header.akun_id} onChange={(e) => setHeader((h) => ({ ...h, akun_id: e.target.value }))}>
              <option value="" disabled>
                Pilih akun kas/bank...
              </option>
              {(akunAktif ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nama}
                </option>
              ))}
            </Select>
            {akunAktif && akunAktif.length === 0 ? (
              <p className="text-xs text-destructive">{tt('Belum ada akun kas/bank. Tambahkan dulu di menu Kas & Bank.')}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Jumlah</Label>
            <InputAngka value={header.jumlah} onChange={(nilai) => setHeader((h) => ({ ...h, jumlah: nilai }))} />
          </div>

          {header.metode !== 'tunai' ? (
            <div className="space-y-1.5">
              <Label>No. referensi (opsional)</Label>
              <Input
                placeholder="No. transaksi / no. giro"
                value={header.nomor_referensi}
                onChange={(e) => setHeader((h) => ({ ...h, nomor_referensi: e.target.value }))}
              />
            </div>
          ) : null}

          {header.metode === 'giro' ? (
            <div className="space-y-1.5">
              <Label>Tanggal cair</Label>
              <Input type="date" value={header.tanggal_cair} onChange={(e) => setHeader((h) => ({ ...h, tanggal_cair: e.target.value }))} />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label>Catatan</Label>
            <Input value={header.catatan} onChange={(e) => setHeader((h) => ({ ...h, catatan: e.target.value }))} />
          </div>

          {error ? <PesanError error={error} /> : null}

          <div className="flex justify-end pt-2">
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

/* ------------------------------------------------------------- Detail / aksi */

interface PengeluaranDetail {
  id: string
  nomor: string
  tanggal: string
  metode: MetodeBayar
  nomor_referensi: string | null
  jumlah: number
  status: StatusDokumen
  catatan: string | null
  namaPengeluaran: { nama: string; kategori: { nama: string } | null } | null
  akun: { nama: string } | null
}

function FormDetail({ pengeluaranId }: { pengeluaranId: string }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<unknown>(null)
  const [memproses, setMemproses] = useState(false)

  const { data: pengeluaran, isLoading, error: errorMuat } = useQuery({
    queryKey: ['pengeluaran-kas-detail', pengeluaranId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pengeluaran_kas')
        .select(
          'id, nomor, tanggal, metode, nomor_referensi, jumlah, status, catatan, namaPengeluaran:nama_pengeluaran_id(nama, kategori:kategori_biaya_id(nama)), akun:akun_id(nama)',
        )
        .eq('id', pengeluaranId)
        .single()
      if (error) throw error
      return data as unknown as PengeluaranDetail
    },
  })

  async function batalkan() {
    if (!window.confirm(tt('Batalkan pengeluaran kas ini?'))) return
    setError(null)
    setMemproses(true)
    try {
      const { error } = await supabase.from('pengeluaran_kas').update({ status: 'dibatalkan' }).eq('id', pengeluaranId)
      if (error) throw error
      toast('Pengeluaran kas dibatalkan.')
      queryClient.invalidateQueries({ queryKey: ['pengeluaran-kas-detail', pengeluaranId] })
      queryClient.invalidateQueries({ queryKey: ['pengeluaran-kas'] })
    } catch (e) {
      setError(e)
    } finally {
      setMemproses(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }
  if (errorMuat) return <PesanError error={errorMuat} />
  if (!pengeluaran) return null

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/pengeluaran-kas">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="font-mono text-lg font-semibold">{pengeluaran.nomor}</h1>
          <p className="text-sm text-muted-foreground">
            {fmtTanggal(pengeluaran.tanggal)} &middot; {pengeluaran.namaPengeluaran?.nama ?? '-'}
          </p>
        </div>
        <Badge variant={VARIAN_STATUS[pengeluaran.status]}>{LABEL_STATUS[pengeluaran.status]}</Badge>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
          <InfoField label="Kategori" value={pengeluaran.namaPengeluaran?.kategori?.nama ?? '-'} />
          <InfoField label="Nama pengeluaran" value={pengeluaran.namaPengeluaran?.nama ?? '-'} />
          <InfoField label="Metode" value={LABEL_METODE[pengeluaran.metode]} />
          <InfoField label="Jumlah" value={rupiah(pengeluaran.jumlah)} />
          <InfoField label="Akun" value={pengeluaran.akun?.nama ?? '-'} />
          {pengeluaran.nomor_referensi ? <InfoField label="No. referensi" value={pengeluaran.nomor_referensi} /> : null}
          {pengeluaran.catatan ? <InfoField label="Catatan" value={pengeluaran.catatan} /> : null}
        </CardContent>
      </Card>

      {error ? <PesanError error={error} /> : null}

      {pengeluaran.status !== 'dibatalkan' ? (
        <div className="flex justify-end">
          <Button variant="outline" onClick={batalkan} disabled={memproses}>
            {memproses ? <Spinner /> : null}
            Batalkan
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{tt(label)}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  )
}
