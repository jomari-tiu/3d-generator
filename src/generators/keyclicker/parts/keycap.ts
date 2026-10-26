import type { CrossSection, Manifold } from 'manifold-3d';
import type { BuildCtx } from '../../../core/params/types';
import { roundedRect, segmentsForRadius, taperedExtrude } from '../../../core/kernel/primitives';
import { textOutline } from '../../../core/text/textSolid';
import type { Derived } from '../geometry';
import { insetSquare, roundedTop } from './rounding';

/**
 * Standard stem dimensions. The MX cross is 4.0 x 1.17 mm arms, 4 mm deep, and
 * the Choc pair is two 1.2 x 3.0 mm posts on 5.7 mm centres. Both are copied
 * from the switch, not invented, which is why they are constants and not
 * sliders -- `stemClearance` and `fitOffset` are what trim them.
 */
const MX_ARM = 4.0;
const MX_SLOT = 1.17;
const MX_DEPTH = 4.0;
/** Outside of the round stem around the cross, measured off a cap that fits. */
const MX_BOSS = 5.57;
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
  const built = d.capRound > 0.05 ? buildRoundedKeycap(ctx, d, legend) : buildSquareKeycap(ctx, d, legend);
  if (d.skirtLift <= 0.001) return built;
  // Cut the skirt back so the pressed key clears the plate (see skirtLift).
  // Everything outside the switch's cutout goes -- that is all skirt, and it
  // is what would land on the plate -- and the stem, which hangs over the
  // switch and so inside its cutout, is left whole.
  const { m } = ctx;
  const keep = Math.max(1, d.sw.cutout - 0.2);
  const ring = m.CrossSection.square([d.keySize + 4, d.keySize + 4], true)
    .subtract(m.CrossSection.square([keep, keep], true));
  return { ...built, cap: built.cap.subtract(m.Manifold.extrude(ring, d.skirtLift + 1).translate([0, 0, -1])) };
}

function buildSquareKeycap(
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
  //
  // Outermost point of the top footprint: the tapered extrude scales the whole
  // rounded square, corner radius included.
  const cornerTop = Math.min((d.capCorner * d.capTopSize) / d.keySize, d.capTopSize / 2);
  const reach = Math.SQRT2 * (d.capTopSize / 2 - cornerTop) + cornerTop;
  // Sphere through (reach, capH) with its low point `dish` below capH.
  const dishR = d.dish > 0.05 ? (reach * reach + d.dish * d.dish) / (2 * d.dish) : 0;
  const dishZ = d.capH + dishR - d.dish;
  if (dishR > 0) {
    cap = cap.subtract(m.Manifold.sphere(dishR, 128).translate([0, 0, dishZ]));
  }

  // Domed top: a spherical cap, its high point `capDome` above the edges, that
  // meets the top plane at the middle of each EDGE -- then hulled with the top
  // face so it runs out into the corners too.
  //
  // Neither plain sphere works on a square face. One sized to the corners, as
  // the dish is, still stands well above the plane at the middle of each edge,
  // and the footprint clips it into a vertical step there: a lid sitting on the
  // key. One sized to the edges falls below the plane before the corners, and
  // leaves them flat with a circular seam around them.
  const half = d.capTopSize / 2;
  const domeR = d.capDome > 0.05 ? (half * half + d.capDome * d.capDome) / (2 * d.capDome) : 0;
  const domeZ = d.capH + d.capDome - domeR;
  if (domeR > 0) {
    const crown = m.Manifold.sphere(domeR, 128)
      .translate([0, 0, domeZ])
      .intersect(
        m.Manifold.cube([d.capTopSize + 2, d.capTopSize + 2, d.capDome + 1]).translate([
          -half - 1,
          -half - 1,
          d.capH,
        ]),
      );
    const face = m.Manifold.extrude(roundedRect(m, d.capTopSize, d.capTopSize, cornerTop), 0.01)
      .translate([0, 0, d.capH - 0.01]);
    cap = cap.add(m.Manifold.hull([crown, face]));
  }

  if (!legend || d.legendStyle === 'none') return { cap, insert: null };
  if (d.legendStyle === 'separate') return separateLetter(ctx, d, cap, legend);

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

    let prism = clipped
      .extrude(d.capTop + d.capDome + d.legendDepth)
      .translate([0, 0, d.capH - d.capTop]);
    // On a dome a flat-topped letter would be buried at the crown and float at
    // its edges, so its top is the dome itself, raised by the legend depth.
    if (domeR > 0) {
      prism = prism.intersect(
        m.Manifold.sphere(domeR + d.legendDepth, 128).translate([0, 0, domeZ]),
      );
    }
    // In a dish a flat-topped letter stands tall in the hollow and barely
    // clears the rim, so its top is the dish lifted by the legend depth.
    if (dishR > 0) {
      prism = prism.subtract(
        m.Manifold.sphere(dishR - d.legendDepth, 128).translate([0, 0, dishZ]),
      );
    }
    return { cap, insert: prism.subtract(cap) };
  }

  // Cut in. The inlay is the INTERSECTION of the cutter with the cap, not the
  // cutter trimmed by it. That is what makes it flush: intersecting gives back
  // exactly the material the recess removed, so it can be neither proud of a
  // dished top nor short of the recess floor, whatever shape that floor turned
  // out to be.
  //
  // On a dome a flat-bottomed cutter would be full depth at the crown and
  // nearly nothing at the letter's edges -- too thin there for the second
  // colour to cover -- so the floor follows the dome, the legend depth under it.
  const cutter =
    domeR > 0
      ? legend
          .extrude(d.capTop + d.capDome + 1)
          .translate([0, 0, d.capH - d.capTop])
          .subtract(m.Manifold.sphere(domeR - d.legendDepth, 128).translate([0, 0, domeZ]))
      : legend.extrude(d.legendDepth + 1).translate([0, 0, d.capH - d.legendDepth - d.dish]);

  return {
    cap: cap.subtract(cutter),
    insert: d.legendStyle === 'inlay' ? cap.intersect(cutter) : null,
  };
}

