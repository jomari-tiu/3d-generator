import type { CrossSection, Manifold } from 'manifold-3d';
import { dropSlivers } from '../../core/kernel/primitives';
import type { ClawSpec } from '../shared/claw';
import { bar, box, cylinder, cylinderY, polygon, rect, slab, slabXZ, slabYZ, stripeBand, type M } from '../shared/solid';
import { stairSlot } from '../shared/stairs';
import { trussAlongX, trussAlongY } from '../shared/truss';
import {
  BACK_T, CABIN_D, CABIN_H, COLUMN, DECK_T, FRONT_STRIP, PEG, PEG_L, TROLLEY_L, TRUSS_D, TRUSS_W, type Derived,
} from './geometry';

// ---------------------------------------------------------------------- base

const KNOB_R = 4;
const NECK_W = 4;
const KNOB_AT = 5;

/** A dovetail key across the base's right edge, pointing +x. */
function knob(m: M, grow: number): CrossSection {
  const neck = rect(m, -1, KNOB_AT, -NECK_W / 2 - grow, NECK_W / 2 + grow);
  return m.CrossSection.union([neck, m.CrossSection.circle(KNOB_R + grow, 48).translate([KNOB_AT, 0])]);
}

/** Where the keys sit along the edge: clear of the stair towers' sills. */
export function knobYs(d: Derived): number[] {
  return [d.kitY - d.D * 0.18, d.kitY + d.D * 0.18];
}

/** The four columns' centres. */
export function columns(d: Derived): [number, number][] {
  return [[-d.cx, d.cyF], [d.cx, d.cyF], [-d.cx, d.cyB], [d.cx, d.cyB]];
}

/** The back frame's y, centred under the back truss, and its x reach between the galleries. */
export function backFrameAt(d: Derived) {
  return { y0: d.cyB - BACK_T / 2, y1: d.cyB + BACK_T / 2, x: -d.gxi - 0.6 };
}

/**
 * The floor markings, one piece: a hazard band across the front of the
 * dock between the stair towers, and a pad round where the kit stands.
 */
function floorMarks(m: M, d: Derived): CrossSection {
  const reach = Math.max(10, -d.gxi - 6);
  const y0 = d.cyF - COLUMN / 2 + 2;
  const band = stripeBand(m, rect(m, -reach, reach, y0, y0 + 6), y0, y0 + 6);
  const s = Math.min(reach - 4, (d.cyB - d.cyF) / 2 - 10);
  const pad = rect(m, -s, s, d.kitY - s, d.kitY + s).subtract(rect(m, -s + 1.4, s - 1.4, d.kitY - s + 1.4, d.kitY + s - 1.4));
  const link = rect(m, -0.6, 0.6, y0 + 5.5, d.kitY - s + 0.7);
  return m.CrossSection.union([band, pad, link]);
}

/**
 * The base: a plate with seams across its floor, sockets for the columns,
 * the stair towers' sills and the back frame, a boss with the stand socket
 * where the kit stands, and feet at the corners. Keys on its right edge and
 * sockets on its left, so docks press together side by side. Prints flat.
 */
