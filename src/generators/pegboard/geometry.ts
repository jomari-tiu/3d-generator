import type { Params } from '../../core/params/types';

/*
 * The frame everything is modelled in:
 *
 *   x  along the desk edge, the panel centred on 0
 *   y  into the desk: the desk is y > 0, its edge face is y = 0, and the
 *      organizer hangs off it at y < 0
 *   z  up, the desk top at z = 0
 *
 * Front to back the stack is: accessory, board face (yFront), board, the gap
 * the hook tails drop into, the board's back (yBack, flat against the clamp
 * spine), spine, desk.
 */

export type Mount = 'below' | 'above';
export type ScrewKind = 'printed' | 'm8' | 'm6';

/** Nuts and bolts the clamp can take: across-flats, nut height, bolt clearance hole. */
export const HARDWARE: Record<Exclude<ScrewKind, 'printed'>, { af: number; nutH: number; hole: number; label: string }> = {
  m8: { af: 13, nutH: 6.5, hole: 8.6, label: 'M8' },
  m6: { af: 10, nutH: 5, hole: 6.5, label: 'M6' },
};

/** The printed screw: a round eccentric thread, coarse enough to print standing. */
export const PRINTED_SCREW = { major: 16, pitch: 5, depth: 1.4, nutH: 12 };

/**
 * How a hook peg fits its hole: this much thinner than the hole, bent up on a
 * centreline radius of `bend` x the hole through `sweep` degrees, through a
 * hole no longer than `land` -- a thicker board is counterbored from behind,
 * `counterbore` x the hole across, down to it.
 */
export const PEG_FIT = { under: 1.5, bend: 0.8, sweep: 75, land: 4.5, counterbore: 1.6 };

/** Dovetail rail on the back of the board: mouth height, depth and flank lean. */
export const RAIL = { mouth: 8, depth: 4.5, flare: 30 };

export interface Derived {
  readonly mount: Mount;
  readonly W: number;
  readonly H: number;
  readonly pt: number;
  readonly corner: number;
  readonly chamfer: number;
  readonly ribs: boolean;

  readonly holeD: number;
  readonly px: number;
  readonly pz: number;
  readonly clear: number;
  readonly nozzle: number;
  readonly layer: number;
  readonly minWall: number;
  readonly accWall: number;

  /** Peg radius, and the height of its centre, which rests on the bottom of the hole. */
  readonly pinR: number;
  readonly pegZ: number;
  /** The hook's bend behind the board: centreline radius, and the hole-centre height of its top. */
  readonly bendR: number;
  readonly legH: number;
  /** Length of the hole proper; a thicker board is counterbored from behind to this. */
  readonly land: number;
  readonly counterbore: number;
  /** Depth of the gap behind the board for hook tails. */
  readonly gap: number;

  readonly yBack: number;
  readonly yFront: number;
  readonly zTop: number;
  readonly zBottom: number;

  /** The rail band across the back, which no hole may cross. */
  readonly header: { z0: number; z1: number; railZ: number };
  readonly railInner: number;

  /** Hole centres. Columns left to right; rows top to bottom. */
  readonly cols: readonly number[];
  readonly rows: readonly number[];

  // ----------------------------------------------------------------- clamp
  readonly deskT: number;
  readonly opening: number;
  readonly travel: number;
  readonly minDesk: number;
  readonly clampCount: number;
  readonly clampW: number;
  readonly clampXs: readonly number[];
  readonly jawDepth: number;
  readonly jawT: number;
  readonly spine: number;
  readonly pads: boolean;
  readonly padT: number;
  readonly lock: boolean;
  readonly screw: ScrewKind;
  /** Top jaw underside and top; lower jaw top face; spine bottom. */
  readonly zJawU: number;
  readonly zJawTop: number;
  readonly zLowJaw: number;
  readonly zSpineBottom: number;
  readonly screwY: number;
  readonly nutAF: number;
  readonly nutH: number;
  readonly boltHole: number;
  readonly bossH: number;
  readonly bossHalf: number;
  readonly swivelR: number;
  readonly swivelT: number;
  readonly tipR: number;
  readonly shaftLength: number;
  /** How far the screw is wound up to meet this desk. */
  readonly screwRise: number;
  readonly knobR: number;
  readonly pegY: number;

