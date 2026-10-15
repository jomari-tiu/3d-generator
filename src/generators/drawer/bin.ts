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

/** One bin, centred on the origin, standing on z = 0. */
export function buildBin(ctx: BuildCtx, d: Derived, s: BinSize): Manifold {
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
