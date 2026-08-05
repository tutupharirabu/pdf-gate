# Design Spec — OCR Support for Scanned PDFs

- **Date:** 2026-08-04
- **Status:** In progress (implementation running in parallel)
- **Affected surface:** `src/ocr/*` (new), `src/index.js`, `src/types.js`, `src/utils/sanitizer.js`, `cli/index.js`, README, `test/ocr.test.js` (new)

## 1. Goals

1. Validate **scanned PDFs** (no extractable text) that currently fail Layer 1 with
   `"PDF tidak memiliki teks - kemungkinan hasil scan"`.
2. Keep the **zero-trust** property: OCR runs fully local via `tesseract.js` WASM +
   bundled `traineddata` — **no network requests at any point**.
3. OCR text feeds the existing Layer 1 pipeline (fingerprint matching, heuristics,
   field rules) so scanned documents validate identically to digital ones.
4. Preserve existing behavior for digital PDFs: OCR is **opt-in by default** and must
   never regress the current result shape or exit codes.

## 2. Non-Goals

- No barcode/QR decoding.
- No document image enhancement (deskew, denoise, binarization) beyond what
  `@napi-rs/canvas` rasterization provides.
- No OCR for Layer 2 (cryptographic verification is independent of text content).
- No remote/cloud OCR providers.

## 3. Architecture

```
PDF buffer
   │
   ▼
┌─────────────────────────────────────────────────────────────┐
│ src/ocr/index.js     — orchestrator: trigger decision,       │
│                        page-limit guard, timing, metadata    │
├─────────────────────────────────────────────────────────────┤
│ src/ocr/rasterizer.js — pdfjs-dist → @napi-rs/canvas         │
│                        (page → PNG bitmap per page)          │
├─────────────────────────────────────────────────────────────┤
│ src/ocr/engine.js    — tesseract.js v6 (WASM worker),        │
│                        lazy-loaded via dynamic import,       │
│                        language packs from traineddata/      │
├─────────────────────────────────────────────────────────────┤
│ src/ocr/traineddata/ — bundled ind.traineddata +             │
│                        eng.traineddata (Apache-2.0)          │
└─────────────────────────────────────────────────────────────┘
   │  extracted text (ind+eng)
   ▼
Layer 1 — fingerprint → heuristics → field rules (unchanged)
```

### Key decisions

- **Lazy-loading:** `tesseract.js` and `@napi-rs/canvas` are imported via dynamic
  `import()` inside the OCR orchestrator, not at module top-level. Packages that
  import `validatePDF` for digital-only validation never pay the engine startup cost.
- **WASM + local traineddata:** `tesseract.js` runs its worker in WASM mode with
  `langPath` pointed at the bundled `traineddata/` directory, so there is no
  CDN fetch (the tesseract.js default would otherwise download language files).
- **Reuse Layer 1:** OCR output is a plain text string; the existing Layer 1 gates
  consume it identically to extracted text.

## 4. API Contract

### `validatePDF(buffer, options)` — new options

| Option | Type | Default | Description |
|---|---|---|---|
| `ocr` | `boolean` | auto | Force OCR even when the PDF has extractable text. |
| `ocrLanguages` | `string[]` | `['ind','eng']` | tesseract.js language codes to load. |
| `ocrPageLimit` | `number` | `10` | Max pages for **automatic** OCR only; ignored when `ocr: true`. |

### Result shape — `layer1.ocr`

`null` when OCR never ran; otherwise:

```js
layer1.ocr: {
  used: true,             // true when OCR was attempted
  engine: "tesseract.js@6.0.1", // engine identifier, or null on failure
  languages: ['ind', 'eng'],
  confidence: 0.92,       // average confidence 0–1, or null when failed
  durationMs: 1843,       // wall-clock OCR processing time
  pages: 2,               // pages processed
  charCount: 2410,        // characters of OCR text produced
  error: null,            // error message when OCR failed, else null
}
```

## 5. Trigger Logic

