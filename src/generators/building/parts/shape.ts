import type { CrossSection, Manifold, ManifoldToplevel, Vec2 } from 'manifold-3d';
import type { Derived } from '../geometry';

/**
 * The building's outline in plan, and everything derived from it.
 *
 * One place, because four different files need the same answer and a footprint
 * that is a rectangle in the slab and a chamfered octagon in the walls is a
 * building with a ledge running round it. The slab, the exterior walls, the
 * roof deck, the parapet, the projecting bands and the ribbon windows all come
 * through here.
 */

export const isCorner = (d: Derived): boolean => d.shape === 'corner';

/**
 * The concave corner of a corner building: where the courtyard faces of the
 * two wings meet. The building is built for the LEFT-hand shelf corner -- the
 * shelf walls are the back (+Y) and the left (-X) -- and mirrored afterwards.
 */
export function innerCorner(d: Derived): { readonly ix: number; readonly iy: number } {
  return { ix: -d.W / 2 + d.wing, iy: d.D / 2 - d.wing };
}

/**
 * One straight run of exterior wall.
 *
 * `alongX` runs along X and so faces +-Y; `side` is the sign of its outward
 * normal; `at` is where its OUTER face is, on the axis it faces along; and
 * [c0, c1] is its extent along itself. A rectangle has four of these, a corner
 * building six -- and two of those six are against the shelf.
 */
export interface Face {
  readonly alongX: boolean;
  readonly side: 1 | -1;
  readonly at: number;
  readonly c0: number;
  readonly c1: number;
  /** Against a shelf wall: blank, flush, and nothing may stand proud of it. */
  readonly blank: boolean;
  /** The face the entrance and the front-only facade elements go on. */
  readonly front: boolean;
}

export const faceLen = (f: Face): number => f.c1 - f.c0;
export const faceMid = (f: Face): number => (f.c0 + f.c1) / 2;

export function faces(d: Derived): Face[] {
  const x = d.W / 2;
  const y = d.D / 2;
  if (!isCorner(d)) {
    return [
      { alongX: true, side: -1, at: -y, c0: -x, c1: x, blank: false, front: true },
      { alongX: true, side: 1, at: y, c0: -x, c1: x, blank: false, front: false },
      { alongX: false, side: -1, at: -x, c0: -y, c1: y, blank: false, front: false },
      { alongX: false, side: 1, at: x, c0: -y, c1: y, blank: false, front: false },
    ];
  }
  const { ix, iy } = innerCorner(d);
  return [
    // The courtyard face of the back wing is the one you look at, so it is
    // the front: it gets the entrance, the balconies and the billboard.
    { alongX: true, side: -1, at: iy, c0: ix, c1: x, blank: false, front: true },
    { alongX: true, side: -1, at: -y, c0: -x, c1: ix, blank: false, front: false },
    { alongX: false, side: 1, at: ix, c0: -y, c1: iy, blank: false, front: false },
    { alongX: false, side: 1, at: x, c0: iy, c1: y, blank: false, front: false },
    { alongX: true, side: 1, at: y, c0: -x, c1: x, blank: true, front: false },
    { alongX: false, side: -1, at: -x, c0: -y, c1: y, blank: true, front: false },
  ];
}

export const frontFace = (d: Derived): Face => faces(d)[0]!;

/**
 * Is this face taken off for a cutaway?
 *
 * On a rectangle that is the front. On a corner building it is every face you
 * can see: the two shelf walls are all that is left standing, and the rooms
 * open to the room the shelf is in -- which is what a corner dolls' house is.
 */
export function cutAway(d: Derived, f: Face): boolean {
  return d.openFront && (isCorner(d) ? !f.blank : f.front);
}

/**
 * Window centres along a face of length `faceLen`, centred on zero.
 *
 * Lives here rather than with the windows because it is the building's
 * structural bay, and three other things are set out on it: the columns under
 * an open ground floor, the piers of a mullioned ribbon, and the rhythm the eye
 * actually reads. A column that did not line up with the windows above it would
 * be the first thing anyone noticed.
 */
