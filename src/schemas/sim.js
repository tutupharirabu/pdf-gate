/**
 * @module schemas/sim
 * @description Schema definition for Indonesian Driving Licenses (Surat Izin Mengemudi).
 *              Per PRD §5 – SIM Schema.
 */

const fingerprints = [
  /surat\s+izin\s+mengemudi/i,
  /\bSIM\b/,
  /pengemudi/i,
  /golongan\s*darah/i,
];

const fingerprintMin = 2;

const heuristics = {
  minWords: 12,
  maxWords: 150,
};

const rules = [
  {
    id: 'nama',
    label: 'Nama Pemegang',
    pattern: /Nama\s*(:|\s{2,})\s*(.+)/i,
    required: true,
  },
  {
    id: 'nomor_sim',
    label: 'Nomor SIM',
    pattern: /(?:No(?:mor)?\s*(?:SIM)?|SIM)\s*(:|\s{2,})\s*\d{12}/i,
    required: true,
  },
  {
    id: 'tempat_lahir',
    label: 'Tempat Lahir',
    pattern: /(?:Tempat\s+Lahir|Tempat\s*\/\s*Tgl|TTL)\s*(:|\s{2,})\s*(.+)/i,
    required: true,
  },
  {
    id: 'tanggal_lahir',
    label: 'Tanggal Lahir',
    pattern: /(?:Tanggal\s+Lahir|Tgl\.?\s*Lahir)\s*(:|\s{2,})\s*\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/i,
    required: true,
  },
  {
    id: 'alamat',
    label: 'Alamat',
    pattern: /Alamat\s*(:|\s{2,})\s*(.+)/i,
    required: true,
  },
  {
    id: 'gol_darah',
    label: 'Golongan Darah',
    pattern: /Golongan\s*Darah\s*(:|\s{2,})\s*[ABO]/i,
    required: true,
  },
  {
    id: 'berlaku',
    label: 'Berlaku Sampai',
    pattern: /Berlaku\s*(?:Sampai|Hingga|s\/d)\s*(:|\s{2,})?\s*.+/i,
    required: false,
  },
  {
    id: 'jenis_sim',
    label: 'Jenis / Golongan SIM',
    pattern: /SIM\s*[ABCD]/i,
    required: false,
  },
];

const sim = {
  name: 'sim',
  fingerprints,
  fingerprintMin,
  heuristics,
  rules,
};

export default sim;
