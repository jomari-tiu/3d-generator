import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import { roundedRect } from '../../../core/kernel/primitives';

/** Slices up the quarter-round. Enough that the facets read as a curve. */
const STEPS = 16;

/**
 * A solid whose top edge is rounded over, `r` in from the side and `rz` down
 * from the top -- a quarter circle when they match, a quarter ellipse when the
 * solid is too short for the round-over it is asked for.
 *
 * `slice(z, inset)` is the footprint at height z, pulled in by `inset` all the
 * way round. Nothing is inset below `height - rz`; by the top it is in by r, so
 * at r = half the footprint the top closes over completely -- the ball a fully
 * rounded keycap becomes, squashed if the cap is shorter than it is wide.
 *
 * Hulled, not lofted: every footprint here is convex (a rounded square, at any
 * taper), so the hull of its slices IS the solid, with no seams between them
 * to clean up -- the same reason the domed keycap is a hull.
 */
export function roundedTop(
  m: ManifoldToplevel,
  slice: (z: number, inset: number) => CrossSection,
  height: number,
  r: number,
  rz = r,
): Manifold {
  const start = height - rz;
  const at = (z: number, inset: number): Manifold =>
    m.Manifold.extrude(slice(z, inset), 0.001).translate([0, 0, z - 0.001]);

  const slices: Manifold[] = [at(0.001, 0), at(start, 0)];
  for (let k = 1; k <= STEPS; k++) {
    // Evenly spaced in ANGLE, not height: the profile is steep near the top,
    // and equal height steps would leave it one coarse facet there.
    const a = (k / STEPS) * (Math.PI / 2);
    const z = start + rz * Math.sin(a);
    slices.push(at(z, r * (1 - Math.cos(a))));
  }
  return m.Manifold.hull(slices);
}

/**
 * A rounded rectangle inset by `inset`, its corner radius growing `grow`
 * times as fast, until the slice is a circle.
 *
 * The corners have to round over in plan as the edges do in section, or the
 * slices stay squares all the way up: stacked, squares make a pyramid, with
 * ridges up the four diagonals to a peak -- a tent, not a ball. Growing at the
 * inset's own rate is a plain fillet; a round-over meant to close the top as a
 * dome needs the slices to go round well before the top, so it grows faster.
 */
export function insetSquare(
  m: ManifoldToplevel,
  w: number,
  h: number,
  corner: number,
  inset: number,
  grow = 1,
): CrossSection {
  const iw = Math.max(0.02, w - 2 * inset);
  const ih = Math.max(0.02, h - 2 * inset);
  return roundedRect(m, iw, ih, Math.min(corner + inset * grow, Math.min(iw, ih) / 2));
}
