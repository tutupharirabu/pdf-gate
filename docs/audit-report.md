# 🔍 Audit Report — pdf-gate (Final)

> Pemetaan lengkap semua masalah yang ditemukan, diurutkan berdasarkan prioritas.
> Total: **40+ temuan** dari review source code, CLI, test, dan konfigurasi.

---

## 🔴 Critical — Harus diperbaiki segera (9 items)

### 1. Missing `label` property pada 3 schema
**File:** [akte-kelahiran.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/src/schemas/akte-kelahiran.js), [sim.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/src/schemas/sim.js), [passport.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/src/schemas/passport.js)

Tiga schema tidak punya property `label` yang dijanjikan README. Ini menyebabkan CLI menampilkan nama raw (`akte-kelahiran`) alih-alih label human-readable (`Akte Kelahiran`).

### 2. `require('crypto')` di project ESM — akan crash saat dipanggil
**File:** [src/index.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/src/index.js#L68-L74)

Project menggunakan `"type": "module"` tapi ada `require('crypto')` di dalam `timingSafeEqual()`. Meskipun saat ini dead code (#4), kalau dipanggil akan throw `ReferenceError: require is not defined`. Harus pakai `import('node:crypto')`.

### 3. Global `unhandledRejection` handler — library TIDAK boleh melakukan ini
**File:** [src/index.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/src/index.js#L262-L277)

Library code men-register global `process.on('unhandledRejection')` yang **silently swallows errors** di production mode. Ini:
- Side effect yang aktif saat module di-import
- Bisa menyembunyikan bug di consumer code
- Melanggar prinsip library yang baik

> [!CAUTION]
> Ini bisa menyebabkan bug yang sangat sulit di-debug pada consumer. **Hapus sepenuhnya.**

### 4. `timingSafeEqual()` — dead code yang tidak pernah dipanggil
**File:** [src/index.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/src/index.js#L53-L78)

Fungsi ini didefinisikan tapi tidak pernah digunakan di manapun. JSDoc bilang "Uses double HMAC approach" tapi implementasi langsung pakai `crypto.timingSafeEqual`. Dead code + misleading docs.

### 5. `types.js` tidak sinkron dengan runtime — typedef salah total
**File:** [src/types.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/src/types.js)

| Property di types.js | Property yang benar di runtime |
|---|---|
| `ValidationResult.valid` | `status` (string tri-state) |
| `Layer1Result.valid` | `passed` |
| `Layer2Result.valid` | `passed` |
| `Layer2Result.duration` | `durationMs` |
| `ValidateOptions.schemaId` | `schema` |
| `ValidateOptions.layer2` | `skipLayer2` |

File ini tampaknya dari desain awal dan **tidak pernah diupdate**.

### 6. `safeExec()` ReDoS protection tidak efektif
**File:** [src/layer1/validator.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/src/layer1/validator.js#L73-L99)

Timeout check `Date.now() - startTime > MAX_EXEC_TIME` dilakukan **SETELAH** `regex.exec()` selesai. Kalau regex catastrophic backtracking, `exec()` memblokir event loop sepenuhnya dan timeout check tidak pernah dieksekusi sampai regex selesai. **Tidak ada real protection.**

Juga: `SAFE_MATCH_LIMIT = 100` dideklarasikan tapi tidak pernah digunakan di file ini.

### 7. Layer 2 membaca field dari object yang salah (verify-pdf 1.x)
**File:** [src/layer2/index.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/src/layer2/index.js#L88-L89)

Setelah normalize signatures ke array dan extract `sig = signatures[0]`, kode baca `verifyOutput.verified` dan `verifyOutput.integrity` (top-level) alih-alih `sig.verified` dan `sig.integrity`. Untuk verify-pdf 1.x API, field ini ada di tiap signature object, bukan di top-level. `passed` dan `integrityOk` bisa `undefined`.

### 8. Node.js version mismatch
**File:** [package.json](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/package.json#L9) vs [README.md](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/README.md#L31)

| Sumber | Versi |
|--------|-------|
| `package.json` engines | `>= 22.0.0` |
| README teks + badge | `>= 20.0.0` |

### 9. `getAllSchemas()` return mutable Map
**File:** [src/schemas/index.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/src/schemas/index.js)

`getSchema()` return clone via `structuredClone()` (✅), tapi `getAllSchemas()` return Map asli. Caller bisa bypass `registerSchema()` guards dan merusak registry.

---

## 🟠 Significant — Bug / masalah serius (6 items)

### 10. `displayName()` hanya cover 4 dari 8 schema
**File:** [src/layer1/detector.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/src/layer1/detector.js#L16-L24)

Lookup table hanya map `ijazah`, `transkrip`, `sertifikat`, `ktp`. Schema `akte-kelahiran`, `sim`, `passport`, `kk` akan tampil sebagai raw name. Error message line 67 juga hardcode hanya 4 tipe dokumen.

### 11. Dead modules yang tidak pernah digunakan
Beberapa module ditulis tapi **tidak pernah di-import** oleh file manapun:

| Module | File | Fungsi |
|--------|------|--------|
| `zeroBuffer()`, `assertNoNetwork()`, dll | [zero-trust.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/src/utils/zero-trust.js) | Security features |
| `createLogger()` | [logger.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/src/utils/logger.js) | Logging |
| `lightweightTextExtract()` | [lightweight-detector.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/src/utils/lightweight-detector.js) | Fallback parser |
| `isSafeFilePath()` | [sanitizer.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/src/utils/sanitizer.js#L192) | Path check |

README mengklaim "Buffer Zeroing" dan "lightweight fallback parser" tapi keduanya tidak pernah di-wire.

### 12. `loadSchemaFromFile()` path guard — off-by-one bug
**File:** [src/schemas/index.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/src/schemas/index.js#L228)

Kondisi `rel === ''` menolak file yang path-nya sama persis dengan `allowedRoot`. `path.relative('/root', '/root')` return `''`, jadi file di root directory itu sendiri akan ditolak.

### 13. PDF parser text join tanpa separator — kata menempel
**File:** [src/utils/pdf-parser.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/src/utils/pdf-parser.js#L175)

`textParts.join('')` menggabungkan text items tanpa separator. Hasilnya `"NamaIrfan"` bukan `"Nama Irfan"`. Word boundaries hilang dan bisa merusak semua regex matching di Layer 1.

### 14. `withTimeout()` timer tidak pernah di-clear saat sukses
**File:** [src/utils/pdf-parser.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/src/utils/pdf-parser.js#L211-L218)

`setTimeout` tidak di-clear saat promise resolve sukses. Timer tetap aktif di event loop sampai 30 detik, mencegah process exit yang bersih (ini alasan `--forceExit` diperlukan di Jest).

### 15. `loadSchemaFromFile()` dengan `.js` — arbitrary code execution
**File:** [src/schemas/index.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/src/schemas/index.js#L262)

Dynamic `import(absPath)` mengeksekusi arbitrary JavaScript. CLI melewatkan `{ allowedRoot: null }` yang **menonaktifkan path protection** sepenuhnya.

---

## 🟡 Important — Perlu diperbaiki (10 items)

### 16. CLI tidak punya `--version` flag
**File:** [cli/index.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/cli/index.js)

Commander tidak dikonfigurasi `.version()`. Plus versi di-hardcode (`'0.1.0'`) alih-alih baca dari package.json.

### 17. CLI silently overwrite output file
**File:** [cli/index.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/cli/index.js)

`--generate-schema --output` overwrite file tanpa warning.

### 18. Windows path bug di CLI
**File:** [cli/index.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/cli/index.js#L92)

`filePath.split('/').pop()` hardcode `/`. Di Windows, `resolve()` pakai backslash, jadi `fileName` berisi full path. Gunakan `path.basename()`.

### 19. CLI tidak enforce file size sebelum read
**File:** [cli/index.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/cli/index.js#L87)

`readFileSync(filePath)` tanpa size check. Multi-GB file bisa menyebabkan OOM. Library punya `MAX_BUFFER_SIZE` tapi CLI tidak pakai sebelum read.

### 20. Test fixtures di-gitignore — test gagal untuk kontributor baru
**File:** [.gitignore](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/.gitignore), [test/integration.test.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/test/integration.test.js)

`test/*.pdf` dan `test/fixtures/*.pdf` di-gitignore, tapi integration test bergantung pada file ini. Clone baru = test gagal. Tidak ada mekanisme download/generate fixtures.

### 21. Layer 2 test coverage sangat tipis
**File:** [test/layer2.test.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/test/layer2.test.js) (1757 bytes, 43 lines)

Hanya test shape dasar. Missing: signature verification, certificate parsing, expired cert, corrupted PDF, multiple signatures.

### 22. Tidak ada CLI test sama sekali
Tidak ada test file untuk `cli/index.js`. Zero coverage.

### 23. Duplicated `escapeRegex()` di 3 file
**File:** `generator/fingerprint-extractor.js`, `generator/rule-builder.js`, `utils/pattern-parser.js`

Fungsi identik di 3 tempat. Harus disentralisasi.

### 24. `bundleDependencies: []` kosong — tidak berguna
**File:** [package.json](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/package.json#L27)

Empty array tidak punya efek. Hapus.

### 25. Weak test assertions yang tidak pernah bisa fail
**File:** [test/generator.test.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/test/generator.test.js)

- `expect(pairs.length).toBeGreaterThanOrEqual(0)` — selalu true
- `if (colonPair) { ... }` — test passes silently bahkan kalau deteksi gagal

---

## 🟢 Minor — Nice to have (8 items)

### 26. `passport.js` fingerprint `/paspor/i` terlalu broad
Bisa match kata "paspor" di teks Bahasa Indonesia apapun. Perlu fingerprint lebih spesifik.

### 27. `ktp.js` fingerprint `\b\d{16}\b` terlalu broad
Match credit card, bank account, atau angka 16-digit apapun.

### 28. Magic number `0.3` di spatial gate hardcoded
**File:** [src/layer1/gate4-spatial.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/src/layer1/gate4-spatial.js)

### 29. `.gitignore` tidak include `.env`
Preventive best practice.

### 30. `.npmignore` tidak exclude `.DS_Store`
macOS metadata bisa bocor ke npm package.

### 31. Missing npm metadata — `repository`, `bugs`, `homepage`
**File:** [package.json](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/package.json)

### 32. `confidence-scorer.js` — `structureScore` bisa exceed 1.0
**File:** [src/generator/confidence-scorer.js](file:///Users/irfanzharauri/Development/GitHub/pdf-gate/src/generator/confidence-scorer.js#L80)

Tidak di-clamp ke max 1.0.

### 33. `--experimental-vm-modules` undocumented di README
User yang ingin run test perlu tahu tentang flag ini.

---

## 📊 Ringkasan

| Prioritas | Jumlah | Kategori |
|-----------|--------|----------|
| 🔴 Critical | 9 | Runtime crashes, security violations, data integrity |
| 🟠 Significant | 6 | Dead modules, parser bugs, path traversal, code exec |
| 🟡 Important | 10 | Test gaps, CLI issues, code duplication |
| 🟢 Minor | 8 | Broad regex, config, code quality |
| **Total** | **33** | |

---

## 🎯 Prioritas Perbaikan yang Direkomendasikan

### Phase 1 — Security & Runtime Fixes
1. Hapus global `unhandledRejection` handler (#3)
2. Fix atau hapus `timingSafeEqual` dead code (#4)
3. Fix `require('crypto')` → ESM import (#2)
4. Fix text join tanpa separator (#13)
5. Tambah missing `label` pada 3 schema (#1)
6. Update `displayName()` untuk 8 schema (#10)
7. Fix Layer 2 field reading untuk verify-pdf 1.x (#7)

### Phase 2 — Consistency & Documentation
8. Sinkronkan `types.js` dengan runtime (#5)
9. Fix Node.js version mismatch (#8)
10. Wire dead modules atau hapus (#11)
11. Fix `getAllSchemas()` return immutable (#9)
12. Clear timeout timer (#14)

### Phase 3 — Testing & Polish
13. Tambah test fixtures mechanism (#20)
14. Improve Layer 2 test coverage (#21)
15. Tambah CLI tests (#22)
16. Fix weak test assertions (#25)
17. Remaining minor items

> [!TIP]
> Mulai dari **Phase 1** karena ada masalah yang bisa menyebabkan runtime crash dan silent data corruption. Jika ingin saya langsung mulai memperbaiki, bilang saja — bisa saya kerjakan per-phase atau sekaligus.
