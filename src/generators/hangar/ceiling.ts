import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import { RIM, type Derived } from './geometry';

type M = ManifoldToplevel;

/** Pegs that locate the ceiling on the wall tops, and the holes they go in. */
const PEG = 2;
const PEG_DEPTH = 3;
const PEG_FIT = 0.15;
/** Chord and web sizes of the trusses. */
const CHORD = 1.6;
const WEB = 1.2;
const EDGE_W = 3;
const INNER_W = 2;
/** The corner column, where there is no right wall to hold the ceiling up. */
const COLUMN = 6;
const SOCKET = 3;

function box(m: M, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Manifold {
  return m.Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);
}

function rect(m: M, a0: number, a1: number, b0: number, b1: number): CrossSection {
  return m.CrossSection.square([a1 - a0, b1 - b0]).translate([a0, b0]);
}

/**
 * The ceiling's grid: where the trusses across the bay run (in y), where the
 * beams along the top run (in x), and the top of it all.
 */
export function ceilingGrid(d: Derived) {
  const e = extent(d);
  return {
    across: spread(e.y0, e.y1, d.trussSpacing),
    beams: spread(e.x0, e.x1, d.trussSpacing),
    edges: { y0: e.y0 + EDGE_W, y1: e.y1 - EDGE_W },
    ztop: d.wallTop + d.trussDepth,
    beamW: 2,
    beamH: CHORD,
  };
}

/** The ceiling's outline, over the outside faces of the walls. */
function extent(d: Derived) {
  return { x0: d.xl0, x1: d.W / 2 - RIM, y0: d.yFront, y1: d.yBack };
}

/** Where the ceiling's pegs go down into each wall's top. */
export function ceilingPegs(d: Derived): { back: [number, number][]; left: [number, number][]; right: [number, number][] } {
  const e = extent(d);
  const len = d.ySideEnd - d.yFront;
  const side = (x: number): [number, number][] => [0.25, 0.75].map((k) => [x, d.yFront + k * len]);
  return {
    back: [-0.25, 0.25].map((k) => [k * d.W, d.yBack - d.t / 2]),
    left: side(d.xl0 + d.t / 2),
    right: d.both ? side(e.x1 - d.t / 2) : [],
  };
}

/** The holes a wall needs for the ceiling's pegs, sunk into its top. */
export function pegHolesIn(m: M, d: Derived, at: readonly [number, number][]): Manifold[] {
  const h = PEG / 2 + PEG_FIT;
  return at.map(([x, y]) => box(m, x - h, x + h, y - h, y + h, d.wallTop - PEG_DEPTH - 0.5, d.wallTop + 1));
}

/** The front-right corner column, when only the left wall stands. */
export function columnAt(d: Derived): { cx: number; cy: number } | null {
  if (!d.ceiling || d.both) return null;
  const e = extent(d);
  return { cx: e.x1 - COLUMN / 2, cy: e.y0 + COLUMN / 2 };
}

/** The socket in the base the column stands in. */
export function columnSocket(m: M, d: Derived): Manifold | null {
  const c = columnAt(d);
  if (!c) return null;
  const h = COLUMN / 2 + d.c;
  return box(m, c.cx - h, c.cx + h, c.cy - h, c.cy + h, d.floorZ - SOCKET, d.floorZ + 1);
}

/**
 * A Warren truss: top and bottom chords, a post at each end and diagonals
 * between, as a profile along its length (s) and up (z) from z0.
 */
function trussProfile(m: M, len: number, z0: number, depth: number): CrossSection {
  const z1 = z0 + depth;
  const parts: CrossSection[] = [
    rect(m, 0, len, z0, z0 + CHORD),
    rect(m, 0, len, z1 - CHORD, z1),
    rect(m, 0, CHORD, z0, z1),
    rect(m, len - CHORD, len, z0, z1),
  ];
  const bays = Math.max(1, Math.round(len / depth));
  const pitch = len / bays;
  for (let i = 0; i < bays; i++) {
    const a = i * pitch;
    const [lo, hi] = i % 2 === 0 ? [a, a + pitch] : [a + pitch, a];
    parts.push(m.CrossSection.hull([
      m.CrossSection.circle(WEB / 2, 12).translate([lo, z0 + CHORD / 2]),
      m.CrossSection.circle(WEB / 2, 12).translate([hi, z1 - CHORD / 2]),
    ]));
  }
  return m.CrossSection.union(parts);
}

/** A truss running along x from x0 to x1, its width across from y0 to y1. */
function trussAlongX(m: M, x0: number, x1: number, y0: number, y1: number, z0: number, depth: number): Manifold {
  return m.Manifold.extrude(trussProfile(m, x1 - x0, z0, depth), y1 - y0)
    .rotate([90, 0, 0]).translate([x0, y1, 0]);
}

