/**
 * @module schemas/kk
 * @description Schema definition for Indonesian Family Cards (Kartu Keluarga).
 *              Per PRD §5 – Kartu Keluarga Schema.
 */

const fingerprints = [
  /kartu\s+keluarga/i,
  /\bKK\b/,
  /kepala\s+keluarga/i,
  /nomor\s+kk/i,
  /susunan\s+keluarga/i,
];

const fingerprintMin = 2;

const heuristics = {
  minWords: 25,
  maxWords: 500,
};

const rules = [
  {
    id: 'nomor_kk',
    label: 'Nomor Kartu Keluarga',
    pattern: /(?:No(?:mor)?\s*(?:KK|Kartu\s+Keluarga)?|KK)\s*(:|\s{2,})\s*\d{16}/i,
    required: true,
  },
  {
    id: 'kepala_keluarga',
    label: 'Kepala Keluarga',
    pattern: /Kepala\s+Keluarga\s*(:|\s{2,})\s*(.+)/i,
    required: true,
  },
  {
    id: 'alamat',
    label: 'Alamat',
    pattern: /Alamat\s*(:|\s{2,})\s*(.+)/i,
    required: true,
  },
  {
    id: 'anggota',
    label: 'Daftar Anggota Keluarga',
    pattern: /(?:Nama\s+Anggota|Susunan\s+Keluarga|Daftar\s+Anggota|Anggota\s+Keluarga)\s*(:|\s{2,})?/i,
    required: true,
  },
  {
    id: 'rt_rw',
    label: 'RT / RW',
    pattern: /(?:RT|RW)\s*(:|\s{2,})?\s*\d+/i,
    required: false,
  },
  {
    id: 'kelurahan',
    label: 'Kelurahan / Desa',
    pattern: /(?:Kelurahan|Desa)\s*(:|\s{2,})\s*(.+)/i,
    required: false,
  },
  {
    id: 'kecamatan',
    label: 'Kecamatan',
    pattern: /Kecamatan\s*(:|\s{2,})\s*(.+)/i,
    required: false,
  },
  {
    id: 'kota',
    label: 'Kota / Kabupaten',
    pattern: /(?:Kota|Kabupaten|Kotamadya)\s*(:|\s{2,})\s*(.+)/i,
    required: false,
  },
];

const kk = {
  name: 'kk',
  fingerprints,
  fingerprintMin,
  heuristics,
  rules,
};

export default kk;