export function buildBase(m: M, d: Derived): Manifold {
  const { W, D, baseH } = d;
  let plan = rect(m, -W / 2, W / 2, -D / 2, D / 2);
  if (d.joined) {
    for (const y of knobYs(d)) {
      plan = plan.add(knob(m, 0).translate([W / 2, y]));
      plan = plan.subtract(knob(m, d.jointClear).translate([-W / 2, y]));
    }
  }
  const parts: Manifold[] = [slab(m, plan, 0, baseH)];
  for (const sy of [-1, 1]) {
    const y = (sy * D) / 2;
    const foot = polygon(m, [[y - sy * 0.5, 0], [y + sy * 6, 0], [y + sy * 6, 2], [y - sy * 0.5, 8.5]]);
    for (const sx of [-1, 1]) {
      const xa = sx * (W / 2 - 3);
      const xb = sx * (W / 2 - 15);
      parts.push(slabYZ(m, foot, Math.min(xa, xb), Math.max(xa, xb)));
    }
  }
  const f = d.fit;
  const cuts: Manifold[] = columns(d).map(([x, y]) =>
    box(m, x - COLUMN / 2 - f, x + COLUMN / 2 + f, y - COLUMN / 2 - f, y + COLUMN / 2 + f, baseH - d.slotD, baseH + 1));
  if (d.stairs) for (const s of d.stairs) cuts.push(stairSlot(m, s));
  if (d.backFrame) {
    const b = backFrameAt(d);
    cuts.push(box(m, -b.x - f, b.x + f, b.y0 - f, b.y1 + f, baseH - d.slotD, baseH + 1));
  }
  // The floor's pattern -- plates, grilles and markings -- or plain seams.
  if (d.floorPattern) {
    cuts.push(slab(m, floorPattern(m, d), baseH - 0.45, baseH + 1));
  } else {
    for (const x of [-W / 4, 0, W / 4]) cuts.push(box(m, x - 0.4, x + 0.4, d.gy0 + 2, d.cyB - COLUMN, baseH - 0.5, baseH + 1));
    for (let y = d.cyF; y < d.cyB - 10; y += 30) cuts.push(box(m, d.gxi + 2, -d.gxi - 2, y - 0.4, y + 0.4, baseH - 0.5, baseH + 1));
  }
  // A groove round the front, and the holes for the apron's pegs.
  cuts.push(box(m, -W / 2 - 1, W / 2 + 1, -D / 2 - 1, -D / 2 + 0.6, baseH / 2 - 0.5, baseH / 2 + 0.5));
  if (d.apron) {
    const r = PEG / 2 + f;
    for (const [x, y] of apronPegs(d)) cuts.push(box(m, x - r, x + r, y - r, y + r, baseH - 2.4, baseH + 0.1));
  }
  if (d.hazard) cuts.push(slab(m, floorMarks(m, d), baseH - 0.6, baseH + 1));
  let base = m.Manifold.union(parts).subtract(m.Manifold.union(cuts));
  if (d.joined) {
    const sockets = knobYs(d).map((y) => knob(m, d.jointClear).translate([-W / 2, y]));
    base = base.subtract(slab(m, m.CrossSection.union(sockets), -1, baseH + 4));
  }
  if (d.standHole <= 0) return base;
  return m.Manifold.union([base, cylinder(m, 9, 0, d.kitY, baseH - 0.2, baseH + 1.5)])
    .subtract(cylinder(m, d.standHole / 2, 0, d.kitY, baseH - 6, baseH + 2));
}

/**
 * The floor's pattern, as the seams and slots to cut into it: deck plates
 * with their corners cut, every few plates a grille of slots, and here and
 * there a small block of engraved markings -- across the dock floor between
 * the galleries, behind the apron.
 */
function floorPattern(m: M, d: Derived): CrossSection {
  const x0 = d.gxi + 2;
  const x1 = -d.gxi - 2;
  const y0 = d.apron ? apronBox(d).y1 + 1.5 : d.gy0 + 2;
  const y1 = d.cyB - COLUMN / 2 - 2;
  const cols = Math.max(2, Math.round((x1 - x0) / 30));
  const rows = Math.max(2, Math.round((y1 - y0) / 34));
  const pw = (x1 - x0) / cols;
  const ph = (y1 - y0) / rows;
  const k = Math.min(3, pw / 6, ph / 6);
  const cuts: CrossSection[] = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const a = x0 + i * pw;
      const b = a + pw;
      const c = y0 + j * ph;
      const e = c + ph;
      const plate = polygon(m, [[a + k, c], [b - k, c], [b, c + k], [b, e - k], [b - k, e], [a + k, e], [a, e - k], [a, c + k]]);
      cuts.push(plate.subtract(plate.offset(-0.6, 'Miter')));
      // Every third plate, offset row by row, a grille of slots.
      if ((i + 2 * j) % 3 === 1 && pw > 14 && ph > 14) {
        for (let y = c + 4; y < e - 4; y += 1.5) cuts.push(rect(m, a + 4, b - 4, y, y + 0.6));
      } else if ((i + j) % 4 === 0 && pw > 16) {
        // A block of markings: a frame with a few short strokes in it, like a stencilled number.
        const mx = a + pw * 0.62;
        const my = c + ph * 0.2;
        cuts.push(rect(m, mx, mx + 8, my, my + 4).subtract(rect(m, mx + 0.5, mx + 7.5, my + 0.5, my + 3.5)));
        for (let s = 0; s < 3; s++) cuts.push(rect(m, mx + 1.5 + s * 2, mx + 2.6 + s * 2, my + 1.2, my + 2.8));
      }
    }
  }
  return m.CrossSection.union(cuts);
}

// --------------------------------------------------------------------- apron

