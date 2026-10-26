/*
 * Selección de la pestaña objetivo de los atajos.
 * Prioridad: pestaña fijada > última pestaña con un medio reproduciéndose > pestaña audible.
 */
(function (root) {
  'use strict';

  function toIdSet(ids) {
    return ids instanceof Set ? ids : new Set(ids || []);
  }

  /**
   * @param {object} input
   * @param {{tabId:number}|null} input.pinned           Fijada desde el popup.
   * @param {{tabId:number, frameId?:number}|null} input.lastMedia  Último play detectado.
   * @param {Array<{id:number, controllable?:boolean, lastAccessed?:number}>} input.audibleTabs
   * @param {Iterable<number>} input.openTabIds          Pestañas que siguen abiertas.
   * @returns {{tabId:number, frameId:(number|undefined), reason:string}|null}
   */
  function selectTargetTab(input) {
    const { pinned, lastMedia, audibleTabs } = input || {};
    const open = toIdSet(input && input.openTabIds);

    if (pinned && open.has(pinned.tabId)) {
      const frameId = lastMedia && lastMedia.tabId === pinned.tabId ? lastMedia.frameId : undefined;
      return { tabId: pinned.tabId, frameId, reason: 'pinned' };
    }
    if (lastMedia && open.has(lastMedia.tabId)) {
      return { tabId: lastMedia.tabId, frameId: lastMedia.frameId, reason: 'last-media' };
    }

    const audible = (audibleTabs || [])
      .filter((t) => t && open.has(t.id))
      .sort((a, b) => {
        // Primero las que la extensión puede controlar (sitio activado), luego la más reciente.
        const c = Number(Boolean(b.controllable)) - Number(Boolean(a.controllable));
        if (c !== 0) return c;
        return (b.lastAccessed || 0) - (a.lastAccessed || 0);
      });
    if (audible.length) return { tabId: audible[0].id, frameId: undefined, reason: 'audible' };

    return null;
  }

  /** Estado sin referencias a una pestaña cerrada. No muta la entrada. */
  function forgetTab(state, tabId) {
    const s = { ...(state || {}) };
    if (s.pinned && s.pinned.tabId === tabId) s.pinned = null;
    if (s.lastMedia && s.lastMedia.tabId === tabId) s.lastMedia = null;
    return s;
  }

  const api = { selectTargetTab, forgetTab };

  const SK = (root.SK = root.SK || {});
  SK.targetTab = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
