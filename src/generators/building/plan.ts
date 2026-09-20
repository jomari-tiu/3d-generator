import { rng, type Derived } from './geometry';

/**
 * The floor plan: rooms, the partitions between them, and the doors through
 * those partitions.
 *
 * Pure arithmetic on rectangles -- no kernel calls at all -- so the plan can be
 * asserted on directly in tests, and so the expensive part (turning it into
 * solids) never has to reason about layout.
 *
 * ONE plan serves every storey. That is not a shortcut: in a real building the
 * structure lines up floor to floor, the stair lands in the same place each
 * time, and a plan that reshuffled per level would put the stairwell somewhere
 * new on every slab. The ground floor is allowed to differ in exactly one way
 * -- it can be an open lobby -- and that is a flag, not a second plan.
 *
 * Coordinates are model millimetres, centred on the origin, matching the solids
 * they become. The front of the building faces -Y.
 */

/** A clear floor area. Walls are OUTSIDE these bounds, never inside them. */
export interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/**
 * A partition centreline. `horizontal` means it runs along X at y = `at`,
 * spanning x in [from, to]; otherwise it runs along Y at x = `at`.
 */
export interface Wall {
  readonly horizontal: boolean;
  readonly at: number;
  readonly from: number;
  readonly to: number;
}

/** An opening in a wall of the same orientation, centred at `pos` along it. */
export interface Door {
  readonly horizontal: boolean;
  readonly at: number;
  readonly pos: number;
  readonly width: number;
}

export interface Plan {
  readonly rooms: readonly Rect[];
  readonly walls: readonly Wall[];
  readonly doors: readonly Door[];
  /** The stair/lift shaft, as a clear area. Null when there is no core. */
  readonly core: Rect | null;
  /** Reasons the plan is not what was asked for, in plain words. */
  readonly notes: readonly string[];
}

export const area = (r: Rect): number => Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);
export const width = (r: Rect): number => r.x1 - r.x0;
export const depth = (r: Rect): number => r.y1 - r.y0;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * How far a door must stay from the end of its wall.
 *
 * A doorway that runs out to the corner leaves no jamb, and a jamb thinner than
 * the wall itself is a sliver the slicer will skip -- the opening then reads as
 * a missing corner rather than a door.
 */
function jamb(d: Derived): number {
  return Math.max(d.partT * 1.5, d.perFt * 0.5);
}

/**
 * Place a door in a wall spanning [from, to], as near `want` as the jambs allow.
 * Returns null when the wall is too short to hold one at all.
 */
function door(d: Derived, w: Wall, want: number, widthMm = d.doorW): Door | null {
  const j = jamb(d);
  const span = w.to - w.from;
  const opening = Math.min(widthMm, span - 2 * j);
  if (opening < Math.max(2 * d.minWall, d.perFt)) return null;
  const lo = w.from + j + opening / 2;
  const hi = w.to - j - opening / 2;
  return { horizontal: w.horizontal, at: w.at, pos: clamp(want, lo, hi), width: opening };
}

/**
 * Split one rect in two across its longer dimension, emitting the partition and
 * a door through it. Returns null when neither half could meet the minimum room
 * size, which is the signal to stop subdividing that leaf.
 */
function split(
  d: Derived,
  r: Rect,
  rnd: () => number,
  walls: Wall[],
  doors: Door[],
): [Rect, Rect] | null {
  const horizontal = depth(r) >= width(r);
  const min = horizontal ? r.y0 : r.x0;
  const max = horizontal ? r.y1 : r.x1;

  // Each half needs minRoom of CLEAR space, and the wall eats partT between
  // them -- so the cut has to land at least minRoom + partT/2 from either end.
  const lo = min + d.minRoom + d.partT / 2;
  const hi = max - d.minRoom - d.partT / 2;
  if (hi < lo) return null;

  // Jitter about the middle rather than anywhere in [lo, hi]: a uniform draw
  // produces long thin slivers next to the walls often enough to be noticed,
  // and rooms in a real building are not distributed that way.
  const mid = (min + max) / 2;
  const at = clamp(mid + (rnd() - 0.5) * (hi - lo) * 0.6, lo, hi);

  const wall: Wall = horizontal
    ? { horizontal: true, at, from: r.x0, to: r.x1 }
    : { horizontal: false, at, from: r.y0, to: r.y1 };
  walls.push(wall);

  const acrossMid = horizontal ? (r.x0 + r.x1) / 2 : (r.y0 + r.y1) / 2;
  const acrossSpan = horizontal ? width(r) : depth(r);
  const doorAt = door(d, wall, acrossMid + (rnd() - 0.5) * acrossSpan * 0.4);
  if (doorAt) doors.push(doorAt);

  const a: Rect = horizontal
    ? { ...r, y1: at - d.partT / 2 }
    : { ...r, x1: at - d.partT / 2 };
  const b: Rect = horizontal
    ? { ...r, y0: at + d.partT / 2 }
    : { ...r, x0: at + d.partT / 2 };
  return [a, b];
}

