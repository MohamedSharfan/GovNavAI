/** Geometry for the Form Studio overlay editor. Boxes are normalised (0..1, top-left origin). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_W = 0.02;
export const MIN_H = 0.01;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v * 10_000) / 10_000;

/** Move a box by (dx, dy), keeping it fully on the page. */
export function moveBox(b: Box, dx: number, dy: number): Box {
  return { ...b, x: round(clamp(b.x + dx, 0, 1 - b.w)), y: round(clamp(b.y + dy, 0, 1 - b.h)) };
}

/** Resize from the bottom-right corner, keeping a minimum size and staying on the page. */
export function resizeBox(b: Box, dw: number, dh: number): Box {
  return { ...b, w: round(clamp(b.w + dw, MIN_W, 1 - b.x)), h: round(clamp(b.h + dh, MIN_H, 1 - b.y)) };
}

/** A new field box centred on the page. */
export function newBox(): Box {
  return { x: 0.35, y: 0.45, w: 0.3, h: 0.025 };
}

export function slugify(s: string, taken: Set<string>): string {
  const base = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "field";
  let slug = base.length < 2 ? `${base}-1` : base;
  let n = 2;
  while (taken.has(slug)) slug = `${base}-${n++}`;
  return slug;
}
