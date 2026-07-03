/**
 * @module schemas/akte-kelahiran
 * @description Schema definition for Indonesian Birth Certificates (Akte Kelahiran).
 *              Per PRD §5 – Akte Kelahiran Schema.
 */

const fingerprints = [
  /akte\s+kelahiran/i,
  /catatan\s+sipil/i,
  /dilahirkan\s+di/i,
  /anak\s+ke/i,
];

const fingerprintMin = 2;

const heuristics = {
  minWords: 20,
  maxWords: 300,
};

const rules = [
  {
    id: 'nama',
    label: 'Nama Bayi',
    pattern: /Nama\s*(:|\s{2,})\s*(.+)/i,
    required: true,
  },
  {
    id: 'tempat_lahir',
    label: 'Tempat Lahir',
    pattern: /(?:Tempat\s+Lahir|Dilahirkan\s+di)\s*(:|\s{2,})\s*(.+)/i,
    required: true,
  },
  {
    id: 'tanggal_lahir',
    label: 'Tanggal Lahir',
    pattern: /(?:Tanggal\s+Lahir|Tanggal)\s*(:|\s{2,})\s*\d{1,2}\s+\w+\s+\d{4}/i,
    required: true,
  },
  {
    id: 'nama_ayah',
    label: 'Nama Ayah',
    pattern: /(?:Nama\s+Ayah|Ayah)\s*(:|\s{2,})\s*(.+)/i,
    required: true,
  },
  {
    id: 'nama_ibu',
    label: 'Nama Ibu',
    pattern: /(?:Nama\s+Ibu|Ibu)\s*(:|\s{2,})\s*(.+)/i,
    required: true,
  },
  {
    id: 'nomor',
    label: 'Nomor Akte',
    pattern: /(?:Nomor\s*(?:Akte|Akta)|No\.?\s*(?:Akte|Akta))\s*(:|\s{2,})\s*[\d./\-A-Z]+/i,
    required: true,
  },
  {
    id: 'jenis_kelamin',
    label: 'Jenis Kelamin',
    pattern: /Jenis\s+Kelamin\s*(:|\s{2,})\s*(.+)/i,
    required: false,
  },
  {
    id: 'anak_ke',
    label: 'Anak Ke',
    pattern: /Anak\s+(?:Ke|ke)\s*(:|\s{2,})?\s*\d+/i,
    required: false,
  },
];

const akteKelahiran = {
  name: 'akte-kelahiran',
  fingerprints,
  fingerprintMin,
  heuristics,
  rules,
};

export default akteKelahiran;
