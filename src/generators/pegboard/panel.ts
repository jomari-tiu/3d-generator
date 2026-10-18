import type { CrossSection, Manifold } from 'manifold-3d';
import { roundedRect } from '../../core/kernel/primitives';
import { box, cylinderY, polygon, rect, slabXZ, slabYZ, type M } from '../shared/solid';
import { teardrop } from './accessories';
import { RAIL, type Derived } from './geometry';

/** The board's outline in (x, z). */
export function outline(m: M, d: Derived): CrossSection {
  return roundedRect(m, d.W, d.H, d.corner, 48).translate([0, (d.zTop + d.zBottom) / 2]);
}

/** Rib width between two hole columns, or 0 when there is no room for one. */
export function ribWidth(d: Derived): number {
  const w = Math.min(5, d.px - d.holeD - 2);
  return w >= 2 * d.nozzle ? w : 0;
}

/** The dovetail rail across the back, in (y, z): the root on the board's back face, flaring into the clamp. */
function railProfile(m: M, d: Derived): CrossSection {
  const lean = Math.tan((RAIL.flare * Math.PI) / 180);
  const tipY = d.yBack + RAIL.depth - 0.4;
  const z = d.header.railZ;
  const root = RAIL.mouth / 2;
  const tip = root + (RAIL.depth - 0.4) * lean;
  return polygon(m, [[d.yBack - 0.01, z - root], [tipY, z - tip], [tipY, z + tip], [d.yBack - 0.01, z + root]]);
}

/** The matching groove in the clamp spine, `clear` bigger all round. */
export function grooveProfile(m: M, d: Derived): CrossSection {
  const lean = Math.tan((RAIL.flare * Math.PI) / 180);
  const z = d.header.railZ;
  const mouth = RAIL.mouth / 2 + d.clear;
  const inner = mouth + RAIL.depth * lean;
  return polygon(m, [[d.yBack - 1, z - mouth], [d.yBack, z - mouth], [d.yBack + RAIL.depth, z - inner], [d.yBack + RAIL.depth, z + inner], [d.yBack, z + mouth], [d.yBack - 1, z + mouth]]);
}

/** Where the hook-free band behind the hole grid ends, so the frame stays out of the tails' way. */
function gridWindow(d: Derived): { x0: number; x1: number; z0: number; z1: number } | null {
  if (d.cols.length === 0 || d.rows.length === 0) return null;
  return {
    x0: d.cols[0]! - d.holeD / 2 - 1.5,
    x1: d.cols[d.cols.length - 1]! + d.holeD / 2 + 1.5,
    z0: d.rows[d.rows.length - 1]! - d.holeD / 2 - 1.5,
    z1: d.rows[0]! + d.legH + 1,
  };
}

export interface SplitPlan {
  /** Cut lines across x (upright seams) and across z (level seams). */
  readonly xs: readonly number[];
  readonly zs: readonly number[];
}

/**
 * Where to cut a board too big for the bed. Seams fall midway between hole
 * columns or rows, never through a hole, and never through the rail band.
 */
export function splitPlan(d: Derived): SplitPlan {
  const margin = 12;
  const nx = Math.max(1, Math.ceil(d.W / (d.bed[0] - margin)));
  const nz = Math.max(1, Math.ceil(d.H / (d.bed[1] - margin)));
  const mids = (v: readonly number[]) => v.slice(1).map((b, i) => (v[i]! + b) / 2);
  const snap = (want: number, options: readonly number[]) =>
    options.reduce((best, o) => (Math.abs(o - want) < Math.abs(best - want) ? o : best), options[0] ?? want);

  const colMids = mids(d.cols);
  const xs: number[] = [];
  for (let k = 1; k < nx && colMids.length; k++) {
    const x = snap(-d.W / 2 + (k * d.W) / nx, colMids);
    if (!xs.includes(x)) xs.push(x);
  }
  const rowMids = mids(d.rows);
  const zs: number[] = [];
  for (let k = 1; k < nz && rowMids.length; k++) {
    const z = snap(d.zTop - (k * d.H) / nz, rowMids);
    if (!zs.includes(z)) zs.push(z);
  }
  return { xs: xs.sort((a, b) => a - b), zs: zs.sort((a, b) => b - a) };
}

/** Half-widths of the joint ribs either side of an upright and a level seam. */
function seamHalf(d: Derived): { x: number; z: number } {
  return {
    x: Math.max(2, Math.min(7, (d.px - d.holeD) / 2 - 1)),
    z: Math.max(2, Math.min(5.5, d.pz / 2 - Math.max(d.holeD / 2, d.legH) - 0.75)),
  };
}

export interface Dowel {
  readonly at: readonly [number, number, number];
  readonly axis: 'x' | 'z';
}

export const dowelR = (d: Derived) => Math.max(1.5, Math.min(2, (d.pt + d.gap) / 2 - 1.5));
export const dowelLength = (d: Derived, axis: 'x' | 'z') => 2 * (axis === 'x' ? seamHalf(d).x : seamHalf(d).z) - 1;

