'use strict';

const title = new URLSearchParams(location.search).get('title') || 'Recording.wav';
document.title = title;
document.getElementById('name').textContent = title;

/** Forma de onda decorativa y siempre igual (pseudoaleatoria con semilla fija). */
function waveformPoster() {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const W = 1600;
  const H = 700;
  const bars = [];
  for (let i = 0; i < 160; i++) {
    const env = 0.35 + 0.65 * Math.abs(Math.sin(i / 11)) * (0.6 + 0.4 * rand());
    const h = Math.max(8, env * H * 0.7);
    const x = 40 + i * 9.5;
    const played = i < 58;
    bars.push(`<rect x="${x}" y="${(H - h) / 2}" width="5" height="${h}" rx="2.5" fill="${played ? '#16857a' : '#b5c6ca'}"/>`);
  }
  const head = `<rect x="${40 + 58 * 9.5 - 3}" y="40" width="3" height="${H - 80}" fill="#e09b12"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#e8eef0"/>${bars.join('')}${head}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const media = document.getElementById('media');
media.poster = waveformPoster();
media.src = makeTestWav({ baseHz: 440 });