/**
 * The apron: a raised deck across the front of the dock between the stair
 * towers, three steps high at the crew's scale, with two flights of steps
 * down its front and bent-pipe handrails beside them.
 */
export function apronBox(d: Derived) {
  const step = 0.18 * d.crewK;
  const tread = Math.max(1.8, 0.25 * d.crewK);
  const inner = d.stairs ? d.W / 2 - 4 - (d.stairs[1].x1 - d.stairs[1].x0) : -d.gxi;
  const half = inner - 4;
  const y0 = -d.D / 2 + 5 + 2 * tread;
  const y1 = d.cyF - COLUMN / 2 - 3;
  const stairW = Math.max(6, 0.9 * d.crewK);
  return {
    x0: -half, x1: half, y0, y1,
    z0: d.baseH, z1: d.baseH + 3 * step,
    step, tread, stairW,
    stairs: [-half * 0.55, half * 0.55],
  };
}

export function apronPegs(d: Derived): [number, number][] {
  const a = apronBox(d);
  const ym = (a.y0 + a.y1) / 2;
  return [[a.x0 * 0.3, ym], [a.x1 * 0.3, ym]];
}

/** The guide band on the apron, one piece: a broad stripe that jinks across, and a thin one beside it. */
function apronStripe(m: M, d: Derived): CrossSection {
  const a = apronBox(d);
  const w = (a.x1 - a.x0) * 0.08;
  const yA = a.y0 + 2;
  const yB = a.y1 - 2;
  const xs = a.x1 * 0.18;
  const xe = a.x1 * 0.42;
  const yk0 = yA + (yB - yA) * 0.35;
  const yk1 = yA + (yB - yA) * 0.62;
  const broad = m.CrossSection.union([
    rect(m, xs - w / 2, xs + w / 2, yA, yk0),
    bar(m, [xs, yk0], [xe, yk1], w),
    rect(m, xe - w / 2, xe + w / 2, yk1, yB),
  ]);
  const off = w * 0.9;
  const thin = m.CrossSection.union([
    rect(m, xs + off - 0.6, xs + off + 0.6, yA, yk0),
    bar(m, [xs + off, yk0], [xe + off, yk1], 1.2),
    rect(m, xe + off - 0.6, xe + off + 0.6, yk1, yB),
  ]);
  const tie = rect(m, xs - w / 2, xs + off + 0.6, yA, yA + 1.2);
  return m.CrossSection.union([broad, thin, tie]);
}

/** Pipe handrails beside a flight of steps: a bent pipe from the floor up and over onto the deck. */
function stepRails(m: M, d: Derived, x: number): Manifold[] {
  const a = apronBox(d);
  const yFoot = a.y0 - 2 * a.tread + 0.8;
  const yDeck = a.y0 + 3;
  const top = a.z1 + Math.max(6, 0.9 * d.crewK);
  const r = 0.55;
  const arch = m.CrossSection.union([
    bar(m, [yFoot, a.z0 + r], [yFoot, top], 2 * r),
    bar(m, [yFoot, top], [yDeck, top], 2 * r),
    bar(m, [yDeck, top], [yDeck, a.z1 - 0.4], 2 * r),
  ]);
  return [-1, 1].map((s) => slabYZ(m, arch, x + s * (a.stairW / 2 + 0.9) - r, x + s * (a.stairW / 2 + 0.9) + r));
}

/**
 * The apron: its deck with bevelled edges, panel seams and two hatches on
 * top and the guide band's pocket; vents along its front; the steps down and
 * their handrails; a pipe run down each side; pegs into the floor. Prints
 * flat, as it sits: the bevels are 45 degree slopes and the handrails' tops
 * bridge between their legs.
 */
