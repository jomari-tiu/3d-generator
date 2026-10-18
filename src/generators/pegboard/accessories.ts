import type { CrossSection, Manifold } from 'manifold-3d';
import { filletProfile, roundedRect } from '../../core/kernel/primitives';
import { box, cylinder, polygon, rect, slab, slabXZ, slabYZ, type M } from '../shared/solid';
import { PEG_FIT, type Derived } from './geometry';

/*
 * Every accessory is modelled in its own frame:
 *
 *   y = 0 is the board's front face; the accessory stands at y < 0 and its
 *   pegs reach +y through the board
 *   z = 0 is the centre of its top row of holes
 *   x = 0 is the centre of its group of peg columns
 *
 * and is printed exactly as it hangs. Everything that sticks out from the
 * back plate starts at the plate's foot, so each one stands on the bed with
 * nothing in the air: arms and floors lie on the plate, walls and tips rise
 * off them, and the pegs are teardrops with their point down.
 */

/** How an accessory meets the board: which columns carry pegs, and how many rows below the top the lower pegs sit. */
export interface Mounting {
  readonly pegXs: readonly number[];
  readonly stubRow: number;
}

export interface Accessory {
  readonly body: Manifold;
  readonly mounting: Mounting;
}

/** Back plate thickness. */
const plateT = (d: Derived) => Math.max(3, d.accWall);
/** Top of every back plate, above the top peg. */
const plateTop = (d: Derived) => d.pinR + 4;
/** Lowest z a body may start at and still leave room for its lower pegs. */
const footFor = (d: Derived, stubRow: number) => -stubRow * d.pz - d.pinR - 4;

/**
 * A teardrop in a plane: a circle with a 45 degree point toward `down`,
 * flattened where it would leave the circle's own radius, so a peg still
 * passes through a round hole.
 */
export function teardrop(m: M, r: number, down: readonly [number, number]): CrossSection {
  const k = Math.SQRT2 - 1;
  const [dx, dy] = down;
  // The flat at the tip, perpendicular to `down`.
  const px = -dy;
  const py = dx;
  const flat = polygon(m, [
    [dx * r + px * k * r, dy * r + py * k * r],
    [dx * r - px * k * r, dy * r - py * k * r],
    [dx * (r - 0.01) - px * k * r, dy * (r - 0.01) - py * k * r],
    [dx * (r - 0.01) + px * k * r, dy * (r - 0.01) + py * k * r],
  ]);
  return m.CrossSection.hull([m.CrossSection.circle(r, 32), flat]);
}

/**
 * One hook peg, at x = 0: a shank resting on the bottom of the hole, then a
 * bend of constant section rising behind the board, ending in a round tip.
 *
 * The constant section is the whole point. To hang the accessory you tilt
 * its front up, feed the tip in, and swing it down: the bend follows its own
 * curve through the hole. A sharp corner cannot, however it is turned.
 */
function hookPeg(m: M, d: Derived): Manifold {
  const r = d.pinR;
  const yBend = d.pt + d.clear;
  const shank = slabXZ(m, teardrop(m, r, [0, -1]).translate([0, d.pegZ]), -1, yBend + 0.01);
  // Revolved about z, starting along +x; turned so the start points down
  // (-z) from the bend centre and sweeps toward +y. The section's point
  // faces outward, which is down where the bend leaves the shank.
  const bend = m.Manifold.revolve(teardrop(m, r, [1, 0]).translate([d.bendR, 0]), 48, PEG_FIT.sweep)
    .rotate([0, 90, 0])
    .translate([0, yBend, d.pegZ + d.bendR]);
  const a = (PEG_FIT.sweep * Math.PI) / 180;
  const tip = m.Manifold.sphere(r, 32).translate([0, yBend + d.bendR * Math.sin(a), d.pegZ + d.bendR * (1 - Math.cos(a))]);
  return m.Manifold.union([shank, bend, tip]);
}

