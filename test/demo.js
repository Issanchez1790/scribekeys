'use strict';

const tracked = (window.tracked = []);

function track(label, el) {
  tracked.push({ label, el });
}

document.getElementById('audio').src = makeTestWav({ baseHz: 660 });
track('audio 660 Hz', document.getElementById('audio'));
document.getElementById('video').src = makeTestWav({ baseHz: 440 });
track('video 440 Hz', document.getElementById('video'));

let dynamicCount = 0;
document.getElementById('add-dynamic').addEventListener('click', () => {
  dynamicCount += 1;
  const audio = document.createElement('audio');
  audio.controls = true;
  audio.src = makeTestWav({ baseHz: 880 + dynamicCount * 110 });
  document.getElementById('dynamic-area').append(audio);
  track(`dinámico #${dynamicCount}`, audio);
});

document.getElementById('add-shadow').addEventListener('click', () => {
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  const audio = document.createElement('audio');
  audio.controls = true;
  audio.src = makeTestWav({ baseHz: 330 });
  root.append(audio);
  document.getElementById('dynamic-area').append(host);
  track('shadow root 330 Hz', audio);
});

const fmt = (s) => (Number.isFinite(s) ? s.toFixed(1) : '—');

function renderState() {
  const body = document.getElementById('state');
  body.replaceChildren(
    ...tracked.map(({ label, el }) => {
      const tr = document.createElement('tr');
      const playing = !el.paused && !el.ended;
      for (const text of [label, playing ? '▶ reproduciendo' : '⏸ pausado', `${fmt(el.currentTime)} / ${fmt(el.duration)} s`, `${el.playbackRate.toFixed(1)}×`]) {
        const td = document.createElement('td');
        td.textContent = text;
        tr.append(td);
      }
      tr.classList.toggle('playing', playing);
      return tr;
    })
  );
}

setInterval(renderState, 250);
renderState();
