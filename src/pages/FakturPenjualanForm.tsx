import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Printer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cariPelanggan } from '@/lib/queries'
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
  KondisiKosong,
  Label,
  PesanError,
  Spinner,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui'
import { LABEL_STATUS, VARIAN_STATUS } from '@/pages/SalesOrder'
import type { StatusBayar, StatusDokumen } from '@/types/db'

export function FakturPenjualanForm() {
  const { id } = useParams<{ id: string }>()
  const isBaru = !id || id === 'baru'

  if (isBaru) return <FormBaru />
  return <FormDetail fakturId={id!} />
}

/* ------------------------------------------------------------- Buat dari SJ */

interface SJOutstanding {
  id: string
  nomor: string
  tanggal: string
  so_id: string | null
}

async function ambilSJBelumDifakturkan(pelangganId: string): Promise<SJOutstanding[]> {
  const { data: semuaSJ, error: errSJ } = await supabase
    .from('surat_jalan')
    .select('id, nomor, tanggal, so_id')
    .eq('pelanggan_id', pelangganId)
    .eq('status', 'selesai')
    .order('tanggal')
  if (errSJ) throw errSJ
  if (!semuaSJ || semuaSJ.length === 0) return []

  const { data: sudahDifaktur, error: errFP } = await supabase
    .from('faktur_penjualan_sj')
    .select('sj_id, faktur:faktur_id(status)')
    .in(
      'sj_id',
      semuaSJ.map((s) => s.id),
    )
  if (errFP) throw errFP

  const terpakai = new Set(
    (sudahDifaktur ?? [])
      .filter((r) => (r.faktur as unknown as { status: StatusDokumen } | null)?.status !== 'dibatalkan')
      .map((r) => r.sj_id),
  )

  return semuaSJ.filter((s) => !terpakai.has(s.id))
}

