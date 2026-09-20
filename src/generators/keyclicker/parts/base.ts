import type { CrossSection, Manifold } from 'manifold-3d';
import type { BuildCtx } from '../../../core/params/types';
import { roundedRect, segmentsForRadius, taperedExtrude } from '../../../core/kernel/primitives';
import { keyX, type Derived } from '../geometry';

/**
 * The bar the keys live in: a plate on top with a cutout per key, walls, and an
 * open bottom that the cover closes.
 *
 * That is a keyboard case in miniature, and for the same reason: a switch clips
 * onto the plate from UNDERNEATH, so the bottom has to open or there is no way
 * to get the switches in. It also means the pins end up inside the bar instead
 * of against your leg.
 *
 * Prints plate-side down. The cavity ceiling is then the bed-facing face, the
 * cutouts need no bridging, and the only overhang left is the cover's rebate,
 * which is a 45 degree step.
 */
export function buildBase(ctx: BuildCtx, d: Derived): Manifold {
  const { m } = ctx;

  const outline = roundedRect(m, d.baseW, d.baseD, d.baseCorner);
  let base: Manifold = m.Manifold.extrude(outline, d.baseH);

  // Chamfer the top edge, which is the only face anyone looks at: lop off the
  // top slab and put back a tapered copy of it.
  if (d.chamfer > 0.05) {
    base = base.subtract(
      m.Manifold.extrude(outline, d.chamfer + 1).translate([0, 0, d.baseH - d.chamfer]),
    );
    base = base.add(
      taperedExtrude(
        m,
        outline,
        d.chamfer,
        (d.baseW - 2 * d.chamfer) / d.baseW,
        (d.baseD - 2 * d.chamfer) / d.baseD,
      ).translate([0, 0, d.baseH - d.chamfer]),
    );
  }

  // --- cavity and cover rebate, for a switch body that has to go in from below
  if (d.sw.hollow) {
    const cavity = roundedRect(
      m,
      d.baseW - 2 * d.wallT,
      d.baseD - 2 * d.wallT,
      Math.max(0, d.baseCorner - d.wallT),
    );
    base = base.subtract(
      m.Manifold.extrude(cavity, d.cavityD + 1).translate([0, 0, -1]),
    );

    const rebate = roundedRect(
      m,
      d.baseW - 2 * (d.wallT - d.coverBead),
      d.baseD - 2 * (d.wallT - d.coverBead),
      Math.max(0, d.baseCorner - d.wallT + d.coverBead),
    );
    base = base.subtract(
      m.Manifold.extrude(rebate, d.coverT + d.clear).translate([0, 0, -0.001]),
    );
  }

  // --- one opening per key
  const openings: Manifold[] = [];
  for (let i = 0; i < d.keys; i++) {
    openings.push(keyOpening(ctx, d).translate([keyX(d, i), 0, 0]));
  }
  base = base.subtract(m.Manifold.union(openings));

  // --- posts and dome seats, only for the printed variant
  if (d.sw.stem === 'post') {
    const towers: Manifold[] = [];
    for (let i = 0; i < d.keys; i++) {
      towers.push(buildPost(ctx, d).translate([keyX(d, i), 0, 0]));
    }
    base = base.add(m.Manifold.union(towers));
  }

  return d.loop ? addLoop(ctx, d, base) : base;
}

/**
 * What gets taken out of the plate for one key.
 *
 * A bought switch wants its exact square cutout and nothing else. The printed
 * variant has no switch, so it gets a well for the keycap skirt to travel in
 * plus a seat for the dome.
 */
function keyOpening(ctx: BuildCtx, d: Derived): Manifold {
  const { m } = ctx;
  const top = d.baseH;

  if (d.sw.cutout > 0) {
    const cut = d.sw.cutout + d.clear;
    // Through the plate only: the cavity below is already open.
    return m.Manifold.extrude(roundedRect(m, cut, cut, 0.4), d.plateT + 2).translate([
      0,
      0,
      top - d.plateT - 1,
    ]);
  }

  const wellSize = d.keySize + 2 * d.clear + 0.4;
  const well = m.Manifold.extrude(
    roundedRect(m, wellSize, wellSize, d.capCorner + d.clear),
    d.wellDepth + 1,
  ).translate([0, 0, top - d.wellDepth]);

  // Seat for the dome to sit flat in, and a clear path for the post.
  const seat = m.Manifold.cylinder(
    d.domeH + 0.4,
    d.domeR + d.clear,
    d.domeR + d.clear,
    segmentsForRadius(d.domeR, 0.1),
  ).translate([0, 0, top - d.wellDepth - d.domeH - 0.4 + 0.001]);

  return m.Manifold.union([well, seat]);
}

