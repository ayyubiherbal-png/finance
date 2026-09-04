import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useGudangAktif, useProdukSatuan, cariProduk, cariSupplier } from '@/lib/queries'
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

interface PBRingkas {
  id: string
  nomor: string
  tanggal: string
}

export function ReturPembelianForm() {
  const { id } = useParams<{ id: string }>()
  const isBaru = !id || id === 'baru'

  if (isBaru) return <FormBaru />
  return <FormEdit returId={id!} />
}

/* ------------------------------------------------------------- Buat baru */

function FormBaru() {
  const navigate = useNavigate()
  const { profil } = useAuth()
  const { data: gudangAktif } = useGudangAktif()

  const [supplierId, setSupplierId] = useState<string | null>(null)
  const [supplierLabel, setSupplierLabel] = useState<OpsiCombobox | null>(null)
  const [pbList, setPbList] = useState<PBRingkas[]>([])
  const [header, setHeader] = useState({
    tanggal: tanggalISO(),
    pb_id: '',
    gudang_id: '',
    alasan: '',
  })
  const [menyimpan, setMenyimpan] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (gudangAktif?.length === 1 && !header.gudang_id) {
      setHeader((h) => ({ ...h, gudang_id: gudangAktif[0]!.id }))
    }
  }, [gudangAktif, header.gudang_id])

  async function pilihSupplier(id: string, opsi: OpsiCombobox) {
    setSupplierId(id)
    setSupplierLabel(opsi)
    setHeader((h) => ({ ...h, pb_id: '' }))
    const { data } = await supabase
      .from('penerimaan_barang')
      .select('id, nomor, tanggal')
      .eq('supplier_id', id)
      .order('tanggal', { ascending: false })
      .limit(20)
    setPbList(data ?? [])
  }

  async function simpan() {
    setError(null)
    if (!supplierId || !header.gudang_id) {
      setError(new Error('Pilih supplier dan gudang dulu.'))
      return
    }
    setMenyimpan(true)
    try {
      const { data, error } = await supabase
        .from('retur_pembelian')
        .insert({
          tanggal: header.tanggal,
          supplier_id: supplierId,
          pb_id: header.pb_id || null,
          gudang_id: header.gudang_id,
          alasan: header.alasan || null,
          dibuat_oleh: profil?.id ?? null,
        })
        .select('id')
        .single()
      if (error) throw error
      toast('Draf retur tersimpan.')
      navigate(`/retur-pembelian/${data.id}`, { replace: true })
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
          <Link to="/retur-pembelian">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Retur Pembelian Baru</h1>
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

          {supplierId && pbList.length > 0 ? (
            <div className="space-y-1.5">
              <Label>Penerimaan Barang asal (opsional)</Label>
              <Select value={header.pb_id} onChange={(e) => setHeader((h) => ({ ...h, pb_id: e.target.value }))}>
                <option value="">Tanpa referensi</option>
                {pbList.map((pb) => (
                  <option key={pb.id} value={pb.id}>
                    {pb.nomor} ({fmtTanggal(pb.tanggal)})
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tanggal</Label>
              <Input type="date" value={header.tanggal} onChange={(e) => setHeader((h) => ({ ...h, tanggal: e.target.value }))} />
            </div>
            {(gudangAktif?.length ?? 0) > 1 ? (
              <div className="space-y-1.5">
                <Label>Gudang</Label>
                <Select value={header.gudang_id} onChange={(e) => setHeader((h) => ({ ...h, gudang_id: e.target.value }))}>
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
          </div>

          <div className="space-y-1.5">
            <Label>Alasan</Label>
            <Input value={header.alasan} onChange={(e) => setHeader((h) => ({ ...h, alasan: e.target.value }))} />
          </div>

          {error ? <PesanError error={error} /> : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" asChild>
              <Link to="/retur-pembelian">Batal</Link>
            </Button>
            <Button onClick={simpan} disabled={menyimpan}>
              {menyimpan ? <Spinner /> : null}
              Simpan sebagai Draf
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------- Edit / detail */

interface ReturDetail {
  id: string
  nomor: string
  tanggal: string
  status: StatusDokumen
  alasan: string | null
  total: number
  gudang: { nama: string } | null
  supplier: { nama: string } | null
}

interface ReturItem {
  id: string
  qty: number
  harga_satuan: number
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
}

const BARIS_KOSONG: BarisTambah = { produk_id: null, produkLabel: null, satuan_id: null, konversi: 1, qty: 1, harga_satuan: 0 }

function FormEdit({ returId }: { returId: string }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<unknown>(null)

  const { data: retur, isLoading, error: errorMuat } = useQuery({
    queryKey: ['retur-beli-detail', returId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('retur_pembelian')
        .select('id, nomor, tanggal, status, alasan, total, gudang:gudang_id(nama), supplier:supplier_id(nama)')
        .eq('id', returId)
        .single()
      if (error) throw error
      return data as unknown as ReturDetail
    },
  })

  const { data: items } = useQuery({
    queryKey: ['retur-beli-item', returId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('retur_pembelian_item')
        .select('id, qty, harga_satuan, subtotal, produk:produk_id(nama, kode), satuan:satuan_id(kode)')
        .eq('retur_id', returId)
      if (error) throw error
      return (data ?? []) as unknown as ReturItem[]
    },
    enabled: !!retur,
  })

  const [addRow, setAddRow] = useState<BarisTambah>(BARIS_KOSONG)
  const [menambah, setMenambah] = useState(false)
  const [errorTambah, setErrorTambah] = useState<unknown>(null)
  const [memprosesStatus, setMemprosesStatus] = useState(false)

  const { data: satuanProduk } = useProdukSatuan(addRow.produk_id)

  function invalidateSemua() {
    queryClient.invalidateQueries({ queryKey: ['retur-beli-item', returId] })
    queryClient.invalidateQueries({ queryKey: ['retur-beli-detail', returId] })
    queryClient.invalidateQueries({ queryKey: ['retur-pembelian'] })
  }

  useEffect(() => {
    if (!addRow.produk_id || addRow.satuan_id || !satuanProduk || satuanProduk.length === 0) return
    const pertama = satuanProduk[0]!
    setAddRow((r) => ({ ...r, satuan_id: pertama.satuan_id, konversi: pertama.konversi }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satuanProduk, addRow.produk_id])

  function pilihProduk(idProduk: string, opsi: OpsiCombobox) {
    setAddRow({ ...BARIS_KOSONG, produk_id: idProduk, produkLabel: opsi })
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
      const { error } = await supabase.from('retur_pembelian_item').insert({
        retur_id: returId,
        produk_id: addRow.produk_id,
        satuan_id: addRow.satuan_id,
        konversi: addRow.konversi,
        qty: addRow.qty,
        harga_satuan: addRow.harga_satuan,
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
    if (!window.confirm('Hapus baris ini?')) return
    const { error } = await supabase.from('retur_pembelian_item').delete().eq('id', itemId)
    if (!error) {
      toast('Item dihapus.')
      invalidateSemua()
    }
  }

  async function ubahStatus(statusBaru: 'selesai' | 'dibatalkan') {
    if (statusBaru === 'dibatalkan' && !window.confirm('Batalkan retur ini? Efek stoknya akan dibalik.')) return
    setError(null)
    setMemprosesStatus(true)
    try {
      const { error } = await supabase.from('retur_pembelian').update({ status: statusBaru }).eq('id', returId)
      if (error) throw error
      toast(statusBaru === 'selesai' ? 'Retur diposting.' : 'Retur dibatalkan.')
      invalidateSemua()
    } catch (e) {
      setError(e)
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
  if (errorMuat) return <PesanError error={errorMuat} />
  if (!retur) return null

  const bisaEdit = retur.status === 'draf'

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/retur-pembelian">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="font-mono text-lg font-semibold">{retur.nomor}</h1>
          <p className="text-sm text-muted-foreground">
            {fmtTanggal(retur.tanggal)} &middot; {retur.supplier?.nama ?? '-'}
          </p>
        </div>
        <Badge variant={VARIAN_STATUS[retur.status]}>{LABEL_STATUS[retur.status]}</Badge>
      </div>

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
              <div className="grid gap-2 sm:grid-cols-[2fr_1fr_0.8fr_1fr_auto] sm:items-end">
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
                  <Input type="number" min={0} value={addRow.qty} onChange={(e) => setAddRow((r) => ({ ...r, qty: Number(e.target.value) }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Harga</Label>
                  <Input
                    type="number"
                    min={0}
                    value={addRow.harga_satuan}
                    onChange={(e) => setAddRow((r) => ({ ...r, harga_satuan: Number(e.target.value) }))}
                  />
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
            <p className="text-base font-semibold">
              Total: <span className="tabular">{rupiah(retur.total)}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {error ? <PesanError error={error} /> : null}

      {retur.status === 'draf' || retur.status === 'selesai' ? (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => ubahStatus('dibatalkan')} disabled={memprosesStatus}>
            {memprosesStatus ? <Spinner /> : null}
            Batalkan
          </Button>
          {retur.status === 'draf' ? (
            <Button onClick={() => ubahStatus('selesai')} disabled={memprosesStatus || !items || items.length === 0}>
              {memprosesStatus ? <Spinner /> : null}
              Posting
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
