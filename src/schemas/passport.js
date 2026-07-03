/**
 * @module schemas/passport
 * @description Schema definition for Indonesian Passports (Paspor Indonesia).
 *              Per PRD §5 – Paspor Schema.
 */

const fingerprints = [
  /\bpaspor\b/i,
  /republik\s+indonesia/i,
  /imigrasi/i,
  /kewarganegaraan\s*:\s*indonesia/i,
];

const fingerprintMin = 2;

const heuristics = {
  minWords: 15,
  maxWords: 200,
};

const rules = [
  {
    id: 'nomor_paspor',
    label: 'Nomor Paspor',
    pattern: /(?:Nomor\s*(?:Paspor)?|No\.?\s*(?:Paspor)?|Paspor)\s*(:|\s{2,})\s*[A-Z]\d{6,8}/i,
    required: true,
  },
  {
    id: 'nama',
    label: 'Nama Lengkap',
    pattern: /Nama\s*(?:Lengkap)?\s*(:|\s{2,})\s*(.+)/i,
    required: true,
  },
  {
    id: 'kewarganegaraan',
    label: 'Kewarganegaraan',
    pattern: /Kewarganegaraan\s*(:|\s{2,})\s*(.+)/i,
    required: true,
  },
  {
    id: 'tempat_lahir',
    label: 'Tempat Lahir',
    pattern: /(?:Tempat\s+Lahir|Tempat\s*\/\s*Tgl)\s*(:|\s{2,})\s*(.+)/i,
    required: true,
  },
  {
    id: 'tanggal_lahir',
    label: 'Tanggal Lahir',
    pattern: /(?:Tanggal\s+Lahir|Tgl\.?\s*Lahir)\s*(:|\s{2,})\s*.+/i,
    required: true,
  },
  {
    id: 'berlaku',
    label: 'Masa Berlaku',
    pattern: /(?:Berlaku\s*(?:Sampai|Hingga)|Masa\s+Berlaku|Expiry)\s*(:|\s{2,})?\s*.+/i,
    required: true,
  },
  {
    id: 'jenis_kelamin',
    label: 'Jenis Kelamin',
    pattern: /Jenis\s+Kelamin\s*(:|\s{2,})\s*(.+)/i,
    required: false,
  },
  {
    id: 'tempat_dikeluarkan',
    label: 'Tempat Dikeluarkan',
    pattern: /(?:Tempat\s+Dikeluarkan|Dikeluarkan\s+di|Tempat\s+Penerbitan)\s*(:|\s{2,})\s*(.+)/i,
    required: false,
  },
  {
    id: 'nomor_ktp',
    label: 'Nomor KTP / NIK',
    pattern: /(?:NIK|Nomor\s+KTP|KTP)\s*(:|\s{2,})\s*\d{16}/i,
    required: false,
  },
];

const passport = {
  name: 'passport',
  fingerprints,
  fingerprintMin,
  heuristics,
  rules,
};

export default passport;
