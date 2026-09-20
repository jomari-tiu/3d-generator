import type { CamSpec } from '../../core/mech/heartCam';
import type { Params } from '../../core/params/types';

/**
 * Modular push-lock drawer: a case that screws under a desk, a drawer that
 * hangs in it on two dovetail rails, and a push-push latch that lives entirely
 * in the case FLOOR -- a heart-cam groove in the drawer's underside, a sprung
 * arm lying in the floor whose pin rides it, and rubber bands for the throw.
 *
 * Re-created from a working design part by part, so the sizes are that
 * drawer's: 176 wide, 134 deep, 32.4 tall, a Ø4 pin, 7 mm rails, 35 mm bands.
 * The CAM is not that drawer's. Its cam is two free-standing islands with no
 * step anywhere in them, and a kinematic simulation of that shape showed what
 * is hard to see by eye: with nothing but a plan outline, both strokes take the
 * same path and the latch never catches. What actually makes the original
 * one-way is a ramped chamber ceiling, 0.4 to 0.9 mm shallower between the
 * notch and the block, which the follower has to climb. This generator fits
 * the grooved heart cam from `core/mech/heartCam` instead: a closed loop with
 * one-way steps in its floor, which is provably one-way and which `npm test`
 * checks by probing the printed mesh.
 *
 * FRAME: x across the desk, centred; y front-to-back with the open front at -y
 * and the back wall at +y; z up from the underside of the case floor. One tier
 * is modelled and the caller drops it into each position of the stack. The
 * drawer is drawn SHUT, with the pin sitting in the cam's notch.
 */

export type Connector = 'screws' | 'bolts' | 'dovetail' | 'none';
export type Mount = 'screws' | 'tape';
export type Surface = 'plain' | 'ribs' | 'chevron' | 'hex' | 'diamond' | 'dots' | 'voronoi' | 'knurl';
export type Insert = 'gridfinity' | 'dividers' | 'none';

/**
 * How much strain the arm's outside fibre is allowed at full throw. PETG yields
 * past 4%; this is where "it flexes" becomes "it still flexes next year".
 */
export const STRAIN_MAX = 0.02;

/** Gridfinity pitch and baseplate height, from the spec. */
export const GRID_PITCH = 42;
export const GRID_PLATE_H = 4.65;

export interface Tier {
  readonly index: number;
  readonly name: string;
  /** Absolute z of this case's floor underside. */
  readonly z0: number;
}

export interface Derived {
  // -------------------------------------------------------------- the case
  readonly W: number;
  readonly D: number;
  readonly H: number;
  readonly wall: number;
  readonly tiers: readonly Tier[];
  readonly clear: number;
  readonly yBackIn: number;
  readonly yFront: number;
  readonly innerW: number;
  readonly mount: Mount;
  readonly screwD: number;
  readonly earOut: number;
  readonly earT: number;
  readonly earHoleY: number;
  readonly connector: Connector;
  readonly lugW: number;
  readonly lugL: number;
  readonly lugH: number;
  readonly lugY: number;
  readonly stackScrewD: number;
  readonly stackScrewPitch: number;
  readonly boltD: number;

  // ------------------------------------------------------------- the rails
  readonly railX: number;
  readonly railBase: number;
  readonly railH: number;
  readonly headOvh: number;
  readonly headH: number;
  readonly slotInner: number;
  readonly slotMouth: number;
  readonly slotDeep: number;
  readonly crestClear: number;

  // ------------------------------------------------------------ the drawer
  readonly boxW: number;
  readonly boxD: number;
  readonly boxH: number;
  /** Absolute z of the drawer's underside, and the gap it leaves over the floor. */
  readonly boxZ: number;
  readonly hb: number;
  readonly boxBackY: number;
  readonly boxFrontY: number;
  readonly trayWall: number;
  /** The floor slab: deep enough for the groove and a skin over it. */
  readonly slabT: number;
  readonly skin: number;
  readonly cornerR: number;
  readonly lip: number;
  readonly over: number;
  readonly insert: Insert;
  readonly gridCols: number;
  readonly gridRows: number;
  readonly divX: number;
  readonly divY: number;

