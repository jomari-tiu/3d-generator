import { describe, expect, it } from 'vitest';
import { coerceAll, defaultsOf } from '../src/core/params/validate';
import type { Params } from '../src/core/params/types';
import { pegboardGenerator } from '../src/generators/pegboard/build';
import { derive, PEG_FIT, type Derived } from '../src/generators/pegboard/geometry';

/*
 * Can an accessory actually be hung on the board -- and does it stay there?
 *
 * A pegboard hook is only worth modelling if a hand can get it into the hole.
 * Everything that decides that happens in the side profile (y into the board,
 * z up), so this works there: the accessory's profile -- back plate, hook peg
 * with its bend, lower stub -- against the board's profile -- the slabs between
 * holes, the counterbores, the clamp spine behind the gap -- and a search over
 * every slide and tilt of the accessory, on a 0.25 mm / 1 degree grid, for a way
 * from hanging to clear of the board.
 *
 * Found: it can be hung (and taken off). Not found with the tilt held to a few
 * degrees: it cannot fall out while it hangs. Both are required.
 *
 * The first version of the hook failed the first test outright: a round peg
 * with a square corner, as thick as the hole allowed. Nothing could fit it.
 */

type P = readonly (readonly [number, number])[];
const rect = (y0: number, y1: number, z0: number, z1: number): P => [[y0, z0], [y1, z0], [y1, z1], [y0, z1]];
const disc = (y: number, z: number, r: number): P =>
  Array.from({ length: 12 }, (_, i) => [y + r * Math.cos((i * Math.PI) / 6), z + r * Math.sin((i * Math.PI) / 6)] as const);

/** A rod of thickness s along a polyline: convex quads, discs at the joints. */
function tube(pts: readonly (readonly [number, number])[], s: number): P[] {
  const out: P[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [y0, z0] = pts[i]!;
    const [y1, z1] = pts[i + 1]!;
    const L = Math.hypot(y1 - y0, z1 - z0);
    const ny = (-(z1 - z0) / L) * (s / 2);
    const nz = ((y1 - y0) / L) * (s / 2);
    out.push([[y0 + ny, z0 + nz], [y1 + ny, z1 + nz], [y1 - ny, z1 - nz], [y0 - ny, z0 - nz]]);
    if (i > 0) out.push(disc(y0, z0, s / 2));
  }
  const [ye, ze] = pts[pts.length - 1]!;
  out.push(disc(ye, ze, s / 2));
  return out;
}

function separated(a: P, b: P): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const [y0, z0] = poly[i]!;
      const [y1, z1] = poly[(i + 1) % poly.length]!;
      const ax = z0 - z1;
      const ay = y1 - y0;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const [y, z] of a) { const v = y * ax + z * ay; a0 = Math.min(a0, v); a1 = Math.max(a1, v); }
      for (const [y, z] of b) { const v = y * ax + z * ay; b0 = Math.min(b0, v); b1 = Math.max(b1, v); }
      if (a1 <= b0 + 1e-9 || b1 <= a0 + 1e-9) return true;
    }
  }
  return false;
}

/** The profiles, from the generator's own derived dimensions. */
function profiles(d: Derived) {
  const R = d.holeD / 2;
  const C = d.counterbore > 0 ? d.counterbore / 2 : R;
  const t = d.pt;
  const pz = d.pz;
  const board: P[] = [rect(t + d.gap, t + d.gap + 50, -200, 200)];
  // Holes at z = 0 and z = -pz: slabs above, between and below.
  for (const [lo, hi, lo2, hi2] of [[R, 200, C, 200], [-pz + R, -R, -pz + C, -C], [-200, -pz - R, -200, -pz - C]] as const) {
    board.push(rect(0, d.land, lo, hi));
    if (t > d.land) board.push(rect(d.land, t, lo2, hi2));
  }

  const s = 2 * d.pinR;
  const yBend = t + d.clear;
  const path: [number, number][] = [[-1, d.pegZ], [yBend, d.pegZ]];
  for (let i = 1; i <= 8; i++) {
    const a = ((PEG_FIT.sweep * i) / 8) * (Math.PI / 180);
    path.push([yBend + d.bendR * Math.sin(a), d.pegZ + d.bendR * (1 - Math.cos(a))]);
  }
  const accessory: P[] = [
    ...tube(path, s),
    ...tube([[-1, d.pegZ - pz], [d.land * 0.85, d.pegZ - pz]], s),
    rect(-3, 0, -pz - R - 4, d.pinR + 4),
  ];
  return { board, accessory };
}

/** Is there a path, tilting no more than `maxTilt` degrees, from hanging to clear? */
function escapes(d: Derived, maxTilt: number): boolean {
  const { board, accessory } = profiles(d);
  const clear = (dy: number, dz: number, th: number) => {
    const c = Math.cos(th), s = Math.sin(th);
    return accessory.every((poly) => {
      const moved: P = poly.map(([y, z]) => [y * c - z * s + dy, y * s + z * c + dz] as const);
      return board.every((b) => separated(moved, b));
    });
  };
  const Y: number[] = [], Z: number[] = [], T: number[] = [];
  for (let v = -16; v <= 1.001; v += 0.25) Y.push(v);
  for (let v = -8; v <= 8.001; v += 0.25) Z.push(v);
  for (let v = -maxTilt; v <= Math.min(40, maxTilt) + 0.001; v += 1) T.push((v * Math.PI) / 180);
  const at = (i: number, j: number, k: number) => (i * Z.length + j) * T.length + k;
  const seen = new Uint8Array(Y.length * Z.length * T.length);
  const start: [number, number, number] = [Y.findIndex((v) => Math.abs(v) < 1e-9), Z.findIndex((v) => Math.abs(v) < 1e-9), T.findIndex((v) => Math.abs(v) < 1e-9)];
  expect(clear(0, 0, 0), 'the accessory must hang without overlapping the board').toBe(true);
  const stack = [start];
  seen[at(...start)] = 1;
  while (stack.length) {
    const [i, j, k] = stack.pop()!;
    if (Y[i]! <= -15) return true;
    for (const [di, dj, dk] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
      const a = i + di, b = j + dj, c = k + dk;
      if (a < 0 || b < 0 || c < 0 || a >= Y.length || b >= Z.length || c >= T.length || seen[at(a, b, c)]) continue;
      seen[at(a, b, c)] = 1;
      if (clear(Y[a]!, Z[b]!, T[c]!)) stack.push([a, b, c]);
    }
  }
  return false;
}

const derived = (patch: Params = {}) => derive(coerceAll(pegboardGenerator, { ...defaultsOf(pegboardGenerator), ...patch }));

describe('pegboard hooks', () => {
  const cases: [string, Params][] = [
    ['the defaults', {}],
    ['5 mm holes', { holeD: 5 }],
    ['8 mm holes', { holeD: 8, pitchX: 30, pitchZ: 30 }],
    ['10 mm holes', { holeD: 10, pitchX: 30, pitchZ: 30 }],
    ['a 3 mm board', { panelThickness: 3 }],
    ['an 8 mm board, counterbored', { panelThickness: 8 }],
  ];
  for (const [label, patch] of cases) {
    it(`can be hung on, and stays on, ${label}`, () => {
      const d = derived(patch);
      expect(d.legH, 'the hook tip stands above the hole top').toBeGreaterThan(d.holeD / 2 + 1);
      expect(escapes(d, 70), 'tilted in, it threads through the hole').toBe(true);
      expect(escapes(d, 3), 'hanging, it cannot come out without being tilted').toBe(false);
    }, 60_000);
  }
});
