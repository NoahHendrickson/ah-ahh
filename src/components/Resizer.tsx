import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

/**
 * How wide each side panel can be dragged, saved across launches. `column` is its track in the .app
 * grid, and `dir` which way the pointer moves to widen it. The layout (.app in styles.css) also caps
 * both so the page keeps --page-min, however small the window gets.
 */
const PANES = {
  sidebar: { min: 180, max: 320, initial: 236, column: 0, other: 'queue', dir: 1 },
  queue: { min: 260, max: 440, initial: 320, column: 2, other: 'sidebar', dir: -1 },
} as const;
type Pane = keyof typeof PANES;

const storageKey = (pane: Pane) => `ahahh.${pane}Width`;

function savedWidth(pane: Pane) {
  const { min, max, initial } = PANES[pane];
  const saved = Number(localStorage.getItem(storageKey(pane)) ?? initial);
  return Number.isFinite(saved) ? Math.min(Math.max(saved, min), max) : initial;
}

/** The saved widths, as the .app element's --sidebar-w and --queue-w. */
export function paneWidths(): CSSProperties {
  return { '--sidebar-w': `${savedWidth('sidebar')}px`, '--queue-w': `${savedWidth('queue')}px` } as CSSProperties;
}

/**
 * Drag a panel's inner edge to resize it; double-click to put it back. While dragging, the width is
 * set on .app directly rather than through React, so nothing re-renders.
 */
export function Resizer({ pane }: { pane: Pane }) {
  const { min, max, initial, column, other, dir } = PANES[pane];

  const resize = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const handle = e.currentTarget;
    const app = handle.closest<HTMLElement>('.app')!;
    // Rendered widths, which the layout may have capped below the saved ones (a closed queue is 0).
    const style = getComputedStyle(app);
    const columns = style.gridTemplateColumns.split(' ').map(parseFloat);
    const from = columns[column];
    const room = innerWidth - columns[PANES[other].column] - parseFloat(style.getPropertyValue('--page-min'));
    const limit = Math.max(Math.min(max, room), from);
    let width = from;
    handle.setPointerCapture(e.pointerId);
    app.classList.add('resizing');
    const move = (ev: PointerEvent) => {
      width = Math.round(Math.min(Math.max(from + dir * (ev.clientX - e.clientX), min), limit));
      app.style.setProperty(`--${pane}-w`, `${width}px`);
    };
    // Fires after pointerup and pointercancel alike.
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('lostpointercapture', end);
      app.classList.remove('resizing');
      localStorage.setItem(storageKey(pane), String(width));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('lostpointercapture', end);
  };

  return (
    <div
      className={`resizer resizer-${pane} no-drag`}
      onPointerDown={resize}
      onDoubleClick={(e) => {
        localStorage.removeItem(storageKey(pane));
        e.currentTarget.closest<HTMLElement>('.app')!.style.setProperty(`--${pane}-w`, `${initial}px`);
      }}
    />
  );
}
