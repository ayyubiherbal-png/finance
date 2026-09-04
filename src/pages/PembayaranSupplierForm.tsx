import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cariSupplier, useAkunKasBankAktif } from '@/lib/queries'
import { rupiah, tanggal as fmtTanggal, tanggalISO } from '@/lib/format'
import { Combobox, type OpsiCombobox } from '@/components/Combobox'
import { toast } from '@/components/Toast'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  KondisiKosong,
  Label,
  PesanError,
  Select,
  Spinner,
} from '@/components/ui'
import { LABEL_STATUS, VARIAN_STATUS } from '@/pages/SalesOrder'
import { LABEL_METODE } from '@/pages/PenerimaanKas'
import type { MetodeBayar, StatusDokumen } from '@/types/db'

export function PembayaranSupplierForm() {
  const { id } = useParams<{ id: string }>()
  const isBaru = !id || id === 'baru'

  if (isBaru) return <FormBaru />
  return <FormDetail bayarId={id!} />
}

/* ------------------------------------------------------------- Buat baru */

interface FakturOutstanding {
  id: string
  nomor: string
  tanggal: string
  jatuh_tempo: string
  sisa: number
}

interface BarisAlokasi extends FakturOutstanding {
  dipilih: boolean
  jumlah: number
}

async function ambilFakturOutstanding(supplierId: string): Promise<FakturOutstanding[]> {
  const { data, error } = await supabase
    .from('faktur_pembelian')
    .select('id, nomor, tanggal, jatuh_tempo, sisa')
    .eq('supplier_id', supplierId)
    .neq('status', 'dibatalkan')
    .gt('sisa', 0)
    .order('tanggal')
  if (error) throw error
  return data ?? []
}

