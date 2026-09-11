// Asisten Jawab Pelanggan -- Sales Agent Fase 2, Level 1 (MVP).
//
// Staf tempel pertanyaan pelanggan (dari WhatsApp/DM manapun), dapat draf
// jawaban dari Gemini berdasarkan katalog produk & riwayat pelanggan yang
// sebenarnya. Draf itu TIDAK dikirim otomatis -- staf yang salin & kirim
// sendiri (guardrail: belum ada auto-reply ke pelanggan).
//
// GEMINI_API_KEY wajib disetel sebagai secret (sama dengan riset-pasar).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = 'gemini-3.6-flash'

interface ProdukKonteks {
  kode: string
  nama: string
  qty: number
  perlu_restock: boolean
  harga: number | null
  sumberHarga: 'daftar_harga' | 'transaksi_terakhir' | null
}

interface KonteksPelanggan {
  nama: string
  segmen: string
  total_belanja: number
  jumlah_transaksi: number
  hari_sejak_order: number | null
  produk_favorit: string[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonError('Sesi tidak ditemukan. Login ulang lalu coba lagi.', 401)

    const { pertanyaan, pelangganId } = (await req.json().catch(() => ({}))) as { pertanyaan?: string; pelangganId?: string }
    if (!pertanyaan?.trim()) return jsonError('Isi pertanyaan pelanggan dulu.', 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiKey) {
      return jsonError('GEMINI_API_KEY belum disetel. Lihat halaman Riset Pasar untuk cara membuatnya.', 500)
    }

    // Sesi pemanggil sendiri -- RLS tetap berlaku (mis. kalau nanti peran
    // sales dibatasi lihat pelanggannya sendiri, itu otomatis ikut berlaku).
    const klien = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })

    const { data: bolehSales, error: errPeran } = await klien.rpc('boleh_sales')
    if (errPeran) return jsonError('Gagal memverifikasi peran pengguna: ' + errPeran.message, 500)
    if (!bolehSales) return jsonError('Hanya Owner/Admin/Sales yang boleh memakai asisten ini.', 403)

    const [katalog, konteksPelanggan] = await Promise.all([ambilKatalog(klien), pelangganId ? ambilKonteksPelanggan(klien, pelangganId) : null])

    const draf = await panggilGemini(geminiKey, pertanyaan.trim(), katalog, konteksPelanggan)

    return new Response(JSON.stringify({ ok: true, draf }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Terjadi kesalahan tak terduga.', 500)
  }
})

async function ambilKatalog(klien: ReturnType<typeof createClient>): Promise<ProdukKonteks[]> {
  const [{ data: stok }, { data: hargaDaftar }, { data: hargaTransaksi }] = await Promise.all([
    klien.from('v_stok_produk').select('produk_id, kode, nama, qty, perlu_restock').is('induk_id', null),
    klien
      .from('produk_harga')
      .select('produk_id, harga, min_qty, tier_harga:tier_harga_id!inner(jadi_default)')
      .eq('tier_harga.jadi_default', true)
      .eq('min_qty', 1)
      .or('berlaku_sampai.is.null,berlaku_sampai.gte.' + new Date().toISOString().slice(0, 10)),
    // Fallback kalau daftar harga baku belum diisi (mis. harga masih diketik manual
    // tiap transaksi) -- pakai rata-rata harga transaksi yang benar-benar terjadi,
    // diberi label jujur ke model supaya tidak dianggap harga resmi berlaku.
    klien.from('v_laba_produk').select('produk_id, qty_terjual, omzet').gt('qty_terjual', 0),
  ])

  const petaHargaDaftar = new Map<string, number>()
  for (const h of (hargaDaftar ?? []) as unknown as { produk_id: string; harga: number }[]) petaHargaDaftar.set(h.produk_id, h.harga)

  const petaHargaTransaksi = new Map<string, number>()
  for (const h of (hargaTransaksi ?? []) as unknown as { produk_id: string; qty_terjual: number; omzet: number }[]) {
    if (h.qty_terjual > 0) petaHargaTransaksi.set(h.produk_id, Math.round(h.omzet / h.qty_terjual))
  }

  return ((stok ?? []) as unknown as { produk_id: string; kode: string; nama: string; qty: number; perlu_restock: boolean }[]).map((p) => {
    const dariDaftar = petaHargaDaftar.get(p.produk_id)
    const dariTransaksi = petaHargaTransaksi.get(p.produk_id)
    return {
      kode: p.kode,
      nama: p.nama,
      qty: p.qty,
      perlu_restock: p.perlu_restock,
      harga: dariDaftar ?? dariTransaksi ?? null,
      sumberHarga: dariDaftar !== undefined ? 'daftar_harga' : dariTransaksi !== undefined ? 'transaksi_terakhir' : null,
    }
  })
}

