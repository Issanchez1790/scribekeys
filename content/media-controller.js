/*
 * Content script: rastrea los <audio>/<video> del frame y ejecuta las órdenes
 * del service worker. Se carga en todos los frames de los sitios activados.
 *
 * Depende de (cargados antes, en el mismo mundo aislado):
 * lib/time-format.js, lib/playback.js, lib/media-pick.js, lib/protocol.js, lib/log.js, content/overlay.js
 */
(function (root) {
  'use strict';

  const SK = root.SK;
  if (!SK || SK.controller) return; // ya inyectado (registro + inyección manual)

  const { MSG } = SK.protocol;
  const pb = SK.playback;
  const log = SK.log.createLogger(window === window.top ? 'content' : 'content:iframe');

  /** Último instante en que cada medio empezó a reproducirse. */
  const lastPlayed = new WeakMap();
  /** Medios vistos por eventos (incluye los que están en shadow roots abiertos). */
  const seen = new Set();
  /** Shadow roots en los que ya escuchamos eventos. */
  const watchedRoots = new WeakSet();
  /** Último medio controlado, para colocar el indicador. */
  let lastControlled = null;

  const isMedia = (el) => el instanceof HTMLMediaElement;

  function onPlay(event) {
    const el = event.target;
    if (!isMedia(el)) return;
    const at = Date.now();
    lastPlayed.set(el, at);
    seen.add(el);
    log.debug('play', el.tagName.toLowerCase(), el.currentSrc || '(sin src)');
    try {
      chrome.runtime.sendMessage({ type: MSG.MEDIA_PLAYED, at }).catch(() => {});
    } catch {
      // La extensión se recargó: este script quedó huérfano.
      detach();
    }
  }

  // Los eventos de medios no burbujean, pero sí pasan por la fase de captura:
  // un solo listener en el documento cubre también los elementos añadidos después.
  function watch(target) {
    target.addEventListener('play', onPlay, true);
  }
  function detach() {
    document.removeEventListener('play', onPlay, true);
  }

  /** Busca medios dentro de shadow roots abiertos (reproductores con web components). */
  function collectFromShadowRoots(out) {
    const walker = document.createTreeWalker(document.documentElement || document, NodeFilter.SHOW_ELEMENT);
    const stack = [];
    for (let node = walker.currentNode; node; node = walker.nextNode()) {
      if (node.shadowRoot) stack.push(node.shadowRoot);
    }
    while (stack.length) {
      const sr = stack.pop();
      if (!watchedRoots.has(sr)) {
        watchedRoots.add(sr);
        watch(sr);
      }
      for (const el of sr.querySelectorAll('*')) {
        if (isMedia(el)) out.add(el);
        if (el.shadowRoot) stack.push(el.shadowRoot);
      }
    }
  }

  function collectMedia() {
    const all = new Set(document.querySelectorAll('audio, video'));
    for (const el of seen) {
      if (el.isConnected || !el.paused) all.add(el);
      else seen.delete(el);
    }
    collectFromShadowRoots(all);
    return [...all];
  }

  function visibleArea(el) {
    const r = el.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    return w * h;
  }

  function describe(el, index) {
    return {
      el,
      index,
      playing: !el.paused && !el.ended,
      lastPlayedAt: lastPlayed.get(el) || 0,
      hasMedia: el.readyState > 0 || Boolean(el.currentSrc || el.src),
      area: visibleArea(el),
    };
  }

  function currentMedia() {
    const picked = SK.mediaPick.pickMedia(collectMedia().map(describe));
    return picked ? picked.el : null;
  }

  /** Resumen del frame para que el service worker elija entre frames. */
  function probe() {
    const list = collectMedia().map(describe);
    return {
      count: list.length,
      playing: list.some((d) => d.playing),
      lastPlayedAt: list.reduce((max, d) => Math.max(max, d.lastPlayedAt), 0),
    };
  }

  function status(el) {
    if (!el) return { ok: false, error: 'no-media' };
    return {
      ok: true,
      kind: el.tagName.toLowerCase(),
      paused: el.paused,
      ended: el.ended,
      currentTime: el.currentTime,
      duration: el.duration,
      rate: el.playbackRate,
    };
  }

  async function run(command, params) {
    const el = currentMedia();
    if (!el) return { ok: false, error: 'no-media' };
    lastControlled = el;
    const p = params || {};

    switch (command) {
      case 'toggle-play': {
        const plan = pb.planToggle(el, p.rewindOnPause);
        if (plan.action === 'play') {
          try {
            await el.play();
          } catch (err) {
            log.warn('play() rechazado', err && err.name);
            return { ok: false, error: 'play-blocked' };
          }
          return { ...status(el), action: 'play' };
        }
        el.pause();
        if (plan.rewound > 0) el.currentTime = plan.seekTo;
        return { ...status(el), action: 'pause', rewound: plan.rewound };
      }
      case 'rewind':
      case 'forward': {
        const delta = (command === 'rewind' ? -1 : 1) * (Number(p.skipSeconds) || 0);
        el.currentTime = pb.seekTarget(el.currentTime, delta, el.duration);
        return { ...status(el), delta };
      }
      case 'speed-down':
      case 'speed-up':
        el.playbackRate = pb.stepRate(el.playbackRate, command === 'speed-down' ? -1 : 1);
        return status(el);
      case 'speed-reset':
        el.playbackRate = pb.RATE_DEFAULT;
        return status(el);
      case 'copy-timestamp':
        return status(el);
      default:
        return { ok: false, error: 'unknown-command' };
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string') return false;
    switch (msg.type) {
      case MSG.RUN:
        log.setEnabled(msg.debug);
        log.debug('run', msg.command, msg.params);
        run(msg.command, msg.params).then(sendResponse, (err) => {
          log.error(err);
          sendResponse({ ok: false, error: 'exception' });
        });
        return true; // respuesta asíncrona
      case MSG.STATUS:
        sendResponse(status(currentMedia()));
        return false;
      case MSG.FLASH:
        SK.overlay.show(msg.text, lastControlled || currentMedia());
        sendResponse({ ok: true });
        return false;
      default:
        return false;
    }
  });

  chrome.storage.sync.get('debug').then(
    (v) => log.setEnabled(v.debug === true),
    () => {}
  );

  watch(document);
  SK.controller = { probe, status: () => status(currentMedia()) };
  log.debug('listo en', location.href);
})(globalThis);
