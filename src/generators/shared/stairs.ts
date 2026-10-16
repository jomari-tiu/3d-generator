import type { CrossSection, Manifold } from 'manifold-3d';
import { bar, box, polygon, rect, slabXZ, type M, type P2 } from './solid';

/**
 * A stair tower people could actually climb, at the scale of the kit's crew.
 *
 * Built like the real thing: a steel frame of posts with a railed landing at
 * every turn, and between the landings, separate open stairs -- two stringers,
 * treads between them, a handrail -- that switch back and forth in two lanes
 * side by side. The lanes are what make it usable: each flight runs under the
 * next-but-one in its own lane, a full storey up, rather than under the very
 * next one as a zig-zag in a single plane would put it, where a climber's
 * head meets the flight above.
 *
 * Everything is sized from real dimensions at the figure scale: an 18 cm
 * step, a 25 cm tread, a 90 cm flight, a 1 m railing, and at least 2 m of
 * headroom.
 */
export interface StairSpec {
  /** The tower's span across, and the y of its back. */
  readonly x0: number;
  readonly x1: number;
  readonly yBack: number;
  /** The floor it stands on, and how deep its sill sits in a slot there. */
  readonly zFloor: number;
  readonly sillDepth: number;
  /** Height of the top landing above the floor. */
  readonly height: number;
  /** Figure scale: 100 for 1/100, 144 for 1/144. */
  readonly scale: number;
  readonly fit: number;
  /** Start the first flight from the x1 end rather than x0. */
  readonly mirror?: boolean;
  /** Leave the back rail off the landings in this end bay, where something joins them from behind. */
  readonly openBackBay?: 'x0' | 'x1';
}

const POST = 1.4;
const DECK_T = 1.4;
const STRINGER = 1;
const TREAD_T = 0.7;
const RAIL = 1;
const LANE_GAP = 0.6;
const PEG = 1.2;
/** Height of the plate a flight's foot leaves on the landing it starts from. */
const THRESHOLD = 0.8;

/** Real sizes, in metres, scaled to model millimetres. */
function sizes(scale: number) {
  const k = 1000 / scale;
  return {
    step: 0.18 * k,
    tread: Math.max(1.6, 0.25 * k),
    lane: Math.max(6, 0.9 * k),
    railH: Math.max(6.5, 1.0 * k),
    headroom: 2.0 * k,
    person: 1.75 * k,
  };
}

export interface Flight {
  readonly index: number;
  /** Bottom and top end across; their heights; the lane's front and back y. */
  readonly sa: number;
  readonly sb: number;
  readonly za: number;
  readonly zb: number;
  readonly y0: number;
  readonly y1: number;
  /** Treads below the landing it climbs to, and their rise and going. */
  readonly steps: number;
  readonly rise: number;
  readonly going: number;
}

export interface Landing {
  readonly x0: number;
  readonly x1: number;
  readonly z: number;
}

export function stairLayout(s: StairSpec) {
  const z = sizes(s.scale);
  const bay = z.lane + 1;
  const run = s.x1 - s.x0 - 2 * bay;
  const steps = Math.max(2, Math.floor(run / z.tread));
  const going = run / steps;
  const flightRise = steps * z.step;
  const n = Math.max(1, Math.round(s.height / flightRise));
  const rise = s.height / (n * steps);
  // The frame's posts stand outside the two lanes, front and back, so the
  // flights' ends can rest on the landings without meeting them.
  const yA1 = s.yBack - POST;
  const yA0 = yA1 - z.lane;
  const yB1 = yA0 - LANE_GAP;
  const yB0 = yB1 - z.lane;
  const flights: Flight[] = [];
  const landings: Landing[] = [];
  for (let k = 0; k < n; k++) {
    const left = s.x0 + bay;
    const right = s.x1 - bay;
    const first = s.mirror ? 1 : 0;
    const [sa, sb] = k % 2 === first ? [left, right] : [right, left];
    const back = k % 2 === 0;
    flights.push({
      index: k, sa, sb,
      za: s.zFloor + k * steps * rise,
      zb: s.zFloor + (k + 1) * steps * rise,
      y0: back ? yA0 : yB0,
      y1: back ? yA1 : yB1,
      steps, rise, going,
    });
    // Every landing, the top one too, is in the bay the flight arrives at: a
    // deck across the whole top would sit right over the last flight.
    const zl = s.zFloor + (k + 1) * steps * rise;
    landings.push(sb > sa ? { x0: right, x1: s.x1, z: zl } : { x0: s.x0, x1: left, z: zl });
  }
  return {
    flights, landings, bay, run,
    yFront: yB0 - POST,
    yBack: s.yBack,
    laneFront: yB0,
    laneBack: yA1,
    railH: z.railH,
    /** Clear height over a flight: up to the underside of the next flight in its lane. */
    headroom: 2 * steps * rise - STRINGER * 2.4,
    needed: z.headroom,
    stepRise: rise,
    stepGoing: going,
    sizes: z,
  };
}

