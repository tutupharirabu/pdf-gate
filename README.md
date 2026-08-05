# pdf-gate

> **Dual-Layer PDF Document Validator**  
> Validasi konten + verifikasi kriptografis digital signature untuk dokumen formal Indonesia.
> **8 schema built-in · Zero-trust · No network · core validation < 50KB, OCR engine optional**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.0.0-brightgreen)](https://nodejs.org/)
[![Zero Trust](https://img.shields.io/badge/Zero%20Trust-✅-blue)](#)

---

## ✨ Fitur

- **Layer 1 — Sanity Check**: Deteksi tipe dokumen, validasi struktur, word count, distribusi spasial, field rule matching.
- **Layer 2 — Cryptographic Verification**: Verifikasi digital signature PKCS#7 via `@ninja-labs/verify-pdf`.
- **8 Built-in Schema**: Ijazah, Transkrip Nilai, Sertifikat, KTP, Akte Kelahiran, SIM, Paspor, Kartu Keluarga.
- **Custom Schema**: Daftarkan schema kustom via JSON, JS, atau API `registerSchema()`.
- **Auto-Generate Schema**: Generate schema otomatis dari PDF template institusi — deteksi 4 pola layout.
- **OCR untuk PDF Scan**: Deteksi teks otomatis untuk PDF scan — tesseract.js WASM (ind+eng), fully local, hasil OCR masuk Layer 1.
- **Zero Trust Security**: No network, input sanitization, ReDoS protection, buffer zeroing.
- **Ringan & Efisien**: Core validation < 50KB (OCR engine optional, lazy-loaded), `picocolors` (2.6KB) gantikan `chalk`, lightweight fallback parser tanpa `pdfjs-dist`.

---

## 🚀 Instalasi

> **⚠️ Registry GitHub Packages**: Paket ini dipublikasikan ke **GitHub Packages**
> (`@tutupharirabu:registry=https://npm.pkg.github.com`), bukan npmjs.com.
> Konsumen harus menyiapkan file `.npmrc` dengan registry + token autentikasi GitHub Packages:
>
> ```ini
> @tutupharirabu:registry=https://npm.pkg.github.com
> //npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
> ```
>
> Setelah itu, install seperti biasa:

```bash
npm install @tutupharirabu/pdf-gate
```

**Requirement**: Node.js >= 22.0.0

---

## 📖 Quick Start

### CLI

```bash
# Validasi ijazah
pdf-validate ./ijazah.pdf --schema ijazah

# Validasi KTP
pdf-validate ./ktp.pdf --schema ktp

# Validasi Kartu Keluarga
pdf-validate ./kk.pdf --schema kk

# Output JSON untuk CI/CD
pdf-validate ./doc.pdf --schema passport --json

# Quiet mode — hanya print status
pdf-validate ./doc.pdf --schema akte-kelahiran --quiet

# Skip cryptographic check
pdf-validate ./doc.pdf --schema sim --skip-crypto

# List semua schema
pdf-validate --list-schemas
```

### API

```js
import { validatePDF } from '@tutupharirabu/pdf-gate';
import { readFileSync } from 'fs';

const buffer = readFileSync('./ijazah.pdf');
const result = await validatePDF(buffer, { schema: 'ijazah' });

console.log(result.status);  // 'VERIFIED' | 'PLAUSIBLE' | 'FAILED'
```

---

## 📋 Built-in Schemas (8 Total)

### Pendidikan

| Schema | Label | Deskripsi |
|--------|-------|-----------|
| `ijazah` | Ijazah | Ijazah perguruan tinggi Indonesia |
| `transkrip` | Transkrip Nilai | Transkrip akademik (IPK, SKS, mata kuliah) |
| `sertifikat` | Sertifikat | Sertifikat pelatihan, training, bootcamp |

### Kependudukan

| Schema | Label | Deskripsi |
|--------|-------|-----------|
| `ktp` | KTP Digital | Kartu Tanda Penduduk digital |
| `kk` | Kartu Keluarga | Kartu Keluarga (nomor KK, kepala keluarga, anggota) |
| `akte-kelahiran` | Akte Kelahiran | Akte/Catatan Sipil kelahiran |

### Identitas

| Schema | Label | Deskripsi |
|--------|-------|-----------|
| `sim` | SIM | Surat Izin Mengemudi (golongan darah, nomor SIM) |
| `passport` | Paspor | Paspor Republik Indonesia (nomor, kewarganegaraan, berlaku) |

---

## 🛠️ CLI Usage

```bash
pdf-validate <file> [options]
```

| Option | Alias | Deskripsi |
|--------|-------|-----------|
| `--schema <name>` | `-s` | Nama schema (wajib) |
| `--schema-file <path>` | `-f` | Load schema dari file `.json` / `.js` (repeatable) |
| `--json` | | Output sebagai JSON |
| `--quiet` | `-q` | Hanya print status, exit code 1 jika FAILED |
| `--skip-crypto` / `--skip-layer2` | | Skip Layer 2 verifikasi kriptografis |
| `--ocr` | | Paksa OCR meskipun PDF memiliki teks yang bisa diekstrak |
| `--ocr-langs <codes>` | | Kode bahasa tesseract dipisah koma (default: `ind,eng`) |
| `--list-schemas` | | Tampilkan semua schema yang tersedia |
| `--generate-schema <file>` | | Generate schema dari template PDF |
| `--schema-name <name>` | | Nama untuk generated schema |
| `--schema-label <label>` | | Label untuk generated schema |
| `--output <path>` | `-o` | Simpan generated schema ke file JSON |

### Exit Codes
- `0` — VERIFIED atau PLAUSIBLE
- `1` — FAILED atau error

---

## 🔧 Custom Schema

### JSON (pakai `/pattern/flags` string)
```json
{
  "name": "skck",
  "label": "SKCK",
  "fingerprints": ["/SKCK/i", "/catatan kepolisian/i"],
  "fingerprintMin": 1,
  "heuristics": { "minWords": 30, "maxWords": 400 },
  "rules": [
    { "id": "nama", "label": "Nama", "pattern": "/nama\\s*:\\s*.+/i", "required": true }
  ]
}
```

### JavaScript ESM (pakai native RegExp)
```js
export default {
  name: 'surat-keterangan',
  label: 'Surat Keterangan',
  fingerprints: [/surat\s+keterangan/i],
  fingerprintMin: 1,
  heuristics: { minWords: 20, maxWords: 300 },
  rules: [{ id: 'nomor', label: 'Nomor', pattern: /nomor\s*:\s*.+/i, required: true }]
};
```

### Programmatic
```js
import { registerSchema, validatePDF } from 'pdf-gate';
registerSchema({ name: 'skck', /* ... */ });
const result = await validatePDF(buffer, { schema: 'skck' });
```

---

## 🤖 Auto-Generate Schema dari Template PDF

```bash
pdf-validate --generate-schema ./template.pdf \
  --schema-name dokumen-baru \
  --schema-label "Dokumen Baru" \
  --output ./dokumen-baru.json
```

Engine mendeteksi **4 pola layout**: colon-separated, tabular/box, stacked label-value, header key-value.

---

## 🤖 OCR untuk PDF Scan

PDF scan (tanpa teks yang bisa diekstrak) otomatis di-OCR dengan **tesseract.js v6 (WASM)** — bahasa **Indonesia + Inggris**, **fully local** (zero network — zero-trust tetap terjaga). Hasil OCR dimasukkan ke **Layer 1** (fingerprint, heuristics, field rules) sehingga dokumen scan bisa divalidasi seperti PDF digital.

### CLI

```bash
# Auto: OCR berjalan hanya jika PDF tidak punya teks yang bisa diekstrak
pdf-validate ./scan.pdf --schema ijazah

# Paksa OCR + bahasa kustom
pdf-validate ./scan.pdf --schema ijazah --ocr --ocr-langs ind,eng
```

### API

```js
const result = await validatePDF(buffer, {
  schema: 'ktp',
  ocr: true,                    // paksa OCR meskipun ada teks
  ocrLanguages: ['ind', 'eng'], // bahasa tesseract
  ocrPageLimit: 10,             // max halaman untuk OCR otomatis
});
```

### Metadata hasil

`layer1.ocr` berisi metadata run OCR (atau `null` jika OCR tidak pernah dijalankan):

```js
layer1.ocr: {
  used: true,
  engine: "tesseract.js@6.0.1",,
  languages: ['ind', 'eng'],
  confidence: 0.92,
  durationMs: 1843,
  pages: 2,
  charCount: 2410,
  error: null
}
```

> **Catatan:** Engine OCR di-load secara **lazy** (dynamic import — hanya saat dibutuhkan). Traineddata `ind` + `eng` (lisensi Apache-2.0, dari `tesseract-ocr/tessdata_best`) di-bundle sehingga ukuran paket naik ke **±50MB**; core validation tetap **< 50KB**.

---

## 🔒 Zero Trust Security

| Mekanisme | Deskripsi |
|---|---|
| **No Network** | Zero network requests — semua pemrosesan lokal |
| **Input Sanitization** | Prototype pollution guard, max buffer 100MB |
| **ReDoS Protection** | Timeout 5s + 100-match limit per regex |
| **Buffer Zeroing** | `zeroBuffer()` untuk hapus data sensitif dari memori |
| **Path Traversal Guard** | `isSafeFilePath()` — blokir `../`, null bytes |
| **Safe Regex** | Deteksi pola malicious (nested quantifiers) |

---

## 📊 Validation Result Shape

```js
{
  status: 'VERIFIED' | 'PLAUSIBLE' | 'FAILED',
  schema: string, fileName: string | null,
  fileSizeKb: number, pageCount: number,
  totalDurationMs: number, timestamp: string,
  layer1: { passed, detectedType, failReason, rules, heuristics, ocr, durationMs },
  layer2: { passed, hasSignature, issuer, issuedTo, validFrom, validTo,
            certExpired, integrityOk, signedAt, failReason, durationMs }
}
```

---

## ❌ Error Messages

| Kondisi | failReason | Status |
|---|---|---|
| PDF scan / teks kosong | `PDF tidak memiliki teks — kemungkinan hasil scan...` | FAILED |
| Tipe mismatch | `Dokumen terdeteksi sebagai "X", bukan "Y" yang dipilih.` | FAILED |
| Tipe tidak dikenali | `Tipe dokumen tidak dikenali...` | FAILED |
| Field wajib hilang | `[N] field wajib tidak ditemukan: [label1], [label2]` | FAILED |
| Cert expired | `Sertifikat digital telah expired pada [validTo]` | FAILED |
| Integrity gagal | `Integritas dokumen gagal — PDF kemungkinan dimodifikasi...` | FAILED |
| PDF corrupt | `Gagal membaca PDF: [error]. Pastikan file tidak corrupt...` | FAILED |

---

## 🧪 Testing

> **Note:** Jest requires the `--experimental-vm-modules` Node.js flag for ESM support.
> The `npm test` script already includes this flag.

```bash
npm install
npm test                 # Run all tests (11 suites, 106+ tests)
npm run test:coverage    # Coverage report
```

---

## 📁 Structure

```
pdf-gate/
├── src/
│   ├── index.js               # Public API
│   ├── types.js               # JSDoc typedefs
│   ├── layer1/                # Sanity check (4 gates sequential)
│   ├── layer2/                # Crypto wrapper (@ninja-labs/verify-pdf)
│   ├── generator/             # Auto schema generation (6 modules)
│   ├── ocr/                   # OCR (4 modules: index, rasterizer, engine, traineddata)
│   ├── schemas/               # 8 built-in schemas + registry
│   └── utils/                 # Security, parser, logger, pattern
├── cli/index.js               # CLI (picocolors, commander)
├── demo/                      # Demo server (Express + multer)
├── examples/                  # Custom schema examples
├── test/                      # 11 test suites (incl. ocr.test.js)
├── .github/workflows/ci.yml   # CI (typecheck + tests + pack check)
├── LICENSE                    # MIT
└── package.json
```

---

## 📝 License

MIT © 2026 Irfan Zharauri Nanda Sudiyanto

