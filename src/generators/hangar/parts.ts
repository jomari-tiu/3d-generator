import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import { dropSlivers, roundedRect, segmentsForRadius } from '../../core/kernel/primitives';
import { ceilingPegs, columnSocket, pegHolesIn } from './ceiling';
import { framedBays } from './relief';
import { bar } from '../shared/solid';
import {
  BOSS_H, BRIDGE_T, BRIDGE_W, DECK_T, DOOR_LAP, DOOR_T, FOOT_T, HAZARD_H, INLAY,
  PEG, PEG_FIT, PIN_HEAD, PIPE_R, POST, RAIL_T, RIB_H, RIB_W, ROOM_DOOR_H, ROOM_DOOR_W, ROOM_DOOR_ZONE, SEAM_AMP,
  BOOM_H, BOOM_HALF, BOOM_V, CAB_D, CAB_H, CAB_U0, CAB_V, CAB_W, DECK_H, HINGE_U, HINGE_Z, HOUSE_L, HOUSE_U, HOUSE_W,
  LUG_GAP, LUG_T, SEAM_PITCH, TOP_T, TRACK_RAIL, trackTop,
  type Derived,
} from './geometry';

type M = ManifoldToplevel;
type P2 = readonly [number, number];
type P3 = readonly [number, number, number];

/** Axis-aligned box from corner to corner. */
function box(m: M, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Manifold {
  return m.Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);
}

/** A square member from one point to another: the hull of a cube at each end. */
function member(m: M, a: P3, b: P3, s: number): Manifold {
  const cube = (q: P3) => m.Manifold.cube([s, s, s], true).translate([q[0], q[1], q[2]]);
  return m.Manifold.hull([cube(a), cube(b)]);
}

function polygon(m: M, pts: readonly P2[]) {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[(i + 1) % pts.length]!;
    area += x0 * y1 - x1 * y0;
  }
  const ring = pts.map(([x, y]) => [x, y] as [number, number]);
  return new m.CrossSection([area < 0 ? ring.reverse() : ring]);
}

/** A profile drawn in (y, z), run along X from x0 to x1. */
function prismYZ(m: M, pts: readonly P2[], x0: number, x1: number): Manifold {
  return m.Manifold.extrude(polygon(m, pts), x1 - x0).rotate([90, 0, 90]).translate([x0, 0, 0]);
}

/** A section drawn in (x, z), stood up as a slab from y0 to y1. */
function slabXZ(m: M, section: CrossSection, y0: number, y1: number): Manifold {
  return m.Manifold.extrude(section, y1 - y0).rotate([90, 0, 0]).translate([0, y1, 0]);
}

/** A profile drawn in (x, z), run along Y from y0 to y1. */
function prismXZ(m: M, pts: readonly P2[], y0: number, y1: number): Manifold {
  return slabXZ(m, polygon(m, pts), y0, y1);
}

function rect(m: M, x0: number, x1: number, y0: number, y1: number): CrossSection {
  return m.CrossSection.square([x1 - x0, y1 - y0]).translate([x0, y0]);
}

/**
 * Hazard stripes filling `region` between v0 and v1, in whatever plane the
 * caller draws it: 45 degree bars, held together by a thin line along each
 * edge so the whole band is one piece to print or to paint round.
 */
function stripeBand(m: M, region: CrossSection, v0: number, v1: number, slant: 1 | -1): CrossSection {
  const b = region.bounds();
  const h = v1 - v0;
  const w = 3;
  const pitch = 7;
  const bars: CrossSection[] = [];
  for (let x = b.min[0] - h - pitch; x < b.max[0] + h; x += pitch) {
    bars.push(
      polygon(m, slant > 0
        ? [[x, v0], [x + w, v0], [x + w + h, v1], [x + h, v1]]
        : [[x + h, v0], [x + h + w, v0], [x + w, v1], [x, v1]]),
    );
  }
  const x0 = b.min[0] - 1;
  const x1 = b.max[0] + 1;
  const lines = [rect(m, x0, x1, v0, v0 + 0.8), rect(m, x0, x1, v1 - 0.8, v1)];
  return m.CrossSection.union([...bars, ...lines]).intersect(region.intersect(rect(m, x0, x1, v0, v1)));
}

function cylinder(m: M, r: number, x: number, y: number, z0: number, z1: number): Manifold {
  return m.Manifold.cylinder(z1 - z0, r, r, segmentsForRadius(r)).translate([x, y, z0]);
}

// ---------------------------------------------------------------------- base

export function buildBase(m: M, d: Derived, extraCuts: readonly Manifold[] = []): Manifold {
  const body = m.Manifold.extrude(roundedRect(m, d.W, d.D, 3), d.baseH);
  const cuts: Manifold[] = [...extraCuts];
  const f = d.fit;
  const zs = d.floorZ - d.slotD;
  const top = d.floorZ + 1;

  // Wall slots.
  cuts.push(box(m, d.xl0 - f, -d.xl0 + f, d.yb0 - f, d.yBack + f, zs, top));
  cuts.push(box(m, d.xl0 - f, d.xl1 + f, d.yFront - f, d.ySideEnd + f, zs, top));
  if (d.both) cuts.push(box(m, d.bayRight - f, -d.xl0 + f, d.yFront - f, d.ySideEnd + f, zs, top));

  if (d.floorPanels) {
    const g = 0.8;
    const depth = 0.5;
    const x0 = d.xl1 + 1;
    const x1 = d.bayRight - 1;
    const y0 = d.yFront + 1;
    const y1 = d.yb0 - 1;
    for (let x = x0 + d.panelSize; x < x1 - 2; x += d.panelSize) {
      cuts.push(box(m, x - g / 2, x + g / 2, y0, y1, d.floorZ - depth, top));
    }
    for (let y = y1 - d.panelSize; y > y0 + 2; y -= d.panelSize) {
      cuts.push(box(m, x0, x1, y - g / 2, y + g / 2, d.floorZ - depth, top));
    }
  }
  const socket = columnSocket(m, d);
  if (socket) cuts.push(socket);
  // Pockets for the floor markings, which print as inlays and sit flush.
  for (const mark of Object.values(floorMarks(m, d))) {
    cuts.push(m.Manifold.extrude(mark, INLAY + 1).translate([0, 0, d.floorZ - INLAY]));
  }
  const base = body.subtract(m.Manifold.union(cuts));
  if (!d.tower) return base;
  // The tower's rail, added after the plate grooves so none of them notch it.
  return m.Manifold.union([
    base,
    box(m, d.grooveX0, d.grooveX1, d.railY - RIB_W / 2, d.railY + RIB_W / 2, d.floorZ - 0.2, d.floorZ + RIB_H),
  ]);
}

/**
 * Floor markings, drawn in the floor's own plane: a hazard band in front of
 * the door, and a square pad where the kit stands, in the clear floor between
 * the tower's rail and that band. Either is left out when there is no room.
 */
export function floorMarks(m: M, d: Derived): { band?: CrossSection; pad?: CrossSection } {
  if (!d.hazard) return {};
  const out: { band?: CrossSection; pad?: CrossSection } = {};
  const bandY1 = d.yb0 - d.trackDepth - 1.5;
  const bandY0 = bandY1 - HAZARD_H;
  if (d.door) {
    out.band = stripeBand(m, rect(m, -d.doorW / 2, d.doorW / 2, bandY0, bandY1), bandY0, bandY1, 1);
  }
  const y0 = d.tower ? d.railY + d.footW / 2 + 4 : d.yFront + 6;
  const y1 = (d.door ? bandY0 : d.yb0) - 4;
  const size = Math.min(0.42 * (d.bayRight - d.xl1), y1 - y0);
  if (size >= 24) {
    const cx = (d.xl1 + d.bayRight) / 2;
    const cy = (y0 + y1) / 2;
    const outer = rect(m, cx - size / 2, cx + size / 2, cy - size / 2, cy + size / 2);
    const inner = rect(m, cx - size / 2 + 2, cx + size / 2 - 2, cy - size / 2 + 2, cy + size / 2 - 2);
    // Centre lines across it, joined to the border so the pad is one piece.
    const r = size / 2 - 1;
    out.pad = m.CrossSection.union([
      outer.subtract(inner),
      rect(m, cx - r, cx + r, cy - 0.5, cy + 0.5),
      rect(m, cx - 0.5, cx + 0.5, cy - r, cy + r),
    ]);
  }
  return out;
}

export function buildFloorMark(m: M, d: Derived, mark: CrossSection): Manifold {
  return m.Manifold.extrude(mark, INLAY).translate([0, 0, d.floorZ - INLAY]);
}

// ------------------------------------------------------------------ walls

/** A wall with the holes the ceiling's pegs go down into, when there is a ceiling. */
function withPegHoles(m: M, d: Derived, wall: Manifold, wallName: 'back' | 'left' | 'right'): Manifold {
  if (!d.ceiling) return wall;
  const holes = pegHolesIn(m, d, ceilingPegs(d)[wallName]);
  return holes.length > 0 ? wall.subtract(m.Manifold.union(holes)) : wall;
}

