#!/usr/bin/env node

/**
 * @module pdf-gate/cli
 * @description CLI entry-point for pdf-gate. Exposes the `pdf-validate` binary.
 *
 *              Supports pretty-print (default), JSON output, and quiet mode.
 *
 * @license MIT
 */

import { readFileSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import { validatePDF, SCHEMAS, registerSchema, loadSchemaFromFile, generateSchema } from '../src/index.js';
import { MAX_BUFFER_SIZE } from '../src/utils/sanitizer.js';

const program = new Command();

program
  .name('pdf-validate')
  .description('Dual-layer PDF document validator — sanity check + cryptographic signature verification')
  .version(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')).version)
  .argument('[file]', 'Path to the PDF file to validate')
  .option('-s, --schema <name>', 'Schema name or registered custom schema name')
  .option('-f, --schema-file <path...>', 'Load external schema from .json or .js file (repeatable)')
  .option('--json', 'Output result as JSON')
  .option('-q, --quiet', 'Only print status; exit code 1 if FAILED')
  .option('--skip-crypto', 'Skip Layer 2 cryptographic verification')
  .option('--skip-layer2', 'Alias for --skip-crypto')
  .option('--list-schemas', 'List all available schema names')
  .option('--generate-schema <file>', 'Generate schema from a template PDF file')
  .option('--schema-name <name>', 'Name for the generated schema')
  .option('--schema-label <label>', 'Human-readable label for the generated schema')
  .option('-o, --output <path>', 'Save generated schema to a JSON file')
  .action(async (file, options) => {
    try {
      // ── List schemas ──────────────────────────────────────────────
      if (options.listSchemas) {
        listSchemas();
        process.exit(0);
      }

      // ── Generate schema ────────────────────────────────────────────
      if (options.generateSchema) {
        await handleGenerateSchema(options);
        return;
      }

      // ── Validate ───────────────────────────────────────────────────
      if (!file) {
        program.error('Harap berikan path file PDF. Gunakan --help untuk informasi.');
      }

      if (!options.schema) {
        program.error('Harap tentukan --schema <name>. Gunakan --list-schemas untuk melihat opsi.');
      }

      await handleValidate(file, options);
    } catch (err) {
      if (options.json) {
        console.log(JSON.stringify({ error: err.message }, null, 2));
      } else {
        console.error(pc.red(`\n  Error: ${err.message}`));
      }
      process.exit(1);
    }
  });

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleValidate(file, options) {
  const filePath = resolve(file);

  if (!existsSync(filePath)) {
    throw new Error(`File tidak ditemukan: ${filePath}`);
  }

  // Load external schemas (before reading the PDF)
  if (options.schemaFile) {
    for (const schemaPath of options.schemaFile) {
      const absPath = resolve(schemaPath);
      await loadSchemaFromFile(absPath, { allowedRoot: null }); // trusted: operator-supplied CLI path
    }
  }

  // File size check before reading to prevent OOM
  const stats = statSync(filePath);
  if (stats.size > MAX_BUFFER_SIZE) {
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    const maxMB = MAX_BUFFER_SIZE / 1024 / 1024;
    throw new Error(
      `File terlalu besar (${sizeMB} MB) melebihi batas ${maxMB} MB. ` +
      'Tolak demi keamanan.',
    );
  }

  const buffer = readFileSync(filePath);
  const skipLayer2 = options.skipCrypto || options.skipLayer2 || false;

  const result = await validatePDF(buffer, {
    schema: options.schema,
    fileName: basename(filePath),
    skipLayer2,
  });

  if (options.quiet) {
    console.log(result.status);
    process.exit(result.status === 'FAILED' ? 1 : 0);
  }

  if (options.json) {
    // Serialize RegExp fields for JSON output
    const safe = JSON.parse(JSON.stringify(result, (key, value) => {
      if (value instanceof RegExp) return value.toString();
      return value;
    }));
    console.log(JSON.stringify(safe, null, 2));
    process.exit(result.status === 'FAILED' ? 1 : 0);
  }

  // Pretty print
  prettyPrint(result);
  process.exit(result.status === 'FAILED' ? 1 : 0);
}

async function handleGenerateSchema(options) {
  const templatePath = resolve(options.generateSchema);
  if (!existsSync(templatePath)) {
    throw new Error(`File template tidak ditemukan: ${templatePath}`);
  }

  if (!options.schemaName || !options.schemaLabel) {
    program.error('--schema-name dan --schema-label wajib diisi saat --generate-schema digunakan.');
  }

  const buffer = readFileSync(templatePath);
  const { schema, confidence, detectedFields, warnings } = await generateSchema(buffer, {
    name: options.schemaName,
    label: options.schemaLabel,
  });

  // Register the schema
  registerSchema(schema);

  // Pretty print generation result
  console.log(pc.bold('\n  Schema Generated'));
  console.log('  ' + '─'.repeat(50));
  console.log(pc.cyan(`  Name:       ${schema.name}`));
  console.log(pc.cyan(`  Label:      ${schema.label}`));
  console.log(pc.cyan(`  Confidence: ${(confidence * 100).toFixed(1)}%`));
  console.log(pc.cyan(`  Fields:     ${detectedFields.length}`));
  console.log(pc.cyan(`  Rules:      ${schema.rules.length}`));
  console.log(pc.cyan(`  Fingerprints: ${schema.fingerprints.length}`));

  if (warnings.length > 0) {
    console.log(pc.yellow('\n  Warnings:'));
    warnings.forEach(w => console.log(pc.yellow(`    ⚠  ${w}`)));
  }

  console.log(pc.green(`\n  ✓ Schema "${schema.name}" registered. Dapat digunakan dengan: --schema ${schema.name}`));

  // Write to file if --output specified
  if (options.output) {
    const outPath = resolve(options.output);
    if (existsSync(outPath)) {
      console.log(pc.yellow(`  ⚠  Overwriting existing file: ${outPath}`));
    }
    const jsonSchema = schemaToJSON(schema);
    writeFileSync(outPath, JSON.stringify(jsonSchema, null, 2), 'utf-8');
    console.log(pc.green(`  ✓ Saved to: ${outPath}`));
  }

  console.log();
  process.exit(0);
}

function listSchemas() {
  console.log(pc.bold('\n  Available Schemas'));
  console.log('  ' + '─'.repeat(50));
  for (const [name, schema] of SCHEMAS) {
    console.log(`  ${pc.cyan(name.padEnd(20))} ${schema.label}`);
  }
  console.log(`\n  Total: ${SCHEMAS.size} schemas\n`);
}

function prettyPrint(result) {
  const icon = result.status === 'VERIFIED' ? '✓' : result.status === 'PLAUSIBLE' ? '⚠' : '✗';
  const color = result.status === 'VERIFIED' ? pc.green : result.status === 'PLAUSIBLE' ? pc.yellow : pc.red;

  console.log(color.bold(`\n  ${icon} Status: ${result.status}`));
  console.log('  ' + '─'.repeat(50));
  console.log(`  Schema:     ${result.schema}`);
  console.log(`  File:       ${result.fileName || '-'}`);
  console.log(`  Size:       ${result.fileSizeKb} KB`);
  console.log(`  Pages:      ${result.pageCount}`);
  console.log(`  Duration:   ${result.totalDurationMs}ms`);
  console.log(`  Timestamp:  ${result.timestamp}`);

  // Layer 1
  console.log(pc.bold('\n  Layer 1 — Sanity Check'));
  console.log('  ' + '─'.repeat(50));
  if (result.layer1.passed) {
    console.log(pc.green(`  ✓ Passed (${result.layer1.durationMs}ms)`));
  } else {
    console.log(pc.red(`  ✗ Failed: ${result.layer1.failReason}`));
  }
  if (result.layer1.detectedType) {
    console.log(`  Detected:   ${result.layer1.detectedType}`);
  }
  if (result.layer1.heuristics) {
    console.log(`  Word count: ${result.layer1.heuristics.wordCount}`);
    if (result.layer1.heuristics.flags.length > 0) {
      result.layer1.heuristics.flags.forEach(f => console.log(pc.yellow(`  ⚠ Flag: ${f}`)));
    }
  }

  // Field rules
  if (result.layer1.rules && result.layer1.rules.length > 0) {
    console.log(pc.bold('\n  Field Rules'));
    console.log('  ' + '─'.repeat(50));
    for (const rule of result.layer1.rules) {
      const mark = rule.passed ? pc.green('✓') : pc.red('✗');
      const req = rule.required ? '(wajib)' : '(opsional)';
      console.log(`  ${mark} ${rule.label} ${pc.dim(req)}`);
      if (rule.found) {
        console.log(`    ${pc.dim('→')} ${pc.dim(rule.found)}`);
      }
    }
  }

  // Layer 2
  console.log(pc.bold('\n  Layer 2 — Cryptographic Verification'));
  console.log('  ' + '─'.repeat(50));
  if (result.layer2.hasSignature) {
    console.log(`  Signature:  ${pc.green('Present')}`);
    console.log(`  Verified:   ${result.layer2.passed ? pc.green('Yes') : pc.red('No')}`);
    if (result.layer2.issuer) console.log(`  Issuer:     ${result.layer2.issuer}`);
    if (result.layer2.issuedTo) console.log(`  Issued to:  ${result.layer2.issuedTo}`);
    if (result.layer2.validFrom) console.log(`  Valid from: ${result.layer2.validFrom}`);
    if (result.layer2.validTo) console.log(`  Valid to:   ${result.layer2.validTo}`);
    if (result.layer2.signedAt) console.log(`  Signed at:  ${result.layer2.signedAt}`);
    if (result.layer2.certExpired) console.log(pc.red(`  Certificate EXPIRED`));
    if (!result.layer2.integrityOk) console.log(pc.red(`  Integrity:  FAILED`));
    if (result.layer2.failReason) console.log(pc.red(`  Reason:     ${result.layer2.failReason}`));
  } else {
    console.log(pc.dim(`  No digital signature detected`));
  }
  console.log();
}

/**
 * Convert a Schema object to a JSON-safe representation (RegExp → string).
 * @param {import('../src/types.js').Schema} schema
 * @returns {object}
 */
function schemaToJSON(schema) {
  return {
    name: schema.name,
    label: schema.label,
    fingerprints: schema.fingerprints.map(r => r.toString()),
    fingerprintMin: schema.fingerprintMin,
    heuristics: { ...schema.heuristics },
    rules: schema.rules.map(r => ({
      ...r,
      pattern: r.pattern instanceof RegExp ? r.pattern.toString() : r.pattern,
    })),
  };
}

// ── Entry ──────────────────────────────────────────────────────────────────────

program.parse();
