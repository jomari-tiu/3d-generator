// Synthetic pictures for the tracer tests. Hard-edged on purpose: with no
// anti-aliasing the mask is exactly the shape that was asked for, so an area or
// a ring count that comes out wrong is the tracer's doing and not the fixture's.
import type { Bitmap, Mask } from '../src/core/image/types';

export interface GridOptions {
  /** Grey level of a '#' cell, 0..255. Default black. */
  readonly ink?: number;
  /** Grey level of a '.' cell, 0..255. Default white. */
  readonly paper?: number;
  readonly inkAlpha?: number;
  readonly paperAlpha?: number;
  readonly name?: string;
}

/** ASCII art -> Bitmap. '#' is ink, anything else is paper. */
export function bitmapOf(rows: readonly string[], o: GridOptions = {}): Bitmap {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const gray = new Uint8Array(w * h);
  const alpha = new Uint8Array(w * h);
  const ink = o.ink ?? 0;
  const paper = o.paper ?? 255;
  const inkA = o.inkAlpha ?? 255;
  const paperA = o.paperAlpha ?? 255;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const on = rows[y]![x] === '#';
      const i = y * w + x;
      const a = on ? inkA : paperA;
      alpha[i] = a;
      // Composite over white, the same way the real decoder does, so a fixture
      // with transparency reads through the brightness channel as white.
      const t = a / 255;
      gray[i] = Math.round((on ? ink : paper) * t + 255 * (1 - t));
    }
  }
  return { width: w, height: h, gray, alpha, name: o.name ?? 'fixture' };
}

export function maskOf(rows: readonly string[]): Mask {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const bits = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) bits[y * w + x] = rows[y]![x] === '#' ? 1 : 0;
  }
  return { w, h, bits };
}

/**
 * A hard-edged annulus, centred. innerRadius 0 gives a filled disc.
 *
 * The one fixture with a curve and a counter in it: enough to tell a tracer
 * that hollows holes from one that fills them, and enough for an area check
 * against pi * (R^2 - r^2) to mean something.
 */
export function disc(size: number, outerRadius: number, innerRadius: number, grey = 0): Bitmap {
  const gray = new Uint8Array(size * size).fill(255);
  const alpha = new Uint8Array(size * size).fill(255);
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      if (d < outerRadius && d >= innerRadius) gray[y * size + x] = grey;
    }
  }
  return { width: size, height: size, gray, alpha, name: 'disc' };
}
