# 📚 WIKI.md — Wiki Dalam Repo & Sinkronisasi ke GitHub Wiki

Dokumen ini menjelaskan hubungan antara wiki yang disimpan **di dalam repositori** (`docs/wiki/`) dengan fitur **GitHub Wiki**, serta panduan publish dan menjaga sinkronisasi.

---

## 1. Konsep: Dua Bentuk "Wiki"

### a) Wiki dalam repo — `docs/wiki/` (ini)

Konten wiki ditulis sebagai Markdown biasa di `docs/wiki/` dan **di-commit bersama source code**:

- Dapat di-review dalam PR yang sama dengan perubahan kode (changelog otomatis, history, blame).
- Tidak butuh kredensial tambahan — push ke repo utama sudah membawanya.
- Halaman utama mengikuti konvensi GitHub Wiki: **`Home.md`** (halaman default wiki adalah `Home.md`).
- Tautan antar halaman memakai **relative link** (`Memulai.md`, `../README.md`) sehingga berfungsi baik di file browser GitHub maupun di wiki clone.

### b) GitHub Wiki — repositori git terpisah

GitHub Wiki adalah **repositori git terpisah** dari repo utama:

- URL publik: **https://github.com/tutupharirabu/pdf-gate/wiki**
- Clone URL: `https://github.com/tutupharirabu/pdf-gate.wiki.git`
- Isinya di-render oleh gollum (engine wiki GitHub). Halaman default = `Home.md`.
- **Keterbatasan penting**: GitHub Wiki bukan repo biasa yang menerima semua fitur git — ia mendukung halaman Markdown (`.md`), dengan dukungan terbatas untuk `.asciidoc`, `.creole`, `.org`, `.pod`, `.rdoc`, `.rest`, `.textile`. Masing-masing file di root wiki adalah satu halaman. Halaman yang dihapus dari wiki repo akan hilang dari wiki publik.
- Repo wiki **tidak menerima** subfolder halaman (semua halaman flat di root clone) — lihat Catatan sinkronisasi di bawah.

## 2. Publish `docs/wiki/` → GitHub Wiki

Ada dua cara.

### Cara A — Clone, salin, commit, push (disarankan untuk sinkronisasi manual/CI)

```bash
# 1. Clone wiki repo
git clone https://github.com/tutupharirabu/pdf-gate.wiki.git
cd pdf-gate.wiki

# 2. Salin semua halaman dari docs/wiki/
cp -R ../pdf-gate/docs/wiki/*.md .

# 3. Commit & push
git add .
git commit -m "docs: sinkronkan wiki dari docs/wiki/"
git push
```

**Catatan pemetaan file → halaman:**

| File di `docs/wiki/` | Halaman GitHub Wiki |
|---|---|
| `Home.md` | halaman default `/wiki` |
| `Memulai.md` | `/wiki/Memulai` |
| `Penggunaan-CLI.md` | `/wiki/Penggunaan-CLI` |
| `API-Referensi.md` | `/wiki/API-Referensi` |
| `Schema-Dokumen.md` | `/wiki/Schema-Dokumen` |
| `Layer-1-Sanity-Check.md` | `/wiki/Layer-1-Sanity-Check` |
| `Layer-2-Verifikasi-Kriptografis.md` | `/wiki/Layer-2-Verifikasi-Kriptografis` |
| `OCR-Scan-PDF.md` | `/wiki/OCR-Scan-PDF` |
| `Keamanan.md` | `/wiki/Keamanan` |
| `Kontribusi.md` | `/wiki/Kontribusi` |

> ⚠️ Tautan di dalam halaman yang mengarah ke luar wiki (mis. `../README.md`, `../audit-report.md`) **tidak akan ter-resolve** di GitHub Wiki (tidak ada konsep naik direktori di wiki). Di wiki publik, ganti tautan tersebut dengan URL absolut ke file di repo utama, mis. `https://github.com/tutupharirabu/pdf-gate/blob/main/README.md`.

### Cara B — GitHub "Import" / gollum

GitHub menyediakan tombol **Import** di halaman Wiki (sebelum wiki diinisialisasi) untuk meng-clone dari repo yang sudah ada. Untuk inisialisasi pertama:

