import type { Vec2 } from '../text/flatten';
import type { DiagonalPolicy, Mask } from './types';

// Direction codes. x runs right and y runs DOWN, because that is the order the
// pixels arrive in and converting once at the end is cheaper than converting
// every comparison in here. +1 mod 4 is a visual right turn in that frame.
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

/**
 * Mask -> closed boundary rings, walked along the cracks BETWEEN pixels.
 *
 * Crack following rather than pixel-centre chain coding, because the crack
 * boundary is the actual silhouette: it is closed by construction, it lands on
 * exact integers, and a one-pixel-wide stroke comes out as a rectangle with
 * area rather than as a degenerate there-and-back line that Clipper2 collapses
 * to nothing.
 *
 * WINDING IS THE POINT. Every crack is emitted with ink on its LEFT, so outer
 * boundaries come out one way round and the holes inside them the other, and
 * the caller can hand the lot to Clipper2 with the NonZero fill rule and get
 * counters hollowed with no nesting analysis at all. This is deliberately the
 * same bargain src/core/text/flatten.ts strikes with font outlines -- one fill
 * rule, no containment tests, holes for free.
 *
 * Output is in PIXEL coordinates with Y still pointing down. commandsToRings
 * negates Y on the way to model space, and SVG wants Y down anyway, so neither
 * consumer needs a flip here.
 */
export function traceContours(mask: Mask, policy: DiagonalPolicy = 'connect'): Vec2[][] {
  const { w, h, bits } = mask;
  const px = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : bits[y * w + x]!;

  const gw = w + 1;
  const vertices = gw * (h + 1);
  // At most two cracks leave any one vertex, and exactly two only at a saddle
  // (ink meeting corner to corner). Two slots is therefore not a guess.
  const out0 = new Int8Array(vertices).fill(-1);
  const out1 = new Int8Array(vertices).fill(-1);

  const addOut = (x: number, y: number, dir: number): void => {
    const v = y * gw + x;
    if (out0[v] === -1) out0[v] = dir;
    else out1[v] = dir;
  };

  // Vertical cracks: between the pixel left of x and the pixel right of it.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x <= w; x++) {
      const left = px(x - 1, y);
      const right = px(x, y);
      if (left === right) continue;
      // Ink on the left of travel: ink to the WEST means walking north.
      if (left === 1) addOut(x, y + 1, 3);
      else addOut(x, y, 1);
    }
  }
  // Horizontal cracks: between the pixel above y and the pixel below it.
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x < w; x++) {
      const above = px(x, y - 1);
      const below = px(x, y);
      if (above === below) continue;
      if (above === 1) addOut(x, y, 0);
      else addOut(x + 1, y, 2);
    }
  }

  const used0 = new Uint8Array(vertices);
  const used1 = new Uint8Array(vertices);

  /**
   * Leave a vertex, preferring the turn the diagonal policy asks for.
   *
   * Only a saddle ever offers a choice, and there the two options are exactly
   * the two readings of a corner touch: turning RIGHT crosses to the far
   * diagonal pixel and welds the pair into one contour (8-connected ink),
   * turning LEFT hugs the near one and leaves them as two (4-connected).
   */
  const leave = (v: number, incoming: number): number => {
    const order =
      policy === 'connect'
        ? [(incoming + 1) & 3, incoming, (incoming + 3) & 3]
        : [(incoming + 3) & 3, incoming, (incoming + 1) & 3];
    for (const dir of order) {
      if (out0[v] === dir && used0[v] === 0) {
        used0[v] = 1;
        return dir;
      }
      if (out1[v] === dir && used1[v] === 0) {
        used1[v] = 1;
        return dir;
      }
    }
    return -1;
  };

  const rings: Vec2[][] = [];

  for (let seed = 0; seed < vertices; seed++) {
    for (const slot of [0, 1]) {
      const dir0 = slot === 0 ? out0[seed]! : out1[seed]!;
      const usedFlag = slot === 0 ? used0 : used1;
      if (dir0 === -1 || usedFlag[seed] === 1) continue;
      usedFlag[seed] = 1;

      const sx = seed % gw;
      const sy = (seed - sx) / gw;
      const ring: Vec2[] = [];
      let x = sx;
      let y = sy;
      let dir = dir0;
      let prevDir = -1;

      // Only record a point where the walk actually turns. A crack boundary is
      // one point per pixel edge, so a straight run down the side of a 600px
      // image is 600 collinear points that every later stage would have to
      // carry; dropping them here is exact, not an approximation.
      for (let guard = 0; guard <= vertices * 4; guard++) {
        if (dir !== prevDir) ring.push([x, y]);
        prevDir = dir;
        x += DX[dir]!;
        y += DY[dir]!;
        if (x === sx && y === sy) break;
        const next = leave(y * gw + x, dir);
        if (next === -1) break; // unreachable for a well-formed mask
        dir = next;
      }

      if (ring.length >= 3) rings.push(ring);
    }
  }

  return rings;
}

/** Shoelace area of a ring, unsigned. */
export function ringAreaAbs(ring: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % n]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}
