import type { Manifold } from 'manifold-3d';
import { roundedRect } from '../../core/kernel/primitives';
import { box, cylinder, polygon, slab, slabXZ, slabYZ, type M } from '../shared/solid';
import { PEG, TRAY_WALL, type Derived } from './geometry';

/*
 * The tray sits on the clamps' top jaws -- and, when the board hangs, on the
 * board's top edge too -- located by two pegs on each jaw. Its floor is flat
 * underneath, so it prints the way it sits.
 */

const DIVIDER_T = 2;
const GUIDE_T = 1.6;
const GUIDE_DEPTH = 2;

export interface TraySection {
  readonly x0: number;
  readonly x1: number;
}

/** Equal sections, as few as fit the bed. */
export function traySections(d: Derived): TraySection[] {
  const n = Math.max(1, Math.ceil(d.trayW / (d.bed[0] - 12)));
  const w = d.trayW / n;
  return Array.from({ length: n }, (_, i) => ({ x0: -d.trayW / 2 + i * w, x1: -d.trayW / 2 + (i + 1) * w }));
}

/** Divider positions along the whole tray, dropping any that would land on a section's own end wall. */
export function dividerXs(d: Derived, secs: readonly TraySection[]): number[] {
  const out: number[] = [];
  for (let j = 0; j < d.dividers; j++) {
    const x = -d.trayW / 2 + ((j + 1) * d.trayW) / (d.dividers + 1);
    const near = secs.some((s) => Math.abs(x - s.x0) < 10 || Math.abs(x - s.x1) < 10);
    if (!near) out.push(x);
  }
  return out;
}

const y0 = (d: Derived) => d.trayY0;
const y1 = (d: Derived) => d.trayY0 + d.trayD;

/** One tray section, from x0 to x1. */
export function buildTray(m: M, d: Derived, s: TraySection, dividers: readonly number[]): Manifold {
  const z0 = d.zJawTop;
  const top = z0 + d.trayWall;
  const w = s.x1 - s.x0;
  const cx = (s.x0 + s.x1) / 2;
  const cy = (y0(d) + y1(d)) / 2;
  const r = Math.min(d.trayCorner, w / 2 - 1, d.trayD / 2 - 1);
  const outer = roundedRect(m, w, d.trayD, r, 48).translate([cx, cy]);
  const inner = outer.offset(-TRAY_WALL, 'Round', 2, 48);

  const adds: Manifold[] = [slab(m, outer, z0, top)];
  const cuts: Manifold[] = [slab(m, inner, z0 + d.trayBase, top + 1)];

  // The desk-side wall stands only as high as the lip, with rounded shoulders.
  if (d.trayLip < d.trayWall - 0.5) {
    const notchW = Math.max(4, w - 2 * TRAY_WALL - 2 * Math.max(r, 4));
    const notch = roundedRect(m, notchW, 2 * (top - z0), Math.min(6, (top - z0 - d.trayLip) / 2, notchW / 2 - 0.1)).translate([cx, z0 + d.trayLip + (top - z0)]);
    cuts.push(slabXZ(m, notch, y1(d) - TRAY_WALL - 1, y1(d) + 1));
  }

  // Sockets for the jaw pegs, deepened by bosses inside when the floor is thin.
  const sockR = PEG.r + d.clear;
  const sockTop = z0 + PEG.h + 0.4;
  for (const x of d.clampXs) {
    for (const px of [x - d.clampW / 4, x + d.clampW / 4]) {
      if (px < s.x0 + TRAY_WALL + sockR || px > s.x1 - TRAY_WALL - sockR) continue;
      if (sockTop + 1.2 > z0 + d.trayBase) adds.push(cylinder(m, sockR + 2, px, d.pegY, z0, sockTop + 1.2));
      cuts.push(cylinder(m, sockR, px, d.pegY, z0 - 1, sockTop));
    }
  }

  const ya = y0(d) + TRAY_WALL;
  const yb = y1(d) - TRAY_WALL;
  for (const x of dividers) {
    if (x <= s.x0 || x >= s.x1) continue;
    if (d.removable) {
      // A pair of guide ribs on each long wall, a divider's width apart.
      const gap = DIVIDER_T / 2 + d.clear;
      for (const side of [-1, 1]) {
        const gx = x + side * (gap + GUIDE_T / 2);
        adds.push(box(m, gx - GUIDE_T / 2, gx + GUIDE_T / 2, ya - 0.01, ya + GUIDE_DEPTH, z0, top - 1));
        adds.push(box(m, gx - GUIDE_T / 2, gx + GUIDE_T / 2, yb - GUIDE_DEPTH, yb + 0.01, z0, z0 + d.trayLip - 1));
      }
    } else {
      adds.push(slabYZ(m, dividerProfile(m, d, 0), x - DIVIDER_T / 2, x + DIVIDER_T / 2));
    }
  }

  return m.Manifold.union(adds).subtract(m.Manifold.union(cuts));
}

/** A divider's side profile in (y, z): full height at the back, down to the lip at the front. */
function dividerProfile(m: M, d: Derived, inset: number) {
  const z0 = d.zJawTop + d.trayBase - 0.01;
  const ya = y0(d) + TRAY_WALL - 0.01 + inset;
  const yb = y1(d) - TRAY_WALL + 0.01 - inset;
  const hi = d.zJawTop + d.trayWall - 2;
  const lo = d.zJawTop + Math.max(d.trayLip - 1, d.trayBase + 3);
  const knee = yb - Math.min(15, (yb - ya) / 3);
  return polygon(m, [[ya, z0], [yb, z0], [yb, lo], [knee, hi], [ya, hi]]);
}

/** A removable divider, modelled in its slot. Prints lying on its face. */
export function buildDivider(m: M, d: Derived, x: number): Manifold {
  const t = DIVIDER_T - d.clear;
  return slabYZ(m, dividerProfile(m, d, d.clear), x - t / 2, x + t / 2).translate([0, 0, 0.3]);
}
