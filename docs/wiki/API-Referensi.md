# 📖 API Referensi

Permukaan API publik `@tutupharirabu/pdf-gate`. Semua ekspor ada di `src/index.js` (entry `main`/`exports["."]`). Ada juga subpath ekspor `@tutupharirabu/pdf-gate/schemas` → `src/schemas/index.js`.

---

## Ekspor Utama

| Ekspor | Deskripsi |
|---|---|
| `validatePDF(buffer, options)` | Validasi PDF dua lapisan — API utama. |
| `registerSchema(schema)` | Daftarkan schema kustom saat runtime. |
| `unregisterSchema(name)` | Hapus schema kustom yang terdaftar. |
| `resolveSchema(nameOrObject)` | Resolve schema by name atau validasi object schema kustom. |
| `loadSchemaFromFile(filePath, options?)` | Load schema dari file `.json` / `.js` (async). |
| `getAllSchemas()` | Snapshot Map (salinan) dari semua schema terdaftar. |
| `SCHEMAS` | Map registry langsung (`Map<name, Schema>`) — baca-only, jangan dimutasi. |
| `generateSchema(pdfBuffer, options?)` | Generate schema otomatis dari PDF template (async). |
| `ZERO_TRUST_MODE` | Konstanta `true` — penanda mode zero-trust aktif. |
| `assertNoNetwork()` | Diagnostik: deteksi koneksi jaringan aktif. |
| `zeroBuffer(buffer)` | Nol-kan isi buffer (Buffer/Uint8Array) untuk disposal aman. |
| `validateDependencies()` | Cek statis modul jaringan di module cache. |
| `createSecureContext(props?)` | Buat object context `null`-prototype yang di-`Object.freeze`. |
| `isSafeFilePath(filePath)` | Cek path aman dari path traversal. |
| `MAX_BUFFER_SIZE` | Konstanta batas buffer 100 MB. |

## `validatePDF(buffer, options)`

```js
import { validatePDF } from '@tutupharirabu/pdf-gate';
import { readFileSync } from 'node:fs';

const buffer = readFileSync('./ijazah.pdf');
const result = await validatePDF(buffer, {
  schema: 'ijazah',          // wajib: nama schema (string) atau object Schema
  fileName: 'ijazah.pdf',    // opsional, dipakai untuk field fileName hasil
  skipLayer2: true,          // opsional, default false
  trustedIssuers: ['BSrE'],  // opsional, allowlist issuer (substring)
  ocr: false,                // opsional, paksa OCR
  ocrLanguages: ['ind', 'eng'], // opsional, default ['ind','eng']
  ocrPageLimit: 10,          // opsional, default 10 (hanya untuk auto-OCR)
});
```

### Parameter `buffer`

`Buffer` atau `Uint8Array` berisi byte PDF mentah. Divalidasi oleh `sanitizeBuffer()`:

- Bukan Buffer/Uint8Array → `TypeError` (`'Parameter "buffer" harus berupa Buffer atau Uint8Array.'`)
- Kosong (0 bytes) → `TypeError`
- Lebih dari `MAX_BUFFER_SIZE` (100 MB) → `Error`
- Mengandung key terlarang (`__proto__`, `constructor`, `prototype`) → `Error` (proteksi prototype pollution)

### Parameter `options` (ValidateOptions)

Semua kunci disaring lewat **whitelist** `sanitizeOptions()` (`src/utils/sanitizer.js`):

| Kunci | Tipe | Default | Keterangan |
|---|---|---|---|
| `schema` | `string \| Schema` | — | **Wajib.** Nama schema terdaftar atau object schema kustom. |
| `skipLayer2` | `boolean` | `false` | Skip verifikasi kriptografis. |
| `fileName` | `string` | — | Nama file asli untuk hasil. |
| `trustedIssuers` | `string[]` | — | Allowlist substring nama issuer; signature dari issuer di luar daftar ditolak (CA pinning). |
| `ocr` | `boolean` | auto | `true` = paksa OCR; default: OCR otomatis hanya bila teks < 10 karakter & halaman ≤ `ocrPageLimit`. |
| `ocrLanguages` | `string[]` | `['ind','eng']` | Kode bahasa tesseract. |
| `ocrPageLimit` | `number` | `10` | Batas halaman untuk OCR otomatis (diabaikan saat `ocr: true`). |

