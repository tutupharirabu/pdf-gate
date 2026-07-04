/**
 * @module layer1/detector
 * @description Gate 2 - Fingerprint-based document type detection.
 */

function matchFingerprints(fullText, schema) {
  const matches = [];
  for (const fp of schema.fingerprints) {
    if (fp.test(fullText)) {
      matches.push(fp.source);
    }
  }
  return matches;
}

function displayName(name) {
  const labels = {
    ijazah: 'Ijazah',
    transkrip: 'Transkrip Nilai',
    sertifikat: 'Sertifikat',
    ktp: 'KTP',
    'akte-kelahiran': 'Akte Kelahiran',
    sim: 'SIM',
    passport: 'Paspor',
    kk: 'Kartu Keluarga',
  };
  return labels[name] || name;
}

export function detectDocumentType(fullText, selectedSchema, allSchemas) {
  const selectedMatches = matchFingerprints(fullText, selectedSchema);
  const minRequired = selectedSchema.fingerprintMin;

  if (selectedMatches.length >= minRequired) {
    return {
      passed: true,
      detectedType: selectedSchema.name,
      failReason: null,
      matches: selectedMatches,
    };
  }

  const schemaEntries =
    allSchemas instanceof Map
      ? [...allSchemas.entries()]
      : Object.entries(allSchemas);

  for (const [name, schema] of schemaEntries) {
    if (name === selectedSchema.name) continue;

    const otherMatches = matchFingerprints(fullText, schema);
    if (otherMatches.length >= schema.fingerprintMin) {
      return {
        passed: false,
        detectedType: name,
        failReason:
          'Dokumen terdeteksi sebagai "' +
          displayName(name) +
          '", bukan "' +
          displayName(selectedSchema.name) +
          '" yang dipilih.',
        matches: selectedMatches,
      };
    }
  }

  // Build dynamic list of known document types from registered schemas
  const knownTypes = [...allSchemas.keys()]
    .map((n) => displayName(n))
    .join(', ');

  return {
    passed: false,
    detectedType: null,
    failReason:
      'Tipe dokumen tidak dikenali — dikenal: ' + knownTypes + '.',
    matches: selectedMatches,
  };
}
