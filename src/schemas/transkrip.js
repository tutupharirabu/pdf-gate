/**
 * @module schemas/transkrip
 * @description Schema definition for academic transcripts (Transkrip Nilai).
 *              Per PRD §5 – Transkrip Nilai Schema.
 */

const fingerprints = [
  /\btranskrip\b/i,
  /\b(indeks\s+prestasi|IPK|GPA)\b/i,
  /\bSKS\b|\bsatuan\s+kredit/i,
  /\b(mata\s+kuliah|matakuliah)\b/i,
];

const fingerprintMin = 2;

const heuristics = {
  minWords: 80,
  maxWords: 3000,
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
    id: 'ipk',
    label: 'Indeks Prestasi Kumulatif',
    pattern: /(?:IPK|Indeks\s+Prestasi\s+Kumulatif|GPA)\s*(:|\s{2,})\s*[\d.,]+/i,
    required: true,
  },
  {
    id: 'sks',
    label: 'Total Satuan Kredit Semester',
    pattern: /(?:SKS|Satuan\s+Kredit\s+Semester|Total\s+SKS)\s*(:|\s{2,})\s*\d+/i,
    required: true,
  },
  {
    id: 'matkul',
    label: 'Daftar Mata Kuliah',
    pattern: /(?:Mata\s+Kuliah|Matakuliah|Kode\s+MK)\s*(:|\s{2,})?/i,
    required: true,
  },
  {
    id: 'nilai',
    label: 'Nilai / Huruf Mutu',
    pattern: /(?:Nilai|Huruf\s+Mutu|Grade|Bobot)\s*(:|\s{2,})?/i,
    required: true,
  },
  {
    id: 'kampus',
    label: 'Nama Perguruan Tinggi',
    pattern: /(?:Universitas|Institut|Politeknik|Sekolah\s+Tinggi)\s+.+/i,
    required: true,
  },
];

const transkrip = {
  name: 'transkrip',
  fingerprints,
  fingerprintMin,
  heuristics,
  rules,
};

export default transkrip;
