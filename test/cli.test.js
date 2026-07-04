/**
 * @module test/cli.test
 * @description Integration tests for the pdf-gate CLI.
 */

import { exec } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, '../cli/index.js');

function runCLI(args) {
  return new Promise((resolve) => {
    exec(`node ${CLI_PATH} ${args}`, (error, stdout, stderr) => {
      resolve({
        code: error ? error.code : 0,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
      });
    });
  });
}

describe('CLI — pdf-validate integration tests', () => {
  test('exits with 0 and lists schemas when --list-schemas is passed', async () => {
    const result = await runCLI('--list-schemas');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Available Schemas');
    expect(result.stdout).toContain('ijazah');
    expect(result.stdout).toContain('ktp');
  });

  test('exits with 1 and prints help if file and schema are missing', async () => {
    const result = await runCLI('');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Harap berikan path file PDF');
  });

  test('exits with 1 and prints error when file is not found', async () => {
    const result = await runCLI('--schema ijazah test/non-existent-file-that-does-not-exist.pdf');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('File tidak ditemukan');
  });

  test('exits with 1 and prevents execution on path traversal input', async () => {
    const result = await runCLI('--schema ijazah test/../some-file.pdf');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Akses ditolak');
  });
});
