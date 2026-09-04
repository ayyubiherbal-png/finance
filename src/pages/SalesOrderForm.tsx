import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useGudangAktif, useProdukSatuan, useTierHarga, ambilHargaJual, cariProduk, cariPelanggan } from '@/lib/queries'
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
import { LABEL_KANAL, LABEL_STATUS, VARIAN_STATUS } from '@/pages/SalesOrder'
import type { KanalPenjualan, StatusDokumen, TerminBayar } from '@/types/db'

/** Kanal online yang punya akun pelanggan agregat dari seed (lihat 0009_seed_awal.sql). */
const KANAL_KE_KODE_AGREGAT: Partial<Record<KanalPenjualan, string>> = {
  tokopedia: 'TOKPED',
  shopee: 'SHOPEE',
  tiktok: 'TIKTOK',
  whatsapp: 'WA-UMUM',
}

interface HeaderForm {
  tanggal: string
  pelanggan_id: string | null
  pelangganLabel: OpsiCombobox | null
  kanal: KanalPenjualan
  gudang_id: string | null
  tier_harga_id: string | null
  termin: TerminBayar
  termin_hari: number
  nama_penerima: string
  alamat_kirim: string
  catatan: string
}

interface SODetail {
  id: string
  nomor: string
  tanggal: string
  status: StatusDokumen
  kanal: KanalPenjualan
  pelanggan_id: string
  gudang_id: string
  tier_harga_id: string | null
  termin: TerminBayar
  termin_hari: number
  nama_penerima: string | null
  alamat_kirim: string | null
  catatan: string | null
  subtotal: number
  diskon_header: number
  total: number
  pelanggan: { nama: string; kode: string } | null
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

export function SalesOrderForm() {
  const { id } = useParams<{ id: string }>()
  const isBaru = !id || id === 'baru'
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { profil } = useAuth()

  const { data: gudangAktif } = useGudangAktif()
  const { data: tierHarga } = useTierHarga()

  const [header, setHeader] = useState<HeaderForm>(() => ({
    tanggal: tanggalISO(),
    pelanggan_id: null,
    pelangganLabel: null,
    kanal: 'canvassing',
    gudang_id: null,
    tier_harga_id: null,
    termin: 'cod',
    termin_hari: 0,
    nama_penerima: '',
    alamat_kirim: '',
    catatan: '',
  }))
  const [menyimpanHeader, setMenyimpanHeader] = useState(false)
  const [errorSimpan, setErrorSimpan] = useState<unknown>(null)

  // Gudang tunggal -> pilih otomatis dan sembunyikan dropdown.
  useEffect(() => {
    if (isBaru && gudangAktif?.length === 1 && !header.gudang_id) {
      setHeader((h) => ({ ...h, gudang_id: gudangAktif[0]!.id }))
    }
  }, [isBaru, gudangAktif, header.gudang_id])

  // Tier default -> dipakai sampai pelanggan dipilih (lalu tier pelanggan menimpanya).
  useEffect(() => {
    if (isBaru && tierHarga && tierHarga.length > 0 && !header.tier_harga_id) {
      const bawaan = tierHarga.find((t) => t.jadi_default) ?? tierHarga[0]
      if (bawaan) setHeader((h) => ({ ...h, tier_harga_id: bawaan.id }))
    }
  }, [isBaru, tierHarga, header.tier_harga_id])

  async function pilihPelanggan(idPel: string, opsi: OpsiCombobox) {
    setHeader((h) => ({ ...h, pelanggan_id: idPel, pelangganLabel: opsi }))
    const { data } = await supabase
      .from('pelanggan')
      .select('tier_harga_id, termin, termin_hari')
      .eq('id', idPel)
      .single()
    if (data) {
      setHeader((h) => ({
        ...h,
        tier_harga_id: data.tier_harga_id ?? h.tier_harga_id,
        termin: data.termin,
        termin_hari: data.termin_hari,
      }))
    }
  }

  async function ubahKanal(k: KanalPenjualan) {
    setHeader((h) => ({ ...h, kanal: k }))
    const kodeAgregat = KANAL_KE_KODE_AGREGAT[k]
    if (!kodeAgregat) return
    const { data } = await supabase
      .from('pelanggan')
      .select('id, nama, kode, tier_harga_id, termin, termin_hari')
      .eq('kode', kodeAgregat)
      .single()
    if (data) {
      setHeader((h) => ({
        ...h,
        pelanggan_id: data.id,
        pelangganLabel: { value: data.id, label: data.nama, sublabel: data.kode },
        tier_harga_id: data.tier_harga_id ?? h.tier_harga_id,
        termin: data.termin,
        termin_hari: data.termin_hari,
      }))
    }
  }

  async function simpanDraf() {
    setErrorSimpan(null)
    if (!header.pelanggan_id) {
      setErrorSimpan(new Error('Pilih pelanggan dulu.'))
      return
    }
    if (!header.gudang_id) {
      setErrorSimpan(new Error('Belum ada gudang aktif. Tambahkan gudang di master data dulu.'))
      return
    }

    setMenyimpanHeader(true)
    try {
      const { data, error } = await supabase
        .from('sales_order')
        .insert({
          tanggal: header.tanggal,
          pelanggan_id: header.pelanggan_id,
          kanal: header.kanal,
          gudang_id: header.gudang_id,
          tier_harga_id: header.tier_harga_id,
          termin: header.termin,
          termin_hari: header.termin_hari,
          nama_penerima: header.nama_penerima || null,
          alamat_kirim: header.alamat_kirim || null,
          catatan: header.catatan || null,
          sales_id: profil?.id ?? null,
          dibuat_oleh: profil?.id ?? null,
        })
        .select('id')
        .single()
      if (error) throw error
      toast('Draf Sales Order tersimpan.')
      navigate(`/sales-order/${data.id}`, { replace: true })
    } catch (e) {
      setErrorSimpan(e)
    } finally {
      setMenyimpanHeader(false)
    }
  }

  if (isBaru) {
    return (
      <FormBaru
        header={header}
        setHeader={setHeader}
        gudangAktif={gudangAktif ?? []}
        tierHarga={tierHarga ?? []}
        pilihPelanggan={pilihPelanggan}
        ubahKanal={ubahKanal}
        onSimpan={simpanDraf}
        menyimpan={menyimpanHeader}
        error={errorSimpan}
      />
    )
  }

  return <FormEdit soId={id!} queryClient={queryClient} />
}

/* ------------------------------------------------------------- Form: buat baru */

function FormBaru({
  header,
  setHeader,
  gudangAktif,
  tierHarga,
  pilihPelanggan,
  ubahKanal,
  onSimpan,
  menyimpan,
  error,
}: {
  header: HeaderForm
  setHeader: React.Dispatch<React.SetStateAction<HeaderForm>>
  gudangAktif: { id: string; nama: string }[]
  tierHarga: { id: string; nama: string }[]
  pilihPelanggan: (id: string, opsi: OpsiCombobox) => void
  ubahKanal: (k: KanalPenjualan) => void
  onSimpan: () => void
  menyimpan: boolean
  error: unknown
}) {
  const bukanCanvassing = header.kanal !== 'canvassing'

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/sales-order">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Sales Order Baru</h1>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tanggal</Label>
              <Input
                type="date"
                value={header.tanggal}
                onChange={(e) => setHeader((h) => ({ ...h, tanggal: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Kanal penjualan</Label>
              <Select value={header.kanal} onChange={(e) => ubahKanal(e.target.value as KanalPenjualan)}>
                {Object.entries(LABEL_KANAL).map(([v, l]) => (
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
              value={header.pelanggan_id}
              opsiTerpilih={header.pelangganLabel}
              onChange={pilihPelanggan}
              cariOpsi={cariPelanggan}
              placeholder="Cari nama atau kode pelanggan..."
            />
            {bukanCanvassing ? (
              <p className="text-xs text-muted-foreground">
                Terisi otomatis ke akun agregat kanal ini. Ganti kalau pembeli sudah punya data pelanggan sendiri.
              </p>
            ) : null}
          </div>

          {bukanCanvassing ? (
            <div className="space-y-1.5">
              <Label>Nama penerima paket</Label>
              <Input
                placeholder="Nama pembeli sesungguhnya (untuk label pengiriman)"
                value={header.nama_penerima}
                onChange={(e) => setHeader((h) => ({ ...h, nama_penerima: e.target.value }))}
              />
            </div>
          ) : null}

          {gudangAktif.length > 1 ? (
            <div className="space-y-1.5">
              <Label>Gudang</Label>
              <Select
                value={header.gudang_id ?? ''}
                onChange={(e) => setHeader((h) => ({ ...h, gudang_id: e.target.value }))}
              >
                <option value="" disabled>
                  Pilih gudang...
                </option>
                {gudangAktif.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nama}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Tier harga</Label>
              <Select
                value={header.tier_harga_id ?? ''}
                onChange={(e) => setHeader((h) => ({ ...h, tier_harga_id: e.target.value }))}
              >
                {tierHarga.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nama}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Termin</Label>
              <Select
                value={header.termin}
                onChange={(e) => setHeader((h) => ({ ...h, termin: e.target.value as TerminBayar }))}
              >
                <option value="cod">COD</option>
                <option value="tempo">Tempo</option>
              </Select>
            </div>

            {header.termin === 'tempo' ? (
              <div className="space-y-1.5">
                <Label>Tempo (hari)</Label>
                <Input
                  type="number"
                  min={0}
                  value={header.termin_hari}
                  onChange={(e) => setHeader((h) => ({ ...h, termin_hari: Number(e.target.value) }))}
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Alamat kirim</Label>
            <Input
              value={header.alamat_kirim}
              onChange={(e) => setHeader((h) => ({ ...h, alamat_kirim: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Catatan</Label>
            <Input value={header.catatan} onChange={(e) => setHeader((h) => ({ ...h, catatan: e.target.value }))} />
          </div>

          {error ? <PesanError error={error} /> : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" asChild>
              <Link to="/sales-order">Batal</Link>
            </Button>
            <Button onClick={onSimpan} disabled={menyimpan}>
              {menyimpan ? <Spinner /> : null}
              Simpan sebagai Draf
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Item produk ditambahkan setelah draf tersimpan.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------- Form: edit / detail */

function FormEdit({ soId, queryClient }: { soId: string; queryClient: ReturnType<typeof useQueryClient> }) {
  const { data: so, isLoading, error } = useQuery({
    queryKey: ['sales-order-detail', soId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_order')
        .select(
          'id, nomor, tanggal, status, kanal, pelanggan_id, gudang_id, tier_harga_id, termin, termin_hari, nama_penerima, alamat_kirim, catatan, subtotal, diskon_header, total, pelanggan:pelanggan_id(nama, kode), gudang:gudang_id(nama)',
        )
        .eq('id', soId)
        .single()
      if (error) throw error
      return data as unknown as SODetail
    },
  })

  const { data: items } = useQuery({
    queryKey: ['so-items', soId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_order_item')
        .select(
          'id, produk_id, satuan_id, konversi, qty, qty_dasar, harga_satuan, diskon_persen, subtotal, produk:produk_id(nama, kode), satuan:satuan_id(kode)',
        )
        .eq('so_id', soId)
        .order('urutan')
      if (error) throw error
      return (data ?? []) as unknown as BarisItem[]
    },
    enabled: !!so,
  })

  const [addRow, setAddRow] = useState<BarisTambah>(BARIS_KOSONG)
  const [menambah, setMenambah] = useState(false)
  const [errorTambah, setErrorTambah] = useState<unknown>(null)
  const [errorStatus, setErrorStatus] = useState<unknown>(null)
  const [memprosesStatus, setMemprosesStatus] = useState(false)

  const { data: satuanProduk } = useProdukSatuan(addRow.produk_id)

  function invalidateSemua() {
    queryClient.invalidateQueries({ queryKey: ['so-items', soId] })
    queryClient.invalidateQueries({ queryKey: ['sales-order-detail', soId] })
    queryClient.invalidateQueries({ queryKey: ['sales-order'] })
  }

  async function segarkanHarga(satuanId: string | null, qty: number) {
    if (!so || !addRow.produk_id || !satuanId || !so.tier_harga_id) return
    try {
      const harga = await ambilHargaJual({
        produkId: addRow.produk_id,
        tierId: so.tier_harga_id,
        satuanId,
        qty,
        tanggal: so.tanggal,
      })
      if (harga != null) setAddRow((r) => ({ ...r, harga_satuan: harga }))
    } catch {
      // Tidak ada aturan harga yang cocok -- biarkan sales isi manual.
    }
  }

  // Produk baru dipilih di baris tambah -> otomatis pakai satuan pertama (biasanya satuan dasar).
  useEffect(() => {
    if (!addRow.produk_id || addRow.satuan_id || !satuanProduk || satuanProduk.length === 0) return
    const pertama = satuanProduk[0]!
    setAddRow((r) => ({ ...r, satuan_id: pertama.satuan_id, konversi: pertama.konversi }))
    void segarkanHarga(pertama.satuan_id, addRow.qty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satuanProduk, addRow.produk_id])

  function pilihProduk(idProduk: string, opsi: OpsiCombobox) {
    setAddRow({ ...BARIS_KOSONG, produk_id: idProduk, produkLabel: opsi, qty: 1 })
  }

  function ubahSatuan(satuanId: string) {
    const entri = satuanProduk?.find((s) => s.satuan_id === satuanId)
    setAddRow((r) => ({ ...r, satuan_id: satuanId, konversi: entri?.konversi ?? 1 }))
    void segarkanHarga(satuanId, addRow.qty)
  }

  async function tambahItem() {
    setErrorTambah(null)
    if (!addRow.produk_id || !addRow.satuan_id || addRow.qty <= 0) {
      setErrorTambah(new Error('Pilih produk, satuan, dan isi qty lebih dari 0.'))
      return
    }
    setMenambah(true)
    try {
      const { error } = await supabase.from('sales_order_item').insert({
        so_id: soId,
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
    if (!window.confirm('Hapus baris ini dari Sales Order?')) return
    const { error } = await supabase.from('sales_order_item').delete().eq('id', itemId)
    if (!error) {
      toast('Item dihapus.')
      invalidateSemua()
    }
  }

  async function ubahStatus(statusBaru: 'disetujui' | 'dibatalkan') {
    if (statusBaru === 'dibatalkan' && !window.confirm('Batalkan Sales Order ini?')) return
    setErrorStatus(null)
    setMemprosesStatus(true)
    try {
      const { error } = await supabase.from('sales_order').update({ status: statusBaru }).eq('id', soId)
      if (error) throw error
      toast(statusBaru === 'disetujui' ? 'Sales Order disetujui.' : 'Sales Order dibatalkan.')
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
  if (!so) return null

  const bisaEdit = so.status === 'draf'

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/sales-order">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="font-mono text-lg font-semibold">{so.nomor}</h1>
          <p className="text-sm text-muted-foreground">
            {fmtTanggal(so.tanggal)} &middot; {so.pelanggan?.nama ?? '-'}
          </p>
        </div>
        <Badge variant={VARIAN_STATUS[so.status]}>{LABEL_STATUS[so.status]}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detail Order</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-0 sm:grid-cols-2">
          <InfoField label="Pelanggan" value={so.pelanggan?.nama ?? '-'} />
          <InfoField label="Kanal" value={LABEL_KANAL[so.kanal]} />
          <InfoField label="Gudang" value={so.gudang?.nama ?? '-'} />
          <InfoField label="Termin" value={so.termin === 'cod' ? 'COD' : `Tempo ${so.termin_hari} hari`} />
          {so.nama_penerima ? <InfoField label="Nama penerima" value={so.nama_penerima} /> : null}
          {so.alamat_kirim ? <InfoField label="Alamat kirim" value={so.alamat_kirim} /> : null}
          {so.catatan ? <InfoField label="Catatan" value={so.catatan} /> : null}
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
                <Th className="text-right">Diskon%</Th>
                <Th className="text-right">Subtotal</Th>
                {bisaEdit ? <Th></Th> : null}
              </Tr>
            </Thead>
            <Tbody>
              {(items ?? []).map((it) => (
                <Tr key={it.id}>
                  <Td className="font-medium">
                    {it.produk?.nama ?? '-'}
                    <span className="ml-1 font-mono text-xs text-muted-foreground">{it.produk?.kode}</span>
                  </Td>
                  <Td className="text-xs text-muted-foreground">{it.satuan?.kode}</Td>
                  <Td className="tabular text-right">{it.qty}</Td>
                  <Td className="tabular text-right">{rupiah(it.harga_satuan)}</Td>
                  <Td className="tabular text-right">{it.diskon_persen > 0 ? `${it.diskon_persen}%` : '-'}</Td>
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
                  <Td colSpan={bisaEdit ? 7 : 6} className="py-6 text-center text-sm text-muted-foreground">
                    Belum ada item.
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>

          {bisaEdit ? (
            <div className="space-y-2 border-t border-border p-3">
              <div className="grid gap-2 sm:grid-cols-[2fr_1fr_0.8fr_1fr_0.8fr_auto] sm:items-end">
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
                    onBlur={() => segarkanHarga(addRow.satuan_id, addRow.qty)}
                  />
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
                <span className="tabular">{rupiah(so.subtotal)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span className="tabular">{rupiah(so.total)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {errorStatus ? <PesanError error={errorStatus} /> : null}

      {so.status === 'draf' ? (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => ubahStatus('dibatalkan')} disabled={memprosesStatus}>
            Batalkan
          </Button>
          <Button
            onClick={() => ubahStatus('disetujui')}
            disabled={memprosesStatus || !items || items.length === 0}
          >
            {memprosesStatus ? <Spinner /> : null}
            Setujui
          </Button>
        </div>
      ) : so.status === 'disetujui' || so.status === 'sebagian' ? (
        <div className="flex justify-end">
          <Button asChild>
            <Link to={`/surat-jalan/baru?so=${so.id}`}>Buat Surat Jalan</Link>
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