export function buildApron(m: M, d: Derived): Manifold {
  const a = apronBox(d);
  const plan = rect(m, a.x0, a.x1, a.y0, a.y1);
  const deck = m.Manifold.hull([slab(m, plan, a.z0, a.z1 - 1), slab(m, plan.offset(-1, 'Miter'), a.z1 - 1, a.z1)]);
  const parts: Manifold[] = [deck];
  // Steps down the front: two below the deck, each a block from the floor.
  for (const x of a.stairs) {
    for (let k = 1; k <= 2; k++) {
      parts.push(box(m, x - a.stairW / 2, x + a.stairW / 2, a.y0 - k * a.tread, a.y0 + 0.2, a.z0, a.z1 - k * a.step));
    }
    parts.push(...stepRails(m, d, x));
  }
  // A pipe run down each side, half round, flat on the floor against the deck.
  for (const s of [-1, 1]) {
    for (const [dz, rr] of [[0, 1.3], [2.4, 0.9]] as const) {
      const cx = s * (a.x1 + rr - 0.2);
      parts.push(cylinderY(m, rr, cx, a.z0 + dz, a.y0 + 2, a.y1 - 2).intersect(box(m, cx - rr - 1, cx + rr + 1, a.y0, a.y1, a.z0, a.z0 + dz + rr + 1)));
    }
  }
  const r = PEG / 2;
  for (const [x, y] of apronPegs(d)) parts.push(box(m, x - r, x + r, y - r, y + r, a.z0 - 2, a.z0 + 0.2));
  let solid = m.Manifold.union(parts);
  const cuts: Manifold[] = [slab(m, apronStripe(m, d), a.z1 - 0.6, a.z1 + 1)];
  // Seams across the deck and two hatches.
  const top = a.z1 - 0.4;
  for (const x of [a.x0 * 0.5, 0, a.x1 * 0.5]) cuts.push(box(m, x - 0.3, x + 0.3, a.y0 + 1.5, a.y1 - 1.5, top, a.z1 + 1));
  for (const hx of [a.x0 * 0.75, a.x0 * 0.25]) {
    const hatch = rect(m, hx - 4, hx + 4, a.y1 - 11, a.y1 - 4);
    cuts.push(slab(m, hatch.subtract(hatch.offset(-0.6, 'Miter')), top, a.z1 + 1));
  }
  // Tread grooves on the steps, near their nosings, and vents along the front.
  for (const x of a.stairs) {
    for (let k = 1; k <= 2; k++) cuts.push(box(m, x - a.stairW / 2 + 0.8, x + a.stairW / 2 - 0.8, a.y0 - k * a.tread + 0.5, a.y0 - k * a.tread + 0.9, a.z1 - k * a.step - 0.3, a.z1));
  }
  const vz = (a.z0 + a.z1) / 2;
  for (const [v0, v1] of [[a.x0 + 3, a.stairs[0]! - a.stairW / 2 - 3], [a.stairs[0]! + a.stairW / 2 + 3, a.stairs[1]! - a.stairW / 2 - 3], [a.stairs[1]! + a.stairW / 2 + 3, a.x1 - 3]] as const) {
    for (let x = v0; x + 1 < v1; x += 2) cuts.push(box(m, x, x + 1, a.y0 - 1, a.y0 + 0.6, vz - 1, vz + 1));
  }
  solid = solid.subtract(m.Manifold.union(cuts));
  return solid;
}

/** The guide band's inlay, flush in the apron's deck. */
export function buildApronStripe(m: M, d: Derived): Manifold {
  const a = apronBox(d);
  return slab(m, apronStripe(m, d), a.z1 - 0.6, a.z1);
}

/** The floor markings' inlay, flush in the floor. */
export function buildBaseStripes(m: M, d: Derived): Manifold {
  return dropSlivers(m, slab(m, floorMarks(m, d), d.baseH - 0.6, d.baseH), 0.05);
}

// ------------------------------------------------------------------ columns

/** Where each gallery pegs into a column's inner face: two pegs, either side. */
function galleryPegs([x, y]: [number, number], z: number): { x: number; y: number; z: number; dir: 1 | -1 }[] {
  const dir: 1 | -1 = x < 0 ? 1 : -1;
  const face = x + (dir * COLUMN) / 2;
  return [-3, 3].map((dy) => ({ x: face, y: y + dy, z: z - DECK_T / 2, dir }));
}

/**
 * A column: a square post standing in the base, its outer and front faces
 * panelled with an X in each panel, holes in its inner face for the
 * galleries' pegs and in its top for the top frame's. Prints lying on its
 * inner face, the panels up.
 */
