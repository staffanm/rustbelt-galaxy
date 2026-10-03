// The two buttons that every screen, panel and sheet shares: Close at the top right, Back at the top left.
// The plates come from the art set (widgets/close, widgets/back). Without the images, a glyph stands in.
import { artUrl } from './art';
import { h } from './dom';

function widget(kind: 'close' | 'back', glyph: string, title: string, onClick: () => void, small = false): HTMLElement {
  const src = artUrl(`widgets/${kind}`);
  return h('button', { class: `widget ${kind}${small ? ' small' : ''}`, title, 'aria-label': title, onclick: onClick }, src ? h('img', { src, alt: '', draggable: 'false' }) : glyph);
}

export function closeButton(onClick: () => void, title = 'Close'): HTMLElement {
  return widget('close', '✕', title, onClick);
}

// The small plate that removes one item from a list: a queue entry, a trade route, a toast.
export function removeButton(onClick: () => void, title = 'Remove'): HTMLElement {
  return widget('close', '✕', title, onClick, true);
}

export function backButton(onClick: () => void, title = 'Back'): HTMLElement {
  return widget('back', '←', title, onClick);
}
