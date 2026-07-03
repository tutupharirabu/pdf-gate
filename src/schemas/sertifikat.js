/**
 * @module schemas/sertifikat
 * @description Schema definition for certificates (Sertifikat).
 *              Per PRD §5 – Sertifikat Schema.
 */

const fingerprints = [
  /\bsertifikat\b/i,
  /\btelah\s+(mengikuti|menyelesaikan|lulus)\b/i,
  /\bdinyatakan\s+kompeten\b/i,
  /\b(pelatihan|training|bootcamp)\b/i,
];

const fingerprintMin = 2;

const heuristics = {
  minWords: 20,
  maxWords: 600,
};

const rules = [
  {
    id: 'nama',
    label: 'Nama Peserta',
    pattern: /(?:Nama|Peserta|diberikan\s+kepada)\s*(:|\s{2,})\s*(.+)/i,
    required: true,
  },
  {
    id: 'judul',
    label: 'Judul / Nama Program',
    pattern: /(?:Judul|Program|Pelatihan|Training|Bootcamp|Kursus)\s*(:|\s{2,})\s*(.+)/i,
    required: true,
  },
  {
    id: 'tanggal',
    label: 'Tanggal Penerbitan',
    pattern: /(?:Tanggal|Dikeluarkan\s+pada|Diterbitkan\s+pada|pada\s+tanggal)\s*(:|\s{2,})?\s*.+/i,
    required: true,
  },
  {
    id: 'lembaga',
    label: 'Lembaga Penerbit',
    pattern: /(?:Lembaga|Dikeluarkan\s+oleh|Diterbitkan\s+oleh|Diselenggarakan\s+oleh)\s*(:|\s{2,})\s*(.+)/i,
    required: true,
  },
  {
    id: 'nomor',
    label: 'Nomor Sertifikat',
    pattern: /(?:No(?:mor)?\s*(?:Sertifikat)?)\s*(:|\s{2,})\s*[\d./\-A-Z]+/i,
    required: false,
  },
  {
    id: 'ttd',
    label: 'Tanda Tangan / Pengesahan',
    pattern: /(?:Tanda\s+Tangan|Mengetahui|Mengesahkan|Direktur|Ketua|Pimpinan)\s*.+/i,
    required: false,
  },
];

const sertifikat = {
  name: 'sertifikat',
  fingerprints,
  fingerprintMin,
  heuristics,
  rules,
};

export default sertifikat;