/** Where a flight's pegs go down into the landing it climbs to and the one it starts from. */
function pegsOf(f: Flight): { x: number; y: number; z: number }[] {
  const dx = Math.sign(f.sb - f.sa);
  const y = (f.y0 + f.y1) / 2;
  const at = [{ x: f.sb + dx * 1.6, y, z: f.zb }];
  if (f.index > 0) at.push({ x: f.sa - dx * 1.6, y, z: f.za });
  return at;
}

/**
 * The tower's frame: posts round each end bay, a landing at every turn and a
 * deck across the top, guard rails round the landings' open sides, ties
 * across the back at every landing, and a sill on the floor tying the posts'
 * feet together. Prints standing, as it stands: posts go straight up, each
 * landing bridges between its posts, the top deck between the two bays.
 */
export function buildStairFrame(m: M, s: StairSpec): Manifold {
  const L = stairLayout(s);
  const yf = L.yFront;
  const yb = L.yBack;
  const p = POST;
  const parts: Manifold[] = [
    box(m, s.x0, s.x1, yf, yb, s.zFloor - s.sillDepth, s.zFloor),
  ];
  // Each end bay: four posts up to its own top landing's rail, and the
  // landings on them. The run between the bays is left open for the flights;
  // the bays are tied together by the sill.
  for (const [b0, b1] of [[s.x0, s.x0 + L.bay], [s.x1 - L.bay, s.x1]] as const) {
    const mine = L.landings.filter((l) => l.x0 < b1 && l.x1 > b0);
    const zTop = (mine.length > 0 ? Math.max(...mine.map((l) => l.z)) : s.zFloor + 10) + L.railH;
    for (const x of [b0, b1 - p]) for (const y of [yf, yb - p]) parts.push(box(m, x, x + p, y, y + p, s.zFloor - 0.3, zTop));
    for (const l of mine) {
      parts.push(box(m, b0, b1, yf, yb, l.z - DECK_T, l.z));
      // Guards: along the landing's front, its back and round its outer end,
      // a top rail and a mid rail. The inner end is where the flights meet it.
      const outer = b1 === s.x1 ? s.x1 - p : s.x0;
      for (const zr of [L.railH / 2, L.railH - RAIL]) {
        const z0 = l.z + zr - RAIL / 2;
        parts.push(box(m, b0, b1, yf, yf + RAIL, z0, z0 + RAIL));
        const open = (s.openBackBay === 'x0' && b0 === s.x0) || (s.openBackBay === 'x1' && b1 === s.x1);
        if (!open) parts.push(box(m, b0, b1, yb - RAIL, yb, z0, z0 + RAIL));
        parts.push(box(m, outer, outer + p, yf, yb, z0, z0 + RAIL));
      }
    }
  }
  const holes: Manifold[] = [];
  const h = PEG / 2 + s.fit;
  for (const f of L.flights) for (const q of pegsOf(f)) holes.push(box(m, q.x - h, q.x + h, q.y - h, q.y + h, q.z - DECK_T - 1, q.z + 0.1));
  return m.Manifold.union(parts).subtract(m.Manifold.union(holes));
}

/**
 * One flight: two stringers, the treads between them, a handrail along its
 * open side, and a lip at the top that rests on the landing with a peg into
 * it (and one into the landing it starts from). Prints on its side, the
 * handrail's stringer down: the treads stand up off it as fins and the far
 * stringer bridges over them, tread to tread.
 */
