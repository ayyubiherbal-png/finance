// Buat Draf Konten -- Konten Agent Fase 2, Level 1 (MVP).
//
// Staf pilih produk + kanal, dapat draf caption dari data produk asli.
// TIDAK generate gambar/video (menyusul kalau ini terbukti berguna), dan
// TIDAK publish ke mana pun -- staf yang salin & posting sendiri.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = 'gemini-3.6-flash'

const LABEL_KANAL: Record<string, string> = {
  canvassing: 'obrolan langsung/canvassing',
  tokopedia: 'Tokopedia',
  shopee: 'Shopee',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
  lainnya: 'media sosial umum',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonError('Sesi tidak ditemukan. Login ulang lalu coba lagi.', 401)

    const { produkId, kanal } = (await req.json().catch(() => ({}))) as { produkId?: string; kanal?: string }
    if (!produkId) return jsonError('Pilih produk dulu.', 400)
    if (!kanal || !(kanal in LABEL_KANAL)) return jsonError('Pilih kanal dulu.', 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiKey) {
      return jsonError('GEMINI_API_KEY belum disetel. Lihat halaman Riset Pasar untuk cara membuatnya.', 500)
    }

    const klien = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })

    const { data: bolehSales, error: errPeran } = await klien.rpc('boleh_sales')
    if (errPeran) return jsonError('Gagal memverifikasi peran pengguna: ' + errPeran.message, 500)
    if (!bolehSales) return jsonError('Hanya Owner/Admin/Sales yang boleh membuat draf konten.', 403)

    const konteks = await ambilKonteksProduk(klien, produkId)
    if (!konteks) return jsonError('Produk tidak ditemukan.', 404)

    const draf = await panggilGemini(geminiKey, konteks, kanal)

    const {
      data: { user },
    } = await klien.auth.getUser()

    const klienService = createClient(supabaseUrl, serviceRoleKey)
    const { data: baris, error: errInsert } = await klienService
      .from('konten_draft')
      .insert({ produk_id: produkId, kanal, draf, model: MODEL, dibuat_oleh: user?.id ?? null })
      .select('id, draf, dibuat_pada')
      .single()
    if (errInsert) return jsonError('Draf berhasil dibuat tapi gagal disimpan: ' + errInsert.message, 500)

    return new Response(JSON.stringify({ ok: true, draf: baris }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Terjadi kesalahan tak terduga.', 500)
  }
})

interface KonteksProduk {
  nama: string
  kategori: string | null
  beratGram: number | null
  qty: number
  harga: number | null
  sumberHarga: 'daftar_harga' | 'transaksi_terakhir' | null
  risetTerakhir: string | null
}

async function ambilKonteksProduk(klien: ReturnType<typeof createClient>, produkId: string): Promise<KonteksProduk | null> {
  const [{ data: produk }, { data: stok }, { data: hargaDaftar }, { data: hargaTransaksi }, { data: riset }] = await Promise.all([
    klien.from('produk').select('nama, berat_gram, kategori:kategori_id(nama)').eq('id', produkId).maybeSingle(),
    klien.from('v_stok_produk').select('qty').eq('produk_id', produkId).maybeSingle(),
    klien
      .from('produk_harga')
      .select('harga, tier_harga:tier_harga_id!inner(jadi_default)')
      .eq('produk_id', produkId)
      .eq('tier_harga.jadi_default', true)
      .eq('min_qty', 1)
      .or('berlaku_sampai.is.null,berlaku_sampai.gte.' + new Date().toISOString().slice(0, 10))
      .maybeSingle(),
    klien.from('v_laba_produk').select('qty_terjual, omzet').eq('produk_id', produkId).gt('qty_terjual', 0).maybeSingle(),
    klien.from('riset_pasar_brief').select('hasil_riset').order('dibuat_pada', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (!produk) return null

  const p = produk as unknown as { nama: string; berat_gram: number | null; kategori: { nama: string } | null }
  const hd = hargaDaftar as unknown as { harga: number } | null
  const ht = hargaTransaksi as unknown as { qty_terjual: number; omzet: number } | null

  return {
    nama: p.nama,
    kategori: p.kategori?.nama ?? null,
    beratGram: p.berat_gram,
    qty: ((stok as unknown as { qty: number } | null)?.qty) ?? 0,
    harga: hd?.harga ?? (ht ? Math.round(ht.omzet / ht.qty_terjual) : null),
    sumberHarga: hd ? 'daftar_harga' : ht ? 'transaksi_terakhir' : null,
    risetTerakhir: (riset as unknown as { hasil_riset: string } | null)?.hasil_riset ?? null,
  }
}

async function panggilGemini(apiKey: string, k: KonteksProduk, kanal: string): Promise<string> {
  const labelHarga =
    k.harga === null ? 'belum ada data harga' : k.sumberHarga === 'daftar_harga' ? `Rp${k.harga}` : `sekitar Rp${k.harga} (dari rata-rata transaksi, bukan harga resmi tetap)`

  const prompt = `Kamu adalah content writer untuk toko Ayyubi Food (dagang/distribusi produk herbal & makanan Indonesia, skala UMKM). Buat SATU draf konten promosi untuk kanal ${LABEL_KANAL[kanal]}.

Data produk (JANGAN mengarang data di luar ini):
- Nama: ${k.nama}
- Kategori: ${k.kategori ?? 'tidak dikategorikan'}
- Berat/kemasan: ${k.beratGram ? `${k.beratGram} gram` : 'tidak dicatat'}
- Stok saat ini: ${k.qty}${k.qty <= 0 ? ' (HABIS -- jangan buat konten yang mengajak beli sekarang, fokus ke "segera hadir lagi" atau pilih produk lain)' : ''}
- Harga: ${labelHarga}
${k.risetTerakhir ? `\nCatatan riset pasar terakhir (konteks tambahan, boleh dipakai kalau relevan):\n${k.risetTerakhir.slice(0, 1500)}\n` : ''}
Instruksi:
1. Nada: ramah, santai ala UMKM Indonesia, tidak berlebihan -- JANGAN klaim khasiat kesehatan yang tidak terverifikasi untuk produk herbal/makanan (hindari kata "menyembuhkan", "obat", "terbukti klinis", dsb) -- ini rawan melanggar aturan iklan pangan di Indonesia.
2. Sesuaikan gaya & panjang dengan kanal ${LABEL_KANAL[kanal]} (mis. WhatsApp lebih personal & pendek, TikTok lebih catchy dengan hook di awal).
3. Sertakan harga HANYA kalau datanya ada di atas -- kalau "belum ada data harga", jangan sebut angka, arahkan pembaca chat/DM untuk tanya harga.
4. Tutup dengan 3-5 hashtag relevan (khusus kanal yang lazim pakai hashtag; untuk WhatsApp/canvassing tidak perlu hashtag).
5. Tulis draf SIAP PAKAI, Bahasa Indonesia. Jangan tambahkan penjelasan meta di luar draf itu sendiri.`

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Gemini API gagal (${res.status}): ${t.slice(0, 300)}`)
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
