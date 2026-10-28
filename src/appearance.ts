/** Applies the glass setting to the page: a class for translucent styles, and the tint strength. */
export function applyAppearance(prefs: EncorePrefs) {
  const root = document.documentElement;
  root.classList.toggle('glass', prefs.glass && prefs.glassSupported);
  root.style.setProperty('--glass-tint', String(prefs.glassTint));
}
