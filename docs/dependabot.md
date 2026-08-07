# Dependabot untuk pdf-gate

Dokumen ini menjelaskan konfigurasi Dependabot di [`.github/dependabot.yml`](../.github/dependabot.yml): apa yang dilakukan Dependabot, bagaimana jadwal dan pengelompokan (grouping) bekerja, cara mengelola pull request (PR), cara menangani *security updates*, cara kustomisasi, dan bagian pemecahan masalah (*troubleshooting*).

> **Bacaan resmi:** [Dependabot options reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference) dan [About the dependabot.yml file](https://docs.github.com/en/code-security/concepts/supply-chain-security/about-the-dependabot-yml-file).

---

## 1. Apa itu Dependabot?

Dependabot adalah fitur bawaan GitHub yang memantau *manifest* dependency di repository dan otomatis membuka pull request saat ada versi baru.

Ada **dua jenis update** yang perlu dibedakan:

| Jenis | Dipicu oleh | Dari mana | Bisa dimatikan? |
|---|---|---|---|
| **Version updates** | Jadwal di `dependabot.yml` | Pengecekan versi terbaru di registry | Ya — lewat konfigurasi (mis. `open-pull-requests-limit: 0`) |
| **Security updates** | GitHub Advisory Database (kerentanan yang diketahui) | Vulnerability alerts di tab **Security** | Terpisah — diatur di pengaturan repository, **bukan** di `dependabot.yml` |

Keduanya sama-sama membuka PR, tetapi sumber dan pemicunya berbeda. Detailnya di [§5](#5-security-updates-vs-version-updates).

Untuk pdf-gate, Dependabot memantau dua ekosistem:

1. **npm** — membaca `package.json` + `package-lock.json` di root.
2. **GitHub Actions** — membaca semua action yang dipakai di `.github/workflows/*` (mis. `actions/checkout`, `actions/setup-node`).

---

## 2. Jadwal (schedule)

Konfigurasi ada di kunci `schedule` per ekosistem:

| Ekosistem | `interval` | `day` | `time` | `timezone` |
|---|---|---|---|---|
| npm | `weekly` | `monday` | `06:00` | `Asia/Jakarta` |
| github-actions | `weekly` | `wednesday` | `06:00` | `Asia/Jakarta` |

Aturan jadwal:

- `interval` hanya menerima: `daily`, `weekly`, `monthly`, `quarterly`, `semiannually`, `yearly`, atau `cron`.
- `day` hanya valid untuk `interval: "weekly"` dan hanya menerima nama hari bahasa Inggris: `monday` … `sunday`.
- `time` berformat `hh:mm`. Tanpa `timezone`, waktu dianggap **UTC**. Kami set `Asia/Jakarta` agar waktu 06:00 pagi benar-benar 06:00 WIB.
- Semua waktu dihitung dari **default branch** (di sini `main`).

Mengapa npm Senin dan Actions Rabu? Tujuannya menghindari dua gelombang PR bertabrakan di hari yang sama, sehingga CI tidak kebanjiran *queue* dan peninjau PR tidak kewalahan di satu hari.

---

## 3. Groups — kenapa PR di-batch?

Secara default Dependabot membuka **satu PR per dependency**. Untuk proyek dengan banyak dependency, ini bisa menghasilkan puluhan PR. Dengan `groups`, update yang cocok dengan suatu pola digabung menjadi **satu PR**.

```yaml
groups:
  pdf-processing:
    patterns:
      - "tesseract.js"
      - "pdfjs-dist"
      - "@ninja-labs/verify-pdf"
      - "@napi-rs/canvas"
    update-types:
      - "minor"
      - "patch"
```

Aturan pengelompokan:

- Sebuah dependency masuk ke **grup pertama** yang pola-nya cocok (`patterns`), sisanya diteruskan ke grup berikutnya.
- `patterns` mendukung wildcard `*`, mis. `"@types/*"`.
- Dependency yang **tidak cocok dengan grup mana pun** tetap dapat PR sendiri-sendiri.
- Jika sebuah dependency cocok dengan `patterns` **dan** `exclude-patterns`, maka dia **dikeluarkan** dari grup.
- `update-types` pada grup membatasi jenis update yang ikut grup: `major`, `minor`, `patch` (kombinasi diizinkan).

### Group yang terdefinisi di pdf-gate

**npm:**

| Group | Isi | Alasan |
|---|---|---|
| `pdf-processing` | `tesseract.js`, `pdfjs-dist`, `@ninja-labs/verify-pdf`, `@napi-rs/canvas` | Inti bisnis validator PDF; di-batch agar satu PR mewakili satu area fungsi (OCR, parsing, verifikasi tanda tangan). Dibatasi `minor`+`patch` karena upgrade `major` tesseract.js/pdfjs-dist bisa mengubah perilaku ekstraksi teks — sebaiknya direview satu per satu. |
| `dev-tooling` | `jest`, `typescript`, `@types/jest` | Tooling pengembangan; risiko runtime rendah, aman di-batch. |
| `other-deps` | `*` (semua sisanya) | Sisanya (mis. `express`, `multer`, `commander`) dikumpulkan agar tidak meledak jadi banyak PR kecil. |

**github-actions:**

| Group | Isi | Alasan |
|---|---|---|
| `actions-minor-patch` | `*` (semua action) | Upgrade `minor`/`patch` action umumnya kompatibel. Upgrade `major` action (mis. `checkout@v5` → `v6`) sengaja **tidak** di-group agar direview manual karena bisa mengubah perilaku CI. |

> **Catatan penamaan:** nama grup harus diawali dan diakhiri huruf, dan hanya boleh berisi huruf, angka, `|`, `_`, atau `-`. Nama `pdf-processing`, `dev-tooling`, `other-deps`, dan `actions-minor-patch` sudah memenuhi aturan ini.

### Kenapa major sengaja tidak di-group?

Upgrade `major` (mis. pdfjs-dist 4 → 5) sering membawa *breaking changes*. Kalau digabung dalam satu PR besar, sulit di-bisect mana perubahan yang memecah CI. Dengan membiarkan `major` keluar dari grup, Dependabot membuat PR terpisah per dependency sehingga lebih mudah direview dan di-revert.

---

## 4. Mengelola PR Dependabot (rebase & merge)

### Komentar pada PR Dependabot

Dependabot merespons perintah komentar pada PR-nya:

| Perintah | Fungsi |
|---|---|
| `@dependabot rebase` | Rebase ulang PR ke branch target terbaru. |
| `@dependabot recreate` | Buat ulang PR (menimpa semua edit manual di PR lama). |
| `@dependabot ignore this dependency` | Tutup PR dan hentikan update dependency ini (kecuali PR dibuka ulang). |
| `@dependabot ignore this major version` | Hentikan update ke *major version* ini saja. |
| `@dependabot ignore this minor version` / `... patch version` | Sama, untuk minor/patch. |
| `@dependabot show <nama> ignore conditions` | Tampilkan kondisi `ignore` yang tersimpan untuk dependency tersebut. |

Perintah khusus **grup** (PR grouped updates):

| Perintah | Fungsi |
|---|---|
| `@dependabot ignore <nama>` | Keluarkan dependency ini dari grup (PR ditutup). |
| `@dependabot unignore *` | Bersihkan semua kondisi `ignore` di grup, buka PR baru. |
| `@dependabot unignore <nama>` | Bersihkan `ignore` untuk dependency tertentu, buka PR baru. |

> **Penting (perubahan Januari 2026):** perintah `@dependabot merge`, `@dependabot close`, dan `@dependabot reopen` telah **di-deprecate** dan tidak lagi berfungsi. Untuk *merge*, *close*, atau *reopen*, gunakan **tool merge bawaan GitHub** di halaman PR (tombol merge/squash/rebase di UI, atau GitHub CLI).

### Alur kerja yang disarankan

1. PR Dependabot terbuka → CI (`npm run typecheck`, `npm test`, `check:pack`) berjalan otomatis berkat workflow `ci.yml`.
2. Kalau butuh basis terbaru, komentari `@dependabot rebase`.
3. Review diff di tab **Files changed**. Karena grup `pdf-processing` dan `dev-tooling` dibatasi minor/patch, diff biasanya kecil dan aman.
4. Merge lewat UI GitHub dengan strategi **Squash and merge**.
5. Kalau CI gagal karena *breaking change* yang tidak terduga, jangan dipaksa merge — komentari `@dependabot ignore this major version` (atau `... minor/patch`) lalu tutup, atau perbaiki secara manual.

Dependabot juga **otomatis rebase** PR yang *out-of-date* setiap kali jadwal berjalan — tetapi **berhenti rebase otomatis setelah 30 hari** PR tidak digabung. PR yang sudah lewat 30 hari perlu di-rebase manual dengan `@dependabot rebase`.

---

## 5. Security updates vs version updates

| | Version updates | Security updates |
|---|---|---|
| **Pemicu** | Jadwal `schedule.interval` | Kerentanan terkonfirmasi di GitHub Advisory Database |
| **Sumber versi** | Registry (npm / tags GitHub Actions) | Versi minimum yang sudah diperbaiki (*patched*) |
| **Cepatnya** | Mingguan (Senin/Rabu) | Segera setelah advisory diterbitkan |
| **Batas jumlah PR** | Tunduk ke `open-pull-requests-limit` | **Tidak** dihitung dalam limit; selalu dibuat |
| **`ignore` di dependabot.yml** | Berlaku | Berlaku juga (lihat catatan di bawah) |
| **`groups`** | Berlaku | Berlaku (dengan UI pengaturan grup *grouped security updates*) |

**Catatan penting untuk repo ini:**

- **Security updates selalu mengutamakan keamanan.** Meskipun `ignore` berlaku juga untuk security updates, jika suatu dependency memiliki kerentanan yang **belum** tertutup di versi yang di-ignore, Dependabot tetap membuka PR ke versi terbaru yang tersedia (perilaku *minimum fixed version*).
- Untuk `node-forge`: override di `package.json` sudah memastikan versi terpasang `^1.4.0` (patch CVE-2024-0975). Selama versi itu tidak memiliki advisory terbuka, tidak ada PR security update untuk `node-forge` yang harus ditangani.
- Jangan pernah mematikan **Dependabot security updates** di pengaturan repository demi kenyamanan — itu pertahanan lapisan kedua setelah `overrides` di `package.json`.

### Perbedaan dengan `npm audit`

`npm audit` (dan `npm audit fix`) memeriksa *resolved tree* di lockfile secara lokal. Dependabot security updates melakukan hal serupa tetapi otomatis di sisi GitHub: memindai *default branch* dan membuka PR perbaikan. Keduanya saling melengkapi; `npm audit` bagus untuk pemeriksaan cepat saat development, Dependabot untuk pemantauan berkelanjutan.

---

## 6. Kustomisasi

### Labels

```yaml
labels:
  - "dependencies"   # npm
  - "ci"             # github-actions
```

- Jika `labels` **tidak** ditentukan, Dependabot otomatis memakai label default `dependencies` (plus label ekosistem).
- Jika `labels` ditentukan, label tersebut **menggantikan** default.
- Label yang **belum ada** di repository akan diabaikan (tidak dibuat otomatis) — jadi pastikan label `dependencies` dan `ci` dibuat dulu di tab **Issues → Labels** agar PR benar-benar ter-label.
- Label semver (`major`/`minor`/`patch`) tetap ditambahkan otomatis jika label tersebut ada di repository.
- `labels: []` mematikan semua label.

### Assignees

```yaml
assignees:
  - "tutupharirabu"
```

Semua PR (version & security) untuk ekosistem itu akan di-assign ke pengguna tersebut (harus punya akses *write* ke repository). Kami **tidak** mengaktifkannya di repo ini agar tidak ada pemberitahuan wajib; tambahkan bila ingin.

### Milestone

```yaml
milestone: 7   # ID numerik, ambil dari akhir URL /milestone/N
```

Menautkan semua PR Dependabot ke satu milestone. ID bersifat numerik dan tidak bisa memakai nama milestone.

### Reviewers

> **Catatan:** `dependabot.yml` **tidak** punya kunci `reviewers`/`requested-reviewers`. Review request tidak bisa diatur lewat file konfigurasi. Gunakan:
> 1. **Branch protection rules** di pengaturan repository — mis. *require review* untuk semua PR, atau
> 2. Aturan otomatisasi (mis. GitHub Actions yang menambahkan reviewer saat PR ber-label `dependencies`).

### Ignore

```yaml
ignore:
  - dependency-name: "node-forge"
    versions:
      - "<1.4.0"
```

Parameter `ignore`:

| Parameter | Fungsi |
|---|---|
| `dependency-name` | Nama dependency, boleh pakai wildcard `*`. |
| `versions` | Daftar versi/range versi yang diabaikan. Untuk npm memakai sintaks semver: `"<1.4.0"`, `["4.x", "5.x"]`, `"^1.0.0"`. |
| `update-types` | Abaikan level update tertentu: `version-update:semver-major` / `...minor` / `...patch`. |

### Ringkasan opsi yang aktif di pdf-gate

| Opsi | npm | github-actions | Keterangan |
|---|---|---|---|
| `schedule` | weekly, Senin 06:00 WIB | weekly, Rabu 06:00 WIB | Lihat [§2](#2-jadwal-schedule) |
| `open-pull-requests-limit` | `10` | `5` | Maks PR version update terbuka bersamaan; security update tidak dihitung |
| `labels` | `["dependencies"]` | `["ci"]` | Ganti default `dependencies` |
| `commit-message` | `chore(deps)` / `chore(deps-dev)` + scope | `chore(ci)` + scope | Konsisten dengan konvensi commit repo |
| `groups` | `pdf-processing`, `dev-tooling`, `other-deps` | `actions-minor-patch` | Lihat [§3](#3-groups--kenapa-pr-di-batch) |
| `allow` + `ignore` | node-forge, brace-expansion | — | Lihat [§7](#7-alasan-ignore-untuk-node-forge-dan-brace-expansion) |

### Contoh kustomisasi yang sering dipakai

```yaml
- package-ecosystem: "npm"
  directory: "/"
  schedule:
    interval: "monthly"          # lebih jarang
  open-pull-requests-limit: 0    # MATIKAN version updates (security tetap jalan)
  assignees:
    - "tutupharirabu"
  milestone: 7
  ignore:
    - dependency-name: "pdfjs-dist"
      update-types: ["version-update:semver-major"]   # tunda major pdfjs-dist
```

> `open-pull-requests-limit: 0` hanya mematikan **version updates**. Security updates tidak terpengaruh dan tetap berjalan.

---

## 7. Alasan `ignore` untuk node-forge dan brace-expansion

Di `package.json` terdapat:

```jsonc
"overrides": {
  "node-forge": "^1.4.0",
  "brace-expansion": "^2.0.2"
}
```

Keduanya adalah **override keamanan** (npm `overrides`): memaksa versi aman untuk dependency transif (*transitive*). Contoh nyata di lockfile repo ini: ada dependency yang meminta `node-forge: ^0.10.0` (yang rentan terhadap CVE-2024-0975), dan override memaksanya naik ke `1.4.0`. Begitu pula `brace-expansion` dinaikkan dari `^1.1.7` ke `^2.0.2` (CVE-2019-18588).

**Kenapa kami menambahkan `allow` + `ignore` di dependabot.yml padahal Dependabot biasanya tidak membuka PR untuk dependency transif?**

- Dependabot version updates hanya meng-update dependency yang **eksplisit** di `package.json`. `node-forge` dan `brace-expansion` bukan dependency langsung, jadi secara normal tidak ada PR update untuk keduanya.
- Namun Dependabot **memperhitungkan `overrides`** saat mengevaluasi dependency transif. Konfigurasi `allow` + `ignore` ini bersifat *defense in depth* (jaring pengaman ganda):
  - `allow` membatasi update `node-forge` hanya ke `minor`/`patch` — mengizinkan naik ke versi yang lebih baru (mis. `1.5.x`) tetapi **tidak pernah turun ke bawah `1.4.0`**.
  - `ignore: versions: ["<1.4.0"]` memastikan Dependabot tidak pernah mengusulkan versi `node-forge` di bawah `1.4.0` untuk dependency mana pun — versi `<1.4.0` itulah yang rentan (CVE-2024-0975).
  - Hal yang sama untuk `brace-expansion`: jangan pernah mengusulkan versi `<2.0.2`.
- Batas bawah `1.4.0` dan `2.0.2` sengaja **tidak** ikut di-ignore (tidak ditulis sebagai `[">=1.4.0"]` yang meng-ignore semua versi lebih tinggi), karena justru naiknya versi di atas batas itu yang diinginkan.

Jika suatu saat memang ingin membiarkan Dependabot menawarkan versi `node-forge` yang lebih tua untuk alasan tertentu, hapus blok `ignore` (atau gunakan `@dependabot unignore node-forge` pada PR grup) — tetapi jangan lakukan itu tanpa alasan keamanan yang jelas.

---

## 8. Pemecahan masalah (troubleshooting)

Semua error konfigurasi Dependabot terlihat di tab **Insights → Dependency graph → Dependabot** (bukan di Actions). Sumber umum kegagalan:

### 8.1 "Dependabot can't resolve dependencies" / Gagal resolve npm

Kemungkinan penyebab:

- **Registry privat.** Repo ini memakai GitHub Packages untuk scope `@tutupharirabu` (lihat `.npmrc`). Dependabot perlu akses ke registry tersebut. Solusi:
  - Pastikan token akses tersedia sebagai secret, lalu daftarkan registry privat di `dependabot.yml`:
    ```yaml
    version: 2
    registries:
      npm-github:
        type: npm-registry
        url: https://npm.pkg.github.com
        token: "${{secrets.PDF_GATE_NPM_TOKEN}}"
    updates:
      - package-ecosystem: "npm"
        directory: "/"
        registries:
          - "npm-github"
        schedule:
          interval: "weekly"
    ```
  - Alternatif: karena `@tutupharirabu/pdf-gate` itu sendiri dipublikasikan ke GitHub Packages, pastikan secret PAT (`read:packages`) ditambahkan di **Settings → Secrets and variables → Actions**, lalu di-referensikan seperti di atas.
- **Kunci kredensial salah / kedaluwarsa** — regenerasi PAT dan perbarui secret.
- **Versi npm yang didukung.** Dependabot mendukung npm v7–v11; lockfile repo ini `lockfileVersion: 3` (npm v9+) sudah kompatibel.
- **`legacy-peer-deps=true`** di `.npmrc` — umumnya tidak masalah bagi Dependabot, tetapi jika ada konflik peer dependency, Dependabot menampilkan log resolusi; ikuti paket yang bermasalah di log tersebut.

### 8.2 Konfigurasi YAML salah secara diam-diam (silent failures)

Kesalahan paling sering terjadi bukan karena YAML tidak valid, melainkan karena **kunci yang salah eja / salah posisi**, yang membuat Dependabot mengabaikan sebagian konfigurasi tanpa error yang jelas:

| Salah ❌ | Benar ✅ |
|---|---|
| `interval: "weekly"` di level atas blok `updates` | `schedule: { interval: "weekly" }` — **`interval` WAJIB di dalam `schedule`** |
| `label: ["dependencies"]` | `labels: ["dependencies"]` (pakai bentuk jamak) |
| `limit: 10` | `open-pull-requests-limit: 10` |
| `groups: [ { name: ... } ]` (array) | `groups: { nama-grup: { patterns: [...] } }` (map/objek) |
| `pattern: "tesseract.js"` | `patterns: ["tesseract.js"]` (jamak) |
| `commit-message: { prefix: "chore(deps): " }` dengan titik dua | `prefix: "chore(deps)"` — Dependabot menambahkan `:` sendiri |
| `day: "Senin"` | `day: "monday"` (nama hari harus bahasa Inggris) |
| `interval: "every week"` | `interval: "weekly"` |

Cara verifikasi cepat: cek tab **Insights → Dependency graph → Dependabot** untuk log "last checked" dan daftar error, atau buka file di github.com (validasi YAML + skema dijalankan saat file di-commit). Juga bisa memakai [validator dependabot.yml milik komunitas](https://github.com/dependabot/dependabot-core) sebagai pemeriksaan kedua.

### 8.3 PR Dependabot tidak pernah muncul

1. Pastikan `.github/dependabot.yml` ada di **default branch** (`main`) — Dependabot hanya membaca dari default branch.
2. Cek **Insights → Dependency graph → Dependabot**: apakah "Last checked" sudah berjalan dan apakah ada pesan error.
3. Pastikan jadwal `schedule.day` sudah lewat (mis. `monday`) sejak konfigurasi di-commit.
4. Kalau `open-pull-requests-limit` sudah penuh (10 untuk npm, 5 untuk actions), PR baru tidak dibuat sampai ada yang di-merge/close.

### 8.4 CI gagal di PR Dependabot (typecheck / test)

- PR grup membawa beberapa dependency sekaligus; kalau gagal, coba komentari `@dependabot show <nama> ignore conditions` untuk melihat mana yang mencurigakan, atau `@dependabot ignore <nama>` untuk mengeluarkan satu dependency dari grup.
- Kalau failure berasal dari *major* update, ingat bahwa update `major` memang sengaja **tidak** di-group sehingga PR-nya terpisah dan mudah di-bisect.

### 8.5 "Dependabot tidak menawarkan update untuk dependency yang saya inginkan"

- **Dependency transif** (bukan di `package.json`) **tidak** dapat PR version update. Kalau mau dipantau, pindahkan ke `dependencies` atau tambahkan ke `allow` dengan `dependency-type: all`.
- Dependency yang versinya di-pin `overrides` ikut aturan override; Dependabot tidak akan menaikkan batas bawah override lewat PR version update.

---

## 9. Referensi

- [Dependabot options reference — GitHub Docs](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)
- [About the dependabot.yml file — GitHub Docs](https://docs.github.com/en/code-security/concepts/supply-chain-security/about-the-dependabot-yml-file)
- [Managing Dependabot pull requests — GitHub Docs](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/manage-your-dependency-security/manage-dependabot-prs)
- [Dependabot pull request comment commands — GitHub Docs](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-pull-request-comment-commands)
- [Controlling which dependencies are updated — GitHub Docs](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/manage-your-dependency-security/controlling-dependencies-updated)
- [Optimizing PR creation for version updates — GitHub Docs](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/optimizing-pr-creation-version-updates)
- [Dependabot errors — GitHub Docs](https://docs.github.com/code-security/dependabot/working-with-dependabot/troubleshooting-dependabot-errors)