  // ------------------------------------------------------------------ tray
  readonly tray: boolean;
  readonly trayW: number;
  readonly trayD: number;
  readonly trayWall: number;
  readonly trayLip: number;
  readonly trayBase: number;
  readonly trayCorner: number;
  readonly dividers: number;
  readonly removable: boolean;
  readonly trayY0: number;

  readonly bed: readonly [number, number];
}

const n = (p: Params, k: string) => Number(p[k]);

export function derive(p: Params): Derived {
  const mount = String(p.mount) as Mount;
  const W = n(p, 'panelWidth');
  const H = n(p, 'panelHeight');
  const pt = n(p, 'panelThickness');
  const holeD = n(p, 'holeD');
  const px = n(p, 'pitchX');
  const pz = n(p, 'pitchZ');
  const clear = n(p, 'clearance');
  const accWall = Math.max(n(p, 'accWall'), n(p, 'minWall'));

  // The hook end is a rod that bends up behind the board on a constant-section
  // arc, the way a wire pegboard hook does: tilted in, it snakes through the
  // hole along its own curve, and hung, its tip stands above the hole's top
  // edge so it cannot pull straight out. A square-cornered L of the same rod
  // cannot do either -- the corner's diagonal is wider than the hole. These
  // proportions are the ones test/pegfit.ts proves fit and lock, by searching
  // every slide and tilt of the profile through the hole.
  const pinR = Math.max(3, holeD - PEG_FIT.under) / 2;
  const pegZ = -holeD / 2 + pinR;
  const bendR = Math.max(3, PEG_FIT.bend * holeD);
  const legH = pegZ + bendR * (1 - Math.cos((PEG_FIT.sweep * Math.PI) / 180)) + pinR;
  const land = Math.min(pt, PEG_FIT.land);
  const counterbore = pt > land + 1e-9 ? PEG_FIT.counterbore * holeD : 0;
  const gap = clear + bendR + pinR + 1.5;

  const spine = n(p, 'spineThickness');
  const yBack = -spine;
  const yFront = yBack - gap - pt;

  // ---- clamp, top down
  const pads = p.deskPads === true;
  const padT = pads ? n(p, 'padThickness') : 0;
  const jawT = n(p, 'jawThickness');
  const deskT = n(p, 'deskThickness');
  const opening = n(p, 'clampOpening');
  const travel = n(p, 'screwTravel');
  const screw = String(p.clampScrew) as ScrewKind;

  const zJawU = padT;
  const zJawTop = padT + jawT;
  const swivelT = 6;
  const tipR = screw === 'printed' ? 4 : screw === 'm8' ? 4 : 3;
  // Screw wound fully down: its tip stands 1 mm proud of the lower jaw and
  // the swivel pad on it just clears the thickest desk.
  const zLowJaw = -opening - swivelT - 1;
  const zSpineBottom = zLowJaw - jawT;

  const printed = screw === 'printed';
  const hw = printed ? null : HARDWARE[screw];
  const nutAF = printed ? PRINTED_SCREW.major + 10 : hw!.af;
  const nutH = printed ? PRINTED_SCREW.nutH : hw!.nutH;
  const boltHole = printed ? PRINTED_SCREW.major + 1 : hw!.hole;
  const bossH = nutH + 5;
  const bossHalf = nutAF / Math.sqrt(3) + 4;
  const knobR = printed ? 17 : 12;
  const jawDepth = n(p, 'jawDepth');
  const swivelR = Math.min(14, jawDepth / 2 - 2);
  const screwY = Math.max(knobR + 3, bossHalf + 1, Math.min(jawDepth / 2 + 4, jawDepth - swivelR - 2));
  const shaftLength = bossH + travel + 1;

  // ---- board, placed by the clamp
  const zTop = mount === 'below' ? zJawTop : zSpineBottom + H;
  const zBottom = zTop - H;

  const railInner = RAIL.mouth + 2 * RAIL.depth * Math.tan((RAIL.flare * Math.PI) / 180);
  // The rail sits just inside the spine's end, with 4 mm of spine beyond it.
  const bandH = 4 + railInner + 2 * clear + 5;
  const header =
    mount === 'below'
      ? { z0: zTop - bandH, z1: zTop, railZ: zTop - 4 - clear - railInner / 2 }
      : { z0: zSpineBottom, z1: zSpineBottom + bandH, railZ: zSpineBottom + 4 + clear + railInner / 2 };

  // ---- hole grid
  const edge = holeD / 2 + 6;
  const nCols = Math.max(0, Math.floor((W - 2 * edge) / px + 1e-9) + 1);
  const cols = Array.from({ length: nCols }, (_, i) => (i - (nCols - 1) / 2) * px);

  // Rows run on the open side of the rail band: a hook tail rises legH above
  // its hole and must stay clear of the band and the frame.
  const tail = legH + 1.5;
  const zHi = mount === 'below' ? header.z0 - tail : zTop - 3 - tail;
  const zLo = mount === 'below' ? zBottom + edge : header.z1 + holeD / 2 + 2;
  const rows: number[] = [];
  for (let z = zHi; z >= zLo - 1e-9; z -= pz) rows.push(z);

  // ---- clamps, evenly along the board
  const clampCount = Math.round(n(p, 'clampCount'));
  const clampW = n(p, 'clampWidth');
  const clampXs = Array.from({ length: clampCount }, (_, i) => {
    const raw = W * ((i + 0.5) / clampCount - 0.5);
    const lim = Math.max(0, W / 2 - clampW / 2);
    return Math.max(-lim, Math.min(lim, raw));
  });

  const tray = p.tray === true;
  const trayY0 = mount === 'below' ? yFront : yBack + clear;

  return {
    mount, W, H, pt,
    corner: n(p, 'panelCorner'),
    chamfer: n(p, 'panelChamfer'),
    ribs: p.backRibs === true,
    holeD, px, pz, clear,
    nozzle: n(p, 'nozzle'),
    layer: n(p, 'layer'),
    minWall: n(p, 'minWall'),
    accWall,
    pinR, pegZ, bendR, legH, land, counterbore, gap,
    yBack, yFront, zTop, zBottom,
    header, railInner,
    cols, rows,
    deskT, opening, travel,
    minDesk: opening - travel,
    clampCount, clampW, clampXs,
    jawDepth, jawT, spine, pads, padT,
    lock: p.lockScrew === true,
    screw, zJawU, zJawTop, zLowJaw, zSpineBottom,
    screwY, nutAF, nutH, boltHole, bossH, bossHalf,
    swivelR, swivelT, tipR, shaftLength,
    screwRise: opening - deskT,
    knobR,
    pegY: Math.min(jawDepth * 0.55, jawDepth - 6),
    tray,
    trayW: n(p, 'trayWidth'),
    trayD: n(p, 'trayDepth'),
    trayWall: n(p, 'trayWall'),
    trayLip: Math.min(n(p, 'trayLip'), n(p, 'trayWall')),
    trayBase: n(p, 'trayBase'),
    trayCorner: n(p, 'trayCorner'),
    dividers: Math.round(n(p, 'trayDividers')),
    removable: p.removableDividers === true,
    trayY0,
    bed: [n(p, 'bedX'), n(p, 'bedY')],
  };
}

/** Desk-side wall thickness of the tray and its pegs' socket bosses. */
export const TRAY_WALL = 2.4;
export const PEG = { r: 2.5, h: 3 };
