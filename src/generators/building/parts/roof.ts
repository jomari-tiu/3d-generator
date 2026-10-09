import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { roofAccess, type Derived } from '../geometry';
import type { Rect } from '../plan';
import {
  cutAway,
  faceLen,
  faces,
  footprintSection,
  frontBand,
  frontFace,
  innerCorner,
  isCorner,
  shelfClip,
  shellSection,
} from './shape';
import { screenRecess, screenSolid, signBoard } from './facade';
import { groove, jointAt, pinSockets } from './storey';

/**
 * The roof.
 *
 * Pitched roofs here are built as an INTERSECTION OF HALF-SPACES, not as a
 * loft. Manifold has no loft, and the alternative -- hand-building a mesh with
 * a ridge line and four hip rafters -- is the kind of code that works for a
 * square plan and produces an inverted solid for a long thin one. Four tilted
 * boxes intersected with the eave prism is exact for any footprint and any
 * pitch, and a gable is the same construction with the two end planes simply
 * left out, which is what a gable actually is.
 */

/**
 * The solid below a plane that hinges at one eave and rises inward at `deg`.
 *
 * `axis` is the axis the plane rises ALONG: 'y' for the two long eaves of a
 * roof ridged along X. `side` is which eave, +1 for the high-coordinate one.
 */
function slopedHalfspace(
  m: ManifoldToplevel,
  opts: {
    readonly axis: 'x' | 'y';
    readonly hinge: number;
    readonly side: 1 | -1;
    readonly z: number;
    readonly deg: number;
    readonly big: number;
  },
): Manifold {
  const { big } = opts;
  // A box whose TOP face is the z = 0 plane through the origin: rotating it
  // about the origin then tilts that face, and nothing else has to move.
  const slab = m.Manifold.cube([big, big, big], true).translate([0, 0, -big / 2]);
  // Rotation sign is easy to get backwards and impossible to see afterwards --
  // a roof sloping the wrong way still intersects to a perfectly valid solid,
  // just an upside-down one. About X, +deg lifts the +y side; about Y it is the
  // other way round, because a right-handed rotation about Y drops +x.
  const tilted =
    opts.axis === 'y'
      ? slab.rotate([opts.side > 0 ? -opts.deg : opts.deg, 0, 0])
      : slab.rotate([0, opts.side > 0 ? opts.deg : -opts.deg, 0]);
  return tilted.translate(
    opts.axis === 'y' ? [0, opts.hinge, opts.z] : [opts.hinge, 0, opts.z],
  );
}

