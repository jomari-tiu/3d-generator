import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import { roundedRect } from '../../../core/kernel/primitives';
import { buildPattern, estimateFeatures, MAX_FEATURES, type PatternOptions } from '../../../core/pattern';
import type { Issue } from '../../../core/params/types';
import { camCutter } from '../../../core/mech/heartCam';
import { camOriginY, camSpanY, funnelY, type Derived, camSpec } from '../geometry';
import { box, poly, prismY, thread } from './util';

/**
 * The drawer: the part that moves.
 *
 * An open tray on a thick floor slab, and it is the UNDERSIDE of that slab that
 * does the work: two dovetail slots that hang it on the case's rails, a pocket
 * the whole latch runs in with the two cam islands standing in it, a moat
 * either side for the band to sit in, and two tapped holes for the stop pins.
 *
 * Every one of those is a recess, because the drawer prints floor-down and its
 * underside is the bed. Nothing hangs below the floor except the stop pins, and
 * they screw in afterwards.
 */

function shell(m: ManifoldToplevel, d: Derived): Manifold {
  const yc = (d.boxFrontY + d.boxBackY) / 2;
  const outer = m.Manifold.extrude(roundedRect(m, d.boxW, d.boxD, d.cornerR), d.boxH).translate([0, yc, d.boxZ]);
  const inner = m.Manifold.extrude(
    roundedRect(m, d.boxW - 2 * d.trayWall, d.boxD - 2 * d.trayWall, Math.max(0.3, d.cornerR - d.trayWall)),
    d.boxH,
  ).translate([0, yc, d.boxZ + d.slabT]);
  return outer.subtract(inner);
}

/**
 * The dovetail slots, one each side. Inner wall vertical, outer wall slanted at
 * 45 degrees to sit on the rail's flank -- the drawer hangs on those two slants
 * and nothing else.
 */
function slots(m: ManifoldToplevel, d: Derived): Manifold {
  const zc = d.boxZ + d.slotDeep;
  return m.Manifold.union(
    ([-1, 1] as const).map((s) => {
      const pts: [number, number][] = [
        [s * d.slotInner, d.boxZ - 0.5],
        [s * d.slotMouth, d.boxZ - 0.5],
        [s * d.slotMouth, d.boxZ],
        [s * (d.slotMouth + d.slotDeep), zc],
        [s * d.slotInner, zc],
      ];
      return prismY(m, poly(m, pts), d.boxFrontY - 1, d.boxBackY + 1);
    }),
  );
}

/**
  * The island the cam is cut into, standing on the drawer's floor.
  *
  * A 4 mm groove does not fit in a 2.4 mm floor, so the floor is locally
  * thickened over the cam's footprint and over the strip of relief that runs
  * back from the funnel to the drawer's back edge. Inside the drawer it reads
  * as a low rounded plinth at the back.
  */
function camPad(m: ManifoldToplevel, d: Derived): Manifold {
  const [y0] = camSpanY(d);
  const y1 = d.boxBackY;
  return m.Manifold.extrude(roundedRect(m, d.camPadW, y1 - (y0 - 2), 3), Math.max(d.slabT, d.camPadT)).translate([
    0,
    (y0 - 2 + y1) / 2,
    d.boxZ,
  ]);
}

/**
 * The heart groove, cut UP into the drawer's underside, and the plain relief
 * that carries the pin off the back of it.
 *
 * `camCutter` builds the groove downward from a top face at z = 0, which is the
 * right way round for a plate you look down on; here the plate is the drawer's
 * FLOOR seen from below, so the whole cutter is mirrored in z. The relief is
 * the funnel carried on to the drawer's back edge at full depth: without it the
 * pin rides on the flat of the underside for the rest of the travel, holding
 * the arm bowed the whole depth of the cam every time the drawer is open.
 */
function camCut(m: ManifoldToplevel, d: Derived): Manifold {
  const groove = camCutter(m, camSpec(d))
    .mirror([0, 0, 1])
    .translate([d.xNotch, camOriginY(d), d.boxZ]);
  const relief = box(
    m,
    d.xNotch - d.camBias - d.reliefW / 2,
    d.xNotch - d.camBias + d.reliefW / 2,
    funnelY(d) - 1,
    d.boxBackY + 2,
    d.boxZ - 0.5,
    d.boxZ + d.camDeep,
  );
  return groove.add(relief);
}

/**
 * Band anchors: an island in a moat, flush with the underside. The band lies in
 * the moat round the island, so nothing stands below the floor to snag or to
 * stop the drawer printing flat.
 */
function moats(m: ManifoldToplevel, d: Derived): Manifold {
  const ring = m.CrossSection.circle(d.moatOuterR, 64).subtract(m.CrossSection.circle(d.moatIslandR, 48));
  return m.Manifold.union(
    [-1, 1].map((s) => m.Manifold.extrude(ring, d.moatDeep + 0.5).translate([s * d.moatX, d.moatY, d.boxZ - 0.5])),
  );
}

/** Tapped holes for the two travel-stop pins. */
function pinHoles(m: ManifoldToplevel, d: Derived): Manifold {
  return m.Manifold.union(
    [-1, 1].map((s) =>
      thread(m, d.pinD + 0.35, d.pinPitch, d.boxZ - 0.5, d.boxZ + d.pinHoleDeep).translate([s * d.pinX, d.pinY, 0]),
    ),
  );
}

