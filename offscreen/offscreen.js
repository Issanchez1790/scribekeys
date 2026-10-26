/*
 * Documento offscreen (reason CLIPBOARD). navigator.clipboard exige que la página
 * tenga el foco; execCommand('copy') desde un documento de la extensión con el
 * permiso clipboardWrite no lo necesita, así que funciona mientras escribes en Word.
 */
'use strict';

const { MSG } = SK.protocol;

function copy(text) {
  const buffer = document.getElementById('buffer');
  buffer.value = String(text);
  buffer.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    buffer.value = '';
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Este documento también recibe los mensajes dirigidos al service worker: ignorarlos.
  if (!msg || msg.type !== MSG.COPY) return false;
  sendResponse({ ok: copy(msg.text) });
  return false;
});
