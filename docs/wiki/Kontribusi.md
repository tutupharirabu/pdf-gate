# 🤝 Kontribusi

Panduan berkontribusi ke `@tutupharirabu/pdf-gate` — dari setup, konvensi test/typecheck, hingga PR.

---

## Setup

```bash
git clone https://github.com/tutupharirabu/pdf-gate.git
cd pdf-gate
npm install
```

`.npmrc` repo sudah menunjuk registry GitHub Packages (`@tutupharirabu:registry=https://npm.pkg.github.com`), jadi install dependency internal aman. Node.js **>= 22** (lihat `engines` di `package.json`).

## Struktur Kode

```
pdf-gate/
├── src/
│   ├── index.js               # Public API (validatePDF dkk.)
│   ├── types.js               # JSDoc typedefs (shape runtime)
│   ├── layer1/                # Sanity check: index, detector, heuristic, validator (4 gate)
│   ├── layer2/                # Crypto wrapper (@ninja-labs/verify-pdf)
│   ├── generator/             # Auto schema: line-grouper, field-detector, rule-builder,
│   │                          #   fingerprint-extractor, confidence-scorer
│   ├── ocr/                   # rasterizer (pdfjs+canvas), engine (tesseract.js), index
│   ├── schemas/               # 8 built-in + registry (index.js) + category-map
│   └── utils/                 # sanitizer, zero-trust, pdf-parser, pattern-parser
├── cli/index.js               # Binary pdf-validate (commander + picocolors)
├── demo/                      # Demo server Express + multer
├── examples/                  # Contoh schema kustom (JSON/JS)
├── test/                      # Suite Jest (ESM)
└── docs/                      # Wiki (docs/wiki/) + audit + roadmap
```

Konteks desain: `docs/superpowers/specs/2026-08-04-ocr-support-design.md`, `docs/roadmap-2026-08-05-pdf-inspector-integration.md`.

## Menjalankan Test

```bash
npm test                 # Semua suite — memakai --experimental-vm-modules (Jest ESM)
npm run test:coverage    # Laporan coverage
npm run test:watch       # Watch mode
```

> **Penting**: Jest ESM membutuhkan flag `--experimental-vm-modules` — skrip `npm test` sudah memuatnya, jangan dihapus.

Konvensi suite (folder `test/`, per topik):

| File | Cakupan |
|---|---|
| `cli.test.js` | CLI integration (exit codes, guards) |
| `schemas.test.js` | Registry: resolve/register/unregister/load, integritas built-in |
| `layer1.test.js` | Detector, heuristics, validator, orkestrator |
| `layer2.test.js` | Shape & ekspor `runLayer2` |
| `layer2-regression.test.js` | Regression mapping verify-pdf |
| `generator.test.js` | Auto-generate schema |
| `ocr.test.js` | Engine smoke + kontrak integrasi `validatePDF()` OCR |
| `ocr-failure.test.js` | Error containment OCR (mock engine, `jest.unstable_mockModule`) |
| `security-fixes.test.js` | zero-trust, loadSchemaFromFile guard, trustedIssuers |
| `integration.test.js` | `validatePDF()` end-to-end (fixtures PDF real, skip bila tak ada) |
| `frontend-upload.test.js` | Demo server upload |

**Catatan fixture**: `test/*.pdf` di-`.gitignore` (mengandung PII). Test fixture men-skip otomatis bila file tak ada — jangan commit PDF pribadi.

## Typecheck

```bash
npm run typecheck        # tsc --noEmit (allowJs + checkJs, strict)
```

Project memakai **JavaScript dengan JSDoc** dan `checkJs: true` — tipe baru wajib diberi JSDoc yang benar (lihat `src/types.js` untuk typedef bersama). Jangan mengubah `tsconfig.json` tanpa alasan.

## Lint & Format

Tidak ada ESLint/Prettier terpasang — konvensi manual:

- **4 spasi** indent, single quotes, semicolon.
- **JSDoc di setiap fungsi/modul** (format: deskripsi, `@param`, `@returns`, contoh).
- Nama: `camelCase` fungsi/variabel, `PascalCase` class/typedef, konstanta `UPPER_SNAKE_CASE`.
- Komentar dan pesan error: **Bahasa Indonesia** (konsisten dengan codebase).
- Setiap file modul diawali header `@module` + deskripsi.

## Sebelum Push / PR

1. `npm run typecheck` — 0 error.
2. `npm test` — semua suite hijau.
3. `npm run check:pack` — pastikan isi paket benar (`npm pack --dry-run`).
4. Update dokumen bila menyentuh API/CLI/behavior: `README.md` dan `docs/wiki/` (lihat [WIKI.md](../WIKI.md)).

## Panduan PR

- Satu PR = satu concern; pesan commit deskriptif (bisa pakai konvensi Conventional Commits).
- Sertakan test untuk setiap perubahan perilaku; jangan melemahkan assertion (audit #25 menandai *weak test assertions*).
- Jangan menambah dependency tanpa kebutuhan; bila perlu, perhatikan `overrides` keamanan yang sudah ada (`node-forge`, `brace-expansion`).
- Zero-trust adalah **non-negotiable**: tidak ada network call, tetap ada sanitasi input & proteksi ReDoS.
- Jangan meng-commit fixture PDF berisi data pribadi.
- CI (`.github/workflows/ci.yml`) menjalankan typecheck + test + pack check di setiap push/PR — pastikan lulus lokal dulu.

## Topik yang Sedang Dikembangkan

- Roadmap integrasi pdf-inspector (klasifikasi PDF, OCR routing, strict mode): `docs/roadmap-2026-08-05-pdf-inspector-integration.md` — ide PR bagus ada di sana.
- Pastikan tidak menabrak pekerjaan paralel pada `.github/` (CI/CodeQL/Dependabot).

## Lihat Juga

- [Home](../wiki/Home.md) — indeks wiki
- [Keamanan](Keamanan.md) — postur yang harus dijaga
- [API Referensi](API-Referensi.md) — permukaan publik
