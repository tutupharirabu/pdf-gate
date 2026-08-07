# 🚀 Memulai

Panduan instalasi dan quick start untuk `@tutupharirabu/pdf-gate`.

---

## 1. Persyaratan

- **Node.js >= 22.0.0** (lihat `engines` di `package.json`).
- Paket dipublikasikan ke **GitHub Packages**, bukan npmjs.com — konsumen wajib menyiapkan autentikasi.

## 2. Instalasi dari GitHub Packages

Paket ini terdaftar pada registry `@tutupharirabu:registry=https://npm.pkg.github.com`. Karena itu, **sebelum install**, buat file `.npmrc` di root project konsumen:

```ini
@tutupharirabu:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

`GITHUB_TOKEN` adalah Personal Access Token (scope `read:packages`) yang diekspor sebagai environment variable.

Setelah `.npmrc` siap:

```bash
npm install @tutupharirabu/pdf-gate
```

> **Catatan**: bila Anda meng-clone repositori ini sendiri, `.npmrc` sudah tersedia di root repo (`@tutupharirabu:registry=https://npm.pkg.github.com`).

## 3. Quick Start — CLI

Setelah instalasi, binary `pdf-validate` tersedia di `node_modules/.bin`:

```bash
# Validasi ijazah
pdf-validate ./ijazah.pdf --schema ijazah

# Output JSON untuk CI/CD
pdf-validate ./doc.pdf --schema passport --json

# Quiet mode — hanya print status (exit code 1 jika FAILED)
pdf-validate ./doc.pdf --schema akte-kelahiran --quiet

# Skip Layer 2 (verifikasi kriptografis)
pdf-validate ./doc.pdf --schema sim --skip-crypto

# Daftar semua schema yang tersedia
pdf-validate --list-schemas
```

Untuk menjalankan tanpa install global: `npx pdf-validate ...` atau `node node_modules/.bin/pdf-validate ...`.

## 4. Quick Start — API

```js
import { validatePDF } from '@tutupharirabu/pdf-gate';
import { readFileSync } from 'node:fs';

const buffer = readFileSync('./ijazah.pdf');
const result = await validatePDF(buffer, { schema: 'ijazah' });

console.log(result.status); // 'VERIFIED' | 'PLAUSIBLE' | 'FAILED'
```

`validatePDF(buffer, options)` selalu mengembalikan `Promise<ValidationResult>` dan **tidak pernah melempar** untuk kegagalan validasi (kesalahan input seperti buffer bukan PDF / schema tidak ada tetap melempar — lihat [API Referensi](API-Referensi.md)).

## 5. Contoh Hasil Validasi Pertama (field nyata dari source)

Bentuk hasil dikembalikan persis seperti ini (lihat `src/types.js` — `ValidationResult`):

```js
{
  status: 'VERIFIED',              // 'VERIFIED' | 'PLAUSIBLE' | 'FAILED'
  schema: 'ijazah',                // nama schema yang dipakai
  fileName: 'ijazah.pdf',          // null jika tidak diisi via opsi fileName
  fileSizeKb: 24.5,                // ukuran file, 1 desimal
  pageCount: 1,
  totalDurationMs: 123.45,         // total wall-clock, 2 desimal
  timestamp: '2026-08-07T03:00:00.000Z', // ISO-8601
  failReason: null,                // pesan kegagalan, null jika VERIFIED

  layer1: {
    passed: true,
    detectedType: 'ijazah',        // tipe terdeteksi via fingerprint
    failReason: null,
    rules: [                       // hasil per-rule (RuleResult)
      {
        id: 'nama',
        label: 'Nama Mahasiswa',
        required: true,
        passed: true,
        found: 'Nama : Ahmad Fauzi Rahman' // snippet maks. 80 karakter
      }
    ],
    heuristics: {
      passed: true,
      wordCount: 142,
      flags: []                    // flag anomali layout (jika ada)
    },
    ocr: null,                     // metadata OCR, null jika tidak dijalankan
    durationMs: 8.2
  },

  layer2: {
    hasSignature: true,
    passed: true,
    issuer: 'CN=BSrE Test CA, O=BSrE, C=ID',
    issuedTo: 'CN=Kementerian Pendidikan',
    validFrom: '2024-01-01T00:00:00.000Z',
    validTo: '2027-01-01T00:00:00.000Z',
    certExpired: false,
    integrityOk: true,
    signedAt: '2026-07-15T02:00:00.000Z',
    failReason: null,
    durationMs: 34
  }
}
```

### Peta keputusan status (dari `src/index.js` — decision tree)

| Kondisi | `status` |
|---|---|
| Layer 1 gagal | `FAILED` (failReason dari Layer 1) |
| `skipLayer2: true` dan Layer 1 lolos | `PLAUSIBLE` |
| Layer 1 lolos, Layer 2 `passed` | `VERIFIED` |
| Layer 1 lolos, Layer 2 tanpa signature (`hasSignature: false`) | `PLAUSIBLE` |
| Layer 1 lolos, Layer 2 gagal (ada signature tapi tidak lolos) | `FAILED` |

## 6. Langkah Berikutnya

- [Penggunaan CLI](Penggunaan-CLI.md) — semua flag & contoh
- [API Referensi](API-Referensi.md) — seluruh permukaan API publik
- [Schema Dokumen](Schema-Dokumen.md) — 8 schema built-in + schema kustom
