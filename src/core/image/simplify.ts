import type { PathCommand, Vec2 } from '../text/flatten';

/** Perpendicular distance from p to the segment ab. */
function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

/** Douglas-Peucker over an open chain, endpoints always kept. Iterative. */
function dpChain(pts: readonly Vec2[], tol: number): Vec2[] {
  const n = pts.length;
  if (n <= 2) return [...pts];
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;

  // An explicit stack, not recursion: a 600px silhouette traced at full detail
  // is tens of thousands of points, and the worst case here is linear depth.
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length > 0) {
    const [lo, hi] = stack.pop()!;
    if (hi - lo < 2) continue;
    let worst = -1;
    let worstD = tol;
    for (let i = lo + 1; i < hi; i++) {
      const d = segDist(pts[i]!, pts[lo]!, pts[hi]!);
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst < 0) continue;
    keep[worst] = 1;
    stack.push([lo, worst], [worst, hi]);
  }

  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) if (keep[i] === 1) out.push(pts[i]!);
  return out;
}

/**
 * Douglas-Peucker on a CLOSED ring.
 *
 * Split at two far-apart points before simplifying, rather than treating the
 * ring as a chain from wherever the trace happened to start. Both of those
 * anchors are then endpoints and survive, so a circle keeps its shape instead
 * of collapsing toward the chord between one arbitrary start point and itself.
 */
export function simplifyRing(ring: readonly Vec2[], tol: number): Vec2[] {
  const n = ring.length;
  if (n < 4 || tol <= 0) return [...ring];

  const far = (from: Vec2): number => {
    let best = 0;
    let bestD = -1;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(ring[i]![0] - from[0], ring[i]![1] - from[1]);
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  const a = far(ring[0]!);
  const b = far(ring[a]!);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (hi - lo < 2 || (n - hi) + lo < 2) return dpChain(ring, tol);

  const first = dpChain(ring.slice(lo, hi + 1), tol);
  const second = dpChain([...ring.slice(hi), ...ring.slice(0, lo + 1)], tol);
  // Both chains carry the shared anchors; drop the duplicates on the seam.
  const out = [...first, ...second.slice(1, -1)];
  return out.length >= 3 ? out : [...ring];
}

/** Turn angle in degrees at each vertex of a closed ring. */
function turnAngles(ring: readonly Vec2[]): Float64Array {
  const n = ring.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const prev = ring[(i + n - 1) % n]!;
    const cur = ring[i]!;
    const next = ring[(i + 1) % n]!;
    const ax = cur[0] - prev[0];
    const ay = cur[1] - prev[1];
    const bx = next[0] - cur[0];
    const by = next[1] - cur[1];
    const cross = ax * by - ay * bx;
    const dot = ax * bx + ay * by;
    out[i] = Math.abs((Math.atan2(cross, dot) * 180) / Math.PI);
  }
  return out;
}

export interface SmoothOptions {
  /** 0 leaves the polygon alone, 1 is a full quadratic spline through the edge midpoints. */
  readonly smooth: number;
  /** Turn angles above this stay sharp. */
  readonly cornerAngle: number;
}

/**
 * A closed ring as path commands, with the gentle turns rounded and the sharp
 * ones left alone.
 *
 * The scheme is corner cutting expressed directly as quadratics: at a smooth
 * vertex the curve leaves the incoming edge at a shoulder, takes the vertex
 * itself as the control point and rejoins the outgoing edge at the matching
 * shoulder. At smooth = 1 the shoulders sit on the edge midpoints, which is
 * exactly one Chaikin step and so exactly a quadratic B-spline; anywhere below
 * that it is a fillet of proportional size.
 *
 * Preserving corners is not a nicety. The staircase left by a low detail
 * setting and the deliberate right angle of a logo are both 90-degree turns,
 * and smoothing cannot tell them apart -- so `detail` is what removes the
 * staircase, and this only ever rounds what survived it.
 *
 * Commands come out in the ring's own coordinate space. Y is not touched here:
 * commandsToRings negates it into model space, and SVG wants it as it is.
 */
export function ringToCommands(ring: readonly Vec2[], opts: SmoothOptions): PathCommand[] {
  const n = ring.length;
  if (n < 3) return [];

  const t = Math.min(0.5, Math.max(0, opts.smooth * 0.5));
  const angles = turnAngles(ring);

  const entry: Vec2[] = new Array(n);
  const exit: Vec2[] = new Array(n);
  const round: boolean[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const prev = ring[(i + n - 1) % n]!;
    const cur = ring[i]!;
    const next = ring[(i + 1) % n]!;
    const isCorner = angles[i]! >= opts.cornerAngle;
    if (t <= 0 || isCorner) {
      round[i] = false;
      entry[i] = cur;
      exit[i] = cur;
      continue;
    }
    round[i] = true;
    entry[i] = [cur[0] + (prev[0] - cur[0]) * t, cur[1] + (prev[1] - cur[1]) * t];
    exit[i] = [cur[0] + (next[0] - cur[0]) * t, cur[1] + (next[1] - cur[1]) * t];
  }

  const cmds: PathCommand[] = [{ type: 'M', x: exit[0]![0], y: exit[0]![1] }];
  for (let k = 1; k <= n; k++) {
    const i = k % n;
    cmds.push({ type: 'L', x: entry[i]![0], y: entry[i]![1] });
    if (round[i]) {
      cmds.push({
        type: 'Q',
        x1: ring[i]![0],
        y1: ring[i]![1],
        x: exit[i]![0],
        y: exit[i]![1],
      });
    }
  }
  cmds.push({ type: 'Z' });
  return cmds;
}

/** Scale and translate path commands in place-free fashion. */
export function transformCommands(
  cmds: readonly PathCommand[],
  scale: number,
  dx = 0,
  dy = 0,
): PathCommand[] {
  const at = (v: number | undefined, offset: number): number | undefined =>
    v === undefined ? undefined : v * scale + offset;
  return cmds.map((c) => ({
    type: c.type,
    x: at(c.x, dx),
    y: at(c.y, dy),
    x1: at(c.x1, dx),
    y1: at(c.y1, dy),
    x2: at(c.x2, dx),
    y2: at(c.y2, dy),
  }));
}