/** Dividers, dropped in on a grid, short of the rim. */
function dividers(m: ManifoldToplevel, d: Derived): Manifold | null {
  if (d.insert !== 'dividers' || (d.divX < 1 && d.divY < 1)) return null;
  const t = Math.max(1.2, d.trayWall);
  const x0 = -d.boxW / 2 + d.trayWall;
  const x1 = d.boxW / 2 - d.trayWall;
  const y0 = d.boxFrontY + d.trayWall;
  const y1 = d.boxBackY - d.trayWall;
  const zb = d.boxZ + d.slabT - 0.2;
  const zt = d.boxZ + d.slabT + (d.boxH - d.slabT) * 0.8;
  const walls: Manifold[] = [];
  for (let i = 1; i <= d.divX; i++) {
    const x = x0 + ((x1 - x0) * i) / (d.divX + 1);
    walls.push(box(m, x - t / 2, x + t / 2, y0, y1, zb, zt));
  }
  for (let i = 1; i <= d.divY; i++) {
    const y = y0 + ((y1 - y0) * i) / (d.divY + 1);
    walls.push(box(m, x0, x1, y - t / 2, y + t / 2, zb, zt));
  }
  return m.Manifold.union(walls);
}

function patternOptions(d: Derived, radius: number, seeds: number): PatternOptions {
  const base = {
    radius,
    angle: d.surfaceAngle,
    tolerance: 0.05,
    cell: d.surfaceCell,
    gap: d.surfaceGap,
    aspect: 1.5,
    seeds,
    relax: 2,
    seed: 7,
    tiling: 'hex' as const,
    hole: 'round' as const,
    grid: 'staggered' as const,
    line: 'ribs' as const,
  };
  switch (d.surface) {
    case 'ribs':
      return { ...base, family: 'lines', line: 'ribs' };
    case 'chevron':
      return { ...base, family: 'lines', line: 'chevron' };
    case 'knurl':
      return { ...base, family: 'lines', line: 'knurl' };
    case 'hex':
      return { ...base, family: 'tiling', tiling: 'hex' };
    case 'diamond':
      return { ...base, family: 'tiling', tiling: 'diamond' };
    case 'dots':
      return { ...base, family: 'perforation', hole: 'round' };
    case 'voronoi':
      return { ...base, family: 'voronoi' };
    default:
      return { ...base, family: 'lines' };
  }
}

/**
 * The relief on the front face.
 *
 * Worked out flat in (x, z) on the face's own rectangle, inset by the border,
 * then stood up and either cut into the front wall or added onto it. The
 * pattern module fills a disc and the panel trims it, so a rotated pattern
 * never leaves an unfilled corner.
 */
export function surfaceRelief(
  m: ManifoldToplevel,
  d: Derived,
  issue: (i: Issue) => void,
): Manifold | null {
  if (d.surface === 'plain') return null;
  const w = d.boxW - 2 * d.surfaceBorder;
  const h = d.boxH - 2 * d.surfaceBorder;
  if (w < 6 || h < 6) {
    issue({ level: 'warn', message: 'The border leaves no face for the pattern.', paramIds: ['surfaceBorder'] });
    return null;
  }
  const zc = d.boxZ + d.boxH / 2;
  const panel = roundedRect(m, w, h, Math.max(0, d.cornerR - d.surfaceBorder)).translate([0, zc]);
  const radius = Math.hypot(w, h) / 2 + 2 * d.surfaceCell;
  const seeds = Math.max(3, Math.round((Math.PI * radius * radius) / (d.surfaceCell * d.surfaceCell)));
  const opts = patternOptions(d, radius, seeds);
  const estimate = estimateFeatures(opts);
  if (estimate > MAX_FEATURES) {
    issue({
      level: 'warn',
      message: `That pattern is about ${estimate.toLocaleString()} shapes across the front, which is past what the app will build. Open the pitch up; the face is plain meanwhile.`,
      paramIds: ['surfaceCell'],
    });
    return null;
  }
  const rings = buildPattern(opts).map((r) => r.map(([x, v]) => [x, v + zc] as [number, number]));
  if (rings.length === 0) return null;
  let ink: CrossSection = m.CrossSection.ofPolygons(rings, 'NonZero').simplify(0.02);
  ink = ink.intersect(panel);
  if (!(ink.area() > 0.05)) return null;

  const depth = Math.min(d.surfaceDepth, d.trayWall - 0.6);
  // Extruded along z, stood up so z becomes y: the relief then occupies
  // y in [-depth, 0] and is shifted onto the face.
  const relief = m.Manifold.extrude(ink, depth).rotate([90, 0, 0]);
  return d.emboss
    ? relief.translate([0, d.boxFrontY + 0.05, 0])
    : relief.translate([0, d.boxFrontY + depth, 0]);
}

export function buildDrawer(m: ManifoldToplevel, d: Derived, issue: (i: Issue) => void): Manifold {
  let solid = shell(m, d).subtract(slots(m, d)).subtract(pinHoles(m, d));

  if (d.latch) {
    solid = solid.add(camPad(m, d)).subtract(camCut(m, d)).subtract(moats(m, d));
  }

  const div = dividers(m, d);
  if (div) solid = solid.add(div);

  const relief = surfaceRelief(m, d, issue);
  if (relief) solid = d.emboss ? solid.add(relief) : solid.subtract(relief);

  return solid;
}
