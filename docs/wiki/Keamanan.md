# 🛡️ Keamanan

Postur **Zero Trust** pdf-gate: tidak ada kepercayaan pada input, tidak ada jaringan, tidak ada akses di luar yang diizinkan. Implementasi tersebar di `src/utils/sanitizer.js`, `src/utils/zero-trust.js`, `src/layer1/validator.js`, `src/layer1/detector.js`, `src/ocr/rasterizer.js`, dan `cli/index.js`.

---

## Ringkasan Mekanisme

| Mekanisme | Lokasi | Deskripsi |
|---|---|---|
| **No Network** | `zero-trust.js`, `ocr/rasterizer.js`, `pdf-parser.js` | Zero network request — semua pemrosesan lokal. Patched `fetch` menolak semua URL non-`file://` saat OCR. |
| **Input Sanitization** | `sanitizer.js` | Prototype pollution guard + max buffer 100 MB + sparse length check. |
| **ReDoS Protection** | `sanitizer.js`, `layer1/validator.js`, `layer1/detector.js` | Timeout 5 s + 100-match limit per regex + deteksi pola malicious + input size cap. |
| **Buffer Zeroing** | `zero-trust.js` (`zeroBuffer`) | Hapus data sensitif dari memori setelah dipakai. |
| **Path Traversal Guard** | `sanitizer.js` (`isSafeFilePath`), `schemas/index.js` (`loadSchemaFromFile`) | Blokir `..`, null bytes; batasi path schema pada allowed root. |
| **Safe Regex** | `layer1/validator.js` (`isRegexMalicious`) | Deteksi pola nested quantifiers / alternation ambigu. |

## 1. No Network (Zero Network Requests)

- `parsePdf()` (`src/utils/pdf-parser.js`) men-set `standardFontDataUrl: ''` sehingga pdfjs-dist **tidak pernah** melakukan fetch font keluar; warning konsol tentang `standardFontDataUrl` adalah ekspektasi dan tidak berbahaya (teks ekstraksi tidak butuh font).
- OCR: traineddata di-bundle lokal (`src/ocr/traineddata/`), core WASM di-resolve dari paket, `langPath` menunjuk direktori lokal, dan patched `fetch` hanya melayani `file://` di dalam folder `standard_fonts/` — selain itu **ditolak** (`'OCR zero-trust: blokir request non-lokal (bukan file://).'`).
- `assertNoNetwork()` (`zero-trust.js`): diagnostik via `process._getActiveHandles()` — mendeteksi Socket/TLSSocket/ClientRequest/Server/TCP. CLI memanggilnya dan memberi peringatan bila ada koneksi aktif. (`_getActiveHandles()` undocumented; fungsi degradasi dengan aman bila API tidak tersedia.)
- `validateDependencies()`: inspeksi module cache untuk modul jaringan (`http`, `https`, `net`, `tls`, `dgram`) yang dimuat saat import — best-effort statis.

## 2. Input Sanitization (`src/utils/sanitizer.js`)

- `sanitizeBuffer(buffer)`:
  - tipe harus `Buffer`/`Uint8Array` (selain itu `TypeError`),
  - tolak key `__proto__` / `constructor` / `prototype` pada objek buffer (prototype pollution),
  - tolak panjang NaN/negatif (sparse),
  - tolak > `MAX_BUFFER_SIZE` (100 MB),
  - tolak buffer kosong (0 bytes).
- `sanitizeOptions(options)`: tolak key terlarang, lalu **whitelist** — hanya `schema`, `skipLayer2`, `fileName`, `trustedIssuers`, `ocr`, `ocrLanguages`, `ocrPageLimit` yang disalin. Kunci lain dibuang.
- `validatePDF()` menambah guard eksplisit pada `options.schema` (object) terhadap key `__proto__`/`constructor`/`prototype`.

## 3. ReDoS Protection

Lima lapis:

1. **Pre-check saat `validatePDF()`** (`src/index.js`): setiap `rule.pattern` diuji dengan `safeRegexTest(pattern, 'SAFE_PROBE_STRING', 1000)` — timeout 1 s saat pre-check → ditolak: *"Pola regex untuk aturan "X" mencurigakan (timeout saat pre-check). Tolak demi keamanan."*
2. **`safeRegexTest()`** (`sanitizer.js`): loop-based, wall-clock timeout (default 5000 ms) + `SAFE_MATCH_LIMIT = 100` + zero-length match guard.
3. **`safeExec()`** (`layer1/validator.js`): `MAX_EXEC_TIME = 5000` ms, `SAFE_MATCH_LIMIT = 100`, `MAX_INPUT_SIZE = 1 MB`, zero-length match guard, dan timeout final setelah exec terakhir.
4. **`isRegexMalicious()`** (`layer1/validator.js`): flag pola `(a+)+`, `(a*)*`, `(a+)*`, `(a|a)+`, `(a|aa)*` (nested quantifier / alternation ambigu) — di-skip sebelum eksekusi.
5. **Input size caps**: fingerprint dan field validation melewati regex bila teks > 1 MB (pesan *"Teks PDF terlalu besar (...) melebihi batas 1024 KB. Validasi regex dilewati demi keamanan."*).

