/*
 * Configuración del usuario (chrome.storage.sync): valores por defecto y validación.
 * Cualquier valor leído del almacenamiento pasa por normalize() antes de usarse.
 */
(function (root) {
  'use strict';

  const DEFAULTS = Object.freeze({
    rewindOnPause: 2, // segundos que retrocede al pausar (0–5)
    skipSeconds: 3, // segundos de cada salto atrás/adelante (1–60)
    timestampFormat: 'hh:mm:ss', // 'hh:mm:ss' | 'mm:ss'
    brackets: true, // [00:12:34] o 00:12:34
    overlay: true, // indicador visual sobre la página
    debug: false, // logs [scribekeys] en la consola
  });

  const LIMITS = Object.freeze({
    rewindOnPause: { min: 0, max: 5, step: 0.5 },
    skipSeconds: { min: 1, max: 60, step: 0.5 },
  });

  const TIMESTAMP_FORMATS = Object.freeze(['hh:mm:ss', 'mm:ss']);

  function normalizeNumber(value, fallback, limit) {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
    const stepped = Math.round(n / limit.step) * limit.step;
    return Math.min(limit.max, Math.max(limit.min, stepped));
  }

  function normalizeBoolean(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
  }

  /** Devuelve siempre un objeto completo y válido, ignorando claves desconocidas. */
  function normalize(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return {
      rewindOnPause: normalizeNumber(r.rewindOnPause, DEFAULTS.rewindOnPause, LIMITS.rewindOnPause),
      skipSeconds: normalizeNumber(r.skipSeconds, DEFAULTS.skipSeconds, LIMITS.skipSeconds),
      timestampFormat: TIMESTAMP_FORMATS.includes(r.timestampFormat) ? r.timestampFormat : DEFAULTS.timestampFormat,
      brackets: normalizeBoolean(r.brackets, DEFAULTS.brackets),
      overlay: normalizeBoolean(r.overlay, DEFAULTS.overlay),
      debug: normalizeBoolean(r.debug, DEFAULTS.debug),
    };
  }

  const api = { DEFAULTS, LIMITS, TIMESTAMP_FORMATS, normalize };

  const SK = (root.SK = root.SK || {});
  SK.settings = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
