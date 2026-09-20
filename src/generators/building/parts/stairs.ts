import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { LANDING_FT, type Derived } from '../geometry';
import { depth, width, type Rect } from '../plan';

/**
 * The stair in the core shaft.
 *
 * Worth having for one reason: it is what makes a section read as a building
 * rather than a box with holes in it. An empty shaft is a shaft; a shaft with
 * sixteen treads in it is a stair, and at 1:144 a 7 in riser is 1.5 mm --
 * chunky enough to see, fine enough to be unmistakably a staircase.
 *
 * Every step is a box standing on the shaft floor and rising to its own nosing,
 * so the union is a solid staircase with no overhang anywhere and it prints in
 * place unsupported. A tread-and-riser shell would use less plastic and would
 * need supports under every tread -- supports you could not reach to remove,
 * because they would be inside a 20 mm shaft.
 */

/** Risers needed to climb `heightFt` at the target riser height. Never fewer than two. */
export function risersFor(d: Derived, heightFt: number): number {
  return Math.max(2, Math.round((heightFt * 12) / d.riserTargetIn));
}

interface Flight {
  /** Footprint of the flight. */
  readonly rect: Rect;
  /** True when the flight climbs along X, false along Y. */
  readonly alongX: boolean;
  /** +1 climbs toward the rect's max end, -1 toward its min end. */
  readonly dir: 1 | -1;
  readonly steps: number;
  /** Underside of every step. All of them stand on this, whatever they land on. */
  readonly zBase: number;
  /** Walking level the flight starts from -- step k tops out `k` risers above it. */
  readonly zStart: number;
  readonly rise: number;
  readonly tread: number;
}

/**
 * Steps as separate boxes, for the caller to union.
 *
 * Each box overlaps the one behind it by `lap`. The coordinates would coincide
 * exactly without it -- both steps compute the same `start + dir*k*tread` -- but
 * a shared face with nothing behind it is precisely the knife-edge contact that
 * leaves parts of this project as loose shells, and the overlap costs nothing.
 */
function flightSolid(m: ManifoldToplevel, f: Flight): Manifold[] {
  const out: Manifold[] = [];
  const crossLo = f.alongX ? f.rect.y0 : f.rect.x0;
  const crossHi = f.alongX ? f.rect.y1 : f.rect.x1;
  const crossW = crossHi - crossLo;
  if (crossW <= 0 || f.steps < 1) return out;

  const start = f.dir > 0 ? (f.alongX ? f.rect.x0 : f.rect.y0) : f.alongX ? f.rect.x1 : f.rect.y1;
  const lap = Math.min(0.15, f.tread * 0.1);

  for (let k = 1; k <= f.steps; k++) {
    // The first step gets no lap. Lapping it would push the bottom of the
    // flight a fraction PAST the start, which is the shaft wall -- a stair that
    // pokes through its own core, by an amount small enough to hide.
    const back = start + f.dir * ((k - 1) * f.tread - (k > 1 ? lap : 0));
    const front = start + f.dir * k * f.tread;
    const lo = Math.min(back, front);
    const run = Math.abs(front - back);
    const top = f.zStart + k * f.rise;
    const h = top - f.zBase;
    if (h <= 0 || run <= 0) continue;

    out.push(
      m.Manifold.cube(f.alongX ? [run, crossW, h] : [crossW, run, h], true).translate(
        f.alongX
          ? [lo + run / 2, (crossLo + crossHi) / 2, f.zBase + h / 2]
          : [(crossLo + crossHi) / 2, lo + run / 2, f.zBase + h / 2],
      ),
    );
  }
  return out;
}

export interface StairFit {
  readonly ok: boolean;
  /** Model mm of run the chosen arrangement needs along the core's long axis. */
  readonly needs: number;
  /** Model mm available along that axis. */
  readonly has: number;
  /** Model mm of width the arrangement needs across it, and what there is. */
  readonly needsCross: number;
  readonly hasCross: number;
}

