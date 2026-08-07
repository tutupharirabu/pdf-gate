# 🛠️ Penggunaan CLI

Dokumentasi lengkap binary `pdf-validate` (didefinisikan di `cli/index.js` menggunakan `commander` + `picocolors`).

---

## Sintaks

```bash
pdf-validate <file> [options]
```

## Perintah & Mode

### 1. Validasi (default)

```bash
pdf-validate ./ijazah.pdf --schema ijazah
```

Membaca file PDF, menjalankan Layer 1 + Layer 2, lalu mencetak laporan. Ada tiga mode output:

| Mode | Flag | Perilaku |
|---|---|---|
| Pretty print | *(default)* | Laporan berwarna (picocolors) dengan status, layer, rules, detail signature |
| JSON | `--json` | Hasil lengkap sebagai JSON (2-space indent). RegExp diserialisasi via `toString()` |
| Quiet | `-q, --quiet` | Hanya print satu baris status (`VERIFIED` / `PLAUSIBLE` / `FAILED`) |

### 2. List schemas

```bash
pdf-validate --list-schemas
```

Menampilkan semua schema terdaftar (built-in + kustom) dan totalnya. Tidak membutuhkan argumen `file`.

### 3. Generate schema dari template PDF

```bash
pdf-validate --generate-schema ./template.pdf \
  --schema-name dokumen-baru \
  --schema-label "Dokumen Baru" \
  --output ./dokumen-baru.json
```

Mendeteksi field-value dengan **4 pola layout** (colon-separated, tabular/box, stacked label-value, header key-value), lalu:
- menampilkan ringkasan (name, label, confidence, jumlah fields/rules/fingerprints),
- mendaftarkan schema tersebut ke registry (dapat langsung dipakai `--schema dokumen-baru`),
- menyimpan ke file JSON bila `--output` diberikan (file existing akan di-overwrite dengan peringatan).

> `--schema-name` dan `--schema-label` **wajib** saat `--generate-schema` digunakan.

## Daftar Flag Lengkap

| Flag | Alias | Deskripsi |
|---|---|---|
| `--schema <name>` | `-s` | Nama schema (built-in atau kustom). **Wajib** untuk validasi. |
| `--schema-file <path...>` | `-f` | Load schema eksternal dari file `.json` / `.js` (repeatable — bisa beberapa file). |
| `--json` | | Output sebagai JSON. |
| `--quiet` | `-q` | Hanya print status; exit code 1 jika FAILED. |
| `--skip-crypto` | | Skip Layer 2 (verifikasi kriptografis). |
| `--skip-layer2` | | Alias dari `--skip-crypto`. |
| `--ocr` | | Paksa OCR meskipun PDF punya teks yang bisa diekstrak. |
| `--ocr-langs <codes>` | | Kode bahasa tesseract dipisah koma (default: `ind,eng`). |
| `--list-schemas` | | Tampilkan semua schema tersedia. |
| `--generate-schema <file>` | | Generate schema dari template PDF. |
| `--schema-name <name>` | | Nama untuk generated schema. |
| `--schema-label <label>` | | Label human-readable untuk generated schema. |
| `--output <path>` | `-o` | Simpan generated schema ke file JSON. |
| `--version` | `-V` | Tampilkan versi paket (dibaca dari `package.json` oleh commander). |
| `--help` | `-h` | Bantuan. |

## Exit Codes

| Kode | Arti |
|---|---|
| `0` | `VERIFIED` atau `PLAUSIBLE` |
| `1` | `FAILED` atau error (file tidak ditemukan, schema tidak valid, path tidak aman, dst.) |

`process.exitCode` di-set dari `result.status === 'FAILED'`, jadi pipeline CI bisa langsung bergantung pada exit code.

## Contoh Lengkap

```bash
# Validasi KTP dengan output JSON
pdf-validate ./ktp.pdf --schema ktp --json

# Validasi Kartu Keluarga (quiet)
pdf-validate ./kk.pdf --schema kk --quiet

# Validasi scan SIM dengan OCR otomatis (bahasa default ind,eng)
pdf-validate ./scan-sim.pdf --schema sim

# Paksa OCR + bahasa kustom
pdf-validate ./scan.pdf --schema ijazah --ocr --ocr-langs ind,eng

# Skip verifikasi kriptografis (hanya sanity check)
pdf-validate ./doc.pdf --schema transkrip --skip-crypto

# Pakai schema eksternal (JSON + JS, keduanya didaftarkan)
pdf-validate ./doc.pdf --schema skck-polres --schema-file ./examples/skck.json
pdf-validate ./doc.pdf --schema surat-keterangan --schema-file ./examples/custom-schema.js

# Generate schema dari template
pdf-validate --generate-schema ./template.pdf --schema-name sp2dk --schema-label "Surat SP2DK"
```

## Keamanan yang Diterapkan CLI (dari `cli/index.js`)

- **Path traversal guard** — `isSafeFilePath()` memblokir path mengandung `..`, null byte, dsb. (test: `test/../some-file.pdf` ditolak).
- **Ukuran file** — file > `MAX_BUFFER_SIZE` (100 MB) ditolak sebelum dibaca.
- **Network check** — `assertNoNetwork()` memperingatkan bila ada koneksi jaringan aktif.
- **Buffer zeroing** — buffer PDF di-nol-kan via `zeroBuffer()` setelah validasi/generate selesai (dalam blok `finally`).
- **`--schema-file .js`** dieksekusi via dynamic import — hanya muat file dari operator tepercaya (CLI melewatkan `{ allowedRoot: null }`).

## Catatan Implementasi

- Flag `--ocr` / `--ocr-langs` hanya diteruskan ke library bila **eksplisit** diberikan — jika tidak, library memakai default auto-trigger (OCR hanya berjalan saat PDF tanpa teks dan jumlah halaman ≤ `ocrPageLimit`).
- Output JSON men-serialisasi field RegExp menjadi string (`/(?:...)/i`) agar aman untuk JSON.
- Mode quiet dan JSON juga men-set `process.exitCode` berdasarkan status.

## Lihat Juga

- [Memulai](Memulai.md) — quick start
- [API Referensi](API-Referensi.md) — versi programatik dari semua perilaku di atas
- [Layer 1 — Sanity Check](Layer-1-Sanity-Check.md) — apa yang terjadi saat validasi berjalan
