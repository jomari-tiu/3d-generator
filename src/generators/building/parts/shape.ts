import type { CrossSection, ManifoldToplevel, Vec2 } from 'manifold-3d';
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
  if (d.chamfer <= 0) return true;
  return Math.abs(x) + Math.abs(y) <= d.W / 2 + d.D / 2 - d.chamfer - margin * Math.SQRT2;
}

/** The outer outline: a rectangle, or an octagon once the corners are cut. */
function outline(m: ManifoldToplevel, d: Derived): CrossSection {
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
  if (d.chamfer <= 0) {
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
  return m.CrossSection.union(
    ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).map(([sx, sy]) =>
      m.CrossSection.square([2 * p, 2 * p], true).translate([(sx * d.W) / 2, (sy * d.D) / 2]),
    ),
  );
}
