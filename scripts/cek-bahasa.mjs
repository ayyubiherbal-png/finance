#!/usr/bin/env node
/**
 * Audit dwibahasa (ID/EN) berbasis AST TypeScript -- bukan regex.
 *
 * Dibuat 2026-09-09 setelah sisir manual per halaman (grep) berulang
 * kali menyisakan celah. Ada 2 jenis bug yang mudah tercampur kalau
 * dicek manual:
 *
 *   1. TIDAK-DIBUNGKUS -- teks mentah di elemen yang TIDAK menerjemahkan
 *      otomatis (<p>, <span>, <Td>, <label>, <h1>, dst). Tidak pernah
 *      berganti bahasa sama sekali.
 *   2. TANPA-KAMUS -- teks yang sudah lewat jalur terjemahan (dibungkus
 *      tt(), atau anak dari komponen auto-translate seperti
 *      Th/Label/Badge/Button/CardTitle/option, atau placeholder Input/
 *      Combobox/dll., atau argumen toast()/new Error()) TAPI belum
 *      punya entri di kamus `TEKS` -- tt() diam-diam jatuh balik ke
 *      Bahasa Indonesia TANPA error. Inilah penyebab paling umum
 *      "sebagian halaman ikut berganti bahasa, sebagian tidak".
 *
 * Juga menyisir NILAI KONSTANTA (LABEL_STATUS, INFO_SEGMEN, dst.) --
 * ini luput dari audit pertama karena dipakai lewat `LABEL_X[kolom]`,
 * bukan literal langsung di JSX.
 *
 * Dokumen cetak (Faktur, Surat Jalan, Label pengiriman) SENGAJA
 * dikecualikan -- ditujukan untuk pembeli/kurir Indonesia, tetap
 * Bahasa Indonesia berapa pun toggle bahasa di aplikasi.
 *
 * Pakai: `npm run cek:bahasa` -- exit code 1 kalau ada temuan (untuk CI),
 * 0 kalau bersih.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const KAMUS_FILE = path.join(ROOT, 'lib/i18nText.ts')

// ---------- muat kamus TEKS & KAMUS (dinamis, bukan nomor baris tetap) ----------
// TEKS dipakai oleh tt() -- kunci = kalimat Indonesia asli.
// KAMUS dipakai oleh t() -- kunci = identifier titik (mis. 'dasbor.omzet30Hari'),
// dua kamus BEDA, jadi divalidasi terpisah supaya tidak salah silang.
const kamusLines = fs.readFileSync(KAMUS_FILE, 'utf8').split('\n')

function blokObjek(namaConst) {
  const awal = kamusLines.findIndex((b) => b.startsWith(`export const ${namaConst}`))
  if (awal < 0) throw new Error(`Blok \`export const ${namaConst}\` tidak ketemu di i18nText.ts -- format file berubah?`)
  const akhir = kamusLines.findIndex((b, i) => i > awal && (b === '}' || b.startsWith('} as const')))
  if (akhir < 0) throw new Error(`Penutup blok \`${namaConst}\` tidak ketemu.`)
  return kamusLines.slice(awal + 1, akhir).join('\n')
}

function kunciDariBlok(body) {
  const set = new Set()
  for (const m of body.matchAll(/^\s{2}(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|([A-Za-z_$][\w$]*)):/gm)) {
    set.add((m[1] ?? m[2] ?? m[3]).replace(/\\'/g, "'").replace(/\\"/g, '"'))
  }
  return set
}

const teksKeys = kunciDariBlok(blokObjek('TEKS'))
const kamusKeys = kunciDariBlok(blokObjek('KAMUS'))

// ---------- komponen/atribut yang MENERJEMAHKAN otomatis (lihat components/ui.tsx) ----------
const ANAK_AUTO = new Set(['Th', 'Label', 'Badge', 'Button', 'CardTitle', 'option'])
const ATTR_AUTO = new Map([
  ['placeholder', new Set(['Input', 'Textarea', 'InputAngka', 'Combobox', 'input', 'textarea'])],
  ['pesan', new Set(['KondisiKosong'])],
  ['label', new Set(['InfoField', 'Ringkas', 'Info'])], // komponen presentasi lokal yang menerjemahkan sendiri labelnya
  ['judul', new Set(['KartuAngka'])],
])
const FUNGSI_AUTO = new Set(['toast', 'Error']) // Toaster & PesanError menerjemahkan saat render
// Teks yang SENGAJA tidak pernah diterjemahkan (identitas merek, simbol,
// invariant developer-only yang tidak pernah sampai ke layar pengguna)
const ABAIKAN = new Set([
  'Ayyubi Food',
  'Ayyubi Finance',
  '&middot;',
  'H+',
  'Enter',
  'Rp',
  'useAuth harus dipakai di dalam AuthProvider',
  'useI18n dipakai di luar <I18nProvider>',
])
// Dokumen cetak -- sengaja tetap Bahasa Indonesia (lihat catatan kepala i18nText.ts)
const KECUALI_CETAK = ['pages/FakturPenjualanCetak.tsx', 'pages/SuratJalanCetak.tsx', 'pages/SuratJalanCetakMassal.tsx', 'components/LabelSuratJalan.tsx']
// File non-UI (matcher kolom impor, util murni, kamus itu sendiri)
const KECUALI_NONUI = ['lib/importPesanan.ts', 'lib/format.ts', 'lib/i18n.tsx', 'lib/identitasToko.ts', 'lib/supabase.ts']

function semuaFile(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...semuaFile(p))
    else if (/\.(tsx|ts)$/.test(e.name) && !p.includes('i18nText')) out.push(p)
  }
  return out
}

const TAILWIND =
  /(^|\s)(flex|grid|hidden|block|inline|absolute|relative|fixed|sticky|w-|h-|p-|px-|py-|pt-|pb-|pl-|pr-|m-|mx-|my-|mt-|mb-|ml-|mr-|gap-|text-|bg-|border|rounded|shadow|font-|items-|justify-|space-|overflow|cursor-|opacity|truncate|whitespace|min-|max-|top-|left-|right-|bottom-|z-|animate-|transition|hover:|focus|disabled:|dark:|sm:|md:|lg:|tabular|leading-|tracking-|uppercase|shrink|col-span|divide-|self-|ring-|placeholder:|pointer-events|caption-|align-)/
function layakTerjemah(s) {
  const t = s.trim()
  if (t.length < 2 || !/[A-Za-z]/.test(t)) return false
  if (/^[@./]/.test(t) || /^https?:/.test(t)) return false
  if (/^[a-z0-9_]+$/.test(t)) return false
  if (/^[a-z0-9-]+$/.test(t) && t.includes('-')) return false
  if (/^[a-z]+(\.[a-z]+)+$/i.test(t)) return false
  if (/^(?:[A-Z_]{2,})$/.test(t)) return false
  if (TAILWIND.test(t)) return false
  if (/^hsl\(|^rgb\(|^var\(|^#[0-9a-f]{3,8}$/i.test(t)) return false
  if (/^[a-z-]+ [0-9.]+m?s /.test(t)) return false
  if (/^[a-z_]+(,\s*[a-z_]+|:[a-z_(]+)/.test(t)) return false // string select Supabase, mis. "id, kode, nama"
  return true
}

function auditJsx() {
  const temuan = []
  for (const file of semuaFile(ROOT)) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/')
    if (KECUALI_NONUI.includes(rel)) continue
    const isi = fs.readFileSync(file, 'utf8')
    const sf = ts.createSourceFile(file, isi, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const barisDari = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1

    const namaTag = (node) => {
      let n = node.parent
      while (n) {
        if (ts.isJsxElement(n)) return n.openingElement.tagName.getText(sf)
        if (ts.isJsxSelfClosingElement(n)) return n.tagName.getText(sf)
        if (ts.isJsxAttribute(n)) {
          let p = n.parent
          while (p && !ts.isJsxOpeningElement(p) && !ts.isJsxSelfClosingElement(p)) p = p.parent
          return p ? p.tagName.getText(sf) : '?'
        }
        n = n.parent
      }
      return '?'
    }
    const leluhurAuto = (node) => {
      let n = node.parent
      while (n) {
        if (ts.isJsxElement(n) && ANAK_AUTO.has(n.openingElement.tagName.getText(sf))) return true
        n = n.parent
      }
      return false
    }
    const stringGaya = (node) => {
      let n = node.parent
      while (n) {
        if (ts.isJsxAttribute(n)) {
          const nm = n.name.getText(sf)
          return nm === 'className' || nm === 'class' || nm === 'style'
        }
        if (ts.isCallExpression(n) && /^cn$|^clsx$|^cva$/.test(n.expression.getText(sf))) return true
        n = n.parent
      }
      return false
    }
    /** null | 't' | 'tt' -- fungsi terjemahan yang membungkus node ini, kalau ada. */
    const fungsiTt = (node) => {
      let n = node.parent
      while (n) {
        if (ts.isCallExpression(n)) {
          const f = n.expression.getText(sf)
          if (f === 't') return 't'
          if (f === 'tt' || f.endsWith('.tt') || f === 'renderPesan') return 'tt'
        }
        n = n.parent
      }
      return null
    }
    const didalamTt = (node) => fungsiTt(node) !== null
    const didalamFungsiAuto = (node) => {
      let n = node.parent
      while (n) {
        if (ts.isCallExpression(n) && FUNGSI_AUTO.has(n.expression.getText(sf))) return true
        if (ts.isNewExpression(n) && FUNGSI_AUTO.has(n.expression.getText(sf))) return true
        if (ts.isCallExpression(n) && /\bconfirm$/.test(n.expression.getText(sf))) return false
        n = n.parent
      }
      return false
    }
    const didalamJsx = (node) => {
      let n = node.parent
      while (n) {
        if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxAttribute(n) || ts.isJsxExpression(n)) return true
        n = n.parent
      }
      return false
    }
    const namaAttr = (node) => {
      let n = node.parent
      while (n) {
        if (ts.isJsxAttribute(n)) return n.name.getText(sf)
        if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) return null
        n = n.parent
      }
      return null
    }

    /** literal ini argumen pertama dari `.replace(...)`? (token placeholder mis. '{n}', dicek terpisah dari kalimat sumbernya) */
    const argumenReplace = (node) => {
      const p = node.parent
      return ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && p.expression.name.getText(sf) === 'replace' && p.arguments[0] === node
    }

    const catat = (node, teks) => {
      if (argumenReplace(node)) return
      const fungsi = fungsiTt(node)
      // Panggilan t('dasbor.omzet30Hari') pakai kunci identifier titik, valid
      // terhadap kamus KAMUS -- beda validasi dari tt() (kalimat vs TEKS).
      if (fungsi === 't') {
        const k = teks.trim()
        if (!kamusKeys.has(k)) temuan.push({ rel, baris: barisDari(node), tag: namaTag(node), teks: k, status: 'TANPA-KAMUS', cetak: KECUALI_CETAK.includes(rel) })
        return
      }
      const t = teks.replace(/\s+/g, ' ').trim()
      if (!layakTerjemah(t) || ABAIKAN.has(t)) return
      if (stringGaya(node)) return
      const tag = namaTag(node)
      const attr = namaAttr(node)
      const diterjemah =
        fungsi === 'tt' ||
        didalamFungsiAuto(node) ||
        (!attr && leluhurAuto(node)) ||
        (attr && ATTR_AUTO.get(attr)?.has(tag))
      const adaKamus = teksKeys.has(t)
      if (diterjemah && adaKamus) return
      temuan.push({
        rel,
        baris: barisDari(node),
        tag,
        teks: t,
        status: !diterjemah ? 'TIDAK-DIBUNGKUS' : 'TANPA-KAMUS',
        cetak: KECUALI_CETAK.includes(rel),
      })
    }

    const walk = (node) => {
      if (ts.isJsxText(node)) {
        const t = node.text.replace(/\s+/g, ' ').trim()
        if (t) catat(node, t)
      } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const parent = node.parent
        if (ts.isJsxAttribute(parent)) {
          if (['placeholder', 'pesan', 'title', 'label', 'alt'].includes(parent.name.getText(sf))) catat(node, node.text)
        } else if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) {
          // lewati
        } else if (didalamJsx(node) || didalamFungsiAuto(node) || didalamTt(node)) {
          catat(node, node.text)
        } else if (ts.isCallExpression(parent) && /confirm|alert/.test(parent.expression.getText(sf))) {
          catat(node, node.text)
        }
      }
      ts.forEachChild(node, walk)
    }
    walk(sf)
  }
  return temuan
}

