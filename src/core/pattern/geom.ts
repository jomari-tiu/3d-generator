import type { Vec2 } from '../text/flatten';
import type { Rings } from './types';

/** Deterministic PRNG. A pattern in a permalink has to come back the same. */
export function mulberry32(seed: number): () => number {
  let a = (seed | 0) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rotateRings(rings: Rings, degrees: number): Rings {
  if (degrees === 0) return rings;
  const a = (degrees * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return rings.map((r) => r.map(([x, y]): Vec2 => [x * c - y * s, x * s + y * c]));
}

/** Axis-aligned rectangle from its centre. */
export function rect(cx: number, cy: number, w: number, h: number): Vec2[] {
  const hw = w / 2;
  const hh = h / 2;
  return [
    [cx - hw, cy - hh],
    [cx + hw, cy - hh],
    [cx + hw, cy + hh],
    [cx - hw, cy + hh],
  ];
}

/** Regular polygon, `rotation` in degrees, sized by CIRCUMradius. */
export function ngon(cx: number, cy: number, radius: number, sides: number, rotation = 0): Vec2[] {
  const out: Vec2[] = [];
  const base = (rotation * Math.PI) / 180;
  for (let i = 0; i < sides; i++) {
    const a = base + (i * 2 * Math.PI) / sides;
    out.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
  }
  return out;
}

/**
 * Segments for a circle of this radius at this chord tolerance.
 *
 * Driven by the sagitta rather than by a fixed count: r(1 - cos t) = tolerance
 * gives the half-angle one segment may span, so a 1mm hole and a 40mm disc come
 * out at the same ERROR rather than at the same vertex budget. A perforation
 * sheet has thousands of the former and would otherwise pay for the latter.
 */
export function circleSegments(radius: number, tolerance: number): number {
  const r = Math.max(radius, 1e-6);
  const ratio = Math.max(-1, Math.min(1, 1 - Math.min(tolerance, r) / r));
  const halfAngle = Math.acos(ratio);
  if (!(halfAngle > 1e-9)) return 256;
  return Math.min(256, Math.max(12, Math.ceil(Math.PI / halfAngle)));
}

export function circle(cx: number, cy: number, radius: number, tolerance: number): Vec2[] {
  return ngon(cx, cy, radius, circleSegments(radius, tolerance));
}

/** Stadium: a rectangle with semicircular ends, length along x. */
export function stadium(cx: number, cy: number, length: number, width: number, tolerance: number): Vec2[] {
  const r = width / 2;
  const straight = Math.max(0, length - width) / 2;
  if (straight <= 1e-9) return circle(cx, cy, r, tolerance);
  const steps = Math.max(4, Math.ceil(circleSegments(r, tolerance) / 2));
  const out: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / steps;
    out.push([cx + straight + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / steps;
    out.push([cx - straight + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

/**
 * Sutherland-Hodgman clip of a convex polygon against the half-plane left of
 * the directed line a -> b.
 *
 * The one primitive Voronoi needs twice over: a cell IS the intersection of
 * half-planes, and insetting that cell by a wall is the same intersection again
 * with each of its own edges pushed inward. Writing it once is why there is no
 * polygon-offset library in here.
 */
export function clipHalfPlane(poly: readonly Vec2[], a: Vec2, b: Vec2): Vec2[] {
  const n = poly.length;
  if (n === 0) return [];
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const side = (p: Vec2): number => ex * (p[1] - a[1]) - ey * (p[0] - a[0]);

  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % n]!;
    const sp = side(p);
    const sq = side(q);
    if (sp >= 0) out.push(p);
    if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return out;
}

/** Inset a CONVEX polygon by `d`, by clipping it with its own edges moved in. */
export function insetConvex(poly: readonly Vec2[], d: number): Vec2[] {
  if (d <= 0) return [...poly];
  let out = [...poly];
  const n = poly.length;
  for (let i = 0; i < n && out.length >= 3; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const len = Math.hypot(ex, ey);
    if (len < 1e-9) continue;
    // Inward normal for a counter-clockwise ring is the edge turned left.
    const nx = -ey / len;
    const ny = ex / len;
    out = clipHalfPlane(out, [a[0] + nx * d, a[1] + ny * d], [b[0] + nx * d, b[1] + ny * d]);
  }
  return out.length >= 3 ? out : [];
}

export function signedArea(poly: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % n]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Force counter-clockwise, which insetConvex's inward normal assumes. */
export function ccw(poly: Vec2[]): Vec2[] {
  return signedArea(poly) < 0 ? poly.slice().reverse() : poly;
}

/**
 * A polyline given real width, with mitred joins.
 *
 * Built as one closed ring -- up one side and back down the other -- rather
 * than as a run of overlapping quads. Quads would union to the same silhouette
 * only after a boolean per segment, and a 600-segment sine wave is 600 booleans
 * to produce something this computes directly.
 *
 * The mitre is capped: at a fold sharper than the limit the join is cut square
 * instead, because an unbounded mitre on a tight chevron shoots a spike out to
 * infinity and takes the pattern with it.
 */
export function thickPolyline(points: readonly Vec2[], width: number, miterLimit = 4): Vec2[] {
  const pts = dedupe(points);
  if (pts.length < 2 || width <= 0) return [];
  const h = width / 2;

  const offsetSide = (sign: number): Vec2[] => {
    const out: Vec2[] = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[i - 1];
      const cur = pts[i]!;
      const next = pts[i + 1];
      const nIn = prev ? normal(prev, cur) : null;
      const nOut = next ? normal(cur, next) : null;

      if (!nIn || !nOut) {
        const n = (nIn ?? nOut)!;
        out.push([cur[0] + sign * n[0] * h, cur[1] + sign * n[1] * h]);
        continue;
      }
      // Mitre direction is the normalised sum of the two edge normals; its
      // length falls off as the fold tightens, which is exactly the mitre
      // scale factor.
      const mx = nIn[0] + nOut[0];
      const my = nIn[1] + nOut[1];
      const mlen = Math.hypot(mx, my);
      if (mlen < 1e-9) {
        out.push([cur[0] + sign * nIn[0] * h, cur[1] + sign * nIn[1] * h]);
        continue;
      }
      const scale = 2 / (mlen * mlen);
      if (scale > miterLimit) {
        out.push([cur[0] + sign * nIn[0] * h, cur[1] + sign * nIn[1] * h]);
        out.push([cur[0] + sign * nOut[0] * h, cur[1] + sign * nOut[1] * h]);
        continue;
      }
      out.push([cur[0] + sign * mx * h * scale, cur[1] + sign * my * h * scale]);
    }
    return out;
  };

  return [...offsetSide(1), ...offsetSide(-1).reverse()];
}

function normal(a: Vec2, b: Vec2): Vec2 {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return [-dy / len, dx / len];
}

function dedupe(points: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 1e-9) continue;
    out.push(p);
  }
  return out;
}

/** Integer lattice indices whose cells can reach a disc of `radius`. */
export function latticeRange(radius: number, pitch: number): number {
  return Math.ceil(radius / Math.max(pitch, 1e-6)) + 2;
}
