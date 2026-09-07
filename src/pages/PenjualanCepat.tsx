import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  useGudangAktif,
  useAkunKasBankAktif,
  useProdukSatuan,
  useTierHarga,
  ambilHargaJual,
  cariProduk,
  cariPelanggan,
} from '@/lib/queries'
import { rupiah, tanggalISO } from '@/lib/format'
import { Combobox, type OpsiCombobox } from '@/components/Combobox'
import { toast } from '@/components/Toast'
import {
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
import { LABEL_KANAL } from '@/pages/SalesOrder'
import type { KanalPenjualan, MetodeBayar } from '@/types/db'

/** Kanal online yang punya akun pelanggan agregat dari seed (lihat 0009_seed_awal.sql). */
const KANAL_KE_KODE_AGREGAT: Partial<Record<KanalPenjualan, string>> = {
  tokopedia: 'TOKPED',
  shopee: 'SHOPEE',
  tiktok: 'TIKTOK',
  whatsapp: 'WA-UMUM',
}

/**
 * Satu baris barang. Sengaja HANYA ada di memori browser sampai tombol
 * "Proses Penjualan" ditekan -- beda dari Sales Order biasa yang menyimpan
 * item satu per satu ke database. Di sini tidak ada draf yang bisa
 * tertinggal setengah jadi kalau kasir batal di tengah jalan.
 */
interface BarisCepat {
  key: string
  produk_id: string
  produkLabel: OpsiCombobox
  satuan_id: string
  satuanKode: string
  konversi: number
  qty: number
  harga_satuan: number
  diskon_persen: number
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

interface PelangganSingkat {
  tier_harga_id: string | null
  alamat: string | null
  telepon: string | null
  whatsapp: string | null
  kelurahan: { nama: string } | null
  kecamatan: { nama: string } | null
  kabupaten_kota: { nama: string } | null
  provinsi: { nama: string } | null
}

function subtotalBaris(b: { qty: number; harga_satuan: number; diskon_persen: number }) {
  return Math.round(b.qty * b.harga_satuan * (1 - b.diskon_persen / 100) * 100) / 100
}

export function PenjualanCepat() {
  const navigate = useNavigate()
  const { data: gudangAktif } = useGudangAktif()
  const { data: tierHarga } = useTierHarga()
  const { data: akunKas } = useAkunKasBankAktif()

  const [tanggal, setTanggal] = useState(tanggalISO())
  const [kanal, setKanal] = useState<KanalPenjualan>('canvassing')
  const [pelangganId, setPelangganId] = useState<string | null>(null)
  const [pelangganLabel, setPelangganLabel] = useState<OpsiCombobox | null>(null)
  const [gudangId, setGudangId] = useState<string | null>(null)
  const [tierHargaId, setTierHargaId] = useState<string | null>(null)
  const [namaPenerima, setNamaPenerima] = useState('')
  const [teleponPenerima, setTeleponPenerima] = useState('')
  const [alamatKirim, setAlamatKirim] = useState('')
  const [catatan, setCatatan] = useState('')

  const [baris, setBaris] = useState<BarisCepat[]>([])
  const [addRow, setAddRow] = useState<BarisTambah>(BARIS_KOSONG)

  const [langsungBayar, setLangsungBayar] = useState(true)
  const [akunId, setAkunId] = useState<string | null>(null)
  const [metode, setMetode] = useState<MetodeBayar>('tunai')

  const [memproses, setMemproses] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const { data: satuanProduk } = useProdukSatuan(addRow.produk_id)

  // Gudang tunggal -> pilih otomatis, dropdownnya tidak perlu ditampilkan.
  useEffect(() => {
    if (gudangAktif?.length === 1 && !gudangId) setGudangId(gudangAktif[0]!.id)
  }, [gudangAktif, gudangId])

  useEffect(() => {
    if (tierHarga && tierHarga.length > 0 && !tierHargaId) {
      const bawaan = tierHarga.find((t) => t.jadi_default) ?? tierHarga[0]
      if (bawaan) setTierHargaId(bawaan.id)
    }
  }, [tierHarga, tierHargaId])

  useEffect(() => {
    if (akunKas && akunKas.length > 0 && !akunId) setAkunId(akunKas[0]!.id)
  }, [akunKas, akunId])

  async function segarkanHarga(produkId: string, satuanId: string, qty: number) {
    if (!tierHargaId) return
    try {
      const harga = await ambilHargaJual({ produkId, tierId: tierHargaId, satuanId, qty, tanggal })
      if (harga != null) setAddRow((r) => ({ ...r, harga_satuan: harga }))
    } catch {
      // Tidak ada aturan harga yang cocok -- biarkan diisi manual.
    }
  }

  // Produk baru dipilih -> pakai satuan pertama (biasanya satuan dasar) + ambil harganya.
  useEffect(() => {
    if (!addRow.produk_id || addRow.satuan_id || !satuanProduk || satuanProduk.length === 0) return
    const pertama = satuanProduk[0]!
    setAddRow((r) => ({ ...r, satuan_id: pertama.satuan_id, konversi: pertama.konversi }))
    void segarkanHarga(addRow.produk_id, pertama.satuan_id, addRow.qty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satuanProduk, addRow.produk_id])

  async function pilihPelanggan(id: string, opsi: OpsiCombobox) {
    setPelangganId(id)
    setPelangganLabel(opsi)
    const { data } = await supabase
      .from('pelanggan')
      .select(
        'tier_harga_id, alamat, telepon, whatsapp, ' +
          'kelurahan:kelurahan_kode(nama), kecamatan:kecamatan_kode(nama), ' +
          'kabupaten_kota:kabupaten_kode(nama), provinsi:provinsi_kode(nama)',
      )
      .eq('id', id)
      .single()
    const d = data as unknown as PelangganSingkat | null
    if (!d) return
    setAlamatKirim(
      [d.alamat, d.kelurahan?.nama, d.kecamatan?.nama, d.kabupaten_kota?.nama, d.provinsi?.nama]
        .filter(Boolean)
        .join(', '),
    )
    setTeleponPenerima(d.whatsapp || d.telepon || '')
    if (d.tier_harga_id) setTierHargaId(d.tier_harga_id)
  }

  async function ubahKanal(k: KanalPenjualan) {
    setKanal(k)
    const kode = KANAL_KE_KODE_AGREGAT[k]
    if (!kode) return
    const { data } = await supabase
      .from('pelanggan')
      .select('id, nama, kode, tier_harga_id')
      .eq('kode', kode)
      .single()
    if (!data) return
    setPelangganId(data.id)
    setPelangganLabel({ value: data.id, label: data.nama, sublabel: data.kode })
    if (data.tier_harga_id) setTierHargaId(data.tier_harga_id)
  }

  function tambahBaris() {
    if (!addRow.produk_id || !addRow.produkLabel || !addRow.satuan_id || addRow.qty <= 0) {
      setError(new Error('Pilih produk, satuan, dan isi qty lebih dari 0.'))
      return
    }
    setError(null)
    const kode = satuanProduk?.find((s) => s.satuan_id === addRow.satuan_id)?.satuan.kode ?? ''
    setBaris((b) => [
      ...b,
      {
        key: crypto.randomUUID(),
        produk_id: addRow.produk_id!,
        produkLabel: addRow.produkLabel!,
        satuan_id: addRow.satuan_id!,
        satuanKode: kode,
        konversi: addRow.konversi,
        qty: addRow.qty,
        harga_satuan: addRow.harga_satuan,
        diskon_persen: addRow.diskon_persen,
      },
    ])
    setAddRow(BARIS_KOSONG)
  }

  function ubahSatuan(satuanId: string) {
    const entri = satuanProduk?.find((s) => s.satuan_id === satuanId)
    setAddRow((r) => ({ ...r, satuan_id: satuanId, konversi: entri?.konversi ?? 1 }))
    if (addRow.produk_id) void segarkanHarga(addRow.produk_id, satuanId, addRow.qty)
  }

  const total = baris.reduce((s, b) => s + subtotalBaris(b), 0)

  async function proses() {
    setError(null)
    if (!pelangganId) {
      setError(new Error('Pilih pelanggan dulu.'))
      return
    }
    if (!gudangId) {
      setError(new Error('Belum ada gudang aktif. Tambahkan gudang di master data dulu.'))
      return
    }
    if (baris.length === 0) {
      setError(new Error('Belum ada barang yang ditambahkan.'))
      return
    }
    if (langsungBayar && !akunId) {
      setError(new Error('Pilih akun kas/bank tujuan pembayaran.'))
      return
    }

    setMemproses(true)
    try {
      const { data, error: err } = await supabase.rpc('penjualan_cepat', {
        p_pelanggan_id: pelangganId,
        p_gudang_id: gudangId,
        p_items: baris.map((b) => ({
          produk_id: b.produk_id,
          satuan_id: b.satuan_id,
          konversi: b.konversi,
          qty: b.qty,
          harga_satuan: b.harga_satuan,
          diskon_persen: b.diskon_persen,
        })),
        p_tanggal: tanggal,
        p_kanal: kanal,
        p_tier_harga_id: tierHargaId,
        p_akun_id: langsungBayar ? akunId : null,
        p_metode: metode,
        p_nama_penerima: namaPenerima || null,
        p_telepon_penerima: teleponPenerima || null,
        p_alamat_kirim: alamatKirim || null,
        p_catatan: catatan || null,
      })
      if (err) throw err
      toast(
        langsungBayar
          ? 'Penjualan selesai. Surat Jalan, Faktur, dan pembayarannya sudah tercatat.'
          : 'Penjualan tercatat sebagai piutang. Faktur sudah dibuat.',
      )
      navigate(`/faktur-penjualan/${data as string}`)
    } catch (e) {
      setError(e)
    } finally {
      setMemproses(false)
    }
  }

  const bukanCanvassing = kanal !== 'canvassing'

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/sales-order">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Zap className="h-5 w-5 text-primary" />
            Penjualan Cepat
          </h1>
          <p className="text-sm text-muted-foreground">
            Barang langsung diserahkan &amp; dibayar. Sistem otomatis membuat Sales Order, Surat Jalan,
            Faktur, dan Penerimaan Kas sekaligus.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Pembeli</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tanggal</Label>
              <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Kanal penjualan</Label>
              <Select value={kanal} onChange={(e) => ubahKanal(e.target.value as KanalPenjualan)}>
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
              value={pelangganId}
              opsiTerpilih={pelangganLabel}
              onChange={pilihPelanggan}
              cariOpsi={cariPelanggan}
              placeholder="Cari nama atau kode pelanggan..."
            />
          </div>

          {bukanCanvassing ? (
            <div className="space-y-1.5">
              <Label>Nama penerima paket</Label>
              <Input
                placeholder="Nama pembeli sesungguhnya (untuk label pengiriman)"
                value={namaPenerima}
                onChange={(e) => setNamaPenerima(e.target.value)}
              />
            </div>
          ) : null}

          {(gudangAktif?.length ?? 0) > 1 ? (
            <div className="space-y-1.5">
              <Label>Gudang</Label>
              <Select value={gudangId ?? ''} onChange={(e) => setGudangId(e.target.value)}>
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Alamat kirim</Label>
              <Input value={alamatKirim} onChange={(e) => setAlamatKirim(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Telepon/WA penerima</Label>
              <Input value={teleponPenerima} onChange={(e) => setTeleponPenerima(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Barang</CardTitle>
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
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {baris.map((b) => (
                <Tr key={b.key}>
                  <Td className="font-medium">
                    {b.produkLabel.label}
                    <span className="ml-1 font-mono text-xs text-muted-foreground">{b.produkLabel.sublabel}</span>
                  </Td>
                  <Td className="text-xs text-muted-foreground">{b.satuanKode}</Td>
                  <Td className="tabular text-right">{b.qty}</Td>
                  <Td className="tabular text-right">{rupiah(b.harga_satuan)}</Td>
                  <Td className="tabular text-right">{b.diskon_persen > 0 ? `${b.diskon_persen}%` : '-'}</Td>
                  <Td className="tabular text-right font-medium">{rupiah(subtotalBaris(b))}</Td>
                  <Td className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setBaris((rows) => rows.filter((r) => r.key !== b.key))}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </Td>
                </Tr>
              ))}
              {baris.length === 0 ? (
                <Tr>
                  <Td colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                    Belum ada barang.
                  </Td>
                </Tr>
              ) : null}
            </Tbody>
          </Table>

          <div className="space-y-2 border-t border-border p-3">
            <div className="grid gap-2 sm:grid-cols-[2fr_1fr_0.8fr_1fr_0.8fr_1fr_auto] sm:items-end">
              <div className="space-y-1">
                <Label className="text-xs">Produk</Label>
                <Combobox
                  value={addRow.produk_id}
                  opsiTerpilih={addRow.produkLabel}
                  onChange={(id, opsi) => setAddRow({ ...BARIS_KOSONG, produk_id: id, produkLabel: opsi, qty: 1 })}
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
                  onBlur={() => {
                    if (addRow.produk_id && addRow.satuan_id) {
                      void segarkanHarga(addRow.produk_id, addRow.satuan_id, addRow.qty)
                    }
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Harga / satuan</Label>
                <InputAngka
                  value={addRow.harga_satuan}
                  onChange={(nilai) => setAddRow((r) => ({ ...r, harga_satuan: nilai }))}
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
              <div className="space-y-1">
                <Label className="text-xs">Total</Label>
                <div className="flex h-9 items-center justify-end rounded-md border border-input bg-muted px-3 text-sm tabular">
                  {rupiah(subtotalBaris(addRow))}
                </div>
              </div>
              <Button onClick={tambahBaris}>
                <Plus className="h-4 w-4" />
                Tambah
              </Button>
            </div>
          </div>

          <div className="flex justify-end border-t border-border p-3">
            <div className="flex w-full max-w-xs justify-between text-base font-semibold">
              <span>Total</span>
              <span className="tabular">{rupiah(total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Pembayaran</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={langsungBayar}
              onChange={(e) => setLangsungBayar(e.target.checked)}
            />
            Sudah dibayar sekarang
          </label>

          {langsungBayar ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Masuk ke akun</Label>
                <Select value={akunId ?? ''} onChange={(e) => setAkunId(e.target.value)}>
                  <option value="" disabled>
                    Pilih akun...
                  </option>
                  {(akunKas ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nama}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Metode</Label>
                <Select value={metode} onChange={(e) => setMetode(e.target.value as MetodeBayar)}>
                  <option value="tunai">Tunai</option>
                  <option value="transfer">Transfer</option>
                  <option value="qris">QRIS</option>
                  <option value="kartu">Kartu</option>
                </Select>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Fakturnya akan tercatat sebagai piutang. Pembayarannya dicatat nanti lewat menu Penerimaan Kas.
            </p>
          )}

          <div className="space-y-1.5">
            <Label>Catatan</Label>
            <Input value={catatan} onChange={(e) => setCatatan(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {error ? <PesanError error={error} /> : null}

      <div className="flex items-center justify-end gap-3 pb-4">
        <span className="text-sm text-muted-foreground">
          Total <span className="tabular font-semibold text-foreground">{rupiah(total)}</span>
        </span>
        <Button size="lg" onClick={proses} disabled={memproses}>
          {memproses ? <Spinner /> : null}
          Proses Penjualan
        </Button>
      </div>
    </div>
  )
}