1. Buka **Settings → Wiki** di repo utama → aktifkan wiki.
2. Buka halaman wiki → **"Import"** → beri URL clone `https://github.com/tutupharirabu/pdf-gate.wiki.git` (atau repo wiki lain yang ingin diimpor).
3. GitHub akan meng-copy halaman dari repo tersebut.

Untuk update berikutnya tetap gunakan **Cara A** (clone → salin → push), karena "Import" hanya berlaku sekali saat inisialisasi.

## 3. Menjaga Tetap Sinkron (Catatan CI)

Karena GitHub Wiki adalah repo terpisah, sinkronisasi harus eksplisit. Ide otomasi:

- **Workflow GitHub Actions** di repo utama: pada push ke `main` (path `docs/wiki/**`), lakukan:
  1. `actions/checkout` repo utama,
  2. `actions/checkout` repo wiki dengan `repository: tutupharirabu/pdf-gate.wiki` dan token dengan akses write ke wiki,
  3. `cp docs/wiki/*.md <wiki-clone>/`,
  4. commit + push ke wiki repo.
- Alternatif sederhana: cron bulanan atau job manual "Sync Wiki".
- **Verifikasi**: setelah sync, cek bahwa semua tautan antar-halaman (relatif, nama file persis) masih valid; halaman yang dihapus di `docs/wiki/` juga harus dihapus dari wiki repo (jangan biarkan halaman usang).

> **Gagal publish dianggap normal untuk saat ini** — wiki dalam repo (`docs/wiki/`) adalah sumber kebenaran; GitHub Wiki hanyalah cermin. Kontributor tidak wajib men-sync; maintainer yang menjalankan sinkronisasi.

## 4. Daftar Halaman Wiki

| Halaman | Deskripsi |
|---|---|
| [`wiki/Home.md`](wiki/Home.md) | Beranda & indeks: deskripsi proyek, daftar isi, tautan cepat |
| [`wiki/Memulai.md`](wiki/Memulai.md) | Instalasi (npm, GitHub Packages, Node >= 22), quick start CLI + API |
| [`wiki/Penggunaan-CLI.md`](wiki/Penggunaan-CLI.md) | Semua perintah & flag `pdf-validate`, exit codes, contoh |
| [`wiki/API-Referensi.md`](wiki/API-Referensi.md) | `validatePDF`, registry schema, generator, utilitas zero-trust, result shape |
| [`wiki/Schema-Dokumen.md`](wiki/Schema-Dokumen.md) | 8 schema built-in + schema kustom (JSON/JS/API) |
| [`wiki/Layer-1-Sanity-Check.md`](wiki/Layer-1-Sanity-Check.md) | 4 gate: teks, fingerprint, heuristik, field rules |
| [`wiki/Layer-2-Verifikasi-Kriptografis.md`](wiki/Layer-2-Verifikasi-Kriptografis.md) | PKCS#7 via `@ninja-labs/verify-pdf`, `--skip-crypto`, trustedIssuers |
| [`wiki/OCR-Scan-PDF.md`](wiki/OCR-Scan-PDF.md) | tesseract.js WASM (ind+eng), lazy-load, lokal, alur ke Layer 1 |
| [`wiki/Keamanan.md`](wiki/Keamanan.md) | Zero Trust: no network, sanitasi, ReDoS, buffer zeroing, referensi audit |
| [`wiki/Kontribusi.md`](wiki/Kontribusi.md) | Test (Jest), typecheck (`tsc --noEmit`), struktur kode, PR |

## 5. Konvensi Penulisan

- Bahasa: **Indonesia** (konsisten dengan README dan kode).
- Satu file Markdown = satu halaman; halaman default harus `Home.md`.
- Tautan antar-halaman: relative, nama file persis (`Memulai.md`), tidak memakai huruf kapital berlebih agar aman di file browser & wiki clone.
- Konten harus ter-grounding pada source nyata (nama fungsi/opsi/field aktual) — jangan mengarang API.
- Update `Home.md` (daftar isi) saat menambah/menghapus halaman.
