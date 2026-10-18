import type { PathCommand, Vec2 } from '../text/flatten';
import { ringAreaAbs, traceContours } from './contour';
import { inkCount, looksLikeTile, removeTile, toMask } from './mask';
import { ringToCommands, simplifyRing } from './simplify';
import type { Bitmap, Mask, TraceOptions } from './types';

export interface TraceResult {
  /** One command list per ring, in PIXEL space with Y down. */
  readonly rings: readonly (readonly PathCommand[])[];
  /** Bounding box of the simplified rings, pixel space. Null when nothing was traced. */
  readonly bounds: { readonly min: Vec2; readonly max: Vec2 } | null;
  readonly mask: Mask;
  readonly ringCount: number;
  readonly pointCount: number;
  /** A dark tile behind the artwork was taken away, leaving the light logo it framed. */
  readonly tileRemoved: boolean;
  /** Share of the image that came out as ink. 1 means the threshold flooded it. */
  readonly inkFraction: number;
}

export const TRACE_DEFAULTS = {
  detail: 1.2,
  smooth: 0.65,
  cornerAngle: 72,
  minArea: 4,
} as const;

/** The mask to trace, with a dark tile taken away when the options say to. */
export function backgroundMask(bmp: Bitmap, opts: TraceOptions): { mask: Mask; tileRemoved: boolean } {
  const mask = toMask(bmp, opts);
  const bg = opts.background ?? 'keep';
  const tileRemoved = bg === 'tile' || (bg === 'auto' && looksLikeTile(mask));
  return { mask: tileRemoved ? removeTile(mask) : mask, tileRemoved };
}

/**
 * Bitmap -> smooth closed outlines.
 *
 * Four stages, each one undoing damage the previous one could not avoid:
 * threshold to ink, walk the pixel cracks, throw away the staircase with
 * Douglas-Peucker, then round what is left. Reversing the last two -- smoothing
 * before simplifying -- rounds the staircase into scalloped edges and then
 * locks them in, which is the failure mode every naive vectoriser has.
 */
export function traceBitmap(bmp: Bitmap, opts: TraceOptions): TraceResult {
  const { mask, tileRemoved } = backgroundMask(bmp, opts);
  const detail = opts.detail ?? TRACE_DEFAULTS.detail;
  const minArea = opts.minArea ?? TRACE_DEFAULTS.minArea;
  const smoothOpts = {
    smooth: opts.smooth ?? TRACE_DEFAULTS.smooth,
    cornerAngle: opts.cornerAngle ?? TRACE_DEFAULTS.cornerAngle,
  };

  const raw = traceContours(mask, opts.diagonal ?? 'connect');
  const rings: PathCommand[][] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let points = 0;

  for (const ring of raw) {
    // Area, not point count: a long thin sliver of noise has plenty of points
    // and no printable substance, and a compact blob has the reverse.
    if (ringAreaAbs(ring) < minArea) continue;
    const simplified = simplifyRing(ring, detail);
    if (simplified.length < 3) continue;
    // Simplification can eat a ring down to a sliver that still has three
    // points; re-checking here is what stops those reaching the kernel.
    if (ringAreaAbs(simplified) < minArea) continue;

    for (const [x, y] of simplified) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    points += simplified.length;
    rings.push(ringToCommands(simplified, smoothOpts));
  }

  return {
    rings,
    bounds: Number.isFinite(minX) ? { min: [minX, minY], max: [maxX, maxY] } : null,
    mask,
    tileRemoved,
    ringCount: rings.length,
    pointCount: points,
    inkFraction: inkCount(mask) / Math.max(1, mask.w * mask.h),
  };
}
