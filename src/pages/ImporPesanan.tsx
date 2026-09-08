import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { tt } from '@/lib/i18nText'
import { useGudangAktif, useAkunKasBankAktif } from '@/lib/queries'
import { rupiah, tanggal as fmtTanggal, pesanKesalahan, terlihatSepertiNama } from '@/lib/format'
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
  statusSudahFinal,
  tebakPemetaan,
  variantStatusPlatform,
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

/**
 * Pesan error khusus pemrosesan impor -- kalau constraint dedup kena
 * (unique_violation, kode Postgres 23505), tampilkan kalimat yang jelas
 * dan bisa dimengerti user awam, bukan teks mentah Postgres seperti
 * "duplicate key value violates unique constraint
 * pesanan_marketplace_impor_kanal_nomor_pesanan_platform_key" yang
 * pernah bikin user bingung ("ini artinya apa?"). Ini SEHARUSNYA jarang
 * kejadian -- pengecekan dedup di `lanjutKePencocokan` sudah menandai
 * "Sudah pernah diimpor" duluan di layar pratinjau -- tapi tetap dijaga
 * di sini untuk kasus tepi (race condition, dua tab dibuka bersamaan).
 */
function pesanKesalahanImpor(err: unknown): string {
  const kode = err && typeof err === 'object' && 'code' in err ? (err as { code?: unknown }).code : undefined
  if (kode === '23505') return 'Nomor pesanan ini sudah pernah diimpor sebelumnya -- dilewati supaya tidak tercatat dobel.'
  return pesanKesalahan(err)
}

