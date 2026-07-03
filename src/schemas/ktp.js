/**
 * @module schemas/ktp
 * @description Schema definition for Indonesian ID cards (KTP Digital).
 *              Per PRD §5 – KTP Digital Schema.
 */

const fingerprints = [
  /\b(NIK|nomor\s+induk\s+kependudukan)\b/i,
  /\bkartu\s+tanda\s+penduduk\b/i,
  /\bkewarganegaraan\b/i,
  /\b\d{16}\b/,
];

const fingerprintMin = 2;

const heuristics = {
  minWords: 15,
  maxWords: 200,
};

const rules = [
  {
    id: 'nik',
    label: 'Nomor Induk Kependudukan',
    pattern: /(?:NIK|Nomor\s+Induk\s+Kependudukan)\s*(:|\s{2,})\s*\d{16}/i,
    required: true,
  },
  {
    id: 'nama',
    label: 'Nama Lengkap',
    pattern: /Nama\s*(:|\s{2,})\s*(.+)/i,
    required: true,
  },
  {
    id: 'tempatlahir',
    label: 'Tempat / Tanggal Lahir',
    pattern: /(?:Tempat\s*(?:\/|\s)T(?:gl|anggal)\.?\s*Lahir|Tempat\s+Lahir)\s*(:|\s{2,})\s*(.+)/i,
    required: true,
  },
  {
    id: 'alamat',
    label: 'Alamat',
    pattern: /Alamat\s*(:|\s{2,})\s*(.+)/i,
    required: true,
  },
  {
    id: 'agama',
    label: 'Agama',
    pattern: /Agama\s*(:|\s{2,})\s*(.+)/i,
    required: true,
  },
  {
    id: 'status',
    label: 'Status Perkawinan',
    pattern: /(?:Status\s*Perkawinan|Status\s*Pernikahan)\s*(:|\s{2,})\s*(.+)/i,
    required: false,
  },
  {
    id: 'pekerjaan',
    label: 'Pekerjaan',
    pattern: /Pekerjaan\s*(:|\s{2,})\s*(.+)/i,
    required: false,
  },
];

const ktp = {
  name: 'ktp',
  label: 'KTP Digital',
  fingerprints,
  fingerprintMin,
  heuristics,
  rules,
};

export default ktp;
