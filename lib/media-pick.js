/*
 * Elección del medio correcto: qué <audio>/<video> dentro de un frame
 * y qué frame dentro de una pestaña. Trabaja con descriptores planos,
 * así que no necesita DOM y se puede probar en Node.
 */
(function (root) {
  'use strict';

  function cmpDesc(a, b) {
    return (b || 0) - (a || 0);
  }

  /**
   * Orden de preferencia de los medios de un frame:
   * 1. reproduciéndose (el más reciente si hay varios),
   * 2. el último reproducido,
   * 3. con medio cargado (duración conocida),
   * 4. el de mayor área visible,
   * 5. el primero en el documento.
   *
   * @param {Array<{playing:boolean, lastPlayedAt?:number, hasMedia?:boolean, area?:number, index:number}>} candidates
   * @returns el descriptor elegido o null
   */
  function pickMedia(candidates) {
    const list = (candidates || []).filter(Boolean);
    if (!list.length) return null;
    return list.slice().sort((a, b) => {
      return (
        Number(Boolean(b.playing)) - Number(Boolean(a.playing)) ||
        cmpDesc(a.lastPlayedAt, b.lastPlayedAt) ||
        Number(Boolean(b.hasMedia)) - Number(Boolean(a.hasMedia)) ||
        cmpDesc(a.area, b.area) ||
        (a.index || 0) - (b.index || 0)
      );
    })[0];
  }

  /**
   * Elige el frame a controlar a partir del sondeo de todos los frames.
   * @param {Array<{frameId:number, count:number, playing:boolean, lastPlayedAt?:number}|null>} probes
   * @param {number} [preferredFrameId]  Frame del último play conocido.
   * @returns {number|null}
   */
  function pickFrame(probes, preferredFrameId) {
    const list = (probes || []).filter((p) => p && p.count > 0);
    if (!list.length) return null;
    list.sort((a, b) => {
      return (
        Number(Boolean(b.playing)) - Number(Boolean(a.playing)) ||
        cmpDesc(a.lastPlayedAt, b.lastPlayedAt) ||
        Number(b.frameId === preferredFrameId) - Number(a.frameId === preferredFrameId) ||
        a.frameId - b.frameId // el frame principal (0) antes que los iframes
      );
    });
    return list[0].frameId;
  }

  const api = { pickMedia, pickFrame };

  const SK = (root.SK = root.SK || {});
  SK.mediaPick = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
