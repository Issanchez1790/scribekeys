'use strict';

const audio = document.getElementById('audio');
audio.src = makeTestWav({ baseHz: 550 });

// Expone el medio a la tabla de estado de la página principal (mismo origen).
try {
  window.parent.tracked?.push({ label: 'iframe 550 Hz', el: audio });
} catch {
  /* abierto por separado */
}
