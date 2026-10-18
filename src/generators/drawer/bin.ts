import type { CrossSection, Manifold } from 'manifold-3d';
import type { BuildCtx } from '../../core/params/types';
import { roundedRect, segmentsForRadius } from '../../core/kernel/primitives';
import { binExtras, LABEL_T, type BinSize, type Derived } from './geometry';

/**
 * The outside of a bin, or -- inset by one wall -- its inside.
 *
 * A stackable bin is narrower at the foot than at the top: the foot is inset by
 * a wall plus clearance, so it drops into another bin's opening. The step
 * between the two is a 45 degree slope rather than a ledge, because printed
 * upright a ledge would be the wall above hanging out over nothing.
 */
function shell(
  ctx: BuildCtx,
  d: Derived,
  s: BinSize,
  inset: number,
  from: number,
  to: number,
): Manifold {
  const { m } = ctx;
  const outline = (extra: number): CrossSection =>
    roundedRect(
      m,
      s.w - 2 * (inset + extra),
      s.d - 2 * (inset + extra),
      Math.max(0.3, d.corner - inset - extra),
    );
  const prism = (cs: CrossSection, z0: number, z1: number) =>
    m.Manifold.extrude(cs, z1 - z0).translate([0, 0, z0]);

  if (!d.stackable) return prism(outline(0), from, to);

  const c = d.footInset;
  const slopeTop = d.lipH + c;
  const thin = 0.01;
  const pieces: Manifold[] = [
    prism(outline(c), from, d.lipH + thin),
    m.Manifold.hull([
      prism(outline(c), d.lipH, d.lipH + thin),
      prism(outline(0), slopeTop - thin, slopeTop),
    ]),
    prism(outline(0), slopeTop - thin, to),
  ];
  return m.Manifold.union(pieces);
}

/** Where the clips cross one bin's walls: the middle of every grid cell along each side. */
export function clipStations(d: Derived, s: BinSize, span: { w: number; h: number }): { xs: number[]; ys: number[] } {
  const xs = Array.from({ length: span.w }, (_, k) => -s.w / 2 + k * (d.cellW + d.gap) + d.cellW / 2);
  const ys = Array.from({ length: span.h }, (_, k) => -s.d / 2 + k * (d.cellD + d.gap) + d.cellD / 2);
  return { xs, ys };
}

/**
 * The notches a connector clip sits in: one through the rim at the middle of
 * every grid cell along every wall. Every bin of a size gets the same set,
 * whether a neighbour is there or not, so bins of a size stay one part and
 * any of them can go anywhere. Where a clip's leg lands on the back wall, the
 * label tab is slotted to let it by.
 */
function clipNotches(ctx: BuildCtx, d: Derived, s: BinSize, span: { w: number; h: number }, labelD: number): Manifold {
  const { m } = ctx;
  const cube = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
    m.Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);
  const hw = d.clipW / 2 + d.clipClear;
  const z0 = d.binH - d.clipT - d.clipClear;
  const top = d.binH + 1;
  const { xs, ys } = clipStations(d, s, span);
  const cuts: Manifold[] = [];
  for (const x of xs) {
    cuts.push(cube(x - hw, x + hw, -s.d / 2 - 1, -s.d / 2 + d.wall + 0.2, z0, top));
    cuts.push(cube(x - hw, x + hw, s.d / 2 - d.wall - 0.2, s.d / 2 + 1, z0, top));
    if (labelD > 2) {
      const back = s.d / 2 - d.wall;
      cuts.push(cube(x - hw, x + hw, back - labelD - 1, back + 0.01, d.labelTop - LABEL_T - labelD - 1, top));
    }
  }
  for (const y of ys) {
    cuts.push(cube(-s.w / 2 - 1, -s.w / 2 + d.wall + 0.2, y - hw, y + hw, z0, top));
    cuts.push(cube(s.w / 2 - d.wall - 0.2, s.w / 2 + 1, y - hw, y + hw, z0, top));
  }
  return m.Manifold.union(cuts);
}