export function buildBackWall(m: M, d: Derived): Manifold {
  return withPegHoles(m, d, backWallBody(m, d), 'back');
}

export function buildLeftWall(m: M, d: Derived): Manifold {
  return withPegHoles(m, d, leftWallBody(m, d), 'left');
}

export function buildRightWall(m: M, d: Derived): Manifold {
  return withPegHoles(m, d, rightWallBody(m, d), 'right');
}

// ------------------------------------------------------------------ back wall

/**
 * The track the door leaves hang in, as one rail's profile in (u, z): u is the
 * distance out from the wall face, z runs up the wall. The rail's underside
 * follows the leaf's 45 degree bevelled edge, a gap away, so leaf and track
 * are a dovetail -- the leaf cannot fall forward out of it -- and both print
 * face up with nothing steeper than 45 degrees.
 */
function topRailProfile(d: Derived): P2[] {
  const z = d.leafZ1 + d.trackGap;
  const inner = DOOR_T + 2 * d.c;
  return [
    [0, z + d.c],
    [inner, z - DOOR_T - d.c],
    [d.trackDepth, z - DOOR_T - d.c],
    [d.trackDepth, z + d.c + TRACK_RAIL],
    [0, z + d.c + TRACK_RAIL],
  ];
}

/** How far the beam over the doorway stands off the wall, and its half width. */
const HEADER_U = 3.5;
const headerHalf = (d: Derived) => Math.min(d.doorW / 2 + 12, -d.xl0 - 4);

function headerProfile(m: M, d: Derived): CrossSection {
  const hw = headerHalf(d);
  const z0 = d.headerZ0;
  return polygon(m, [[-hw + 3, z0], [hw - 3, z0], [hw, z0 + 3], [hw, d.headerZ1], [-hw, d.headerZ1], [-hw, z0 + 3]]);
}

function backWallBody(m: M, d: Derived): Manifold {
  const x0 = -d.W / 2 + 3;
  const wall = box(m, x0, -x0, d.yb0, d.yBack, d.floorZ - d.slotD, d.wallTop);
  const cuts: Manifold[] = [];

  // Panel seams on the face. The track and the header lap over them deeper
  // than they are cut, so no seam leaves a tunnel behind either.
  if (d.wallPanels) {
    const g = 0.8;
    const y0 = d.yb0 - 1;
    const y1 = d.yb0 + 0.5;
    for (let z = d.floorZ + 32; z < d.wallTop - 6; z += 32) cuts.push(box(m, x0 - 1, -x0 + 1, y0, y1, z - g / 2, z + g / 2));
    for (let x = 20; x < -x0 - 6; x += 40) {
      for (const s of [-1, 1]) cuts.push(box(m, s * x - g / 2, s * x + g / 2, y0, y1, d.floorZ, d.wallTop + 1));
    }
  }
  if (d.door) {
    // The doorway with its top corners cut off at 45 degrees.
    const w = d.doorW / 2;
    const k = d.doorChamfer;
    const z0 = d.openZ0;
    const z1 = d.openZ1;
    cuts.push(prismXZ(m, [[-w, z0], [w, z0], [w, z1 - k], [w - k, z1], [-w + k, z1], [-w, z1 - k]], d.yb0 - 1, d.yBack + 1));
  }
  let cut = cuts.length > 0 ? wall.subtract(m.Manifold.union(cuts)) : wall;

  // Framed bays: above the door's header, where the leaves never go; with no
  // door, the whole wall, beside whatever the left wall holds out over it.
  if (d.wallFrames) {
    const a1 = d.both ? d.bayRight - 0.5 : d.W / 2 - 3;
    const left = d.door ? 0 : Math.max(d.catwalk ? d.cd : 0, d.room ? d.rd + 1.6 : 0);
    const z0 = d.door ? (d.header ? d.headerZ1 : trackTop(d)) + 1.5 : d.floorZ + 1;
    const layers = framedBays(m, d.xl1 + 0.5 + left, a1, z0, d.wallTop - 1, d.frameBay);
    // Lapped into the wall past the depth of the panel seams.
    cut = m.Manifold.union([cut, ...layers.map(({ section, height }) => slabXZ(m, section, d.yb0 - height, d.yb0 + 0.6))]);
  }
  if (!d.door) return cut;

  const mid = (d.leafZ0 + d.leafZ1) / 2;
  const top = topRailProfile(d);
  const bottom = top.map(([u, z]) => [u, 2 * mid - z] as const);
  const toYZ = (pts: readonly P2[]) => pts.map(([u, z]) => [d.yb0 - u, z] as const);
  // Into the wall past the depth of a panel seam, so the rails weld to it. A
  // step added at each end, not the wall-side corners moved, which would tilt
  // the slope the leaves ride under.
  const lap = (pts: readonly P2[]): P2[] => [[d.yb0 + 0.7, pts[0]![1]], ...pts, [d.yb0 + 0.7, pts[pts.length - 1]![1]]];
  const parts = [
    cut,
    prismYZ(m, lap(toYZ(top)), d.trackX0, d.trackX1),
    prismYZ(m, lap(toYZ(bottom)), d.trackX0, d.trackX1),
  ];
  if (d.header) {
    parts.push(slabXZ(m, headerProfile(m, d), d.yb0 - HEADER_U, d.yb0 + 0.7));
    // Warning lamps at the ends of the beam, past its stripes.
    const hw = headerHalf(d);
    const zc = (d.headerZ0 + d.headerZ1) / 2 + 1;
    for (const s of [-1, 1]) {
      const xc = s * (hw - 4.5);
      parts.push(box(m, xc - 2.5, xc + 2.5, d.yb0 - HEADER_U - 1.2, d.yb0 - HEADER_U + 0.2, zc - 2.5, zc + 2.5));
      parts.push(box(m, xc - 1.6, xc + 1.6, d.yb0 - HEADER_U - 2.4, d.yb0 - HEADER_U - 1, zc - 1.6, zc + 1.6));
    }
  }
  return m.Manifold.union(parts);
}

/** Stripes on the face of the beam over the doorway, stopping short of its lamps. */
export function buildHeaderStripes(m: M, d: Derived): Manifold {
  const hw = headerHalf(d) - 9;
  const v0 = d.headerZ0 + 1.2;
  const v1 = d.headerZ1 - 1.2;
  const band = stripeBand(m, rect(m, -hw, hw, v0, v1), v0, v1, 1);
  const face = d.yb0 - HEADER_U;
  return dropSlivers(m, slabXZ(m, band, face - INLAY, face), 0.05);
}

/**
 * A leaf's outline in (x, z). Two leaves meet on a zigzag, the left one's
 * teeth in the right one's notches; they still part straight sideways, which
 * is all a slide asks of them.
 */
function leafOutline(m: M, d: Derived, i: number): CrossSection {
  const half = d.doorW / 2 + DOOR_LAP;
  const z0 = d.leafZ0;
  const z1 = d.leafZ1;
  if (d.leaves === 1) return rect(m, -half, half, z0, z1);
  const steps = Math.max(2, Math.round((z1 - z0) / (SEAM_PITCH / 2)));
  const seam: P2[] = [];
  for (let k = 0; k <= steps; k++) seam.push([(k % 2 === 0 ? -1 : 1) * SEAM_AMP / 2, z0 + (k * (z1 - z0)) / steps]);
  return i === 0
    ? polygon(m, [[-half, z0], ...seam.map(([x, z]) => [x - d.c, z] as const), [-half, z1]])
    : polygon(m, [[half, z0], [half, z1], ...[...seam].reverse().map(([x, z]) => [x + d.c, z] as const)]);
}

/** The face of a leaf that carries detail: inside its edge, clear of the track's lips. */
function leafFace(m: M, d: Derived, i: number): { face: CrossSection; z0: number; z1: number } {
  const z0 = d.leafZ0 + DOOR_T + 2;
  const z1 = d.leafZ1 - DOOR_T - 2;
  const half = d.doorW / 2 + DOOR_LAP + SEAM_AMP;
  return { face: leafOutline(m, d, i).offset(-1.5, 'Miter').intersect(rect(m, -half, half, z0, z1)), z0, z1 };
}

