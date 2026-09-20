import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { Derived } from '../geometry';
import type { Rect } from '../plan';
import { footprintSection, shellSection } from './shape';
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

function pitchedRoof(m: ManifoldToplevel, d: Derived): Manifold {
  const eW = d.W + 2 * d.eaves;
  const eD = d.D + 2 * d.eaves;
  const big = 4 * (eW + eD + d.roofZ + 100);
  const deg = Math.max(1, Math.min(75, d.pitchDeg));
  // Perpendicular thickness becomes vertical drop through the hinge: a roof
  // roofT thick measured square to the slope sits roofT/cos(pitch) lower.
  const drop = d.roofT / Math.cos((deg * Math.PI) / 180);

  // Ridge runs along whichever way the building is longer, which is what any
  // roofer would do and what keeps the ridge height sane on a long plan.
  const ridgeAlongX = d.W >= d.D;
  const slopeAxis = ridgeAlongX ? 'y' : 'x';
  const endAxis = ridgeAlongX ? 'x' : 'y';
  const slopeHalf = (ridgeAlongX ? eD : eW) / 2;
  const endHalf = (ridgeAlongX ? eW : eD) / 2;

  const planes = (z: number): Manifold[] => {
    const out = [
      slopedHalfspace(m, { axis: slopeAxis, hinge: -slopeHalf, side: -1, z, deg, big }),
      slopedHalfspace(m, { axis: slopeAxis, hinge: slopeHalf, side: 1, z, deg, big }),
    ];
    if (d.roof === 'hip') {
      out.push(
        slopedHalfspace(m, { axis: endAxis, hinge: -endHalf, side: -1, z, deg, big }),
        slopedHalfspace(m, { axis: endAxis, hinge: endHalf, side: 1, z, deg, big }),
      );
    }
    return out;
  };

  const prism = (inset: number, zBottom: number): Manifold =>
    m.Manifold.extrude(footprintSection(m, d, inset - d.eaves), big).translate([0, 0, zBottom]);

  const outer = m.Manifold.intersection([prism(0, d.roofZ), ...planes(d.roofZ)]);

  // The cavity. Inset in plan as well as dropped: on a gable there is no end
  // plane to bound it, so without the inset the cavity would run straight out
  // through both ends and leave the roof open like a tunnel.
  const inner = m.Manifold.intersection([
    prism(d.roofT, d.roofZ + d.roofT),
    ...planes(d.roofZ - drop),
  ]);

  return outer.subtract(inner);
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

function flatRoof(m: ManifoldToplevel, d: Derived): Manifold {
  const deck = m.Manifold.extrude(footprintSection(m, d), d.roofT).translate([0, 0, d.roofZ]);
  if (!hasParapet(d)) return deck;
  // Rooted INTO the deck rather than stood on it. The coordinates coincide
  // exactly either way, but a wall that only meets its deck on one plane is
  // the loose-shell failure this project keeps rediscovering, and a third of a
  // millimetre of overlap costs nothing.
  const lap = Math.min(d.roofT / 2, 0.3);
  let wall = m.Manifold.extrude(shellSection(m, d), d.parapetH + lap).translate([
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
 * bulkhead. Deliberately NOT open to the shaft below: there is no stair from
 * the top floor to climb it, and a hole in the roof with nothing under it is
 * just a hole in the roof.
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
  return solid;
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

  // Set back far enough to clear the parapet and read as a step, not as a
  // lid that missed. A penthouse landing on the parapet is one solid with it
  // and the step disappears.
  const inset = Math.max(d.perFt * 5, d.extT * 3 + d.chamfer * 0.5);
  const w = d.W - 2 * inset;
  const deep = (d.D - 2 * inset) * 0.62;
  if (w < d.perFt * 8 || deep < d.perFt * 8) return null;

  // Pushed to the back, so the front of the roof stays a terrace you can see
  // over the parapet -- which is the whole reason a penthouse is set back.
  const y1 = d.D / 2 - inset;
  const y0 = y1 - deep;
  const cx = 0;
  const cy = (y0 + y1) / 2;

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

export function buildRoof(m: ManifoldToplevel, d: Derived, core: Rect | null): Manifold {
  let solid =
    d.roof === 'gable' || d.roof === 'hip' ? pitchedRoof(m, d) : flatRoof(m, d);

  if (d.roof === 'penthouse') {
    const block = penthouse(m, d, d.roofZ + d.roofT);
    if (block) solid = solid.add(block);
  }

  if (core && d.bulkhead && (d.roof === 'flat' || d.roof === 'parapet')) {
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
  return solid;
}
