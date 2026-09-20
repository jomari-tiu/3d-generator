import type { Vec2 } from '../text/flatten';
import { clipHalfPlane, insetConvex, mulberry32, signedArea } from './geom';
import type { Rings } from './types';

export interface VoronoiOptions {
  readonly seeds: number;
  /** Lloyd relaxation passes. Each one evens the cells out a little more. */
  readonly relax: number;
  /** Wall thickness between cells. Half of it comes off each side. */
  readonly gap: number;
  readonly radius: number;
  readonly seed: number;
}

/**
 * Voronoi cells, by half-plane intersection.
 *
 * O(n^2) and deliberately so. A sweepline would be asymptotically better and a
 * great deal more code, and at the few hundred seeds a printable panel can
 * carry, clipping a small convex polygon against every other seed is already
 * fast enough to run inside a slider drag. The half-plane clip is also the same
 * routine that insets each finished cell to leave the wall, so the whole family
 * costs one primitive.
 *
 * Seeded throughout: a pattern that came back different after a reload would
 * break the promise every other control in this app keeps.
 */
export function voronoi(o: VoronoiOptions): Rings {
  const n = Math.max(2, Math.round(o.seeds));
  const rng = mulberry32(o.seed);
  const R = o.radius;

  // Uniform over the disc: sqrt on the radius, or every seed crowds the centre
  // and the cells come out as a rosette instead of a pattern.
  let points: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const t = rng() * 2 * Math.PI;
    const r = R * Math.sqrt(rng());
    points.push([r * Math.cos(t), r * Math.sin(t)]);
  }

  // The frame every cell starts as. Generous, because a cell on the outside of
  // the cloud is unbounded in the true diagram and only the frame closes it.
  const frame: Vec2[] = [
    [-R * 1.5, -R * 1.5],
    [R * 1.5, -R * 1.5],
    [R * 1.5, R * 1.5],
    [-R * 1.5, R * 1.5],
  ];

  for (let pass = 0; pass < Math.max(0, Math.round(o.relax)); pass++) {
    points = points.map((p, i) => centroid(cellFor(points, i, frame)) ?? p);
  }

  const out: Rings = [];
  const d = Math.max(0, o.gap) / 2;
  for (let i = 0; i < points.length; i++) {
    const cell = cellFor(points, i, frame);
    if (cell.length < 3) continue;
    const inset = insetConvex(cell, d);
    if (inset.length >= 3) out.push(inset);
  }
  return out;
}

/** The cell of seed `i`: the frame clipped by the bisector against every other seed. */
function cellFor(points: readonly Vec2[], i: number, frame: readonly Vec2[]): Vec2[] {
  const p = points[i]!;
  let cell: Vec2[] = [...frame];
  for (let j = 0; j < points.length && cell.length >= 3; j++) {
    if (j === i) continue;
    const q = points[j]!;
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) continue;
    // Bisector through the midpoint, directed so that p's side is kept.
    const mx = (p[0] + q[0]) / 2;
    const my = (p[1] + q[1]) / 2;
    cell = clipHalfPlane(cell, [mx, my], [mx - dy, my + dx]);
  }
  return cell;
}

function centroid(poly: readonly Vec2[]): Vec2 | null {
  const a = signedArea(poly);
  if (Math.abs(a) < 1e-12) return null;
  let cx = 0;
  let cy = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % n]!;
    const cross = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * cross;
    cy += (p[1] + q[1]) * cross;
  }
  return [cx / (6 * a), cy / (6 * a)];
}
