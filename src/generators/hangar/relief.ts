import type { CrossSection, ManifoldToplevel } from 'manifold-3d';

type M = ManifoldToplevel;

/**
 * One layer of wall relief: a section drawn on the wall face in (a, z) -- a
 * runs along the wall, z up it -- and how far it stands off the face. The
 * caller stands each layer on whichever wall it is decorating.
 */
export interface ReliefLayer {
  readonly section: CrossSection;
  readonly height: number;
}

/** Tallest any layer stands, so callers can keep moving parts clear of it. */
export const RELIEF_MAX = 1.5;

const FRAME_W = 1.4;
const FRAME_H = 0.8;
const BRACE_W = 1.3;
const BRACE_H = 1.1;
const HUB_H = RELIEF_MAX;
const BOLT_H = 1.2;
const PLATE_H = 0.6;
const GAP = 1;

function rect(m: M, a0: number, a1: number, z0: number, z1: number): CrossSection {
  return m.CrossSection.square([a1 - a0, z1 - z0]).translate([a0, z0]);
}

/** A bar of width w from p to q. */
function bar(m: M, [a0, z0]: [number, number], [a1, z1]: [number, number], w: number): CrossSection {
  const len = Math.hypot(a1 - a0, z1 - z0);
  const na = (-(z1 - z0) / len) * (w / 2);
  const nz = ((a1 - a0) / len) * (w / 2);
  return new m.CrossSection([[
    [a0 + na, z0 + nz], [a0 - na, z0 - nz], [a1 - na, z1 - nz], [a1 + na, z1 + nz],
  ]]).simplify(1e-6);
}

/**
 * A wall of steel bays in the given zone: a raised frame round each, and
 * inside it either a pair of cross braces meeting on a hub, or a plain plate
 * with its corners cut and a bar across it. A bolt at each frame corner.
 *
 * The bays are sized to fill the zone exactly, about `bay` wide and half as
 * tall again; a zone too small for even one bay gets nothing.
 */
export function framedBays(m: M, a0: number, a1: number, z0: number, z1: number, bay: number): ReliefLayer[] {
  const w = a1 - a0;
  const h = z1 - z0;
  if (w < 10 || h < 8) return [];
  const cols = Math.max(1, Math.round(w / bay));
  const rows = Math.max(1, Math.round(h / (bay * 1.4)));
  const bw = (w - (cols - 1) * GAP) / cols;
  const bh = (h - (rows - 1) * GAP) / rows;

  const frames: CrossSection[] = [];
  const braces: CrossSection[] = [];
  const hubs: CrossSection[] = [];
  const plates: CrossSection[] = [];
  const bolts: CrossSection[] = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const ba = a0 + i * (bw + GAP);
      const bz = z0 + j * (bh + GAP);
      const outer = rect(m, ba, ba + bw, bz, bz + bh);
      const ia = ba + FRAME_W;
      const ib = ba + bw - FRAME_W;
      const iz0 = bz + FRAME_W;
      const iz1 = bz + bh - FRAME_W;
      frames.push(outer.subtract(rect(m, ia, ib, iz0, iz1)));
      for (const [ca, cz] of [[ia - 0.7, iz0 - 0.7], [ib + 0.7, iz0 - 0.7], [ia - 0.7, iz1 + 0.7], [ib + 0.7, iz1 + 0.7]] as const) {
        bolts.push(m.CrossSection.circle(0.5, 16).translate([ca, cz]));
      }
      if (ib - ia < 6 || iz1 - iz0 < 6) continue;
      const inner = rect(m, ia, ib, iz0, iz1);
      // Every third bay, offset row by row, is a plain plate for variety.
      if ((i + 2 * j) % 3 === 2) {
        const k = Math.min(3, (ib - ia) / 5, (iz1 - iz0) / 5);
        plates.push(inner.offset(-(1.2 + k), 'Miter').offset(k, 'Square'));
        const mz = (iz0 + iz1) / 2;
        plates.push(rect(m, ia + 1, ib - 1, mz - 0.6, mz + 0.6));
        continue;
      }
      braces.push(
        m.CrossSection.union([
          bar(m, [ia, iz0], [ib, iz1], BRACE_W),
          bar(m, [ia, iz1], [ib, iz0], BRACE_W),
        ]).intersect(inner.offset(0.3, 'Miter')),
      );
      const r = Math.min(2.2, (ib - ia) / 6, (iz1 - iz0) / 6);
      hubs.push(m.CrossSection.circle(r, 24).translate([(ia + ib) / 2, (iz0 + iz1) / 2]));
    }
  }
  const layer = (parts: CrossSection[], height: number): ReliefLayer[] =>
    parts.length > 0 ? [{ section: m.CrossSection.union(parts), height }] : [];
  return [
    ...layer(frames, FRAME_H),
    ...layer(plates, PLATE_H),
    ...layer(braces, BRACE_H),
    ...layer(hubs, HUB_H),
    ...layer(bolts, BOLT_H),
  ];
}