function FormBaru() {
  const navigate = useNavigate()
  const { profil } = useAuth()
  const [searchParams] = useSearchParams()
  const fakturPrefill = searchParams.get('faktur')

  const [supplierId, setSupplierId] = useState<string | null>(searchParams.get('supplier'))
  const [supplierLabel, setSupplierLabel] = useState<OpsiCombobox | null>(null)
  const [baris, setBaris] = useState<BarisAlokasi[]>([])
  const [header, setHeader] = useState({
    tanggal: tanggalISO(),
    akun_id: '',
    metode: 'transfer' as MetodeBayar,
    nomor_referensi: '',
    tanggal_cair: '',
    catatan: '',
  })
  const [error, setError] = useState<unknown>(null)
  const [menyimpan, setMenyimpan] = useState(false)

  const { data: akunAktif } = useAkunKasBankAktif()

  useEffect(() => {
    if (akunAktif && akunAktif.length === 1 && !header.akun_id) {
      setHeader((h) => ({ ...h, akun_id: akunAktif[0]!.id }))
    }
  }, [akunAktif, header.akun_id])

  const { data: fakturOutstanding, isLoading } = useQuery({
    queryKey: ['faktur-pembelian-outstanding', supplierId],
    queryFn: () => ambilFakturOutstanding(supplierId as string),
    enabled: !!supplierId,
  })

  useEffect(() => {
    if (!supplierId || supplierLabel) return
    let batal = false
    supabase
      .from('supplier')
      .select('nama, kode')
      .eq('id', supplierId)
      .single()
      .then(({ data }) => {
        if (!batal && data) setSupplierLabel({ value: supplierId, label: data.nama, sublabel: data.kode })
      })
    return () => {
      batal = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId])

  useEffect(() => {
    if (!fakturOutstanding) return
    setBaris(
      fakturOutstanding.map((f) => {
        const dipilih = f.id === fakturPrefill
        return { ...f, dipilih, jumlah: dipilih ? f.sisa : 0 }
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fakturOutstanding])

  function pilihSupplier(id: string, opsi: OpsiCombobox) {
    setSupplierId(id)
    setSupplierLabel(opsi)
    setBaris([])
  }

  function toggle(fakturId: string) {
    setBaris((b) =>
      b.map((r) => (r.id === fakturId ? { ...r, dipilih: !r.dipilih, jumlah: !r.dipilih ? r.sisa : 0 } : r)),
    )
  }

  function ubahJumlah(fakturId: string, nilai: number) {
    setBaris((b) => b.map((r) => (r.id === fakturId ? { ...r, jumlah: Math.max(0, Math.min(nilai, r.sisa)) } : r)))
  }

  const totalJumlah = baris.filter((r) => r.dipilih).reduce((t, r) => t + r.jumlah, 0)

  async function simpan() {
    setError(null)
    const dipilihRows = baris.filter((r) => r.dipilih && r.jumlah > 0)
    if (!supplierId || dipilihRows.length === 0) {
      setError(new Error('Pilih supplier dan minimal satu faktur dengan jumlah bayar lebih dari 0.'))
      return
    }
    if (!header.akun_id) {
      setError(new Error('Pilih akun kas/bank sumber pembayaran ini.'))
      return
    }

    setMenyimpan(true)
    try {
      const { data: bayar, error: errHeader } = await supabase
        .from('pembayaran_supplier')
        .insert({
          tanggal: header.tanggal,
          supplier_id: supplierId,
          akun_id: header.akun_id,
          metode: header.metode,
          nomor_referensi: header.nomor_referensi || null,
          tanggal_cair: header.metode === 'giro' ? header.tanggal_cair || null : null,
          jumlah: totalJumlah,
          catatan: header.catatan || null,
          dibuat_oleh: profil?.id ?? null,
        })
        .select('id')
        .single()
      if (errHeader) throw errHeader

      const { error: errAlokasi } = await supabase.from('pembayaran_supplier_alokasi').insert(
        dipilihRows.map((r) => ({ pembayaran_id: bayar.id, faktur_id: r.id, jumlah: r.jumlah })),
      )
      if (errAlokasi) throw errAlokasi

      toast('Pembayaran tersimpan.')
      navigate(`/pembayaran-supplier/${bayar.id}`, { replace: true })
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
          <Link to="/pembayaran-supplier">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Bayar Supplier</h1>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label>Supplier</Label>
            <Combobox
              value={supplierId}
              opsiTerpilih={supplierLabel}
              onChange={pilihSupplier}
              cariOpsi={cariSupplier}
              placeholder="Cari nama atau kode supplier..."
            />
          </div>

          {supplierId ? (
            <div className="space-y-1.5">
              <Label>Faktur yang dibayar</Label>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner className="h-5 w-5" />
                </div>
              ) : baris.length === 0 ? (
                <KondisiKosong pesan="Tidak ada faktur dengan sisa tagihan untuk supplier ini." />
              ) : (
                <div className="divide-y divide-border rounded-md border border-border">
                  {baris.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={f.dipilih}
                        onChange={() => toggle(f.id)}
                        className="h-4 w-4 rounded border-input"
                      />
                      <div className="flex-1">
                        <p className="font-mono text-xs">{f.nomor}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmtTanggal(f.tanggal)} &middot; sisa {rupiah(f.sisa)}
                        </p>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        max={f.sisa}
                        disabled={!f.dipilih}
                        value={f.jumlah}
                        onChange={(e) => ubahJumlah(f.id, Number(e.target.value))}
                        className="w-32 text-right"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tanggal</Label>
              <Input
                type="date"
                value={header.tanggal}
                onChange={(e) => setHeader((h) => ({ ...h, tanggal: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Metode</Label>
              <Select
                value={header.metode}
                onChange={(e) => setHeader((h) => ({ ...h, metode: e.target.value as MetodeBayar }))}
              >
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
              <p className="text-xs text-destructive">
                Belum ada akun kas/bank. Tambahkan dulu di menu Kas & Bank.
              </p>
            ) : null}
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
              <Input
                type="date"
                value={header.tanggal_cair}
                onChange={(e) => setHeader((h) => ({ ...h, tanggal_cair: e.target.value }))}
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label>Catatan</Label>
            <Input value={header.catatan} onChange={(e) => setHeader((h) => ({ ...h, catatan: e.target.value }))} />
          </div>

          {error ? <PesanError error={error} /> : null}

          <div className="flex items-center justify-between border-t border-border pt-3">
            <p className="text-sm">
              Total: <span className="tabular font-semibold">{rupiah(totalJumlah)}</span>
            </p>
            <Button onClick={simpan} disabled={menyimpan || totalJumlah <= 0 || !header.akun_id}>
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

interface BayarDetail {
  id: string
  nomor: string
  tanggal: string
  metode: MetodeBayar
  nomor_referensi: string | null
  jumlah: number
  status: StatusDokumen
  catatan: string | null
  supplier: { nama: string } | null
  akun: { nama: string } | null
}

interface AlokasiBaris {
  jumlah: number
  faktur: { id: string; nomor: string; total: number } | null
}

function FormDetail({ bayarId }: { bayarId: string }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<unknown>(null)
  const [memproses, setMemproses] = useState(false)

  const { data: bayar, isLoading, error: errorMuat } = useQuery({
    queryKey: ['pembayaran-supplier-detail', bayarId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pembayaran_supplier')
        .select(
          'id, nomor, tanggal, metode, nomor_referensi, jumlah, status, catatan, supplier:supplier_id(nama), akun:akun_id(nama)',
        )
        .eq('id', bayarId)
        .single()
      if (error) throw error
      return data as unknown as BayarDetail
    },
  })

  const { data: alokasi } = useQuery({
    queryKey: ['pembayaran-supplier-alokasi', bayarId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pembayaran_supplier_alokasi')
        .select('jumlah, faktur:faktur_id(id, nomor, total)')
        .eq('pembayaran_id', bayarId)
      if (error) throw error
      return (data ?? []) as unknown as AlokasiBaris[]
    },
    enabled: !!bayar,
  })

  async function batalkan() {
    if (!window.confirm('Batalkan pembayaran ini? Sisa tagihan di faktur terkait akan naik lagi.')) return
    setError(null)
    setMemproses(true)
    try {
      const { error } = await supabase.from('pembayaran_supplier').update({ status: 'dibatalkan' }).eq('id', bayarId)
      if (error) throw error
      toast('Pembayaran dibatalkan.')
      queryClient.invalidateQueries({ queryKey: ['pembayaran-supplier-detail', bayarId] })
      queryClient.invalidateQueries({ queryKey: ['pembayaran-supplier'] })
      for (const a of alokasi ?? []) {
        if (a.faktur) queryClient.invalidateQueries({ queryKey: ['faktur-pembelian-detail', a.faktur.id] })
      }
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
  if (!bayar) return null

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/pembayaran-supplier">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="font-mono text-lg font-semibold">{bayar.nomor}</h1>
          <p className="text-sm text-muted-foreground">
            {fmtTanggal(bayar.tanggal)} &middot; {bayar.supplier?.nama ?? '-'}
          </p>
        </div>
        <Badge variant={VARIAN_STATUS[bayar.status]}>{LABEL_STATUS[bayar.status]}</Badge>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
          <InfoField label="Metode" value={LABEL_METODE[bayar.metode]} />
          <InfoField label="Jumlah" value={rupiah(bayar.jumlah)} />
          <InfoField label="Akun" value={bayar.akun?.nama ?? '-'} />
          {bayar.nomor_referensi ? <InfoField label="No. referensi" value={bayar.nomor_referensi} /> : null}
          {bayar.catatan ? <InfoField label="Catatan" value={bayar.catatan} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dialokasikan ke faktur</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-4 pt-0">
          {(alokasi ?? []).map((a, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <Link to={`/faktur-pembelian/${a.faktur?.id}`} className="font-mono text-xs text-primary hover:underline">
                {a.faktur?.nomor}
              </Link>
              <span className="tabular font-medium">{rupiah(a.jumlah)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {error ? <PesanError error={error} /> : null}

      {bayar.status !== 'dibatalkan' ? (
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
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  )
}
