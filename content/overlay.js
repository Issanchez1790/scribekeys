/*
 * Indicador visual breve ("−3 s", "0.8×", "⏸") sobre el medio controlado.
 *
 * Usa un elemento popover en la "top layer" del navegador, así se ve
 * incluso con el video en pantalla completa, y un Shadow DOM cerrado
 * para que los estilos de la página no lo alteren (ni al revés).
 */
(function (root) {
  'use strict';

  const SK = (root.SK = root.SK || {});
  if (SK.overlay) return; // ya inyectado en este frame

  const VISIBLE_MS = 750;
  const CSS = `
    .bubble {
      font: 600 20px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #fff;
      background: rgba(18, 24, 28, 0.86);
      padding: 8px 14px;
      border-radius: 10px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
      white-space: nowrap;
      opacity: 0;
      transform: scale(0.96);
      transition: opacity 120ms ease-out, transform 120ms ease-out;
    }
    .bubble.on { opacity: 1; transform: scale(1); }
    @media (prefers-reduced-motion: reduce) {
      .bubble { transition: none; transform: none; }
    }
  `;

  let host = null;
  let bubble = null;
  let hideTimer = 0;

  function setImportant(el, styles) {
    for (const [prop, value] of Object.entries(styles)) el.style.setProperty(prop, value, 'important');
  }

  function ensureHost() {
    if (host && host.isConnected) return;
    host = document.createElement('scribekeys-overlay');
    host.setAttribute('aria-hidden', 'true');
    if ('popover' in HTMLElement.prototype) host.popover = 'manual';
    setImportant(host, {
      position: 'fixed',
      inset: 'auto',
      margin: '0',
      padding: '0',
      border: '0',
      background: 'transparent',
      overflow: 'visible',
      'pointer-events': 'none',
      'z-index': '2147483647',
      transform: 'translate(-50%, -50%)',
    });
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CSS;
    bubble = document.createElement('div');
    bubble.className = 'bubble';
    shadow.append(style, bubble);
    document.documentElement.append(host);
  }

  /** Centro del medio si se ve en pantalla; si no, esquina superior derecha. */
  function anchorPoint(anchor) {
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    const fallback = { x: Math.max(80, vw - 90), y: 48 };
    if (!anchor || !anchor.isConnected || !anchor.getBoundingClientRect) return fallback;
    const r = anchor.getBoundingClientRect();
    if (r.width < 40 || r.height < 30 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return fallback;
    const x = Math.min(vw - 60, Math.max(60, r.left + r.width / 2));
    const y = Math.min(vh - 30, Math.max(30, r.top + r.height / 2));
    return { x, y };
  }

  function show(text, anchor) {
    if (!text) return;
    ensureHost();
    const { x, y } = anchorPoint(anchor);
    setImportant(host, { left: `${x}px`, top: `${y}px` });
    bubble.textContent = text;

    if (host.showPopover) {
      // Volver a mostrarlo lo coloca por encima de un elemento a pantalla completa abierto después.
      try {
        if (host.matches(':popover-open')) host.hidePopover();
        host.showPopover();
      } catch {
        /* sin top layer: queda como fixed con z-index máximo */
      }
    }
    bubble.classList.add('on');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      bubble.classList.remove('on');
      setTimeout(() => {
        if (bubble.classList.contains('on')) return;
        try {
          if (host.hidePopover && host.matches(':popover-open')) host.hidePopover();
        } catch {
          /* ignorar */
        }
      }, 200);
    }, VISIBLE_MS);
  }

  SK.overlay = { show };
})(globalThis);