/** Subdivide the given leaves until there are `target` rooms, or nothing splits. */
function subdivide(
  d: Derived,
  leaves: Rect[],
  target: number,
  rnd: () => number,
  walls: Wall[],
  doors: Door[],
): Rect[] {
  const out = [...leaves];
  // A hard iteration cap as well as the count test: split() refusing is the
  // normal exit, but a bug that returned a zero-area pair would otherwise spin.
  for (let guard = 0; out.length < target && guard < 256; guard++) {
    // Always cut the biggest room next. Splitting in arrival order instead
    // leaves one huge room beside a cluster of cupboards.
    const order = [...out].sort((p, q) => area(q) - area(p));
    let done = false;
    for (const leaf of order) {
      const pair = split(d, leaf, rnd, walls, doors);
      if (!pair) continue;
      out.splice(out.indexOf(leaf), 1, pair[0], pair[1]);
      done = true;
      break;
    }
    if (!done) break;
  }
  return out;
}

/** The core as a clear rect, centred, shrunk until every side still has a room. */
function centredCore(d: Derived, interior: Rect): Rect | null {
  const maxW = width(interior) - 2 * (d.minRoom + d.partT);
  const maxD = depth(interior) - 2 * (d.minRoom + d.partT);
  const w = Math.min(d.coreW, maxW);
  const h = Math.min(d.coreD, maxD);
  // Below about 3 ft square a shaft is not a stair, a lift or a duct -- it is
  // a hole too small to print cleanly and too small to mean anything.
  const floor = d.perFt * 3;
  if (w < floor || h < floor) return null;
  return { x0: -w / 2, y0: -h / 2, x1: w / 2, y1: h / 2 };
}

/**
 * Walls that enclose the core and nothing else, for an otherwise open floor.
 */
function coreEnclosure(d: Derived, c: Rect, walls: Wall[], doors: Door[]): void {
  const half = d.partT / 2;
  const wl = c.x0 - half;
  const wr = c.x1 + half;
  const wb = c.y0 - half;
  const wt = c.y1 + half;
  const segs: Wall[] = [
    { horizontal: false, at: wl, from: wb, to: wt },
    { horizontal: false, at: wr, from: wb, to: wt },
    { horizontal: true, at: wb, from: wl, to: wr },
    { horizontal: true, at: wt, from: wl, to: wr },
  ];
  walls.push(...segs);
  // One way in, on the front face of the shaft, which is the one you can see.
  const front = door(d, segs[2]!, (c.x0 + c.x1) / 2);
  if (front) doors.push(front);
}

/**
 * Pinwheel the floor plate around a central core.
 *
 * Four cuts, and the areas they leave are exactly four rectangles that tile the
 * plate around the shaft -- the classic pinwheel. The same four cuts also
 * happen to enclose the core on all four sides, so the shaft needs no walls of
 * its own. Trying instead to subtract a hole from the middle of a rectangle and
 * subdivide what is left would mean handling non-rectangular leaves, which is a
 * far bigger problem for no gain.
 */
