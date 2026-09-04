import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useGudangAktif, useProdukSatuan, cariProduk } from '@/lib/queries'
import { angka, tanggal as fmtTanggal, tanggalISO } from '@/lib/format'
import { Combobox, type OpsiCombobox } from '@/components/Combobox'
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

type Jenis = 'penyesuaian' | 'saldo_awal'
const LABEL_JENIS: Record<Jenis, string> = { penyesuaian: 'Penyesuaian', saldo_awal: 'Saldo Awal' }

export function PenyesuaianStokForm() {
  const { id } = useParams<{ id: string }>()
  const isBaru = !id || id === 'baru'

  if (isBaru) return <FormBaru />
  return <FormEdit adjId={id!} />
}

/* ------------------------------------------------------------- Buat baru */

function FormBaru() {
  const navigate = useNavigate()
  const { profil } = useAuth()
  const { data: gudangAktif } = useGudangAktif()

  const [header, setHeader] = useState({
    tanggal: tanggalISO(),
    gudang_id: '',
    jenis: 'penyesuaian' as Jenis,
    alasan: '',
  })
  const [menyimpan, setMenyimpan] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (gudangAktif?.length === 1 && !header.gudang_id) {
      setHeader((h) => ({ ...h, gudang_id: gudangAktif[0]!.id }))
    }
  }, [gudangAktif, header.gudang_id])

  async function simpan() {
    setError(null)
    if (!header.gudang_id) {
      setError(new Error('Belum ada gudang aktif.'))
      return
    }
    setMenyimpan(true)
    try {
      const { data, error } = await supabase
        .from('penyesuaian_stok')
        .insert({
          tanggal: header.tanggal,
          gudang_id: header.gudang_id,
          jenis: header.jenis,
          alasan: header.alasan || null,
          dibuat_oleh: profil?.id ?? null,
        })
        .select('id')
        .single()
      if (error) throw error
      navigate(`/penyesuaian-stok/${data.id}`, { replace: true })
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
          <Link to="/penyesuaian-stok">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Penyesuaian Stok Baru</h1>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tanggal</Label>
              <Input type="date" value={header.tanggal} onChange={(e) => setHeader((h) => ({ ...h, tanggal: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Jenis</Label>
              <Select value={header.jenis} onChange={(e) => setHeader((h) => ({ ...h, jenis: e.target.value as Jenis }))}>
                <option value="penyesuaian">Penyesuaian (koreksi/hitung fisik/rusak/hilang)</option>
                <option value="saldo_awal">Saldo Awal (stok pertama kali masuk sistem)</option>
              </Select>
            </div>
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

          <div className="space-y-1.5">
            <Label>Alasan</Label>
            <Input
              placeholder="mis. Hasil stock opname September"
              value={header.alasan}
              onChange={(e) => setHeader((h) => ({ ...h, alasan: e.target.value }))}
            />
          </div>

          {error ? <PesanError error={error} /> : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" asChild>
              <Link to="/penyesuaian-stok">Batal</Link>
            </Button>
            <Button onClick={simpan} disabled={menyimpan}>
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

/* ------------------------------------------------------------- Edit / detail */

interface AdjDetail {
  id: string
  nomor: string
  tanggal: string
  jenis: Jenis
  status: StatusDokumen
  alasan: string | null
  gudang: { nama: string } | null
}

interface AdjItem {
  id: string
  produk_id: string
  satuan_id: string
  qty: number
  hpp_satuan: number | null
  catatan: string | null
  produk: { nama: string; kode: string } | null
  satuan: { kode: string } | null
}

interface BarisTambah {
  produk_id: string | null
  produkLabel: OpsiCombobox | null
  satuan_id: string | null
  konversi: number
  qty: number
  hpp_satuan: number
}

const BARIS_KOSONG: BarisTambah = {
  produk_id: null,
  produkLabel: null,
  satuan_id: null,
  konversi: 1,
  qty: 1,
  hpp_satuan: 0,
}

function FormEdit({ adjId }: { adjId: string }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<unknown>(null)

  const { data: adj, isLoading, error: errorMuat } = useQuery({
    queryKey: ['penyesuaian-detail', adjId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('penyesuaian_stok')
        .select('id, nomor, tanggal, jenis, status, alasan, gudang:gudang_id(nama)')
        .eq('id', adjId)
        .single()
      if (error) throw error
      return data as unknown as AdjDetail
    },
  })

  const { data: items } = useQuery({
    queryKey: ['penyesuaian-item', adjId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('penyesuaian_stok_item')
        .select('id, produk_id, satuan_id, qty, hpp_satuan, catatan, produk:produk_id(nama, kode), satuan:satuan_id(kode)')
        .eq('penyesuaian_id', adjId)
      if (error) throw error
      return (data ?? []) as unknown as AdjItem[]
    },
    enabled: !!adj,
  })

  const [addRow, setAddRow] = useState<BarisTambah>(BARIS_KOSONG)
  const [menambah, setMenambah] = useState(false)
  const [errorTambah, setErrorTambah] = useState<unknown>(null)
  const [memprosesStatus, setMemprosesStatus] = useState(false)

  const { data: satuanProduk } = useProdukSatuan(addRow.produk_id)

  function invalidateSemua() {
    queryClient.invalidateQueries({ queryKey: ['penyesuaian-item', adjId] })
    queryClient.invalidateQueries({ queryKey: ['penyesuaian-detail', adjId] })
    queryClient.invalidateQueries({ queryKey: ['penyesuaian-stok'] })
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
    if (!adj) return
    setErrorTambah(null)
    if (!addRow.produk_id || !addRow.satuan_id || addRow.qty === 0) {
      setErrorTambah(new Error('Pilih produk, satuan, dan isi qty (tidak boleh 0).'))
      return
    }
    if (adj.jenis === 'saldo_awal' && addRow.qty > 0 && addRow.hpp_satuan <= 0) {
      setErrorTambah(new Error('Saldo awal dengan qty positif wajib mengisi HPP per satuan dasar.'))
      return
    }
    setMenambah(true)
    try {
      const { error } = await supabase.from('penyesuaian_stok_item').insert({
        penyesuaian_id: adjId,
        produk_id: addRow.produk_id,
        satuan_id: addRow.satuan_id,
        konversi: addRow.konversi,
        qty: addRow.qty,
        hpp_satuan: addRow.qty > 0 ? addRow.hpp_satuan || null : null,
      })
      if (error) throw error
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
    const { error } = await supabase.from('penyesuaian_stok_item').delete().eq('id', itemId)
    if (!error) invalidateSemua()
  }

  async function ubahStatus(statusBaru: 'selesai' | 'dibatalkan') {
    if (statusBaru === 'dibatalkan' && !window.confirm('Batalkan penyesuaian ini? Efek stoknya akan dibalik.')) return
    setError(null)
    setMemprosesStatus(true)
    try {
      const { error } = await supabase.from('penyesuaian_stok').update({ status: statusBaru }).eq('id', adjId)
      if (error) throw error
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
  if (!adj) return null

  const bisaEdit = adj.status === 'draf'

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/penyesuaian-stok">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="font-mono text-lg font-semibold">{adj.nomor}</h1>
          <p className="text-sm text-muted-foreground">
            {fmtTanggal(adj.tanggal)} &middot; {adj.gudang?.nama} &middot; {LABEL_JENIS[adj.jenis]}
          </p>
        </div>
        <Badge variant={VARIAN_STATUS[adj.status]}>{LABEL_STATUS[adj.status]}</Badge>
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
                <Th className="text-right">HPP</Th>
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
                  <Td className={`tabular text-right ${it.qty < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                    {it.qty > 0 ? '+' : ''}
                    {angka(it.qty)}
                  </Td>
                  <Td className="tabular text-right text-muted-foreground">{it.hpp_satuan ? angka(it.hpp_satuan) : '-'}</Td>
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
                  <Td colSpan={bisaEdit ? 5 : 4} className="py-6 text-center text-sm text-muted-foreground">
                    Belum ada item.
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>

          {bisaEdit ? (
            <div className="space-y-2 border-t border-border p-3">
              <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
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
                  <Label className="text-xs">Qty (+ tambah, - kurangi)</Label>
                  <Input
                    type="number"
                    value={addRow.qty}
                    onChange={(e) => setAddRow((r) => ({ ...r, qty: Number(e.target.value) }))}
                  />
                </div>
                {addRow.qty > 0 ? (
                  <div className="space-y-1">
                    <Label className="text-xs">HPP {adj.jenis === 'saldo_awal' ? '(wajib)' : '(opsional)'}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={addRow.hpp_satuan}
                      onChange={(e) => setAddRow((r) => ({ ...r, hpp_satuan: Number(e.target.value) }))}
                    />
                  </div>
                ) : (
                  <div />
                )}
                <Button onClick={tambahItem} disabled={menambah}>
                  {menambah ? <Spinner /> : null}
                  Tambah
                </Button>
              </div>
              {errorTambah ? <PesanError error={errorTambah} /> : null}
              <p className="text-xs text-muted-foreground">
                Qty positif menambah stok (HPP ikut bergerak kalau diisi). Qty negatif mengurangi stok (mis. rusak/hilang), HPP tidak berlaku.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {error ? <PesanError error={error} /> : null}

      {adj.status === 'draf' || adj.status === 'selesai' ? (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => ubahStatus('dibatalkan')} disabled={memprosesStatus}>
            {memprosesStatus ? <Spinner /> : null}
            Batalkan
          </Button>
          {adj.status === 'draf' ? (
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