/** Dowels across every seam, between the rows or columns, a few per seam. */
export function dowels(d: Derived, plan: SplitPlan): Dowel[] {
  const y = d.yFront + (d.pt + d.gap) / 2;
  const out: Dowel[] = [];
  const zMids = d.rows.slice(1).map((b, i) => (d.rows[i]! + b) / 2);
  for (const x of plan.xs) {
    const zs = [(d.header.z0 + d.header.z1) / 2 + (d.mount === 'below' ? -3 : 3), ...zMids.filter((_, i) => i % 2 === 1)];
    for (const z of zs) out.push({ at: [x, y, z], axis: 'x' });
  }
  const xMids = d.cols.slice(1).map((b, i) => (d.cols[i]! + b) / 2);
  for (const z of plan.zs) {
    const picks = xMids.filter((_, i) => i % 2 === 0);
    for (const x of picks) out.push({ at: [x, y, z], axis: 'z' });
  }
  return out;
}

/**
 * The whole board, before any splitting: the holed face, the frame and ribs
 * behind it standing it off the clamp, and the rail along the back.
 */
export function buildPanel(m: M, d: Derived, plan: SplitPlan): Manifold {
  const out = outline(m, d);
  const ch = Math.min(d.chamfer, d.pt - 1);
  const yPlateBack = d.yFront + d.pt;

  const face =
    ch > 0.05
      ? m.Manifold.union([
          m.Manifold.hull([slabXZ(m, out.offset(-ch, 'Round', 2, 48), d.yFront, d.yFront + 0.01), slabXZ(m, out, d.yFront + ch, d.yFront + ch + 0.01)]),
          slabXZ(m, out, d.yFront + ch, yPlateBack),
        ])
      : slabXZ(m, out, d.yFront, yPlateBack);

  // Behind the face: everything but the window the hook tails need.
  const win = gridWindow(d);
  let backing: CrossSection = win ? out.subtract(rect(m, win.x0, win.x1, win.z0, win.z1)) : out;
  backing = backing.add(rect(m, -d.W / 2, d.W / 2, d.header.z0, d.header.z1).intersect(out));
  const rw = ribWidth(d);
  const extras: CrossSection[] = [];
  if (win && d.ribs && rw > 0) {
    for (let i = 1; i < d.cols.length; i += 2) {
      const x = (d.cols[i - 1]! + d.cols[i]!) / 2;
      extras.push(rect(m, x - rw / 2, x + rw / 2, win.z0 - 1, win.z1 + 1));
    }
  }
  const seam = seamHalf(d);
  for (const x of plan.xs) extras.push(rect(m, x - seam.x, x + seam.x, d.zBottom, d.zTop));
  for (const z of plan.zs) extras.push(rect(m, -d.W / 2, d.W / 2, z - seam.z, z + seam.z));
  if (extras.length) backing = backing.add(m.CrossSection.union(extras).intersect(out));
  const back = slabXZ(m, backing, yPlateBack - 0.01, d.yBack);

  // The rail stops short of the rounded corners.
  const railEnd = d.W / 2 - Math.max(1, d.corner);
  const rail = slabYZ(m, railProfile(m, d), -railEnd, railEnd);

  const holes: Manifold[] = [];
  for (const x of d.cols) {
    for (const z of d.rows) {
      holes.push(cylinderY(m, d.holeD / 2, x, z, d.yFront - 1, yPlateBack + 0.5));
      // A thick board keeps a short hole at the face, so the hook's bend can
      // still turn through it.
      if (d.counterbore > 0) holes.push(cylinderY(m, d.counterbore / 2, x, z, d.yFront + d.land, yPlateBack + 0.5));
    }
  }
  // Dowel holes, teardrop up: the board prints face down, so up is +y.
  const r = dowelR(d) + d.clear / 2;
  for (const dw of dowels(d, plan)) {
    const half = dowelLength(d, dw.axis) / 2 + 0.6;
    const [x, y, z] = dw.at;
    if (dw.axis === 'x') {
      holes.push(slabYZ(m, teardrop(m, r, [1, 0]).translate([y, z]), x - half, x + half));
    } else {
      holes.push(m.Manifold.extrude(teardrop(m, r, [0, 1]).translate([x, y]), 2 * half).translate([0, 0, z - half]));
    }
  }

  return m.Manifold.union([face, back, rail]).subtract(m.Manifold.union(holes));
}

/** Cut the board along the plan, left to right and top to bottom. */
export function sections(m: M, d: Derived, panel: Manifold, plan: SplitPlan): { body: Manifold; col: number; row: number }[] {
  const xEdges = [-d.W / 2 - 5, ...plan.xs, d.W / 2 + 5];
  const zEdges = [d.zTop + 5, ...plan.zs, d.zBottom - 5];
  if (xEdges.length === 2 && zEdges.length === 2) return [{ body: panel, col: 0, row: 0 }];
  const out: { body: Manifold; col: number; row: number }[] = [];
  for (let r = 0; r < zEdges.length - 1; r++) {
    for (let c = 0; c < xEdges.length - 1; c++) {
      const cut = box(m, xEdges[c]!, xEdges[c + 1]!, d.yFront - 5, d.yBack + 10, zEdges[r + 1]!, zEdges[r]!);
      const body = panel.intersect(cut);
      if (!body.isEmpty()) out.push({ body, col: c, row: r });
    }
  }
  return out;
}
