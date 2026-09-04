import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cariSupplier } from '@/lib/queries'
import { rupiah, tanggal as fmtTanggal, tanggalISO } from '@/lib/format'
import { Combobox, type OpsiCombobox } from '@/components/Combobox'
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

export function FakturPembelianForm() {
  const { id } = useParams<{ id: string }>()
  const isBaru = !id || id === 'baru'

  if (isBaru) return <FormBaru />
  return <FormDetail fakturId={id!} />
}

/* ------------------------------------------------------------- Buat dari PB */

interface PBOutstanding {
  id: string
  nomor: string
  tanggal: string
}

async function ambilPBBelumDifakturkan(supplierId: string): Promise<PBOutstanding[]> {
  const { data: semuaPB, error: errPB } = await supabase
    .from('penerimaan_barang')
    .select('id, nomor, tanggal')
    .eq('supplier_id', supplierId)
    .eq('status', 'selesai')
    .order('tanggal')
  if (errPB) throw errPB
  if (!semuaPB || semuaPB.length === 0) return []

  const { data: sudahDifaktur, error: errFB } = await supabase
    .from('faktur_pembelian_pb')
    .select('pb_id, faktur:faktur_id(status)')
    .in(
      'pb_id',
      semuaPB.map((s) => s.id),
    )
  if (errFB) throw errFB

  const terpakai = new Set(
    (sudahDifaktur ?? [])
      .filter((r) => (r.faktur as unknown as { status: StatusDokumen } | null)?.status !== 'dibatalkan')
      .map((r) => r.pb_id),
  )

  return semuaPB.filter((s) => !terpakai.has(s.id))
}

