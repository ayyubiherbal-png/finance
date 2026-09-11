import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAkunKasBankAktif } from '@/lib/queries'
import { rupiah, tanggal, tanggalISO } from '@/lib/format'
import { toast } from '@/components/Toast'
import { useKonfirmasi } from '@/components/Konfirmasi'
import { Badge, Button, Card, CardContent, Input, InputAngka, KondisiKosong, Label, Paginasi, PesanError, Select, Spinner, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import type { KanalPenjualan } from '@/types/db'
import { tt } from '@/lib/i18nText'
import { ambilSemuaBertahap } from '@/lib/ambilSemua'

const UKURAN_HALAMAN = 50
type KanalSettlement = Extract<KanalPenjualan, 'shopee' | 'tiktok' | 'tokopedia' | 'lainnya'>

interface SettlementRow {
  id: string; kanal: KanalSettlement; nomor_settlement_platform: string; tanggal: string
  bruto: number; fee_platform: number; voucher_toko: number; ongkir_dipotong: number; refund: number
  netto: number; status: string; akun: { nama: string } | null
}
interface PesananRow {
  id: string; kanal: KanalSettlement; nomor_pesanan_platform: string
  faktur: { id: string; total: number; terbayar: number; nomor: string; status: string } | null
}

export function SettlementMarketplace() {
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const konfirmasi = useKonfirmasi()
  const { data: akun } = useAkunKasBankAktif()
  const [halaman, setHalaman] = useState(1)
  const [cariDaftar, setCariDaftar] = useState('')
  const [filterKanal, setFilterKanal] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [bukaForm, setBukaForm] = useState(searchParams.get('baru') === '1')
  const [kanal, setKanal] = useState<KanalSettlement>('shopee')
  const [nomor, setNomor] = useState('')
  const [tanggalNilai, setTanggalNilai] = useState(tanggalISO())
  const [akunId, setAkunId] = useState('')
  const [fee, setFee] = useState(0)
  const [voucher, setVoucher] = useState(0)
  const [ongkir, setOngkir] = useState(0)
  const [refund, setRefund] = useState(0)
  const [pilihan, setPilihan] = useState<Set<string>>(new Set())
  const [cariPesanan, setCariPesanan] = useState('')
  const [menyimpan, setMenyimpan] = useState(false)
  const [errorAksi, setErrorAksi] = useState<unknown>(null)

  const daftar = useQuery({
    queryKey: ['settlement-marketplace', halaman, cariDaftar, filterKanal, filterStatus],
    queryFn: async () => {
      const mulai = (halaman - 1) * UKURAN_HALAMAN
      let q = supabase.from('settlement_marketplace')
        .select('id, kanal, nomor_settlement_platform, tanggal, bruto, fee_platform, voucher_toko, ongkir_dipotong, refund, netto, status, akun:akun_id(nama)', { count: 'exact' })
      if (cariDaftar.trim()) q = q.ilike('nomor_settlement_platform', `%${cariDaftar.trim()}%`)
      if (filterKanal) q = q.eq('kanal', filterKanal)
      if (filterStatus) q = q.eq('status', filterStatus)
      const { data, count, error } = await q.order('tanggal', { ascending: false }).range(mulai, mulai + UKURAN_HALAMAN - 1)
      if (error) throw error
      return { baris: (data ?? []) as unknown as SettlementRow[], total: count ?? 0 }
    },
  })

  useEffect(() => setHalaman(1), [cariDaftar, filterKanal, filterStatus])

  const pesanan = useQuery({
    queryKey: ['pesanan-belum-settlement', kanal],
    enabled: bukaForm,
    queryFn: async () => {
      const [daftarPesanan, itemSettlement] = await Promise.all([
        ambilSemuaBertahap<PesananRow>((dari, sampai) => supabase.from('pesanan_marketplace_impor')
          .select('id, kanal, nomor_pesanan_platform, faktur:faktur_id(id, nomor, total, terbayar, status)')
          .eq('kanal', kanal).order('diimpor_pada', { ascending: false }).range(dari, sampai) as unknown as PromiseLike<{ data: PesananRow[] | null; error: unknown }>),
        ambilSemuaBertahap<{ pesanan_id: string }>((dari, sampai) => supabase
          .from('settlement_marketplace_item').select('pesanan_id').range(dari, sampai)),
      ])
      const sudahSettlement = new Set(itemSettlement.map((x) => x.pesanan_id))
      return daftarPesanan.filter((x) => x.faktur && !sudahSettlement.has(x.id) && x.faktur.total > x.faktur.terbayar && x.faktur.status !== 'dibatalkan')
    },
  })

  const pesananTersaring = useMemo(() => {
    const pola = cariPesanan.trim().toLowerCase()
    return (pesanan.data ?? []).filter((x) => !pola || x.nomor_pesanan_platform.toLowerCase().includes(pola) || x.faktur?.nomor.toLowerCase().includes(pola))
  }, [pesanan.data, cariPesanan])
  const pesananDipilih = useMemo(() => (pesanan.data ?? []).filter((x) => pilihan.has(x.id)), [pesanan.data, pilihan])
  const bruto = pesananDipilih.reduce((n, x) => n + Math.max(0, (x.faktur?.total ?? 0) - (x.faktur?.terbayar ?? 0)), 0)
  const potongan = fee + voucher + ongkir + refund
  const netto = bruto - potongan

  async function posting() {
    setErrorAksi(null)
    if (!nomor.trim() || !akunId || pesananDipilih.length === 0) return setErrorAksi(new Error('Isi nomor settlement, akun bank, dan pilih minimal satu pesanan.'))
    if (netto < 0) return setErrorAksi(new Error('Total potongan tidak boleh melebihi omzet bruto.'))
    setMenyimpan(true)
    try {
      const items = pesananDipilih.map((x) => ({ pesanan_id: x.id, bruto: (x.faktur?.total ?? 0) - (x.faktur?.terbayar ?? 0) }))
      const { error } = await supabase.rpc('posting_settlement_marketplace', {
        p_kanal: kanal, p_nomor: nomor.trim(), p_tanggal: tanggalNilai, p_akun_id: akunId,
        p_fee: fee, p_voucher: voucher, p_ongkir: ongkir, p_refund: refund, p_items: items, p_catatan: null,
      })
      if (error) throw error
      toast('Settlement berhasil direkonsiliasi.')
      setBukaForm(false); setNomor(''); setPilihan(new Set()); setFee(0); setVoucher(0); setOngkir(0); setRefund(0)
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['settlement-marketplace'] }), queryClient.invalidateQueries({ queryKey: ['pesanan-belum-settlement'] }), queryClient.invalidateQueries({ queryKey: ['penerimaan-kas'] }), queryClient.invalidateQueries({ queryKey: ['pengeluaran-kas'] })])
    } catch (e) { setErrorAksi(e) } finally { setMenyimpan(false) }
  }

  async function batalkan(id: string) {
    if (!(await konfirmasi('Batalkan settlement ini? Penerimaan bruto dan seluruh potongannya akan dibalik.', { berbahaya: true }))) return
    const { error } = await supabase.rpc('batalkan_settlement_marketplace', { p_id: id })
    if (error) setErrorAksi(error)
    else { toast('Settlement dibatalkan.'); queryClient.invalidateQueries({ queryKey: ['settlement-marketplace'] }) }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold tracking-tight">{tt('Settlement Marketplace')}</h1><p className="text-sm text-muted-foreground">{tt('Cocokkan omzet bruto, potongan platform, dan dana bersih yang masuk.')}</p></div>
      <Button variant="pill" onClick={() => { setBukaForm((x) => !x); if (!akunId && akun?.length === 1) setAkunId(akun[0]!.id) }}><Plus className="h-4 w-4" /> Settlement Baru</Button></div>
    {bukaForm ? <Card><CardContent className="space-y-4 p-4">
      <div className="grid gap-3 md:grid-cols-4"><div><Label>Kanal</Label><Select value={kanal} onChange={(e) => { setKanal(e.target.value as KanalSettlement); setPilihan(new Set()) }}><option value="shopee">Shopee</option><option value="tiktok">TikTok Shop</option><option value="tokopedia">Tokopedia</option><option value="lainnya">Lainnya</option></Select></div>
        <div><Label>Nomor settlement</Label><Input value={nomor} onChange={(e) => setNomor(e.target.value)} placeholder="Nomor pencairan platform" /></div>
        <div><Label>Tanggal cair</Label><Input type="date" value={tanggalNilai} onChange={(e) => setTanggalNilai(e.target.value)} /></div>
        <div><Label>Masuk ke akun</Label><Select value={akunId} onChange={(e) => setAkunId(e.target.value)}><option value="">Pilih akun...</option>{(akun ?? []).map((x) => <option key={x.id} value={x.id}>{x.nama}</option>)}</Select></div></div>
      <div><div className="flex flex-wrap items-end justify-between gap-2"><Label>Pesanan dalam pencairan</Label><div className="relative w-full sm:w-64"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-8" placeholder="Cari nomor pesanan atau faktur..." value={cariPesanan} onChange={(e) => setCariPesanan(e.target.value)} /></div></div>{pesanan.isLoading ? <Spinner /> : !pesanan.data?.length ? <p className="mt-2 text-sm text-muted-foreground">{tt('Tidak ada pesanan')} {kanal} {tt('yang masih menunggu settlement.')}</p> : <div className="mt-2 max-h-64 overflow-auto rounded-xl border"><Table><Thead><Tr><Th className="w-10"><input type="checkbox" className="h-4 w-4 accent-primary" aria-label="Pilih semua hasil pencarian" checked={pesananTersaring.length > 0 && pesananTersaring.every((x) => pilihan.has(x.id))} onChange={(e) => setPilihan((lama) => { const baru = new Set(lama); for (const x of pesananTersaring) e.target.checked ? baru.add(x.id) : baru.delete(x.id); return baru })} /></Th><Th>Pesanan</Th><Th>Faktur</Th><Th className="text-right">Sisa bruto</Th></Tr></Thead><Tbody>{pesananTersaring.map((x) => <Tr key={x.id}><Td><input type="checkbox" className="h-4 w-4 accent-primary" checked={pilihan.has(x.id)} onChange={(e) => setPilihan((lama) => { const baru = new Set(lama); e.target.checked ? baru.add(x.id) : baru.delete(x.id); return baru })} /></Td><Td>{x.nomor_pesanan_platform}</Td><Td>{x.faktur?.nomor}</Td><Td className="text-right tabular">{rupiah((x.faktur?.total ?? 0) - (x.faktur?.terbayar ?? 0))}</Td></Tr>)}</Tbody></Table></div>}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><Label>Fee platform</Label><InputAngka value={fee} onChange={setFee} /></div><div><Label>Voucher toko</Label><InputAngka value={voucher} onChange={setVoucher} /></div><div><Label>Ongkir dipotong</Label><InputAngka value={ongkir} onChange={setOngkir} /></div><div><Label>Refund</Label><InputAngka value={refund} onChange={setRefund} /></div></div>
      <div className="grid gap-2 rounded-xl bg-muted p-3 sm:grid-cols-3"><div><span className="text-xs text-muted-foreground">{tt('Omzet bruto')}</span><p className="font-semibold tabular">{rupiah(bruto)}</p></div><div><span className="text-xs text-muted-foreground">{tt('Total potongan')}</span><p className="font-semibold tabular text-destructive">{rupiah(potongan)}</p></div><div><span className="text-xs text-muted-foreground">{tt('Dana diterima')}</span><p className="text-lg font-bold tabular text-success">{rupiah(netto)}</p></div></div>
      {errorAksi ? <PesanError error={errorAksi} /> : null}<div className="flex justify-end"><Button onClick={posting} disabled={menyimpan}>{menyimpan ? <Spinner /> : <CheckCircle2 className="h-4 w-4" />} Rekonsiliasi & Posting</Button></div>
    </CardContent></Card> : null}
    {errorAksi && !bukaForm ? <PesanError error={errorAksi} /> : null}
    <div className="flex flex-wrap gap-2"><div className="relative min-w-[15rem] flex-1 sm:max-w-xs"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-8" placeholder="Cari nomor settlement..." value={cariDaftar} onChange={(e) => setCariDaftar(e.target.value)} /></div><Select className="w-full sm:w-44" value={filterKanal} onChange={(e) => setFilterKanal(e.target.value)}><option value="">Semua kanal</option><option value="shopee">Shopee</option><option value="tiktok">TikTok Shop</option><option value="tokopedia">Tokopedia</option><option value="lainnya">Lainnya</option></Select><Select className="w-full sm:w-44" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}><option value="">Semua status</option><option value="selesai">Selesai</option><option value="dibatalkan">Dibatalkan</option></Select></div>
    <Card>{daftar.isLoading ? <div className="flex justify-center py-16"><Spinner /></div> : !daftar.data?.baris.length ? <KondisiKosong pesan="Belum ada settlement. Catat pencairan Shopee, TikTok, atau marketplace lain di sini." /> : <Table><Thead><Tr><Th>Tanggal</Th><Th>Kanal</Th><Th>Nomor settlement</Th><Th className="text-right">Bruto</Th><Th className="text-right">Potongan</Th><Th className="text-right">Dana diterima</Th><Th>Akun</Th><Th>Status</Th><Th></Th></Tr></Thead><Tbody>{daftar.data.baris.map((x) => <Tr key={x.id}><Td>{tanggal(x.tanggal)}</Td><Td className="capitalize">{x.kanal}</Td><Td>{x.nomor_settlement_platform}</Td><Td className="text-right tabular">{rupiah(x.bruto)}</Td><Td className="text-right tabular">{rupiah(x.fee_platform + x.voucher_toko + x.ongkir_dipotong + x.refund)}</Td><Td className="text-right font-semibold tabular">{rupiah(x.netto)}</Td><Td>{x.akun?.nama ?? '-'}</Td><Td><Badge variant={x.status === 'dibatalkan' ? 'bahaya' : 'sukses'}>{x.status === 'dibatalkan' ? 'Dibatalkan' : 'Selesai'}</Badge></Td><Td>{x.status !== 'dibatalkan' ? <Button size="sm" variant="ghost" onClick={() => batalkan(x.id)}>Batalkan</Button> : null}</Td></Tr>)}</Tbody></Table>}</Card>
    <Paginasi halaman={halaman} ukuranHalaman={UKURAN_HALAMAN} total={daftar.data?.total ?? 0} onUbah={setHalaman} />
  </div>
}
