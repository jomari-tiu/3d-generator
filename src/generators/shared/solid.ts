import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import { segmentsForRadius } from '../../core/kernel/primitives';

/**
 * Small solid-building helpers shared by the generators that build out of
 * boxes and profiles: the hangar, the MS cage, and the stairs and claw that
 * both of them carry.
 */
export type M = ManifoldToplevel;
export type P2 = readonly [number, number];

export function box(m: M, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Manifold {
  return m.Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);
}

export function rect(m: M, a0: number, a1: number, b0: number, b1: number): CrossSection {
  return m.CrossSection.square([a1 - a0, b1 - b0]).translate([a0, b0]);
}

/** A polygon from its corners, in either winding. */
export function polygon(m: M, pts: readonly P2[]): CrossSection {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[(i + 1) % pts.length]!;
    area += x0 * y1 - x1 * y0;
  }
  const ring = pts.map(([x, y]) => [x, y] as [number, number]);
  return new m.CrossSection([area < 0 ? ring.reverse() : ring]);
}

/** A bar of width w from p to q, round-ended. */
export function bar(m: M, p: P2, q: P2, w: number): CrossSection {
  return m.CrossSection.hull([
    m.CrossSection.circle(w / 2, 16).translate([p[0], p[1]]),
    m.CrossSection.circle(w / 2, 16).translate([q[0], q[1]]),
  ]);
}

/** An upright cylinder at (x, y) from z0 to z1. */
export function cylinder(m: M, r: number, x: number, y: number, z0: number, z1: number): Manifold {
  return m.Manifold.cylinder(z1 - z0, r, r, segmentsForRadius(r)).translate([x, y, z0]);
}

/** A cylinder lying along y, centred on (x, z), from y0 to y1. */
export function cylinderY(m: M, r: number, x: number, z: number, y0: number, y1: number): Manifold {
  return m.Manifold.cylinder(y1 - y0, r, r, segmentsForRadius(r)).rotate([-90, 0, 0]).translate([x, y0, z]);
}

/** A cylinder lying along x, centred on (y, z), from x0 to x1. */
export function cylinderX(m: M, r: number, y: number, z: number, x0: number, x1: number): Manifold {
  return m.Manifold.cylinder(x1 - x0, r, r, segmentsForRadius(r)).rotate([0, 90, 0]).translate([x0, y, z]);
}

/** A plan section stood up from z0 to z1. */
export function slab(m: M, section: CrossSection, z0: number, z1: number): Manifold {
  return m.Manifold.extrude(section, z1 - z0).translate([0, 0, z0]);
}

/** A section in (x, z), stood across y from y0 to y1. */
export function slabXZ(m: M, section: CrossSection, y0: number, y1: number): Manifold {
  return m.Manifold.extrude(section, y1 - y0).rotate([90, 0, 0]).translate([0, y1, 0]);
}

/** A section in (y, z), stood across x from x0 to x1. */
export function slabYZ(m: M, section: CrossSection, x0: number, x1: number): Manifold {
  return m.Manifold.extrude(section, x1 - x0).rotate([90, 0, 90]).translate([x0, 0, 0]);
}

/** Hazard stripes filling a region between v0 and v1, held together by a line along each edge. */
export function stripeBand(m: M, region: CrossSection, v0: number, v1: number): CrossSection {
  const b = region.bounds();
  const h = v1 - v0;
  const bars: CrossSection[] = [];
  for (let x = b.min[0] - h - 7; x < b.max[0] + h; x += 7) {
    bars.push(polygon(m, [[x, v0], [x + 3, v0], [x + 3 + h, v1], [x + h, v1]]));
  }
  const x0 = b.min[0] - 1;
  const x1 = b.max[0] + 1;
  return m.CrossSection.union([...bars, rect(m, x0, x1, v0, v0 + 0.8), rect(m, x0, x1, v1 - 0.8, v1)])
    .intersect(region);
}

/** Turn a solid about a vertical axis through (x, y). */
export function turnAbout(s: Manifold, [x, y]: P2, deg: number): Manifold {
  return s.translate([-x, -y, 0]).rotate([0, 0, deg]).translate([x, y, 0]);
}
