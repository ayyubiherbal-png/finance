import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useGudangAktif, useProdukSatuan, cariProduk, cariSupplier } from '@/lib/queries'
import { rupiah, tanggalISO, tanggal as fmtTanggal } from '@/lib/format'
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
  InputAngka,
  Label,
  PesanError,
  Select,
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

interface HeaderForm {
  tanggal: string
  supplier_id: string | null
  supplierLabel: OpsiCombobox | null
  gudang_id: string | null
  tanggal_kirim: string
  termin_hari: number
  catatan: string
}

interface PODetail {
  id: string
  nomor: string
  tanggal: string
  status: StatusDokumen
  supplier_id: string
  gudang_id: string
  tanggal_kirim: string | null
  termin_hari: number
  catatan: string | null
  subtotal: number
  total: number
  supplier: { nama: string; kode: string } | null
  gudang: { nama: string } | null
}

interface BarisItem {
  id: string
  produk_id: string
  satuan_id: string
  konversi: number
  qty: number
  qty_dasar: number
  harga_satuan: number
  diskon_persen: number
  subtotal: number
  produk: { nama: string; kode: string } | null
  satuan: { kode: string } | null
}

interface BarisTambah {
  produk_id: string | null
  produkLabel: OpsiCombobox | null
  satuan_id: string | null
  konversi: number
  qty: number
  harga_satuan: number
  diskon_persen: number
}

const BARIS_KOSONG: BarisTambah = {
  produk_id: null,
  produkLabel: null,
  satuan_id: null,
  konversi: 1,
  qty: 1,
  harga_satuan: 0,
  diskon_persen: 0,
}