function pinwheel(d: Derived, interior: Rect, c: Rect, walls: Wall[], doors: Door[]): Rect[] {
  const half = d.partT / 2;
  const wl = c.x0 - half;
  const wr = c.x1 + half;
  const wb = c.y0 - half;
  const wt = c.y1 + half;

  const left: Wall = { horizontal: false, at: wl, from: interior.y0, to: interior.y1 };
  const top: Wall = { horizontal: true, at: wt, from: wl, to: interior.x1 };
  const right: Wall = { horizontal: false, at: wr, from: interior.y0, to: wt };
  const bottom: Wall = { horizontal: true, at: wb, from: wl, to: wr };
  walls.push(left, top, right, bottom);

  const a: Rect = { x0: interior.x0, y0: interior.y0, x1: wl - half, y1: interior.y1 };
  const b: Rect = { x0: wl + half, y0: wt + half, x1: interior.x1, y1: interior.y1 };
  const e: Rect = { x0: wr + half, y0: interior.y0, x1: interior.x1, y1: wt - half };
  const f: Rect = { x0: wl + half, y0: interior.y0, x1: wr - half, y1: wb - half };

  // Circulation: a ring through all four quadrants, and the core opening onto
  // the strip in front of it. Without this the rooms are sealed boxes and the
  // model reads as a grid of cells rather than a floor you could walk.
  const ring = [
    door(d, left, (f.y0 + f.y1) / 2),
    door(d, left, (b.y0 + b.y1) / 2),
    door(d, top, (e.x0 + e.x1) / 2),
    door(d, right, (f.y0 + f.y1) / 2),
    door(d, bottom, (c.x0 + c.x1) / 2),
  ];
  for (const one of ring) if (one) doors.push(one);

  return [a, b, e, f].filter((r) => width(r) > 0 && depth(r) > 0);
}

/**
 * Double-loaded corridor: a spine down the long axis with a row of rooms each
 * side, and the stair core closing one end of it. The plan type most people
 * picture when they hear "floor plan", and the one that makes a section read.
 */
function corridorPlan(d: Derived, interior: Rect, rnd: () => number): Plan {
  const walls: Wall[] = [];
  const doors: Door[] = [];
  const notes: string[] = [];
  const half = d.partT / 2;
  // Run the corridor down whichever way the building is longer.
  const alongX = width(interior) >= depth(interior);

  // Work in corridor-local terms -- u runs along the spine, v across it -- and
  // map back at the end. Doing it twice, once per orientation, is how the two
  // halves of this drift apart.
  const u0 = alongX ? interior.x0 : interior.y0;
  const u1 = alongX ? interior.x1 : interior.y1;
  const v0 = alongX ? interior.y0 : interior.x0;
  const v1 = alongX ? interior.y1 : interior.x1;

  const corridorHalf = Math.min(d.corridorW, (v1 - v0) - 2 * (d.minRoom + d.partT)) / 2;
  if (corridorHalf <= 0) {
    notes.push('There is no room for a corridor and rooms either side, so the floor is open.');
    return { rooms: [interior], walls, doors, core: null, notes };
  }

  const mkWall = (at: number, from: number, to: number, across: boolean): Wall =>
    // `across` means the wall cuts ACROSS the corridor -- so it runs along v.
    across === alongX
      ? { horizontal: false, at, from, to }
      : { horizontal: true, at, from, to };

  const sideWallV = [-(corridorHalf + half), corridorHalf + half];

  // The core takes the far end of the spine, spanning the corridor's width.
  let core: Rect | null = null;
  let uEnd = u1;
  if (d.core) {
    const len = Math.min(d.coreD, (u1 - u0) - 2 * d.minRoom);
    if (len >= d.perFt * 3 && corridorHalf * 2 >= d.perFt * 3) {
      uEnd = u1 - len - d.partT;
      core = alongX
        ? { x0: u1 - len, y0: -corridorHalf, x1: u1, y1: corridorHalf }
        : { x0: -corridorHalf, y0: u1 - len, x1: corridorHalf, y1: u1 };
      const endWall = mkWall(uEnd + half, -corridorHalf - half, corridorHalf + half, true);
      walls.push(endWall);
      const through = door(d, endWall, 0);
      if (through) doors.push(through);
    } else {
      notes.push(
        'The corridor is too tight for a stair core at its end, so the core has been left out.',
      );
    }
  }

  // The two corridor walls, stopping at the core end wall.
  const sideWalls = sideWallV.map((v) => mkWall(v, u0, uEnd, false));
  walls.push(...sideWalls);

  // One row of rooms each side. Rooms per side is split by the room budget,
  // then capped by how many actually fit at the minimum room size.
  const run = uEnd - u0;
  const perSide = Math.max(1, Math.round(d.roomCount / 2));
  const fits = Math.max(1, Math.floor((run + d.partT) / (d.minRoom + d.partT)));
  const n = Math.min(perSide, fits);
  if (n < perSide) {
    notes.push(
      `Only ${n} rooms fit along each side at a ${d.minRoomFt} ft minimum, not ${perSide}.`,
    );
  }

  const rooms: Rect[] = [];
  for (const [side, vWall] of sideWallV.entries()) {
    const outer = side === 0 ? v0 : v1;
    const inner = vWall + (side === 0 ? -half : half);
    const [vLo, vHi] = side === 0 ? [outer, inner] : [inner, outer];

    let cursor = u0;
    for (let i = 0; i < n; i++) {
      // Jitter the party walls, but keep the last room ending exactly at uEnd.
      const even = u0 + ((i + 1) * run) / n;
      const at =
        i === n - 1
          ? uEnd
          : clamp(
              even + (rnd() - 0.5) * (run / n) * 0.35,
              cursor + d.minRoom + half,
              uEnd - (n - 1 - i) * (d.minRoom + d.partT) - half,
            );

      const uHi = i === n - 1 ? uEnd : at - half;
      rooms.push(
        alongX
          ? { x0: cursor, y0: vLo, x1: uHi, y1: vHi }
          : { x0: vLo, y0: cursor, x1: vHi, y1: uHi },
      );

      // Party wall between this room and the next, across the strip.
      if (i < n - 1) {
        walls.push(mkWall(at, vLo - d.partT, vHi + d.partT, true));
        cursor = at + half;
      }
    }

    // Every room opens onto the corridor. That is the whole point of a corridor.
    for (const r of rooms.slice(-n)) {
      const centre = alongX ? (r.x0 + r.x1) / 2 : (r.y0 + r.y1) / 2;
      const onto = door(d, sideWalls[side]!, centre);
      if (onto) doors.push(onto);
    }
  }

  // The corridor itself is a room -- it is floor you can stand on, and leaving
  // it out of the list would understate the floor area in every readout.
  rooms.push(
    alongX
      ? { x0: u0, y0: -corridorHalf, x1: uEnd, y1: corridorHalf }
      : { x0: -corridorHalf, y0: u0, x1: corridorHalf, y1: uEnd },
  );

  return {
    rooms: rooms.filter((r) => width(r) > 0 && depth(r) > 0),
    walls,
    doors,
    core,
    notes,
  };
}