/** Pegs in the accessory frame: hook pegs along the top row, plain stubs `stubRow` rows down. */
export function pegs(m: M, d: Derived, mounting: Mounting): Manifold {
  const hook = hookPeg(m, d);
  // Stub: into the hole and no further, to stop the accessory swinging.
  const stub = slabXZ(m, teardrop(m, d.pinR, [0, -1]).translate([0, d.pegZ - mounting.stubRow * d.pz]), -1, d.land * 0.85);
  return m.Manifold.union(mounting.pegXs.flatMap((x) => [hook.translate([x, 0, 0]), stub.translate([x, 0, 0])]));
}

/**
 * Peg columns across a plate `w` wide, centred, at least one. With `centreOn`
 * (the board's column count) the count is kept to the same parity, so the
 * group -- and the plate centred on it -- can sit dead centre on the board.
 */
export function pegColumns(d: Derived, w: number, max = Infinity, centreOn?: number): number[] {
  let n = Math.max(1, Math.min(max, Math.floor((w - 2 * (d.pinR + 3)) / d.px + 1e-9) + 1));
  if (centreOn !== undefined && n > 1 && (centreOn - n) % 2 !== 0) n--;
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * d.px);
}

/** The plate an accessory hangs from, x0..x1 across, z0 up to plateTop. */
function backPlate(m: M, d: Derived, x0: number, x1: number, z0: number): Manifold {
  const top = plateTop(d);
  const sec = roundedRect(m, x1 - x0, top - z0, Math.min(3, (x1 - x0) / 2 - 0.1)).translate([(x0 + x1) / 2, (top + z0) / 2]);
  return slabXZ(m, sec, -plateT(d), 0);
}

/** Lowest stub row a body reaching down to z0 can carry, at least the next row down. */
function stubRowFor(d: Derived, z0: number): number {
  return Math.max(1, Math.floor((-z0 - d.pinR - 4) / d.pz + 1e-9));
}

// --------------------------------------------------------------------- hooks

export type HookStyle = 'j' | 'double' | 'u' | 'peg';

/**
 * A hook's side profile in (y, z): the arm lying along the foot, whatever rises
 * off it, and a gusset into the back plate. Fillets in 2D, since that is the
 * only place this kernel has them.
 */
function hookProfile(m: M, bt: number, z0: number, L: number, t: number, style: HookStyle, tipScale = 1): CrossSection {
  const tip = (at: number, h: number) =>
    m.CrossSection.union([
      rect(m, -at, -at + t, z0, z0 + t + h),
      m.CrossSection.circle(t / 2, 24).translate([-at + t / 2, z0 + t + h]),
    ]);
  const pieces: CrossSection[] = [rect(m, -L, -bt + 0.01, z0, z0 + t)];
  const rise = Math.min(Math.max(6, 0.35 * L), 22) * tipScale;
  switch (style) {
    case 'j':
      pieces.push(tip(L, rise));
      break;
    case 'double':
      pieces.push(tip(L, rise), tip(L / 2 + t / 2, rise * 0.55));
      break;
    case 'u':
      pieces.push(tip(L, Math.max(rise, 0.75 * L)));
      break;
    case 'peg':
      pieces.push(m.CrossSection.circle(t * 0.75, 24).translate([-L + t * 0.75, z0 + t * 0.75]));
      break;
  }
  const gs = Math.min(0.3 * L, 14);
  pieces.push(polygon(m, [[-bt + 0.01, z0 + t - 0.01], [-bt - gs, z0 + t - 0.01], [-bt + 0.01, z0 + t + 1.2 * gs]]));
  return filletProfile(m.CrossSection.union(pieces), 2);
}

/** Swing an arm about the upright through the front of the back plate. */
const swing = (s: Manifold, bt: number, deg: number) => (deg === 0 ? s : s.translate([0, bt, 0]).rotate([0, 0, deg]).translate([0, -bt, 0]));