async function ambilKonteksPelanggan(klien: ReturnType<typeof createClient>, pelangganId: string): Promise<KonteksPelanggan | null> {
  const [{ data: p }, { data: favorit }] = await Promise.all([
    klien
      .from('v_pelanggan_crm')
      .select('nama, segmen, total_belanja, jumlah_transaksi, hari_sejak_order')
      .eq('pelanggan_id', pelangganId)
      .maybeSingle(),
    klien.from('v_produk_favorit_pelanggan').select('nama_produk').eq('pelanggan_id', pelangganId).order('total_nilai', { ascending: false }).limit(5),
  ])
  if (!p) return null
  return {
    nama: p.nama as string,
    segmen: p.segmen as string,
    total_belanja: p.total_belanja as number,
    jumlah_transaksi: p.jumlah_transaksi as number,
    hari_sejak_order: p.hari_sejak_order as number | null,
    produk_favorit: ((favorit ?? []) as unknown as { nama_produk: string }[]).map((f) => f.nama_produk),
  }
}

async function panggilGemini(apiKey: string, pertanyaan: string, katalog: ProdukKonteks[], pelanggan: KonteksPelanggan | null): Promise<string> {
  const daftarKatalog = katalog
    .map((p) => {
      const labelHarga =
        p.harga === null
          ? 'harga belum ada data'
          : p.sumberHarga === 'daftar_harga'
            ? `harga resmi Rp${p.harga}`
            : `~Rp${p.harga} (rata-rata transaksi terakhir, BUKAN harga resmi tetap)`
      return `- ${p.nama}: stok ${p.qty}${p.perlu_restock ? ' (RENDAH)' : ''}, ${labelHarga}`
    })
    .join('\n')

  const infoPelanggan = pelanggan
    ? `\nInfo pelanggan yang bertanya:\n- Nama: ${pelanggan.nama}\n- Segmen: ${pelanggan.segmen}\n- Total belanja sebelumnya: Rp${pelanggan.total_belanja} dari ${pelanggan.jumlah_transaksi} transaksi\n- Terakhir order: ${pelanggan.hari_sejak_order !== null ? `${pelanggan.hari_sejak_order} hari lalu` : 'belum pernah order'}\n- Produk favorit: ${pelanggan.produk_favorit.join(', ') || 'belum ada'}\n`
    : '\nPelanggan ini belum diketahui identitasnya (lead baru atau belum dipilih di form).\n'

  const prompt = `Kamu adalah asisten sales untuk staf toko Ayyubi Food (dagang/distribusi produk herbal & makanan). Staf memberimu pertanyaan dari pelanggan lewat WhatsApp/DM. Tugasmu MENYUSUN DRAF JAWABAN untuk staf kirim -- bukan jawaban final yang langsung terkirim ke pelanggan.

Katalog produk saat ini (nama, stok, harga eceran satuan terkecil):
${daftarKatalog || 'Belum ada produk aktif.'}
${infoPelanggan}
Pertanyaan pelanggan: "${pertanyaan}"

Instruksi:
1. Jawab HANYA berdasarkan katalog di atas -- kalau produk/harga yang ditanya tidak ada di daftar, katakan tidak tersedia, jangan mengarang nama produk atau angka.
2. Kalau stok kosong atau rendah, sebutkan terus terang, jangan janjikan ketersediaan. Kalau harganya ditandai "rata-rata transaksi terakhir" (bukan harga resmi), sebutkan sebagai kisaran dan sarankan staf konfirmasi dulu sebelum menyepakati -- jangan tulis seolah itu harga pasti.
3. Kalau ada info pelanggan, sesuaikan nada (sapa dengan nama, singgung produk favoritnya kalau relevan) -- tetap singkat, bukan basa-basi panjang.
4. Kalau pertanyaannya di luar cakupan ini (komplain, negosiasi harga besar, retur, permintaan khusus), JANGAN coba jawab sendiri -- tulis saran singkat untuk staf supaya eskalasi ke manusia, jelaskan kenapa.
5. Tulis draf jawaban siap kirim ke pelanggan: gaya WhatsApp, ramah, singkat, Bahasa Indonesia. Jangan tambahkan penjelasan meta ke staf di luar draf itu sendiri, kecuali untuk kasus poin 4.`

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  })

  if (!res.ok) {
    const teks = await res.text()
    throw new Error(`Gemini API gagal (${res.status}): ${teks.slice(0, 300)}`)
  }

  const hasil = await res.json()
  const bagian = hasil?.candidates?.[0]?.content?.parts ?? []
  const teksGabungan = bagian.map((b: { text?: string }) => b.text ?? '').join('\n')
  if (!teksGabungan.trim()) throw new Error('Gemini tidak mengembalikan teks. Coba lagi sesaat lagi.')
  return teksGabungan
}

function jsonError(pesan: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: pesan }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
