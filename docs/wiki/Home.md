# 📚 Wiki pdf-gate

> **Dual-Layer PDF Document Validator** — validasi konten + verifikasi kriptografis digital signature untuk dokumen formal Indonesia.

`@tutupharirabu/pdf-gate` memvalidasi dokumen PDF dalam **dua lapisan**:

- **Layer 1 — Content Sanity Check**: deteksi tipe dokumen (fingerprint), validasi struktur (heuristics), dan pencocokan field wajib (rules) terhadap 8 schema built-in atau schema kustom milik Anda.
- **Layer 2 — Cryptographic Verification**: verifikasi digital signature **PKCS#7** lewat `@ninja-labs/verify-pdf` (issuer, masa berlaku sertifikat, integritas dokumen).

**Desain inti:** Zero Trust — tanpa jaringan, sanitasi input, proteksi ReDoS, buffer zeroing. Core validation < 50 KB; engine OCR (tesseract.js WASM, `ind+eng`) dimuat secara **lazy** hanya saat dibutuhkan.

---

## 📑 Daftar Isi

| Halaman | Isi |
|---|---|
| [🚀 Memulai](Memulai.md) | Instalasi (npm + GitHub Packages), quick start CLI & API, contoh validasi pertama |
| [🛠️ Penggunaan CLI](Penggunaan-CLI.md) | Semua perintah & flag `pdf-validate`, exit codes, contoh nyata |
| [📖 API Referensi](API-Referensi.md) | `validatePDF()`, `registerSchema()`, `generateSchema()`, opsi, bentuk hasil (result shape) |
| [📋 Schema Dokumen](Schema-Dokumen.md) | 8 schema built-in (Ijazah, Transkrip, Sertifikat, KTP, Akte Kelahiran, SIM, Paspor, Kartu Keluarga) + schema kustom (JSON/JS/API) |
| [🔍 Layer 1 — Sanity Check](Layer-1-Sanity-Check.md) | Cara kerja 4 gate: deteksi tipe, struktur, word count, distribusi spasial, field rules |
| [🔐 Layer 2 — Verifikasi Kriptografis](Layer-2-Verifikasi-Kriptografis.md) | Verifikasi PKCS#7 via `@ninja-labs/verify-pdf`, flag `--skip-crypto`, trusted issuers, batasan |
| [🤖 OCR untuk PDF Scan](OCR-Scan-PDF.md) | Integrasi tesseract.js WASM (`ind+eng`), lazy-load, lokal penuh, alur hasil OCR ke Layer 1 |
| [🛡️ Keamanan](Keamanan.md) | Postur Zero Trust: no network, sanitasi input, ReDoS protection, buffer zeroing, referensi audit |
| [🤝 Kontribusi](Kontribusi.md) | Konvensi test (Jest), typecheck (`tsc --noEmit`), struktur kode, panduan PR |

---

## 🔗 Tautan Cepat

- **README**: [`../../README.md`](../../README.md) — dokumentasi utama (instalasi, quick start, semua flag)
- **Lisensi**: [`../../LICENSE`](../../LICENSE) — MIT © 2026 Irfan Zharauri Nanda Sudiyanto
- **Code of Conduct**: tidak ada file khusus — ikuti etika umum GitHub & pedoman di [Kontribusi](Kontribusi.md)
- **Issue tracker**: https://github.com/tutupharirabu/pdf-gate/issues
- **Repositori**: https://github.com/tutupharirabu/pdf-gate
- **Wiki online (GitHub Wiki)**: https://github.com/tutupharirabu/pdf-gate/wiki

---

## ℹ️ Tentang Wiki Ini

Konten wiki disimpan di dalam repositori sebagai dokumen Markdown biasa di `docs/wiki/`, lalu **disinkronkan ke GitHub Wiki** (yang merupakan repositori git terpisah). Panduan lengkap cara publish & menjaga sinkronisasi: [docs/WIKI.md](../WIKI.md).