/**
 * A keycap with its top edge rounded over, out to a ball at the limit.
 *
 * Its own path rather than a step bolted onto the square one, because the
 * round-over moves the outside of the cap and three things hung off the old
 * outside have to follow it:
 *
 *   - The hollow. A round-over big enough to matter cuts down past the roof,
 *     and a hollow sized to the square cap would break out through the curve.
 *     So the hollow is sized from the curved outside at every height: a wall in
 *     from the side, and a roof's thickness down from the surface above it.
 *   - The stem. It rises to the full cap height for its roof, and on a ball
 *     the curve falls below that only a couple of millimetres out from the
 *     middle -- the boss would stand out of the top as a cylinder. It is
 *     trimmed to the outside.
 *   - The legend. A flat-topped letter over a curve floats at one edge and is
 *     buried at the other. Raised letters are the outside lifted by the legend
 *     depth, cut-in ones the outside lowered by it, so both follow the surface
 *     wherever they land on it.
 */
function buildRoundedKeycap(
  ctx: BuildCtx,
  d: Derived,
  legend: CrossSection | null,
): { cap: Manifold; insert: Manifold | null } {
  const { m } = ctx;
  const r = d.capRound;
  const rz = d.capRoundZ;
  const start = d.capH - rz;

  // The tapered footprint at height z, before any round-over: the taper scales
  // the whole rounded square, corner radius included.
  const side = (z: number): number => d.keySize + ((d.capTopSize - d.keySize) * z) / d.capH;
  const corner = (z: number): number => (d.capCorner * side(z)) / d.keySize;
  const inset = (z: number): number => {
    if (z <= start) return 0;
    const v = Math.min(1, (z - start) / rz);
    return r * (1 - Math.sqrt(1 - v * v));
  };
  /** Outside width at height z; 0 above the top. */
  const width = (z: number): number => (z >= d.capH ? 0 : Math.max(0, side(z) - 2 * inset(z)));
  /** Outside corner radius at height z -- what insetSquare makes of it there. */
  const outsideCorner = (z: number): number => Math.min(corner(z) + inset(z), width(z) / 2);

  // The edge itself: a fillet, rz down and r in.
  let shell = roundedTop(m, (z, i) => insetSquare(m, side(z), side(z), corner(z), i), d.capH, r, rz);

  // The ball. A fillet alone, however deep, rounds a square into a pyramid:
  // its slices are squares to the top, so creases run up the four diagonals
  // to a peak. A ball on a square key has its CORNERS lowest, which is the key
  // trimmed by an ellipsoid -- circles in plan, so no diagonal is any higher
  // than the edge beside it. Its width shrinks as the round-over deepens: far
  // too wide to touch anything for a light fillet, and at the full extent
  // exactly through the top face's corners where the fillet starts, so the
  // dome meets the sides with no step and the top is a ball.
  const cornerTop = Math.min(corner(d.capH), d.capTopSize / 2);
  const cornerReach = Math.SQRT2 * (d.capTopSize / 2 - cornerTop) + cornerTop;
  const fullness = r / (d.capTopSize / 2);
  const ballR = cornerReach / Math.max(fullness, 1e-3);
  const ballZ = d.capH - rz;
  const ball = (shrinkR: number, shrinkZ: number): Manifold =>
    m.Manifold.sphere(1, 128)
      .scale([Math.max(0.05, ballR - shrinkR), Math.max(0.05, ballR - shrinkR), Math.max(0.05, rz - shrinkZ)])
      .translate([0, 0, ballZ])
      // Below its equator the ellipsoid would pinch the skirt in; it only
      // shapes the top.
      .add(m.Manifold.cube([d.keySize * 4, d.keySize * 4, ballZ + 2]).translate([-d.keySize * 2, -d.keySize * 2, -2]));
  shell = shell.intersect(ball(0, 0));

  // A dome on what is left of the flat top, hulled in so it runs out over the
  // round-over. Once the round-over has taken the whole top there is nothing
  // flat left to dome, and the ball already is one.
  const flatHalf = d.capTopSize / 2 - r;
  if (d.capDome > 0.05 && flatHalf > 0.5) {
    const domeR = (flatHalf * flatHalf + d.capDome * d.capDome) / (2 * d.capDome);
    const crown = m.Manifold.sphere(domeR, 128)
      .translate([0, 0, d.capH + d.capDome - domeR])
      .intersect(
        m.Manifold.cube([2 * flatHalf + 2, 2 * flatHalf + 2, d.capDome + 1]).translate([
          -flatHalf - 1,
          -flatHalf - 1,
          d.capH,
        ]),
      );
    shell = m.Manifold.hull([shell, crown]);
  }

  // The hollow, sized from the curved outside at each height: the narrower of
  // a wall in from the side here and the outside a roof's thickness higher up.
  // Both are concave in z, so the narrower is too, and the hull of the slices
  // stays inside the curve between them rather than bulging out through it.
  const roof = d.capH - d.capTop;
  const hollowSlices: Manifold[] = [];
  const steps = 24;
  for (let k = 0; k <= steps; k++) {
    const z = k === 0 ? -1 : (roof * k) / steps;
    const zz = Math.max(0, z);
    const w = Math.min(width(zz) - 2 * d.capWall, width(zz + d.capTop));
    if (w < 0.4) continue;
    // The outside's own corner less the wall: a tighter corner than that
    // would reach out along the diagonal and thin the wall there.
    const c = Math.max(0, Math.min(outsideCorner(zz) - d.capWall, w / 2));
    hollowSlices.push(m.Manifold.extrude(roundedRect(m, w, w, c), 0.001).translate([0, 0, z]));
  }
  let cap = shell;
  if (roof > 0.4 && hollowSlices.length >= 2) {
    // The hollow above is sized from the fillet; the ball trims the outside
    // further, so the hollow is trimmed by the same ball pulled in by a wall
    // and a roof, keeping both under it.
    cap = cap.subtract(m.Manifold.hull(hollowSlices).intersect(ball(d.capWall, d.capTop)));
  }

  // Stem before the dish, as on the square cap, and trimmed to the outside.
  cap = cap.add(buildStem(ctx, d).intersect(shell));

  // The dish scoops what is left of the flat top, meeting the top plane at the
  // corner of THAT, as the square cap's does at the corner of its whole face.
  // Sized to the whole face instead, it carves a shallow square pit into the
  // crown of a ball. Once the round-over has taken the top there is nothing
  // to scoop, and the ball is what was asked for.
  let surface = shell;
  if (d.dish > 0.05 && flatHalf > 1) {
    const cornerTop = Math.min(corner(d.capH), flatHalf);
    const reach = Math.SQRT2 * (flatHalf - cornerTop) + cornerTop;
    // Shallower in proportion, or the same depth over a smaller patch is a pit.
    const depth = (d.dish * flatHalf) / (d.capTopSize / 2);
    const dishR = (reach * reach + depth * depth) / (2 * depth);
    const scoop = m.Manifold.sphere(dishR, 128).translate([0, 0, d.capH + dishR - depth]);
    cap = cap.subtract(scoop);
    surface = surface.subtract(scoop);
  }

  if (!legend || d.legendStyle === 'none') return { cap, insert: null };
  if (d.legendStyle === 'separate') return separateLetter(ctx, d, cap, legend);

  // Prisms run from the floor up past the crown; the surface decides where the
  // letter actually is. Subtracting the SOLID outside, not the hollow cap, is
  // what keeps them out of the hollow: inside it, the outside is still solid.
  const tall = d.capH + d.capDome + d.legendDepth + 1;
  if (d.legendStyle === 'raised') {
    const clipped = legend.intersect(roundedRect(m, d.capTopSize, d.capTopSize, d.capCorner));
    if (!(clipped.area() > 0)) return { cap, insert: null };
    const skin = clipped
      .extrude(tall)
      .intersect(surface.translate([0, 0, d.legendDepth]))
      .subtract(surface);
    return { cap, insert: skin };
  }

  const cutter = legend.extrude(tall).subtract(surface.translate([0, 0, -d.legendDepth]));
  return {
    cap: cap.subtract(cutter),
    insert: d.legendStyle === 'inlay' ? cap.intersect(cutter) : null,
  };
}

