# 🔐 Layer 2 — Verifikasi Kriptografis

Layer 2 memverifikasi **digital signature PKCS#7** pada dokumen PDF. Implementasi: `runLayer2()` di `src/layer2/index.js`, yang membungkus `@ninja-labs/verify-pdf` (`src/layer2/index.js`).

---

## Cara Kerja

1. `verifyPDF(pdfBuffer)` dipanggil dengan buffer PDF mentah.
2. Output di-normalisasi agar kompatibel dengan shape API `verify-pdf` 0.3.x (flat `{ verified, integrity, meta }`) maupun 1.x (`{ signatures: [{ verified, integrity, meta }] }`) — lihat blok *"normalize API shape across verify-pdf versions"*.
3. Signature pertama (`signatures[0]`) dipetakan ke `Layer2Result` standar (per PRD §4.3):

| Field | Sumber |
|---|---|
| `hasSignature` | ada ≥ 1 signature |
| `passed` | `sig.verified` |
| `integrityOk` | `sig.integrity` |
| `issuer` | `certs[0].issuedBy` |
| `issuedTo` | `certs[0].issuedTo` |
| `validFrom` / `validTo` | `certs[0].validityPeriod.notBefore` / `notAfter` |
| `signedAt` | `sig.signingTime` atau `sig.meta.signatureMeta.signingTime` |

4. Pemeriksaan tambahan berurutan:
   - **Cert expiry** — `validTo < now` → `certExpired = true`, `passed = false`, failReason `'Sertifikat digital telah expired pada <validTo>'`.
   - **Trusted-CA pinning** — bila `options.trustedIssuers` diberikan (allowlist substring nama issuer), issuer yang tidak cocok → `passed = false` dengan failReason *"Issuer sertifikat (...) tidak ada dalam daftar CA tepercaya (trustedIssuers). Tanda tangan ditolak demi keamanan."*
   - **Integrity override** — `integrityOk` false tanpa failReason lain → `passed = false`, failReason *"Integritas dokumen gagal — PDF kemungkinan dimodifikasi setelah ditandatangani."*
   - Fallback umum: `passed` false tanpa alasan → *"Verifikasi tanda tangan digital gagal."*

### Kondisi khusus

- **Tanpa signature sama sekali**: `hasSignature = false`, `passed = false`, failReason `'Dokumen tidak memiliki tanda tangan digital.'`. Pada decision tree `validatePDF()`, kondisi ini menghasilkan status **`PLAUSIBLE`** (bukan FAILED) — dokumen lolos Layer 1 tapi tidak ada bukti kriptografis.
- **Error dari `verifyPDF()`**: ditangkap, disimpan ke `failReason`, dan hasil dikembalikan (bukan dilempar).

## Skip Layer 2

### API: `skipLayer2`

```js
const result = await validatePDF(buffer, {
  schema: 'ijazah',
  skipLayer2: true,
});
```

Saat `skipLayer2: true`, Layer 2 tidak dijalankan; `layer2` diisi `skippedLayer2Result()` (`src/index.js`):

```js
{
  passed: false,
  hasSignature: false,
  issuer: null, issuedTo: null,
  validFrom: null, validTo: null,
  certExpired: false, integrityOk: false,
  signedAt: null, failReason: null,
  durationMs: 0
}
```

Status menjadi **`PLAUSIBLE`** bila Layer 1 lolos (lihat peta keputusan di [Memulai](Memulai.md)).

### CLI: `--skip-crypto` / `--skip-layer2`

```bash
pdf-validate ./doc.pdf --schema sim --skip-crypto
pdf-validate ./doc.pdf --schema ktp --skip-layer2   # alias
```

CLI membaca `options.skipCrypto || options.skipLayer2` dan meneruskannya sebagai `skipLayer2` ke `validatePDF()`.

## Trusted Issuers (CA Pinning)

Defense-in-depth terhadap sertifikat palsu/tidak tepercaya:

```js
const result = await validatePDF(buffer, {
  schema: 'ijazah',
  trustedIssuers: ['BSrE', 'Kementerian'],  // substring nama issuer
});
```

- Hanya string non-kosong yang dipakai (`filter(s => typeof s === 'string' && s.length > 0)`).
- Pencocokan dengan `issuer.includes(trusted)` — substring.
- Signature dari issuer di luar daftar **ditolak** (passed = false).
- Tanpa opsi ini, semua issuer diterima apa adanya (tidak ada pinning).

## Batasan & Caveat (dari source)

- **Bergantung pada `@ninja-labs/verify-pdf`** — paket ini tidak menyertakan type declarations (ada `// @ts-expect-error` di import). Hasil verifikasi sebaiknya dianggap *best-effort* dan diverifikasi silang untuk konteks berisiko tinggi.
- **Hanya signature pertama yang dipetakan** — dokumen multi-signature hanya mengevaluasi `signatures[0]`.
- **`hasSignature: false` ≠ kegagalan** — menghasilkan `PLAUSIBLE`, bukan `FAILED`; gunakan `--skip-crypto`/`skipLayer2` hanya bila kebutuhan Anda murni sanity check.
- **Verifikasi tidak bergantung pada teks OCR** — Layer 2 bekerja pada byte PDF mentah, jadi dokumen scan pun bisa diverifikasi tanpa OCR.
- **Test coverage Layer 2** — `test/layer2.test.js` memverifikasi shape/ekspor dan hasil pada input non-PDF; perilaku mapping diuji lewat regression suite `layer2-regression.test.js` dan `security-fixes.test.js` (trustedIssuers).

## Lihat Juga

- [Keamanan](Keamanan.md) — postur zero-trust menyeluruh
- [API Referensi](API-Referensi.md) — opsi `trustedIssuers`, bentuk `Layer2Result`
- [Penggunaan CLI](Penggunaan-CLI.md) — flag `--skip-crypto`
