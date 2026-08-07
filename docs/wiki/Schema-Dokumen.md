# 📋 Schema Dokumen

Schema mendefinisikan *seperti apa* dokumen yang valid: fingerprint untuk deteksi tipe, heuristik kata, dan daftar field yang harus cocok. Semua schema (built-in + kustom) hidup di registry `SCHEMAS` (`src/schemas/index.js`).

---

## Bentuk Object Schema

```js
{
  name: 'ijazah',              // string — identifier unik
  label: 'Ijazah',             // string — label human-readable
  fingerprints: [RegExp, ...], // array RegExp — penanda tipe dokumen
  fingerprintMin: 2,           // number >= 1 — minimal fingerprint yang cocok untuk klaim deteksi
  heuristics: { minWords: 30, maxWords: 800 }, // rentang jumlah kata
  rules: [                     // array aturan field
    {
      id: 'nama',
      label: 'Nama Mahasiswa',
      pattern: /Nama\s*(:|\s{2,})\s*(.+)/i,  // RegExp (string juga didukung, auto-parse)
      required: true
    }
  ]
}
```

Validasi saat registrasi (`validateSchema()`):
- `name` non-empty string; `fingerprints` non-empty; `fingerprintMin >= 1` dan ≤ panjang fingerprints.
- `rules` non-empty; tiap rule punya `id`/`label` non-empty, `pattern` (RegExp **atau** string), `required` boolean.
- `heuristics.minWords`/`maxWords` angka dan `minWords <= maxWords`.

## 8 Schema Built-in

Semua definisi ada di `src/schemas/*.js` (per PRD §5). Nama built-in **immutable** — tidak bisa di-unregister atau ditimpa.

### 🎓 Pendidikan

| Schema | File | fingerprintMin | min–max kata | Field wajib (required) |
|---|---|---|---|---|
| `ijazah` — Ijazah | `ijazah.js` | 2 | 30–800 | Nama, NIM, Program Studi, Tanggal Kelulusan, Perguruan Tinggi, Pejabat Penandatangan |
| `transkrip` — Transkrip Nilai | `transkrip.js` | 2 | 80–3000 | Nama, NIM, IPK, SKS, Mata Kuliah, Nilai, Perguruan Tinggi |
| `sertifikat` — Sertifikat | `sertifikat.js` | 2 | 20–600 | Nama Peserta, Judul Program, Tanggal Penerbitan, Lembaga Penerbit |

### 🏛️ Kependudukan

| Schema | File | fingerprintMin | min–max kata | Field wajib (required) |
|---|---|---|---|---|
| `ktp` — KTP Digital | `ktp.js` | 2 | 15–200 | NIK (16 digit), Nama, Tempat/Tanggal Lahir, Alamat, Agama |
| `kk` — Kartu Keluarga | `kk.js` | 2 | 25–500 | Nomor KK (16 digit), Kepala Keluarga, Alamat, Anggota Keluarga |
| `akte-kelahiran` — Akte Kelahiran | `akte-kelahiran.js` | 2 | 20–300 | Nama Bayi, Tempat Lahir, Tanggal Lahir, Nama Ayah, Nama Ibu, Nomor Akte |

### 🪪 Identitas

| Schema | File | fingerprintMin | min–max kata | Field wajib (required) |
|---|---|---|---|---|
| `sim` — SIM | `sim.js` | 2 | 12–150 | Nama, Nomor SIM (12 digit), Tempat Lahir, Tanggal Lahir, Alamat, Golongan Darah |
| `passport` — Paspor | `passport.js` | 2 | 15–200 | Nomor Paspor, Nama, Kewarganegaraan, Tempat Lahir, Tanggal Lahir, Masa Berlaku |

> Contoh fingerprint `ijazah`: `/\bijazah\b/i`, `/dinyatakan\s+lulus/i`, `/\bgelar\b/i`, `/\b(sarjana|ahlimadya|diploma)\b/i`, `/telah\s+menyelesaikan/i`. Karena `fingerprintMin = 2`, minimal **2** dari pola itu harus cocok agar tipe terdeteksi.

## Kategori Schema

`src/schemas/category-map.js` — `CATEGORY_MAP` dan helper `getSchemasByCategory()`:

```js
import { getSchemasByCategory } from '@tutupharirabu/pdf-gate/schemas';

getSchemasByCategory('PENDIDIKAN');    // ['ijazah', 'transkrip', 'sertifikat']
getSchemasByCategory('KEPENDUDUKAN');  // ['ktp', 'kk', 'akte-kelahiran']
getSchemasByCategory('IDENTITAS');     // ['ktp', 'sim', 'passport']
getSchemasByCategory('SEMUA');         // semua 8 schema
```

(KTP masuk ke KEPENDUDUKAN dan IDENTITAS sekaligus.)

## Schema Kustom

### 1. JSON — pakai string `"/pattern/flags"`

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

### 2. JavaScript ESM — native RegExp

```js
export default {
  name: 'surat-keterangan',
  label: 'Surat Keterangan',
  fingerprints: [/surat\s+keterangan/i, /yang\s+bertanda\s+tangan/i],
  fingerprintMin: 2,
  heuristics: { minWords: 20, maxWords: 300 },
  rules: [{ id: 'nomor', label: 'Nomor', pattern: /nomor\s*:\s*.+/i, required: true }],
};
```

### 3. Registrasi programatik

```js
import { registerSchema, validatePDF } from '@tutupharirabu/pdf-gate';
registerSchema({ name: 'skck', /* ... */ });
const result = await validatePDF(buffer, { schema: 'skck' });
```

### 4. Load dari file (CLI / API)

```bash
# CLI: file JSON dan JS didukung, repeatable
pdf-validate ./doc.pdf --schema skck --schema-file ./skck.json
```

```js
// API
await loadSchemaFromFile('./skck.json');   // otomatis register
await loadSchemaFromFile('./custom.js');   // export default schema
```

File contoh siap pakai di repo: `examples/skck.json`, `examples/surat-tanah.json`, `examples/custom-schema.js`.

## Auto-Generate Schema

Buat schema otomatis dari PDF template institusi:

```bash
pdf-validate --generate-schema ./template.pdf \
  --schema-name dokumen-baru \
  --schema-label "Dokumen Baru" \
  --output ./dokumen-baru.json
```

Engine mendeteksi **4 pola layout**: colon-separated, tabular/box, stacked label-value, header key-value — lalu membangun rules, fingerprints (top 5 n-gram + ALL-CAPS, maks 8), heuristics (±30%), dan confidence score. Lihat [API Referensi → Generator Schema](API-Referensi.md).

## Lihat Juga

- [Layer 1 — Sanity Check](Layer-1-Sanity-Check.md) — bagaimana schema dipakai saat validasi
- [API Referensi](API-Referensi.md) — `registerSchema`, `resolveSchema`, `loadSchemaFromFile`