> **Keterbatasan yang didokumentasikan di source**: timeout hanya ditegakkan *di antara* panggilan `exec()`. Satu `exec()` catastrophic-backtracking pada regex non-global memblokir event loop sampai selesai (dilaporkan `timedOut` setelahnya). Isolasi penuh membutuhkan Worker threads.

## 4. Buffer Zeroing (`zeroBuffer`)

- `zeroBuffer(buffer)` (`zero-trust.js`): `fill(0)` pada `Buffer` maupun `Uint8Array`; melewati buffer yang ArrayBuffer-nya sudah detached (sudah aman); best-effort dengan try/catch.
- Dipakai di: CLI (`cli/index.js` — blok `finally` setelah validasi & generate), demo server (`demo/server.js` — setelah validasi dan saat path error).

## 5. Path Traversal Guard

- `isSafeFilePath(path)` (`sanitizer.js`): tolak non-string, null bytes (`\0`), dan kehadiran `..` / `../` / `..\\`. CLI memakainya untuk file PDF, `--schema-file`, template, dan output `--generate-schema` (test: `test/../some-file.pdf` → `Akses ditolak`).
- `loadSchemaFromFile()` (`schemas/index.js`): batasi path pada `options.allowedRoot` (default `process.cwd()`); path keluar root → ditolak. File `.js` di-load via dynamic `import()` yang **mengeksekusi kode** — hanya muat file tepercaya; CLI sengaja melewatkan `{ allowedRoot: null }` untuk path operator.

## 6. Batas Ekstraksi Parser (`src/utils/pdf-parser.js`)

- Timeout load dokumen 30 s, timeout per halaman 15 s.
- `MAX_PAGES = 200` — dokumen lebih banyak → *"Document exceeds the maximum allowed page count (200). Reject for security..."*
- `MAX_ITEMS = 100_000` — *"Document exceeds the maximum allowed text item count (100000)..."*
- Pesan error korup/enkripsi diklasifikasikan dan disampaikan verbatim (katalog error PRD §9).

## 7. Konteks Aman & Flag Global

- `createSecureContext(props)` (`zero-trust.js`): object `null`-prototype yang di-`Object.freeze` — tidak ada method inherited, tidak bisa dimutasi.
- `ZERO_TRUST_MODE = true`: konstanta ekspor sebagai penanda mode zero-trust.
- `validateDependencies()` — lihat §1.

## Referensi Audit

Temuan keamanan historis didokumentasikan di [`docs/audit-report.md`](../audit-report.md) (40+ temuan, fase perbaikan). Catatan yang relevan untuk postur saat ini:

- **#3 (global `unhandledRejection`) & #4 (`timingSafeEqual` dead code)** — sudah dihapus dari `src/index.js` versi sekarang; `types.js` (#5) sudah sinkron dengan runtime (`status`/`passed`/`durationMs`).
- **#6 (`safeExec` ReDoS)** — kini ada pre-check 1 s + `isRegexMalicious()` + input caps sebagai mitigasi berlapis; keterbatasan isolasi worker tetap didokumentasikan di source.
- **#7 (Layer 2 field reading)** — diperbaiki: mapping baca dari `sig.verified`/`sig.integrity` dengan fallback flat API.
- **#11 (dead modules)** — `zeroBuffer`, `assertNoNetwork`, `isSafeFilePath` kini di-wire ke CLI/demo dan diekspor.
- **#12 (off-by-one `loadSchemaFromFile`)** — guard saat ini memakai `rel.startsWith('..') || path.isAbsolute(rel)`, sehingga path tepat di root diperbolehkan.
- **#15 (arbitrary code execution via `.js`)** — tetap ada secara desain untuk file operator tepercaya; dibatasi oleh `allowedRoot` pada pemakaian API.
- **#19 (CLI file size)** — CLI kini memeriksa ukuran file (`MAX_BUFFER_SIZE`) sebelum `readFileSync`.
- **#30 (`.DS_Store`)** — `.gitignore` dan `.npmignore` mengecualikan `.DS_Store`.

## Praktik untuk Pengguna

- Hanya beri makan file yang tepercaya ke `--schema-file *.js` (kode dieksekusi).
- Tetapkan `trustedIssuers` untuk CA pinning bila memverifikasi dokumen berisiko tinggi (lihat [Layer-2-Verifikasi-Kriptografis](Layer-2-Verifikasi-Kriptografis.md)).
- Jangan matikan pemeriksaan keamanan di produksi; `--skip-crypto` hanya untuk skenario sanity-check murni.
- Jalankan `npm audit` di pipeline Anda; repo menetapkan `overrides` untuk `node-forge` dan `brace-expansion` (lihat `package.json`).

## Lihat Juga

- [Layer 1 — Sanity Check](Layer-1-Sanity-Check.md) — detail proteksi ReDoS di gate
- [API Referensi](API-Referensi.md) — ekspor utilitas zero-trust
- [Penggunaan CLI](Penggunaan-CLI.md) — guard keamanan di CLI