/** One armoured leaf, closed. */
export function buildLeaf(m: M, d: Derived, i: number): Manifold {
  const [x0, x1] = d.leafSpans[i]!;
  const u0 = d.c;
  const u1 = d.c + DOOR_T;
  const yFace = d.yb0 - u1;
  const profile: P2[] = [
    [d.yb0 - u0, d.leafZ0],
    [d.yb0 - u0, d.leafZ1],
    [yFace, d.leafZ1 - DOOR_T],
    [yFace, d.leafZ0 + DOOR_T],
  ];
  const body = prismYZ(m, profile, x0 - 1, x1 + 1).intersect(slabXZ(m, leafOutline(m, d, i), yFace - 1, d.yb0 + 1));

  // Armour plates in two layers, each with its corners cut at 45 degrees:
  // a row of big plates, and a smaller plate raised on each. The bottom of
  // the face is left for the hazard stripes.
  const { face, z0, z1 } = leafFace(m, d, i);
  const pz0 = z0 + (d.hazard ? HAZARD_H + 1.5 : 0);
  const rows = Math.max(1, Math.round((z1 - pz0) / 45));
  const gap = 1.5;
  const rowH = (z1 - pz0 - (rows - 1) * gap) / rows;
  const bounds = face.bounds();
  const sections: CrossSection[] = [];
  for (let r = 0; r < rows; r++) {
    const a = pz0 + r * (rowH + gap);
    sections.push(face.intersect(rect(m, bounds.min[0] - 1, bounds.max[0] + 1, a, a + rowH)));
  }
  const chamfer = 2;
  const plates = m.CrossSection.union(sections).offset(-(1.5 + chamfer), 'Miter').offset(chamfer, 'Square');
  const inner = plates.offset(-3.5, 'Miter');
  return m.Manifold.union([
    body,
    slabXZ(m, plates, yFace - 0.7, yFace + 0.2),
    slabXZ(m, inner, yFace - 1.3, yFace - 0.5),
  ]);
}

/** The hazard band along the foot of a leaf; on two leaves the stripes meet in a chevron. */
export function buildLeafStripes(m: M, d: Derived, i: number): Manifold {
  const { face, z0 } = leafFace(m, d, i);
  const b = face.bounds();
  const band = face.intersect(rect(m, b.min[0] - 1, b.max[0] + 1, z0, z0 + HAZARD_H));
  const yFace = d.yb0 - d.c - DOOR_T;
  const stripes = stripeBand(m, band, z0, z0 + HAZARD_H, i === 0 ? 1 : -1);
  return dropSlivers(m, slabXZ(m, stripes, yFace - INLAY, yFace), 0.05);
}

// ------------------------------------------------------------------ side walls

/** Back end of a side wall's relief: clear of the door track, where an open leaf slides past. */
function sideReliefEnd(d: Derived): number {
  return d.door ? d.yb0 - d.trackDepth - 0.5 : d.ySideEnd - 1;
}

/** Whatever the wall style stands on a side wall's inner face. */
function ribs(m: M, d: Derived, faceX: number, dir: 1 | -1): Manifold[] {
  if (d.wallFrames) {
    const layers = framedBays(m, d.yFront + 1, sideReliefEnd(d), d.floorZ + 1, d.wallTop - 1, d.frameBay);
    return layers.map(({ section, height }) =>
      dir > 0 ? slabYZ(m, section, faceX - 0.2, faceX + height) : slabYZ(m, section, faceX - height, faceX + 0.2),
    );
  }
  if (!d.wallRibs) return [];
  const out: Manifold[] = [];
  const len = d.ySideEnd - d.yFront;
  const n = Math.max(1, Math.floor((len - 6) / d.ribSpacing));
  const start = d.yFront + (len - n * d.ribSpacing) / 2;
  for (let k = 0; k <= n; k++) {
    const y = start + k * d.ribSpacing;
    if (y + 1 > sideReliefEnd(d)) continue;
    const xa = faceX - dir * 0.2;
    const xb = faceX + dir * 1.5;
    out.push(box(m, Math.min(xa, xb), Math.max(xa, xb), y - 1, y + 1, d.floorZ, d.wallTop));
  }
  return out;
}

/** Bottom and top of the control room's windows. */
function windowBand(d: Derived): [number, number] {
  return [d.rz0 + d.rh * 0.3, d.rz0 + d.rh * 0.78];
}

/** Ends of the run of window glass along the room's front. */
function glassSpan(d: Derived): [number, number] {
  return [d.ry0 + 4, d.ry1 - 4];
}

/** A section drawn in (y, z), stood off the wall from x0 to x1. */
function slabYZ(m: M, section: CrossSection, x0: number, x1: number): Manifold {
  return m.Manifold.extrude(section, x1 - x0).rotate([90, 0, 90]).translate([x0, 0, 0]);
}

/**
 * The control room's doorway, as relief on the wall: an octagonal opening in
 * a raised frame, two leaves split on a Z, a hood with a lamp over it, a
 * number plate and a vent grille above the side panels, and a grated floor in
 * front. Halfway along the room, clear of the bridge's pivot at the front and
 * the ladder hatch at the back.
 *
 * `clear` is cut from the wall first -- the opening's recess, and the ribs
 * out of the way -- and `relief` is added after. Everything stands off the
 * wall face, which is up as the wall prints, so none of it overhangs.
 */
function roomDoorway(m: M, d: Derived): { clear: Manifold; relief: Manifold } {
  const x = d.xl1;
  const yc = (d.ry0 + d.ry1) / 2;
  const L = d.roomLevel;
  const H = ROOM_DOOR_H;
  const hw = ROOM_DOOR_W / 2;
  const k = 4;
  const octagon = polygon(m, [
    [yc - hw + k, L], [yc + hw - k, L], [yc + hw, L + k], [yc + hw, L + H - k],
    [yc + hw - k, L + H], [yc - hw + k, L + H], [yc - hw, L + H - k], [yc - hw, L + k],
  ]);
  const recess = -1.2;

  const clear: Manifold[] = [
    box(m, x, x + 3, yc - 19.5, yc + 19.5, L, L + ROOM_DOOR_ZONE - 0.5),
    slabYZ(m, octagon, x + recess, x + 1),
  ];
  if (d.catwalk) {
    // Grating on the walkway in front of the door.
    for (let y = yc - 11; y <= yc + 11; y += 1.3) {
      clear.push(box(m, x + 1, x + d.cd - 5, y - 0.25, y + 0.25, d.cz - 0.4, d.cz + 1));
    }
  }

  const add: Manifold[] = [];
  const pockets: Manifold[] = [];
  // The frame round the opening.
  add.push(slabYZ(m, octagon.offset(1.4, 'Miter').subtract(octagon), x - 0.2, x + 1));

  // Two leaves meeting on a Z, each a raised rim round a sunken panel.
  const s = 1.5;
  const za = L + H * 0.62;
  const zb = L + H * 0.38;
  const left = polygon(m, [
    [yc - 50, L - 1], [yc - s, L - 1], [yc - s, zb], [yc + s, za], [yc + s, L + H + 1], [yc - 50, L + H + 1],
  ]);
  const opening = octagon.offset(-0.4, 'Miter');
  const leaves = [
    opening.intersect(left.offset(-0.25, 'Miter')),
    opening.subtract(left.offset(0.25, 'Miter')),
  ];
  for (const leaf of leaves) {
    add.push(slabYZ(m, leaf, x + recess - 0.1, x - 0.2));
    pockets.push(slabYZ(m, leaf.offset(-1, 'Miter'), x - 0.6, x));
  }
  // A vent box on the left leaf, with slots across it.
  const vy = yc - hw * 0.45;
  const vz = L + H * 0.5;
  add.push(box(m, x - 0.7, x + 0.1, vy - 1.8, vy + 1.8, vz - 1.5, vz + 1.5));
  for (const dz of [-0.8, 0, 0.8]) pockets.push(box(m, x - 0.2, x + 0.2, vy - 1.3, vy + 1.3, vz + dz - 0.2, vz + dz + 0.2));

  // The hood over the door, on two cheeks, with a lamp hanging under it.
  const ht = L + H + 2.5;
  add.push(box(m, x - 0.2, x + 3.5, yc - hw - 2, yc + hw + 2, ht, ht + 1.1));
  for (const y of [yc - hw - 2, yc + hw + 1]) add.push(box(m, x - 0.2, x + 3.5, y, y + 1, ht - 1.6, ht + 0.1));
  add.push(m.Manifold.cylinder(2.2, 1.2, 1.2, 24).rotate([0, 90, 0]).translate([x - 0.2, yc, ht - 1]));

  // Left: a number plate with a cut corner, a badge, and a conduit with bands round it.
  const ly = yc - hw - 2.5;
  add.push(slabYZ(m, polygon(m, [
    [ly - 5.5, L + H - 0.5], [ly - 2, L + H - 0.5], [ly, L + H + 1.5], [ly, L + H + 5], [ly - 5.5, L + H + 5],
  ]), x - 0.2, x + 0.6));
  add.push(box(m, x - 0.2, x + 0.9, ly - 4.5, ly - 2, L + H - 3, L + H - 1.6));
  add.push(box(m, x - 0.2, x + 0.8, ly - 4.5, ly - 1.5, L + 1, L + H - 4));
  add.push(box(m, x - 0.2, x + 1.6, ly - 3.6, ly - 2.4, L + 2, L + H - 5));
  for (const z of [L + 3, L + 6, L + 9]) add.push(box(m, x - 0.2, x + 1.9, ly - 4, ly - 2, z, z + 0.8));

  // Right: a vent grille up top, a control panel with two slots and a status
  // light, and a junction box at the foot.
  const ry = yc + hw + 2.5;
  add.push(box(m, x - 0.2, x + 0.8, ry, ry + 4.5, L + H, L + H + 5));
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      const gy = ry + 0.9 + i * 1.3;
      const gz = L + H + 0.8 + j * 1.1;
      pockets.push(box(m, x + 0.3, x + 1, gy, gy + 0.6, gz, gz + 0.6));
    }
  }
  add.push(box(m, x - 0.2, x + 0.7, ry, ry + 4.5, L + 3, L + H - 2));
  for (const y of [ry + 1, ry + 2.5]) pockets.push(box(m, x + 0.3, x + 1, y, y + 1, L + 4.5, L + H - 3.5));
  add.push(box(m, x - 0.2, x + 1.2, ry + 1, ry + 3.5, L + H - 1.4, L + H - 0.6));
  add.push(box(m, x - 0.2, x + 1.2, ry, ry + 4.5, L + 0.4, L + 2.2));

  return {
    clear: m.Manifold.union(clear),
    relief: m.Manifold.union(add).subtract(m.Manifold.union(pockets)),
  };
}

