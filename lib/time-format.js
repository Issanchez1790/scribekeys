/*
 * Formato de marcas de tiempo e indicadores numéricos.
 * Lógica pura: se usa en el service worker, el content script, el popup,
 * las opciones y los tests de Node (ver README › Arquitectura).
 */
(function (root) {
  'use strict';

  const FORMATS = Object.freeze(['hh:mm:ss', 'mm:ss']);
  const MINUS = '−'; // signo menos tipográfico

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function toWholeSeconds(seconds) {
    const n = Number(seconds);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.floor(n);
  }

  /**
   * Marca de tiempo para pegar en una transcripción.
   * - 'hh:mm:ss' → [01:02:03]
   * - 'mm:ss'    → [62:03] (los minutos totales pueden superar 59)
   */
  function formatTimestamp(seconds, options) {
    const opts = options || {};
    const format = FORMATS.includes(opts.format) ? opts.format : 'hh:mm:ss';
    const brackets = opts.brackets !== false;

    const total = toWholeSeconds(seconds);
    const s = total % 60;
    let body;
    if (format === 'mm:ss') {
      body = `${pad2(Math.floor(total / 60))}:${pad2(s)}`;
    } else {
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      body = `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
    }
    return brackets ? `[${body}]` : body;
  }

  /** Número sin ceros sobrantes: 2 → "2", 2.5 → "2.5", 0.30000001 → "0.3". */
  function trimNumber(n) {
    return String(Math.round(Number(n) * 10) / 10);
  }

  /** Salto relativo para el indicador: −3 s, +3 s. */
  function formatDelta(seconds) {
    const n = Number(seconds) || 0;
    const sign = n < 0 ? MINUS : '+';
    return `${sign}${trimNumber(Math.abs(n))} s`;
  }

  /** Velocidad para el indicador: 0.8×, 1×, 1.5×. */
  function formatRate(rate) {
    return `${trimNumber(rate)}×`;
  }

  const api = { FORMATS, formatTimestamp, formatDelta, formatRate };

  const SK = (root.SK = root.SK || {});
  SK.time = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
