// Keyboard use of the screens in the overlay: Tab and the arrow keys move the focus, Enter and Space activate the
// focused element, and an element with a "data-key" attribute has its own key. The tables are also the cheat sheet.
import type { App, ScreenId } from './app';

// Keys that open a screen. They work on the map and on each screen of a game.
export const SCREEN_KEYS: Record<string, Exclude<ScreenId, null>> = {
  t: 'tech',
  g: 'diplomacy',
  o: 'forum',
  v: 'power',
  e: 'encyclopedia',
  u: 'units',
  p: 'planets',
  k: 'budget',
};

const NO_SWITCH = new Set<ScreenId>(['menu', 'newgame', 'saves', 'end']);

export const HELP: { title: string; keys: [string, string][] }[] = [
  {
    title: 'Map',
    keys: [
      ['Enter', 'End the shift, or go to the next thing that needs an order'],
      ['Shift + Enter', 'End the shift now'],
      ['Arrow keys, W A S D', 'Move the map'],
      ['+ and -', 'Zoom'],
      ['C', 'Go to your capital'],
      ['/', 'Find a planet by name. Enter goes to it.'],
      ['Y', 'Show or hide the yields of the hexes'],
      ['Esc', 'Close the planet, remove the selection, or open the menu'],
      ['?', 'This list'],
    ],
  },
  {
    title: 'Selected unit',
    keys: [
      ['N or Tab', 'Next unit that needs an order'],
      ['Space', 'Skip the unit for this shift'],
      ['F', 'Fortify'],
      ['Z', 'Sleep'],
      ['X', 'Explore without more orders'],
      ['B', 'Found a colony or build a station'],
    ],
  },
  {
    title: 'Screens',
    keys: [
      ['T', 'Technology'],
      ['G', 'Species: diplomacy'],
      ['O', 'Species: the Forum'],
      ['V', 'Species: power'],
      ['E', 'Encyclopedia'],
      ['U', 'Units'],
      ['P', 'Planets'],
      ['K', 'Budget'],
    ],
  },
  {
    title: 'On a screen',
    keys: [
      ['Arrow keys', 'Move the focus to the nearest item in that direction'],
      ['Tab, Shift + Tab', 'Next item, previous item'],
      ['Enter or Space', 'Use the item that has the focus'],
      ['Key on a button', 'Use that button. The key is shown on the button.'],
      ['Arrow keys in the encyclopedia', 'Open the category or the entry that the focus reaches'],
      ['/', 'Encyclopedia: search'],
      ['Esc', 'Leave a text field, or close the screen'],
    ],
  },
  {
    title: 'Touch',
    keys: [
      ['Tap', 'Show a hex, select a unit, or open your planet'],
      ['Drag the selected unit', 'Move it there, or attack. The path shows the shifts.'],
      ['Drag the map', 'Scroll'],
      ['Pinch', 'Zoom'],
    ],
  },
  {
    title: 'Mouse',
    keys: [
      ['Left button', 'Select a unit or open a planet'],
      ['Right button', 'Move or attack with the selected unit'],
      ['Drag', 'Move the map'],
      ['Wheel', 'Zoom'],
    ],
  },
];

const FOCUSABLE = 'button:not(:disabled), [tabindex="0"], select, input:not([type="file"]):not(:disabled)';

export function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
}

// Elements that h() made with a click handler get a place in the Tab order.
export function makeFocusable(root: HTMLElement) {
  for (const el of root.querySelectorAll<HTMLElement>('[data-click]')) {
    if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') continue;
    el.tabIndex = 0;
    el.setAttribute('role', el.tagName === 'A' ? 'link' : 'button');
  }
}

function focus(el: HTMLElement) {
  el.focus();
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// Where the keyboard starts on a screen: the selected item, or the first item.
function first(root: HTMLElement, all: HTMLElement[]): HTMLElement {
  return all.find((el) => el.matches('.selected, .focus')) ?? all[0];
}

type Direction = 'up' | 'down' | 'left' | 'right';
const ARROWS: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

// Moves the focus to the nearest item in the direction. Returns false when no item is there.
export function moveFocus(root: HTMLElement, dir: Direction): boolean {
  const all = focusables(root);
  if (!all.length) return false;
  const cur = document.activeElement as HTMLElement | null;
  if (!cur || !root.contains(cur)) {
    focus(first(root, all));
    return true;
  }
  const a = cur.getBoundingClientRect();
  const gap = (lo1: number, hi1: number, lo2: number, hi2: number) => Math.max(0, lo2 - hi1, lo1 - hi2);
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of all) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const along = dir === 'down' ? b.top - a.bottom : dir === 'up' ? a.top - b.bottom : dir === 'right' ? b.left - a.right : a.left - b.right;
    if (along < -2) continue;
    const across = dir === 'up' || dir === 'down' ? gap(a.left, a.right, b.left, b.right) : gap(a.top, a.bottom, b.top, b.bottom);
    const score = Math.max(0, along) + across * 3;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (!best) return false;
  focus(best);
  return true;
}

// Tab stays inside the overlay. The map and its panels are behind it.
export function cycleFocus(root: HTMLElement, back: boolean) {
  const all = focusables(root);
  if (!all.length) return;
  const at = all.indexOf(document.activeElement as HTMLElement);
  if (at < 0) focus(back ? all[all.length - 1] : first(root, all));
  else focus(all[(at + (back ? all.length - 1 : 1)) % all.length]);
}

// A key while a screen is open. Returns true when the key did something.
export function screenKey(app: App, e: KeyboardEvent): boolean {
  const root = app.overlay;
  const active = document.activeElement as HTMLElement | null;
  const inside = !!active && root.contains(active);
  if (e.key in ARROWS) return moveFocus(root, ARROWS[e.key]);
  if (e.key === 'Enter' || e.key === ' ') {
    // A button handles these keys itself.
    if (!inside || active!.tagName === 'BUTTON' || !active!.dataset.click) return false;
    active!.click();
    return true;
  }
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const target = [...root.querySelectorAll<HTMLElement>('[data-key]')].find((el) => el.dataset.key === key);
  if (target) {
    if ((target as HTMLButtonElement).disabled) return true;
    target.focus();
    if (target.tagName !== 'INPUT') target.click();
    return true;
  }
  const next = SCREEN_KEYS[key];
  if (next && app.hasGame && !NO_SWITCH.has(app.screen)) {
    app.open(next);
    return true;
  }
  return false;
}

// The focus before the overlay is drawn again: the position of the focused item in the list of items.
export function focusIndex(root: HTMLElement): number {
  const active = document.activeElement as HTMLElement | null;
  return active && root.contains(active) ? focusables(root).indexOf(active) : -1;
}

export function restoreFocus(root: HTMLElement, index: number) {
  if (index < 0) return;
  const all = focusables(root);
  if (all.length) all[Math.min(index, all.length - 1)].focus({ preventScroll: true });
}