function leftWallBody(m: M, d: Derived): Manifold {
  const parts = [box(m, d.xl0, d.xl1, d.yFront, d.ySideEnd, d.floorZ - d.slotD, d.wallTop), ...ribs(m, d, d.xl1, 1)];
  const holes: Manifold[] = [];
  const lap = 0.2;
  const xa = d.xl1 - lap;
  const deckZ0 = d.cz - DECK_T;

  if (d.catwalk) {
    const edge = d.xl1 + d.cd;
    parts.push(box(m, xa, edge, d.deckY0, d.deckY1, deckZ0, d.cz));

    // Gussets under the deck. As the wall prints, inner face up, each is a
    // triangle standing on the wall with its slope at 45 degrees.
    const g = d.cd * 0.75;
    const span = d.deckY1 - d.deckY0 - 2;
    const n = Math.max(2, Math.round(span / 40) + 1);
    for (let k = 0; k < n; k++) {
      const y = d.deckY0 + 1 + (k * (span - 2)) / (n - 1);
      parts.push(prismXZ(m, [[xa, deckZ0 + lap], [d.xl1 + g, deckZ0 + lap], [xa, deckZ0 - g]], y, y + 2));
    }

    if (d.ladder) {
      const y0 = d.ladderY0;
      const y1 = y0 + d.ladderW;
      for (const y of [y0, y1 - 1.2]) parts.push(box(m, xa, d.xl1 + 4, y, y + 1.2, d.floorZ, d.cz));
      // Rungs 30 cm apart at the crew's scale, up to the deck.
      for (let z = d.floorZ + d.rungPitch; z < d.cz - 0.5; z += d.rungPitch) {
        parts.push(box(m, d.xl1 + 2.6, d.xl1 + 3.6, y0 + 0.6, y1 - 0.6, z - 1, z));
      }
      holes.push(box(m, d.xl1, d.xl1 + 6, y0, y1, deckZ0 - 1, d.cz + 1));
    }
    // Grating across the deck: slots 30 cm apart at the crew's scale, or as
    // fine as prints.
    const pitch = Math.max(1.2, 0.08 * d.crewK);
    for (let y = d.deckY0 + 1.5; y < d.deckY1 - 1; y += pitch) {
      holes.push(box(m, d.xl1 + 1, edge - 1, y - 0.25, y + 0.25, d.cz - 0.35, d.cz + 1));
    }
    if (d.legs) {
      const h = LEG_PEG / 2 + d.fit;
      for (const [x, y] of legPegs(d)) holes.push(box(m, x - h, x + h, y - h, y + h, deckZ0 - 0.1, deckZ0 + LEG_PEG_L + 0.3));
    }
    if (d.railing) holes.push(...pegHoles(m, railX(d), railPosts(d), d.cz));
    if (d.bridge) holes.push(cylinder(m, d.pinHole / 2, d.pivot[0], d.pivot[1], deckZ0 - 1, d.cz + 1));
  }

  if (d.room) {
    const xr = d.xl1 + d.rd;
    // The room's box, with a 45 degree wedge under it back to the wall: as
    // the wall prints, that underside is a slope, not an overhang.
    parts.push(prismXZ(m, [[xa, d.rz0 - d.rd], [xr, d.rz0], [xr, d.rz1], [xa, d.rz1]], d.ry0, d.ry1));
    const [wz0, wz1] = windowBand(d);
    // A sill under the windows and a visor over them.
    parts.push(box(m, xr - lap, xr + 1, d.ry0, d.ry1, wz0 - 2.4, wz0 - 1.2));
    parts.push(box(m, xr - lap, xr + 1.6, d.ry0, d.ry1, wz1 + 1.2, wz1 + 2.8));
    // Ribs down the front either side of the windows.
    for (const y of [d.ry0 + 1, d.ry1 - 2]) parts.push(box(m, xr - lap, xr + 0.8, y, y + 1, d.rz0, d.rz1));

    // The windows are one long pocket holding one strip of glass, with the
    // mullions bridging over the glass flush with the face.
    const [gy0, gy1] = glassSpan(d);
    holes.push(box(m, xr - 1.6, xr + 3, gy0, gy1, wz0, wz1));
    if (d.roofRailing) holes.push(...pegHoles(m, roofRailX(d), roofPosts(d), d.rz1));

  }

  const door = d.room ? roomDoorway(m, d) : null;
  if (door) holes.push(door.clear);
  let solid = m.Manifold.union(parts);
  if (holes.length > 0) solid = solid.subtract(m.Manifold.union(holes));
  if (door) solid = m.Manifold.union([solid, door.relief]);
  if (d.room) {
    const xr = d.xl1 + d.rd;
    const [wz0, wz1] = windowBand(d);
    const [gy0, gy1] = glassSpan(d);
    const n = d.roomWindows;
    const mullions: Manifold[] = [];
    for (let k = 1; k < n; k++) {
      const y = gy0 + (k * (gy1 - gy0)) / n;
      mullions.push(box(m, xr - 0.6, xr, y - 0.75, y + 0.75, wz0 - 0.1, wz1 + 0.1));
    }
    if (mullions.length > 0) solid = m.Manifold.union([solid, ...mullions]);
  }
  const pipes = buildPipes(m, d);
  return pipes ? solid.subtract(pipes) : solid;
}

/** The strip of glass in the control room's window pocket. */
export function buildGlass(m: M, d: Derived): Manifold {
  const xr = d.xl1 + d.rd;
  const [wz0, wz1] = windowBand(d);
  const [gy0, gy1] = glassSpan(d);
  return box(m, xr - 1.6, xr - 0.6, gy0, gy1, wz0, wz1);
}

/**
 * Two half-round pipes along the left wall, flat side on it, joined at each
 * end by a riser so they print as one piece. Below the catwalk's gussets and
 * short of the ladder; left out when the catwalk is too low to fit them.
 */
export function buildPipes(m: M, d: Derived): Manifold | null {
  if (!d.pipes) return null;
  const zA = d.catwalk ? d.cz - DECK_T - d.cd * 0.75 - 4 : d.floorZ + d.wallH * 0.3;
  const zB = zA - 5;
  if (zB - PIPE_R < d.floorZ + 3) return null;
  const y0 = d.yFront + 4;
  const y1 = d.ladder ? d.ladderY0 - 2 : (d.door ? d.yb0 - d.trackDepth - 2 : d.ySideEnd - 3);
  if (y1 - y0 < 20) return null;
  const seg = segmentsForRadius(PIPE_R);
  const runs: Manifold[] = [];
  for (const z of [zA, zB]) {
    runs.push(m.Manifold.cylinder(y1 - y0, PIPE_R, PIPE_R, seg).rotate([-90, 0, 0]).translate([d.xl1, y0, z]));
  }
  for (const y of [y0, y1]) runs.push(cylinder(m, PIPE_R, d.xl1, y, zB, zA));
  const r = PIPE_R + 0.5;
  return m.Manifold.union(runs).intersect(box(m, d.xl1, d.xl1 + r, y0 - r, y1 + r, zB - r, zA + r));
}

function rightWallBody(m: M, d: Derived): Manifold {
  return m.Manifold.union([
    box(m, d.bayRight, -d.xl0, d.yFront, d.ySideEnd, d.floorZ - d.slotD, d.wallTop),
    ...ribs(m, d, d.bayRight, -1),
  ]);
}

// -------------------------------------------------------------------- catwalk

function railX(d: Derived): number {
  return d.xl1 + d.cd - RAIL_T - 0.8;
}