/** Does the chosen arrangement fit the core? Measured and reported, never assumed. */
export function stairFit(d: Derived, core: Rect, heightFt: number): StairFit {
  const n = risersFor(d, heightFt);
  const has = Math.max(width(core), depth(core));
  const hasCross = Math.min(width(core), depth(core));
  const needs =
    d.stairs === 'switchback'
      ? (Math.ceil(n / 2) - 1) * d.treadMm + LANDING_FT * d.perFt
      : (n - 1) * d.treadMm;
  // A switchback also needs the shaft wide enough for two flights side by side.
  // 3 ft is the narrowest flight anyone builds; below that it is a ladder.
  const needsCross = (d.stairs === 'switchback' ? 6 : 3) * d.perFt;
  return {
    ok: needs <= has + 1e-6 && needsCross <= hasCross + 1e-6,
    needs,
    has,
    needsCross,
    hasCross,
  };
}

/**
 * Build the stair climbing from this floor to the one above.
 *
 * Returns null when there is nothing to build or the arrangement does not fit.
 * The caller reports that, rather than a stair quietly running out through the
 * side of its own shaft.
 */
export function buildStairs(
  m: ManifoldToplevel,
  d: Derived,
  core: Rect,
  zFloor: number,
  heightMm: number,
  heightFt: number,
): Manifold | null {
  if (d.stairs === 'none') return null;
  if (!stairFit(d, core, heightFt).ok) return null;

  const n = risersFor(d, heightFt);
  const rise = heightMm / n;
  const alongX = width(core) >= depth(core);

  if (d.stairs === 'straight') {
    // n risers, n-1 treads: the last riser steps onto the floor above, which is
    // the slab and not a tread of ours. Getting this off by one gives a stair
    // whose top step goes nowhere, or one that ends a whole riser short.
    const parts = flightSolid(m, {
      rect: core,
      alongX,
      dir: 1,
      steps: n - 1,
      zBase: zFloor,
      zStart: zFloor,
      rise,
      tread: d.treadMm,
    });
    return parts.length > 0 ? m.Manifold.union(parts) : null;
  }

  // --- switchback: up one half of the shaft, turn on a landing, back up the other
  const nUp = Math.ceil(n / 2);
  const nDown = n - nUp;
  const longLo = alongX ? core.x0 : core.y0;
  const longHi = alongX ? core.x1 : core.y1;
  const crossLo = alongX ? core.y0 : core.x0;
  const crossHi = alongX ? core.y1 : core.x1;
  const crossMid = (crossLo + crossHi) / 2;
  const lap = Math.min(0.2, (crossHi - crossLo) * 0.05);

  const flightRun = (nUp - 1) * d.treadMm;
  const landingAt = longLo + flightRun;
  const landH = nUp * rise;

  const strip = (lo: number, hi: number, from: number, to: number): Rect =>
    alongX ? { x0: from, y0: lo, x1: to, y1: hi } : { x0: lo, y0: from, x1: hi, y1: to };

  const parts: Manifold[] = [
    ...flightSolid(m, {
      rect: strip(crossLo, crossMid + lap, longLo, landingAt),
      alongX,
      dir: 1,
      steps: nUp - 1,
      zBase: zFloor,
      zStart: zFloor,
      rise,
      tread: d.treadMm,
    }),
  ];

  // The landing. The nUp-th riser arrives on it, so its top is nUp risers up,
  // and it reaches back past the last tread so the two share real volume.
  const landLen = longHi - landingAt + lap;
  if (landLen > 0) {
    const cross = crossHi - crossLo;
    parts.push(
      m.Manifold.cube(
        alongX ? [landLen, cross, landH] : [cross, landLen, landH],
        true,
      ).translate(
        alongX
          ? [landingAt - lap + landLen / 2, (crossLo + crossHi) / 2, zFloor + landH / 2]
          : [(crossLo + crossHi) / 2, landingAt - lap + landLen / 2, zFloor + landH / 2],
      ),
    );
  }

  // The return flight. Its steps start from the LANDING's walking level but are
  // still built down to the shaft floor: a flight resting on top of a landing
  // touches it along one edge only, and comes out of the exporter as a separate
  // shell that looks perfect in the preview and falls off the print.
  parts.push(
    ...flightSolid(m, {
      rect: strip(crossMid - lap, crossHi, longLo, landingAt),
      alongX,
      dir: -1,
      steps: nDown - 1,
      zBase: zFloor,
      zStart: zFloor + landH,
      rise,
      tread: d.treadMm,
    }),
  );

  return parts.length > 0 ? m.Manifold.union(parts) : null;
}