export function ImporPesanan() {
  const navigate = useNavigate()
  const { data: gudangAktif } = useGudangAktif()
  const { data: akunKas } = useAkunKasBankAktif()

  const [kanal, setKanal] = useState<(typeof KANAL_IMPOR)[number]['kunci']>('shopee')
  const [gudangId, setGudangId] = useState<string | null>(null)
  const [akunId, setAkunId] = useState<string | null>(null)

  const [namaFile, setNamaFile] = useState('')
  const [headerKolom, setHeaderKolom] = useState<string[]>([])
  const [barisMentah, setBarisMentah] = useState<BarisMentah[]>([])
  const [peta, setPeta] = useState<PemetaanKolom>({})
  const [memuatFile, setMemuatFile] = useState(false)
  const [errorFile, setErrorFile] = useState<unknown>(null)

  const [langkah, setLangkah] = useState<'unggah' | 'petakan' | 'cocokkan' | 'pratinjau'>('unggah')

  const [petaProduk, setPetaProduk] = useState<Map<string, HasilCocok | null>>(new Map())
  // nomor pesanan -> status_platform yang TERSIMPAN di database (dari
  // impor sebelumnya). Bukan cuma Set -- perlu tahu status LAMA-nya
  // untuk dibandingkan dengan status di file yang baru diunggah (lihat
  // `pesananStatusBerubah`).
  const [sudahDiimpor, setSudahDiimpor] = useState<Map<string, string | null>>(new Map())
  const [memuatCocok, setMemuatCocok] = useState(false)

  const [dicentang, setDicentang] = useState<Set<string>>(new Set())
  const [memproses, setMemproses] = useState(false)
  const [hasilProses, setHasilProses] = useState<{ berhasil: number; dilewati: number; gagal: { nomor: string; pesan: string }[] } | null>(null)

  // Pesanan yang SUDAH pernah diimpor tapi statusnya di file BERUBAH
  // dari yang tersimpan (mis. "Dikirim" -> "Selesai"). User: "kalau
  // misalkan ada orderan yang statusnya berubah, apakah akan terupdate
  // otomatis?" -- sebelumnya TIDAK, cuma ditolak dobel tanpa memperbarui
  // apa pun. Ini alur TERPISAH dari impor pesanan baru di atas -- tidak
  // membuat SO/Surat Jalan/Faktur baru, cuma memperbarui status (dan
  // menandai Lunas kalau statusnya jadi final) lewat
  // `perbarui_status_impor_marketplace` (lihat 0023).
  const [dicentangUpdate, setDicentangUpdate] = useState<Set<string>>(new Set())
  const [memprosesUpdate, setMemprosesUpdate] = useState(false)
  const [hasilUpdate, setHasilUpdate] = useState<{ berhasil: number; gagal: { nomor: string; pesan: string }[] } | null>(null)

  const gudangTunggal = (gudangAktif?.length ?? 0) <= 1
  if (gudangTunggal && !gudangId && gudangAktif?.[0]) setGudangId(gudangAktif[0].id)

  const akunTunggal = (akunKas?.length ?? 0) <= 1
  if (akunTunggal && !akunId && akunKas?.[0]) setAkunId(akunKas[0].id)

  const bidangBelumLengkap = DAFTAR_BIDANG.filter((b) => b.wajib && !peta[b.bidang])

  const pesanan = useMemo(() => kelompokkanPesanan(barisMentah, peta), [barisMentah, peta])

  // Peringatan dini: kolom yang dipetakan ke "Nama Pembeli/Penerima"
  // ternyata isinya angka polos, bukan nama/username. Kejadian nyata:
  // satu batch impor lama salah kena kolom berat/ongkir, hasilnya nama
  // pembeli di Faktur/Surat Jalan jadi "100"/"1400" dst. Dicek di sini
  // (bukan cuma diam-diam disaring saat ditampilkan nanti) supaya user
  // langsung tahu SAAT memetakan, bisa ganti pilihan kolomnya.
  const namaPembeliTerlihatAngka = useMemo(() => {
    if (!peta.nama_pembeli) return false
    const terisi = pesanan.filter((p) => p.namaPembeli.trim())
    if (terisi.length === 0) return false
    return terisi.filter((p) => !terlihatSepertiNama(p.namaPembeli)).length / terisi.length > 0.7
  }, [pesanan, peta.nama_pembeli])

  // Dari pesanan yang DICENTANG saja -- kalau tidak ada satu pun yang
  // statusnya "Selesai"/"Completed", tidak perlu tanya akun tujuan sama
  // sekali (semuanya tetap jadi piutang seperti biasa).
  const jumlahAkanLunas = useMemo(
    () => pesanan.filter((p) => dicentang.has(p.nomorPesanan) && statusSudahFinal(p.statusPesanan)).length,
    [pesanan, dicentang],
  )

  // Pesanan yang sudah pernah diimpor SEBELUMNYA (ada di `sudahDiimpor`)
  // tapi status di file yang baru diunggah ini BERBEDA dari status yang
  // tersimpan -- kandidat untuk diPERBARUI (bukan diimpor ulang).
  const pesananStatusBerubah = useMemo(
    () =>
      pesanan.filter((p) => {
        if (!sudahDiimpor.has(p.nomorPesanan)) return false
        const lama = (sudahDiimpor.get(p.nomorPesanan) ?? '').trim()
        const baru = p.statusPesanan.trim()
        return baru !== '' && lama !== baru
      }),
    [pesanan, sudahDiimpor],
  )

  const jumlahAkanLunasUpdate = useMemo(
    () => pesananStatusBerubah.filter((p) => dicentangUpdate.has(p.nomorPesanan) && statusSudahFinal(p.statusPesanan)).length,
    [pesananStatusBerubah, dicentangUpdate],
  )

  const nomorStatusBerubah = useMemo(() => new Set(pesananStatusBerubah.map((p) => p.nomorPesanan)), [pesananStatusBerubah])

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

      // 2. Cek nomor pesanan yang sudah pernah diimpor (dedup). Dipecah
      //    per 200 nomor -- batch bisa berisi ratusan-ribuan pesanan
      //    sekaligus, dan `.in()` dengan SATU query besar untuk semuanya
      //    pernah gagal diam-diam untuk batch besar (error-nya tidak
      //    dicek dulu, jadi `sudahDiimpor` ikut kosong seolah tidak ada
      //    duplikat -- SEMUA baris kelihatan "siap", padahal beberapa
      //    sudah pernah diimpor). Constraint unique di database tetap
      //    menolaknya di langkah akhir (jadi tidak sampai dobel tercatat),
      //    tapi baru ketahuan sebagai error mentah setelah diproses,
      //    bukan ditandai "Sudah pernah diimpor" di layar pratinjau
      //    seperti seharusnya. Sekarang errornya DICEK dan query dipecah
      //    supaya lebih tahan untuk batch besar.
      const nomorSemua = pesanan.map((p) => p.nomorPesanan)
      const sudahDiimporBaru = new Map<string, string | null>()
      for (let i = 0; i < nomorSemua.length; i += 200) {
        const potongan = nomorSemua.slice(i, i + 200)
        const { data: dup, error: errDup } = await supabase
          .from('pesanan_marketplace_impor')
          .select('nomor_pesanan_platform, status_platform')
          .eq('kanal', kanal)
          .in('nomor_pesanan_platform', potongan)
        if (errDup) throw errDup
        for (const d of dup ?? []) sudahDiimporBaru.set(d.nomor_pesanan_platform, d.status_platform)
      }
      setSudahDiimpor(sudahDiimporBaru)

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
    setDicentangUpdate(new Set(pesananStatusBerubah.map((p) => p.nomorPesanan)))
    setHasilUpdate(null)
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

  function toggleCentangUpdate(nomor: string) {
    setDicentangUpdate((s) => {
      const n = new Set(s)
      if (n.has(nomor)) n.delete(nomor)
      else n.add(nomor)
      return n
    })
  }

  async function prosesImpor() {
    if (!gudangId) return
    if (jumlahAkanLunas > 0 && !akunId) {
      setErrorFile(new Error('Ada pesanan berstatus Selesai/Completed yang akan ditandai Lunas -- pilih akun kas/bank tujuannya dulu.'))
      return
    }
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
        // Cuma status FINAL ("Selesai"/"Completed") yang ditandai Lunas --
        // "Dikirim"/"Shipped" cs. boleh diimpor (barang sudah keluar
        // gudang) tapi masih dalam masa retur, jadi tetap jadi piutang.
        const sudahFinal = statusSudahFinal(p.statusPesanan)
        const { error } = await supabase.rpc('penjualan_cepat', {
          p_pelanggan_id: agregat.id,
          p_gudang_id: gudangId,
          p_items: items,
          p_tanggal: p.tanggal ?? undefined,
          p_kanal: kanal as KanalPenjualan,
          p_akun_id: sudahFinal ? akunId : null,
          p_metode: 'transfer',
          p_nama_penerima: p.namaPembeli || null,
          p_telepon_penerima: p.telepon || null,
          p_alamat_kirim: p.alamatKirim || null,
          p_catatan: `Impor ${KANAL_IMPOR.find((k) => k.kunci === kanal)!.label} -- ${namaFile}${p.ekspedisi ? ` -- ${p.ekspedisi}` : ''}`,
          p_nomor_pesanan_platform: p.nomorPesanan,
          p_status_platform: p.statusPesanan || null,
        })
        if (error) throw error
        berhasil++
      } catch (err) {
        gagal.push({ nomor: p.nomorPesanan, pesan: pesanKesalahanImpor(err) })
      }
    }

    setHasilProses({ berhasil, dilewati: pesanan.length - dipilih.length, gagal })
    setMemproses(false)
    if (berhasil > 0) toast(tt('{n} pesanan berhasil diimpor.').replace('{n}', String(berhasil)))
  }

  /**
   * Memperbarui status pesanan yang SUDAH pernah diimpor -- BUKAN
   * membuat SO/Surat Jalan/Faktur baru (itu cuma boleh sekali). Cuma
   * memperbarui `status_platform` yang tersimpan, dan kalau status
   * barunya "Selesai"/"Completed", menandai faktur terkait Lunas
   * (lewat `perbarui_status_impor_marketplace`, 0023) -- sama seperti
   * yang terjadi otomatis kalau pesanan itu BARU pertama kali diimpor
   * dengan status yang sama.
   */
  async function perbaruiStatus() {
    if (jumlahAkanLunasUpdate > 0 && !akunId) {
      setErrorFile(new Error('Ada pesanan yang statusnya berubah jadi Selesai/Completed dan akan ditandai Lunas -- pilih akun kas/bank tujuannya dulu.'))
      return
    }
    setMemprosesUpdate(true)
    setHasilUpdate(null)

    let berhasil = 0
    const gagal: { nomor: string; pesan: string }[] = []
    const dipilih = pesananStatusBerubah.filter((p) => dicentangUpdate.has(p.nomorPesanan))

    for (const p of dipilih) {
      try {
        const sudahFinal = statusSudahFinal(p.statusPesanan)
        const { error } = await supabase.rpc('perbarui_status_impor_marketplace', {
          p_kanal: kanal as KanalPenjualan,
          p_nomor_pesanan_platform: p.nomorPesanan,
          p_status_baru: p.statusPesanan || null,
          p_akun_id: sudahFinal ? akunId : null,
          p_metode: 'transfer',
        })
        if (error) throw error
        berhasil++
      } catch (err) {
        gagal.push({ nomor: p.nomorPesanan, pesan: pesanKesalahan(err) })
      }
    }

    setHasilUpdate({ berhasil, gagal })
    setMemprosesUpdate(false)
    if (berhasil > 0) toast(tt('{n} status pesanan berhasil diperbarui.').replace('{n}', String(berhasil)))
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
                <div key={b.bidang} className="contents">
                  {b.bidang === 'alamat_detail' ? (
                    <p className="col-span-full -mb-1 mt-1 text-xs font-medium text-muted-foreground">
                      {tt('Alamat -- isi kolom "Alamat Lengkap" SAJA kalau file sudah satu kolom utuh, ATAU isi bagian-bagian di bawah ini kalau file memisahnya (mis. export TikTok Shop). Kosong yang tidak dipakai tidak apa-apa.')}
                    </p>
                  ) : null}
                  <div className="space-y-1">
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
                    {b.bidang === 'nama_pembeli' && namaPembeliTerlihatAngka ? (
                      <p className="flex items-center gap-1 text-xs text-amber-600">
                        <AlertTriangle className="h-3 w-3" />
                        {tt('Kolom ini kebanyakan berisi angka, bukan nama/username -- kemungkinan salah pilih kolom.')}
                      </p>
                    ) : null}
                  </div>
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
              {tt('Status di kolom "Status" adalah status ASLI dari marketplace, apa adanya -- bukan istilah aplikasi ini. Otomatis tercentang kalau statusnya sama persis dengan:')}{' '}
              <span className="font-medium text-foreground">{KATA_STATUS_AMAN.join(', ')}</span>.{' '}
              {tt('Selain itu (mis. "Ready to Ship"/masih diproses/dikemas) sengaja TIDAK tercentang -- barangnya belum tentu keluar gudang. Centang manual kalau Anda yakin.')}
            </p>
            <p className="text-xs text-muted-foreground">
              {tt('Yang statusnya persis "Selesai"/"Completed" (sudah lewat masa retur) otomatis ditandai Lunas. Selain itu tetap jadi piutang, dilunaskan manual lewat Penerimaan Kas saat dana marketplace cair. Status ini ikut tersimpan dan bisa dilihat lagi nanti di Faktur-nya.')}
            </p>
          </CardHeader>
          {jumlahAkanLunas + jumlahAkanLunasUpdate > 0 ? (
            <CardContent className="flex flex-wrap items-end gap-3 border-b border-border pb-4 pt-0">
              <div className="space-y-1.5">
                <Label className="text-xs">{tt('Dana Selesai masuk ke akun')}</Label>
                <Select value={akunId ?? ''} onChange={(e) => setAkunId(e.target.value)} className="w-56">
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
              <p className="text-xs text-muted-foreground">
                {jumlahAkanLunas > 0
                  ? `${jumlahAkanLunas} ${tt('pesanan berstatus Selesai/Completed akan langsung ditandai Lunas ke akun ini.')}`
                  : null}
                {jumlahAkanLunas > 0 && jumlahAkanLunasUpdate > 0 ? ' ' : null}
                {jumlahAkanLunasUpdate > 0
                  ? `${jumlahAkanLunasUpdate} ${tt('pesanan yang statusnya diperbarui jadi Selesai/Completed juga akan ditandai Lunas ke akun ini.')}`
                  : null}
              </p>
            </CardContent>
          ) : null}
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
                    <Th>{tt('Status')}</Th>
                    <Th>{tt('Keterangan')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {pesanan.map((p) => {
                    const duplikat = sudahDiimpor.has(p.nomorPesanan)
                    const statusBerubah = nomorStatusBerubah.has(p.nomorPesanan)
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
                        {/* Badge menampilkan teks ASLI dari kolom Status Pesanan di file, apa
                            adanya -- bukan istilah/verdict buatan aplikasi. Warnanya saja yang
                            ditentukan aplikasi (lihat `variantStatusPlatform`), supaya user
                            selalu tahu status paketnya persis seperti di marketplace. */}
                        <Td>
                          {p.statusPesanan ? (
                            <Badge variant={variantStatusPlatform(p.statusPesanan)}>{p.statusPesanan}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </Td>
                        <Td className="text-xs text-muted-foreground">
                          {duplikat
                            ? statusBerubah
                              ? tt('Sudah pernah diimpor, statusnya berubah -- lihat bagian "Perbarui Status" di bawah')
                              : tt('Sudah pernah diimpor, dilewati')
                            : !siap
                              ? tt('Ada produk belum cocok, dilewati')
                              : !statusAman
                                ? tt('Status ini tidak diimpor otomatis -- centang manual kalau yakin')
                                : statusSudahFinal(p.statusPesanan)
                                  ? tt('Diimpor & langsung Lunas')
                                  : tt('Diimpor, jadi piutang')}
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

      {langkah === 'pratinjau' && pesananStatusBerubah.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {tt('Perbarui Status Pesanan yang Sudah Diimpor')} ({dicentangUpdate.size}/{pesananStatusBerubah.length} {tt('dipilih')})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {tt('Nomor-nomor ini SUDAH pernah diimpor sebelumnya, tapi statusnya di file ini berbeda dari yang tersimpan -- kemungkinan sudah berubah di marketplace (mis. "Dikirim" jadi "Selesai"). Ini TIDAK membuat Faktur baru, cuma memperbarui status yang tersimpan (dan menandai Lunas kalau status barunya jadi Selesai/Completed).')}
            </p>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <Table>
              <Thead>
                <Tr>
                  <Th className="w-8"></Th>
                  <Th>{tt('Nomor Pesanan')}</Th>
                  <Th>{tt('Status Tersimpan')}</Th>
                  <Th>{tt('Status Baru di File')}</Th>
                  <Th>{tt('Keterangan')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {pesananStatusBerubah.map((p) => {
                  const statusLama = sudahDiimpor.get(p.nomorPesanan) ?? ''
                  const jadiFinal = statusSudahFinal(p.statusPesanan)
                  return (
                    <Tr key={p.nomorPesanan}>
                      <Td>
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer"
                          checked={dicentangUpdate.has(p.nomorPesanan)}
                          onChange={() => toggleCentangUpdate(p.nomorPesanan)}
                        />
                      </Td>
                      <Td className="font-mono text-xs">{p.nomorPesanan}</Td>
                      <Td>{statusLama ? <Badge variant={variantStatusPlatform(statusLama)}>{statusLama}</Badge> : <span className="text-muted-foreground">-</span>}</Td>
                      <Td>
                        <Badge variant={variantStatusPlatform(p.statusPesanan)}>{p.statusPesanan}</Badge>
                      </Td>
                      <Td className="text-xs text-muted-foreground">{jadiFinal ? tt('Status diperbarui & ditandai Lunas') : tt('Status diperbarui, tetap piutang')}</Td>
                    </Tr>
                  )
                })}
              </Tbody>
            </Table>

            {hasilUpdate ? (
              <div className="m-3 space-y-1 rounded-lg border border-border p-3 text-sm">
                <p className="flex items-center gap-1.5 font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> {hasilUpdate.berhasil} {tt('status berhasil diperbarui')}
                </p>
                {hasilUpdate.gagal.length > 0 ? (
                  <div className="text-destructive">
                    <p className="font-medium">
                      {hasilUpdate.gagal.length} {tt('gagal')}:
                    </p>
                    <ul className="ml-4 list-disc">
                      {hasilUpdate.gagal.map((g) => (
                        <li key={g.nomor}>
                          {g.nomor}: {g.pesan}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex justify-end p-3">
              <Button onClick={perbaruiStatus} disabled={memprosesUpdate || dicentangUpdate.size === 0}>
                {memprosesUpdate ? <Spinner /> : null}
                {tt('Perbarui')} {dicentangUpdate.size} {tt('Status')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