/** A rectangle of plan, by its bounds. */
interface Span {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

/**
 * A pitched roof over one rectangle of walls, as its outer solid and its
 * cavity -- kept apart so two of them can be joined before either is hollowed.
 *
 * `walls` is the wall line and sets the slopes: the planes hinge one eave out
 * from it on every side, symmetrically, so the ridge sits on the middle of the
 * walls. `plan` is how far the roof actually reaches, which on a corner
 * building is the eave on the open sides and the wall plane, exactly, on the
 * shelf sides. The chamfered octagon comes in through `section` instead.
 */
function pitchedPieces(
  m: ManifoldToplevel,
  d: Derived,
  walls: Span,
  plan: Span | null,
): { outer: Manifold; inner: Manifold } {
  const wW = walls.x1 - walls.x0;
  const wD = walls.y1 - walls.y0;
  const cx = (walls.x0 + walls.x1) / 2;
  const cy = (walls.y0 + walls.y1) / 2;
  const eW = wW + 2 * d.eaves;
  const eD = wD + 2 * d.eaves;
  const big = 4 * (d.W + d.D + 2 * d.eaves + d.roofZ + 100);
  const deg = Math.max(1, Math.min(75, d.pitchDeg));
  // Perpendicular thickness becomes vertical drop through the hinge: a roof
  // roofT thick measured square to the slope sits roofT/cos(pitch) lower.
  const drop = d.roofT / Math.cos((deg * Math.PI) / 180);

  // Ridge runs along whichever way the building is longer, which is what any
  // roofer would do and what keeps the ridge height sane on a long plan.
  const ridgeAlongX = wW >= wD;
  const slopeAxis = ridgeAlongX ? 'y' : 'x';
  const endAxis = ridgeAlongX ? 'x' : 'y';
  const slopeC = ridgeAlongX ? cy : cx;
  const endC = ridgeAlongX ? cx : cy;
  const slopeHalf = (ridgeAlongX ? eD : eW) / 2;
  const endHalf = (ridgeAlongX ? eW : eD) / 2;

  const planes = (z: number): Manifold[] => {
    const out = [
      slopedHalfspace(m, { axis: slopeAxis, hinge: slopeC - slopeHalf, side: -1, z, deg, big }),
      slopedHalfspace(m, { axis: slopeAxis, hinge: slopeC + slopeHalf, side: 1, z, deg, big }),
    ];
    if (d.roof === 'hip') {
      out.push(
        slopedHalfspace(m, { axis: endAxis, hinge: endC - endHalf, side: -1, z, deg, big }),
        slopedHalfspace(m, { axis: endAxis, hinge: endC + endHalf, side: 1, z, deg, big }),
      );
    }
    return out;
  };

  const prism = (inset: number, zBottom: number): Manifold => {
    const section = plan
      ? m.CrossSection.square([plan.x1 - plan.x0 - 2 * inset, plan.y1 - plan.y0 - 2 * inset]).translate([
          plan.x0 + inset,
          plan.y0 + inset,
        ])
      : footprintSection(m, d, inset - d.eaves);
    return m.Manifold.extrude(section, big).translate([0, 0, zBottom]);
  };

  // The cavity. Inset in plan as well as dropped: on a gable there is no end
  // plane to bound it, so without the inset the cavity would run straight out
  // through both ends and leave the roof open like a tunnel.
  return {
    outer: m.Manifold.intersection([prism(0, d.roofZ), ...planes(d.roofZ)]),
    inner: m.Manifold.intersection([prism(d.roofT, d.roofZ + d.roofT), ...planes(d.roofZ - drop)]),
  };
}

function pitchedRoof(m: ManifoldToplevel, d: Derived): Manifold {
  if (!isCorner(d)) {
    const { outer, inner } = pitchedPieces(
      m,
      d,
      { x0: -d.W / 2, x1: d.W / 2, y0: -d.D / 2, y1: d.D / 2 },
      null,
    );
    return outer.subtract(inner);
  }
  // An L is roofed the way a builder roofs one: a roof along each wing, the
  // two run into each other. Their union is the real thing -- a valley down
  // the courtyard corner, a hip or a cross gable over the shelf corner -- and
  // it falls out of the two rectangles with no special case for the join.
  //
  // Each reaches its eave on the open sides and stops dead at the shelf: the
  // slopes are still set out from a symmetrical eave, so the ridge stays on the
  // middle of the wing, but nothing hangs out over the wall the building has to
  // go flat against. Stopping the plan rather than clipping afterwards also
  // keeps the cavity sealed: clipped, the shelf end of the roof would be open.
  const x = d.W / 2;
  const y = d.D / 2;
  const { ix, iy } = innerCorner(d);
  const e = d.eaves;
  const backWing = pitchedPieces(
    m,
    d,
    { x0: -x, x1: x, y0: iy, y1: y },
    { x0: -x, x1: x + e, y0: iy - e, y1: y },
  );
  const sideWing = pitchedPieces(
    m,
    d,
    { x0: -x, x1: ix, y0: -y, y1: y },
    { x0: -x, x1: ix + e, y0: -y - e, y1: y },
  );
  return backWing.outer.add(sideWing.outer).subtract(backWing.inner.add(sideWing.inner));
}

/**
 * A louvred screen punched through the parapet -- the plant-room grille that
 * stops a flat roof reading as a lid.
 *
 * Slots rather than free-standing fins: a fin is a 1 mm stick held at one end,
 * and forty of them is forty chances to snap one off. A slot removes the same
 * material and leaves the parapet a continuous piece of wall.
 */
function screenSlots(m: ManifoldToplevel, d: Derived, zBottom: number, h: number): Manifold[] {
  const slotH = h * 0.55;
  if (slotH < d.minWall) return [];
  const z = zBottom + (h - slotH) / 2;
  const out: Manifold[] = [];
  for (const face of [true, false]) {
    const faceLen = face ? d.W : d.D;
    const avail = faceLen - 2 * d.pier;
    const pitch = Math.max(d.perFt * 2.5, 3 * d.minWall);
    const slot = pitch * 0.55;
    const n = Math.floor(avail / pitch);
    for (let k = 0; k < n; k++) {
      const c = -avail / 2 + pitch / 2 + k * pitch;
      const span = (face ? d.D : d.W) + 2 * d.chamfer + 4;
      out.push(
        m.Manifold.cube(face ? [slot, span, slotH] : [span, slot, slotH], true).translate(
          face ? [c, 0, z + slotH / 2] : [0, c, z + slotH / 2],
        ),
      );
    }
  }
  return out;
}

/** Does this roof carry a parapet wall round the deck? */
function hasParapet(d: Derived): boolean {
  return (d.roof === 'parapet' || d.roof === 'penthouse') && d.parapetH > 0;
}

/**
 * A guard rail round the roof edge: posts, a top rail and a curb at the foot.
 *
 * Cut, like the louvred parapet, rather than assembled: a thin wall on the
 * wall line with the gaps between posts taken out of it, so the rail is one
 * piece with the deck and cannot come off post by post. Gaps are cut face by
 * face, through that face's wall only -- a gap cut straight across the
 * building would take a bite out of every wall it crossed, and on an L that
 * includes the courtyard walls. The top rail bridges each gap, which is a short
 * bridge; the curb gives every post a footing wider than itself.
 */
function guardRail(m: ManifoldToplevel, d: Derived): Manifold | null {
  const h = d.parapetH;
  if (h < d.perFt) return null;
  const railT = Math.max(d.minWall, d.perFt * 0.25);
  const post = Math.max(railT * 1.2, d.perFt * 0.4);
  const spacing = Math.max(d.perFt * 5, post * 3);
  const curb = Math.max(3 * d.layer, d.perFt * 0.3);
  const bar = Math.max(3 * d.layer, d.perFt * 0.35);
  const lap = Math.min(d.roofT / 2, 0.3);
  const z0 = d.roofZ + d.roofT;
  const rail = m.Manifold.extrude(shellSection(m, d, railT), h + lap).translate([0, 0, z0 - lap]);

  const gapH = h - curb - bar;
  if (gapH < d.minWall) return rail;
  const gaps: Manifold[] = [];
  for (const f of faces(d)) {
    if (cutAway(d, f)) continue;
    const n = Math.max(1, Math.round((faceLen(f) - post) / spacing));
    const step = (faceLen(f) - post) / n;
    if (step - post < d.minWall) continue;
    const near = f.at + f.side * 0.5;
    const far = f.at - f.side * (railT + 0.5);
    for (let k = 0; k < n; k++) {
      const a0 = f.c0 + post + k * step;
      const a1 = f.c0 + (k + 1) * step;
      const [b0, b1] = [Math.min(near, far), Math.max(near, far)];
      const size: [number, number, number] = f.alongX
        ? [a1 - a0, b1 - b0, gapH]
        : [b1 - b0, a1 - a0, gapH];
      gaps.push(
        m.Manifold.cube(size, true).translate(
          f.alongX
            ? [(a0 + a1) / 2, (b0 + b1) / 2, z0 + curb + gapH / 2]
            : [(b0 + b1) / 2, (a0 + a1) / 2, z0 + curb + gapH / 2],
        ),
      );
    }
  }
  return gaps.length > 0 ? rail.subtract(m.Manifold.union(gaps)) : rail;
}

function flatRoof(m: ManifoldToplevel, d: Derived): Manifold {
  const top = flatRoofTop(m, d);
  const crown = cornice(m, d);
  return crown ? top.add(crown) : top;
}

/**
 * A cornice finishing the top of the walls: at the head of the parapet, or at
 * the deck edge of a roof without one.
 *
 * A real cornice spreads as it rises, which here is an overhang -- so it
 * spreads in steps, each one standing out no further than it is tall: 45
 * degrees, printable on a roof that prints deck-down. A plain band at full
 * projection caps it. Rooted half a wall into the parapet so it is welded on.
 */
function cornice(m: ManifoldToplevel, d: Derived): Manifold | null {
  if (!d.t.cornice) return null;
  const parapet = hasParapet(d);
  const P = Math.max(d.perFt * 1.25, 2 * d.minWall);
  const cap = Math.max(P * 0.6, 3 * d.layer);
  const deck = d.roofZ + d.roofT;
  const top = parapet ? deck + d.parapetH : deck + cap + P * 0.5;
  const zc0 = Math.max(d.roofZ, top - cap - P);
  const steps = 4;
  const s = (top - cap - zc0) / steps;
  if (s <= 0) return null;
  const inner = footprintSection(m, d, (parapet ? d.parapetT : d.extT) * 0.5);
  const ring = (proj: number) => {
    let r = footprintSection(m, d, -proj).subtract(inner);
    if (d.openFront) r = r.subtract(frontBand(m, d, d.extT));
    return r;
  };
  const tiers: Manifold[] = [];
  for (let k = 1; k <= steps; k++) {
    const z = zc0 + (k - 1) * s;
    tiers.push(m.Manifold.extrude(ring((k * P) / steps), top - z).translate([0, 0, z]));
  }
  return m.Manifold.union(tiers);
}

/** The deck and whatever stands round its edge. */
function flatRoofTop(m: ManifoldToplevel, d: Derived): Manifold {
  const deck = m.Manifold.extrude(footprintSection(m, d), d.roofT).translate([0, 0, d.roofZ]);
  if (d.roof === 'railing') {
    const rail = guardRail(m, d);
    return rail ? deck.add(rail) : deck;
  }
  if (!hasParapet(d)) return deck;
  // Rooted INTO the deck rather than stood on it. The coordinates coincide
  // exactly either way, but a wall that only meets its deck on one plane is
  // the loose-shell failure this project keeps rediscovering, and a third of a
  // millimetre of overlap costs nothing.
  const lap = Math.min(d.roofT / 2, 0.3);
  let wall = m.Manifold.extrude(shellSection(m, d, d.parapetT), d.parapetH + lap).translate([
    0,
    0,
    d.roofZ + d.roofT - lap,
  ]);
  if (d.t.screen) {
    const slots = screenSlots(m, d, d.roofZ + d.roofT, d.parapetH);
    if (slots.length > 0) wall = wall.subtract(m.Manifold.union(slots));
  }
  return deck.add(wall);
}

/**
 * The rooftop plant room over the core -- a lift overrun, a tank room, a stair
 * bulkhead. Open to the shaft below: the top storey's stair climbs up into it
 * through the deck, and a door in its front lets you out onto the roof.
 */
function bulkhead(m: ManifoldToplevel, d: Derived, core: Rect, zTop: number): Manifold {
  const w = core.x1 - core.x0 + 2 * d.extT;
  const h = core.y1 - core.y0 + 2 * d.extT;
  // A style with a stair tower carries the core well above the roof and gives
  // it its own slot windows; without one it is a squat plant box.
  const tall = d.t.tower ? d.towerH : d.perFt * 8;
  const cx = (core.x0 + core.x1) / 2;
  const cy = (core.y0 + core.y1) / 2;
  const lap = Math.min(d.roofT / 2, 0.3);
  const box = m.Manifold.cube([w, h, tall + lap], true).translate([
    cx,
    cy,
    zTop - lap + (tall + lap) / 2,
  ]);
  const hollow = m.Manifold.cube([w - 2 * d.extT, h - 2 * d.extT, tall], true).translate([
    cx,
    cy,
    // Overshoot DOWN past the roof deck and stop dead inside the material at
    // the lid. Overshooting both ends instead would take the roof off the box.
    zTop + tall / 2 - d.roofT - 1,
  ]);
  let solid = box.subtract(hollow);

  // Slot windows, one per face, the way a stair tower is always lit.
  if (d.t.tower && tall > d.perFt * 6) {
    const slotW = Math.min(d.perFt * 2.5, w * 0.3, h * 0.3);
    const slotH = tall - d.perFt * 4;
    const slots: Manifold[] = [];
    for (const alongX of [true, false]) {
      const thick = (alongX ? h : w) + 2;
      slots.push(
        m.Manifold.cube(
          alongX ? [slotW, thick, slotH] : [thick, slotW, slotH],
          true,
        ).translate([cx, cy, zTop + d.perFt * 2 + slotH / 2]),
      );
    }
    solid = solid.subtract(m.Manifold.union(slots));
  }

  // The way out onto the roof, on the face toward the front -- which on a
  // corner building is the face over the hall, looking down the terrace.
  const doorW = Math.min(d.doorW, w - 2 * d.extT - 2 * d.minWall);
  const head = Math.min(zTop + d.perFt * 7, zTop + tall - d.roofT - Math.max(d.minWall, d.perFt * 0.5));
  if (doorW >= d.minWall && head - zTop >= d.minWall) {
    solid = solid.subtract(
      m.Manifold.cube([doorW, 2 * d.extT + 1, head - zTop + 0.1], true).translate([
        cx,
        cy - h / 2 + d.extT / 2,
        zTop + (head - zTop + 0.1) / 2 - 0.1,
      ]),
    );
  }
  return solid;
}

/** Does the screen go on the roof, and is there a flat deck for it to stand on? */
export function roofScreenWanted(d: Derived): boolean {
  return d.t.sign && d.signPlace === 'roof';
}

export function roofScreenFits(d: Derived): boolean {
  return (
    roofScreenWanted(d) &&
    (d.roof === 'flat' || d.roof === 'parapet' || d.roof === 'railing' || d.roof === 'penthouse')
  );
}

/**
 * Where the rooftop screen stands in plan, including the struts behind it: for
 * keeping rooftop features clear of it.
 */
export function roofScreenSpan(d: Derived): Rect | null {
  if (!roofScreenFits(d)) return null;
  const b = signBoard(d);
  if (!b) return null;
  const { yF, t, brace, frameD, catwalk, post } = roofScreenDepths(d);
  return d.signMount === 'frame'
    ? { x0: b.x0, x1: b.x1, y0: yF - catwalk, y1: yF + frameD + post }
    : { x0: b.x0, x1: b.x1, y0: yF, y1: yF + t + brace };
}

function roofScreenDepths(d: Derived): {
  yF: number;
  t: number;
  brace: number;
  frameD: number;
  catwalk: number;
  post: number;
} {
  // Just behind whatever stands at the roof edge, so it reads over it.
  const edge = d.roof === 'parapet' || d.roof === 'penthouse' ? d.parapetT : d.roof === 'railing' ? d.perFt * 0.4 : 0;
  const post = Math.max(1.5 * d.minWall, d.perFt * 0.8);
  // The catwalk hangs out in front of the board, so a raised board stands
  // back by the catwalk's width to keep it over the roof.
  const catwalk = d.signMount === 'frame' ? Math.max(d.perFt * 2.5, 3 * d.minWall) : 0;
  const yF = frontFace(d).at + edge + d.perFt * 1.5 + catwalk;
  const t = Math.max(3 * d.minWall, d.perFt * 1.2);
  const brace = Math.min(d.signH * 0.4, d.perFt * 8);
  // No deeper than half the frame is tall, so a brace across the side of the
  // tower climbs at 45 degrees or steeper and prints without support.
  const frameD = Math.max(post * 3, Math.min(d.signLift * 0.5, d.perFt * 8));
  return { yF, t, brace, frameD, catwalk, post };
}

/** A square member from one point to another: the hull of a cube at each end. */
function member(
  m: ManifoldToplevel,
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  s: number,
): Manifold {
  const cube = (p: readonly [number, number, number]) =>
    m.Manifold.cube([s, s, s], true).translate([p[0], p[1], p[2]]);
  return m.Manifold.hull([cube(a), cube(b)]);
}

/**
 * A screen standing on the roof behind the front parapet, facing the street.
 *
 * Braced: a slab on its edge, held from behind by two struts that are
 * right-angled triangles in section. Raised: the billboard of an older city
 * roof, up on a steel tower -- see raisedScreen. Either way the roof prints
 * deck-down, so the board is a wall growing straight up and nothing overhangs.
 */
function roofScreen(m: ManifoldToplevel, d: Derived, zDeck: number): Manifold | null {
  if (!roofScreenFits(d)) return null;
  const b = signBoard(d);
  if (!b) return null;
  if (d.signMount === 'frame') return raisedScreen(m, d, b, zDeck);
  const { yF, t, brace } = roofScreenDepths(d);
  const lap = Math.min(d.roofT / 2, 0.3);
  const panel = screenSolid(m, d, b, yF, yF + t, zDeck - lap, zDeck + d.signH, screenRecess(d, t));

  // Struts: profile in (y, z) behind the panel, extruded across x.
  const strutT = Math.max(1.5 * d.minWall, d.perFt * 0.8);
  const rise = d.signH * 0.85;
  const profile: [number, number][] = [
    [-0.2, -lap],
    [brace, -lap],
    [-0.2, rise],
  ];
  const wedge = m.CrossSection.ofPolygons([profile], 'NonZero').extrude(strutT);
  const struts = [b.x0 + (b.x1 - b.x0) * 0.2, b.x1 - (b.x1 - b.x0) * 0.2].map((cx) =>
    // u -> y, v -> z, extrusion -> x, the same turn as the solar rows.
    wedge.rotate([90, 0, 90]).translate([cx - strutT / 2, yF + t, zDeck]),
  );
  return m.Manifold.union([panel, ...struts]);
}

/**
 * A billboard raised on a steel tower, the way an older city roof carries one.
 *
 * Two rows of posts -- one under the board, one behind -- tied by girders at
 * the top and halfway up, with chevron bracing in every face of the tower and
 * the board propped back to the rear posts. A catwalk runs along the foot of
 * the board on brackets, and lamps lean out over its top.
 *
 * Every member is vertical, horizontal, or at 45 degrees or steeper, because
 * the roof prints deck-down and the tower is printed with it: posts are
 * columns, girders are short bridges between them, braces climb, the catwalk
 * stands on brackets rising to meet it, and the lamps lean out no further than
 * a 45-degree overhang. The board itself is the blank one screenSolid makes.
 */
function raisedScreen(
  m: ManifoldToplevel,
  d: Derived,
  b: { readonly x0: number; readonly x1: number; readonly frame: number },
  zDeck: number,
): Manifold {
  const { yF, t, frameD, catwalk, post } = roofScreenDepths(d);
  const lap = Math.min(d.roofT / 2, 0.3);
  const zTop = zDeck + d.signLift;
  const zMid = zDeck + d.signLift / 2;
  const brace = Math.max(d.minWall * 1.2, post * 0.6);
  const w = b.x1 - b.x0;
  // Posts no further apart than half the tower is tall, so chevron braces
  // between them climb at 45 degrees or steeper.
  const bay = Math.min(d.perFt * 7, d.signLift);
  const n = Math.max(2, Math.ceil((w - post) / bay) + 1);
  const xs = Array.from({ length: n }, (_, i) => b.x0 + post / 2 + (i * (w - post)) / (n - 1));
  const yFront = yF + t / 2;
  const yBack = yF + frameD;
  const parts: Manifold[] = [];
  const bar = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
    m.Manifold.cube([x1 - x0, y1 - y0, z1 - z0], true).translate([
      (x0 + x1) / 2,
      (y0 + y1) / 2,
      (z0 + z1) / 2,
    ]);

  // Posts, and the girders tying them at the top and halfway up.
  for (const y of [yFront, yBack]) {
    for (const x of xs) parts.push(bar(x - post / 2, x + post / 2, y - post / 2, y + post / 2, zDeck - lap, zTop));
    for (const z of [zMid, zTop - post / 2]) {
      parts.push(bar(b.x0, b.x1, y - post / 2, y + post / 2, z - post / 2, z + post / 2));
    }
  }
  for (const x of xs) {
    for (const z of [zMid, zTop - post / 2]) {
      parts.push(bar(x - post / 2, x + post / 2, yFront, yBack, z - post / 2, z + post / 2));
    }
  }

  // Chevron bracing: in the front and back faces, from the foot of each post up
  // to the middle of the girder above the bay, in both tiers.
  for (const y of [yFront, yBack]) {
    for (let i = 0; i + 1 < xs.length; i++) {
      const mid = (xs[i]! + xs[i + 1]!) / 2;
      for (const [z0, z1] of [[zDeck, zMid], [zMid, zTop - post]] as const) {
        parts.push(member(m, [xs[i]!, y, z0], [mid, y, z1], brace));
        parts.push(member(m, [xs[i + 1]!, y, z0], [mid, y, z1], brace));
      }
    }
  }
  // Across each end of the tower, front foot to back post.
  for (const x of [xs[0]!, xs[xs.length - 1]!]) {
    parts.push(member(m, [x, yFront, zDeck], [x, yBack, zMid], brace));
    parts.push(member(m, [x, yFront, zMid], [x, yBack, zTop - post], brace));
  }

  // The board, standing on the front girder, and propped back to the rear
  // posts at 45 degrees or steeper.
  parts.push(screenSolid(m, d, b, yF, yF + t, zTop - 0.2, zTop + d.signH, screenRecess(d, t)));
  const run = yBack - (yF + t);
  const rise = Math.min(d.signH * 0.8, Math.max(run, d.signH * 0.5));
  for (const x of xs) parts.push(member(m, [x, yBack, zTop - post / 2], [x, yF + t - brace / 2, zTop + rise], brace));

  // The catwalk along the foot of the board, on brackets rising from the front
  // posts to meet its outer edge.
  const plank = Math.max(2 * d.minPlate, d.perFt * 0.4);
  parts.push(bar(b.x0, b.x1, yF - catwalk, yF + 0.2, zTop - plank, zTop));
  const drop = yFront - (yF - catwalk) + brace;
  for (const x of xs) {
    parts.push(member(m, [x, yFront, zTop - plank - drop], [x, yF - catwalk + brace / 2, zTop - plank + brace / 2], brace));
  }

  // Lamps over the top: an arm leaning out at 45 degrees, one over each bay.
  const reach = Math.max(d.perFt * 2.5, 3 * brace);
  for (let i = 0; i + 1 < xs.length; i++) {
    const x = (xs[i]! + xs[i + 1]!) / 2;
    parts.push(member(m, [x, yF + t / 2, zTop + d.signH - brace], [x, yF - reach, zTop + d.signH + reach], brace));
  }

  return m.Manifold.union(parts);
}

/**
 * Where the penthouse stands in plan, or null when the roof is too small for one.
 *
 * Set back far enough to clear the parapet and read as a step, not as a lid
 * that missed: a penthouse landing on the parapet is one solid with it and the
 * step disappears. Pushed to the back, so the front of the roof stays a
 * terrace you can see over the parapet -- which is the whole reason a
 * penthouse is set back. On a corner building it runs along the back wing,
 * the full depth of it: the courtyard is the terrace there.
 */
export function penthouseSpan(d: Derived): Span | null {
  const inset = Math.max(d.perFt * 5, d.extT * 3 + d.chamfer * 0.5);
  const corner = isCorner(d);
  const y0Wall = corner ? innerCorner(d).iy : -d.D / 2;
  const w = d.W - 2 * inset;
  const deep = (d.D / 2 - y0Wall - 2 * inset) * (corner ? 1 : 0.62);
  if (w < d.perFt * 8 || deep < d.perFt * 8) return null;
  const y1 = d.D / 2 - inset;
  return { x0: -w / 2, x1: w / 2, y0: y1 - deep, y1 };
}

/**
 * A set-back rooftop penthouse: the plant deck of a commercial block.
 *
 * Not the bulkhead with different numbers. The bulkhead is a box over the
 * CORE -- it is where the lift and the stair come out, and it goes where they
 * are. This is a storey in its own right: it is set out from the parapet, it
 * holds the back of the roof and leaves a terrace at the front, and it exists
 * whether or not the building has a core at all. On a building with both, the
 * penthouse is the one you would see from the street.
 *
 * Hollow, with a lid, and vented through the walls rather than round the top:
 * a louvre band cut as two crossing slots takes the same material away as a
 * ring of fins and leaves the box a continuous piece of wall.
 */
function penthouse(m: ManifoldToplevel, d: Derived, zTop: number): Manifold | null {
  const h = d.penthouseH;
  if (h < d.perFt * 4) return null;

  const r = penthouseSpan(d);
  if (!r) return null;
  const w = r.x1 - r.x0;
  const deep = r.y1 - r.y0;
  const cx = (r.x0 + r.x1) / 2;
  const cy = (r.y0 + r.y1) / 2;

  const lap = Math.min(d.roofT / 2, 0.3);
  const box = m.Manifold.cube([w, deep, h + lap], true).translate([cx, cy, zTop - lap + (h + lap) / 2]);
  const hollow = m.Manifold.cube([w - 2 * d.extT, deep - 2 * d.extT, h], true).translate([
    cx,
    cy,
    // Down past the deck, stopping dead inside the material of the lid: an
    // overshoot at both ends would take the roof off the box.
    zTop + h / 2 - d.roofT - 1,
  ]);
  let solid = box.subtract(hollow);

  const slotH = Math.min(d.perFt * 2, h * 0.22);
  const head = zTop + h - d.roofT - Math.max(d.minWall, d.perFt);
  if (slotH >= d.minWall && head - slotH > zTop + d.perFt) {
    const z = head - slotH / 2;
    solid = solid.subtract(
      m.Manifold.union([
        m.Manifold.cube([w * 0.62, deep + 2, slotH], true).translate([cx, cy, z]),
        m.Manifold.cube([w + 2, deep * 0.55, slotH], true).translate([cx, cy, z]),
      ]),
    );
  }
  return solid;
}

export function buildRoof(m: ManifoldToplevel, d: Derived, core: Rect | null): Manifold | null {
  if (d.roof === 'none') return null;
  let solid =
    d.roof === 'gable' || d.roof === 'hip' ? pitchedRoof(m, d) : flatRoof(m, d);

  if (d.roof === 'penthouse') {
    const block = penthouse(m, d, d.roofZ + d.roofT);
    if (block) solid = solid.add(block);
  }

  const screen = roofScreen(m, d, d.roofZ + d.roofT);
  if (screen) solid = solid.add(screen);

  if (core && hasBulkhead(d, core)) {
    // The stair from the top storey comes up through here, so the deck is
    // opened over the shaft exactly as every slab below it is.
    solid = solid.subtract(
      m.Manifold.cube([core.x1 - core.x0, core.y1 - core.y0, d.roofT + 2], true).translate([
        (core.x0 + core.x1) / 2,
        (core.y0 + core.y1) / 2,
        d.roofZ + d.roofT / 2,
      ]),
    );
    solid = solid.add(bulkhead(m, d, core, d.roofZ + d.roofT));
  }

  // The roof is the last piece of the stack, so it receives whatever the top
  // storey offers -- and receives it last, after the penthouse and the plant
  // room, for the same reason the storeys cut their groove last.
  const below = jointAt(d, d.floors - 1);
  if (below === 'pins') {
    const sockets = pinSockets(m, d, d.roofZ, d.floors - 1);
    if (sockets.length > 0) solid = solid.subtract(m.Manifold.union(sockets));
  } else if (below === 'tongue') {
    const slot = groove(m, d, d.roofZ);
    if (slot) solid = solid.subtract(slot);
  }
  return shelfClip(m, d, solid);
}

/**
 * Is there a stair head over the core? Not under a helipad: the pad goes over
 * the core instead. See roofAccess().
 */
export function hasBulkhead(d: Derived, core: Rect | null): boolean {
  return core !== null && roofAccess(d);
}
