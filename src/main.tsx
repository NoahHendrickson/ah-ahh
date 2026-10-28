import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyAppearance } from './appearance';
import './styles.css';

// Prefs arrive synchronously with the preload bridge, so glass is applied before first paint.
if (window.ahahh?.prefs) applyAppearance(window.ahahh.prefs);

// Scrollbars only show while scrolling: tag the scrolling element briefly.
const scrollTimers = new WeakMap<Element, number>();
document.addEventListener(
  'scroll',
  (e) => {
    const el = e.target;
    if (!(el instanceof Element)) return;
    el.classList.add('scrolling');
    clearTimeout(scrollTimers.get(el));
    scrollTimers.set(el, window.setTimeout(() => el.classList.remove('scrolling'), 800));
  },
  { capture: true, passive: true },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