function FormBaru() {
  const navigate = useNavigate()
  const { profil } = useAuth()
  const [searchParams] = useSearchParams()

  const [supplierId, setSupplierId] = useState<string | null>(searchParams.get('supplier'))
  const [supplierLabel, setSupplierLabel] = useState<OpsiCombobox | null>(null)
  const [nomorSupplier, setNomorSupplier] = useState('')
  const [terpilih, setTerpilih] = useState<Set<string>>(new Set())
  const [error, setError] = useState<unknown>(null)
  const [menyimpan, setMenyimpan] = useState(false)

  const { data: pbOutstanding, isLoading } = useQuery({
    queryKey: ['pb-outstanding', supplierId],
    queryFn: () => ambilPBBelumDifakturkan(supplierId as string),
    enabled: !!supplierId,
  })

  // Kalau datang lewat link dengan ?supplier=<id>, id-nya sudah terisi
  // tapi labelnya belum -- supaya combobox tidak tampil kosong.
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

  function pilihSupplier(id: string, opsi: OpsiCombobox) {
    setSupplierId(id)
    setSupplierLabel(opsi)
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
    if (!supplierId || terpilih.size === 0) {
      setError(new Error('Pilih supplier dan minimal satu Penerimaan Barang.'))
      return
    }
    setError(null)
    setMenyimpan(true)
    try {
      const idPBTerpilih = Array.from(terpilih)

      const { data: supplier, error: errSup } = await supabase
        .from('supplier')
        .select('termin_hari')
        .eq('id', supplierId)
        .single()
      if (errSup) throw errSup

      const tanggalHariIni = tanggalISO()
      const jatuhTempo = new Date()
      jatuhTempo.setDate(jatuhTempo.getDate() + (supplier?.termin_hari ?? 0))

      const { data: faktur, error: errHeader } = await supabase
        .from('faktur_pembelian')
        .insert({
          tanggal: tanggalHariIni,
          jatuh_tempo: tanggalISO(jatuhTempo),
          supplier_id: supplierId,
          nomor_supplier: nomorSupplier || null,
          dibuat_oleh: profil?.id ?? null,
        })
        .select('id')
        .single()
      if (errHeader) throw errHeader

      const { error: errJunction } = await supabase
        .from('faktur_pembelian_pb')
        .insert(idPBTerpilih.map((pbId) => ({ faktur_id: faktur.id, pb_id: pbId })))
      if (errJunction) throw errJunction

      const { data: itemPB, error: errItemPB } = await supabase
        .from('penerimaan_barang_item')
        .select('produk_id, satuan_id, konversi, qty, harga_satuan')
        .in('pb_id', idPBTerpilih)
      if (errItemPB) throw errItemPB

      const payloadItem = (itemPB ?? []).map((it, i) => ({
        faktur_id: faktur.id,
        produk_id: it.produk_id,
        satuan_id: it.satuan_id,
        konversi: it.konversi,
        qty: it.qty,
        harga_satuan: it.harga_satuan,
        urutan: i,
      }))
      const { error: errItem } = await supabase.from('faktur_pembelian_item').insert(payloadItem)
      if (errItem) throw errItem

      // Isinya sudah final (disalin dari barang yang sudah diterima), jadi
      // langsung dikunci sebagai faktur -- tidak ada tahap draf terpisah.
      const { error: errStatus } = await supabase
        .from('faktur_pembelian')
        .update({ status: 'disetujui' })
        .eq('id', faktur.id)
      if (errStatus) throw errStatus

      navigate(`/faktur-pembelian/${faktur.id}`, { replace: true })
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
          <Link to="/faktur-pembelian">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Faktur Pembelian Baru</h1>
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

          <div className="space-y-1.5">
            <Label>Nomor faktur dari supplier</Label>
            <Input
              placeholder="Opsional, untuk pencocokan dokumen"
              value={nomorSupplier}
              onChange={(e) => setNomorSupplier(e.target.value)}
            />
          </div>

          {supplierId ? (
            <div className="space-y-1.5">
              <Label>Penerimaan Barang yang ditagihkan</Label>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner className="h-5 w-5" />
                </div>
              ) : !pbOutstanding || pbOutstanding.length === 0 ? (
                <KondisiKosong pesan="Tidak ada Penerimaan Barang yang belum difakturkan untuk supplier ini." />
              ) : (
                <div className="divide-y divide-border rounded-md border border-border">
                  {pbOutstanding.map((pb) => (
                    <label key={pb.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-accent">
                      <input
                        type="checkbox"
                        checked={terpilih.has(pb.id)}
                        onChange={() => toggle(pb.id)}
                        className="h-4 w-4 rounded border-input"
                      />
                      <span className="font-mono text-xs">{pb.nomor}</span>
                      <span className="text-muted-foreground">{fmtTanggal(pb.tanggal)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {error ? <PesanError error={error} /> : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" asChild>
              <Link to="/faktur-pembelian">Batal</Link>
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
  nomor_supplier: string | null
  tanggal: string
  jatuh_tempo: string
  status: StatusDokumen
  status_bayar: StatusBayar
  total: number
  terbayar: number
  sisa: number
  catatan: string | null
  supplier_id: string
  supplier: { nama: string } | null
}

interface FakturItem {
  id: string
  qty: number
  harga_satuan: number
  subtotal: number
  produk: { nama: string; kode: string } | null
  satuan: { kode: string } | null
}

interface PBTerkait {
  pb: { id: string; nomor: string; tanggal: string } | null
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
    queryKey: ['faktur-pembelian-detail', fakturId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('faktur_pembelian')
        .select(
          'id, nomor, nomor_supplier, tanggal, jatuh_tempo, status, status_bayar, total, terbayar, sisa, catatan, supplier_id, supplier:supplier_id(nama)',
        )
        .eq('id', fakturId)
        .single()
      if (error) throw error
      return data as unknown as FakturDetail
    },
  })

  const { data: items } = useQuery({
    queryKey: ['faktur-pembelian-item', fakturId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('faktur_pembelian_item')
        .select('id, qty, harga_satuan, subtotal, produk:produk_id(nama, kode), satuan:satuan_id(kode)')
        .eq('faktur_id', fakturId)
        .order('urutan')
      if (error) throw error
      return (data ?? []) as unknown as FakturItem[]
    },
    enabled: !!faktur,
  })

  const { data: pbTerkait } = useQuery({
    queryKey: ['faktur-pembelian-pb', fakturId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('faktur_pembelian_pb')
        .select('pb:pb_id(id, nomor, tanggal)')
        .eq('faktur_id', fakturId)
      if (error) throw error
      return (data ?? []) as unknown as PBTerkait[]
    },
    enabled: !!faktur,
  })

  async function batalkan() {
    if (!window.confirm('Batalkan faktur ini? Hanya bisa kalau belum ada pembayaran tercatat.')) return
    setError(null)
    setMemproses(true)
    try {
      const { error } = await supabase.from('faktur_pembelian').update({ status: 'dibatalkan' }).eq('id', fakturId)
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['faktur-pembelian-detail', fakturId] })
      queryClient.invalidateQueries({ queryKey: ['faktur-pembelian'] })
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
          <Link to="/faktur-pembelian">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="font-mono text-lg font-semibold">{faktur.nomor}</h1>
          <p className="text-sm text-muted-foreground">
            {fmtTanggal(faktur.tanggal)} &middot; {faktur.supplier?.nama ?? '-'}
            {faktur.nomor_supplier ? ` · no. supplier: ${faktur.nomor_supplier}` : ''}
          </p>
        </div>
        <div className="flex gap-1.5">
          <Badge variant={VARIAN_STATUS[faktur.status]}>{LABEL_STATUS[faktur.status]}</Badge>
          <Badge variant={VARIAN_BAYAR[faktur.status_bayar]}>{LABEL_BAYAR[faktur.status_bayar]}</Badge>
        </div>
      </div>

      {pbTerkait && pbTerkait.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Menagih:{' '}
          {pbTerkait.map((r, i) => (
            <span key={r.pb?.id ?? i} className="font-mono text-xs">
              {r.pb?.nomor}
              {i < pbTerkait.length - 1 ? ', ' : ''}
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
              <Link to={`/pembayaran-supplier/baru?supplier=${faktur.supplier_id}&faktur=${faktur.id}`}>
                Bayar Sekarang
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
