import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Printer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { tanggal as fmtTanggal, tanggalISO } from '@/lib/format'
import { toast } from '@/components/Toast'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
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

interface SOSumberItem {
  id: string
  produk_id: string
  satuan_id: string
  konversi: number
  qty_dasar: number
  qty_terkirim: number
  produk: { nama: string; kode: string } | null
  satuan: { kode: string } | null
}

interface SOSumber {
  id: string
  nomor: string
  status: StatusDokumen
  pelanggan_id: string
  gudang_id: string
  alamat_kirim: string | null
  nama_penerima: string | null
  telepon_penerima: string | null
  pelanggan: { nama: string } | null
  gudang: { nama: string } | null
}

interface BarisKirim extends SOSumberItem {
  qtyKirim: number
}

export function SuratJalanForm() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const isBaru = !id || id === 'baru'

  if (isBaru) return <FormBaru soId={searchParams.get('so')} />
  return <FormDetail sjId={id!} />
}

/* ------------------------------------------------------------- Buat dari SO */

function FormBaru({ soId }: { soId: string | null }) {
  const navigate = useNavigate()
  const { profil } = useAuth()
  const [baris, setBaris] = useState<BarisKirim[]>([])
  const [header, setHeader] = useState({
    tanggal: tanggalISO(),
    alamat_kirim: '',
    nama_penerima: '',
    telepon_penerima: '',
    ekspedisi: '',
    nomor_kendaraan: '',
    nama_sopir: '',
    catatan: '',
  })
  const [error, setError] = useState<unknown>(null)
  const [memproses, setMemproses] = useState<'draf' | 'kirim' | null>(null)

  const { data: so, isLoading } = useQuery({
    queryKey: ['so-sumber-sj', soId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_order')
        .select(
          'id, nomor, status, pelanggan_id, gudang_id, alamat_kirim, nama_penerima, telepon_penerima, pelanggan:pelanggan_id(nama), gudang:gudang_id(nama)',
        )
        .eq('id', soId as string)
        .single()
      if (error) throw error
      return data as unknown as SOSumber
    },
    enabled: !!soId,
  })

  const { data: itemSO } = useQuery({
    queryKey: ['so-sumber-sj-item', soId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_order_item')
        .select('id, produk_id, satuan_id, konversi, qty_dasar, qty_terkirim, produk:produk_id(nama, kode), satuan:satuan_id(kode)')
        .eq('so_id', soId as string)
        .order('urutan')
      if (error) throw error
      return (data ?? []) as unknown as SOSumberItem[]
    },
    enabled: !!soId,
  })

  useEffect(() => {
    if (!itemSO) return
    setBaris(
      itemSO
        .filter((it) => it.qty_dasar - it.qty_terkirim > 0.0001)
        .map((it) => ({ ...it, qtyKirim: (it.qty_dasar - it.qty_terkirim) / it.konversi })),
    )
  }, [itemSO])

  useEffect(() => {
    if (!so) return
    setHeader((h) => ({
      ...h,
      alamat_kirim: so.alamat_kirim ?? h.alamat_kirim,
      nama_penerima: so.nama_penerima ?? h.nama_penerima,
      telepon_penerima: so.telepon_penerima ?? h.telepon_penerima,
    }))
  }, [so])

  if (!soId) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="font-medium">Surat Jalan dibuat dari Sales Order</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Buka daftar Sales Order, pilih yang berstatus "Disetujui", lalu klik "Buat Surat Jalan".
        </p>
        <Button asChild className="mt-4">
          <Link to="/sales-order">Ke Sales Order</Link>
        </Button>
      </div>
    )
  }

  if (isLoading || !so) {
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
        const maks = (r.qty_dasar - r.qty_terkirim) / r.konversi
        return { ...r, qtyKirim: Math.max(0, Math.min(nilai, maks)) }
      }),
    )
  }

  async function simpan(langsungKirim: boolean) {
    if (!so) return // dijaga juga oleh guard render di bawah; ini untuk TS narrowing di closure
    setError(null)
    const dikirim = baris.filter((r) => r.qtyKirim > 0)
    if (dikirim.length === 0) {
      setError(new Error('Isi jumlah kirim minimal satu produk.'))
      return
    }

    setMemproses(langsungKirim ? 'kirim' : 'draf')
    try {
      const { data: sj, error: errHeader } = await supabase
        .from('surat_jalan')
        .insert({
          tanggal: header.tanggal,
          so_id: so.id,
          pelanggan_id: so.pelanggan_id,
          gudang_id: so.gudang_id,
          alamat_kirim: header.alamat_kirim || null,
          nama_penerima: header.nama_penerima || null,
          telepon_penerima: header.telepon_penerima || null,
          ekspedisi: header.ekspedisi || null,
          nomor_kendaraan: header.nomor_kendaraan || null,
          nama_sopir: header.nama_sopir || null,
          catatan: header.catatan || null,
          dibuat_oleh: profil?.id ?? null,
        })
        .select('id')
        .single()
      if (errHeader) throw errHeader

      const { error: errItem } = await supabase.from('surat_jalan_item').insert(
        dikirim.map((r) => ({
          sj_id: sj.id,
          so_item_id: r.id,
          produk_id: r.produk_id,
          satuan_id: r.satuan_id,
          konversi: r.konversi,
          qty: r.qtyKirim,
        })),
      )
      if (errItem) throw errItem

      if (langsungKirim) {
        const { error: errStatus } = await supabase.from('surat_jalan').update({ status: 'selesai' }).eq('id', sj.id)
        if (errStatus) throw errStatus
      }

      toast(langsungKirim ? 'Surat Jalan terkirim.' : 'Draf Surat Jalan tersimpan.')
      navigate(`/surat-jalan/${sj.id}`, { replace: true })
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
          <Link to={`/sales-order/${so.id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Surat Jalan Baru</h1>
          <p className="text-sm text-muted-foreground">
            Dari SO <span className="font-mono">{so.nomor}</span> &middot; {so.pelanggan?.nama}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Barang yang dikirim</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          <Table>
            <Thead>
              <Tr>
                <Th>Produk</Th>
                <Th>Satuan</Th>
                <Th className="text-right">Sisa</Th>
                <Th className="text-right">Kirim sekarang</Th>
              </Tr>
            </Thead>
            <Tbody>
              {baris.map((r) => {
                const maks = (r.qty_dasar - r.qty_terkirim) / r.konversi
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
                        value={r.qtyKirim}
                        onChange={(e) => ubahQty(r.id, Number(e.target.value))}
                        className="ml-auto w-24 text-right"
                      />
                    </Td>
                  </Tr>
                )
              })}
              {baris.length === 0 ? (
                <Tr>
                  <Td colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                    Semua item pada SO ini sudah terkirim penuh.
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
              <Label>Tanggal kirim</Label>
              <Input
                type="date"
                value={header.tanggal}
                onChange={(e) => setHeader((h) => ({ ...h, tanggal: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ekspedisi / kurir</Label>
              <Input
                placeholder="mis. JNE, sales sendiri"
                value={header.ekspedisi}
                onChange={(e) => setHeader((h) => ({ ...h, ekspedisi: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Alamat kirim</Label>
            <Input
              value={header.alamat_kirim}
              onChange={(e) => setHeader((h) => ({ ...h, alamat_kirim: e.target.value }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nama penerima</Label>
              <Input
                value={header.nama_penerima}
                onChange={(e) => setHeader((h) => ({ ...h, nama_penerima: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Telepon/WA penerima</Label>
              <Input
                value={header.telepon_penerima}
                onChange={(e) => setHeader((h) => ({ ...h, telepon_penerima: e.target.value }))}
              />
            </div>
          </div>

          {error ? <PesanError error={error} /> : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => simpan(false)} disabled={memproses !== null}>
              {memproses === 'draf' ? <Spinner /> : null}
              Simpan sebagai Draf
            </Button>
            <Button onClick={() => simpan(true)} disabled={memproses !== null}>
              {memproses === 'kirim' ? <Spinner /> : null}
              Kirim Sekarang
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            "Kirim Sekarang" langsung mengurangi stok gudang {so.gudang?.nama}.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------- Detail / aksi */

interface SJDetail {
  id: string
  nomor: string
  tanggal: string
  status: StatusDokumen
  so_id: string | null
  pelanggan_id: string
  alamat_kirim: string | null
  nama_penerima: string | null
  telepon_penerima: string | null
  ekspedisi: string | null
  nomor_kendaraan: string | null
  nama_sopir: string | null
  catatan: string | null
  pelanggan: { nama: string } | null
  gudang: { nama: string } | null
  so: { nomor: string } | null
}

interface SJItem {
  id: string
  produk_id: string
  satuan_id: string
  qty: number
  produk: { nama: string; kode: string } | null
  satuan: { kode: string } | null
}

function FormDetail({ sjId }: { sjId: string }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<unknown>(null)
  const [memproses, setMemproses] = useState(false)

  const { data: sj, isLoading, error: errorMuat } = useQuery({
    queryKey: ['surat-jalan-detail', sjId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('surat_jalan')
        .select(
          'id, nomor, tanggal, status, so_id, pelanggan_id, alamat_kirim, nama_penerima, telepon_penerima, ekspedisi, nomor_kendaraan, nama_sopir, catatan, pelanggan:pelanggan_id(nama), gudang:gudang_id(nama), so:so_id(nomor)',
        )
        .eq('id', sjId)
        .single()
      if (error) throw error
      return data as unknown as SJDetail
    },
  })

  const { data: items } = useQuery({
    queryKey: ['surat-jalan-item', sjId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('surat_jalan_item')
        .select('id, produk_id, satuan_id, qty, produk:produk_id(nama, kode), satuan:satuan_id(kode)')
        .eq('sj_id', sjId)
      if (error) throw error
      return (data ?? []) as unknown as SJItem[]
    },
    enabled: !!sj,
  })

  async function ubahStatus(statusBaru: 'selesai' | 'dibatalkan') {
    if (statusBaru === 'dibatalkan' && !window.confirm('Batalkan Surat Jalan ini? Stok yang sudah terkirim akan dikembalikan.')) {
      return
    }
    setError(null)
    setMemproses(true)
    try {
      const { error } = await supabase.from('surat_jalan').update({ status: statusBaru }).eq('id', sjId)
      if (error) throw error
      toast(statusBaru === 'selesai' ? 'Surat Jalan diselesaikan.' : 'Surat Jalan dibatalkan.')
      queryClient.invalidateQueries({ queryKey: ['surat-jalan-detail', sjId] })
      queryClient.invalidateQueries({ queryKey: ['surat-jalan'] })
      if (sj?.so_id) queryClient.invalidateQueries({ queryKey: ['sales-order-detail', sj.so_id] })
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
  if (!sj) return null

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/surat-jalan">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="font-mono text-lg font-semibold">{sj.nomor}</h1>
          <p className="text-sm text-muted-foreground">
            {fmtTanggal(sj.tanggal)} &middot; {sj.pelanggan?.nama ?? '-'}
          </p>
        </div>
        <Badge variant={VARIAN_STATUS[sj.status]}>{LABEL_STATUS[sj.status]}</Badge>
        <Button variant="outline" asChild>
          <Link to={`/surat-jalan/${sj.id}/cetak`} target="_blank">
            <Printer className="h-4 w-4" />
            Cetak
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
          {sj.so ? <InfoField label="Dari SO" value={sj.so.nomor} /> : null}
          <InfoField label="Gudang" value={sj.gudang?.nama ?? '-'} />
          {sj.ekspedisi ? <InfoField label="Ekspedisi" value={sj.ekspedisi} /> : null}
          {sj.nomor_kendaraan ? <InfoField label="No. kendaraan" value={sj.nomor_kendaraan} /> : null}
          {sj.nama_sopir ? <InfoField label="Sopir" value={sj.nama_sopir} /> : null}
          {sj.nama_penerima ? <InfoField label="Nama penerima" value={sj.nama_penerima} /> : null}
          {sj.telepon_penerima ? <InfoField label="Telepon/WA penerima" value={sj.telepon_penerima} /> : null}
          {sj.alamat_kirim ? <InfoField label="Alamat kirim" value={sj.alamat_kirim} /> : null}
          {sj.catatan ? <InfoField label="Catatan" value={sj.catatan} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Item dikirim</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          <Table>
            <Thead>
              <Tr>
                <Th>Produk</Th>
                <Th>Satuan</Th>
                <Th className="text-right">Qty</Th>
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
                </Tr>
              ))}
            </Tbody>
          </Table>
        </CardContent>
      </Card>

      {error ? <PesanError error={error} /> : null}

      {sj.status === 'draf' || sj.status === 'selesai' ? (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => ubahStatus('dibatalkan')} disabled={memproses}>
            {memproses ? <Spinner /> : null}
            Batalkan
          </Button>
          {sj.status === 'draf' ? (
            <Button onClick={() => ubahStatus('selesai')} disabled={memproses}>
              {memproses ? <Spinner /> : null}
              Tandai Terkirim
            </Button>
          ) : (
            <Button asChild>
              <Link to={`/faktur-penjualan/baru?pelanggan=${sj.pelanggan_id}`}>Lanjut ke Faktur</Link>
            </Button>
          )}
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