function railSpan(d: Derived): [number, number] {
  const y0 = d.bridge ? d.pivot[1] + d.pivotR + 1.5 : d.deckY0 + 1;
  return [y0, d.deckY1 - 1];
}

/** Post centres along a railing from y0 to y1, never more than 35 mm apart. */
/** The catwalk legs' pegs, up into the deck and down into the floor. */
const LEG_PEG = 1.6;
const LEG_PEG_L = 2;
const LEG_T = 1.6;

/** Where the leg frame's pegs go, top and bottom: at its end posts. */
export function legPegs(d: Derived): [number, number][] {
  const x = d.legX0 + LEG_T / 2;
  return [[x, d.legY0 + 1], [x, d.legY1 - 1]];
}

function legPosts(d: Derived): number[] {
  return postsAlong(d.legY0, d.legY1, Math.max(20, 3.5 * d.crewK));
}

/**
 * The catwalk's legs: posts from the floor up to the deck's underside along
 * its outer edge, a beam under the deck, a sill on the floor, a rail at half
 * height, and an X in every bay above and below it. One flat frame, pegged
 * into the deck and the floor at its end posts. Prints flat.
 */
export function buildCatwalkLegs(m: M, d: Derived): Manifold {
  const z0 = d.floorZ;
  const z1 = d.cz - DECK_T;
  const zm = (z0 + z1) / 2;
  const posts = legPosts(d);
  const y0 = d.legY0;
  const y1 = d.legY1;
  const bars: CrossSection[] = [
    rect(m, y0, y1, z1 - 2, z1),
    rect(m, y0, y1, z0, z0 + 1.4),
    rect(m, y0, y1, zm - 0.6, zm + 0.6),
    ...posts.map((y) => rect(m, y - 1, y + 1, z0, z1)),
  ];
  for (let i = 0; i + 1 < posts.length; i++) {
    const a = posts[i]!;
    const b = posts[i + 1]!;
    for (const [lo, hi] of [[z0 + 1.4, zm - 0.6], [zm + 0.6, z1 - 2]] as const) {
      bars.push(bar(m, [a, lo], [b, hi], 1.2), bar(m, [a, hi], [b, lo], 1.2));
    }
  }
  const frame = slabYZ(m, m.CrossSection.union(bars).intersect(rect(m, y0, y1, z0, z1)), d.legX0, d.legX0 + LEG_T);
  const h = LEG_PEG / 2;
  const pegs = legPegs(d).flatMap(([x, y]) => [
    box(m, x - h, x + h, y - h, y + h, z1 - 0.2, z1 + LEG_PEG_L),
    box(m, x - h, x + h, y - h, y + h, z0 - LEG_PEG_L, z0 + 0.2),
  ]);
  return m.Manifold.union([frame, ...pegs]);
}

/** The holes in the floor for the leg frame's feet. */
export function legFloorHoles(m: M, d: Derived): Manifold[] {
  if (!d.legs) return [];
  const h = LEG_PEG / 2 + d.fit;
  return legPegs(d).map(([x, y]) => box(m, x - h, x + h, y - h, y + h, d.floorZ - LEG_PEG_L - 0.3, d.floorZ + 0.1));
}

/** Post centres from y0 to y1, no further apart than `spacing`. */
function postsAlong(y0: number, y1: number, spacing: number): number[] {
  const n = Math.max(1, Math.ceil((y1 - y0 - 2) / spacing));
  return Array.from({ length: n + 1 }, (_, k) => y0 + 1 + (k * (y1 - y0 - 2)) / n);
}

export function railPosts(d: Derived): number[] {
  return postsAlong(...railSpan(d), d.postSpacing);
}

function roofRailX(d: Derived): number {
  return d.xl1 + d.rd - RAIL_T - 0.8;
}

function roofSpan(d: Derived): [number, number] {
  return [d.ry0 + 1, d.ry1 - 1];
}

function roofPosts(d: Derived): number[] {
  return postsAlong(...roofSpan(d), d.postSpacing);
}

/** Holes for a railing's pegs, down into whatever it stands on at z. */
function pegHoles(m: M, x0: number, posts: readonly number[], z: number): Manifold[] {
  const s = PEG + 2 * PEG_FIT;
  const c = x0 + RAIL_T / 2;
  return posts.map((y) => box(m, c - s / 2, c + s / 2, y - s / 2, y + s / 2, z - DECK_T, z + 1));
}

/** A flat railing standing at x0 from y0 to y1 on a floor at z, pegged into it. */
/**
 * A guard rail at the crew's scale: a toe board along the deck, a mid rail
 * and a top rail 1.05 m up, on posts. Flat, standing at x0 from y0 to y1 on
 * a floor at z, pegged into it.
 */
function railingAt(m: M, d: Derived, x0: number, [y0, y1]: [number, number], posts: readonly number[], z: number): Manifold {
  const x1 = x0 + RAIL_T;
  const h = d.railH;
  const parts: Manifold[] = [
    box(m, x0, x1, y0, y1, z, z + Math.max(1.1, 0.15 * d.crewK)),
    box(m, x0, x1, y0, y1, z + h / 2 - 0.5, z + h / 2 + 0.5),
    box(m, x0, x1, y0, y1, z + h - 1, z + h),
  ];
  for (const y of posts) {
    parts.push(box(m, x0, x1, y - 0.8, y + 0.8, z, z + h));
    const pc = x0 + RAIL_T / 2;
    parts.push(box(m, pc - PEG / 2, pc + PEG / 2, y - PEG / 2, y + PEG / 2, z - DECK_T + 0.3, z + 0.1));
  }
  return m.Manifold.union(parts);
}

export function buildRailing(m: M, d: Derived): Manifold {
  return railingAt(m, d, railX(d), railSpan(d), railPosts(d), d.cz);
}

export function buildRoofRailing(m: M, d: Derived): Manifold {
  return railingAt(m, d, roofRailX(d), roofSpan(d), roofPosts(d), d.rz1);
}

export function buildBridge(m: M, d: Derived): Manifold {
  const [px, py] = d.pivot;
  const z0 = d.cz;
  const z1 = z0 + BRIDGE_T;
  const end = px + d.bridgeL;
  const y0 = py - BRIDGE_W / 2;
  const y1 = py + BRIDGE_W / 2;
  const deck = m.Manifold.union([
    cylinder(m, d.pivotR, px, py, z0, z1),
    box(m, px, end, y0, y1, z0, z1),
  ]);
  // Side panels with openings, starting past the catwalk edge so the bridge
  // can swing round over the deck without them.
  const sx0 = d.xl1 + d.cd + 1;
  const ph = 8;
  const parts = [deck];
  if (end - sx0 > 6) {
    for (const [a, b] of [[y0, y0 + 1.2], [y1 - 1.2, y1]] as const) {
      let panel = box(m, sx0, end, a, b, z1 - 0.2, z1 + ph);
      const bays = Math.max(1, Math.round((end - sx0 - 1.5) / 10));
      const pitch = (end - sx0 - 1.5) / bays;
      for (let k = 0; k < bays; k++) {
        const bx = sx0 + 1.5 + k * pitch;
        panel = panel.subtract(box(m, bx, bx + pitch - 1.5, a - 1, b + 1, z1 + 1.2, z1 + ph - 1.2));
      }
      parts.push(panel);
    }
  }
  return m.Manifold.union(parts).subtract(cylinder(m, d.pinHole / 2, px, py, z0 - 1, z1 + 1));
}

/** A pin standing in its holes, head on top. Prints head down. */
export function buildPin(m: M, d: Derived, x: number, y: number, zBottom: number, zTop: number): Manifold {
  return m.Manifold.union([
    cylinder(m, d.pinD / 2, x, y, zBottom, zTop + 0.1),
    cylinder(m, d.pinD / 2 + 1.5, x, y, zTop, zTop + PIN_HEAD),
  ]);
}

export function bridgePinSpan(d: Derived): [number, number] {
  return [d.cz - DECK_T, d.cz + BRIDGE_T];
}

// ---------------------------------------------------------------------- tower

