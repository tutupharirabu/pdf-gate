/**
 * @module schemas/ijazah
 * @description Schema definition for Indonesian university diplomas (Ijazah).
 *              Per PRD §5 – Ijazah Schema.
 */

const fingerprints = [
  /\bijazah\b/i,
  /dinyatakan\s+lulus/i,
  /\bgelar\b/i,
  /\b(sarjana|ahlimadya|diploma)\b/i,
  /telah\s+menyelesaikan/i,
];

const fingerprintMin = 2;

const heuristics = {
  minWords: 30,
  maxWords: 800,
};

const rules = [
  {
    id: 'nama',
    label: 'Nama Mahasiswa',
    pattern: /Nama\s*(:|\s{2,})\s*(.+)/i,
    required: true,
  },
  {
    id: 'nim',
    label: 'Nomor Induk Mahasiswa',
    pattern: /NIM\s*(:|\s{2,})\s*\d{7,15}/i,
    required: true,
  },
  {
    id: 'prodi',
    label: 'Program Studi',
    pattern: /Program\s+Studi\s*(:|\s{2,})\s*(.+)/i,
    required: true,
  },
  {
    id: 'lulus',
    label: 'Tanggal Kelulusan',
    pattern: /(?:dinyatakan\s+lulus\s+pada\s+tanggal|tanggal\s+lulus|lulus\s+pada)\s*(:|\s{2,})?\s*.+/i,
    required: true,
  },
  {
    id: 'kampus',
    label: 'Nama Perguruan Tinggi',
    pattern: /(?:Universitas|Institut|Politeknik|Sekolah\s+Tinggi)\s+.+/i,
    required: true,
  },
  {
    id: 'penandatangan',
    label: 'Pejabat Penandatangan',
    pattern: /(?:Rektor|Direktur|Dekan|Ketua|Pimpinan)\s*.+/i,
    required: true,
  },
  {
    id: 'nomor',
    label: 'Nomor Ijazah',
    pattern: /(?:No(?:mor)?\s*(?:Ijazah)?)\s*(:|\s{2,})\s*[\d./\-A-Z]+/i,
    required: false,
  },
  {
    id: 'akreditasi',
    label: 'Akreditasi Program Studi',
    pattern: /(?:Akreditasi|Terakreditasi|BAN\s*-?\s*PT)\s*(:|\s{2,})?\s*.+/i,
    required: false,
  },
];

const ijazah = {
  name: 'ijazah',
  label: 'Ijazah',
  fingerprints,
  fingerprintMin,
  heuristics,
  rules,
};

export default ijazah;
