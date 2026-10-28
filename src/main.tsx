import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyAppearance } from './appearance';
import './styles.css';

// Prefs arrive synchronously with the preload bridge, so glass is applied before first paint.
if (window.encore?.prefs) applyAppearance(window.encore.prefs);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