export function buildTower(m: M, d: Derived): Manifold {
  const cx = d.towerX;
  const cy = d.railY;
  const half = d.tw / 2;
  const zf = d.floorZ + FOOT_T;
  const zt = d.towerTop;
  const parts: Manifold[] = [];

  const fh = d.footW / 2;
  const cw = RIB_W / 2 + d.c;
  parts.push(
    box(m, cx - fh, cx + fh, cy - fh, cy + fh, d.floorZ, zf).subtract(
      box(m, cx - fh - 1, cx + fh + 1, cy - cw, cy + cw, d.floorZ - 1, d.floorZ + RIB_H + d.c),
    ),
  );

  // Posts at the corners, a ring of beams per panel, and one brace across
  // each face of each panel, alternating, so the lattice stands upright on
  // the bed: beams bridge post to post, braces climb at 45 degrees or steeper.
  const pc = half - POST / 2;
  const corners: P2[] = [[-pc, -pc], [pc, -pc], [pc, pc], [-pc, pc]];
  for (const [x, y] of corners) {
    parts.push(box(m, cx + x - POST / 2, cx + x + POST / 2, cy + y - POST / 2, cy + y + POST / 2, zf - 0.2, zt + 0.2));
  }
  const span = 2 * pc;
  const panels = Math.max(1, Math.floor((zt - zf) / span));
  const ph = (zt - zf) / panels;
  const bar = 1.6;
  for (let k = 1; k <= panels; k++) {
    const z = zf + k * ph;
    parts.push(box(m, cx - pc, cx + pc, cy - pc - bar / 2, cy - pc + bar / 2, z - bar, z));
    parts.push(box(m, cx - pc, cx + pc, cy + pc - bar / 2, cy + pc + bar / 2, z - bar, z));
    parts.push(box(m, cx - pc - bar / 2, cx - pc + bar / 2, cy - pc, cy + pc, z - bar, z));
    parts.push(box(m, cx + pc - bar / 2, cx + pc + bar / 2, cy - pc, cy + pc, z - bar, z));
  }
  const brace = 1.4;
  for (let k = 0; k < panels; k++) {
    const za = zf + k * ph + brace / 2;
    const zb = zf + (k + 1) * ph - brace / 2;
    const s = k % 2 === 0 ? 1 : -1;
    for (let f = 0; f < 4; f++) {
      const a = corners[f]!;
      const b = corners[(f + 1) % 4]!;
      const [lo, hi] = s > 0 ? [a, b] : [b, a];
      parts.push(member(m, [cx + lo[0], cy + lo[1], za], [cx + hi[0], cy + hi[1], zb], brace));
    }
  }

  parts.push(box(m, cx - half, cx + half, cy - half, cy + half, zt, zt + TOP_T));
  const ladder = d.towerLadder ? towerLadder(d) : null;
  if (ladder) {
    // Rails on the tower's front face, standing on its foot and welded to
    // every ring beam they cross; rungs bridge between them.
    const { x0, x1, y0, y1, z0, z1, top } = ladder;
    for (const x of [x0, x1 - 1.2]) parts.push(box(m, x, x + 1.2, y0, y1, z0 - 0.2, z1));
    // Rungs 30 cm apart at the crew's scale, evenly up to the platform.
    const n = Math.max(1, Math.round((top - z0) / d.rungPitch));
    for (let k = 1; k <= n; k++) {
      const z = z0 + (k * (top - z0)) / n;
      parts.push(box(m, x0 + 0.6, x1 - 0.6, y0 + 0.6, y0 + 1.6, z - 1, z));
    }
  }
  let solid = m.Manifold.union(parts);
  if (d.jib) {
    solid = m.Manifold.union([solid, cylinder(m, 4, cx, cy, zt + TOP_T - 0.2, zt + TOP_T + BOSS_H)]);
    solid = solid.subtract(cylinder(m, d.pinHole / 2, cx, cy, zt - 0.5, zt + TOP_T + BOSS_H + 1));
  }
  return solid;
}

/**
 * The tower's ladder: x0..x1 across its front face, y0..y1 from the ladder's
 * front back to the tower, from the foot it stands on at z0 to its top rung
 * at the top platform, where the crane's house turns just above. The rails
 * stop there too, out of the way of the house as it swings.
 */
export function towerLadder(d: Derived) {
  const s = d.jibDir;
  const half = d.tw / 2;
  const xa = d.towerX + s * (half - 2.3);
  const xb = xa - s * d.ladderW;
  const yF = d.railY - half;
  const top = d.towerTop + TOP_T;
  return {
    x0: Math.min(xa, xb),
    x1: Math.max(xa, xb),
    y0: yF - 4,
    y1: yF + 0.6,
    z0: d.floorZ + FOOT_T,
    z1: top,
    top,
  };
}

// --------------------------------------------------------------------- crane

/**
 * The crane on top of the tower, built like an excavator: a house that turns
 * on the tower's pin -- deck, counterweight, engine cover and the operator's
 * cab -- and a boom on a hinge at the front of the house, which tips up and
 * down. Everything is laid out in the house's own frame: u out from the
 * tower's axis toward the boom, v across it, so the cab and the boom sit side
 * by side as they do on the machine.
 *
 * `z0` is the underside of the house, sitting on the tower's boss; `hinge` is
 * the boom's pivot; `theta` is the boom's angle above level as built.
 */
export function craneFrame(d: Derived) {
  const s = d.jibDir;
  const z0 = d.towerTop + TOP_T + BOSS_H;
  const deckTop = z0 + DECK_H;
  const hinge: P2 = [HINGE_U, z0 + HINGE_Z];
  const theta = d.boomAngle * (Math.PI / 180);
  const boomL = d.jibL - HINGE_U;
  /** A point in the boom's own frame -- t along it from the hinge, n up from its centreline -- in (u, z). */
  const onBoom = (t: number, n: number): P2 => [
    hinge[0] + t * Math.cos(theta) - n * Math.sin(theta),
    hinge[1] + t * Math.sin(theta) + n * Math.cos(theta),
  ];
  return {
    s, z0, deckTop, hinge, theta, boomL, onBoom,
    /** The boom's plane, across the house from the cab. */
    boomY: d.railY + BOOM_V,
    /** World x of a distance u out from the tower's axis. */
    x: (u: number) => d.towerX + s * u,
    /** World (x, z) of a point in (u, z). */
    xz: ([u, z]: P2): P2 => [d.towerX + s * u, z],
  };
}

/** Stand a plan drawn in the house's (u, v) frame at world height z0..z1. */
function houseSlab(m: M, d: Derived, section: CrossSection, z0: number, z1: number): Manifold {
  return m.Manifold.extrude(section.scale([d.jibDir, 1]), z1 - z0).translate([d.towerX, d.railY, z0]);
}

/** A section drawn in the house's (u, z) plane, in world (x, z) ready for slabXZ. */
function toWorldXZ(d: Derived, section: CrossSection): CrossSection {
  return section.scale([d.jibDir, 1]).translate([d.towerX, 0]);
}

/** The pod's footprint on the deck: a nose with its corners cut at 45 degrees. */
function cabPlan(m: M): CrossSection {
  const u0 = CAB_U0;
  const u1 = CAB_U0 + CAB_D;
  const v0 = -CAB_V - CAB_W;
  const v1 = -CAB_V;
  const k = 2;
  return polygon(m, [[u0, v0], [u1 - k, v0], [u1, v0 + k], [u1, v1 - k], [u1 - k, v1], [u0, v1]]);
}

/**
 * The visor: one band of glass round the nose and down the front of both
 * sides, with no posts in it -- a slit, not a set of windows.
 */
function cabGlassBand(m: M, inner: number, outer: number): CrossSection {
  const plan = cabPlan(m);
  const ring = plan.offset(-inner, 'Miter').subtract(plan.offset(-outer, 'Miter'));
  return ring.intersect(rect(m, CAB_U0 + 5, CAB_U0 + CAB_D + 2, -CAB_V - CAB_W - 2, -CAB_V + 2));
}

function cabGlassZ(d: Derived): [number, number] {
  const deck = craneFrame(d).deckTop;
  return [deck + 6.5, deck + 10];
}

/**
 * The operator's pod: an armoured box on the house beside the boom. A nose
 * with cut corners, a visor slit wrapped round it under a hood, a brow that
 * slopes back at 45 degrees to the roof, armour plates down the sides, a
 * light bar under the visor, intake slots at the back, and on the roof a
 * raised panel with a sensor mast, a dish, an antenna and a beacon.
 *
 * Everything stands on or steps back from what is under it, so it prints
 * upright with the house: the brow is a 45 degree slope, and the hood, the
 * dish and the plates stand out no more than a millimetre.
 */