// ---------- audit kedua: nilai konstanta label (LABEL_*, INFO_*, dst.) ----------
function auditKonstanta() {
  const PROP_TEKS = new Set(['label', 'jelas', 'judul', 'nama', 'teks', 'keterangan', 'sublabel'])
  const kurang = []
  for (const file of semuaFile(ROOT)) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/')
    if (KECUALI_CETAK.includes(rel) || KECUALI_NONUI.includes(rel)) continue
    const isi = fs.readFileSync(file, 'utf8')
    const sf = ts.createSourceFile(file, isi, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

    const walk = (node) => {
      if (
        ts.isVariableDeclaration(node) &&
        /^(LABEL|INFO|OPSI|JUDUL|NAMA|SEGMEN|KATEGORI|STATUS|MODE|TEKS)_?/.test(node.name.getText(sf)) &&
        node.initializer
      ) {
        const nama = node.name.getText(sf)
        const kutip = (n, jalur) => {
          if (ts.isStringLiteral(n)) {
            const t = n.text.trim()
            if (!t || /^[a-z_]+$/.test(t) || /^\//.test(t)) return
            if (['netral', 'default', 'sukses', 'peringatan', 'bahaya'].includes(t)) return
            if (!teksKeys.has(t)) kurang.push({ rel, nama, jalur, teks: t, baris: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 })
          } else if (ts.isObjectLiteralExpression(n)) {
            for (const p of n.properties) {
              if (!ts.isPropertyAssignment(p)) continue
              const k = p.name.getText(sf).replace(/['"]/g, '')
              if (ts.isStringLiteral(p.initializer)) {
                if (PROP_TEKS.has(k) || !ts.isObjectLiteralExpression(n.parent)) kutip(p.initializer, `${jalur}.${k}`)
              } else kutip(p.initializer, `${jalur}.${k}`)
            }
          } else if (ts.isArrayLiteralExpression(n)) {
            n.elements.forEach((el, i) => kutip(el, `${jalur}[${i}]`))
          }
        }
        kutip(node.initializer, nama)
      }
      ts.forEachChild(node, walk)
    }
    walk(sf)
  }
  return kurang
}

// ---------- jalankan & laporkan ----------
const temuanJsx = auditJsx()
const aktif = temuanJsx.filter((x) => !x.cetak)
const konstanta = auditKonstanta()

let adaMasalah = false

for (const status of ['TIDAK-DIBUNGKUS', 'TANPA-KAMUS']) {
  const arr = aktif.filter((x) => x.status === status)
  if (arr.length === 0) continue
  adaMasalah = true
  console.log(`\n########## ${status} (${arr.length}) ##########`)
  const perFile = {}
  for (const x of arr) (perFile[x.rel] ??= []).push(x)
  for (const [rel, xs] of Object.entries(perFile).sort()) {
    console.log(`\n### ${rel}`)
    const seen = new Set()
    for (const x of xs.sort((a, b) => a.baris - b.baris)) {
      const k = `${x.baris}|${x.teks}`
      if (seen.has(k)) continue
      seen.add(k)
      console.log(`  ${x.baris} <${x.tag}> ${JSON.stringify(x.teks)}`)
    }
  }
}

if (konstanta.length > 0) {
  adaMasalah = true
  console.log(`\n########## NILAI KONSTANTA TANPA KAMUS (${konstanta.length}) ##########`)
  const perFile = {}
  for (const k of konstanta) (perFile[k.rel] ??= []).push(k)
  for (const [rel, xs] of Object.entries(perFile).sort()) {
    console.log(`\n### ${rel}`)
    const seen = new Set()
    for (const x of xs.sort((a, b) => a.baris - b.baris)) {
      if (seen.has(x.teks)) continue
      seen.add(x.teks)
      console.log(`  ${x.baris} ${x.jalur} = ${JSON.stringify(x.teks)}`)
    }
  }
}

if (adaMasalah) {
  console.log('\n\nTambahkan entri yang kurang ke `TEKS` di src/lib/i18nText.ts, atau bungkus teksnya dengan tt().')
  process.exit(1)
} else {
  console.log(`OK -- 0 teks tertinggal (dicek ${semuaFile(ROOT).length} file, ${teksKeys.size} kunci kamus).`)
  process.exit(0)
}