export function buildColumn(m: M, d: Derived, at: [number, number]): Manifold {
  const [x, y] = at;
  const h = COLUMN / 2;
  const z0 = d.baseH - d.slotD;
  const z1 = d.columnTop;
  let col = box(m, x - h, x + h, y - h, y + h, z0, z1);
  const cuts: Manifold[] = [];
  // Panels with an X left standing in each, on the outer face and the front.
  const outer = x < 0 ? x - h : x + h;
  const panelZ: number[] = [];
  for (let z = d.baseH + 4; z + 24 < z1 - 4; z += 28) panelZ.push(z);
  const xPanel = (a0: number, a1: number) => m.CrossSection.union(panelZ.map((z) =>
    rect(m, a0, a1, z, z + 24).subtract(m.CrossSection.union([bar(m, [a0, z], [a1, z + 24], 1.4), bar(m, [a0, z + 24], [a1, z], 1.4)]))));
  const [ox0, ox1] = x < 0 ? [outer - 1, outer + 0.8] : [outer - 0.8, outer + 1];
  cuts.push(slabYZ(m, xPanel(y - h + 1.6, y + h - 1.6), ox0, ox1));
  cuts.push(slabXZ(m, xPanel(x - h + 1.6, x + h - 1.6), y - h - 1, y - h + 0.8));
  // Peg holes.
  const r = PEG / 2 + d.fit;
  for (const z of d.levels) {
    for (const p of galleryPegs(at, z)) {
      const [a, b] = p.dir > 0 ? [p.x - PEG_L - 0.5, p.x + 1] : [p.x - 1, p.x + PEG_L + 0.5];
      cuts.push(box(m, a, b, p.y - r, p.y + r, p.z - r, p.z + r));
    }
  }
  cuts.push(box(m, x - r, x + r, y - r, y + r, z1 - PEG_L - 0.5, z1 + 1));
  col = col.subtract(m.Manifold.union(cuts));
  return col;
}

// ---------------------------------------------------------------- galleries

/** A guard rail at the crew's scale along a straight run, as boxes: toe board, mid rail, top rail, posts. */
function guardRail(m: M, d: Derived, a: [number, number], b: [number, number], z: number): Manifold[] {
  const h = d.railH;
  const t = 1;
  const [ax, ay] = a;
  const [bx, by] = b;
  const len = Math.hypot(bx - ax, by - ay);
  if (len < 2) return [];
  const along = (z0: number, z1: number) => box(m, Math.min(ax, bx) - t / 2, Math.max(ax, bx) + t / 2, Math.min(ay, by) - t / 2, Math.max(ay, by) + t / 2, z0, z1);
  const parts = [
    along(z - 0.1, z + Math.max(1.1, 0.15 * d.crewK)),
    along(z + h / 2 - 0.5, z + h / 2 + 0.5),
    along(z + h - 1, z + h),
  ];
  const n = Math.max(1, Math.ceil(len / d.postSpacing));
  for (let k = 0; k <= n; k++) {
    const px = ax + ((bx - ax) * k) / n;
    const py = ay + ((by - ay) * k) / n;
    parts.push(box(m, px - 0.7, px + 0.7, py - 0.7, py + 0.7, z - 0.1, z + h));
  }
  return parts;
}

/**
 * One gallery: a grated deck down one side of the dock, wrapped round the two
 * columns at its outer edge and pegged into their inner faces, with a guard
 * rail along its inner edge, its back and its outer edge between the
 * columns, and along its front except where the stair tower's landing meets
 * it. Prints flat, deck down, the rails standing.
 */
