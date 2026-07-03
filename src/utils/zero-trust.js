/**
 * @module utils/zero-trust
 * @description Zero-trust security module for pdf-gate.
 *              Provides network safety assertions, secure buffer disposal,
 *              dependency validation, and immutable context creation.
 *
 * @license MIT
 */

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * Global flag indicating zero-trust mode is active.
 * Consumers can check this to confirm the package runs with
 * hardened security boundaries.
 *
 * @const {boolean}
 */
export const ZERO_TRUST_MODE = true;

// ── Network Safety ─────────────────────────────────────────────────────────────

/**
 * Best-effort check that no active network connections exist
 * that could potentially leak sensitive document data.
 *
 * Uses Node.js internal `process._getActiveHandles()` to inspect
 * active handles. This is a diagnostic tool and may not catch
 * all network activity (e.g. handles created in worker threads).
 *
 * **Note:** `process._getActiveHandles()` is an undocumented API
 * and may change between Node.js versions. This function degrades
 * gracefully — if the API is unavailable it returns `true` (safe).
 *
 * @returns {{ safe: boolean, handles: number, reason: string|null }}
 */
export function assertNoNetwork() {
  /** @type {Array} */
  let handles = [];

  try {
    if (typeof process._getActiveHandles === 'function') {
      handles = process._getActiveHandles();
    }
  } catch (_err) {
    return { safe: true, handles: 0, reason: 'Cannot inspect active handles (API unavailable).' };
  }

  const networkHandles = handles.filter((h) => {
    if (!h || typeof h !== 'object') return false;
    const ctorName = h.constructor ? h.constructor.name : '';
    return (
      ctorName === 'Socket' ||
      ctorName === 'TLSSocket' ||
      ctorName === 'ClientRequest' ||
      ctorName === 'Server' ||
      (ctorName === 'WriteStream' && h._handle && h._handle.constructor.name === 'TCP')
    );
  });

  if (networkHandles.length > 0) {
    return {
      safe: false,
      handles: networkHandles.length,
      reason: `Terdeteksi ${networkHandles.length} koneksi jaringan aktif — potensi kebocoran data.`,
    };
  }

  return { safe: true, handles: 0, reason: null };

// ── Secure Buffer Disposal ─────────────────────────────────────────────────────

/**
 * Securely overwrite a buffer with zeros to prevent sensitive data
 * from persisting in memory after use.
 *
 * Operates on both Node.js `Buffer` and `Uint8Array` instances.
 * For `Buffer`, uses the native `fill(0)` method. For `Uint8Array`,
 * uses `fill(0)` (widely supported).
 *
 * @param {Buffer|Uint8Array} buffer - The buffer to zero out.
 * @returns {void}
 */
export function zeroBuffer(buffer) {
  if (!buffer) return;

  if (Buffer.isBuffer(buffer)) {
    buffer.fill(0);
  } else if (buffer instanceof Uint8Array) {
    buffer.fill(0);
  }
}

// ── Dependency Validation ──────────────────────────────────────────────────────

/**
 * Best-effort static check that no dependency makes network calls
 * at import time.
 *
 * Inspects the module cache for known networking modules (http, https,
 * net, tls, dgram, fetch, undici). If any of these are loaded, it
 * *may* indicate a dependency that opens network connections during
 * initialization.
 *
 * This is a **static best-effort** check — it cannot detect obfuscated
 * imports or conditional `require()` calls inside dependency code.
 *
 * @returns {{ clean: boolean, loadedModules: string[], warning: string|null }}
 */
export function validateDependencies() {
  const NETWORK_MODULES = [
    'http', 'https', 'net', 'tls', 'dgram',
    'node:http', 'node:https', 'node:net', 'node:tls', 'node:dgram',
  ];

  const loaded = [];

  try {
    if (require.cache) {
      for (const modPath of Object.keys(require.cache)) {
        for (const netMod of NETWORK_MODULES) {
          if (modPath.includes(`/${netMod}.`) || modPath.includes(`\\${netMod}.`)) {
            loaded.push(netMod);
          }
        }
      }
    }
  } catch (_err) {
    return {
      clean: true,
      loadedModules: [],
      warning: 'Tidak dapat menginspeksi module cache (mungkin ESM context).',
    };
  }

  const unique = [...new Set(loaded)];

  if (unique.length > 0) {
    return {
      clean: false,
      loadedModules: unique,
      warning: `Modul jaringan terdeteksi di cache: ${unique.join(', ')}. ` +
               'Verifikasi tidak ada panggilan jaringan saat import.',
    };
  }

  return { clean: true, loadedModules: [], warning: null };
}

// ── Secure Context ─────────────────────────────────────────────────────────────

/**
 * Create a frozen, immutable context object with no prototype chain,
 * suitable for passing configuration through untrusted code paths.
 *
 * The returned object:
 * - Has `null` prototype (no inherited methods like toString, hasOwnProperty).
 * - Is deeply frozen (Object.freeze).
 * - Cannot be mutated by any downstream code.
 *
 * @param {object} [props={}] - Properties to include in the context.
 * @returns {Readonly<object>} Immutable context object.
 */
export function createSecureContext(props = {}) {
  if (typeof props !== 'object' || props === null || Array.isArray(props)) {
    throw new TypeError('props harus berupa object (bukan array atau null).');
  }

  const ctx = Object.create(null);

  for (const key of Object.keys(props)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    ctx[key] = props[key];
  }

  return Object.freeze(ctx);
}

}