export function PurchaseOrderForm() {
  const { id } = useParams<{ id: string }>()
  const isBaru = !id || id === 'baru'
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { profil } = useAuth()

  const { data: gudangAktif } = useGudangAktif()

  const [header, setHeader] = useState<HeaderForm>(() => ({
    tanggal: tanggalISO(),
    supplier_id: null,
    supplierLabel: null,
    gudang_id: null,
    tanggal_kirim: '',
    termin_hari: 0,
    catatan: '',
  }))
  const [menyimpan, setMenyimpan] = useState(false)
  const [errorSimpan, setErrorSimpan] = useState<unknown>(null)

  useEffect(() => {
    if (isBaru && gudangAktif?.length === 1 && !header.gudang_id) {
      setHeader((h) => ({ ...h, gudang_id: gudangAktif[0]!.id }))
    }
  }, [isBaru, gudangAktif, header.gudang_id])

  async function pilihSupplier(idSup: string, opsi: OpsiCombobox) {
    setHeader((h) => ({ ...h, supplier_id: idSup, supplierLabel: opsi }))
    const { data } = await supabase.from('supplier').select('termin_hari').eq('id', idSup).single()
    if (data) setHeader((h) => ({ ...h, termin_hari: data.termin_hari }))
  }

  async function simpanDraf() {
    setErrorSimpan(null)
    if (!header.supplier_id) {
      setErrorSimpan(new Error('Pilih supplier dulu.'))
      return
    }
    if (!header.gudang_id) {
      setErrorSimpan(new Error('Belum ada gudang aktif. Tambahkan gudang di master data dulu.'))
      return
    }

    setMenyimpan(true)
    try {
      const { data, error } = await supabase
        .from('purchase_order')
        .insert({
          tanggal: header.tanggal,
          supplier_id: header.supplier_id,
          gudang_id: header.gudang_id,
          tanggal_kirim: header.tanggal_kirim || null,
          termin_hari: header.termin_hari,
          catatan: header.catatan || null,
          dibuat_oleh: profil?.id ?? null,
        })
        .select('id')
        .single()
      if (error) throw error
      toast('Draf Purchase Order tersimpan.')
      navigate(`/purchase-order/${data.id}`, { replace: true })
    } catch (e) {
      setErrorSimpan(e)
    } finally {
      setMenyimpan(false)
    }
  }

  if (isBaru) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/purchase-order">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-xl font-semibold">Purchase Order Baru</h1>
        </div>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <Combobox
                value={header.supplier_id}
                opsiTerpilih={header.supplierLabel}
                onChange={pilihSupplier}
                cariOpsi={cariSupplier}
                placeholder="Cari nama atau kode supplier..."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tanggal PO</Label>
                <Input
                  type="date"
                  value={header.tanggal}
                  onChange={(e) => setHeader((h) => ({ ...h, tanggal: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Perkiraan tanggal kirim</Label>
                <Input
                  type="date"
                  value={header.tanggal_kirim}
                  onChange={(e) => setHeader((h) => ({ ...h, tanggal_kirim: e.target.value }))}
                />
              </div>
            </div>

            {(gudangAktif?.length ?? 0) > 1 ? (
              <div className="space-y-1.5">
                <Label>Gudang tujuan</Label>
                <Select
                  value={header.gudang_id ?? ''}
                  onChange={(e) => setHeader((h) => ({ ...h, gudang_id: e.target.value }))}
                >
                  <option value="" disabled>
                    Pilih gudang...
                  </option>
                  {(gudangAktif ?? []).map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nama}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label>Termin bayar (hari)</Label>
              <Input
                type="number"
                min={0}
                value={header.termin_hari}
                onChange={(e) => setHeader((h) => ({ ...h, termin_hari: Number(e.target.value) }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Catatan</Label>
              <Input value={header.catatan} onChange={(e) => setHeader((h) => ({ ...h, catatan: e.target.value }))} />
            </div>

            {errorSimpan ? <PesanError error={errorSimpan} /> : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" asChild>
                <Link to="/purchase-order">Batal</Link>
              </Button>
              <Button onClick={simpanDraf} disabled={menyimpan}>
                {menyimpan ? <Spinner /> : null}
                Simpan sebagai Draf
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Item produk ditambahkan setelah draf tersimpan.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <FormEdit poId={id!} queryClient={queryClient} />
}

/* ------------------------------------------------------------- Form: edit / detail */

function FormEdit({ poId, queryClient }: { poId: string; queryClient: ReturnType<typeof useQueryClient> }) {
  const { data: po, isLoading, error } = useQuery({
    queryKey: ['po-detail', poId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_order')
        .select(
          'id, nomor, tanggal, status, supplier_id, gudang_id, tanggal_kirim, termin_hari, catatan, subtotal, total, supplier:supplier_id(nama, kode), gudang:gudang_id(nama)',
        )
        .eq('id', poId)
        .single()
      if (error) throw error
      return data as unknown as PODetail
    },
  })

  const { data: items } = useQuery({
    queryKey: ['po-items', poId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_order_item')
        .select(
          'id, produk_id, satuan_id, konversi, qty, qty_dasar, harga_satuan, diskon_persen, subtotal, produk:produk_id(nama, kode), satuan:satuan_id(kode)',
        )
        .eq('po_id', poId)
        .order('urutan')
      if (error) throw error
      return (data ?? []) as unknown as BarisItem[]
    },
    enabled: !!po,
  })

  const [addRow, setAddRow] = useState<BarisTambah>(BARIS_KOSONG)
  const [menambah, setMenambah] = useState(false)
  const [errorTambah, setErrorTambah] = useState<unknown>(null)
  const [errorStatus, setErrorStatus] = useState<unknown>(null)
  const [memprosesStatus, setMemprosesStatus] = useState(false)

  const { data: satuanProduk } = useProdukSatuan(addRow.produk_id)

  function invalidateSemua() {
    queryClient.invalidateQueries({ queryKey: ['po-items', poId] })
    queryClient.invalidateQueries({ queryKey: ['po-detail', poId] })
    queryClient.invalidateQueries({ queryKey: ['purchase-order'] })
  }

  useEffect(() => {
    if (!addRow.produk_id || addRow.satuan_id || !satuanProduk || satuanProduk.length === 0) return
    const pertama = satuanProduk[0]!
    setAddRow((r) => ({ ...r, satuan_id: pertama.satuan_id, konversi: pertama.konversi }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satuanProduk, addRow.produk_id])

  function pilihProduk(idProduk: string, opsi: OpsiCombobox) {
    setAddRow({ ...BARIS_KOSONG, produk_id: idProduk, produkLabel: opsi, qty: 1 })
  }

  function ubahSatuan(satuanId: string) {
    const entri = satuanProduk?.find((s) => s.satuan_id === satuanId)
    setAddRow((r) => ({ ...r, satuan_id: satuanId, konversi: entri?.konversi ?? 1 }))
  }

  async function tambahItem() {
    setErrorTambah(null)
    if (!addRow.produk_id || !addRow.satuan_id || addRow.qty <= 0) {
      setErrorTambah(new Error('Pilih produk, satuan, dan isi qty lebih dari 0.'))
      return
    }
    setMenambah(true)
    try {
      const { error } = await supabase.from('purchase_order_item').insert({
        po_id: poId,
        produk_id: addRow.produk_id,
        satuan_id: addRow.satuan_id,
        konversi: addRow.konversi,
        qty: addRow.qty,
        harga_satuan: addRow.harga_satuan,
        diskon_persen: addRow.diskon_persen,
        urutan: items?.length ?? 0,
      })
      if (error) throw error
      toast('Item ditambahkan.')
      setAddRow(BARIS_KOSONG)
      invalidateSemua()
    } catch (e) {
      setErrorTambah(e)
    } finally {
      setMenambah(false)
    }
  }

  async function hapusItem(itemId: string) {
    if (!window.confirm('Hapus baris ini dari Purchase Order?')) return
    const { error } = await supabase.from('purchase_order_item').delete().eq('id', itemId)
    if (!error) {
      toast('Item dihapus.')
      invalidateSemua()
    }
  }

  async function ubahStatus(statusBaru: 'disetujui' | 'dibatalkan' | 'draf') {
    if (statusBaru === 'dibatalkan' && !window.confirm('Batalkan Purchase Order ini?')) return
    setErrorStatus(null)
    setMemprosesStatus(true)
    try {
      const { error } = await supabase.from('purchase_order').update({ status: statusBaru }).eq('id', poId)
      if (error) throw error
      toast(
        statusBaru === 'disetujui' ? 'Purchase Order disetujui.' : statusBaru === 'draf' ? 'Purchase Order dibuka lagi.' : 'Purchase Order dibatalkan.',
      )
      invalidateSemua()
    } catch (e) {
      setErrorStatus(e)
    } finally {
      setMemprosesStatus(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }
  if (error) return <PesanError error={error} />
  if (!po) return null

  const bisaEdit = po.status === 'draf'

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/purchase-order">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="font-mono text-lg font-semibold">{po.nomor}</h1>
          <p className="text-sm text-muted-foreground">
            {fmtTanggal(po.tanggal)} &middot; {po.supplier?.nama ?? '-'}
          </p>
        </div>
        <Badge variant={VARIAN_STATUS[po.status]}>{LABEL_STATUS[po.status]}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detail Order</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-0 sm:grid-cols-2">
          <InfoField label="Supplier" value={po.supplier?.nama ?? '-'} />
          <InfoField label="Gudang tujuan" value={po.gudang?.nama ?? '-'} />
          <InfoField label="Termin" value={`${po.termin_hari} hari`} />
          {po.tanggal_kirim ? <InfoField label="Perkiraan kirim" value={fmtTanggal(po.tanggal_kirim)} /> : null}
          {po.catatan ? <InfoField label="Catatan" value={po.catatan} /> : null}
        </CardContent>
      </Card>

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
                {bisaEdit ? <Th></Th> : null}
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
                  {bisaEdit ? (
                    <Td className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => hapusItem(it.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </Td>
                  ) : null}
                </Tr>
              ))}
              {(!items || items.length === 0) && (
                <Tr>
                  <Td colSpan={bisaEdit ? 6 : 5} className="py-6 text-center text-sm text-muted-foreground">
                    Belum ada item.
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>

          {bisaEdit ? (
            <div className="space-y-2 border-t border-border p-3">
              <div className="grid gap-2 sm:grid-cols-[2fr_1fr_0.8fr_1fr_0.8fr_1fr_auto] sm:items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Produk</Label>
                  <Combobox
                    value={addRow.produk_id}
                    opsiTerpilih={addRow.produkLabel}
                    onChange={pilihProduk}
                    cariOpsi={cariProduk}
                    placeholder="Cari produk..."
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Satuan</Label>
                  <Select value={addRow.satuan_id ?? ''} onChange={(e) => ubahSatuan(e.target.value)}>
                    <option value="" disabled>
                      -
                    </option>
                    {(satuanProduk ?? []).map((s) => (
                      <option key={s.satuan_id} value={s.satuan_id}>
                        {s.satuan.kode}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Qty</Label>
                  <Input
                    type="number"
                    min={0}
                    value={addRow.qty}
                    onChange={(e) => setAddRow((r) => ({ ...r, qty: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Harga beli / satuan</Label>
                  <InputAngka value={addRow.harga_satuan} onChange={(nilai) => setAddRow((r) => ({ ...r, harga_satuan: nilai }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Diskon%</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={addRow.diskon_persen}
                    onChange={(e) => setAddRow((r) => ({ ...r, diskon_persen: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Total</Label>
                  <div className="flex h-9 items-center justify-end rounded-md border border-input bg-muted px-3 text-sm tabular">
                    {rupiah(addRow.qty * addRow.harga_satuan * (1 - addRow.diskon_persen / 100))}
                  </div>
                </div>
                <Button onClick={tambahItem} disabled={menambah}>
                  {menambah ? <Spinner /> : null}
                  Tambah
                </Button>
              </div>
              {errorTambah ? <PesanError error={errorTambah} /> : null}
            </div>
          ) : null}

          <div className="flex justify-end border-t border-border p-3">
            <div className="w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular">{rupiah(po.subtotal)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span className="tabular">{rupiah(po.total)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {errorStatus ? <PesanError error={errorStatus} /> : null}

      {po.status === 'draf' ? (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => ubahStatus('dibatalkan')} disabled={memprosesStatus}>
            Batalkan
          </Button>
          <Button onClick={() => ubahStatus('disetujui')} disabled={memprosesStatus || !items || items.length === 0}>
            {memprosesStatus ? <Spinner /> : null}
            Setujui
          </Button>
        </div>
      ) : po.status === 'disetujui' || po.status === 'sebagian' ? (
        <div className="flex justify-end">
          <Button asChild>
            <Link to={`/penerimaan-barang/baru?po=${po.id}`}>Buat Penerimaan Barang</Link>
          </Button>
        </div>
      ) : po.status === 'dibatalkan' ? (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => ubahStatus('draf')} disabled={memprosesStatus}>
            {memprosesStatus ? <Spinner /> : null}
            Buka Lagi jadi Draf
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