export function buildGallery(m: M, d: Derived, side: -1 | 1, z: number, bayW: number): Manifold {
  const s = side;
  const xo = s * -d.gxo;
  const xi = s * -d.gxi;
  const [x0, x1] = [Math.min(xo, xi), Math.max(xo, xi)];
  const f = d.fit;
  const cols = columns(d).filter(([x]) => Math.sign(x) === s);
  let plan = rect(m, x0, x1, d.gy0, d.gy1);
  for (const [cx, cy] of cols) plan = plan.subtract(rect(m, cx - COLUMN / 2 - f, cx + COLUMN / 2 + f, cy - COLUMN / 2 - f, cy + COLUMN / 2 + f));
  const parts: Manifold[] = [slab(m, plan, z - DECK_T, z)];
  // Pegs into the columns' inner faces.
  for (const c of cols) {
    for (const p of galleryPegs(c, z)) {
      const h = PEG / 2;
      const [a, b] = p.dir > 0 ? [p.x - PEG_L, p.x + 0.3] : [p.x - 0.3, p.x + PEG_L];
      parts.push(box(m, a + (p.dir > 0 ? 0 : 0), b, p.y - h, p.y + h, p.z - h, p.z + h).translate([p.dir > 0 ? 0 : 0, 0, 0]));
    }
  }
  // Guard rails, inset half a rail from the deck's edges.
  const e = 0.6;
  const inner = s > 0 ? x0 + e : x1 - e;
  const outer = s > 0 ? x1 - e : x0 + e;
  const yF = d.gy0 + e;
  const yB = d.gy1 - e;
  parts.push(...guardRail(m, d, [inner, yF], [inner, yB], z));
  parts.push(...guardRail(m, d, [inner, yB], [outer - s * (COLUMN + f + 1), yB], z));
  // The front, from the inner edge out to the tower's landing bay.
  const opening = d.stairs ? bayW : 0;
  parts.push(...guardRail(m, d, [inner, yF], [outer - s * opening, yF], z));
  if (!d.stairs) parts.push(...guardRail(m, d, [outer, yF], [outer, d.cyF - COLUMN / 2 - f - 0.6], z));
  // The outer edge, between the columns.
  parts.push(...guardRail(m, d, [outer, d.cyF + COLUMN / 2 + f + 0.8], [outer, d.cyB - COLUMN / 2 - f - 0.8], z));
  let deck = m.Manifold.union(parts);
  // Grating: slots across the deck, clear of its edges and the columns.
  const pitch = Math.max(1.2, 0.08 * d.crewK);
  const slots: Manifold[] = [];
  for (let y = d.gy0 + 2; y < d.gy1 - 2; y += pitch) {
    slots.push(box(m, x0 + 2, x1 - 2, y - 0.25, y + 0.25, z - 0.35, z + 0.1));
  }
  // Only where the deck is plain: not round the columns, where the pegs are.
  let grated = plan.offset(-1.5, 'Miter');
  for (const [cx, cy] of cols) grated = grated.subtract(rect(m, cx - COLUMN / 2 - 2.5, cx + COLUMN / 2 + 2.5, cy - COLUMN / 2 - 2.5, cy + COLUMN / 2 + 2.5));
  deck = deck.subtract(m.Manifold.union(slots).intersect(slab(m, grated, z - 1, z + 1)));
  if (d.cabin && s > 0 && z === d.levels[d.levels.length - 1]) {
    const r = PEG / 2 + d.fit;
    deck = deck.subtract(m.Manifold.union(cabinPegs(d).map(([px, py]) => box(m, px - r, px + r, py - r, py + r, z - DECK_T - 1, z + 0.1))));
  }
  return deck;
}

// ------------------------------------------------------------------- cabin

/** The cabin's footprint on the top right gallery, at its back between the rails. */
function cabinBox(d: Derived) {
  const x0 = -d.gxi + 2;
  const x1 = d.cx - COLUMN / 2 - 1.5;
  const y1 = d.gy1 - 2.4;
  return { x0, x1, y0: y1 - CABIN_D, y1, z: d.levels[d.levels.length - 1]! };
}

function cabinPegs(d: Derived): [number, number][] {
  const b = cabinBox(d);
  return [[b.x0 + 3, b.y0 + 3], [b.x1 - 3, b.y1 - 3]];
}

function cabinGlassBand(m: M, d: Derived, inner: number, outer: number): CrossSection {
  const b = cabinBox(d);
  const plan = rect(m, b.x0, b.x1, b.y0, b.y1);
  return plan.offset(-inner, 'Miter').subtract(plan.offset(-outer, 'Miter')).intersect(rect(m, b.x0 - 2, b.x1 + 2, b.y0 - 2, b.y0 + CABIN_D * 0.7));
}

function cabinGlassZ(d: Derived): [number, number] {
  const b = cabinBox(d);
  return [b.z + CABIN_H * 0.42, b.z + CABIN_H - 3];
}

/**
 * The operator's cabin on the top right gallery: a box with a roof lip, glass
 * wrapped round its front and the front of its sides, a door at the side,
 * pegged into the deck. Prints upright.
 */
export function buildCabin(m: M, d: Derived): Manifold {
  const b = cabinBox(d);
  const top = b.z + CABIN_H;
  const parts: Manifold[] = [
    box(m, b.x0, b.x1, b.y0, b.y1, b.z, top),
    slab(m, rect(m, b.x0, b.x1, b.y0, b.y1).offset(0.8, 'Miter'), top - 1.2, top),
    cylinder(m, 1, b.x1 - 3, b.y1 - 3, top - 0.1, top + 1.6),
  ];
  const r = PEG / 2;
  for (const [px, py] of cabinPegs(d)) parts.push(box(m, px - r, px + r, py - r, py + r, b.z - DECK_T + 0.3, b.z + 0.2));
  const [gz0, gz1] = cabinGlassZ(d);
  let cab = m.Manifold.union(parts).subtract(m.Manifold.union([
    slab(m, cabinGlassBand(m, d, -1, 1.6), gz0, gz1),
    // A door in the inner side, for the deck.
    box(m, b.x0 - 1, b.x0 + 0.6, b.y1 - 12, b.y1 - 4, b.z + 0.6, b.z + CABIN_H * 0.8),
  ]));
  // Pillars at the front corners over the glass.
  const posts = m.CrossSection.union([
    rect(m, b.x0 - 1, b.x0 + 2, b.y0 - 1, b.y0 + 2),
    rect(m, b.x1 - 2, b.x1 + 1, b.y0 - 1, b.y0 + 2),
  ]);
  cab = m.Manifold.union([cab, slab(m, cabinGlassBand(m, d, 0, 0.6).intersect(posts), gz0 - 0.1, gz1 + 0.1)]);
  return cab;
}