function FormBaru() {
  const navigate = useNavigate()
  const { profil } = useAuth()
  const [searchParams] = useSearchParams()

  const [pelangganId, setPelangganId] = useState<string | null>(searchParams.get('pelanggan'))
  const [pelangganLabel, setPelangganLabel] = useState<OpsiCombobox | null>(null)
  const [terpilih, setTerpilih] = useState<Set<string>>(new Set())
  const [error, setError] = useState<unknown>(null)
  const [menyimpan, setMenyimpan] = useState(false)

  const { data: sjOutstanding, isLoading } = useQuery({
    queryKey: ['sj-outstanding', pelangganId],
    queryFn: () => ambilSJBelumDifakturkan(pelangganId as string),
    enabled: !!pelangganId,
  })

  // Datang dari link "Lanjut ke Faktur" (?pelanggan=<id>) -> pelangganId
  // sudah terisi tapi labelnya belum, supaya combobox tidak tampil kosong.
  useEffect(() => {
    if (!pelangganId || pelangganLabel) return
    let batal = false
    supabase
      .from('pelanggan')
      .select('nama, kode')
      .eq('id', pelangganId)
      .single()
      .then(({ data }) => {
        if (!batal && data) setPelangganLabel({ value: pelangganId, label: data.nama, sublabel: data.kode })
      })
    return () => {
      batal = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pelangganId])

  function pilihPelanggan(id: string, opsi: OpsiCombobox) {
    setPelangganId(id)
    setPelangganLabel(opsi)
    setTerpilih(new Set())
  }

  function toggle(id: string) {
    setTerpilih((s) => {
      const salinan = new Set(s)
      if (salinan.has(id)) salinan.delete(id)
      else salinan.add(id)
      return salinan
    })
  }

  async function buatFaktur() {
    if (!pelangganId || terpilih.size === 0) {
      setError(new Error('Pilih pelanggan dan minimal satu Surat Jalan.'))
      return
    }
    setError(null)
    setMenyimpan(true)
    try {
      const idSJTerpilih = Array.from(terpilih)

      const { data: pelanggan, error: errPel } = await supabase
        .from('pelanggan')
        .select('termin, termin_hari')
        .eq('id', pelangganId)
        .single()
      if (errPel) throw errPel

      const tanggalHariIni = tanggalISO()
      const jatuhTempo = new Date()
      jatuhTempo.setDate(jatuhTempo.getDate() + (pelanggan?.termin_hari ?? 0))

      const sjTerkait = (sjOutstanding ?? []).filter((s) => terpilih.has(s.id))
      const soTunggal = sjTerkait.length === 1 ? sjTerkait[0]!.so_id : null

      const { data: faktur, error: errHeader } = await supabase
        .from('faktur_penjualan')
        .insert({
          tanggal: tanggalHariIni,
          jatuh_tempo: tanggalISO(jatuhTempo),
          pelanggan_id: pelangganId,
          so_id: soTunggal,
          sales_id: profil?.id ?? null,
          dibuat_oleh: profil?.id ?? null,
        })
        .select('id')
        .single()
      if (errHeader) throw errHeader

      const { error: errJunction } = await supabase
        .from('faktur_penjualan_sj')
        .insert(idSJTerpilih.map((sjId) => ({ faktur_id: faktur.id, sj_id: sjId })))
      if (errJunction) throw errJunction

      const { data: itemSJ, error: errItemSJ } = await supabase
        .from('surat_jalan_item')
        .select('produk_id, satuan_id, konversi, qty, so_item:so_item_id(harga_satuan, diskon_persen)')
        .in('sj_id', idSJTerpilih)
      if (errItemSJ) throw errItemSJ

      const payloadItem = (itemSJ ?? []).map((it, i) => {
        const hargaAsli = it.so_item as unknown as { harga_satuan: number; diskon_persen: number } | null
        return {
          faktur_id: faktur.id,
          produk_id: it.produk_id,
          satuan_id: it.satuan_id,
          konversi: it.konversi,
          qty: it.qty,
          harga_satuan: hargaAsli?.harga_satuan ?? 0,
          diskon_persen: hargaAsli?.diskon_persen ?? 0,
          urutan: i,
        }
      })
      const { error: errItem } = await supabase.from('faktur_penjualan_item').insert(payloadItem)
      if (errItem) throw errItem

      // Isinya sudah final (disalin dari barang yang sudah terkirim), jadi
      // langsung dikunci sebagai faktur -- tidak ada tahap draf terpisah.
      const { error: errStatus } = await supabase
        .from('faktur_penjualan')
        .update({ status: 'disetujui' })
        .eq('id', faktur.id)
      if (errStatus) throw errStatus

      toast('Faktur tersimpan.')
      navigate(`/faktur-penjualan/${faktur.id}`, { replace: true })
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
          <Link to="/faktur-penjualan">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Faktur Penjualan Baru</h1>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label>Pelanggan</Label>
            <Combobox
              value={pelangganId}
              opsiTerpilih={pelangganLabel}
              onChange={pilihPelanggan}
              cariOpsi={cariPelanggan}
              placeholder="Cari nama atau kode pelanggan..."
            />
          </div>

          {pelangganId ? (
            <div className="space-y-1.5">
              <Label>Surat Jalan yang ditagihkan</Label>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner className="h-5 w-5" />
                </div>
              ) : !sjOutstanding || sjOutstanding.length === 0 ? (
                <KondisiKosong pesan="Tidak ada Surat Jalan yang belum difakturkan untuk pelanggan ini." />
              ) : (
                <div className="divide-y divide-border rounded-md border border-border">
                  {sjOutstanding.map((sj) => (
                    <label key={sj.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-accent">
                      <input
                        type="checkbox"
                        checked={terpilih.has(sj.id)}
                        onChange={() => toggle(sj.id)}
                        className="h-4 w-4 rounded border-input"
                      />
                      <span className="font-mono text-xs">{sj.nomor}</span>
                      <span className="text-muted-foreground">{fmtTanggal(sj.tanggal)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {error ? <PesanError error={error} /> : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" asChild>
              <Link to="/faktur-penjualan">Batal</Link>
            </Button>
            <Button onClick={buatFaktur} disabled={menyimpan || terpilih.size === 0}>
              {menyimpan ? <Spinner /> : null}
              Buat Faktur
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------- Detail / aksi */

interface FakturDetail {
  id: string
  nomor: string
  tanggal: string
  jatuh_tempo: string
  status: StatusDokumen
  status_bayar: StatusBayar
  subtotal: number
  total: number
  terbayar: number
  sisa: number
  catatan: string | null
  pelanggan_id: string
  pelanggan: { nama: string } | null
}

interface FakturItem {
  id: string
  qty: number
  harga_satuan: number
  diskon_persen: number
  subtotal: number
  produk: { nama: string; kode: string } | null
  satuan: { kode: string } | null
}

interface SJTerkait {
  sj: { id: string; nomor: string; tanggal: string } | null
}

const LABEL_BAYAR: Record<StatusBayar, string> = {
  belum: 'Belum Bayar',
  sebagian: 'Bayar Sebagian',
  lunas: 'Lunas',
}
const VARIAN_BAYAR: Record<StatusBayar, 'netral' | 'peringatan' | 'sukses'> = {
  belum: 'peringatan',
  sebagian: 'peringatan',
  lunas: 'sukses',
}

function FormDetail({ fakturId }: { fakturId: string }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<unknown>(null)
  const [memproses, setMemproses] = useState(false)

  const { data: faktur, isLoading, error: errorMuat } = useQuery({
    queryKey: ['faktur-detail', fakturId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('faktur_penjualan')
        .select(
          'id, nomor, tanggal, jatuh_tempo, status, status_bayar, subtotal, total, terbayar, sisa, catatan, pelanggan_id, pelanggan:pelanggan_id(nama)',
        )
        .eq('id', fakturId)
        .single()
      if (error) throw error
      return data as unknown as FakturDetail
    },
  })

  const { data: items } = useQuery({
    queryKey: ['faktur-item', fakturId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('faktur_penjualan_item')
        .select('id, qty, harga_satuan, diskon_persen, subtotal, produk:produk_id(nama, kode), satuan:satuan_id(kode)')
        .eq('faktur_id', fakturId)
        .order('urutan')
      if (error) throw error
      return (data ?? []) as unknown as FakturItem[]
    },
    enabled: !!faktur,
  })

  const { data: sjTerkait } = useQuery({
    queryKey: ['faktur-sj', fakturId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('faktur_penjualan_sj')
        .select('sj:sj_id(id, nomor, tanggal)')
        .eq('faktur_id', fakturId)
      if (error) throw error
      return (data ?? []) as unknown as SJTerkait[]
    },
    enabled: !!faktur,
  })

  async function batalkan() {
    if (!window.confirm('Batalkan faktur ini? Hanya bisa kalau belum ada pembayaran tercatat.')) return
    setError(null)
    setMemproses(true)
    try {
      const { error } = await supabase.from('faktur_penjualan').update({ status: 'dibatalkan' }).eq('id', fakturId)
      if (error) throw error
      toast('Faktur dibatalkan.')
      queryClient.invalidateQueries({ queryKey: ['faktur-detail', fakturId] })
      queryClient.invalidateQueries({ queryKey: ['faktur-penjualan'] })
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
  if (!faktur) return null

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/faktur-penjualan">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="font-mono text-lg font-semibold">{faktur.nomor}</h1>
          <p className="text-sm text-muted-foreground">
            {fmtTanggal(faktur.tanggal)} &middot; {faktur.pelanggan?.nama ?? '-'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant={VARIAN_STATUS[faktur.status]}>{LABEL_STATUS[faktur.status]}</Badge>
          <Badge variant={VARIAN_BAYAR[faktur.status_bayar]}>{LABEL_BAYAR[faktur.status_bayar]}</Badge>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/faktur-penjualan/${faktur.id}/cetak`} target="_blank">
              <Printer className="h-4 w-4" />
              Cetak
            </Link>
          </Button>
        </div>
      </div>

      {sjTerkait && sjTerkait.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Menagih:{' '}
          {sjTerkait.map((r, i) => (
            <span key={r.sj?.id ?? i} className="font-mono text-xs">
              {r.sj?.nomor}
              {i < sjTerkait.length - 1 ? ', ' : ''}
            </span>
          ))}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Item</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          <Table>
            <Thead>
              <Tr>
                <Th>Produk</Th>
                <Th>Satuan</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Harga</Th>
                <Th className="text-right">Subtotal</Th>
              </Tr>
            </Thead>
            <Tbody>
              {(items ?? []).map((it) => (
                <Tr key={it.id}>
                  <Td className="font-medium">
                    {it.produk?.nama}
                    <span className="ml-1 font-mono text-xs text-muted-foreground">{it.produk?.kode}</span>
                  </Td>
                  <Td className="text-xs text-muted-foreground">{it.satuan?.kode}</Td>
                  <Td className="tabular text-right">{it.qty}</Td>
                  <Td className="tabular text-right">{rupiah(it.harga_satuan)}</Td>
                  <Td className="tabular text-right font-medium">{rupiah(it.subtotal)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>

          <div className="flex justify-end border-t border-border p-3">
            <div className="w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Total</span>
                <span className="tabular">{rupiah(faktur.total)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Terbayar</span>
                <span className="tabular">{rupiah(faktur.terbayar)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>Sisa</span>
                <span className="tabular">{rupiah(faktur.sisa)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? <PesanError error={error} /> : null}

      {faktur.status !== 'dibatalkan' ? (
        <div className="flex justify-end gap-2">
          {faktur.terbayar === 0 ? (
            <Button variant="outline" onClick={batalkan} disabled={memproses}>
              {memproses ? <Spinner /> : null}
              Batalkan
            </Button>
          ) : null}
          {faktur.sisa > 0 ? (
            <Button asChild>
              <Link to={`/penerimaan-kas/baru?pelanggan=${faktur.pelanggan_id}&faktur=${faktur.id}`}>
                Catat Pembayaran
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