**Error yang dilempar `validatePDF` (bukan hasil FAILED):**

- `options.schema` kosong → `TypeError('options.schema wajib diisi — nama schema atau object schema kustom.')`
- Nama schema tidak dikenal → `Error` dari `resolveSchema()`
- Schema object mengandung key terlarang → `Error` (prototype pollution)
- Rule regex mencurigakan (timeout saat pre-check ReDoS) → `Error`
- Buffer tidak valid (lihat di atas)

Kegagalan **validasi** (PDF corrupt, tipe mismatch, field hilang, dsb.) selalu dikembalikan sebagai `result.status === 'FAILED'` dengan `failReason`, **tidak dilempar**.

### Return: `ValidationResult`

```js
{
  status: 'VERIFIED' | 'PLAUSIBLE' | 'FAILED',
  schema: string,
  fileName: string | null,
  fileSizeKb: number,       // 1 desimal
  pageCount: number,
  totalDurationMs: number,  // 2 desimal
  timestamp: string,        // ISO-8601
  failReason: string | null,
  layer1: {
    passed: boolean,
    detectedType: string | null,
    failReason: string | null,
    rules: RuleResult[],        // { id, label, required, passed, found }
    heuristics: { passed: boolean, wordCount: number, flags: string[] },
    ocr: OcrResult | null,      // { used, engine, languages, confidence, durationMs, pages, charCount, error }
    durationMs: number
  },
  layer2: {
    hasSignature: boolean,
    passed: boolean,
    issuer: string | null,
    issuedTo: string | null,
    validFrom: string | null,
    validTo: string | null,
    certExpired: boolean,
    integrityOk: boolean,
    signedAt: string | null,
    failReason: string | null,
    durationMs: number
  }
}
```

Definisi tipe JSDoc lengkap ada di `src/types.js` (`ValidationResult`, `Layer1Result`, `Layer2Result`, `RuleResult`, `Schema`, `ValidateOptions`, `OcrResult`, `SchemaRule`).

## Registry Schema

### `registerSchema(schema)`

```js
import { registerSchema, validatePDF } from '@tutupharirabu/pdf-gate';

registerSchema({
  name: 'skck',
  label: 'SKCK',
  fingerprints: [/SKCK/i, /catatan kepolisian/i],
  fingerprintMin: 1,
  heuristics: { minWords: 30, maxWords: 400 },
  rules: [
    { id: 'nama', label: 'Nama', pattern: /nama\s*:\s*.+/i, required: true },
  ],
});

const result = await validatePDF(buffer, { schema: 'skck' });
```

- Pattern string (`"/.../i"` atau teks polos) otomatis di-parse ke `RegExp` oleh `parsePattern()` (`src/utils/pattern-parser.js`).
- Nama built-in **tidak bisa ditimpa** (`Error: Schema "ijazah" adalah built-in...`).
- Nama duplikat ditolak (`Error: ...sudah terdaftar. Gunakan unregisterSchema()...`).
- Schema divalidasi penuh oleh `validateSchema()`: `name`, `fingerprints` (non-empty), `fingerprintMin >= 1` dan ≤ panjang fingerprints, `rules` (non-empty, tiap rule punya `id`/`label`/`pattern`/`required`), `heuristics.minWords/maxWords`.

### `unregisterSchema(name)`

Hapus schema kustom. Built-in tidak bisa dihapus.

### `resolveSchema(nameOrObject)`