export function buildCabinGlass(m: M, d: Derived): Manifold {
  const [gz0, gz1] = cabinGlassZ(d);
  return slab(m, cabinGlassBand(m, d, 0.6, 1.6), gz0, gz1);
}

// --------------------------------------------------------------- top frame

/** The hanger bar under the cross truss the claw hooks over, and where it is. */
/**
 * The hoist trolley on the cross truss: a saddle over its top chord with a
 * cheek down each face of it, and a pin across between the cheeks under the
 * bottom chord, which keeps it on and which the claw's hook hangs from. The
 * truss is no wider than its chords, so nothing on it is in the cheeks' way
 * and the trolley slides from one side truss to the other.
 *
 * `x` is where it is built; `travel` how far it can slide either way from
 * the middle before its cheeks meet the side trusses.
 */
export function trolley(d: Derived) {
  const z0 = d.columnTop;
  const z1 = z0 + TRUSS_D;
  const g = d.c;
  const half = TRUSS_W / 2;
  const cheekT = 1.6;
  const pinD = d.printedPins ? 2 : 1.75;
  const len = TROLLEY_L;
  return {
    x: 0,
    len,
    z0, z1,
    /** The cheeks' inner and outer faces, either side of the truss. */
    yIn: half + g,
    yOut: half + g + cheekT,
    /** The pin, under the bottom chord, low enough for the hook's top to clear it. */
    pinZ: z0 - 3.2,
    pinD,
    pinHole: pinD + 2 * g,
    bottom: z0 - 5.4,
    travel: d.cx - TRUSS_W / 2 - len / 2 - 1,
  };
}

export function clawSpec(d: Derived, drop: number): ClawSpec {
  const t = trolley(d);
  return { barX: t.x, barZ: t.pinZ, barW: t.pinD, barH: t.pinD, y: d.kitY, drop, c: d.c, pinD: d.printedPins ? 1.6 : 1.75 };
}

/**
 * The trolley: the saddle and its two cheeks, a hoist housing on top with a
 * drum on its side, and the hole across the cheeks for the pin. Prints upside
 * down, the housing on the bed and the cheeks standing up off it.
 */
export function buildTrolley(m: M, d: Derived): Manifold {
  const t = trolley(d);
  const y = d.kitY;
  const x0 = t.x - t.len / 2;
  const x1 = t.x + t.len / 2;
  const top = t.z1 + 1.6;
  const parts: Manifold[] = [
    box(m, x0, x1, y - t.yOut, y + t.yOut, t.z1, top),
    // The hoist housing: the full footprint of the saddle, so it is the bed.
    box(m, x0, x1, y - t.yOut, y + t.yOut, top - 0.1, top + 5),
    box(m, x0 - 0.8, x1 + 0.8, y - t.yOut - 0.6, y + t.yOut + 0.6, top + 3.6, top + 5),
    box(m, x0, x1, y - t.yOut, y - t.yIn, t.bottom, t.z1 + 0.1),
    box(m, x0, x1, y + t.yIn, y + t.yOut, t.bottom, t.z1 + 0.1),
  ];
  let solid = m.Manifold.union(parts);
  const r = t.pinHole / 2;
  solid = solid.subtract(cylinderY(m, r, t.x, t.pinZ, y - t.yOut - 1, y + t.yOut + 1));
  // Vent slots across the housing.
  for (let k = -1; k <= 1; k++) solid = solid.subtract(box(m, t.x + k * 2.2 - 0.4, t.x + k * 2.2 + 0.4, y - t.yOut - 1, y - t.yOut + 0.5, top + 0.8, top + 3));
  return solid;
}

