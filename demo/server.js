import express from 'express';
import multer from 'multer';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePDF, getAllSchemas, zeroBuffer } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB limit

// Multer in-memory storage for secure processing without saving to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

// Simple in-process concurrency guard: only one validation at a time.
let validating = false;

/**
 * Check that the uploaded bytes start with the PDF magic header.
 * @param {Buffer} buffer
 * @returns {boolean}
 */
function isPdfBuffer(buffer) {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-';
}

app.use(express.static(resolve(__dirname, 'public')));
app.use(express.json());

// Endpoint to list all registered schemas
app.get('/api/schemas', (req, res) => {
  try {
    const schemas = getAllSchemas();
    const list = [];
    for (const [name, schema] of schemas.entries()) {
      list.push({ name, label: schema.label });
    }
    res.json({ success: true, schemas: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint to validate PDF
app.post('/api/validate', upload.single('pdf'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Harap unggah file PDF.' });
  }

  // Magic-byte validation: reject non-PDF payloads before parsing.
  if (!isPdfBuffer(req.file.buffer)) {
    zeroBuffer(req.file.buffer);
    return res.status(400).json({ success: false, error: 'File bukan PDF — magic bytes tidak dikenali.' });
  }

  const schemaName = req.body.schema;
  if (!schemaName) {
    zeroBuffer(req.file.buffer);
    return res.status(400).json({ success: false, error: 'Harap tentukan skema dokumen.' });
  }

  if (validating) {
    zeroBuffer(req.file.buffer);
    return res.status(429).json({ success: false, error: 'Validasi sedang berjalan — coba lagi nanti.' });
  }
  validating = true;

  const skipLayer2 = req.body.skipLayer2 === 'true';

  try {
    const result = await validatePDF(req.file.buffer, {
      schema: schemaName,
      fileName: req.file.originalname,
      skipLayer2,
    });
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    validating = false;
    // Zero out buffer securely after validation
    zeroBuffer(req.file.buffer);
  }
});

// Multer / generic error-handling middleware (must be registered last).
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: `Ukuran file melebihi batas ${Math.floor(MAX_FILE_SIZE / (1024 * 1024))}MB.`,
      });
    }
    return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
  }
  if (err) {
    return res.status(500).json({ success: false, error: err.message || 'Terjadi kesalahan server.' });
  }
  next();
});

app.listen(port, host, () => {
  console.log(`\n  🚀  Demo server running at http://localhost:${port}\n`);
});
