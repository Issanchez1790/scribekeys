/*
 * Traducción de las páginas de la extensión con chrome.i18n.
 * Atributos admitidos: data-i18n (texto), data-i18n-title, data-i18n-aria-label.
 */
(function (root) {
  'use strict';

  function t(key, substitutions) {
    return chrome.i18n.getMessage(key, substitutions) || key;
  }

  function apply(scope) {
    const base = scope || document;
    for (const el of base.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of base.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
    for (const el of base.querySelectorAll('[data-i18n-aria-label]')) {
      el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
    }
    document.documentElement.lang = chrome.i18n.getMessage('@@ui_locale').split('_')[0] || 'es';
  }

  const SK = (root.SK = root.SK || {});
  SK.i18n = { t, apply };
})(globalThis);
