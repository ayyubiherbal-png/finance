// Baca Pesanan dari Chat -- Closing Agent Fase 2, Level 1 (MVP).
//
// Dipakai dari halaman Penjualan Cepat: staf tempel teks chat pesanan
// pelanggan, fungsi ini MENCOCOKKAN teks itu ke katalog produk asli (tidak
// pernah mengarang produk/kode yang tidak ada) dan mengembalikan baris
// {produk, satuan, qty} siap isi ke form. Harga TIDAK ditentukan di sini --
// frontend yang menghitungnya lewat aturan harga (`harga_produk()`) yang
// sudah ada, persis seperti kalau staf menambah baris manual.
//
// Transaksi TIDAK dibuat di sini sama sekali -- staf tetap yang menekan
// "Proses Penjualan" di form setelah meninjau/mengedit hasilnya.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = 'gemini-3.6-flash'

interface ProdukKatalog {
  produk_id: string
  kode: string
  nama: string
  satuan: { satuan_id: string; kode: string; konversi: number }[]
}

interface ItemHasil {
  produk_id: string
  kode_produk: string
  nama_produk: string
  satuan_id: string
  satuan_kode: string
  konversi: number
  qty: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonError('Sesi tidak ditemukan. Login ulang lalu coba lagi.', 401)

    const { teks } = (await req.json().catch(() => ({}))) as { teks?: string }
    if (!teks?.trim()) return jsonError('Tempel dulu teks pesanannya.', 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiKey) {
      return jsonError('GEMINI_API_KEY belum disetel. Lihat halaman Riset Pasar untuk cara membuatnya.', 500)
    }

    const klien = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })

    const { data: bolehSales, error: errPeran } = await klien.rpc('boleh_sales')
    if (errPeran) return jsonError('Gagal memverifikasi peran pengguna: ' + errPeran.message, 500)
    if (!bolehSales) return jsonError('Hanya Owner/Admin/Sales yang boleh memakai fitur ini.', 403)

    const katalog = await ambilKatalog(klien)
    if (katalog.length === 0) return jsonError('Belum ada produk aktif untuk dicocokkan.', 400)

    const { items, tidakDikenali } = await panggilGemini(geminiKey, teks.trim(), katalog)

    return new Response(JSON.stringify({ ok: true, items, tidakDikenali }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Terjadi kesalahan tak terduga.', 500)
  }
})

async function ambilKatalog(klien: ReturnType<typeof createClient>): Promise<ProdukKatalog[]> {
  const { data: produk } = await klien.from('produk').select('id, kode, nama').eq('aktif', true).is('induk_id', null)
  const daftarProduk = (produk ?? []) as unknown as { id: string; kode: string; nama: string }[]
  if (daftarProduk.length === 0) return []

  const { data: satuan } = await klien
    .from('produk_satuan')
    .select('produk_id, satuan_id, konversi, urutan, satuan:satuan_id(kode)')
    .in(
      'produk_id',
      daftarProduk.map((p) => p.id),
    )
    .order('urutan')
  const daftarSatuan = (satuan ?? []) as unknown as { produk_id: string; satuan_id: string; konversi: number; satuan: { kode: string } }[]

  return daftarProduk.map((p) => ({
    produk_id: p.id,
    kode: p.kode,
    nama: p.nama,
    satuan: daftarSatuan.filter((s) => s.produk_id === p.id).map((s) => ({ satuan_id: s.satuan_id, kode: s.satuan.kode, konversi: s.konversi })),
  }))
}

async function panggilGemini(
  apiKey: string,
  teks: string,
  katalog: ProdukKatalog[],
): Promise<{ items: ItemHasil[]; tidakDikenali: string[] }> {
  const daftarKatalog = katalog
    .map((p) => `- kode ${p.kode} = "${p.nama}", satuan tersedia: ${p.satuan.map((s) => s.kode).join(', ') || '(tidak ada)'}`)
    .join('\n')

  const prompt = `Kamu membaca pesan chat pemesanan dari pelanggan toko dagang/distribusi. Cocokkan SETIAP barang yang disebut ke katalog produk resmi di bawah -- JANGAN PERNAH membuat kode produk atau satuan yang tidak ada di daftar.

Katalog produk (kode = nama, satuan tersedia):
${daftarKatalog}

Teks pesanan pelanggan:
"""
${teks}
"""

Balas HANYA dengan JSON valid, tanpa markdown, format persis:
{
  "items": [{"kode_produk": "...", "satuan_kode": "...", "qty": angka}],
  "tidak_dikenali": ["potongan teks yang tidak bisa dicocokkan ke katalog di atas"]
}

Aturan:
- "kode_produk" WAJIB salah satu kode persis dari katalog di atas. Kalau tidak yakin produk mana yang dimaksud, masukkan teksnya ke "tidak_dikenali", JANGAN menebak kode.
- "satuan_kode" WAJIB salah satu dari satuan tersedia produk itu. Kalau tidak disebut satuannya, pakai satuan pertama yang tersedia untuk produk itu.
- "qty" harus angka pesanan sebenarnya, default 1 kalau tidak disebutkan jumlahnya.
- Baris yang tidak berkaitan dengan pemesanan barang (basa-basi, pertanyaan ongkir, dll) tidak perlu masuk ke manapun.`

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Gemini API gagal (${res.status}): ${t.slice(0, 300)}`)
  }

  const hasil = await res.json()
  const teksJson = (hasil?.candidates?.[0]?.content?.parts ?? []).map((b: { text?: string }) => b.text ?? '').join('')
  if (!teksJson.trim()) throw new Error('Gemini tidak mengembalikan hasil. Coba lagi sesaat lagi.')

  let diparsing: { items?: { kode_produk?: string; satuan_kode?: string; qty?: number }[]; tidak_dikenali?: string[] }
  try {
    diparsing = JSON.parse(teksJson)
  } catch {
    throw new Error('Gemini mengembalikan format yang tidak bisa dibaca. Coba lagi atau isi manual.')
  }

  const petaProduk = new Map(katalog.map((p) => [p.kode, p]))
  const items: ItemHasil[] = []
  const tidakDikenali = [...(diparsing.tidak_dikenali ?? [])]

  for (const it of diparsing.items ?? []) {
    const p = it.kode_produk ? petaProduk.get(it.kode_produk) : undefined
    if (!p) {
      tidakDikenali.push(`(kode tidak dikenal: ${it.kode_produk ?? '-'})`)
      continue
    }
    const satuan = p.satuan.find((s) => s.kode === it.satuan_kode) ?? p.satuan[0]
    if (!satuan) {
      tidakDikenali.push(`${p.nama} (belum ada satuan terdaftar)`)
      continue
    }
    const qty = typeof it.qty === 'number' && it.qty > 0 ? it.qty : 1
    items.push({
      produk_id: p.produk_id,
      kode_produk: p.kode,
      nama_produk: p.nama,
      satuan_id: satuan.satuan_id,
      satuan_kode: satuan.kode,
      konversi: satuan.konversi,
      qty,
    })
  }

  return { items, tidakDikenali }
}

function jsonError(pesan: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: pesan }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
