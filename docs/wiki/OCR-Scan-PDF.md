# 🤖 OCR untuk PDF Scan

Dukungan OCR untuk dokumen PDF hasil scan — **tesseract.js v6 (WASM)**, bahasa **Indonesia + Inggris**, **fully local** (zero network — zero-trust tetap terjaga).

---

## Arsitektur

Pipeline OCR (`src/ocr/`):

```
PDF buffer
   │
   ▼
src/ocr/index.js      — orkestrator: keputusan trigger, page-limit guard, timing, metadata
   │  rasterizePdf()  ── src/ocr/rasterizer.js
   │                    pdfjs-dist → @napi-rs/canvas → PNG per halaman (RENDER_SCALE 2x)
   │  recognizeImages() ── src/ocr/engine.js
   │                    tesseract.js (WASM worker) + traineddata ind+eng (bundled)
   ▼
teks gabungan (ind+eng)
   │
   ▼
Layer 1 — fingerprint → heuristics → field rules (identik dengan PDF digital)
```

### `src/ocr/rasterizer.js`

- Render tiap halaman dengan `pdfjs-dist` + `@napi-rs/canvas` (keduanya di-import **lazy** saat OCR benar-benar berjalan).
- `RENDER_SCALE = 2` (2x = akurasi OCR lebih tinggi), per-halaman timeout 20s, load dokumen 30s.
- Standard fonts (Helvetica/Times/Courier/Symbol) di-bundle di `src/ocr/standard_fonts/` dan disajikan via **patched `fetch`** yang menolak semua URL non-`file://` — defense-in-depth: pdfjs tidak akan pernah menyentuh jaringan saat OCR.
- Patching `fetch`/`Path2D` bersifat global dan di-refcount (`patchDepth`) agar panggilan `rasterizePdf()` konkuren saling aman.

### `src/ocr/engine.js`

- `ENGINE_ID = 'tesseract.js'`; versi dilaporkan dinamis (mis. `tesseract.js@6.0.1`).
- Core WASM dipin ke build **SIMD** (`tesseract.js-core/tesseract-core-simd.wasm.js`) — build `relaxedsimd` gagal link pada sebagian runtime Node (issue `DotProductSSE`).
- Traineddata `ind` + `eng` di-bundle di `src/ocr/traineddata/` (Apache-2.0, dari `tesseract-ocr/tessdata_best`), dimuat lewat `langPath` lokal; `gzip: false` (tidak dikompres); `cachePath: tmpdir()` agar file cache tidak jatuh ke CWD project.
- Worker di-`terminate()` di blok `finally`.

## Kapan OCR Dijalankan (trigger logic, dari `src/index.js`)

```js
const shouldAutoOcr = fullText.trim().length < 10 && pageCount <= ocrPageLimit;

if (safeOptions.ocr === true || shouldAutoOcr) {
  // jalankan runOcr()
}
```

- **Auto** (default): OCR berjalan **hanya** bila PDF tidak punya teks yang bisa diekstrak (< 10 karakter) **dan** jumlah halaman ≤ `ocrPageLimit` (default 10).
- **Paksa** (`ocr: true`): OCR berjalan meskipun ada teks; `pageLimit` di-set `0` yang berarti **semua halaman** di-render (`rasterizePdf` memperlakukan `pageLimit <= 0` sebagai "all pages").
- Bahasa default `DEFAULT_OCR_LANGUAGES = ['ind', 'eng']`.

## Hasil OCR → Layer 1

Teks hasil OCR menggantikan teks ekstraksi sebagai input `runLayer1()` — fingerprint, heuristics, dan field rules memakainya persis seperti teks PDF digital. Metadata OCR disimpan di `layer1.ocr`:

```js
layer1.ocr: {
  used: true,
  engine: 'tesseract.js@6.0.1',
  languages: ['ind', 'eng'],
  confidence: 0.92,        // rata-rata, 0-1, dibulatkan 4 desimal
  durationMs: 1843,
  pages: 2,
  charCount: 2410,
  error: null              // string pesan error bila OCR gagal
}
```

`layer1.ocr === null` bila OCR tidak pernah dijalankan.

## Error Containment (kegagalan tidak pernah menggagalkan dokumen)

Dari `src/index.js`: jika `runOcr()` melempar, error **ditangkap**, dicatat di `layer1.ocr.error`, dan validasi **dilanjutkan dengan teks asli** (yang biasanya gagal Gate 1 Layer 1 dengan pesan "tidak memiliki teks"). Dokumen tidak pernah gagal *karena* OCR gagal — kegagalannya transparan. (Diuji di `test/ocr-failure.test.js` dengan engine di-mock.)

## CLI

```bash
# Auto: OCR hanya jika PDF tanpa teks yang bisa diekstrak
pdf-validate ./scan.pdf --schema ijazah

# Paksa OCR + bahasa kustom
pdf-validate ./scan.pdf --schema ijazah --ocr --ocr-langs ind,eng
```

## API

```js
const result = await validatePDF(buffer, {
  schema: 'ktp',
  ocr: true,                    // paksa OCR meskipun ada teks
  ocrLanguages: ['ind', 'eng'], // bahasa tesseract
  ocrPageLimit: 10,             // max halaman untuk OCR otomatis
});
```

## Ukuran & Performa

- Core validation tetap **< 50 KB** — tesseract.js, `@napi-rs/canvas`, traineddata semuanya **lazy-loaded** (dynamic import), tidak pernah dibayar oleh pengguna validasi digital saja.
- Dengan OCR diaktifkan, ukuran paket naik ke **±50 MB** karena traineddata `ind` + `eng` di-bundle.

## Batasan

- OCR hanya untuk **Layer 1** — Layer 2 (kriptografi) bekerja pada byte PDF dan tidak memakai teks OCR (lihat [Layer-2-Verifikasi-Kriptografis](Layer-2-Verifikasi-Kriptografis.md)).
- Tidak ada barcode/QR decoding, tidak ada image enhancement (deskew/denoise) di luar rasterisasi.
- Tidak ada provider OCR cloud — semuanya lokal.
- Bahasa terbatas pada yang di-bundle: `ind`, `eng` (traineddata eksternal tidak diunduh otomatis).

## Lihat Juga

- [Layer 1 — Sanity Check](Layer-1-Sanity-Check.md) — pipeline yang menerima teks OCR
- [Penggunaan CLI](Penggunaan-CLI.md) — flag `--ocr`, `--ocr-langs`
- [Keamanan](Keamanan.md) — zero-trust network guard saat OCR