export function buildHook(m: M, d: Derived, o: { style: HookStyle; length: number; width: number; turn: number }): Accessory {
  const bt = plateT(d);
  const stubRow = 1;
  const z0 = footFor(d, stubRow);
  const t = Math.max(4, d.accWall + 1.2);
  const w = Math.max(o.width, 2 * d.pinR + 4);
  const arm = slabYZ(m, hookProfile(m, bt, z0, o.length + bt, t, o.style), -w / 2, w / 2);
  const mounting: Mounting = { pegXs: [0], stubRow };
  return {
    body: m.Manifold.union([backPlate(m, d, -w / 2, w / 2, z0), swing(arm, bt, o.turn), pegs(m, d, mounting)]),
    mounting,
  };
}

export function buildHeadphone(m: M, d: Derived, o: { length: number; width: number; turn: number }): Accessory {
  const bt = plateT(d);
  const stubRow = 1;
  const z0 = footFor(d, stubRow);
  const t = Math.max(6, d.accWall + 2);
  const L = o.length + bt;
  // A deeper arm at the root, where the headphones' weight bends it most, and
  // a tall round-topped tip so the band cannot slide off.
  const profile = filletProfile(
    m.CrossSection.union([
      polygon(m, [[-bt + 0.01, z0], [-L, z0], [-L, z0 + t], [-bt + 0.01, z0 + t + 8]]),
      rect(m, -L, -L + t + 2, z0, z0 + t + 14),
      m.CrossSection.circle((t + 2) / 2, 32).translate([-L + (t + 2) / 2, z0 + t + 14]),
      polygon(m, [[-bt + 0.01, z0 + 1], [-bt - 20, z0 + 1], [-bt + 0.01, z0 + 30]]),
    ]),
    3,
  );
  const arm = slabYZ(m, profile, -o.width / 2, o.width / 2);
  const mounting: Mounting = { pegXs: pegColumns(d, o.width, 2), stubRow };
  return {
    body: m.Manifold.union([
      backPlate(m, d, -o.width / 2, o.width / 2, z0),
      swing(arm, bt, o.turn),
      pegs(m, d, mounting),
    ]),
    mounting,
  };
}

export function buildController(m: M, d: Derived, o: { span: number; reach: number; armWidth: number }): Accessory {
  const bt = plateT(d);
  const stubRow = 1;
  const z0 = footFor(d, stubRow);
  const t = Math.max(5, d.accWall + 1.6);
  const L = o.reach + bt;
  const profile = filletProfile(
    m.CrossSection.union([
      polygon(m, [[-bt + 0.01, z0], [-L, z0], [-L, z0 + t], [-bt + 0.01, z0 + t + 5]]),
      rect(m, -L, -L + t, z0, z0 + t + 12),
      m.CrossSection.circle(t / 2, 24).translate([-L + t / 2, z0 + t + 12]),
      polygon(m, [[-bt + 0.01, z0 + 1], [-bt - 14, z0 + 1], [-bt + 0.01, z0 + 22]]),
    ]),
    2.5,
  );
  const half = o.span / 2;
  const arms = [-half, half].map((x) => slabYZ(m, profile, x - o.armWidth / 2, x + o.armWidth / 2));
  const x1 = half + o.armWidth / 2;
  const mounting: Mounting = { pegXs: pegColumns(d, 2 * x1), stubRow };
  return { body: m.Manifold.union([backPlate(m, d, -x1, x1, z0), ...arms, pegs(m, d, mounting)]), mounting };
}

// ---------------------------------------------------------------- containers

/**
 * A cup or pen pot: a round or square well against the plate, its rim level
 * with the plate top and its floor on the bed.
 */