export function windowCentres(d: Derived, faceLen: number): number[] {
  const avail = faceLen - 2 * d.pier;
  if (avail < d.winW || d.pitch <= 0) return [];
  // n windows occupy n*pitch - (pitch - winW): n panes and n-1 gaps between.
  const n = Math.floor((avail + d.pitch - d.winW) / d.pitch);
  if (n < 1) return [];
  const band = n * d.pitch - (d.pitch - d.winW);
  return Array.from({ length: n }, (_, i) => -band / 2 + d.winW / 2 + i * d.pitch);
}

/**
 * Is a point at least `margin` inside the building's outline in plan?
 *
 * Analytic rather than a kernel intersection, because it is asked once per
 * column and per pin and the answer is two comparisons: a chamfer is the line
 * |x| + |y| = W/2 + D/2 - chamfer, and the margin comes off it along the
 * diagonal.
 */
export function insideOutline(d: Derived, x: number, y: number, margin: number): boolean {
  if (Math.abs(x) > d.W / 2 - margin || Math.abs(y) > d.D / 2 - margin) return false;
  if (isCorner(d)) {
    const { ix, iy } = innerCorner(d);
    return !(x > ix - margin && y < iy + margin);
  }
  if (d.chamfer <= 0) return true;
  return Math.abs(x) + Math.abs(y) <= d.W / 2 + d.D / 2 - d.chamfer - margin * Math.SQRT2;
}

/** The outer outline: a rectangle, or an octagon once the corners are cut. */
function outline(m: ManifoldToplevel, d: Derived): CrossSection {
  if (isCorner(d)) {
    const x = d.W / 2;
    const y = d.D / 2;
    const { ix, iy } = innerCorner(d);
    // Counter-clockwise from the front of the side wing, round the courtyard.
    const ring: Vec2[] = [
      [-x, -y],
      [ix, -y],
      [ix, iy],
      [x, iy],
      [x, y],
      [-x, y],
    ];
    return m.CrossSection.ofPolygons([ring], 'NonZero');
  }
  if (d.chamfer <= 0) return m.CrossSection.square([d.W, d.D], true);
  const c = Math.min(d.chamfer, Math.min(d.W, d.D) / 2 - 1e-3);
  const x = d.W / 2;
  const y = d.D / 2;
  // Counter-clockwise from the bottom-left chamfer, so the area is positive.
  const ring: Vec2[] = [
    [-x + c, -y],
    [x - c, -y],
    [x, -y + c],
    [x, y - c],
    [x - c, y],
    [-x + c, y],
    [-x, y - c],
    [-x, -y + c],
  ];
  return m.CrossSection.ofPolygons([ring], 'NonZero');
}

/**
 * The footprint, shrunk by `inset` (grown, for a negative one).
 *
 * Miter joins, not round: a chamfered corner offset with round joins comes back
 * with a fillet on it, and a building with rounded corners is a different
 * building.
 */
export function footprintSection(m: ManifoldToplevel, d: Derived, inset = 0): CrossSection {
  if (d.chamfer <= 0 && !isCorner(d)) {
    return m.CrossSection.square([d.W - 2 * inset, d.D - 2 * inset], true);
  }
  const o = outline(m, d);
  return inset === 0 ? o : o.offset(-inset, 'Miter', 4);
}

/**
 * A band across the front, for taking the front wall off a cutaway.
 *
 * It reaches a long way OUTWARD, not a hair. The bands and courses this is
 * subtracted from stand proud of the wall, so a band that stopped level with
 * the facade left a sliver of floor band hanging in the air in front of a
 * building that no longer had a front -- a perfect-looking strip of plastic
 * attached to nothing.
 */
export function frontBand(m: ManifoldToplevel, d: Derived, thick: number): CrossSection {
  if (isCorner(d)) {
    // Everything but the two shelf walls -- see cutAway().
    const big = 4 * (d.W + d.D) + 100;
    return m.CrossSection.square([big, big], true).subtract(shelfWalls(m, d, thick));
  }
  const reach = 20 + d.bandProj + d.signProj;
  const h = thick + reach;
  return m.CrossSection.square([d.W + 2 * d.chamfer + 4, h], true).translate([
    0,
    -d.D / 2 + thick - h / 2,
  ]);
}

