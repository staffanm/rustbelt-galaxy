import '@fontsource/zilla-slab/400.css';
import '@fontsource/zilla-slab/400-italic.css';
import '@fontsource/zilla-slab/600.css';
import '@fontsource/zilla-slab/700.css';
import '@fontsource/big-shoulders-display/700';
import '@fontsource/big-shoulders-display/800';
import '@fontsource/big-shoulders-stencil-display/800';
import { DEBUG_LEVELS, debugLevel, setDebugLevel, type DebugLevel } from './core/debug';
import { declareWar } from './core/diplomacy';
import { claimOptions, createUnit } from './core/planet';
import { meet } from './core/visibility';
import { App } from './ui/app';
import { loadExternalArt } from './ui/art';
import { clearSceneCache } from './ui/scene';

const canvas = document.getElementById('map') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLElement;
const overlay = document.getElementById('overlay') as HTMLElement;

const app = new App(canvas, hud, overlay);
// The debug log shows hidden state, so it is off in a production build. A development build starts at "major", or at
// the level of the URL parameter "log" (off, major, minor, trace). setDebugLevel in the console changes it later.
if (import.meta.env.DEV) {
  const wanted = new URLSearchParams(location.search).get('log') as DebugLevel | null;
  setDebugLevel(wanted && DEBUG_LEVELS.includes(wanted) ? wanted : 'major');
}
// For tests and for the browser console.
Object.assign(window, { app, core: { claimOptions, createUnit, declareWar, meet, setDebugLevel, debugLevel } });
app.refresh();
// The map draws its text on a canvas, which does not redraw by itself when a font arrives.
void Promise.all(['700 12px "Zilla Slab"', '800 12px "Big Shoulders Stencil Display"'].map((f) => document.fonts.load(f))).then(() => app.renderer.request());
loadExternalArt().then((n) => {
  app.artCount = n;
  clearSceneCache();
  app.refresh();
});