  // ------------------------------------------------------------- the front
  readonly surface: Surface;
  readonly emboss: boolean;
  readonly surfaceCell: number;
  readonly surfaceGap: number;
  readonly surfaceDepth: number;
  readonly surfaceAngle: number;
  readonly surfaceBorder: number;

  // ------------------------------------------------------------- the latch
  readonly latch: boolean;
  /** Diameter of the pin that rides the groove. */
  readonly bossD: number;
  readonly lead: number;
  /** Groove width, half-width across the travel, and the entry bias. */
  readonly grooveW: number;
  readonly camV: number;
  readonly camBias: number;
  /** Deepest floor of the groove, and the one-way step at every corner. */
  readonly camDeep: number;
  readonly camStep: number;
  /** The pad the groove is cut into, so it is not a hole in the drawer. */
  readonly camPadT: number;
  readonly camPadW: number;
  /** Plain relief that carries the pin off the back of the cam. */
  readonly reliefW: number;
  /** Where the pin sits. It is fixed to the case and never moves in y. */
  readonly xNotch: number;
  readonly yBoss: number;
  readonly bossTop: number;
  readonly pinLen: number;
  readonly pinPreload: number;
  /** The arm: root, cross-section, free length, and what it is strained to. */
  readonly xRoot: number;
  readonly yRoot: number;
  readonly armW: number;
  readonly armH: number;
  readonly armLen: number;
  readonly armStrain: number;
  readonly armLiftStrain: number;
  /** Through-window in the floor that the arm swings in. */
  readonly winX0: number;
  readonly winX1: number;
  readonly winY0: number;
  readonly winY1: number;
  readonly rootX0: number;
  readonly rootX1: number;
  readonly rootY0: number;

  // -------------------------------------------------------------- the band
  readonly bandLen: number;
  readonly bandPull: number;
  readonly postX: number;
  readonly postY: number;
  readonly postLx: number;
  readonly postLy: number;
  readonly postTop: number;
  readonly moatX: number;
  readonly moatY: number;
  readonly moatIslandR: number;
  readonly moatOuterR: number;
  readonly moatDeep: number;
  /** How far the band throws the drawer before it goes slack. The cam's `pop`. */
  readonly pop: number;
  readonly bandStretchOpen: number;

  // -------------------------------------------------------- travel & stop
  readonly pinX: number;
  readonly pinY: number;
  readonly pinD: number;
  readonly pinHeadD: number;
  readonly pinHeadH: number;
  readonly pinHoleDeep: number;
  readonly pinPitch: number;
  readonly barT: number;
  readonly barW: number;
  readonly barBackY: number;
  readonly barLipH: number;
  readonly earL: number;
  readonly earScrewX: number;
  readonly earScrewY: number;
  readonly stopScrewD: number;
  readonly stopScrewHeadD: number;
  readonly stopScrewHeadH: number;
  readonly stopScrewPitch: number;
  readonly travel: number;

  // -------------------------------------------------------------- printer
  readonly nozzle: number;
  readonly layer: number;
  readonly bed: readonly [number, number];
  readonly minWall: number;
}

const TIER_NAMES = ['Top', 'Second', 'Third', 'Fourth'];

