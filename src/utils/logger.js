/**
 * @module utils/logger
 * @description LOG_LEVEL-aware structured logger.
 *
 *              Reads `LOG_LEVEL` from `process.env` (defaults to `'info'`).
 *              Supported levels (in order of increasing verbosity):
 *              silent, error, warn, info, debug.
 *
 *              Export: `createLogger(namespace)` — returns a namespaced logger
 *              with `.error()`, `.warn()`, `.info()`, `.debug()` methods.
 */

/** @type {Record<string, number>} */
const LEVEL_PRIORITY = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

const VALID_LEVELS = new Set(Object.keys(LEVEL_PRIORITY));

/**
 * Resolve the active log level.
 * Falls back to 'info' when LOG_LEVEL is unset or invalid.
 * @returns {string}
 */
function resolveLevel() {
  const raw = (process.env.LOG_LEVEL ?? '').trim().toLowerCase();
  if (VALID_LEVELS.has(raw)) return raw;
  if (raw !== '') {
    // Warn about invalid value once, to stderr so it doesn't pollute stdout.
    process.stderr.write(
      `[logger] WARN  Unknown LOG_LEVEL "${raw}" – falling back to "info"\n`,
    );
  }
  return 'info';
}

/**
 * Create a namespaced logger instance.
 *
 * @param {string} namespace – Typically the module path or feature name
 *                             (e.g. 'pdf-gate:layer1').
 * @returns {{
 *   error: (...args: any[]) => void,
 *   warn:  (...args: any[]) => void,
 *   info:  (...args: any[]) => void,
 *   debug: (...args: any[]) => void,
 * }}
 */
export function createLogger(namespace) {
  const currentLevel = resolveLevel();
  const currentPriority = LEVEL_PRIORITY[currentLevel];

  /**
   * Internal write helper.
   * @param {'error'|'warn'|'info'|'debug'} level
   * @param {string} method – console method name.
   * @param {any[]} args
   */
  function log(level, method, args) {
    if (LEVEL_PRIORITY[level] > currentPriority) return;

    const ts = new Date().toISOString();
    const prefix = `[${ts}] [${level.toUpperCase().padEnd(5)}] [${namespace}]`;
    console[method](prefix, ...args);
  }

  return {
    error: (...args) => log('error', 'error', args),
    warn: (...args) => log('warn', 'warn', args),
    info: (...args) => log('info', 'info', args),
    debug: (...args) => log('debug', 'debug', args),
  };
}