/** A truss running along y from y0 to y1, its width across from x0 to x1. */
function trussAlongY(m: M, y0: number, y1: number, x0: number, x1: number, z0: number, depth: number): Manifold {
  return m.Manifold.extrude(trussProfile(m, y1 - y0, z0, depth), x1 - x0)
    .rotate([90, 0, 90]).translate([x0, y0, 0]);
}

/** Positions evenly spread between a and b, about `pitch` apart, ends excluded. */
function spread(a: number, b: number, pitch: number): number[] {
  const n = Math.max(1, Math.round((b - a) / pitch));
  return Array.from({ length: n - 1 }, (_, k) => a + ((k + 1) * (b - a)) / n);
}

/**
 * The ceiling: an open steel frame that sits on the wall tops. Trusses round
 * all four edges and across the bay from side to side; beams along the top
 * from front to back, tying the trusses together; work lamps hanging under
 * the trusses between the beams; pegs into the walls to locate it.
 *
 * It prints upside down. The top beams and the trusses' top chords lie flat
 * on the bed as one grid, the diagonals climb at 45 degrees or steeper, the
 * bottom chords bridge between the diagonals' ends, and the lamps and pegs
 * stand up off them.
 */
export function buildCeiling(m: M, d: Derived): Manifold {
  const e = extent(d);
  const z0 = d.wallTop;
  const depth = d.trussDepth;
  const ztop = z0 + depth;
  const parts: Manifold[] = [
    trussAlongX(m, e.x0, e.x1, e.y0, e.y0 + EDGE_W, z0, depth),
    trussAlongX(m, e.x0, e.x1, e.y1 - EDGE_W, e.y1, z0, depth),
    trussAlongY(m, e.y0, e.y1, e.x0, e.x0 + EDGE_W, z0, depth),
    trussAlongY(m, e.y0, e.y1, e.x1 - EDGE_W, e.x1, z0, depth),
  ];
  const across = spread(e.y0, e.y1, d.trussSpacing);
  for (const y of across) parts.push(trussAlongX(m, e.x0, e.x1, y - INNER_W / 2, y + INNER_W / 2, z0, depth));
  const beams = spread(e.x0, e.x1, d.trussSpacing);
  for (const x of beams) parts.push(box(m, x - 1, x + 1, e.y0, e.y1, ztop - CHORD, ztop));

  // Work lamps under the trusses across the bay, between the beams.
  if (d.ceilingLights) {
    const xs = [e.x0, ...beams, e.x1];
    for (const y of across) {
      for (let i = 0; i < xs.length - 1; i++) {
        const x = (xs[i]! + xs[i + 1]!) / 2;
        parts.push(box(m, x - 0.8, x + 0.8, y - 0.8, y + 0.8, z0 - 2, z0 + 0.2));
        parts.push(box(m, x - 2.5, x + 2.5, y - 1.6, y + 1.6, z0 - 3.2, z0 - 1.9));
      }
    }
  }

  // Pegs down into the wall tops.
  const pegs = ceilingPegs(d);
  const p = PEG / 2;
  for (const [x, y] of [...pegs.back, ...pegs.left, ...pegs.right]) {
    parts.push(box(m, x - p, x + p, y - p, y + p, z0 - PEG_DEPTH, z0 + 0.2));
  }

  let solid = m.Manifold.union(parts);
  const col = columnAt(d);
  if (col) {
    // A block over the column with a socket for its top.
    const h = COLUMN / 2 + d.c;
    solid = m.Manifold.union([solid, box(m, col.cx - h - 1.2, e.x1 + 1, e.y0 - 1, col.cy + h + 1.2, z0, z0 + 4)])
      .subtract(box(m, col.cx - h, col.cx + h, col.cy - h, col.cy + h, z0 - 1, z0 + SOCKET));
  }
  return solid;
}

/**
 * The corner column: an H section standing in a socket in the base, its top
 * in a socket in the ceiling. Prints lying down with its flanges standing,
 * the web bridging between them.
 */
export function buildColumn(m: M, d: Derived): Manifold | null {
  const c = columnAt(d);
  if (!c) return null;
  const h = COLUMN / 2;
  const fl = 1.2;
  const z0 = d.floorZ - SOCKET + 0.3;
  const z1 = d.wallTop + SOCKET - 0.3;
  return m.Manifold.union([
    box(m, c.cx - h, c.cx - h + fl, c.cy - h, c.cy + h, z0, z1),
    box(m, c.cx + h - fl, c.cx + h, c.cy - h, c.cy + h, z0, z1),
    box(m, c.cx - h + fl - 0.1, c.cx + h - fl + 0.1, c.cy - 0.6, c.cy + 0.6, z0, z1),
  ]);
}
