/**
 * @module examples/custom-schema
 * @description Example of a custom schema defined as a JavaScript ESM module.
 *              Native RegExp objects are used directly — no string conversion needed.
 *
 *              Usage:
 *                pdf-validate ./doc.pdf --schema-file ./custom-schema.js
 *
 *              Or programmatically:
 *                import { registerSchema } from 'pdf-gate';
 *                import mySchema from './custom-schema.js';
 *                registerSchema(mySchema);
 */

export default {
  name: 'surat-keterangan',
  label: 'Surat Keterangan',
  fingerprints: [
    /surat\s+keterangan/i,
    /yang\s+bertanda\s+tangan/i,
    /menerangkan\s+bahwa/i,
  ],
  fingerprintMin: 2,
  heuristics: {
    minWords: 20,
    maxWords: 300,
  },
  rules: [
    {
      id: 'nomor',
      label: 'Nomor Surat',
      pattern: /nomor\s*:\s*[A-Z0-9\/\-\.]+/i,
      required: true,
    },
    {
      id: 'nama',
      label: 'Nama',
      pattern: /nama\s*:\s*[A-Za-z\s]+/i,
      required: true,
    },
    {
      id: 'keperluan',
      label: 'Keperluan',
      pattern: /keperluan\s*:\s*.+/i,
      required: true,
    },
    {
      id: 'ttd',
      label: 'Tanda Tangan',
      pattern: /(kepala|lurah|camat|ketua)\b/i,
      required: true,
    },
    {
      id: 'tanggal',
      label: 'Tanggal',
      pattern: /\d{1,2}\s+\w+\s+\d{4}/i,
      required: false,
    },
  ],
};
