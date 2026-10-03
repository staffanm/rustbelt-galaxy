// A large view of one image over the whole window. A click closes it.
import { h } from './dom';
import { closeButton } from './widgets';

export function openLightbox(src: string): HTMLImageElement {
  const big = h(src.startsWith('data:') ? 'img.px' : 'img.smooth', { src, draggable: 'false' }) as HTMLImageElement;
  // The image fills 90% of the window width or 84% of its height, whichever comes first, at its own aspect ratio.
  const size = () => {
    const k = Math.min((window.innerWidth * 0.9) / big.naturalWidth, (window.innerHeight * 0.84) / big.naturalHeight);
    big.style.width = `${Math.round(big.naturalWidth * k)}px`;
    big.style.height = `${Math.round(big.naturalHeight * k)}px`;
  };
  big.addEventListener('load', size);
  window.addEventListener('resize', size);
  const box = h(
    'div.lightbox',
    {
      onclick: () => {
        window.removeEventListener('resize', size);
        box.remove();
      },
    },
    closeButton(() => box.click()),
    big,
    h('div.dim', null, 'Click to close'),
  );
  document.body.appendChild(box);
  return big;
}

// The URL of the full size original of a generated image in art/originals/hd, served as originals/hd/.
export function originalUrl(src: string): string {
  return src.replace('/assets/hd/', '/originals/hd/');
}