/**
 * One connector clip, as it sits bridging the edge between two bins: a bar
 * across both rims, flush in their notches, and a leg hanging down inside
 * each bin against its wall, so the two cannot part. Built crossing an edge
 * that runs along y (`across` = 'x') or along x, centred on it, z as in the
 * drawer.
 */
export function buildClip(ctx: BuildCtx, d: Derived, across: 'x' | 'y'): Manifold {
  const { m } = ctx;
  const t = d.clipT;
  const c = d.clipClear;
  const inner = d.gap / 2 + d.wall; // each bin's inside face, from the edge
  const reach = inner + c + t;
  const top = d.binH - c;
  const box = (x0: number, x1: number, z0: number, z1: number) =>
    m.Manifold.cube([x1 - x0, d.clipW, z1 - z0]).translate([x0, -d.clipW / 2, z0]);
  const clip = m.Manifold.union([
    box(-reach, reach, top - t, top),
    box(-reach, -inner - c, top - d.clipLeg, top),
    box(inner + c, reach, top - d.clipLeg, top),
  ]);
  return across === 'x' ? clip : clip.rotate([0, 0, 90]);
}

/** One bin, centred on the origin, standing on z = 0. */
export function buildBin(ctx: BuildCtx, d: Derived, s: BinSize, span: { w: number; h: number } = { w: 1, h: 1 }): Manifold {
  const { m } = ctx;
  const { scoopR, labelD } = binExtras(d, s);
  const outer = shell(ctx, d, s, 0, 0, d.binH);
  // Built from below the bed and trimmed to the floor, so the inside follows
  // the foot's step wherever the floor happens to fall.
  const cavity = shell(ctx, d, s, d.wall, -1, d.binH + 1).intersect(
    m.Manifold.cube([s.w + 2, s.d + 2, d.binH + 2]).translate([
      -s.w / 2 - 1,
      -s.d / 2 - 1,
      d.floor,
    ]),
  );

  let bin = outer.subtract(cavity);
  const extras: Manifold[] = [];
  if (scoopR > 1) extras.push(scoop(ctx, d, s, scoopR));
  if (labelD > 2) extras.push(labelTab(ctx, d, s, labelD));
  // Clipped to the outside, so neither can poke through the stepped-in foot
  // or a rounded corner.
  if (extras.length > 0) bin = bin.add(m.Manifold.union(extras).intersect(outer));
  if (d.connectors) bin = bin.subtract(clipNotches(ctx, d, s, span, labelD));
  return bin;
}

/**
 * Fillet between the floor and the front wall: a block in the corner with a
 * cylinder taken out of it, so the floor curves up into the wall.
 */
function scoop(ctx: BuildCtx, d: Derived, s: BinSize, r: number): Manifold {
  const { m } = ctx;
  const len = s.w;
  const front = -s.d / 2 + d.wall;
  const block = m.Manifold.cube([len, r + 1, r + 1]).translate([-len / 2, front - 1, d.floor - 1]);
  const round = m.Manifold.cylinder(len + 2, r, r, segmentsForRadius(r, 0.2), true)
    .rotate([0, 90, 0])
    .translate([0, front + r, d.floor + r]);
  return block.subtract(round);
}

/**
 * Ledge along the back wall for a label. Flat on top, and a 45 degree slope
 * underneath back into the wall, so it builds out layer by layer with nothing
 * printed in mid-air.
 */
function labelTab(ctx: BuildCtx, d: Derived, s: BinSize, L: number): Manifold {
  const { m } = ctx;
  const back = s.d / 2 - d.wall;
  const top = d.labelTop;
  // Drawn in (y, z), then stood up along X.
  const profile = m.CrossSection.ofPolygons([
    [
      [back + 1, top - LABEL_T - L],
      [back + 1, top],
      [back - L, top],
      [back - L, top - LABEL_T],
      [back, top - LABEL_T - L],
    ],
  ]);
  const len = s.w;
  return m.Manifold.extrude(profile, len).rotate([90, 0, 90]).translate([-len / 2, 0, 0]);
}
