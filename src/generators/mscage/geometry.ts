import type { Params } from '../../core/params/types';
import { stairLayout, type StairSpec } from '../shared/stairs';

/** Base edge to the outside of the columns, galleries and stair towers. */
export const RIM = 4;
/** The gantry's columns, square. */
export const COLUMN = 12;
/** The top frame's trusses: how deep, how wide. */
export const TRUSS_D = 10;
export const TRUSS_W = 3;
/** Gallery deck thickness, and the clear strip in front of the front columns. */
export const DECK_T = 2;
export const FRONT_STRIP = 10;
/** The columns' and back frame's pegs. */
export const PEG = 1.6;
export const PEG_L = 3;
/** Back frame thickness. */
export const BACK_T = 3;
/** The operator cabin on the top right gallery. */
export const CABIN_D = 20;
export const CABIN_H = 22;
/** The hoist trolley's length along the cross truss. */
export const TROLLEY_L = 9;

/**
 * A walk-around maintenance dock, laid out from the stairs outward.
 *
 * Two stair towers stand at the front corners. Behind each, a stack of
 * galleries runs back along that side of the dock, one at every other
 * landing of its tower -- the landings in the tower's outer bay -- so the
 * crew step straight off the stairs onto a gallery. Four columns carry the
 * galleries and, over everything, a truss frame with a cross truss over the
 * kit's head for the hoist and its claw.
 *
 * x runs across, y front (-) to back (+), z up from the bottom of the base.
 */
export interface Derived {
  readonly W: number;
  readonly D: number;
  readonly H: number;
  readonly baseH: number;
  readonly c: number;
  readonly fit: number;
  readonly slotD: number;
  readonly scale: number;
  readonly crewK: number;

  /** The two stair towers: left as built, right mirrored. Null without stairs. */
  readonly stairs: readonly [StairSpec, StairSpec] | null;
  /** Front face of the dock's galleries and back of the stair towers. */
  readonly gy0: number;
  /** Back of the galleries, behind the back columns. */
  readonly gy1: number;
  /** Gallery x extents on the left: its outer edge and its inner edge. */
  readonly gxo: number;
  readonly gxi: number;
  /** Column centres: across (magnitude), front and back. */
  readonly cx: number;
  readonly cyF: number;
  readonly cyB: number;
  /** Heights of the galleries' decks. */
  readonly levels: readonly number[];
  /** Top of the columns, where the top frame sits. */
  readonly columnTop: number;

  /** Where the kit stands. */
  readonly kitY: number;
  readonly standHole: number;
  readonly hazard: boolean;
  readonly joined: boolean;
  readonly jointClear: number;
  readonly backFrame: boolean;
  /** The raised apron across the front, and the patterned floor. */
  readonly apron: boolean;
  readonly floorPattern: boolean;
  readonly cabin: boolean;
  readonly railH: number;
  readonly postSpacing: number;

  readonly printedPins: boolean;
  readonly bedX: number;
  readonly bedY: number;
}

/** Galleries' deck width inside the columns. */
function galleryWidth(p: Params): number {
  return Number(p.galleryWidth);
}

export function derive(p: Params): Derived {
  const W = Number(p.cageWidth);
  const D = Number(p.cageDepth);
  const H = Number(p.cageHeight);
  const baseH = Number(p.baseHeight);
  const fit = Number(p.fit);
  const slotD = Math.min(5, baseH - 3);
  const scale = Number(p.stairScale);
  const crewK = 1000 / scale;
  const columnTop = H - TRUSS_D;

  const gxo = -W / 2 + RIM;
  const gxi = gxo + COLUMN + galleryWidth(p);
  const cx = W / 2 - RIM - COLUMN / 2;

  // The stair towers, front corners, and the galleries' front edge right
  // behind them. Without stairs the galleries start a rim in from the front.
  const span = Number(p.stairSpan);
  const height = Number(p.stairHeight);
  const probe: StairSpec = {
    x0: gxo, x1: gxo + span, yBack: 0, zFloor: baseH, sillDepth: slotD, height, scale, fit,
  };
  const depth = stairLayout(probe).yBack - stairLayout(probe).yFront;
  const towerBack = -D / 2 + RIM + depth;
  const withStairs = p.stairs === true;
  const gy0 = withStairs ? towerBack + 0.3 : -D / 2 + RIM;
  const left: StairSpec = { ...probe, yBack: towerBack, openBackBay: 'x0' };
  const right: StairSpec = { ...probe, x0: W / 2 - RIM - span, x1: W / 2 - RIM, yBack: towerBack, mirror: true, openBackBay: 'x1' };

  const cyF = gy0 + FRONT_STRIP + COLUMN / 2;
  const gy1 = D / 2 - RIM;
  const cyB = gy1 - COLUMN / 2;

  // Galleries at the landings in the towers' outer bays: every other one.
  const L = stairLayout(left);
  const all = L.flights.filter((f) => f.index % 2 === 1).map((f) => f.zb);
  const evenly = (() => {
    const n = Math.max(1, Math.round(Number(p.galleryLevels)));
    const lo = baseH + 0.25 * (columnTop - baseH);
    const hi = baseH + 0.65 * (columnTop - baseH);
    return Array.from({ length: n }, (_, k) => (n === 1 ? (lo + hi) / 2 : lo + (k * (hi - lo)) / (n - 1)));
  })();
  const levels = withStairs ? all : evenly;

  const printedPins = p.pinStyle === 'printed';
  return {
    W, D, H, baseH,
    c: Number(p.clearance),
    fit, slotD, scale, crewK,
    stairs: withStairs ? [left, right] : null,
    gy0, gy1, gxo, gxi, cx, cyF, cyB,
    levels,
    columnTop,
    kitY: (cyF + COLUMN / 2 + cyB - COLUMN / 2) / 2,
    standHole: Number(p.standHole),
    hazard: p.hazardStripes === true,
    joined: p.connector === 'dovetail',
    jointClear: Number(p.jointClearance),
    backFrame: p.backFrame === true,
    // Between the stair towers, so only with them.
    apron: p.apron === true && p.stairs === true,
    floorPattern: p.floorPattern === true,
    cabin: p.cabin === true,
    railH: Math.max(6.5, 1.05 * crewK),
    postSpacing: Math.max(10, 1.8 * crewK),
    printedPins,
    bedX: Number(p.bedX),
    bedY: Number(p.bedY),
  };
}
