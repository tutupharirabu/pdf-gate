# 🔐 CodeQL — Advanced Setup (pdf-gate)

> Dokumentasi setup **CodeQL advanced** untuk repository ini: workflow
> `.github/workflows/codeql.yml`, query packs yang dipakai, cara menjalankan
> CodeQL CLI secara lokal, cara men-triage temuan, dan cara memperluas setup.

Dokumen ini mengasumsikan pembaca sudah paham dasar GitHub Actions. Fokus di
sini adalah keputusan desain **advanced** yang membedakan setup ini dari
template default `codeql-analysis.yml`.

---

## 📌 Ringkasan Workflow

File: `.github/workflows/codeql.yml`

| Aspek | Nilai |
|-------|-------|
| Trigger | `push` ke `main`, `pull_request`, `schedule` (cron mingguan), `workflow_dispatch` |
| Cron | `27 3 * * 1` — setiap Senin 03:27 UTC |
| Concurrency | `codeql-${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: true` |
| Permissions | `security-events: write`, `actions: read`, `contents: read` |
| Jobs | `setup` → `analyze` (dependency via `needs:`) |
| Bahasa | `javascript-typescript`, `build-mode: none` |
| Query packs | `+security-and-quality` (full) dan `+security-extended` (terfilter) |
| Quality gate | Step "Check for CodeQL findings" (SARIF-based), ambang `error` |

---

## 🧩 Arsitektur Dua Job (Dependency Control)

### Job `setup` — sekali saja, tidak dobel `npm ci`

```yaml
setup:
  steps:
    - uses: actions/checkout@v5
    - uses: actions/setup-node@v5
      with: { node-version: 22, cache: npm }
    - run: npm ci
    - run: npm run typecheck
    - run: npm test
    - uses: actions/upload-artifact@v4
      with:
        name: node_modules
        path: node_modules
        retention-days: 1
```

Job ini menjalankan **satu** `npm ci`, lalu **typecheck** dan **test** satu
kali, kemudian menyimpan `node_modules` sebagai artifact. Ini menghindari
`npm ci` dijalankan dua kali (sekali untuk CI, sekali untuk CodeQL).

### Job `analyze` — bergantung pada `setup`

```yaml
analyze:
  needs: setup
  steps:
    - uses: actions/checkout@v5
    - uses: actions/download-artifact@v5
      with: { name: node_modules, path: node_modules }
    - uses: github/codeql-action/init@v3
      with:
        languages: javascript-typescript
        build-mode: none
        queries: ${{ matrix.queries }}
        config: |
          name: "pdf-gate CodeQL config (${{ matrix.profile }})"
          paths-ignore: ${{ toJson(matrix.paths-ignore) }}
    - uses: github/codeql-action/analyze@v3
      with:
        category: ${{ matrix.category }}
    - name: Check for CodeQL findings
      if: always()
      run: | ...
```

**Mengapa `build-mode: none`?** JavaScript/TypeScript adalah bahasa
interpretasi — CodeQL tidak perlu menjalankan build untuk membuat database.
CodeQL cukup mengekstrak source tree. Ini juga membuat job `analyze` murni
bergantung pada artifact `node_modules` dari `setup` tanpa perlu install ulang.

**Mengapa `queries` terpisah dari `config`?** Prefix `+` pada input `queries`
(contoh `+security-and-quality`) membuat query pack **ditambahkan** ke default
queries, bukan menggantikannya. Sementara `config` dipakai khusus untuk
`paths-ignore`, karena action `github/codeql-action/init@v3` **tidak punya**
input `paths-ignore` langsung — satu-satunya cara resmi adalah lewat config
file / input `config`.

---

## 🔍 Matrix Query Packs — "Advanced" di Bagian Ini

Tidak semua cell matrix menjalankan full query packs. Desainnya:

| Cell | Query pack | Scope `paths-ignore` | Tujuan |
|------|-----------|----------------------|--------|
| `security-and-quality` | `+security-and-quality` | `node_modules`, `coverage` | **Full run**: cakupan terlengkap (default + extended + maintainability & reliability) |
| `security-extended` | `+security-extended` | `node_modules`, `coverage`, `test/**`, `examples/**`, `docs/**`, `demo/**` | **Run terfilter**: fokus ke kode produksi (`src/` + `cli/`), lebih cepat |

Dua run ini memakai **category berbeda** (`.../full` vs `.../extended`) sehingga
SARIF-nya tidak bentrok di Code Scanning — hasil keduanya tampil terpisah di
Security tab.

### Apa bedanya `security-extended` vs `security-and-quality`?

| Query suite | Isi | Precision | Kapan dipakai |
|-------------|-----|-----------|---------------|
| **default** (`security`) | Query security ber-precision tinggi (few false positives) | high / very-high | Diaktifkan secara default oleh action |
| **`security-extended`** | Query dari default **+** query security ber-precision lebih rendah (lebih banyak coverage, sedikit lebih berisik) | medium/low | Run terfilter di cell 2 |
| **`security-and-quality`** | Query dari `security-extended` **+** query maintainability & reliability (bukan security, tapi menangkap bug/kualitas) | medium/low | Full run di cell 1 |