export function buildContainer(
  m: M,
  d: Derived,
  o: { shape: 'round' | 'square'; inner: number; depth: number; bottom: 'closed' | 'drain' | 'ring' },
): Accessory {
  const bt = plateT(d);
  const w = d.accWall;
  const floor = Math.max(2, 4 * d.layer);
  const top = plateTop(d);
  const z0 = Math.min(top - o.depth - floor, footFor(d, 1));
  const outer = o.inner + 2 * w;
  const cy = -bt - outer / 2 + 0.01;
  const sec = (s: number) =>
    o.shape === 'round'
      ? m.CrossSection.circle(s / 2, 96).translate([0, cy])
      : roundedRect(m, s, s, Math.max(1, Math.min(6, s / 6))).translate([0, cy]);

  let well = slab(m, sec(outer), z0, top).subtract(slab(m, sec(o.inner), z0 + floor, top + 1));
  if (o.bottom === 'ring') {
    // A ledge round the inside instead of a floor: rinses straight through.
    well = well.subtract(slab(m, sec(Math.max(o.inner - 14, o.inner * 0.6)), z0 - 1, z0 + floor + 1));
  } else if (o.bottom === 'drain') {
    const holes: Manifold[] = [cylinder(m, 2.5, 0, cy, z0 - 1, z0 + floor + 1)];
    const ring = o.inner * 0.28;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      holes.push(cylinder(m, 2, ring * Math.cos(a), cy + ring * Math.sin(a), z0 - 1, z0 + floor + 1));
    }
    well = well.subtract(m.Manifold.union(holes));
  }

  const stubRow = stubRowFor(d, z0);
  const mounting: Mounting = { pegXs: pegColumns(d, outer), stubRow };
  return { body: m.Manifold.union([backPlate(m, d, -outer / 2, outer / 2, z0), well, pegs(m, d, mounting)]), mounting };
}

// -------------------------------------------------------------------- shelves

/** A floor out from the plate foot, a front lip, and side cheeks that slope down to it. */
export function buildShelf(m: M, d: Derived, o: { width: number; depth: number; lip: number; centred?: boolean }): Accessory {
  const bt = plateT(d);
  const stubRow = 1;
  const z0 = footFor(d, stubRow);
  const w = d.accWall;
  const floor = Math.max(2.4, w);
  const top = plateTop(d);
  const yF = -bt - o.depth;
  const half = o.width / 2;
  const lipTop = z0 + floor + o.lip;

  const cheek = polygon(m, [[-bt + 0.01, z0], [yF, z0], [yF, lipTop], [-bt + 0.01, Math.max(lipTop, top - 2)]]);
  const parts = [
    backPlate(m, d, -half, half, z0),
    box(m, -half, half, yF, -bt + 0.01, z0, z0 + floor),
    box(m, -half, half, yF, yF + w, z0, lipTop),
    slabYZ(m, cheek, -half, -half + w),
    slabYZ(m, cheek, half - w, half),
  ];
  // Round the front corners in plan.
  const plan = roundedRect(m, o.width, 20 - yF, Math.min(6, o.width / 4)).translate([0, (yF + 20) / 2]);
  const shelf = m.Manifold.union(parts).intersect(slab(m, plan, z0 - 1, top + 1));
  const mounting: Mounting = { pegXs: pegColumns(d, o.width, Infinity, o.centred ? d.cols.length : undefined), stubRow };
  return { body: shelf.add(pegs(m, d, mounting)), mounting };
}

