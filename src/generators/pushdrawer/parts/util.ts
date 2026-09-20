import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';

/** An axis-aligned box from its extents, which reads better than centre-plus-size. */
export function box(
  m: ManifoldToplevel,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
): Manifold {
  return m.Manifold.cube([x1 - x0, y1 - y0, z1 - z0], true).translate([
    (x0 + x1) / 2,
    (y0 + y1) / 2,
    (z0 + z1) / 2,
  ]);
}

/** A 2D polygon, wound counter-clockwise whichever way it was given. */
export function poly(m: ManifoldToplevel, pts: readonly (readonly [number, number])[]): CrossSection {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[(i + 1) % pts.length]!;
    area += x1 * y2 - x2 * y1;
  }
  const ring = (area < 0 ? [...pts].reverse() : [...pts]).map(([x, y]) => [x, y] as [number, number]);
  return m.CrossSection.ofPolygons([ring], 'Positive');
}

/**
 * A profile drawn in the x-z plane, run along y from y0 to y1.
 *
 * Rails, slots and dovetails are all "a section, extruded along the depth of
 * the case", and Manifold only extrudes along z -- so the section is built as
 * (x, z), extruded, and stood up. The rotation sends the extrusion toward -y,
 * which is why the translation is to y1 rather than y0.
 */
export function prismY(
  m: ManifoldToplevel,
  section: CrossSection,
  y0: number,
  y1: number,
): Manifold {
  return m.Manifold.extrude(section, y1 - y0).rotate([90, 0, 0]).translate([0, y1, 0]);
}

/**
 * A helical thread: an eccentric disc, twisted as it is extruded.
 *
 * A disc of radius R - depth/2 whose centre sits depth/2 off the axis sweeps a
 * surface that runs from R - depth to R once round every turn -- a single-start
 * thread of that depth, with a rounded profile FDM is happy to print at 1.2 to
 * 1.5 mm pitch. The same call with a slightly larger diameter is the tapped
 * hole for it, and because both come from one function they cannot fail to
 * mate. Right-handed, because the twist is positive.
 */
export function thread(
  m: ManifoldToplevel,
  majorD: number,
  pitch: number,
  z0: number,
  z1: number,
  depth = 0.5,
  zRef = 0,
  segments = 40,
): Manifold {
  const R = majorD / 2;
  // The helix's phase is a function of ABSOLUTE z, so a screw and the hole it
  // goes in are in phase however long each is and wherever each starts. zRef
  // lets a part modelled in another frame agree with one modelled in this one.
  const phase = (360 * (z0 - zRef)) / pitch;
  const disc = m.CrossSection.circle(R - depth / 2, segments).translate([depth / 2, 0]).rotate(phase);
  const length = z1 - z0;
  const turns = length / pitch;
  return m.Manifold.extrude(disc, length, Math.max(8, Math.ceil(turns * 16)), 360 * turns).translate([0, 0, z0]);
}

/** A screwdriver slot across a head, cut from its outer face. */
export function slotCut(m: ManifoldToplevel, headD: number, headH: number): Manifold {
  return m.Manifold.cube([headD + 1, 1.2, headH * 0.55], true).translate([0, 0, headH * 0.275 - 0.01]);
}