Ringkasnya:

```
security-and-quality = security-extended + maintainability + reliability
security-extended    = default + security ber-precision rendah
default              = security ber-precision tinggi
```

Karena `+` dipakai, **semua** run tetap menyertakan default queries.

### Kenapa satu cell full dan satu cell terfilter?

- Cell **full** (`security-and-quality`) memberi jaminan cakupan maksimal
  (termasuk bug kualitas kode, bukan cuma keamanan).
- Cell **terfilter** (`security-extended` + `paths-ignore` ketat) memberi sinyal
  keamanan yang fokus dan cepat — `test/`, `examples/`, `docs/`, `demo/` bukan
  kode produksi, jadi temuan di sana tidak relevan untuk quality gate.

Kedua cell memakai `fail-fast: false` agar kegagalan satu cell tidak
membatalkan cell lain.

---

## 🚦 Quality Gate: Mem-blokir PR saat Ada Temuan

> ⚠️ **Penting:** `github/codeql-action/analyze@v3` **tidak memiliki** input
> `fail-on` (input ini tidak ada di action.yml v3 maupun v4). Menaruh
> `fail-on:` di action tersebut akan memicu error *"Unexpected input"*.

Untuk mem-blokir PR, workflow ini memakai **pola advanced berbasis SARIF**:

```yaml
- name: Check for CodeQL findings
  if: always()
  run: |
    threshold="${{ matrix.fail-on }}"   # 'error' untuk kedua cell
    ...
    for f in "$sarif_dir"/*.sarif; do
      python3 - "$f" "$threshold" <<'PY'
        # baca JSON SARIF, cari result dengan level >= threshold
        # kalau ada: print ::error:: dan exit 1
      PY
    done
```

Cara kerjanya:

1. `github/codeql-action/analyze@v3` menulis SARIF ke
   `${RUNNER_TEMP}/results` (input `output` default action).
2. Step gate membaca setiap `*.sarif`, lalu memeriksa setiap `result`.
3. Level SARIF: `note` < `warning` < `error`. Ambang `error` berarti hanya
   temuan **error** yang menggagalkan check.
4. Jika ada temuan ≥ ambang, step `exit 1` → check "CodeQL" merah → PR tidak
   bisa di-merge (tambahkan check ini ke branch protection / ruleset).

Pola ini adalah rekomendasi resmi GitHub untuk memblokir PR berbasis temuan
CodeQL, sekaligus memberi **kontrol ambang** (`none`/`note`/`warning`/`error`)
yang bisa diset per cell matrix.

> 💡 Alternatif lain: **Code scanning merge protection** (ruleset) di
> `Settings → Rules`. Keduanya bisa dipakai bersamaan — workflow gate memberi
> kontrol per-cell, ruleset memberi kontrol di level branch.

---

## 📅 Schedule & Workflow Dispatch

```yaml
on:
  push:
    branches: [main]
  pull_request:
  schedule:
    - cron: '27 3 * * 1'
  workflow_dispatch:
```

- **`push` ke `main`** — memindai setiap perubahan di branch default.
- **`pull_request`** — memindai PR (temuan muncul sebagai annotations).
- **`schedule`** — `27 3 * * 1` = setiap Senin 03:27 UTC. Angka acak (27 menit)
  menghindari beban puncak jam-jam ramai. Scan berkala menangkap vulnerability
  baru dari query packs yang diperbarui, walau kode tidak berubah.
- **`workflow_dispatch`** — tombol "Run workflow" manual di UI Actions.

> Catatan: event `schedule` hanya berjalan jika file workflow ada di branch
> default (`main`).

---

## 🖥️ Menjalankan CodeQL Secara Lokal (CodeQL CLI)

### 1. Install CodeQL CLI

**macOS (Homebrew):**

```bash
brew install codeql
```