`string` → lookup di registry (melempar bila tidak ada). `object` → validasi sebagai schema kustom dan kembalikan. Tipe lain → `TypeError`.

### `loadSchemaFromFile(filePath, options?)`

```js
await loadSchemaFromFile('./my-schema.json');          // JSON: "/pattern/flags" otomatis jadi RegExp
await loadSchemaFromFile('./my-schema.js');            // ESM: export default schema
await loadSchemaFromFile('/abs/path.json', { allowedRoot: null }); // trusted: izinkan path absolut
```

- `.json`: `JSON.parse` + konversi pattern string → RegExp, lalu auto-register.
- `.js`: dynamic `import()` (mengeksekusi kode — **hanya muat file tepercaya**).
- **Path guard**: path yang di-resolve dibatasi pada `options.allowedRoot` (default `process.cwd()`); `{ allowedRoot: null }` menonaktifkan pembatasan (dipakai CLI untuk path operator).

### `getAllSchemas()` vs `SCHEMAS`

`getAllSchemas()` mengembalikan **salinan** `Map` (aman dimutasi); `SCHEMAS` adalah registry asli (jangan dimutasi dari luar).

## Generator Schema

### `generateSchema(pdfBuffer, options?)`

```js
import { generateSchema } from '@tutupharirabu/pdf-gate';

const gen = await generateSchema(buffer, {
  name: 'dokumen-baru',
  label: 'Dokumen Baru',
  hintFingerprints: [/kementerian/i], // opsional
});
// gen = { schema, confidence, detectedFields, warnings, durationMs }
```

Alur internal (`src/generator/index.js`): parse PDF → `groupTextByLines()` (toleransi Y 2pt) → `detectFieldValuePairs()` (4 pola layout: colon, tabular, stacked, header) → `buildRules()` → `extractFingerprints()` (n-gram 3-8 kata + ALL-CAPS, maks 8) → estimasi heuristics (±30% word count) → `calculateConfidence()` (clarity 40% + coverage 30% + consistency 20% + structure 10%).

- `schema` bisa `null` bila PDF gagal di-parse atau tanpa teks (lihat `warnings`).
- Confidence < 0.6 menghasilkan warning *"Confidence rendah (< 0.6) — schema perlu review manual..."*.
- Schema hasil generate dapat langsung didaftarkan: `registerSchema(gen.schema)`.

## Utilitas Zero Trust

```js
import {
  ZERO_TRUST_MODE,        // true
  assertNoNetwork,        // => { safe, handles, reason }
  zeroBuffer,             // buffer.fill(0)
  validateDependencies,   // => { clean, loadedModules, warning }
  createSecureContext,    // object null-prototype, Object.freeze
  isSafeFilePath,         // => boolean
  MAX_BUFFER_SIZE,        // 104_857_600 (100 MB)
} from '@tutupharirabu/pdf-gate';
```

Detail perilaku: lihat [Keamanan](Keamanan.md).

## Subpath `@tutupharirabu/pdf-gate/schemas`

```js
import { SCHEMAS, CATEGORY_MAP, getSchemasByCategory } from '@tutupharirabu/pdf-gate/schemas';

getSchemasByCategory('PENDIDIKAN');   // ['ijazah', 'transkrip', 'sertifikat']
getSchemasByCategory('KEPENDUDUKAN'); // ['ktp', 'kk', 'akte-kelahiran']
getSchemasByCategory('IDENTITAS');    // ['ktp', 'sim', 'passport']
getSchemasByCategory('SEMUA');        // semua 8 schema
```

(`category-map.js` — KTP masuk ke KEPENDUDUKAN dan IDENTITAS sekaligus.)

## Lihat Juga

- [Memulai](Memulai.md) — contoh pertama
- [Schema Dokumen](Schema-Dokumen.md) — bentuk object Schema & aturan
- [Layer 1 — Sanity Check](Layer-1-Sanity-Check.md) — detail gate validasi