```
shouldRunOcr(text, pageCount, options):
  if options.ocr === true:
    run = true                      # forced — ignore ocrPageLimit
  else if text.trim().length >= 10:
    run = false                     # digital PDF, text exists
  else if pageCount > options.ocrPageLimit (default 10):
    run = false                     # too expensive to auto-OCR
  else:
    run = true                      # scanned / empty text, within limit
```

- **Auto-trigger:** text < 10 chars **and** pages ≤ `ocrPageLimit`.
- **Forced:** `ocr: true` runs OCR unconditionally (all pages, all languages).
- CLI maps to this via `--ocr` (force) and `--ocr-langs` (languages); no
  `--ocr-page-limit` flag — the default 10 applies.

## 6. Error Handling Policy

- **OCR failure never fails the document.** If OCR throws or produces nothing
  usable, the run is recorded as failed and the original Layer 1 outcome is kept:
  - `layer1.passed` / `layer1.failReason` stay exactly as they were computed
    without OCR (e.g. the original `"PDF tidak memiliki teks…"` reason).
  - `layer1.ocr` is populated with `used: true`, `confidence: null`,
    `error: <message>` and the partial metadata (duration, pages, charCount).
- Layer 2 is untouched by OCR state.
- Timing: `layer1.durationMs` includes OCR time when it runs; `totalDurationMs`
  naturally follows.

## 7. Dependencies

| Dependency | Version | Purpose |
|---|---|---|
| `tesseract.js` | `^7` | WASM OCR engine (worker-based). |
| `@napi-rs/canvas` | `^1` | Native rasterization of PDF pages to PNG bitmaps. |
| `pdfjs-dist` | already present | Page rendering source for the rasterizer. |
| `traineddata` (`ind`, `eng`) | bundled | Apache-2.0, from `tesseract-ocr/tessdata_best` (~23MB combined). |

Package size impact: published artifact grows to **~50MB** (traineddata dominates);
core validation logic remains **< 50KB**. README tagline updated to clarify:
"core validation < 50KB, OCR engine optional".

## 8. Testing Strategy

| Test | Approach |
|---|---|
| Synthetic PNG fixtures | Generate tiny images with known text via `@napi-rs/canvas` in test setup; assert OCR output contains the expected tokens (language: `eng` for fixture determinism). |
| Empty-PDF auto-trigger | A PDF with no extractable text must set `layer1.ocr.used === true` and reach the full Layer 1 pipeline with OCR text. |
| Forced OCR | `ocr: true` on a digital PDF with extractable text must still run OCR and set `layer1.ocr.used === true`. |
| Page-limit guard | Auto-OCR on a >10-page empty PDF must not run (`layer1.ocr === null`), preserving the original failReason. |
| Mocked engine unit tests | Mock the tesseract worker to (a) resolve with text, (b) reject — assert failure path keeps `failReason` and sets `layer1.ocr.error`. |
| CLI | `--ocr` / `--ocr-langs` forwarding (no flags → options object omits OCR keys; `--ocr-langs "ind, eng"` → `['ind','eng']`). |

## 9. Known Risks

1. **`@napi-rs/canvas` native prebuilds** — requires a matching prebuilt binary per
   platform/Node version; on unsupported platforms the rasterizer import fails.
   Mitigation: rasterizer is lazy-loaded; failure is caught and recorded in
   `layer1.ocr.error` (document still validates without OCR).
2. **tesseract.js worker behavior in Node** — worker spawning depends on
   `worker_threads`; in constrained CI/sandbox environments worker creation can be
   slow or fail. Mitigation: single shared worker instance per run, explicit
   terminate in `finally`, and the non-fatal error policy above.
3. **Bundle size** — ~50MB package affects install time and npm pack size; mitigated
   by keeping the traineddata in `src/ocr/traineddata/` (already shipped via the
   `src/` `files` glob) and lazy-loading the engine.
4. **OCR quality on Indonesian documents** — `tessdata_best` ind+eng is a heuristic
   improvement, not a guarantee; low confidence does not fail the document and is
   surfaced via `layer1.ocr.confidence` for downstream decisioning.
5. **Memory** — rasterizing many pages holds bitmaps in memory; the 10-page default
   cap bounds worst-case usage for automatic runs.
