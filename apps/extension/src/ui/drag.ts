// Lets the player drag the tray anywhere. Positions are stored relative to
// the nearest screen corner, so the tray stays put in that corner when the
// window resizes and the panel opens away from it.

export interface TrayPosition {
  h: "left" | "right";
  /** Distance from the left or right edge, in CSS pixels. */
  x: number;
  v: "top" | "bottom";
  /** Distance from the top or bottom edge, in CSS pixels. */
  y: number;
}

export const DEFAULT_POSITION: TrayPosition = { h: "right", x: 16, v: "bottom", y: 16 };

const MARGIN = 8;
/** Pointer travel before a press becomes a drag, so taps still click. */
const DRAG_THRESHOLD = 4;

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi));

export function isPosition(value: unknown): value is TrayPosition {
  const p = value as TrayPosition;
  return (
    typeof p === "object" &&
    p !== null &&
    (p.h === "left" || p.h === "right") &&
    (p.v === "top" || p.v === "bottom") &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y)
  );
}

/** Pulls a position back on screen for an element of the given size. */
export function clampPosition(pos: TrayPosition, width: number, height: number): TrayPosition {
  return {
    ...pos,
    x: clamp(pos.x, MARGIN, innerWidth - width - MARGIN),
    y: clamp(pos.y, MARGIN, innerHeight - height - MARGIN),
  };
}

/** Anchors a rectangle to whichever screen edges it sits closest to. */
export function positionFromRect(r: DOMRect): TrayPosition {
  const left = r.left + r.width / 2 < innerWidth / 2;
  const top = r.top + r.height / 2 < innerHeight / 2;
  return {
    h: left ? "left" : "right",
    x: Math.round(left ? r.left : innerWidth - r.right),
    v: top ? "top" : "bottom",
    y: Math.round(top ? r.top : innerHeight - r.bottom),
  };
}

export function applyPosition(el: HTMLElement, pos: TrayPosition): void {
  el.dataset.h = pos.h;
  el.dataset.v = pos.v;
  el.style.left = pos.h === "left" ? `${pos.x}px` : "auto";
  el.style.right = pos.h === "right" ? `${pos.x}px` : "auto";
  el.style.top = pos.v === "top" ? `${pos.y}px` : "auto";
  el.style.bottom = pos.v === "bottom" ? `${pos.y}px` : "auto";
}

/**
 * Drags `el` by any of `handles`. Presses that start on a button or field
 * inside a handle are left alone, unless the handle is that button. A click
 * that ends a drag is swallowed so it doesn't also open or toggle anything.
 */
export function makeDraggable(el: HTMLElement, handles: HTMLElement[], onDrop: (pos: TrayPosition) => void): void {
  let swallowClick = false;

  for (const handle of handles) {
    handle.addEventListener("pointerdown", (down) => {
      if (down.button !== 0) return;
      const control = (down.target as Element).closest("button, input, label");
      if (control && control !== handle) return;

      const start = el.getBoundingClientRect();
      let dragging = false;
      // Capture right away so a quick flick that leaves the handle still drags.
      handle.setPointerCapture(down.pointerId);

      const move = (e: PointerEvent) => {
        const dx = e.clientX - down.clientX;
        const dy = e.clientY - down.clientY;
        if (!dragging) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
          dragging = true;
          el.dataset.dragging = "";
        }
        const left = clamp(start.left + dx, MARGIN, innerWidth - start.width - MARGIN);
        const top = clamp(start.top + dy, MARGIN, innerHeight - start.height - MARGIN);
        applyPosition(el, { h: "left", x: left, v: "top", y: top });
      };

      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        if (!dragging) return;
        delete el.dataset.dragging;
        swallowClick = true;
        setTimeout(() => (swallowClick = false));
        onDrop(positionFromRect(el.getBoundingClientRect()));
      };

      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    });
  }

  el.addEventListener(
    "click",
    (e) => {
      if (!swallowClick) return;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
}