/** The trolley's pin, across its cheeks under the truss, head on the far side. */
export function buildTrolleyPin(m: M, d: Derived): Manifold {
  const t = trolley(d);
  const y0 = d.kitY - t.yOut;
  const y1 = d.kitY + t.yOut;
  const r = t.pinD / 2;
  return m.Manifold.union([
    cylinderY(m, r, t.x, t.pinZ, y0, y1 + 0.1),
    cylinderY(m, r + 0.9, t.x, t.pinZ, y1, y1 + 1),
  ]);
}

/**
 * The top frame: trusses along all four sides over the columns, a cross
 * truss over the kit, a hanger under it for the claw, a hoist block on it,
 * and pegs down into the columns' tops. Prints upside down: the trusses'
 * top chords flat on the bed, the hanger and the pegs standing up.
 */
export function buildTopFrame(m: M, d: Derived): Manifold {
  const z0 = d.columnTop;
  const w = TRUSS_W / 2;
  const xA = -d.cx - COLUMN / 2;
  const xB = d.cx + COLUMN / 2;
  const parts: Manifold[] = [
    trussAlongX(m, xA, xB, d.cyF - w, d.cyF + w, z0, TRUSS_D),
    trussAlongX(m, xA, xB, d.cyB - w, d.cyB + w, z0, TRUSS_D),
    trussAlongY(m, d.cyF - COLUMN / 2, d.cyB + COLUMN / 2, -d.cx - w, -d.cx + w, z0, TRUSS_D),
    trussAlongY(m, d.cyF - COLUMN / 2, d.cyB + COLUMN / 2, d.cx - w, d.cx + w, z0, TRUSS_D),
    trussAlongX(m, xA, xB, d.kitY - w, d.kitY + w, z0, TRUSS_D),
  ];
  // Caps over the columns.
  for (const [x, y] of columns(d)) parts.push(box(m, x - COLUMN / 2, x + COLUMN / 2, y - COLUMN / 2, y + COLUMN / 2, z0, z0 + 2));
  const r = PEG / 2;
  for (const [x, y] of columns(d)) parts.push(box(m, x - r, x + r, y - r, y + r, z0 - PEG_L, z0 + 0.2));
  if (d.backFrame) {
    const b = backFrameAt(d);
    const s = PEG / 2 + d.fit;
    return m.Manifold.union(parts).subtract(m.Manifold.union([-b.x * 0.5, b.x * 0.5].map((x) => box(m, x - s, x + s, d.cyB - s, d.cyB + s, z0 - 0.1, z0 + PEG_L + 0.3))));
  }
  return m.Manifold.union(parts);
}

// -------------------------------------------------------------- back frame

/**
 * The back frame between the galleries: a border, a spine up the middle,
 * bands across and an X in each bay, standing in the base and pegged up
 * into the top frame's back truss. Prints flat.
 */
export function buildBackFrame(m: M, d: Derived): Manifold {
  const b = backFrameAt(d);
  const x0 = -b.x;
  const x1 = b.x;
  const z0 = d.baseH - d.slotD;
  const z1 = d.columnTop - 0.2;
  const solid = rect(m, x0, x1, z0, z1);
  const n = Math.max(2, Math.round((z1 - d.baseH) / 40));
  const zs = Array.from({ length: n + 1 }, (_, k) => d.baseH + (k * (z1 - 3 - d.baseH)) / n);
  const windows: CrossSection[] = [];
  const braces: CrossSection[] = [];
  for (const [a, c] of [[x0 + 3, -3], [3, x1 - 3]] as const) {
    for (let k = 0; k + 1 < zs.length; k++) {
      const lo = zs[k]! + 1.2;
      const hi = zs[k + 1]! - 1.2;
      if (hi - lo < 6 || c - a < 6) continue;
      windows.push(rect(m, a, c, lo, hi));
      braces.push(bar(m, [a, lo], [c, hi], 1.6), bar(m, [a, hi], [c, lo], 1.6));
    }
  }
  const lattice = windows.length > 0 ? solid.subtract(m.CrossSection.union(windows).subtract(m.CrossSection.union(braces))) : solid;
  const r = PEG / 2;
  return m.Manifold.union([
    slabXZ(m, lattice, b.y0, b.y1),
    ...[-b.x * 0.5, b.x * 0.5].map((x) => box(m, x - r, x + r, d.cyB - r, d.cyB + r, z1 - 0.2, z1 + PEG_L)),
  ]);
}

export { FRONT_STRIP };
