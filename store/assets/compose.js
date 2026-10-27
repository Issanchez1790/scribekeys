'use strict';

/*
 * Construye una imagen de la tienda dentro de #canvas. La llama scripts/store-assets.mjs con:
 *   { kind: 'hero' | 'popup' | 'options' | 'promo' | 'icon', text, keys, images }
 * y espera a que se carguen las imágenes antes de capturar.
 */

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'style') Object.assign(node.style, v);
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

function headline({ title, subtitle }, extra = []) {
  return el('div', { class: 'headline' }, [el('h1', { text: title }), el('p', { text: subtitle }), ...extra]);
}

function chips(keys) {
  const actions = [
    ['⏯', '1'],
    ['−3 s', '2'],
    ['+3 s', '3'],
    ['⧉ [00:00:31]', '4'],
  ];
  return el(
    'div',
    { class: 'chips' },
    actions.map(([label, digit]) => el('span', { class: 'chip' }, [el('kbd', { text: keys + digit }), label]))
  );
}

function browserWindow({ title, image, imageWidth }, style) {
  return el('div', { class: 'window browser', style }, [
    el('div', { class: 'browser-bar' }, [
      el('span', { class: 'dots' }, [el('i'), el('i'), el('i')]),
      el('span', { class: 'tab', text: title }),
      el('span', { class: 'omnibox' }),
      el('img', { class: 'ext-icon', src: '../../icons/icon32.png', alt: '' }),
    ]),
    el('img', { class: 'content', src: image, alt: '', style: imageWidth ? { width: `${imageWidth}px` } : {} }),
  ]);
}

/** Línea de transcripción con la marca de tiempo resaltada. */
function transcriptLine(line) {
  const m = line.match(/^(\[[\d:]+\])\s*(.*)$/);
  if (!m) return el('p', { text: line });
  return el('p', {}, [el('span', { class: 'stamp', text: m[1] }), ' ' + m[2]]);
}

const layouts = {
  hero({ text, keys, images }) {
    const canvas = el('div', { class: 'shot' });
    const lines = text.mock.transcript.map(transcriptLine);
    // La última línea se está escribiendo: la marca recién copiada y el cursor.
    lines.push(el('p', {}, [el('span', { class: 'stamp', text: '[00:00:31]' }), el('span', { class: 'caret' })]));
    canvas.append(
      headline(text.screenshots[0], [chips(keys)]),
      browserWindow({ title: text.mock.player, image: images.player }, { left: '64px', top: '262px', width: '760px' }),
      el('div', { class: 'window editor', style: { left: '672px', top: '318px', width: '560px', height: '460px' } }, [
        el('div', { class: 'titlebar', text: text.mock.editor }),
        el('div', { class: 'page' }, lines),
      ])
    );
    return canvas;
  },

  popup({ text, images }) {
    const canvas = el('div', { class: 'shot' });
    canvas.append(
      headline(text.screenshots[1]),
      browserWindow({ title: text.mock.player, image: images.player }, { left: '64px', top: '186px', width: '1152px' }),
      el('div', { class: 'popup', style: { right: '76px', top: '238px' } }, [
        el('img', { src: images.popup, alt: '', style: { width: `${images.popupWidth}px` } }),
      ])
    );
    return canvas;
  },

  options({ text, images }) {
    const canvas = el('div', { class: 'shot' });
    const col = (srcs) => el('div', { class: 'col' }, srcs.map((src) => el('img', { src, alt: '' })));
    canvas.append(
      headline(text.screenshots[2]),
      el('div', { class: 'cards' }, [col(images.cards.slice(0, 3)), col(images.cards.slice(3))])
    );
    return canvas;
  },

  promo({ text, keys }) {
    return el('div', { class: 'promo' }, [
      el('div', { class: 'brand' }, [el('img', { src: '../../icons/icon.svg', alt: '' }), el('span', { text: 'ScribeKeys' })]),
      el('p', { text: text.promo }),
      el('div', { class: 'keys' }, [el('kbd', { text: `${keys}1 … 4` })]),
    ]);
  },

  icon() {
    return el('div', { class: 'icon' }, [el('img', { src: '../../icons/icon.svg', alt: '' })]);
  },
};

window.render = async function render(data) {
  const canvas = document.getElementById('canvas');
  canvas.replaceChildren(layouts[data.kind](data));
  await document.fonts.ready;
  await Promise.all([...canvas.querySelectorAll('img')].map((img) => img.decode().catch(() => {})));
  const { width, height } = canvas.firstElementChild.getBoundingClientRect();
  return { width: Math.round(width), height: Math.round(height) };
};