/** Strip a plan back to a lobby: its core, its enclosure, and open floor. */
function lobby(d: Derived, interior: Rect, core: Rect | null, notes: readonly string[]): Plan {
  const walls: Wall[] = [];
  const doors: Door[] = [];
  if (core) coreEnclosure(d, core, walls, doors);
  return { rooms: [interior], walls, doors, core, notes: [...notes] };
}

/**
 * Build the plan for one storey.
 *
 * `openPlan` forces the lobby treatment: everything goes except the core and
 * its enclosure, because the stair still has to land somewhere.
 *
 * Note how the lobby gets its core: from the FULL plan for this building, not
 * from a fresh calculation. A corridor plan parks its core at the end of the
 * spine and an open one centres it, so deriving the lobby's core independently
 * would put the ground-floor shaft somewhere the stair above it does not come
 * down -- a stairwell that misses its own hole, on the one floor nobody would
 * think to check.
 */
export function makePlan(d: Derived, openPlan = false): Plan {
  const interior: Rect = {
    x0: -d.innerW / 2,
    y0: -d.innerD / 2,
    x1: d.innerW / 2,
    y1: d.innerD / 2,
  };
  const walls: Wall[] = [];
  const doors: Door[] = [];
  const notes: string[] = [];
  const rnd = rng(d.seed);

  if (d.layout === 'corridor') {
    const full = corridorPlan(d, interior, rnd);
    return openPlan ? lobby(d, interior, full.core, full.notes) : full;
  }

  let core: Rect | null = null;
  if (d.core) {
    core = centredCore(d, interior);
    if (!core) {
      notes.push(
        'The core would leave no usable floor around it at this footprint, so it has been left out.',
      );
    }
  }

  if (openPlan || d.layout === 'open') return lobby(d, interior, core, notes);

  const leaves = core ? pinwheel(d, interior, core, walls, doors) : [interior];
  const rooms = subdivide(d, leaves, d.roomCount, rnd, walls, doors);
  if (rooms.length < d.roomCount) {
    notes.push(
      `Only ${rooms.length} rooms fit at a ${d.minRoomFt} ft minimum, not the ${d.roomCount} asked for.`,
    );
  }
  return { rooms, walls, doors, core, notes };
}
