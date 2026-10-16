import type { CrossSection, Manifold } from 'manifold-3d';
import { rect, type M } from './solid';

/**
 * A Warren truss as a profile along its length (s) and up (z) from z0: top
 * and bottom chords, a post at each end, and diagonals between them
 * alternating up and down, one per bay about as long as the truss is deep.
 */
export function trussProfile(m: M, len: number, z0: number, depth: number, chord = 1.6, web = 1.2): CrossSection {
  const z1 = z0 + depth;
  const parts: CrossSection[] = [
    rect(m, 0, len, z0, z0 + chord),
    rect(m, 0, len, z1 - chord, z1),
    rect(m, 0, chord, z0, z1),
    rect(m, len - chord, len, z0, z1),
  ];
  const bays = Math.max(1, Math.round(len / depth));
  const pitch = len / bays;
  for (let i = 0; i < bays; i++) {
    const a = i * pitch;
    const [lo, hi] = i % 2 === 0 ? [a, a + pitch] : [a + pitch, a];
    parts.push(m.CrossSection.hull([
      m.CrossSection.circle(web / 2, 12).translate([lo, z0 + chord / 2]),
      m.CrossSection.circle(web / 2, 12).translate([hi, z1 - chord / 2]),
    ]));
  }
  return m.CrossSection.union(parts);
}

/** A truss running along x from x0 to x1, y0..y1 across, its bottom at z0. */
export function trussAlongX(m: M, x0: number, x1: number, y0: number, y1: number, z0: number, depth: number): Manifold {
  return m.Manifold.extrude(trussProfile(m, x1 - x0, z0, depth), y1 - y0).rotate([90, 0, 0]).translate([x0, y1, 0]);
}

/** A truss running along y from y0 to y1, x0..x1 across, its bottom at z0. */
export function trussAlongY(m: M, y0: number, y1: number, x0: number, x1: number, z0: number, depth: number): Manifold {
  return m.Manifold.extrude(trussProfile(m, y1 - y0, z0, depth), x1 - x0).rotate([90, 0, 90]).translate([x0, y0, 0]);
}
