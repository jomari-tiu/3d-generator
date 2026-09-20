export type Vec2 = [number, number];

export interface PathCommand {
  type: 'M' | 'L' | 'Q' | 'C' | 'Z';
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

const sub2 = (a: number, b: number, c: number) => Math.abs(a - 2 * b + c);

/**
 * Segment count for a bezier from the second-difference bound.
 * For a quadratic the max chord deviation of one segment is
 * |P0 - 2*P1 + P2| / 8, and subdividing into n pieces scales it by 1/n^2.
 */
const segsFor = (d: number, eps: number) => Math.max(1, Math.ceil(Math.sqrt(d / (8 * eps))));

/**
 * opentype.js Path.commands -> closed rings in Y-UP model space.
 *
 * Two verified opentype.js quirks are handled here, and both silently produce
 * garbage if missed:
 *   1. Glyph.getPath() NEGATES Y (it emits screen space). We negate it back.
 *   2. getPath() DROPS the 'Z' command for fill-only paths, so a new 'M'
 *      (or the end of the stream) implicitly closes the current ring.
 *
 * Winding is deliberately NOT normalised here: rings come out in font order
 * and the caller hands them to Clipper2 with the NonZero fill rule, which
 * resolves outer-vs-counter without any nesting analysis on our side.
 */
export function commandsToRings(cmds: readonly PathCommand[], eps: number): Vec2[][] {
  const rings: Vec2[][] = [];
  let ring: Vec2[] = [];
  let cx = 0;
  let cy = 0;

  const dedupe = eps * 0.1;

  const push = (x: number, y: number): void => {
    const n = ring.length;
    if (n > 0) {
      const prev = ring[n - 1]!;
      // Clipper2 tolerates duplicates, but they inflate the ring and can
      // create zero-area spurs after offset().
      if (Math.hypot(x - prev[0], y - prev[1]) < dedupe) return;
    }
    ring.push([x, y]);
  };

  const close = (): void => {
    if (ring.length >= 3) {
      const first = ring[0]!;
      const last = ring[ring.length - 1]!;
      if (Math.hypot(first[0] - last[0], first[1] - last[1]) < dedupe) ring.pop();
      if (ring.length >= 3) rings.push(ring);
    }
    ring = [];
  };

  for (const c of cmds) {
    switch (c.type) {
      case 'M': {
        close();
        cx = c.x!;
        cy = -c.y!;
        push(cx, cy);
        break;
      }
      case 'L': {
        cx = c.x!;
        cy = -c.y!;
        push(cx, cy);
        break;
      }
      case 'Q': {
        const x1 = c.x1!;
        const y1 = -c.y1!;
        const x = c.x!;
        const y = -c.y!;
        const n = segsFor(Math.hypot(sub2(cx, x1, x), sub2(cy, y1, y)), eps);
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const u = 1 - t;
          push(u * u * cx + 2 * u * t * x1 + t * t * x, u * u * cy + 2 * u * t * y1 + t * t * y);
        }
        cx = x;
        cy = y;
        break;
      }
      case 'C': {
        const x1 = c.x1!;
        const y1 = -c.y1!;
        const x2 = c.x2!;
        const y2 = -c.y2!;
        const x = c.x!;
        const y = -c.y!;
        const d = Math.max(
          Math.hypot(sub2(cx, x1, x2), sub2(cy, y1, y2)),
          Math.hypot(sub2(x1, x2, x), sub2(y1, y2, y)),
        );
        const n = segsFor(d, eps);
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const u = 1 - t;
          const k0 = u * u * u;
          const k1 = 3 * u * u * t;
          const k2 = 3 * u * t * t;
          const k3 = t * t * t;
          push(k0 * cx + k1 * x1 + k2 * x2 + k3 * x, k0 * cy + k1 * y1 + k2 * y2 + k3 * y);
        }
        cx = x;
        cy = y;
        break;
      }
      case 'Z': {
        close();
        break;
      }
    }
  }
  close();
  return rings;
}

/** Signed area of a ring (shoelace). Positive = counter-clockwise. */
export function ringArea(ring: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % n]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function ringBounds(rings: readonly Vec2[][]): {
  min: Vec2;
  max: Vec2;
} | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { min: [minX, minY], max: [maxX, maxY] };
}