export function buildFlight(m: M, s: StairSpec, f: Flight): Manifold {
  const L = stairLayout(s);
  const dx = Math.sign(f.sb - f.sa);
  const lo = Math.min(f.sa, f.sb);
  const hi = Math.max(f.sa, f.sb);
  // The nosing line, from the start of the flight to the edge of the landing.
  const line = (x: number) => f.za + ((x - f.sa) / (f.sb - f.sa)) * (f.zb - f.za);
  const depth = 2.4;
  const stringer = polygon(m, [
    [f.sa, f.za], [f.sb, f.zb + 0.2], [f.sb, f.zb - depth], [f.sa, f.za - depth],
  ]).intersect(rect(m, lo - 1, hi + 1, f.za, f.zb + 1));
  // The lip over the top landing, and a foot at the bottom standing on the
  // landing (or the floor) it starts from.
  const lip = rect(m, Math.min(f.sb, f.sb + dx * 3), Math.max(f.sb, f.sb + dx * 3), f.zb, f.zb + 0.9);
  // On the landing the foot is only a threshold plate, lower than a step;
  // under the first tread it is as tall as it can be without showing above it.
  const plate = rect(m, Math.min(f.sa - dx * 2.6, f.sa), Math.max(f.sa - dx * 2.6, f.sa), f.za, f.za + THRESHOLD);
  const under = rect(m, Math.min(f.sa, f.sa + dx * 3), Math.max(f.sa, f.sa + dx * 3), f.za, f.za + Math.min(1.6, f.rise - 0.15));
  const sides = m.CrossSection.union([stringer, lip, plate, under]);

  // Handrail along the open side: posts at the ends and the middle.
  const rail: CrossSection[] = [];
  const posts = [0.06, 0.5, 0.94].map((k) => f.sa + k * (f.sb - f.sa));
  // Each post's foot is in the stringer, but never below where the flight
  // starts: on the first flight that is the floor.
  for (const x of posts) rail.push(bar(m, [x, Math.max(line(x) - 0.5, f.za + RAIL / 2 + 0.05)], [x, line(x) + L.railH], RAIL));
  const [pa, pb] = [posts[0]!, posts[2]!];
  rail.push(bar(m, [pa, line(pa) + L.railH], [pb, line(pb) + L.railH], RAIL));
  rail.push(bar(m, [pa, line(pa) + L.railH / 2], [pb, line(pb) + L.railH / 2], RAIL * 0.8));

  const y0 = f.y0;
  const y1 = f.y1;
  const parts: Manifold[] = [
    slabXZ(m, m.CrossSection.union([sides, ...rail]), y0, y0 + STRINGER),
    slabXZ(m, sides, y1 - STRINGER, y1),
  ];
  // Treads: one per step below the landing, each a plate between the stringers.
  for (let i = 0; i < f.steps - 1; i++) {
    const x = f.sa + dx * (i + 1) * f.going;
    const z = f.za + (i + 1) * f.rise;
    const [ta, tb] = dx > 0 ? [x - f.going + 0.2, x] : [x, x + f.going - 0.2];
    parts.push(box(m, ta, tb, y0 + STRINGER - 0.1, y1 - STRINGER + 0.1, z - TREAD_T, z));
  }
  // Pegs down into the landings, each carried by a bar across the lane that
  // runs back to the end of the flight's stringers.
  const h = PEG / 2;
  for (const q of pegsOf(f)) {
    const atTop = q.z === f.zb;
    const end = atTop ? f.sb : f.sa;
    parts.push(box(m, q.x - h, q.x + h, q.y - h, q.y + h, q.z - DECK_T - 0.5, q.z + 0.1));
    const [bx0, bx1] = [Math.min(q.x - h - 0.4, end), Math.max(q.x + h + 0.4, end)];
    parts.push(box(m, bx0, bx1, y0 + 0.2, y1 - 0.2, q.z, q.z + (atTop ? 0.9 : THRESHOLD)));
  }
  return m.Manifold.union(parts);
}

/** The slot the tower's sill stands in. */
export function stairSlot(m: M, s: StairSpec): Manifold {
  const L = stairLayout(s);
  return box(m, s.x0 - s.fit, s.x1 + s.fit, L.yFront - s.fit, L.yBack + s.fit, s.zFloor - s.sillDepth, s.zFloor + 1);
}

/** How the stairs measure up for a person at their scale, for checks and readouts. */
export function stairCheck(s: StairSpec) {
  const L = stairLayout(s);
  return {
    flights: L.flights.length,
    stepRise: L.stepRise,
    stepGoing: L.stepGoing,
    headroom: L.headroom,
    needed: L.needed,
    scale: s.scale,
    realRise: (L.stepRise * s.scale) / 10,
    realGoing: (L.stepGoing * s.scale) / 10,
  };
}

export type { P2 };