export function buildCableHolder(m: M, d: Derived, o: { slots: number; diameter: number; reach: number }): Accessory {
  const bt = plateT(d);
  const stubRow = 1;
  const z0 = footFor(d, stubRow);
  const t = Math.max(4, d.accWall + 1);
  const pitch = o.diameter + Math.max(6, 2 * d.accWall);
  const width = o.slots * pitch + 2 * d.accWall;
  const half = width / 2;
  const yF = -bt - o.reach;
  const seat = o.diameter / 2 + d.clear;
  const seatY = yF + Math.max(o.reach * 0.55, seat + 3);
  const entry = Math.max(o.diameter * 0.72, 1.5);

  const plan = roundedRect(m, width, 10 - yF, 3)
    .translate([0, (yF + 10) / 2])
    .intersect(rect(m, -half, half, yF, 0.01));
  const cuts: CrossSection[] = [];
  for (let i = 0; i < o.slots; i++) {
    const x = (i - (o.slots - 1) / 2) * pitch;
    cuts.push(m.CrossSection.circle(seat, 32).translate([x, seatY]));
    cuts.push(rect(m, x - entry / 2, x + entry / 2, yF - 1, seatY));
    // A lead-in at the front edge, so the cable finds the slot.
    cuts.push(polygon(m, [[x - entry / 2 - 2, yF - 0.01], [x + entry / 2 + 2, yF - 0.01], [x + entry / 2, yF + 2], [x - entry / 2, yF + 2]]));
  }
  const comb = slab(m, plan.subtract(m.CrossSection.union(cuts)), z0, z0 + t);
  const cheek = polygon(m, [[-bt + 0.01, z0], [-bt - Math.min(14, o.reach * 0.6), z0], [-bt + 0.01, z0 + 18]]);
  const mounting: Mounting = { pegXs: pegColumns(d, width), stubRow };
  return {
    body: m.Manifold.union([
      backPlate(m, d, -half, half, z0),
      comb,
      slabYZ(m, cheek, -half, -half + d.accWall),
      slabYZ(m, cheek, half - d.accWall, half),
      pegs(m, d, mounting),
    ]),
    mounting,
  };
}

/**
 * A ledge with a lip, and a hollow wedge behind it that the phone leans on at
 * `angle` from horizontal. The wedge's underside leans 90 - angle from upright,
 * well inside what prints without support.
 */
export function buildPhoneStand(
  m: M,
  d: Derived,
  o: { width: number; thickness: number; angle: number; lip: number; cableSlot: boolean },
): Accessory {
  const bt = plateT(d);
  const stubRow = 2;
  const z0 = footFor(d, stubRow);
  const t = Math.max(4, d.accWall + 1.2);
  const top = plateTop(d);
  const zL = z0 + t;
  const rise = top - 2 - zL;
  const run = rise / Math.tan((o.angle * Math.PI) / 180);
  const yb = -bt - run;
  const slot = o.thickness + 1;
  const yF = yb - slot - t;
  const half = o.width / 2;

  const wedge = polygon(m, [[-bt + 0.01, z0], [yb, z0], [yb, zL], [-bt + 0.01, zL + rise]]);
  const hollow = wedge.offset(-t, 'Miter', 2);
  const ledge = m.CrossSection.union([
    rect(m, yF, yb + 0.01, z0, zL),
    rect(m, yF, yF + t, z0, zL + o.lip),
    m.CrossSection.circle(t / 2, 24).translate([yF + t / 2, zL + o.lip]),
  ]);
  const solid = slabYZ(m, filletProfile(m.CrossSection.union([wedge, ledge]), 1.5), -half, half);
  // Hollow between solid cheeks at each end and down the middle.
  const voids: Manifold[] = [];
  if (!hollow.isEmpty()) {
    const spans: [number, number][] =
      o.width > 60 ? [[-half + t, -t / 2], [t / 2, half - t]] : [[-half + t, half - t]];
    for (const [a, b] of spans) voids.push(slabYZ(m, hollow, a, b));
  }
  let body = m.Manifold.union([backPlate(m, d, -half, half, z0), solid]);
  if (voids.length) body = body.subtract(m.Manifold.union(voids));
  if (o.cableSlot) {
    const cw = Math.min(14, o.width / 4);
    body = body.subtract(box(m, -cw / 2, cw / 2, yF - 1, yb - 2, z0 - 1, zL + o.lip + 5));
  }
  const mounting: Mounting = { pegXs: pegColumns(d, o.width, 3), stubRow };
  return { body: body.add(pegs(m, d, mounting)), mounting };
}
