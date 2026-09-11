// Riset Pasar -- Fase 2 Level 1.
//
// Dipicu manual dari tombol di halaman Riset Pasar (src/pages/RisetPasar.tsx).
// Alur: baca ringkasan data internal Ayyubi Finance lewat sesi pemanggil
// sendiri (RLS tetap berlaku, tidak ada bypass), kirim ke Gemini API untuk
// digabung dengan riset pasar dari luar, simpan hasilnya.
//
// GEMINI_API_KEY wajib disetel sebagai secret (Dashboard -> Edge Functions
// -> Secrets). SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY sudah otomatis
// tersedia dari platform, tidak perlu disetel manual.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = 'gemini-2.0-flash'

interface RingkasanInternal {
  jumlah_produk_aktif: number
  jumlah_pelanggan: number
  jumlah_faktur: number
  produk_teratas: { kode_produk: string; nama_produk: string; qty_terjual: number; omzet: number; margin_persen: number }[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonError('Sesi tidak ditemukan. Login ulang lalu coba lagi.', 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const geminiKey = Deno.env.get('GEMINI_API_KEY')

    if (!geminiKey) {
      return jsonError(
        'GEMINI_API_KEY belum disetel. Buat API key gratis di aistudio.google.com/apikey, lalu simpan sebagai secret di Dashboard Supabase (Edge Functions -> Secrets).',
        500,
      )
    }

    // Klien atas sesi pemanggil sendiri -- RLS tetap berlaku, bukan service role.
    const klienPengguna = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: adminCheck, error: errAdmin } = await klienPengguna.rpc('is_admin')
    if (errAdmin) return jsonError('Gagal memverifikasi peran pengguna: ' + errAdmin.message, 500)
    if (!adminCheck) return jsonError('Hanya Owner/Admin yang boleh membuat Riset Pasar.', 403)

    const ringkasan = await ambilRingkasanInternal(klienPengguna)
    const hasilRiset = await panggilGemini(geminiKey, ringkasan)

    const {
      data: { user },
    } = await klienPengguna.auth.getUser()

    // Tulis lewat service role -- klien biasa tidak diberi izin INSERT langsung
    // (lihat migrasi 0055), supaya tidak ada jalur lain memicu pemakaian API.
    const klienService = createClient(supabaseUrl, serviceRoleKey)
    const { data: brief, error: errInsert } = await klienService
      .from('riset_pasar_brief')
      .insert({
        ringkasan_internal: ringkasan,
        hasil_riset: hasilRiset,
        model: MODEL,
        dibuat_oleh: user?.id ?? null,
      })
      .select('id, hasil_riset, dibuat_pada')
      .single()
    if (errInsert) return jsonError('Riset berhasil dibuat tapi gagal disimpan: ' + errInsert.message, 500)

    return new Response(JSON.stringify({ ok: true, brief }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Terjadi kesalahan tak terduga.', 500)
  }
})

async function ambilRingkasanInternal(klien: ReturnType<typeof createClient>): Promise<RingkasanInternal> {
  const [{ count: jumlahProduk }, { count: jumlahPelanggan }, { count: jumlahFaktur }, { data: produkTeratas }] = await Promise.all([
    klien.from('produk').select('id', { count: 'exact', head: true }).eq('aktif', true),
    klien.from('pelanggan').select('id', { count: 'exact', head: true }),
    klien.from('faktur_penjualan').select('id', { count: 'exact', head: true }).neq('status', 'dibatalkan'),
    klien.from('v_laba_produk').select('kode_produk, nama_produk, qty_terjual, omzet, margin_persen').order('omzet', { ascending: false }).limit(10),
  ])

  return {
    jumlah_produk_aktif: jumlahProduk ?? 0,
    jumlah_pelanggan: jumlahPelanggan ?? 0,
    jumlah_faktur: jumlahFaktur ?? 0,
    produk_teratas: (produkTeratas ?? []) as RingkasanInternal['produk_teratas'],
  }
}

async function panggilGemini(apiKey: string, ringkasan: RingkasanInternal): Promise<string> {
  const prompt = `Kamu adalah analis riset pasar untuk bisnis dagang/distribusi produk herbal & makanan di Indonesia bernama Ayyubi Finance.

Data internal saat ini:
- Produk aktif: ${ringkasan.jumlah_produk_aktif}
- Pelanggan terdaftar: ${ringkasan.jumlah_pelanggan}
- Faktur penjualan yang pernah terbit: ${ringkasan.jumlah_faktur}
- Produk dengan omzet tertinggi: ${
    ringkasan.produk_teratas.length === 0
      ? 'belum ada data penjualan'
      : ringkasan.produk_teratas.map((p) => `${p.nama_produk} (qty ${p.qty_terjual}, omzet Rp${p.omzet}, margin ${p.margin_persen}%)`).join('; ')
  }

Tugas kamu:
1. Kalau data penjualan internal masih sangat sedikit (di bawah 10 faktur), katakan itu terus terang di awal -- jangan berpura-pura ada pola dari data yang belum cukup.
2. Cari tren pasar, kisaran harga, dan kompetitor terkini di Indonesia untuk kategori produk yang relevan dari data di atas.
3. Tutup dengan 2-4 rekomendasi konkret yang bisa langsung ditindaklanjuti, bukan saran umum.

Tulis dalam Bahasa Indonesia, ringkas, format markdown dengan sub-judul.`

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
    }),
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
