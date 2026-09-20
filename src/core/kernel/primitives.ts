import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';

/**
 * Rounded rectangle, centred. The corner radius is an exact Clipper2 round
 * offset rather than hand-rolled arcs.
 */
export function roundedRect(
  m: ManifoldToplevel,
  w: number,
  h: number,
  r: number,
  segments = 32,
): CrossSection {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2 - 1e-6));
  if (radius <= 1e-6) return m.CrossSection.square([w, h], true);
  return m.CrossSection.square([w - 2 * radius, h - 2 * radius], true).offset(
    radius,
    'Round',
    2,
    segments,
  );
}

/** Stadium / pill: a rectangle with fully rounded ends. */
export function pill(m: ManifoldToplevel, w: number, h: number, segments = 48): CrossSection {
  return roundedRect(m, w, h, Math.min(w, h) / 2, segments);
}

/** Ellipse, centred, via a scaled circle. */
export function ellipse(
  m: ManifoldToplevel,
  w: number,
  h: number,
  segments = 64,
): CrossSection {
  return m.CrossSection.circle(0.5, segments).scale([w, h]);
}

/** Regular polygon with `sides` vertices on radius `r`. */
export function ngon(m: ManifoldToplevel, r: number, sides: number): CrossSection {
  return m.CrossSection.circle(r, Math.max(3, Math.round(sides)));
}

/**
 * Round the CONCAVE corners of a 2D profile by radius r, and close gaps
 * narrower than 2r. A dilate followed by an erode -- a morphological closing.
 *
 * This offset pair is the project's entire fillet story: Manifold has no 3D
 * fillet, so prismatic parts get their fillets in 2D before extruding.
 *
 * Note the direction. Reversing it (erode then dilate) is an OPENING, which
 * rounds convex corners and eats thin features instead, and the two are easy
 * to confuse: reaching for the wrong one is what silently shrank the cloud and
 * bubble tag outlines out from under their lettering.
 */
export function filletProfile(
  section: CrossSection,
  r: number,
  segments = 24,
): CrossSection {
  if (r <= 1e-6) return section;
  return section.offset(r, 'Round', 2, segments).offset(-r, 'Round', 2, segments);
}

/**
 * A prism with EVERY outside edge rounded by `r`: the 3D opening of
 * `extrude(section, len)` by a ball, built as a sweep.
 *
 * `filletProfile` is the project's whole fillet story and it only reaches the
 * edges that run ALONG the extrusion. The rim where the two end caps meet the
 * sides stays square, and on a part whose entire point is that it looks soft
 * from every angle that rim is most of what you see.
 *
 * Same erode-dilate pair, one dimension up. Erode the section once by `r`;
 * then for each slice a distance x in from an end, dilate that core by
 * sqrt(r^2 - x^2) -- the radius of the ball where it crosses that slice -- and
 * extrude the slice's own thickness. The union is the ball rolled over the
 * whole surface. Stepped by ANGLE rather than by x, so the slices stay even
 * where the sphere turns hardest, and each takes the SMALLER of its two radii
 * so the result is inscribed in the true surface rather than proud of it.
 *
 * `r` has to be under half the section's thinnest limb or the erosion deletes
 * that limb and the dilation never brings it back. Callers clamp; this does not.
 */
export function softPrism(
  m: ManifoldToplevel,
  section: CrossSection,
  len: number,
  r: number,
  steps = 10,
): Manifold {
  if (r <= 1e-6 || len <= 2 * r) return m.Manifold.extrude(section, len);
  const core = section.offset(-r, 'Round', 2, 32);
  const parts: Manifold[] = [
    m.Manifold.extrude(core.offset(r, 'Round', 2, 32), len - 2 * r).translate([0, 0, r]),
  ];
  // Every slice is grown INWARD by a lap before it is unioned. Butted exactly,
  // slice meets slice on a shared plane with no volume either side of it, and
  // the union comes back as one manifold made of several shells -- which slices
  // as a stack of loose discs. Inward is the safe direction to grow: the
  // neighbour there is always the fatter one, so the union is unchanged and
  // only the contact becomes real.
  const lap = Math.min(0.1, r / 20);
  for (let i = 0; i < steps; i++) {
    const x0 = r * Math.sin(((i / steps) * Math.PI) / 2);
    const x1 = r * Math.sin((((i + 1) / steps) * Math.PI) / 2);
    const t = x1 - x0;
    if (t <= 1e-6) continue;
    const g = r * Math.cos((((i + 1) / steps) * Math.PI) / 2);
    const sec = g > 1e-6 ? core.offset(g, 'Round', 2, 32) : core;
    parts.push(m.Manifold.extrude(sec, t + lap).translate([0, 0, r - x1]));
    parts.push(m.Manifold.extrude(sec, t + lap).translate([0, 0, len - r + x0 - lap]));
  }
  return m.Manifold.union(parts);
}

/**
 * Slot: a capsule of overall length `len` and width `w`, centred.
 *
 * The seed rectangle is flat, not `w` tall: a round offset grows BOTH ways, so
 * seeding with a w-tall rectangle produces a capsule 2w wide, and a "4 mm slot"
 * quietly comes out 8 mm across.
 */
export function slot(m: ManifoldToplevel, len: number, w: number, segments = 32): CrossSection {
  const eps = 1e-3;
  const straight = Math.max(eps, len - w);
  return m.CrossSection.square([straight, eps], true).offset(
    Math.max(eps, w / 2 - eps / 2),
    'Round',
    2,
    segments,
  );
}

/**
 * Extrude with a tapered top, e.g. a keycap skirt or a chamfered lip.
 *
 * Exists to keep `scaleTop` away from callers. Its type says `Vec2 | number`,
 * but the JS binding reads a scalar as if it were a Vec2 and gets garbage out
 * of it -- the solid collapses to a near-point instead of tapering, with no
 * error and a perfectly valid-looking manifold at the end of it. Always the
 * pair, never the number.
 */
export function taperedExtrude(
  m: ManifoldToplevel,
  section: CrossSection,
  height: number,
  topScaleX: number,
  topScaleY: number = topScaleX,
): Manifold {
  return m.Manifold.extrude(section, height, 0, 0, [topScaleX, topScaleY]);
}

/**
 * Drop disconnected fragments smaller than `minVolumeMm3`.
 *
 * Trimming a raised feature against the surface it sits on leaves shells of
 * numerically-zero volume wherever the two very nearly coincide. They are the
 * hardest kind of debris to notice: the solid is manifold, its status is clean
 * and its volume is positive -- a billionth of a cubic millimetre of it -- so
 * every check the exporter makes passes and the junk lands in the STL anyway.
 */
export function dropSlivers(
  m: ManifoldToplevel,
  solid: Manifold,
  minVolumeMm3: number,
): Manifold {
  const pieces = solid.decompose();
  if (pieces.length <= 1) return solid;
  const keep = pieces.filter((piece) => piece.volume() >= minVolumeMm3);
  if (keep.length === pieces.length) return solid;
  return keep.length === 0 ? m.Manifold.union([]) : m.Manifold.union(keep);
}

/** Circular-segment count for a radius, from a chord-error budget. */
export function segmentsForRadius(radius: number, chordMm = 0.15): number {
  const n = Math.ceil((2 * Math.PI * Math.max(radius, 0.01)) / chordMm);
  return Math.min(256, Math.max(24, n));
}