function cabPod(m: M, d: Derived): { adds: Manifold[]; holes: Manifold[] } {
  const f = craneFrame(d);
  const D = f.deckTop;
  const u0 = CAB_U0;
  const u1 = CAB_U0 + CAB_D;
  const v0 = -CAB_V - CAB_W;
  const v1 = -CAB_V;
  const top = D + CAB_H;
  const [gz0, gz1] = cabGlassZ(d);
  const across = (a: number, b: number): [number, number] => [d.railY + a, d.railY + b];

  // The body: the plan stood up, cut by the side profile -- a brow sloping
  // back from above the visor, and the back's top edge chamfered.
  const profile = toWorldXZ(d, polygon(m, [
    [u0, D - 0.1], [u1, D - 0.1], [u1, gz1 + 0.5], [u1 - 4, gz1 + 4.5], [u0 + 2, top], [u0, top - 2],
  ]));
  const body = houseSlab(m, d, cabPlan(m), D - 0.1, top).intersect(slabXZ(m, profile, ...across(v0 - 1, v1 + 1)));

  const ring = (out: number) => cabPlan(m).offset(out, 'Miter').subtract(cabPlan(m).offset(-0.2, 'Miter'))
    .intersect(rect(m, u0 + 4.5, u1 + 2, v0 - 2, v1 + 2));
  const adds: Manifold[] = [
    body,
    // Hood over the visor and sill under it.
    houseSlab(m, d, ring(0.7), gz1, gz1 + 0.7),
    houseSlab(m, d, ring(0.4), gz0 - 0.8, gz0),
    // Light bar under the visor.
    houseSlab(m, d, rect(m, u1 - 0.2, u1 + 0.7, v0 + 2.3, v1 - 2.3), D + 2, D + 3.6),
    // Raised roof panel.
    houseSlab(m, d, cabPlan(m).offset(-1.4, 'Miter').intersect(rect(m, u0, u1 - 5, v0, v1)), top - 0.1, top + 0.6),
  ];
  // Armour plates down both sides, corners cut.
  const plate = toWorldXZ(d, polygon(m, [
    [u0 + 1, D + 1], [u1 - 4, D + 1], [u1 - 3, D + 2], [u1 - 3, D + 5], [u0 + 2, D + 5], [u0 + 1, D + 4],
  ]));
  adds.push(slabXZ(m, plate, ...across(v0 - 0.5, v0 + 0.1)));
  adds.push(slabXZ(m, plate, ...across(v1 - 0.1, v1 + 0.5)));

  // Sensor mast with a dish, an antenna, and a beacon on the roof.
  const roof = top + 0.6;
  const at = (u: number, v: number) => [f.x(u), d.railY + v] as const;
  const [mx, my] = at(u0 + 3.2, (v0 + v1) / 2);
  adds.push(cylinder(m, 0.8, mx, my, roof - 0.1, roof + 3.4));
  adds.push(cylinder(m, 1.9, mx, my, roof + 3.3, roof + 3.9));
  const [ax, ay] = at(u0 + 6.5, v0 + 1.3);
  adds.push(cylinder(m, 0.35, ax, ay, roof - 0.1, roof + 6));
  const [bx, by] = at(u0 + 6.5, v1 - 1.4);
  adds.push(cylinder(m, 1, bx, by, roof - 0.1, roof + 1));
  adds.push(cylinder(m, 0.7, bx, by, roof + 0.9, roof + 1.7));

  const holes: Manifold[] = [
    houseSlab(m, d, cabGlassBand(m, -1, 1.6), gz0, gz1),
  ];
  // Intake slots up the back.
  for (let v = v0 + 1.6; v < v1 - 1; v += 1.6) {
    holes.push(houseSlab(m, d, rect(m, u0 - 1, u0 + 0.5, v, v + 0.6), D + 2, D + 9));
  }
  return { adds, holes };
}

/** The house's hull in plan: its corners cut, deeper at the back than the front. */
function housePlan(m: M): CrossSection {
  const u0 = HOUSE_U - HOUSE_L / 2;
  const u1 = HOUSE_U + HOUSE_L / 2;
  const v = HOUSE_W / 2;
  const kb = 5;
  const kf = 2;
  return polygon(m, [
    [u0, -v + kb], [u0 + kb, -v], [u1 - kf, -v], [u1, -v + kf],
    [u1, v - kf], [u1 - kf, v], [u0 + kb, v], [u0, v - kb],
  ]);
}

/** The light strip round the back of the counterweight: its band in plan, and height. */
function houseLightBand(m: M, inner: number, outer: number): CrossSection {
  const plan = housePlan(m);
  const back = HOUSE_U - HOUSE_L / 2;
  return plan.offset(-inner, 'Miter').subtract(plan.offset(-outer, 'Miter'))
    .intersect(rect(m, back - 2, back + 4, -HOUSE_W, HOUSE_W));
}

function houseLightZ(d: Derived): [number, number] {
  const z0 = craneFrame(d).z0;
  return [z0 + 4, z0 + 5.4];
}

/** The light strip's glass, one band round the back of the house. */
export function buildHouseLights(m: M, d: Derived): Manifold {
  return houseSlab(m, d, houseLightBand(m, 0.6, 1.6), ...houseLightZ(d));
}

/**
 * The house. Prints upright, deck down: the pod's visor and the engine
 * grille are pockets in upright faces, its brow a 45 degree slope, and the
 * boom's hinge lugs stand straight up with their pin hole across them.
 */
export function buildHouse(m: M, d: Derived): Manifold {
  const f = craneFrame(d);
  const { z0, deckTop } = f;
  const body = housePlan(m);
  const across: [number, number] = [d.railY - HOUSE_W, d.railY + HOUSE_W];
  const back = HOUSE_U - HOUSE_L / 2;
  const parts: Manifold[] = [houseSlab(m, d, body, z0, deckTop)];

  // Counterweight across the back: the hull's cut corners stood up, its top
  // sloping down to the rear -- a slope as it prints, not an overhang.
  const rear = body.intersect(rect(m, back - 1, back + 6, -HOUSE_W, HOUSE_W));
  const rearProfile = toWorldXZ(d, polygon(m, [
    [back - 1, deckTop - 0.2], [back + 6.1, deckTop - 0.2], [back + 6.1, z0 + 11], [back + 3, z0 + 11], [back - 1, z0 + 7],
  ]));
  parts.push(houseSlab(m, d, rear, deckTop - 0.1, z0 + 11).intersect(slabXZ(m, rearProfile, ...across)));
  // Engine fairing beside the pod, behind the boom, its front sloping down
  // toward the hinge; an exhaust stack on it.
  const fairing = toWorldXZ(d, polygon(m, [
    [back + 5.9, deckTop - 0.2], [1.5, deckTop - 0.2], [1.5, z0 + 5], [-1.5, z0 + 8], [back + 5.9, z0 + 8],
  ]));
  parts.push(slabXZ(m, fairing, d.railY + CAB_V, d.railY + HOUSE_W / 2 - 1));
  const [ex, ey] = [f.x(-6.5), d.railY + HOUSE_W / 2 - 2.5];
  parts.push(cylinder(m, 0.9, ex, ey, z0 + 7.9, z0 + 13));
  parts.push(cylinder(m, 1.25, ex, ey, z0 + 12.4, z0 + 13));

  // The boom's hinge: two lugs standing on the deck either side of its root,
  // with octagonal heads.
  const lug = toWorldXZ(d, m.CrossSection.hull([
    m.CrossSection.circle(3.4, 8).rotate(22.5).translate(f.hinge),
    rect(m, f.hinge[0] - 4.5, f.hinge[0] + 4.5, deckTop - 0.2, deckTop),
  ]));
  for (const [a, b] of [[-BOOM_HALF - LUG_GAP - LUG_T, -BOOM_HALF - LUG_GAP], [BOOM_HALF + LUG_GAP, BOOM_HALF + LUG_GAP + LUG_T]]) {
    parts.push(slabXZ(m, lug, f.boomY + a!, f.boomY + b!));
  }

  const pod = d.craneCab ? cabPod(m, d) : null;
  if (pod) parts.push(...pod.adds);
  const holes: Manifold[] = [
    cylinder(m, d.pinHole / 2, d.towerX, d.railY, z0 - 1, deckTop + 1),
    jointHoleAt(m, d, f.xz(f.hinge), f.boomY - BOOM_HALF - LUG_GAP - LUG_T - 1, f.boomY + BOOM_HALF + LUG_GAP + LUG_T + 1),
    ...(pod ? pod.holes : []),
    houseSlab(m, d, houseLightBand(m, -1, 1.6), ...houseLightZ(d)),
  ];
  // Grille slots across the engine cover, clear of the exhaust.
  for (let u = HOUSE_U - HOUSE_L / 2 + 7.5; u < 0; u += 1.5) {
    holes.push(houseSlab(m, d, rect(m, u, u + 0.6, CAB_V + 1, HOUSE_W / 2 - 4), z0 + 7.5, z0 + 9));
  }
  return m.Manifold.union(parts).subtract(m.Manifold.union(holes));
}

/** The visor's glass, one piece round the pod's nose. */
export function buildCabGlass(m: M, d: Derived): Manifold {
  const [gz0, gz1] = cabGlassZ(d);
  return houseSlab(m, d, cabGlassBand(m, 0.6, 1.6), gz0, gz1);
}

/**
 * The boom's side profile, in its own frame (t along it from the hinge, n up):
 * a blade, deep at the root and slimming to a cut-off nose, opened up into a
 * truss -- top and bottom chords, diagonals between them, and the triangles
 * between the diagonals left open. Flat on its side as it prints, so every
 * opening is a hole straight down through it.
 */
