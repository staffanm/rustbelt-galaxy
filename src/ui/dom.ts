export type Child = Node | string | number | null | undefined | false | Child[];

type Attrs = Record<string, unknown> | null;

// Creates an element. Keys that start with "on" are event handlers. "class", "style" and "title" are attributes.
// An element with a click handler gets the mark "data-click". On a screen the keyboard can then use it (keys.ts).
export function h(tag: string, attrs?: Attrs, ...children: Child[]): HTMLElement {
  const dot = tag.split('.');
  const el = document.createElement(dot[0] || 'div');
  if (dot.length > 1) el.className = dot.slice(1).join(' ');
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
        if (k === 'onclick') el.dataset.click = '1';
      }
      else if (k === 'class') el.className += (el.className ? ' ' : '') + String(v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'disabled' || k === 'checked' || k === 'selected') (el as unknown as Record<string, unknown>)[k] = !!v;
      else if (k === 'value') (el as HTMLInputElement).value = String(v);
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el: HTMLElement, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function clear(el: HTMLElement) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

// "key" is the key that uses the button while its screen is open. The button shows the key.
export function button(label: Child, onClick: () => void, opts: { disabled?: boolean; title?: string; cls?: string; key?: string } = {}): HTMLElement {
  return h('button', { class: opts.cls ?? '', disabled: opts.disabled, title: opts.title, 'data-key': opts.key, 'aria-keyshortcuts': opts.key, onclick: onClick }, label, opts.key ? keyHint(opts.key) : null);
}

// The small box that shows a key. On a button it is hidden from the accessible name of the button.
export function keyHint(key: string, hidden = true): HTMLElement {
  return h('span.key', { 'aria-hidden': hidden ? 'true' : undefined }, key.length === 1 ? key.toUpperCase() : key);
}

// An image at a fixed size. Art drawn in code keeps hard pixels. A generated image is smoothed.
export function img(src: string, size: number, cls = ''): HTMLElement {
  const smooth = !src.startsWith('data:');
  return h('img', { src, class: `${smooth ? 'smooth' : 'px'} ${cls}`, style: { width: `${size}px`, height: `${size}px` }, draggable: 'false' });
}

export function fmt(n: number, digits = 0): string {
  const v = Math.abs(n) < 0.05 ? 0 : n;
  return digits ? v.toFixed(digits) : String(Math.round(v));
}

export function signed(n: number, digits = 0): string {
  const v = digits ? Number(n.toFixed(digits)) : Math.round(n);
  return (v >= 0 ? '+' : '') + (digits ? v.toFixed(digits) : String(v));
}
