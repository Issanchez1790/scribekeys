/*
 * Genera en el navegador un WAV de prueba (sin archivos binarios en el repo):
 * un clic cada segundo y un doble pitido cada 10 s, para comprobar saltos a oído.
 * El tono base cambia por medio, así se distingue cuál suena.
 */
'use strict';

function makeTestWav({ seconds = 120, baseHz = 660, sampleRate = 8000 } = {}) {
  const n = seconds * sampleRate;
  const data = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const inSecond = t % 1;
    const sec = Math.floor(t);
    let v = 0;
    if (inSecond < 0.06) v = Math.sin(2 * Math.PI * baseHz * t) * (1 - inSecond / 0.06);
    if (sec % 10 === 0 && inSecond >= 0.15 && inSecond < 0.27) v = Math.sin(2 * Math.PI * baseHz * 1.5 * t) * 0.8;
    data[i] = Math.round(v * 0.5 * 32767);
  }

  const buffer = new ArrayBuffer(44 + data.byteLength);
  const view = new DataView(buffer);
  const str = (off, s) => [...s].forEach((c, k) => view.setUint8(off + k, c.charCodeAt(0)));
  str(0, 'RIFF');
  view.setUint32(4, 36 + data.byteLength, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, data.byteLength, true);
  new Int16Array(buffer, 44).set(data);
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}