function boomBlade(m: M, L: number): CrossSection {
  const top = BOOM_H / 2;
  const root = -4;
  const nose = -BOOM_H / 2 - 0.5;
  const blade = polygon(m, [[0, top], [L - 2.5, top], [L, top - 2.5], [L - 2.5, nose], [4, root], [0, root + 0.5]]);
  const t0 = 7;
  const t1 = L - 9;
  if (t1 - t0 < 8) return blade;
  const chord = 1.3;
  const bottom = (t: number) => root + ((nose - root) * (t - 4)) / (L - 6.5);
  const bays = Math.max(2, Math.round((t1 - t0) / 7));
  const pitch = (t1 - t0) / bays;
  const struts: CrossSection[] = [];
  for (let i = 0; i <= bays; i++) {
    const t = t0 + i * pitch;
    struts.push(rect(m, t - 0.6, t + 0.6, root - 1, top + 1));
    if (i < bays) {
      const [a, b] = i % 2 === 0 ? [t, t + pitch] : [t + pitch, t];
      struts.push(m.CrossSection.hull([
        m.CrossSection.circle(0.6, 12).translate([a, top - chord]),
        m.CrossSection.circle(0.6, 12).translate([b, bottom(b) + chord]),
      ]));
    }
  }
  const window = blade.offset(-chord, 'Miter').intersect(rect(m, t0, t1, root - 1, top + 1));
  return blade.subtract(window.subtract(m.CrossSection.union(struts)));
}

/**
 * The boom: a beam out from its hinge, raised to the boom angle, with the
 * robot arm's shoulder bracket under its tip -- or the hook. Prints flat,
 * on its side, with both its pin holes upright.
 */
export function buildBoom(m: M, d: Derived): Manifold {
  const f = craneFrame(d);
  const L = f.boomL;
  const sections: CrossSection[] = [m.CrossSection.circle(3.5, 8).rotate(22.5), boomBlade(m, L)];
  if (d.robotArm) {
    sections.push(m.CrossSection.hull([
      m.CrossSection.circle(3, 32).translate([L - 4, -BOOM_H / 2 - 3.5]),
      rect(m, L - 7, L - 1, -BOOM_H / 2 - 0.2, -BOOM_H / 2 + 0.2),
    ]));
  }
  const inUZ = m.CrossSection.union(sections).rotate(d.boomAngle).translate(f.hinge);
  let solid = slabXZ(m, toWorldXZ(d, inUZ), f.boomY - BOOM_HALF, f.boomY + BOOM_HALF);
  const holes = [jointHoleAt(m, d, f.xz(f.hinge), f.boomY - 3, f.boomY + 3)];
  if (d.robotArm) holes.push(jointHoleAt(m, d, armPose(d).S, f.boomY - 3, f.boomY + 3));
  solid = solid.subtract(m.Manifold.union(holes));
  if (!d.robotArm) {
    // Cable and hook block, hanging straight down from the tip.
    const [hx, hz] = f.xz(f.onBoom(L - 3, -BOOM_H / 2));
    solid = m.Manifold.union([
      solid,
      box(m, hx - 0.6, hx + 0.6, f.boomY - 0.6, f.boomY + 0.6, hz - 16, hz + 0.5),
      box(m, hx - 2, hx + 2, f.boomY - 2, f.boomY + 2, hz - 20, hz - 15.8),
    ]);
  }
  return solid;
}

/** The boom's hinge pin, across the lugs, head on the far side from the cab. */
export function buildBoomPin(m: M, d: Derived): Manifold {
  const f = craneFrame(d);
  const reach = BOOM_HALF + LUG_GAP + LUG_T;
  return pinAlongY(m, d, f.xz(f.hinge), f.boomY - reach, f.boomY + reach);
}


// ------------------------------------------------------------------ robot arm

const deg = Math.PI / 180;
const add = (p: P2, q: P2, k = 1): P2 => [p[0] + q[0] * k, p[1] + q[1] * k];

/**
 * Where the robot arm's joints are as built, in the crane arm's own plane
 * (x, z) at the tower's y: shoulder S under the tip, elbow E, wrist W, palm
 * P, and each claw finger's pivot F, knuckle T and hooked tip H.
 *
 * Every joint is a lap joint: two flat links side by side on one pin. The
 * links alternate between two layers either side of the crane arm's plane,
 * so no link ever has to pass through another as the arm folds.
 */
export function armPose(d: Derived) {
  const s = d.jibDir;
  const f = craneFrame(d);
  const cy = f.boomY;
  const S: P2 = f.xz(f.onBoom(f.boomL - 4, -BOOM_H / 2 - 3.5));
  const L1 = d.robotArmL * 0.55;
  const L2 = d.robotArmL * 0.45;
  const E = add(S, [s * Math.sin(25 * deg), -Math.cos(25 * deg)], L1);
  const W = add(E, [s * Math.cos(35 * deg), -Math.sin(35 * deg)], L2);
  const dir: P2 = [s * Math.sin(30 * deg), -Math.cos(30 * deg)];
  const perp: P2 = [-dir[1], dir[0]];
  const P = add(W, dir, 6);
  const F: [P2, P2] = [add(P, perp, 3.5), add(P, perp, -3.5)];
  const T: [P2, P2] = [add(F[0], dir, 7), add(F[1], dir, 7)];
  const H: [P2, P2] = [add(T[0], perp, -1.8), add(T[1], perp, 1.8)];
  return {
    S, E, W, P, F, T, H, L1, L2,
    yBracket: [cy - 2, cy + 2] as [number, number],
    /** Upper arm and wrist. */
    yA: [cy + 2.2, cy + 5.2] as [number, number],
    /** Forearm and claw fingers. */
    yB: [cy - 0.8, cy + 2] as [number, number],
  };
}

function jointHoleAt(m: M, d: Derived, [x, z]: P2, y0: number, y1: number): Manifold {
  const r = d.jointHole / 2;
  return m.Manifold.cylinder(y1 - y0, r, r, segmentsForRadius(r)).rotate([-90, 0, 0]).translate([x, y0, z]);
}

function pill2(m: M, p: P2, q: P2, r: number): CrossSection {
  return m.CrossSection.hull([m.CrossSection.circle(r, 32).translate([p[0], p[1]]), m.CrossSection.circle(r, 32).translate([q[0], q[1]])]);
}

function link(m: M, d: Derived, section: CrossSection, joints: readonly P2[], [y0, y1]: [number, number]): Manifold {
  const holes = joints.map((j) => jointHoleAt(m, d, j, y0 - 1, y1 + 1));
  return slabXZ(m, section, y0, y1).subtract(m.Manifold.union(holes));
}

export function buildUpperArm(m: M, d: Derived): Manifold {
  const { S, E, L1, yA } = armPose(d);
  let section = pill2(m, S, E, 3);
  // A lightening slot down the middle, where there is length for one.
  if (L1 > 18) {
    const u: P2 = [(E[0] - S[0]) / L1, (E[1] - S[1]) / L1];
    section = section.subtract(pill2(m, add(S, u, 7), add(E, u, -7), 0.9));
  }
  return link(m, d, section, [S, E], yA);
}

export function buildForearm(m: M, d: Derived): Manifold {
  const { E, W, yB } = armPose(d);
  return link(m, d, pill2(m, E, W, 2.6), [E, W], yB);
}

/** The wrist: a stub off the forearm, and a palm bar carrying both fingers' pivots. */
export function buildWrist(m: M, d: Derived): Manifold {
  const { W, P, F, yA } = armPose(d);
  return link(m, d, m.CrossSection.union([pill2(m, W, P, 3), pill2(m, F[0], F[1], 2.4)]), [W, F[0], F[1]], yA);
}

export function buildClaw(m: M, d: Derived, i: 0 | 1): Manifold {
  const { F, T, H, yB } = armPose(d);
  const section = m.CrossSection.union([
    m.CrossSection.circle(2.2, 32).translate([F[i][0], F[i][1]]),
    pill2(m, F[i], T[i], 1.2),
    pill2(m, T[i], H[i], 1.2),
  ]);
  return link(m, d, section, [F[i]], yB);
}

/** A joint pin through the arm, head on the outside of the upper layer. */
export function buildArmPin(m: M, d: Derived, at: P2, y0: number): Manifold {
  return pinAlongY(m, d, at, y0, craneFrame(d).boomY + 5.2);
}

/** A pin across from y0 to y1 at (x, z), with its head beyond y1. */
function pinAlongY(m: M, d: Derived, [x, z]: P2, y0: number, y1: number): Manifold {
  const r = d.armPinD / 2;
  const seg = segmentsForRadius(r + 1);
  return m.Manifold.union([
    m.Manifold.cylinder(y1 - y0 + 0.1, r, r, seg).rotate([-90, 0, 0]).translate([x, y0, z]),
    m.Manifold.cylinder(1, r + 1, r + 1, seg).rotate([-90, 0, 0]).translate([x, y1, z]),
  ]);
}

/** The pin the house turns on: down through its deck into the tower. */
export function jibPinSpan(d: Derived): [number, number] {
  return [d.towerTop, craneFrame(d).deckTop];
}