/** The exterior wall ring, with the front taken off for a cutaway. */
export function shellSection(m: ManifoldToplevel, d: Derived): CrossSection {
  const ring = footprintSection(m, d).subtract(footprintSection(m, d, d.extT));
  if (!d.openFront) return ring;
  // Dolls'-house cutaway: take the whole front band away, corners included, so
  // the side walls start clean at the front rather than in a stub of return.
  return ring.subtract(frontBand(m, d, d.extT));
}

/**
 * A ring standing proud of the wall by `proj` -- a floor band, a spandrel, a
 * base course. Bites back into the wall so it is welded on, not balanced on.
 */
export function bandSection(m: ManifoldToplevel, d: Derived, proj: number): CrossSection {
  const ring = footprintSection(m, d, -proj).subtract(footprintSection(m, d, d.extT * 0.5));
  if (!d.openFront) return ring;
  return ring.subtract(frontBand(m, d, d.extT));
}

/**
 * Square blocks at the four corners of the bounding rectangle, used to keep a
 * pier standing wherever a band of wall is being cut right round the building.
 *
 * Sized off the bounding corner rather than the chamfer face on purpose: a
 * chamfer wider than the pier is then left OPEN, which is what lets a ribbon
 * window wrap a chamfered corner instead of stopping dead at it.
 */
export function cornerPiers(m: ManifoldToplevel, d: Derived): CrossSection {
  const p = d.pier;
  if (isCorner(d)) {
    // Every vertex of the L, the concave one included: the courtyard corner is
    // where the two wings' walls meet, and a ribbon cut through it would leave
    // the back wing's slab above held up by nothing in that corner.
    const x = d.W / 2;
    const y = d.D / 2;
    const { ix, iy } = innerCorner(d);
    const verts: [number, number][] = [[-x, -y], [ix, -y], [ix, iy], [x, iy], [x, y], [-x, y]];
    return m.CrossSection.union(
      verts.map(([vx, vy]) => m.CrossSection.square([2 * p, 2 * p], true).translate([vx, vy])),
    ).add(shelfWalls(m, d, d.extT + 1));
  }
  return m.CrossSection.union(
    ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([sx, sy]) =>
      m.CrossSection.square([2 * p, 2 * p], true).translate([(sx * d.W) / 2, (sy * d.D) / 2]),
    ),
  );
}

/**
 * The strips of plan within `reach` of the two shelf walls, running far out
 * past them. Whatever is cut is cut OUTSIDE these: the shelf walls carry the
 * building and are the one face of it nobody will ever see.
 */
export function shelfWalls(m: ManifoldToplevel, d: Derived, reach: number): CrossSection {
  const big = 4 * (d.W + d.D) + 100;
  return m.CrossSection.union([
    m.CrossSection.square([big, big], true).translate([-d.W / 2 + reach - big / 2, 0]),
    m.CrossSection.square([big, big], true).translate([0, d.D / 2 - reach + big / 2]),
  ]);
}

/**
 * Trim a corner building flush with the two shelf planes.
 *
 * One cut at the end rather than a rule every element has to remember: floor
 * bands, a base course and the eaves of a pitched roof all stand proud of the
 * wall by design, and on the shelf side every one of them would hold the model
 * off the wall by its own projection. A building for a corner has to go INTO
 * the corner.
 */
export function shelfClip(m: ManifoldToplevel, d: Derived, solid: Manifold): Manifold {
  if (!isCorner(d)) return solid;
  const big = 4 * (d.W + d.D) + 1000;
  const keep = m.Manifold.cube([big, big, big], true).translate([
    -d.W / 2 + big / 2,
    d.D / 2 - big / 2,
    0,
  ]);
  return solid.intersect(keep);
}
