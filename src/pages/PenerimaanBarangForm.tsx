import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { rupiah, tanggal as fmtTanggal, tanggalISO } from '@/lib/format'
import { toast } from '@/components/Toast'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  InputAngka,
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
import type { StatusDokumen } from '@/types/db'

interface POSumberItem {
  id: string
  produk_id: string
  satuan_id: string
  konversi: number
  qty_dasar: number
  qty_diterima: number
  harga_satuan: number
  produk: { nama: string; kode: string } | null
  satuan: { kode: string } | null
}

interface POSumber {
  id: string
  nomor: string
  status: StatusDokumen
  supplier_id: string
  gudang_id: string
  supplier: { nama: string } | null
  gudang: { nama: string } | null
}

interface BarisTerima extends POSumberItem {
  qtyTerima: number
  hargaTerima: number
}

export function PenerimaanBarangForm() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const isBaru = !id || id === 'baru'

  if (isBaru) return <FormBaru poId={searchParams.get('po')} />
  return <FormDetail pbId={id!} />
}

/* ------------------------------------------------------------- Buat dari PO */

function FormBaru({ poId }: { poId: string | null }) {
  const navigate = useNavigate()
  const { profil } = useAuth()
  const [baris, setBaris] = useState<BarisTerima[]>([])
  const [header, setHeader] = useState({
    tanggal: tanggalISO(),
    surat_jalan_supplier: '',
    biaya_tambahan: 0,
    catatan: '',
  })
  const [error, setError] = useState<unknown>(null)
  const [memproses, setMemproses] = useState<'draf' | 'terima' | null>(null)

  const { data: po, isLoading } = useQuery({
    queryKey: ['po-sumber-pb', poId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_order')
        .select('id, nomor, status, supplier_id, gudang_id, supplier:supplier_id(nama), gudang:gudang_id(nama)')
        .eq('id', poId as string)
        .single()
      if (error) throw error
      return data as unknown as POSumber
    },
    enabled: !!poId,
  })

  const { data: itemPO } = useQuery({
    queryKey: ['po-sumber-pb-item', poId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_order_item')
        .select(
          'id, produk_id, satuan_id, konversi, qty_dasar, qty_diterima, harga_satuan, produk:produk_id(nama, kode), satuan:satuan_id(kode)',
        )
        .eq('po_id', poId as string)
        .order('urutan')
      if (error) throw error
      return (data ?? []) as unknown as POSumberItem[]
    },
    enabled: !!poId,
  })

  useEffect(() => {
    if (!itemPO) return
    setBaris(
      itemPO
        .filter((it) => it.qty_dasar - it.qty_diterima > 0.0001)
        .map((it) => ({
          ...it,
          qtyTerima: (it.qty_dasar - it.qty_diterima) / it.konversi,
          hargaTerima: it.harga_satuan,
        })),
    )
  }, [itemPO])

  if (!poId) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="font-medium">Penerimaan Barang dibuat dari Purchase Order</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Buka daftar Purchase Order, pilih yang berstatus "Disetujui", lalu klik "Buat Penerimaan Barang".
        </p>
        <Button asChild className="mt-4">
          <Link to="/purchase-order">Ke Purchase Order</Link>
        </Button>
      </div>
    )
  }

  if (isLoading || !po) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  function ubahQty(itemId: string, nilai: number) {
    setBaris((b) =>
      b.map((r) => {
        if (r.id !== itemId) return r
        const maks = (r.qty_dasar - r.qty_diterima) / r.konversi
        return { ...r, qtyTerima: Math.max(0, Math.min(nilai, maks)) }
      }),
    )
  }

  function ubahHarga(itemId: string, nilai: number) {
    setBaris((b) => b.map((r) => (r.id === itemId ? { ...r, hargaTerima: Math.max(0, nilai) } : r)))
  }

  async function simpan(langsungTerima: boolean) {
    if (!po) return
    setError(null)
    const diterima = baris.filter((r) => r.qtyTerima > 0)
    if (diterima.length === 0) {
      setError(new Error('Isi jumlah terima minimal satu produk.'))
      return
    }

    setMemproses(langsungTerima ? 'terima' : 'draf')
    try {
      const { data: pb, error: errHeader } = await supabase
        .from('penerimaan_barang')
        .insert({
          tanggal: header.tanggal,
          po_id: po.id,
          supplier_id: po.supplier_id,
          gudang_id: po.gudang_id,
          surat_jalan_supplier: header.surat_jalan_supplier || null,
          biaya_tambahan: header.biaya_tambahan,
          catatan: header.catatan || null,
          dibuat_oleh: profil?.id ?? null,
        })
        .select('id')
        .single()
      if (errHeader) throw errHeader

      const { error: errItem } = await supabase.from('penerimaan_barang_item').insert(
        diterima.map((r) => ({
          pb_id: pb.id,
          po_item_id: r.id,
          produk_id: r.produk_id,
          satuan_id: r.satuan_id,
          konversi: r.konversi,
          qty: r.qtyTerima,
          harga_satuan: r.hargaTerima,
        })),
      )
      if (errItem) throw errItem

      if (langsungTerima) {
        const { error: errStatus } = await supabase.from('penerimaan_barang').update({ status: 'selesai' }).eq('id', pb.id)
        if (errStatus) throw errStatus
      }

      toast(langsungTerima ? 'Barang diterima.' : 'Draf Penerimaan Barang tersimpan.')
      navigate(`/penerimaan-barang/${pb.id}`, { replace: true })
    } catch (e) {
      setError(e)
    } finally {
      setMemproses(null)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to={`/purchase-order/${po.id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Penerimaan Barang Baru</h1>
          <p className="text-sm text-muted-foreground">
            Dari PO <span className="font-mono">{po.nomor}</span> &middot; {po.supplier?.nama}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Barang yang diterima</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          <Table>
            <Thead>
              <Tr>
                <Th>Produk</Th>
                <Th>Satuan</Th>
                <Th className="text-right">Sisa PO</Th>
                <Th className="text-right">Diterima</Th>
                <Th className="text-right">Harga</Th>
              </Tr>
            </Thead>
            <Tbody>
              {baris.map((r) => {
                const maks = (r.qty_dasar - r.qty_diterima) / r.konversi
                return (
                  <Tr key={r.id}>
                    <Td className="font-medium">{r.produk?.nama}</Td>
                    <Td className="text-xs text-muted-foreground">{r.satuan?.kode}</Td>
                    <Td className="tabular text-right text-muted-foreground">{maks}</Td>
                    <Td className="text-right">
                      <Input
                        type="number"
                        min={0}
                        max={maks}
                        value={r.qtyTerima}
                        onChange={(e) => ubahQty(r.id, Number(e.target.value))}
                        className="ml-auto w-24 text-right"
                      />
                    </Td>
                    <Td className="text-right">
                      <InputAngka value={r.hargaTerima} onChange={(nilai) => ubahHarga(r.id, nilai)} className="ml-auto w-28" />
                    </Td>
                  </Tr>
                )
              })}
              {baris.length === 0 ? (
                <Tr>
                  <Td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                    Semua item pada PO ini sudah diterima penuh.
                  </Td>
                </Tr>
              ) : null}
            </Tbody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tanggal terima</Label>
              <Input
                type="date"
                value={header.tanggal}
                onChange={(e) => setHeader((h) => ({ ...h, tanggal: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>No. surat jalan supplier</Label>
              <Input
                value={header.surat_jalan_supplier}
                onChange={(e) => setHeader((h) => ({ ...h, surat_jalan_supplier: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Biaya tambahan (ongkos angkut/bongkar)</Label>
            <InputAngka value={header.biaya_tambahan} onChange={(nilai) => setHeader((h) => ({ ...h, biaya_tambahan: nilai }))} />
            <p className="text-xs text-muted-foreground">
              Dibagi proporsional ke tiap produk dan ikut masuk perhitungan HPP.
            </p>
          </div>

          {error ? <PesanError error={error} /> : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => simpan(false)} disabled={memproses !== null}>
              {memproses === 'draf' ? <Spinner /> : null}
              Simpan sebagai Draf
            </Button>
            <Button onClick={() => simpan(true)} disabled={memproses !== null}>
              {memproses === 'terima' ? <Spinner /> : null}
              Terima Sekarang
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            "Terima Sekarang" langsung menambah stok gudang {po.gudang?.nama} dan menghitung ulang HPP.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------- Detail / aksi */

interface PBDetail {
  id: string
  nomor: string
  tanggal: string
  status: StatusDokumen
  po_id: string | null
  surat_jalan_supplier: string | null
  biaya_tambahan: number
  catatan: string | null
  supplier: { nama: string } | null
  gudang: { nama: string } | null
  po: { nomor: string } | null
}

interface PBItem {
  id: string
  produk_id: string
  qty: number
  harga_satuan: number
  hpp_satuan: number
  produk: { nama: string; kode: string } | null
  satuan: { kode: string } | null
}

function FormDetail({ pbId }: { pbId: string }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<unknown>(null)
  const [memproses, setMemproses] = useState(false)

  const { data: pb, isLoading, error: errorMuat } = useQuery({
    queryKey: ['penerimaan-barang-detail', pbId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('penerimaan_barang')
        .select(
          'id, nomor, tanggal, status, po_id, surat_jalan_supplier, biaya_tambahan, catatan, supplier:supplier_id(nama), gudang:gudang_id(nama), po:po_id(nomor)',
        )
        .eq('id', pbId)
        .single()
      if (error) throw error
      return data as unknown as PBDetail
    },
  })

  const { data: items } = useQuery({
    queryKey: ['penerimaan-barang-item', pbId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('penerimaan_barang_item')
        .select('id, produk_id, qty, harga_satuan, hpp_satuan, produk:produk_id(nama, kode), satuan:satuan_id(kode)')
        .eq('pb_id', pbId)
      if (error) throw error
      return (data ?? []) as unknown as PBItem[]
    },
    enabled: !!pb,
  })

  async function ubahStatus(statusBaru: 'selesai' | 'dibatalkan') {
    if (
      statusBaru === 'dibatalkan' &&
      !window.confirm('Batalkan Penerimaan Barang ini? Stok yang sudah masuk akan dikurangi lagi.')
    ) {
      return
    }
    setError(null)
    setMemproses(true)
    try {
      const { error } = await supabase.from('penerimaan_barang').update({ status: statusBaru }).eq('id', pbId)
      if (error) throw error
      toast(statusBaru === 'selesai' ? 'Penerimaan Barang diselesaikan.' : 'Penerimaan Barang dibatalkan.')
      queryClient.invalidateQueries({ queryKey: ['penerimaan-barang-detail', pbId] })
      queryClient.invalidateQueries({ queryKey: ['penerimaan-barang-item', pbId] })
      queryClient.invalidateQueries({ queryKey: ['penerimaan-barang'] })
      if (pb?.po_id) queryClient.invalidateQueries({ queryKey: ['po-detail', pb.po_id] })
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
  if (!pb) return null

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/penerimaan-barang">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="font-mono text-lg font-semibold">{pb.nomor}</h1>
          <p className="text-sm text-muted-foreground">
            {fmtTanggal(pb.tanggal)} &middot; {pb.supplier?.nama ?? '-'}
          </p>
        </div>
        <Badge variant={VARIAN_STATUS[pb.status]}>{LABEL_STATUS[pb.status]}</Badge>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
          {pb.po ? <InfoField label="Dari PO" value={pb.po.nomor} /> : null}
          <InfoField label="Gudang" value={pb.gudang?.nama ?? '-'} />
          {pb.surat_jalan_supplier ? <InfoField label="No. surat jalan supplier" value={pb.surat_jalan_supplier} /> : null}
          {pb.biaya_tambahan > 0 ? <InfoField label="Biaya tambahan" value={rupiah(pb.biaya_tambahan)} /> : null}
          {pb.catatan ? <InfoField label="Catatan" value={pb.catatan} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Item diterima</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          <Table>
            <Thead>
              <Tr>
                <Th>Produk</Th>
                <Th>Satuan</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Harga beli</Th>
                {pb.status === 'selesai' ? <Th className="text-right">HPP/satuan dasar</Th> : null}
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
                  {pb.status === 'selesai' ? <Td className="tabular text-right">{rupiah(it.hpp_satuan)}</Td> : null}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </CardContent>
      </Card>

      {error ? <PesanError error={error} /> : null}

      {pb.status === 'draf' || pb.status === 'selesai' ? (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => ubahStatus('dibatalkan')} disabled={memproses}>
            {memproses ? <Spinner /> : null}
            Batalkan
          </Button>
          {pb.status === 'draf' ? (
            <Button onClick={() => ubahStatus('selesai')} disabled={memproses}>
              {memproses ? <Spinner /> : null}
              Tandai Diterima
            </Button>
          ) : null}
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