/**
 * The guide post for the printed variant: the keycap slides on it, and the barb
 * at the top is what stops the cap leaving when the dome pushes it back.
 *
 * A post rather than a bore, because a post prints as a clean vertical column
 * while a bore of the same size puts the retaining lip on an internal overhang
 * you cannot see, let alone deburr.
 */
function buildPost(ctx: BuildCtx, d: Derived): Manifold {
  const { m } = ctx;
  const segs = segmentsForRadius(d.postR, 0.08);
  const floor = d.baseH - d.wellDepth - d.domeH - 0.4;

  // Reach DOWN into the floor as well as up out of it. A post that merely
  // stands on the seat meets it on one plane, and a plane of contact is not a
  // join: it serialises as a separate shell and prints as a loose pin.
  const root = Math.min(d.floorT * 0.7, 1.5);
  const shaft = m.Manifold.cylinder(d.postH + root, d.postR, d.postR, segs)
    .translate([0, 0, -root]);
  // 30 degrees on, 45 degrees off: pushes together by hand, comes apart with a
  // deliberate pull rather than never.
  const barbR = d.postR + Math.max(0.35, d.clear + 0.25);
  const barb = m.Manifold.union([
    m.Manifold.cylinder(0.9, d.postR, barbR, segs),
    m.Manifold.cylinder(0.7, barbR, d.postR, segs).translate([0, 0, 0.9]),
  ]).translate([0, 0, d.postH - 1.6]);

  return m.Manifold.union([shaft, barb]).translate([0, 0, floor]);
}

/** Keyring loop, on the end of the bar or on its long side. */
function addLoop(ctx: BuildCtx, d: Derived, base: Manifold): Manifold {
  const { m } = ctx;
  const lugR = d.loopD / 2 + Math.max(1.8, d.wallT);
  const thickness = Math.min(d.baseH * 0.6, lugR * 1.6);
  const z = d.baseH / 2;

  let centre: [number, number];
  let web: CrossSection;
  if (d.loopSide === 'side') {
    const cy = d.baseD / 2 + lugR - 1.4;
    centre = [0, cy];
    web = roundedRect(m, lugR * 2, lugR * 1.6, lugR * 0.5).translate([0, cy - lugR * 0.7]);
  } else {
    const cx = d.baseW / 2 + lugR - 1.4;
    centre = [cx, 0];
    web = roundedRect(m, lugR * 1.6, lugR * 2, lugR * 0.5).translate([cx - lugR * 0.7, 0]);
  }

  const lug = m.Manifold.extrude(
    m.CrossSection.circle(lugR, 48).translate(centre),
    thickness,
  ).translate([0, 0, z - thickness / 2]);
  const webSolid = m.Manifold.extrude(web, thickness).translate([0, 0, z - thickness / 2]);
  const hole = m.Manifold.cylinder(thickness + 4, d.loopD / 2, d.loopD / 2, 32)
    .translate([centre[0], centre[1], z - thickness / 2 - 2]);

  return base.add(lug).add(webSolid).subtract(hole);
}

/**
 * The bottom cover. Drops into the rebate and is held by the bead; the notch
 * at each end gives a fingernail somewhere to go when a switch needs changing.
 */
export function buildCover(ctx: BuildCtx, d: Derived): Manifold {
  const { m } = ctx;
  const w = d.baseW - 2 * (d.wallT - d.coverBead) - 2 * d.clear;
  const h = d.baseD - 2 * (d.wallT - d.coverBead) - 2 * d.clear;
  const corner = Math.max(0, d.baseCorner - d.wallT + d.coverBead);

  let cover: Manifold = m.Manifold.extrude(roundedRect(m, w, h, corner), d.coverT);

  // Bead, tapered on the way in so it can be pressed home with a thumb.
  const bead = taperedExtrude(
    m,
    roundedRect(m, w, h, corner),
    d.coverBead,
    (w - 2 * d.coverBead) / w,
    (h - 2 * d.coverBead) / h,
  ).translate([0, 0, d.coverT - 0.001]);

  cover = cover.add(bead);

  const notch = m.Manifold.cube([3, h + 2, d.coverT * 0.5], true);
  cover = cover.subtract(notch.translate([-w / 2, 0, d.coverT * 0.25]));
  cover = cover.subtract(notch.translate([w / 2, 0, d.coverT * 0.25]));
  return cover;
}