**Linux/Windows:** unduh bundle resmi dari
[github/codeql releases](https://github.com/github/codeql/releases) — ambil
`codeql-bundle-*.tar.gz`, ekstrak, dan tambahkan `codeql/` ke `PATH`.

Verifikasi:

```bash
codeql --version
```

### 2. Buat database

Untuk proyek JavaScript/TypeScript murni (tanpa build), pakai
`--language=javascript`:

```bash
# Dari root repository
codeql database create ./codeql-db \
  --language=javascript \
  --source-root=. \
  --overwrite
```

> CodeQL CLI memakai identifikasi bahasa `javascript` untuk JavaScript/
> TypeScript (di GitHub Actions identifikasinya `javascript-typescript`).

### 3. Analisis dengan query packs

```bash
# security-extended
codeql database analyze ./codeql-db \
  codeql/javascript-queries:codeql-suites/javascript-security-extended.qls \
  --format=sarif-latest \
  --output=codeql-security-extended.sarif

# security-and-quality
codeql database analyze ./codeql-db \
  codeql/javascript-queries:codeql-suites/javascript-security-and-quality.qls \
  --format=sarif-latest \
  --output=codeql-security-and-quality.sarif
```

Hasilnya file SARIF yang bisa dibuka di VS Code (ekstensi CodeQL) atau di
upload ke GitHub lewat `github/codeql-action/upload-sarif@v3`.

> 🔁 **Sinkronisasi lokal ↔ CI:** run lokal dan run CI memakai query suite yang
> sama. `security-extended` di CI = suite
> `javascript-security-extended.qls` di CLI, dst. Jadi temuan lokal = temuan
> yang akan muncul di PR.

---

## 🧯 Men-triage Temuan di Security Tab

1. Buka **Security** tab → **Code scanning alerts** di repo GitHub.
2. Filter berdasarkan tool `CodeQL` dan category:
   - `/language:javascript-typescript/full` — dari cell `security-and-quality`
   - `/language:javascript-typescript/extended` — dari cell `security-extended`
3. Setiap alert menampilkan: rule ID (mis. `js/path-injection`), severity,
   file & baris, dan **code flow** yang menjelaskan jalur data dari sumber ke
   sink.
4. Keputusan triage:
   - **Fix langsung** — untuk true positive (paling umum di library validasi
     dokumen: sanitasi input, path traversal, ReDoS, buffer handling).
   - **Dismiss** → pilih alasan `Won't fix`, `False positive`, `Used in tests`,
     dst. Dismissal tersimpan dan tidak muncul lagi untuk jalur yang sama.
5. Untuk PR: alert muncul sebagai **annotations** di diff dan sebagai check —
   selama ada alert level `error` dan quality gate aktif, PR diblokir.

> 💡 Bandingkan kategori `full` vs `extended` saat ada temuan: jika muncul
> hanya di cell `full`, kemungkinan itu query maintainability/reliability
> (bukan security) — nilainya tetap penting tapi prioritasnya bisa lebih rendah
> daripada temuan security di kedua cell.

---

## 🔧 Memperluas Setup

### Custom queries (QL)

1. Buat direktori, mis. `codeql/` di root repo, dengan file `*.ql`:
   ```ql
   /**
    * @name Cek penggunaan eval
    * @kind problem
    * @id pdf-gate/js/no-eval
    * @severity warning
    */
   import javascript
   from CallExpr c
   where c.getCalleeName() = "eval"
   select c, "Hindari eval()"
   ```
2. Referensikan di input `queries` (workflow) atau di config:
   ```yaml
   - uses: github/codeql-action/init@v3
     with:
       queries: +security-and-quality,./codeql/no-eval.ql
   ```

### Query filters (include/exclude)

Tambahkan di input `config` (atau `config-file`):

```yaml
config: |
  name: "pdf-gate CodeQL config"
  paths-ignore: [...]
  query-filters:
    - exclude:
        id: js/useless-assignment-to-local
    - exclude:
        problem.severity: recommendation
```

Urutan filter penting: instruksi pertama menentukan default, instruksi
berikutnya dieksekusi berurutan dan menimpa sebelumnya.

### Tuning `paths-ignore`

- Tambahkan direktori yang tidak perlu dianalisis: `vendor/**`, `generated/**`,
  `dist/**`, `build/**`, `*.min.js`.
- Untuk memindai **hanya** direktori tertentu, ganti `paths-ignore` dengan
  `paths` (mis. `paths: ['src', 'cli']`) — keduanya eksklusif satu sama lain.
- Pola `**` hanya boleh di awal/akhir path atau dikelilingi slash
  (`foo/**`, `**/foo`, `foo/**/bar` valid; `**foo` tidak valid).

### Menambah bahasa

Tambah cell matrix (mis. `python`) dan update `languages`:
```yaml
- profile: python-security-and-quality
  language: python
  queries: '+security-and-quality'
  paths-ignore: ['**/node_modules/**']
```
> Untuk compiled languages (C/C++, Java, Go, dsb.) `build-mode` perlu
> `autobuild`/`manual`, bukan `none`.

---

## 📚 Referensi

- [Customizing your advanced setup for code scanning](https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning/customizing-your-advanced-setup-for-code-scanning)
- [Workflow configuration options for code scanning](https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning/workflow-configuration-options)
- [CodeQL query suites](https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning/codeql-query-suites)
- [CodeQL CLI (codeql database create / analyze)](https://docs.github.com/en/code-security/code-scanning/using-codeql-code-scanning-with-your-existing-ci-system/installing-codeql-cli-in-your-ci-system)
- [Creating CodeQL query suites](https://codeql.github.com/docs/codeql-cli/creating-codeql-query-suites/)
