import type { CrossSection, Manifold } from 'manifold-3d';
import type { BuildCtx } from '../../../core/params/types';
import { roundedRect, segmentsForRadius, taperedExtrude } from '../../../core/kernel/primitives';
import { textOutline } from '../../../core/text/textSolid';
import type { Derived } from '../geometry';

/**
 * Standard stem dimensions. The MX cross is 4.0 x 1.17 mm arms, 4 mm deep, and
 * the Choc pair is two 1.2 x 3.0 mm posts on 5.7 mm centres. Both are copied
 * from the switch, not invented, which is why they are constants and not
 * sliders -- `fitOffset` is the only thing that should be trimming them.
 */
const MX_ARM = 4.0;
const MX_SLOT = 1.17;
const MX_DEPTH = 4.0;
const CHOC_POST = [1.2, 3.0] as const;
const CHOC_SPACING = 5.7;
const CHOC_DEPTH = 3.0;

/** The glyph for one key, as a 2D outline sized to the cap. */
export function legendOutline(
  ctx: BuildCtx,
  d: Derived,
  fontId: string,
  ch: string,
): CrossSection | null {
  try {
    return textOutline(ctx.m, ctx.font(fontId), {
      text: ch,
      capHeightMm: d.legendSize,
      tolerance: ctx.tolerance,
    });
  } catch {
    // A character with no printable outline (a space that slipped through, an
    // unmapped glyph) leaves the cap blank rather than failing the build.
    return null;
  }
}

/**
 * One keycap, modelled skirt-down with the legend face at +Z.
 *
 * How it prints depends entirely on the legend, and the two options are a real
 * trade:
 *
 *   - Cut in (engraved / inlay): print UPSIDE DOWN. The stem grows off the bed,
 *     the top face is pressed flat against the plate, and nothing needs
 *     support. An inlay is then simply the first few layers of the print, which
 *     is exactly what a filament change at layer N gives you.
 *   - RAISED: the letters stand proud of the top face, so that face cannot go
 *     on the bed. The cap prints the right way up and the hollow underside
 *     needs support. `build` says so on the part.
 */
export function buildKeycap(
  ctx: BuildCtx,
  d: Derived,
  legend: CrossSection | null,
): { cap: Manifold; insert: Manifold | null } {
  const { m } = ctx;

  const outer = roundedRect(m, d.keySize, d.keySize, d.capCorner);
  const scaleTop = d.capTopSize / d.keySize;
  let cap: Manifold = taperedExtrude(m, outer, d.capH, scaleTop);

  // Hollow it out from below, leaving the top face and the skirt walls.
  const innerBottom = roundedRect(
    m,
    d.keySize - 2 * d.capWall,
    d.keySize - 2 * d.capWall,
    Math.max(0, d.capCorner - d.capWall),
  );
  const innerH = d.capH - d.capTop;
  if (innerH > 0.4) {
    const innerScale = Math.max(
      0.2,
      (d.capTopSize - 2 * d.capWall) / (d.keySize - 2 * d.capWall),
    );
    cap = cap.subtract(
      taperedExtrude(m, innerBottom, innerH + 1, innerScale).translate([0, 0, -1]),
    );
  }

  // The stem goes on BEFORE the dish is cut, not after.
  //
  // Every stem is a boss that rises to the full cap height, because that is
  // what gives the socket its roof. Unioned on after the scoop, it fills the
  // middle of the scoop straight back in and leaves a disc standing flush with
  // the un-dished top -- a hard circle stamped across the face, with the legend
  // sitting on top of it. Cut the dish last and it takes the boss down with the
  // rest of the face.
  cap = cap.add(buildStem(ctx, d));

  // Dished top: a shallow spherical scoop, so the finger has something to sit
  // in. Subtracted from above, which inverted is a bed-facing dome.
  //
  // The sphere is sized by where it has to MEET the top plane, and that has to
  // be the far CORNER of the top face, not the middle of its edge. Sizing it to
  // capTopSize / 2 -- the circle inscribed in a square top -- scoops only that
  // inscribed circle and leaves the four corners standing at full height, which
  // reads as a hard circular rim stamped into the keycap.
  if (d.dish > 0.05) {
    // Outermost point of the top footprint: the tapered extrude scales the
    // whole rounded square, corner radius included.
    const cornerTop = Math.min(
      (d.capCorner * d.capTopSize) / d.keySize,
      d.capTopSize / 2,
    );
    const reach = Math.SQRT2 * (d.capTopSize / 2 - cornerTop) + cornerTop;

    // Sphere through (reach, capH) with its low point `dish` below capH.
    const r = (reach * reach + d.dish * d.dish) / (2 * d.dish);
    cap = cap.subtract(
      m.Manifold.sphere(r, 128).translate([0, 0, d.capH + r - d.dish]),
    );
  }

  if (!legend || d.legendStyle === 'none') return { cap, insert: null };

  // Raised: grow the glyph from INSIDE the solid top face up past the surface,
  // then subtract the cap. What is left is exactly the material standing proud,
  // so the letters follow the dish they sit in rather than floating over it or
  // sinking into it -- and starting inside the face, not at z = 0, keeps the
  // prism out of the cap's hollow, where it would survive the subtraction as a
  // loose block.
  if (d.legendStyle === 'raised') {
    // Trim to the top face: a legend that overruns the cap would otherwise
    // leave letter tips hanging in mid-air beside it.
    const clipped = legend.intersect(
      roundedRect(m, d.capTopSize, d.capTopSize, d.capCorner),
    );
    if (!(clipped.area() > 0)) return { cap, insert: null };

    const proud = clipped
      .extrude(d.capTop + d.legendDepth)
      .translate([0, 0, d.capH - d.capTop])
      .subtract(cap);
    return { cap, insert: proud };
  }

  // Cut in. The inlay is the INTERSECTION of the cutter with the cap, not the
  // cutter trimmed by it. That is what makes it flush: intersecting gives back
  // exactly the material the recess removed, so it can be neither proud of a
  // dished top nor short of the recess floor, whatever shape that floor turned
  // out to be.
  const cutter = legend
    .extrude(d.legendDepth + 1)
    .translate([0, 0, d.capH - d.legendDepth - d.dish]);

  return {
    cap: cap.subtract(cutter),
    insert: d.legendStyle === 'inlay' ? cap.intersect(cutter) : null,
  };
}

