import type { CrossSection, Manifold } from 'manifold-3d';
import type { BuildCtx } from '../../core/params/types';
import { roundedRect } from '../../core/kernel/primitives';
import { binCentre, binSize, POCKET_CLEAR, type Derived } from './geometry';

/** Jigsaw knob: a neck across the cut and a round head beyond it. */
const KNOB_R = 3.5;
const NECK_W = 3.4;
const KNOB_AT = 4;
/** About one knob per this much cut length. */
const KNOB_SPACING = 60;

/**
 * The whole tray, in drawer coordinates: a base plate with a low frame on it,
 * and a pocket in the frame wherever a bin stands. The pocket follows the
 * bin's footprint at the bottom -- its stepped-in foot when it stacks -- so a
 * bin drops in and cannot slide about.
 */
export function buildTray(ctx: BuildCtx, d: Derived): Manifold {
  const { m } = ctx;
  const outline = roundedRect(m, d.trayW, d.trayD, d.corner + d.margin);
  const top = d.trayBase + d.trayWall;
  const frame = m.Manifold.extrude(outline, top);

  const footStep = d.stackable ? d.footInset : 0;
  const pockets: Manifold[] = [];
  for (const b of d.layout.bins) {
    const s = binSize(d, b);
    const [x, y] = binCentre(d, b);
    const w = s.w - 2 * footStep + 2 * POCKET_CLEAR;
    const h = s.d - 2 * footStep + 2 * POCKET_CLEAR;
    const r = Math.max(0.3, d.corner - footStep) + POCKET_CLEAR;
    pockets.push(
      m.Manifold.extrude(roundedRect(m, w, h, r), top).translate([x, y, d.trayBase]),
    );
  }
  return frame.subtract(m.Manifold.union(pockets));
}

/** A row of knob centres along a cut, one per segment of the cut between perpendicular cuts. */
function knobStations(cuts: readonly number[]): number[] {
  const at: number[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i]!;
    const b = cuts[i + 1]!;
    const n = Math.max(1, Math.round((b - a) / KNOB_SPACING));
    for (let k = 0; k < n; k++) at.push(a + ((k + 0.5) * (b - a)) / n);
  }
  return at;
}

/**
 * A knob crossing a cut, pointing +X. The neck starts a little behind the cut
 * so the knob is solidly part of the piece it belongs to.
 */
function knob(m: Parameters<typeof roundedRect>[0], grow: number): CrossSection {
  const neck = m.CrossSection.square([KNOB_AT + 1, NECK_W + 2 * grow], true).translate([
    (KNOB_AT - 1) / 2,
    0,
  ]);
  const head = m.CrossSection.circle(KNOB_R + grow, 48).translate([KNOB_AT, 0]);
  return m.CrossSection.union([neck, head]);
}

export interface TrayPiece {
  readonly i: number;
  readonly j: number;
  readonly solid: Manifold;
}

/**
 * Cut the tray into pieces that each fit the bed, joined by jigsaw knobs.
 *
 * Every cut gets knobs pointing +X or +Y: the piece on the low side carries
 * them and the piece on the high side has matching sockets, grown by the
 * joint clearance. The pieces press together from above and lock sideways.
 */
export function splitTray(ctx: BuildCtx, d: Derived, tray: Manifold): TrayPiece[] {
  const { m } = ctx;
  const nx = d.cutsX.length - 1;
  const ny = d.cutsY.length - 1;
  if (nx === 1 && ny === 1) return [{ i: 0, j: 0, solid: tray }];

  const half = d.jointClear / 2;
  const stationsY = knobStations(d.cutsY);
  const stationsX = knobStations(d.cutsX);

  // Knobs on the cut at x = cx, along the whole length of the tray. Each
  // piece only keeps the ones within its own span, by intersection.
  const knobsOnX = (cx: number, grow: number) =>
    m.CrossSection.union(stationsY.map((y) => knob(m, grow).translate([cx, y])));
  const knobsOnY = (cy: number, grow: number) =>
    m.CrossSection.union(stationsX.map((x) => knob(m, grow).rotate(90).translate([x, cy])));

  const far = 10;
  const pieces: TrayPiece[] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      // Outer edges run past the tray; inner edges stop half a clearance short.
      const x0 = i === 0 ? d.cutsX[0]! - far : d.cutsX[i]! + half;
      const x1 = i === nx - 1 ? d.cutsX[nx]! + far : d.cutsX[i + 1]! - half;
      const y0 = j === 0 ? d.cutsY[0]! - far : d.cutsY[j]! + half;
      const y1 = j === ny - 1 ? d.cutsY[ny]! + far : d.cutsY[j + 1]! - half;
      let region: CrossSection = m.CrossSection.square([x1 - x0, y1 - y0]).translate([x0, y0]);

      // This piece's span along each cut, so it only takes its own knobs.
      const ownY = m.CrossSection.square([1000, d.cutsY[j + 1]! - d.cutsY[j]!]).translate([-500, d.cutsY[j]!]);
      const ownX = m.CrossSection.square([d.cutsX[i + 1]! - d.cutsX[i]!, 1000]).translate([d.cutsX[i]!, -500]);

      if (i < nx - 1) region = region.add(knobsOnX(d.cutsX[i + 1]!, 0).intersect(ownY));
      if (i > 0) region = region.subtract(knobsOnX(d.cutsX[i]!, d.jointClear).intersect(ownY.offset(d.jointClear)));
      if (j < ny - 1) region = region.add(knobsOnY(d.cutsY[j + 1]!, 0).intersect(ownX));
      if (j > 0) region = region.subtract(knobsOnY(d.cutsY[j]!, d.jointClear).intersect(ownX.offset(d.jointClear)));

      const solid = tray.intersect(m.Manifold.extrude(region, 1000).translate([0, 0, -500]));
      pieces.push({ i, j, solid });
    }
  }
  return pieces;
}