/**
 * A letter printed on its own, and the recess in the cap it presses into.
 *
 * The letter is a plain flat extrusion so it prints on the bed with nothing
 * under it, in whatever colour -- which is the point of making it separately.
 * Its top is a legend depth above the HIGHEST point of the cap under it, so
 * on a dome it is proud at the crown too and not sunk below it.
 *
 * The recess floor is FLAT, because the letter's underside is. It sits a
 * legend depth below the LOWEST point of the top anywhere under the letter --
 * found by measuring, not assumed -- so on a dish, a dome or a rounded edge
 * the letter is fully seated everywhere and stands proud by at least the
 * legend depth. A floor at a fixed height would leave part of a letter on a
 * curve hanging over air.
 */
function separateLetter(
  _ctx: BuildCtx,
  d: Derived,
  cap: Manifold,
  legend: CrossSection,
): { cap: Manifold; insert: Manifold | null } {
  const roof = d.capH - d.capTop;
  // Highest h with the prism from the roof up to h still entirely inside the
  // cap: the lowest the top surface gets over the letter.
  const full = (h: number): boolean => {
    const prism = legend.extrude(h - roof).translate([0, 0, roof]);
    return cap.intersect(prism).volume() >= prism.volume() * 0.999;
  };
  let lo = roof;
  let hi = d.capH + d.capDome;
  for (let k = 0; k < 14; k++) {
    const mid = (lo + hi) / 2;
    if (full(mid)) lo = mid;
    else hi = mid;
  }
  const floor = Math.max(roof + 2 * d.layer, lo - d.legendDepth);
  const highest = cap.intersect(legend.extrude(d.capH + d.capDome + 1)).boundingBox().max[2];

  const recess = legend
    .offset(d.letterClear, 'Round', 2, 24)
    .extrude(d.capH + d.capDome + 1 - floor)
    .translate([0, 0, floor]);
  const letter = legend.extrude(highest - floor + d.legendDepth).translate([0, 0, floor]);
  return { cap: cap.subtract(recess), insert: letter };
}

function buildStem(ctx: BuildCtx, d: Derived): Manifold {
  const { m } = ctx;
  const roof = d.capH - d.capTop;

  if (d.sw.stem === 'mx') {
    const slot = MX_SLOT + d.stemClear;
    const arm = MX_ARM + d.stemClear;
    // The cross is the HOLE, so the stem is a round boss with a cross cut out.
    const bossR = MX_BOSS / 2;
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
    const w = CHOC_POST[0] + d.stemClear;
    const h = CHOC_POST[1] + d.stemClear;
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
