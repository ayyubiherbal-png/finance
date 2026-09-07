import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { tt } from '@/lib/i18n'
import { useGudangAktif } from '@/lib/queries'
import { rupiah, tanggal as fmtTanggal } from '@/lib/format'
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
  Select,
  Spinner,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@/components/ui'
import {
  DAFTAR_BIDANG,
  KANAL_IMPOR,
  KATA_STATUS_AMAN,
  bacaFile,
  kelompokkanPesanan,
  statusAmanDiimpor,
  tebakPemetaan,
  type BarisMentah,
  type PemetaanKolom,
  type PesananDikelompokkan,
} from '@/lib/importPesanan'
import type { KanalPenjualan } from '@/types/db'

/** Satu produk unik dari file (dikunci SKU kalau ada, kalau tidak nama produk). */
interface ProdukSumber {
  kunci: string
  sku: string
  namaProduk: string
  totalQty: number
}

interface HasilCocok {
  produk_id: string
  satuan_id: string
  konversi: number
  label: string
}

function kunciProduk(sku: string, namaProduk: string): string {
  return sku.trim() ? `sku:${sku.trim().toLowerCase()}` : `nama:${namaProduk.trim().toLowerCase()}`
}

export function ImporPesanan() {
  const navigate = useNavigate()
  const { data: gudangAktif } = useGudangAktif()

  const [kanal, setKanal] = useState<(typeof KANAL_IMPOR)[number]['kunci']>('shopee')
  const [gudangId, setGudangId] = useState<string | null>(null)

  const [namaFile, setNamaFile] = useState('')
  const [headerKolom, setHeaderKolom] = useState<string[]>([])
  const [barisMentah, setBarisMentah] = useState<BarisMentah[]>([])
  const [peta, setPeta] = useState<PemetaanKolom>({})
  const [memuatFile, setMemuatFile] = useState(false)
  const [errorFile, setErrorFile] = useState<unknown>(null)

  const [langkah, setLangkah] = useState<'unggah' | 'petakan' | 'cocokkan' | 'pratinjau'>('unggah')

  const [petaProduk, setPetaProduk] = useState<Map<string, HasilCocok | null>>(new Map())
  const [sudahDiimpor, setSudahDiimpor] = useState<Set<string>>(new Set())
  const [memuatCocok, setMemuatCocok] = useState(false)

  const [dicentang, setDicentang] = useState<Set<string>>(new Set())
  const [memproses, setMemproses] = useState(false)
  const [hasilProses, setHasilProses] = useState<{ berhasil: number; dilewati: number; gagal: { nomor: string; pesan: string }[] } | null>(null)

  const gudangTunggal = (gudangAktif?.length ?? 0) <= 1
  if (gudangTunggal && !gudangId && gudangAktif?.[0]) setGudangId(gudangAktif[0].id)

  const bidangBelumLengkap = DAFTAR_BIDANG.filter((b) => b.wajib && !peta[b.bidang])

  const pesanan = useMemo(() => kelompokkanPesanan(barisMentah, peta), [barisMentah, peta])

  const produkSumber = useMemo<ProdukSumber[]>(() => {
    const peta2 = new Map<string, ProdukSumber>()
    for (const p of pesanan) {
      for (const it of p.item) {
        const k = kunciProduk(it.sku, it.namaProduk)
        const ada = peta2.get(k)
        if (ada) ada.totalQty += it.qty
        else peta2.set(k, { kunci: k, sku: it.sku, namaProduk: it.namaProduk, totalQty: it.qty })
      }
    }
    return [...peta2.values()].sort((a, b) => b.totalQty - a.totalQty)
  }, [pesanan])

  async function pilihFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErrorFile(null)
    setMemuatFile(true)
    setHasilProses(null)
    try {
      const hasil = await bacaFile(file)
      if (hasil.baris.length === 0) throw new Error('File kosong atau formatnya tidak terbaca.')
      setNamaFile(file.name)
      setHeaderKolom(hasil.headerKolom)
      setBarisMentah(hasil.baris)
      setPeta(tebakPemetaan(hasil.headerKolom))
      setLangkah('petakan')
    } catch (err) {
      setErrorFile(err)
    } finally {
      setMemuatFile(false)
      e.target.value = ''
    }
  }

  async function lanjutKePencocokan() {
    setMemuatCocok(true)
    setErrorFile(null)
    try {
      // 1. Cocokkan tiap produk unik dari file ke katalog kita.
      const hasil = new Map<string, HasilCocok | null>()
      for (const sumber of produkSumber) {
        let baris: { id: string; kode: string; nama: string }[] = []
        if (sumber.sku.trim()) {
          const { data } = await supabase.from('produk').select('id, kode, nama').eq('kode', sumber.sku.trim()).limit(1)
          baris = data ?? []
        }
        if (baris.length === 0 && sumber.namaProduk.trim()) {
          const { data } = await supabase
            .from('produk')
            .select('id, kode, nama')
            .ilike('nama', `%${sumber.namaProduk.trim()}%`)
            .limit(2)
          baris = data ?? []
        }
        if (baris.length === 1) {
          const p = baris[0]!
          const { data: satuan } = await supabase
            .from('produk_satuan')
            .select('satuan_id, konversi, satuan:satuan_id(kode)')
            .eq('produk_id', p.id)
            .order('urutan')
            .limit(1)
          const s = satuan?.[0] as unknown as { satuan_id: string; konversi: number; satuan: { kode: string } } | undefined
          hasil.set(sumber.kunci, s ? { produk_id: p.id, satuan_id: s.satuan_id, konversi: s.konversi, label: `${p.nama} (${p.kode})` } : null)
        } else {
          hasil.set(sumber.kunci, null)
        }
      }
      setPetaProduk(hasil)

      // 2. Cek nomor pesanan yang sudah pernah diimpor (dedup).
      const nomorSemua = pesanan.map((p) => p.nomorPesanan)
      const { data: dup } = await supabase
        .from('pesanan_marketplace_impor')
        .select('nomor_pesanan_platform')
        .eq('kanal', kanal)
        .in('nomor_pesanan_platform', nomorSemua)
      setSudahDiimpor(new Set((dup ?? []).map((d) => d.nomor_pesanan_platform)))

      setLangkah('cocokkan')
    } catch (err) {
      setErrorFile(err)
    } finally {
      setMemuatCocok(false)
    }
  }

  function pesananSiap(p: PesananDikelompokkan): boolean {
    if (sudahDiimpor.has(p.nomorPesanan)) return false
    return p.item.every((it) => petaProduk.get(kunciProduk(it.sku, it.namaProduk)))
  }

  function lanjutKePratinjau() {
    setDicentang(new Set(pesanan.filter((p) => pesananSiap(p) && statusAmanDiimpor(p.statusPesanan)).map((p) => p.nomorPesanan)))
    setLangkah('pratinjau')
  }

  function toggleCentang(nomor: string) {
    setDicentang((s) => {
      const n = new Set(s)
      if (n.has(nomor)) n.delete(nomor)
      else n.add(nomor)
      return n
    })
  }

  async function prosesImpor() {
    if (!gudangId) return
    setMemproses(true)
    setHasilProses(null)

    const { data: agregat } = await supabase
      .from('pelanggan')
      .select('id')
      .eq('kode', KANAL_IMPOR.find((k) => k.kunci === kanal)!.kodeAgregat)
      .single()

    if (!agregat) {
      setErrorFile(new Error('Akun agregat marketplace untuk kanal ini tidak ditemukan di master Pelanggan.'))
      setMemproses(false)
      return
    }

    let berhasil = 0
    const gagal: { nomor: string; pesan: string }[] = []
    const dipilih = pesanan.filter((p) => dicentang.has(p.nomorPesanan))

    for (const p of dipilih) {
      try {
        const items = p.item.map((it) => {
          const cocok = petaProduk.get(kunciProduk(it.sku, it.namaProduk))!
          return {
            produk_id: cocok.produk_id,
            satuan_id: cocok.satuan_id,
            konversi: cocok.konversi,
            qty: it.qty,
            harga_satuan: it.hargaSatuan,
          }
        })
        const { error } = await supabase.rpc('penjualan_cepat', {
          p_pelanggan_id: agregat.id,
          p_gudang_id: gudangId,
          p_items: items,
          p_tanggal: p.tanggal ?? undefined,
          p_kanal: kanal as KanalPenjualan,
          p_nama_penerima: p.namaPembeli || null,
          p_telepon_penerima: p.telepon || null,
          p_alamat_kirim: p.alamatKirim || null,
          p_catatan: `Impor ${KANAL_IMPOR.find((k) => k.kunci === kanal)!.label} -- ${namaFile}${p.ekspedisi ? ` -- ${p.ekspedisi}` : ''}`,
          p_nomor_pesanan_platform: p.nomorPesanan,
        })
        if (error) throw error
        berhasil++
      } catch (err) {
        gagal.push({ nomor: p.nomorPesanan, pesan: err instanceof Error ? err.message : String(err) })
      }
    }

    setHasilProses({ berhasil, dilewati: pesanan.length - dipilih.length, gagal })
    setMemproses(false)
    if (berhasil > 0) toast(`${berhasil} pesanan berhasil diimpor.`)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{tt('Impor Pesanan Marketplace')}</h1>
        <p className="text-sm text-muted-foreground">
          {tt('Unggah file export dari Shopee/TikTok Seller Centre -- ratusan pesanan langsung jadi Sales Order, Surat Jalan, dan Faktur, tanpa input satu-satu.')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. {tt('Sumber File')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Kanal</Label>
              <Select value={kanal} onChange={(e) => setKanal(e.target.value as typeof kanal)}>
                {KANAL_IMPOR.map((k) => (
                  <option key={k.kunci} value={k.kunci}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </div>
            {!gudangTunggal ? (
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
          </div>

          <div className="space-y-1.5">
            <Label>{tt('File export (.xlsx, .xls, .csv)')}</Label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-input px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-accent">
              <Upload className="h-4 w-4" />
              {namaFile || tt('Klik untuk pilih file...')}
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={pilihFile} />
            </label>
            {memuatFile ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Spinner className="h-3.5 w-3.5" /> {tt('Membaca file...')}
              </p>
            ) : null}
          </div>

          {errorFile ? <PesanError error={errorFile} /> : null}
        </CardContent>
      </Card>

      {langkah !== 'unggah' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              2. {tt('Cocokkan Kolom')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            <p className="text-xs text-muted-foreground">
              {tt('Ditebak otomatis dari nama kolom di file -- periksa dan ganti kalau ada yang salah/kosong.')}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {DAFTAR_BIDANG.map((b) => (
                <div key={b.bidang} className="space-y-1">
                  <Label className="text-xs">
                    {b.label}
                    {b.wajib ? <span className="text-destructive"> *</span> : null}
                  </Label>
                  <Select
                    value={peta[b.bidang] ?? ''}
                    onChange={(e) => setPeta((p) => ({ ...p, [b.bidang]: e.target.value || undefined }))}
                  >
                    <option value="">{b.wajib ? tt('-- pilih kolom --') : tt('-- tidak dipakai --')}</option>
                    {headerKolom.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {pesanan.length} {tt('pesanan')}, {barisMentah.length} {tt('baris item terbaca dari file.')}
            </p>
            <div className="flex justify-end">
              <Button onClick={lanjutKePencocokan} disabled={bidangBelumLengkap.length > 0 || memuatCocok || pesanan.length === 0}>
                {memuatCocok ? <Spinner /> : null}
                {tt('Cocokkan Produk')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {langkah === 'cocokkan' || langkah === 'pratinjau' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. {tt('Pencocokan Produk')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <Table>
              <Thead>
                <Tr>
                  <Th>{tt('Dari File')}</Th>
                  <Th className="text-right">Qty</Th>
                  <Th>{tt('Produk di Katalog')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {produkSumber.map((s) => {
                  const cocok = petaProduk.get(s.kunci)
                  return (
                    <Tr key={s.kunci}>
                      <Td>
                        <p className="font-medium">{s.namaProduk || '-'}</p>
                        {s.sku ? <p className="font-mono text-xs text-muted-foreground">{s.sku}</p> : null}
                      </Td>
                      <Td className="tabular text-right">{s.totalQty}</Td>
                      <Td>
                        <Combobox
                          value={cocok?.produk_id ?? null}
                          opsiTerpilih={cocok ? { value: cocok.produk_id, label: cocok.label } : null}
                          onChange={async (id, opsi) => {
                            const { data: satuan } = await supabase
                              .from('produk_satuan')
                              .select('satuan_id, konversi, satuan:satuan_id(kode)')
                              .eq('produk_id', id)
                              .order('urutan')
                              .limit(1)
                            const su = satuan?.[0] as unknown as { satuan_id: string; konversi: number } | undefined
                            setPetaProduk((m) => {
                              const baru = new Map(m)
                              baru.set(s.kunci, su ? { produk_id: id, satuan_id: su.satuan_id, konversi: su.konversi, label: opsi.label } : null)
                              return baru
                            })
                          }}
                          cariOpsi={async (q) => {
                            const { data } = await supabase.from('produk').select('id, kode, nama').eq('aktif', true).ilike('nama', `%${q}%`).limit(20)
                            return ((data ?? []) as { id: string; kode: string; nama: string }[]).map((p) => ({
                              value: p.id,
                              label: p.nama,
                              sublabel: p.kode,
                            })) as OpsiCombobox[]
                          }}
                          placeholder="Pilih produk..."
                        />
                        {!cocok ? (
                          <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                            <AlertTriangle className="h-3 w-3" /> {tt('Belum cocok -- pilih manual')}
                          </p>
                        ) : null}
                      </Td>
                    </Tr>
                  )
                })}
              </Tbody>
            </Table>
            <div className="flex justify-end p-3">
              <Button onClick={lanjutKePratinjau} disabled={produkSumber.some((s) => !petaProduk.get(s.kunci))}>
                {tt('Lanjut ke Pratinjau')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {langkah === 'pratinjau' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              4. {tt('Pratinjau & Proses')} ({dicentang.size}/{pesanan.length} {tt('dipilih')})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {tt('Otomatis tercentang kalau kolom "Status di File" mengandung kata:')}{' '}
              <span className="font-medium text-foreground">{KATA_STATUS_AMAN.join(', ')}</span>.{' '}
              {tt('Selain itu (mis. "Ready to Ship"/masih diproses/dikemas) sengaja TIDAK tercentang -- barangnya belum tentu keluar gudang. Centang manual kalau Anda yakin.')}
            </p>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            {pesanan.length === 0 ? (
              <KondisiKosong pesan="Tidak ada pesanan yang bisa diproses." />
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th className="w-8"></Th>
                    <Th>{tt('Nomor Pesanan')}</Th>
                    <Th>{tt('Tanggal')}</Th>
                    <Th>{tt('Pembeli')}</Th>
                    <Th className="text-right">Total</Th>
                    <Th>{tt('Status di File')}</Th>
                    <Th>{tt('Keterangan')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {pesanan.map((p) => {
                    const duplikat = sudahDiimpor.has(p.nomorPesanan)
                    const siap = pesananSiap(p)
                    const statusAman = statusAmanDiimpor(p.statusPesanan)
                    return (
                      <Tr key={p.nomorPesanan}>
                        <Td>
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer"
                            checked={dicentang.has(p.nomorPesanan)}
                            disabled={!siap}
                            onChange={() => toggleCentang(p.nomorPesanan)}
                          />
                        </Td>
                        <Td className="font-mono text-xs">{p.nomorPesanan}</Td>
                        <Td className="text-muted-foreground">{p.tanggal ? fmtTanggal(p.tanggal) : '-'}</Td>
                        <Td>{p.namaPembeli || '-'}</Td>
                        <Td className="tabular text-right">{rupiah(p.total)}</Td>
                        {/* Teks ASLI dari kolom Status Pesanan di file -- apa adanya, tidak
                            diterjemahkan/diganti, supaya tidak tertukar dengan label verdict
                            aplikasi di kolom sebelah (lihat catatan `KATA_STATUS_AMAN`). */}
                        <Td className="text-muted-foreground">{p.statusPesanan || '-'}</Td>
                        <Td>
                          {duplikat ? (
                            <Badge variant="netral">{tt('Sudah pernah diimpor')}</Badge>
                          ) : !siap ? (
                            <Badge variant="bahaya">{tt('Ada produk belum cocok')}</Badge>
                          ) : !statusAman ? (
                            <Badge variant="peringatan">{tt('Status tidak diizinkan')}</Badge>
                          ) : (
                            <Badge variant="sukses">{tt('Lolos cek')}</Badge>
                          )}
                        </Td>
                      </Tr>
                    )
                  })}
                </Tbody>
              </Table>
            )}

            {errorFile ? (
              <div className="p-3">
                <PesanError error={errorFile} />
              </div>
            ) : null}

            {hasilProses ? (
              <div className="m-3 space-y-1 rounded-lg border border-border p-3 text-sm">
                <p className="flex items-center gap-1.5 font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> {hasilProses.berhasil} {tt('pesanan berhasil diimpor')}
                </p>
                {hasilProses.gagal.length > 0 ? (
                  <div className="text-destructive">
                    <p className="font-medium">
                      {hasilProses.gagal.length} {tt('gagal')}:
                    </p>
                    <ul className="ml-4 list-disc">
                      {hasilProses.gagal.map((g) => (
                        <li key={g.nomor}>
                          {g.nomor}: {g.pesan}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 p-3">
              {hasilProses && hasilProses.berhasil > 0 ? (
                <Button variant="outline" onClick={() => navigate('/faktur-penjualan')}>
                  {tt('Lihat Daftar Faktur')}
                </Button>
              ) : null}
              <Button onClick={prosesImpor} disabled={memproses || dicentang.size === 0}>
                {memproses ? <Spinner /> : null}
                {tt('Impor')} {dicentang.size} {tt('Pesanan')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
