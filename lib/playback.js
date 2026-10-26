/*
 * Reglas de reproducción: límites de velocidad, saltos y retroceso al pausar.
 * Lógica pura, sin acceso al DOM ni a las APIs de chrome.
 */
(function (root) {
  'use strict';

  const RATE_MIN = 0.5;
  const RATE_MAX = 2;
  const RATE_STEP = 0.1;
  const RATE_DEFAULT = 1;

  /** Redondea a un decimal para evitar acumulaciones como 0.30000000000000004. */
  function roundRate(rate) {
    return Math.round(rate * 10) / 10;
  }

  function clampRate(rate) {
    const n = Number(rate);
    if (!Number.isFinite(n) || n <= 0) return RATE_DEFAULT;
    return roundRate(Math.min(RATE_MAX, Math.max(RATE_MIN, n)));
  }

  /**
   * Siguiente velocidad al subir (direction = 1) o bajar (direction = -1).
   * Si la página dejó una velocidad fuera de rango, el primer paso la devuelve al rango.
   */
  function stepRate(current, direction) {
    const base = Number.isFinite(Number(current)) && Number(current) > 0 ? Number(current) : RATE_DEFAULT;
    const dir = direction < 0 ? -1 : 1;
    return clampRate(roundRate(base) + dir * RATE_STEP);
  }

  /**
   * Acota un tiempo a [0, duración]. Con duración desconocida o infinita
   * (directos, streams sin metadatos) solo se acota por abajo.
   */
  function clampTime(time, duration) {
    const t = Number.isFinite(Number(time)) ? Number(time) : 0;
    const d = Number(duration);
    const upper = Number.isFinite(d) && d > 0 ? d : Infinity;
    return Math.min(upper, Math.max(0, t));
  }

  function seekTarget(current, delta, duration) {
    return clampTime((Number(current) || 0) + (Number(delta) || 0), duration);
  }

  /**
   * Decide qué hacer con reproducir/pausar.
   * Al pausar se retrocede `rewindOnPause` segundos (como Express Scribe);
   * `rewound` es lo que realmente se retrocedió (puede ser menos cerca del inicio).
   */
  function planToggle(state, rewindOnPause) {
    const s = state || {};
    if (s.paused || s.ended) return { action: 'play' };
    const rewind = Math.max(0, Number(rewindOnPause) || 0);
    const current = Number(s.currentTime) || 0;
    const seekTo = seekTarget(current, -rewind, s.duration);
    return { action: 'pause', seekTo, rewound: Math.max(0, current - seekTo) };
  }

  const api = {
    RATE_MIN,
    RATE_MAX,
    RATE_STEP,
    RATE_DEFAULT,
    roundRate,
    clampRate,
    stepRate,
    clampTime,
    seekTarget,
    planToggle,
  };

  const SK = (root.SK = root.SK || {});
  SK.playback = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