export function derive(p: Params): Derived {
  const nozzle = Number(p.nozzle);
  const layer = Number(p.layer);
  const minWall = Math.max(2 * nozzle, 0.8);
  const clear = Number(p.clearance);

  const W = Number(p.width);
  const D = Number(p.depth);
  const H = Number(p.height);
  const wall = Math.max(Number(p.wall), minWall);
  const n = Math.min(4, Math.max(1, Math.round(Number(p.drawers))));

  const yBackIn = D / 2 - wall;
  const yFront = -D / 2;
  const innerW = W - 2 * wall;

  const latch = p.latch === true;
  const bossD = Number(p.bossDiameter);
  const armW = Math.max(Number(p.armWidth), 2 * nozzle);
  const armH = Number(p.armHeight);
  const over = Number(p.overtravel);
  const lead = Number(p.leadIn);
  const lip = Number(p.lip);
  const trayWall = Math.max(Number(p.trayWall), minWall);
  const skin = Math.max(1.1, 5 * layer);

  // --- the band, worked out first, because the cam is sized to its throw
  //
  // One band a side, from an oval post on the case floor to an island in a
  // moat under the drawer. Shut, the island sits `bandPull` behind the post
  // and the band is stretched; released, it hauls the drawer out until the two
  // are close enough for the band to go slack. THAT distance is the pop, and
  // the pop is exactly the distance from the cam's notch to its rest point --
  // one number, or the pin stops somewhere the groove does not expect it.
  const bandLen = Number(p.bandLength);
  const bandPull = Number(p.bandPull);
  const postX = 20;
  const postLx = 7;
  const postLy = 4.5;
  const moatX = 34;
  const moatIslandR = 4.5;
  const moatOuterR = 8.5;
  const moatDeep = 2;
  const slackSpan = bandLen - (Math.PI * (moatIslandR + postLy / 2)) / 2;
  const dxPost = moatX - postX;
  const slackY = slackSpan > dxPost ? Math.sqrt(slackSpan * slackSpan - dxPost * dxPost) : 0;
  const pop = Math.max(2, bandPull - slackY);

  // --- the cam
  const grooveW = bossD + 2 * clear;
  // Every corner is rounded off by half a groove width from either side, so a
  // segment only two groove widths long is all corner, with no ramp left in
  // the middle to carry the one-way step. The apex-to-notch run is
  // hypot(over, camV), so this is that solved for camV.
  const camFloor = Math.sqrt(Math.max(0, (2.6 * grooveW) ** 2 - over ** 2));
  const camV = Math.max(Number(p.camWidth) / 2, camFloor);
  const camStep = Math.max(2 * layer, Number(p.camStep));
  const camDeep = bossD * 0.9 + camStep;
  // Enough to commit the pin to the left branch, never so much that it misses
  // the funnel on the way back in.
  const camBias = grooveW * 0.35;
  const camPadT = camDeep + skin;
  const camPadW = 2 * camV + grooveW + 6;
  const reliefW = grooveW + 1;

  // --- how high the drawer rides
  //
  // The arm lies on the case floor and the drawer skims over it, with room
  // above for a band to lie flat. That gap is what the pin crosses before it
  // even reaches the groove, which is why it is part of the pin's length.
  // The arm lies IN the window, flush with the floor's underside, so its top
  // is `armH` above the floor's BOTTOM and it stands (armH - wall) proud of the
  // floor's top. The band's gap is measured from the arm, not from the floor.
  const bandGap = Math.max(2.2, clear + 1.8);
  const hb = Math.max(armH - wall, 0) + bandGap;
  const boxZ = wall + hb;
  const pinPreload = 0.3;
  const pinLen = bandGap + camDeep + pinPreload;
  const bossTop = armH + pinLen;
  const postTop = boxZ - clear;
  const boxH = H - boxZ - Math.max(0.7, clear + 0.3);

  // --- the rails, and the slots that hang on them
  //
  // A one-sided dovetail: the rail's head overhangs OUTWARD at 45 degrees and
  // the slot's outer wall slants to match, so the drawer hangs on two lines of
  // contact like a V-block and centres itself. The crest never touches.
  const boxW = innerW - 2 * clear;
  const railX = 0.35 * boxW;
  const railBase = 4;
  const railH = Number(p.railHeight);
  // The head has to overhang the slot's mouth by a real amount after the
  // clearance is taken off it, or the drawer lifts off its rails. The mouth
  // sits (1 + sqrt2) clearances outboard of the rail, so that comes off first
  // and 1.2 mm of engagement is what is left.
  const headOvh = 1.2 + (1 + Math.SQRT2) * clear;
  const railOuter = railX + railBase / 2;
  // The flank starts just under the drawer's underside, so the slot's slanted
  // wall -- the same plane -- never reaches down into the rail's base.
  const flankZ0 = hb - clear;
  const headH = railH - flankZ0;
  // The slot is as deep as the rail is tall, less how high the drawer already
  // rides, plus a millimetre so the crest never touches: the drawer must hang
  // on the two flanks, and a drawer sitting on the crests has lost the fit.
  const crestClear = 1;
  const slotDeep = railH - hb + crestClear;
  // Offset outward along the 45-degree normal by the running clearance. Left
  // exactly on the rail's own flank plane the two are coincident surfaces, and
  // Manifold reports a sliver of contact down the whole length of both rails.
  const slotMouth = railOuter - flankZ0 + hb + Math.SQRT2 * clear;
  const slotInner = railX - railBase / 2 - 3 * clear;

  // The floor slab has to hold every recess cut into it -- the groove, the slot
  // and the band moat -- and still have a skin over each.
  const slabT = Math.max(camPadT, slotDeep + skin, moatDeep + skin, 2.4);

  // --- where the drawer sits when shut
  const boxBackY = yBackIn - over;
  const boxFrontY = yFront - lip;
  const boxD = boxBackY - boxFrontY;

  // --- the arm and its pin
  //
  // The arm runs diagonally across the floor from a root on the back wall to
  // the pin, so most of its length lies ALONG the travel and its flex is
  // across it. Its section is narrow and tall on purpose: soft sideways, so
  // the cam can throw the pin from one apex to the other, and stiff upward, so
  // the pin stays down in the groove while it climbs the one-way steps.
  const xNotch = 0;
  const xRoot = 13.5;
  const yBoss = yBackIn - (lead + pop + over + 14);
  const yRoot = yBackIn - 6.7;
  const armLen = Math.hypot(xRoot - xNotch, yRoot - yBoss);
  const armThrow = camV + camBias;
  const armStrain = (3 * armW * armThrow) / (2 * armLen * armLen);
  const armLiftStrain = (3 * armH * (camStep + pinPreload)) / (2 * armLen * armLen);

  const winX0 = Math.min(xNotch - camV - grooveW - 4, -15.75);
  const winX1 = xRoot + 2.25;
  const winY0 = yBoss - 8;
  const winY1 = yBackIn - 3.2;
  const rootX0 = xRoot - 2.1;
  const rootX1 = xRoot + 4.25;
  const rootY0 = yBackIn - 9.5;

  const postY = yBoss - 8;
  const moatY = postY + bandPull;

  // --- travel stops
  //
  // Two printed screws in the drawer's underside near its back corners, heads
  // hanging down, and a bar across the front of the case they fetch up
  // against. The bar is screwed on last, from underneath: take it off and the
  // drawer lifts straight out of its rails.
  const pinX = Math.min(railX - 12, innerW / 2 - 18);
  const pinY = boxBackY - 5.2;
  const pinD = 6.9;
  const pinHeadD = 7.5;
  const pinHeadH = Math.max(1.6, hb - 1.8);
  const pinHoleDeep = Math.max(2.5, slabT - 1.2);
  const pinPitch = 1.5;
  const barT = 2.4;
  const barW = 10;
  const barBackY = yFront + 2;
  const barLipH = 2;
  const earL = 10;
  const earScrewX = innerW / 2 - 5;
  const earScrewY = barBackY + earL / 2;
  const stopScrewD = 4.9;
  const stopScrewHeadD = 7.8;
  const stopScrewHeadH = 1.2;
  const stopScrewPitch = 1.2;
  const travel = pinY - pinHeadD / 2 - barBackY;
  const openSpan = Math.hypot(travel - bandPull, dxPost);
  const bandStretchOpen = (2 * openSpan + Math.PI * (moatIslandR + postLy / 2)) / (2 * bandLen);

  // --- the stack
  const connector = n > 1 ? (String(p.connector) as Connector) : 'none';
  const mount = String(p.mount) as Mount;
  const lugW = 8;
  const lugL = 10;
  const lugH = 14;
  const lugY = D / 2 - 2 - lugL / 2;

  // --- the insert
  const insert = String(p.insert) as Insert;
  const gridCols = Math.floor((boxW - 2 * trayWall - 0.4) / GRID_PITCH);
  const gridRows = Math.floor((boxD - 2 * trayWall - 0.4) / GRID_PITCH);

  return {
    W,
    D,
    H,
    wall,
    tiers: Array.from({ length: n }, (_, k) => ({
      index: k,
      name: n === 1 ? 'Drawer' : `${TIER_NAMES[k]} drawer`,
      z0: (n - 1 - k) * H,
    })),
    clear,
    yBackIn,
    yFront,
    innerW,
    mount,
    screwD: Number(p.screwDiameter),
    earOut: 9,
    earT: 2.5,
    earHoleY: D / 2 - 19.5,
    connector,
    lugW,
    lugL,
    lugH,
    lugY,
    stackScrewD: 5,
    stackScrewPitch: 1.2,
    boltD: 3.2,

    railX,
    railBase,
    railH,
    headOvh,
    headH,
    slotInner,
    slotMouth,
    slotDeep,
    crestClear,

    boxW,
    boxD,
    boxH,
    boxZ,
    hb,
    boxBackY,
    boxFrontY,
    trayWall,
    slabT,
    skin,
    cornerR: Number(p.cornerRadius),
    lip,
    over,
    insert,
    gridCols,
    gridRows,
    divX: Math.round(Number(p.dividersX)),
    divY: Math.round(Number(p.dividersY)),

    surface: String(p.surface) as Surface,
    emboss: p.surfaceMode === 'emboss',
    surfaceCell: Number(p.surfaceCell),
    surfaceGap: Number(p.surfaceGap),
    surfaceDepth: Number(p.surfaceDepth),
    surfaceAngle: Number(p.surfaceAngle),
    surfaceBorder: Number(p.surfaceBorder),

    latch,
    bossD,
    lead,
    grooveW,
    camV,
    camBias,
    camDeep,
    camStep,
    camPadT,
    camPadW,
    reliefW,
    xNotch,
    yBoss,
    bossTop,
    pinLen,
    pinPreload,
    xRoot,
    yRoot,
    armW,
    armH,
    armLen,
    armStrain,
    armLiftStrain,
    winX0,
    winX1,
    winY0,
    winY1,
    rootX0,
    rootX1,
    rootY0,

    bandLen,
    bandPull,
    postX,
    postY,
    postLx,
    postLy,
    postTop,
    moatX,
    moatY,
    moatIslandR,
    moatOuterR,
    moatDeep,
    pop,
    bandStretchOpen,

    pinX,
    pinY,
    pinD,
    pinHeadD,
    pinHeadH,
    pinHoleDeep,
    pinPitch,
    barT,
    barW,
    barBackY,
    barLipH,
    earL,
    earScrewX,
    earScrewY,
    stopScrewD,
    stopScrewHeadD,
    stopScrewHeadH,
    stopScrewPitch,
    travel,

    nozzle,
    layer,
    bed: [Number(p.bedX), Number(p.bedY)] as const,
    minWall,
  };
}

/** Y of the cam pattern's origin (u = 0, the rest position) when shut. */
export function camOriginY(d: Derived): number {
  return d.yBoss + d.pop;
}

/** The rearmost point of the cam: the mouth of the lead-in funnel. */
export function funnelY(d: Derived): number {
  return camOriginY(d) + d.lead;
}

/** Where the groove spans in assembled y, front to back. */
export function camSpanY(d: Derived): readonly [number, number] {
  return [d.yBoss - d.over - d.grooveW, funnelY(d) + d.grooveW] as const;
}

/** The cam, in the form the shared heart-cam module wants. */
export function camSpec(d: Derived): CamSpec {
  return {
    pop: d.pop,
    over: d.over,
    lead: d.lead,
    camV: d.camV,
    camBias: d.camBias,
    grooveW: d.grooveW,
    camDeep: d.camDeep,
    camStep: d.camStep,
  };
}
