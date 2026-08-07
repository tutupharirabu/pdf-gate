# 🔍 Layer 1 — Sanity Check

Layer 1 adalah *content sanity check*: memastikan isi dokumen **sesuai peruntukannya** — tipe yang benar, struktur yang wajar, dan field wajib terisi. Orkestratornya `runLayer1()` di `src/layer1/index.js`, menjalankan **4 gate berurutan** (per PRD §4.2); begitu satu gate gagal, eksekusi berhenti dan kegagalan dikembalikan.

```
Teks PDF (hasil ekstraksi / OCR)
   │
   ▼
Gate 1: Cek teks kosong / scan        → gagal? → FAILED
   ▼
Gate 2: Deteksi tipe via fingerprint   → gagal? → FAILED
   ▼
Gate 3: Heuristik struktur (kata+spasial) → gagal? → FAILED
   ▼
Gate 4: Validasi field rules           → hasil akhir
```

---

## Gate 1 — Deteksi Teks Kosong / Scan

*Inline di `src/layer1/index.js`.*

Jika teks hasil ekstraksi kurang dari 10 karakter non-spasi (`fullText.trim().length < 10`), dokumen dianggap scan/tanpa teks:

```js
failReason:
  'PDF tidak memiliki teks - kemungkinan hasil scan. ' +
  'Gunakan file PDF digital dari sistem penerbit.'
```

> Sebelum gate ini, `validatePDF()` di `src/index.js` sudah mencoba **OCR otomatis** bila teks pendek (lihat [OCR-Scan-PDF](OCR-Scan-PDF.md)). Jadi gate ini hanya kena bila OCR tidak dijalankan, gagal, atau tetap tidak menghasilkan teks.

## Gate 2 — Deteksi Tipe Dokumen (Fingerprint)

*`detectDocumentType()` di `src/layer1/detector.js`.*

- Uji setiap fingerprint RegExp dari schema terpilih terhadap teks penuh lewat `safeRegexTest()` (proteksi ReDoS: timeout 5s + 100-match limit).
- `safeRegexTest` hanya dieksekusi bila ukuran teks ≤ 1 MB (`MAX_FINGERPRINT_INPUT_SIZE`).
- Pola yang tampak malicious (nested quantifier, mis. `(a+)+`) di-skip oleh `isRegexMalicious()`.
- Jika jumlah cocok ≥ `fingerprintMin` → **passed**, `detectedType = schema.name`.
- Jika kurang, dilakukan **cross-detection**: semua schema lain diuji; bila ada yang cocok:

```js
failReason:
  'Dokumen terdeteksi sebagai "Ijazah", bukan "KTP" yang dipilih.'
```

- Jika tidak ada yang cocok:

```js
failReason:
  'Tipe dokumen tidak dikenali — dikenal: Ijazah, Transkrip Nilai, ... .'
```

Label human-readable dihasilkan `displayName()` (mapping 8 schema).

## Gate 3 — Heuristik Struktur

*`runHeuristics()` di `src/layer1/heuristic.js`.*

### 3a. Word count

`minWords`–`maxWords` dari `schema.heuristics`. Di luar rentang → gagal:

```js
failReason:
  'Jumlah kata (58) di luar rentang yang diharapkan (80-3000).'
```

### 3b. Distribusi spasial

Menggunakan `textItems` (array `{ str, x, y, page, width, height }` dari `parsePdf()`). Koordinat Y pdfjs-dist ber-origin **bottom-left**, jadi Y besar = visual atas, Y kecil = visual bawah. Item di-bucket per halaman, tinggi halaman diestimasi dari `max(y + height)`:

- Zona atas: `yNorm > 0.75`
- Zona bawah: `yNorm < 0.25`

Teks harus hadir di **atas DAN bawah** minimal satu halaman; jika tidak:

```js
failReason:
  'Distribusi teks spasial tidak valid - tidak ditemukan teks di zona atas (Y > 0.75) dan bawah (Y < 0.25).'
```

### 3c. Deteksi anomali (flag, bukan gagal)

Jika > 20 kata dan standar deviasi Y ternormalisasi < 0.05, ditambahkan flag:

```js
flags.push(
  'Distribusi Y mencurigakan seragam (stdDev=0.0123) - kemungkinan hasil scan/OCR.'
);
```

Flag ini **tidak** menggagalkan gate — hanya muncul di `layer1.heuristics.flags`.

## Gate 4 — Validasi Field Rules

*`validateFields()` di `src/layer1/validator.js`.*

- Setiap rule di `schema.rules` diuji dengan `safeExec()` (loop-based timeout 5s + `SAFE_MATCH_LIMIT` 100 + input cap 1 MB).
- Pola malicious → rule dianggap gagal; pola invalid/timeout → dicatat sebagai error/timeout.
- **Required** rule yang tidak cocok → gate gagal dengan daftar label:

```js
failReason:
  'Kolom wajib tidak ditemukan: Nama Mahasiswa, NIM, Program Studi'
```

- **Optional** rule yang tidak cocok → hanya tercatat di `rules[]` (tidak menggagalkan).
- Hasil tiap rule adalah `RuleResult` `{ id, label, required, passed, found }` dengan `found` berupa snippet hasil match (maks. 80 karakter, di-truncate).

## Hasil Layer 1

```js
{
  passed: boolean,
  detectedType: string | null,
  failReason: string | null,
  rules: RuleResult[],
  heuristics: { passed: boolean, wordCount: number, flags: string[] },
  ocr: OcrResult | null,   // ditambahkan oleh validatePDF() — lihat OCR
  durationMs: number
}
```

## Catatan Keamanan (dari source)

- Semua eksekusi regex di Layer 1 melewati proteksi ReDoS: pre-check di `validatePDF()` (setiap rule diuji dengan `safeRegexTest(pattern, 'SAFE_PROBE_STRING', 1000)`), `isRegexMalicious()` untuk pola bersarang, dan input-size caps (1 MB).
- **Keterbatasan yang didokumentasikan di source**: timeout hanya ditegakkan *di antara* panggilan `exec()`. Satu `exec()` yang catastrophic-backtracking pada regex non-global akan memblokir event loop sampai selesai dan baru dilaporkan `timedOut`; isolasi penuh butuh Worker threads.

## Lihat Juga

- [Schema Dokumen](Schema-Dokumen.md) — sumber `fingerprints`, `heuristics`, `rules`
- [OCR-Scan-PDF](OCR-Scan-PDF.md) — teks OCR masuk ke pipeline ini
- [Keamanan](Keamanan.md) — detail proteksi ReDoS
