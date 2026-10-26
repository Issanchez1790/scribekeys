/*
 * Activación por sitio: origen → patrón de permiso → id del content script registrado.
 */
(function (root) {
  'use strict';

  const SCRIPT_ID_PREFIX = 'sk:';
  const HTTP_PATTERN = /^(https?|\*):\/\/[^/]+\/\*$/;

  /** 'https://www.youtube.com/watch?v=1' → 'https://www.youtube.com'. Solo http(s). */
  function originFromUrl(url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.hostname}`;
  }

  /**
   * Patrón de permiso para un origen. Se omite el puerto: los patrones de
   * Chrome sin puerto cubren cualquiera (útil para http://localhost:8080).
   */
  function patternForUrl(url) {
    const origin = originFromUrl(url);
    return origin ? `${origin}/*` : null;
  }

  function isHttpPattern(pattern) {
    return typeof pattern === 'string' && HTTP_PATTERN.test(pattern);
  }

  function scriptIdForPattern(pattern) {
    return SCRIPT_ID_PREFIX + pattern;
  }

  function patternFromScriptId(id) {
    return typeof id === 'string' && id.startsWith(SCRIPT_ID_PREFIX) ? id.slice(SCRIPT_ID_PREFIX.length) : null;
  }

  /** Nombre legible para la interfaz: 'https://www.youtube.com/*' → 'www.youtube.com'. */
  function hostLabel(pattern) {
    const m = /^[^:]+:\/\/([^/]+)\//.exec(pattern || '');
    return m ? m[1] : String(pattern || '');
  }

  /**
   * Qué scripts registrar o quitar para que coincidan con los permisos concedidos.
   * @param {string[]} grantedOrigins  chrome.permissions.getAll().origins
   * @param {string[]} registeredIds   ids de chrome.scripting.getRegisteredContentScripts()
   */
  function reconcile(grantedOrigins, registeredIds) {
    const wanted = new Set((grantedOrigins || []).filter(isHttpPattern));
    const registered = new Map();
    for (const id of registeredIds || []) {
      const p = patternFromScriptId(id);
      if (p) registered.set(p, id);
    }
    const toRegister = [...wanted].filter((p) => !registered.has(p)).sort();
    const toUnregister = [...registered].filter(([p]) => !wanted.has(p)).map(([, id]) => id).sort();
    return { toRegister, toUnregister };
  }

  /**
   * Patrones de los iframes de una página que pertenecen a otro sitio
   * (p. ej. un reproductor incrustado), para sugerir activarlos también.
   */
  function embeddedPatterns(frameUrls, pageUrl) {
    const own = patternForUrl(pageUrl);
    const out = new Set();
    for (const src of frameUrls || []) {
      const p = patternForUrl(src);
      if (p && p !== own) out.add(p);
    }
    return [...out].sort();
  }

  const api = {
    SCRIPT_ID_PREFIX,
    originFromUrl,
    patternForUrl,
    isHttpPattern,
    scriptIdForPattern,
    patternFromScriptId,
    hostLabel,
    reconcile,
    embeddedPatterns,
  };

  const SK = (root.SK = root.SK || {});
  SK.siteAccess = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