function buildStem(ctx: BuildCtx, d: Derived): Manifold {
  const { m } = ctx;
  const roof = d.capH - d.capTop;

  if (d.sw.stem === 'mx') {
    const slot = MX_SLOT + d.clear;
    const arm = MX_ARM + d.clear;
    // The cross is the HOLE, so the stem is a round boss with a cross cut out.
    const bossR = arm / 2 + Math.max(1, 2.5 * d.nozzle);
    const boss = m.Manifold.cylinder(
      MX_DEPTH + d.capTop,
      bossR,
      bossR,
      segmentsForRadius(bossR, 0.08),
    ).translate([0, 0, roof - MX_DEPTH]);
    const cross = m.CrossSection.union([
      m.CrossSection.square([arm, slot], true),
      m.CrossSection.square([slot, arm], true),
    ]);
    // The socket overshoots DOWNWARD only, to clear the boss's open bottom
    // without a coplanar face. Overshooting upward as well would eat into the
    // roof above the socket, and that roof is only `capTop` thick -- with a
    // dish scooped out of it from the other side, half a millimetre is the
    // difference between a closed top and a cross-shaped hole through it.
    return boss.subtract(
      m.Manifold.extrude(cross, MX_DEPTH + 0.5).translate([0, 0, roof - MX_DEPTH - 0.5]),
    );
  }

  if (d.sw.stem === 'choc') {
    const w = CHOC_POST[0] + d.clear;
    const h = CHOC_POST[1] + d.clear;
    const shell = roundedRect(m, CHOC_SPACING + w + 2.4, h + 2.4, 0.8);
    const block = m.Manifold.extrude(shell, CHOC_DEPTH + d.capTop).translate([
      0,
      0,
      roof - CHOC_DEPTH,
    ]);
    const sockets = m.CrossSection.union([
      m.CrossSection.square([w, h], true).translate([-CHOC_SPACING / 2, 0]),
      m.CrossSection.square([w, h], true).translate([CHOC_SPACING / 2, 0]),
    ]);
    // Downward overshoot only -- see the MX socket above.
    return block.subtract(
      m.Manifold.extrude(sockets, CHOC_DEPTH + 0.5).translate([0, 0, roof - CHOC_DEPTH - 0.5]),
    );
  }

  // Printed variant: a tube that runs on the base's post, with an internal
  // groove the post's barb sits in. The groove length IS the key travel.
  const boreR = d.postR + d.clear;
  const wall = Math.max(1, 2.5 * d.nozzle);
  const tubeR = boreR + wall;
  const tubeH = Math.min(roof, d.postH + d.travel);
  const tube = m.Manifold.cylinder(
    tubeH + d.capTop,
    tubeR,
    tubeR,
    segmentsForRadius(tubeR, 0.08),
  ).translate([0, 0, roof - tubeH]);

  // Downward overshoot only -- see the MX socket above.
  const bore = m.Manifold.cylinder(
    tubeH + 0.5,
    boreR,
    boreR,
    segmentsForRadius(boreR, 0.08),
  ).translate([0, 0, roof - tubeH - 0.5]);

  const grooveR = boreR + Math.max(0.4, d.clear + 0.3);
  const groove = m.Manifold.cylinder(
    d.travel + 1.6,
    grooveR,
    grooveR,
    segmentsForRadius(grooveR, 0.08),
  ).translate([0, 0, roof - tubeH - 0.5]);

  return tube.subtract(bore).subtract(groove);
}

/**
 * The printed snap dome: a shallow cone that buckles through centre under a
 * thumb and springs back, which is where both the click and the return come
 * from.
 *
 * Axisymmetric, so it is a revolve of a profile -- the one way this kernel can
 * make a shell like this exactly. Printed apex-up it is a self-supporting cone
 * and needs nothing underneath it.
 *
 * Height over thickness is what decides whether it snaps or just squashes;
 * around 2 to 3 is the usable band, and `validate` says so when it is not.
 */
export function buildDome(ctx: BuildCtx, d: Derived): Manifold {
  const { m } = ctx;
  const t = d.domeWall;
  const rim = Math.max(0.8, t * 1.6);

  // Profile in (radius, height), revolved about the Y axis.
  const profile = m.CrossSection.ofPolygons(
    [
      [
        [0, d.domeH],
        [0, d.domeH + t],
        [d.domeR, t],
        [d.domeR, 0],
        [d.domeR - rim, 0],
        [d.domeR - rim, t * 0.6],
      ],
    ],
    'NonZero',
  );
  return m.Manifold.revolve(profile, segmentsForRadius(d.domeR, 0.08));
}
