import type { Params } from '../../core/params/types';

/** Base edge to the outside of the walls. */
export const RIM = 3;
/** Door leaf thickness, and the lip of the track that holds its edge. */
export const DOOR_T = 2;
export const TRACK_LIP = 1.6;
/** How far each track rail stands past the door edge it holds. */
export const TRACK_RAIL = 3.5;
/** How far a closed leaf laps over the opening, top, bottom and sides. */
export const DOOR_LAP = 3;
export const DECK_T = 3;
export const RAIL_H = 12;
export const RAIL_T = 1.6;
/** Railing pegs, and the holes in the deck they press into. */
export const PEG = 1.4;
export const PEG_FIT = 0.1;
export const BRIDGE_W = 12;
export const BRIDGE_T = 2;
export const LADDER_W = 8;
/**
 * Tower slide: a rail standing on the floor, and a channel under the tower's
 * foot that rides it. The channel is a short bridge, so the tower prints
 * upright with nothing hanging under it.
 */
export const RIB_W = 5;
export const RIB_H = 2.5;
export const FOOT_T = 5.5;
export const POST = 2.4;
export const TOP_T = 3;
export const BOSS_H = 3;
export const JIB_H = 4;
export const PIN_HEAD = 1.2;
/** Where two leaves meet: a zigzag this wide, one tooth per pitch. */
export const SEAM_AMP = 6;
export const SEAM_PITCH = 16;
/** Height of the hazard-stripe band along the foot of each leaf. */
export const HAZARD_H = 8;
/** How far inlays (stripes, glass, floor markings) sit into what carries them. */
export const INLAY = 0.6;
/** The control room's doorway, a figure's height at 1/144. */
export const ROOM_DOOR_H = 14;
export const ROOM_DOOR_W = 20;
/** Wall height kept for the doorway, its hood and the plates above it, under the room. */
export const ROOM_DOOR_ZONE = 20;
export const PIPE_R = 1.6;
/** Printed pins in the robot arm's joints, finer than the pivot pins. */
export const ARM_PIN = 2;
/**
 * The crane's house, in its own frame: u out from the tower's axis toward the
 * boom, v across. Its deck, centred at HOUSE_U; the boom's hinge; the boom on
 * one side of the turning pin and the operator's cab on the other.
 */
export const HOUSE_L = 28;
export const HOUSE_W = 22;
export const HOUSE_U = -1;
export const DECK_H = 2.5;
export const HINGE_U = 7;
export const HINGE_Z = 8;
export const BOOM_V = 6.5;
export const BOOM_H = 4;
export const BOOM_HALF = 2;
export const LUG_T = 1.8;
export const LUG_GAP = 0.2;
/** The cab: its back edge along u, how deep, how far it stands off the pin across, how wide and tall. */
export const CAB_U0 = -2;
export const CAB_D = 15;
export const CAB_V = 3.5;
export const CAB_W = 7.5;
export const CAB_H = 14.5;

export interface Derived {
  readonly W: number;
  readonly D: number;
  readonly baseH: number;
  readonly wallH: number;
  readonly t: number;
  readonly fit: number;
  readonly c: number;
  /** How deep the walls stand in the base. */
  readonly slotD: number;
  readonly floorZ: number;
  readonly wallTop: number;
  readonly both: boolean;

  /** Left wall outer and inner faces, in X. */
  readonly xl0: number;
  readonly xl1: number;
  /** Right edge of the bay: the right wall's inner face, or the base rim. */
  readonly bayRight: number;
  /** Back wall back and front faces, in Y. */
  readonly yBack: number;
  readonly yb0: number;
  /** Front end of the side walls. */
  readonly yFront: number;
  /** Back end of the side walls, short of the back wall by the slot fit. */
  readonly ySideEnd: number;

  // --- door
  readonly door: boolean;
  readonly leaves: 1 | 2;
  readonly doorW: number;
  readonly doorH: number;
  /** Bottom and top of the opening. */
  readonly openZ0: number;
  readonly openZ1: number;
  /** Bottom and top edge of a leaf, at its wall side. */
  readonly leafZ0: number;
  readonly leafZ1: number;
  /** Vertical gap between a leaf's bevelled edge and the track over it. */
  readonly trackGap: number;
  /** How far the track stands off the wall. */
  readonly trackDepth: number;
  readonly trackX0: number;
  readonly trackX1: number;
  /** Leaves as [x0, x1] when closed. */
  readonly leafSpans: readonly (readonly [number, number])[];
  /** The doorway's top corners are cut off at 45 degrees by this much. */
  readonly doorChamfer: number;
  /** The heavy beam over the doorway, above the track, when the wall has room. */
  readonly header: boolean;
  readonly headerZ0: number;
  readonly headerZ1: number;

  // --- control room
  readonly room: boolean;
  /** How far it stands out from the wall, how long and how tall its box is. */
  readonly rd: number;
  readonly rl: number;
  readonly rh: number;
  /** The walkway its doorway opens onto. */
  readonly roomLevel: number;
  /** Bottom and top of the box, which has a 45 degree wedge under it. */
  readonly rz0: number;
  readonly rz1: number;
  readonly ry0: number;
  readonly ry1: number;
  readonly roomWindows: number;
  readonly roofRailing: boolean;

  // --- details
  readonly hazard: boolean;
  readonly wallPanels: boolean;
  readonly pipes: boolean;

  // --- catwalk
  readonly catwalk: boolean;
  /** Top of the deck. */
  readonly cz: number;
  readonly cd: number;
  readonly deckY0: number;
  readonly deckY1: number;
  readonly railing: boolean;
  readonly ladder: boolean;
  readonly ladderY0: number;
  /** Ladders at the crew's scale: their width and the spacing of their rungs. */
  readonly ladderW: number;
  readonly rungPitch: number;
  /** Model millimetres per real metre, at the crew scale. */
  readonly crewK: number;
  /** Guard rails at the crew's scale: 1.05 m high, posts no more than 1.8 m apart. */
  readonly railH: number;
  readonly postSpacing: number;
  /** The catwalk's leg frame under its outer edge, front to back, and across. */
  readonly legs: boolean;
  readonly legY0: number;
  readonly legY1: number;
  readonly legX0: number;
  readonly bridge: boolean;
  readonly bridgeL: number;
  /** Bridge pivot, near the front corner of the deck. */
  readonly pivot: readonly [number, number];
  readonly pivotR: number;

  // --- tower
  readonly tower: boolean;
  readonly towerH: number;
  readonly tw: number;
  readonly footW: number;
  readonly railY: number;
  readonly grooveX0: number;
  readonly grooveX1: number;
  readonly towerX: number;
  /** Top of the lattice, under the top plate. */
  readonly towerTop: number;
  readonly jib: boolean;
  readonly jibL: number;
  /** Which way the arm points as built: toward the middle of the bay. */
  readonly jibDir: 1 | -1;
  /** A robot arm on the crane arm's tip rather than a hook. */
  readonly robotArm: boolean;
  readonly robotArmL: number;
  readonly jointHole: number;
  readonly armPinD: number;
  readonly craneCab: boolean;
  /** The open steel roof frame on the wall tops. */
  readonly ceiling: boolean;
  readonly trussSpacing: number;
  readonly trussDepth: number;
  readonly ceilingLights: boolean;
  /** The boom's angle above level, in degrees, as the model is shown. */
  readonly boomAngle: number;
  readonly towerLadder: boolean;

  // --- pins
  readonly printedPins: boolean;
  readonly pinD: number;
  readonly pinHole: number;

  readonly floorPanels: boolean;
  readonly panelSize: number;
  readonly wallRibs: boolean;
  readonly wallFrames: boolean;
  readonly frameBay: number;
  readonly ribSpacing: number;

  readonly bedX: number;
  readonly bedY: number;
}

export function derive(p: Params): Derived {
  const W = Number(p.bayWidth);
  const D = Number(p.bayDepth);
  const baseH = Number(p.baseHeight);
  const wallH = Number(p.wallHeight);
  const t = Number(p.wallThickness);
  const fit = Number(p.wallFit);
  const c = Number(p.clearance);
  const slotD = Math.min(5, baseH - 3);
  const floorZ = baseH;
  const both = p.sideWalls === 'both';

  const xl0 = -W / 2 + RIM;
  const xl1 = xl0 + t;
  const bayRight = both ? W / 2 - RIM - t : W / 2 - RIM;
  const yBack = D / 2 - RIM;
  const yb0 = yBack - t;
  const yFront = -D / 2 + RIM;
  const ySideEnd = yb0 - fit;

  // --- door
  const door = p.door === true;
  const leaves = p.doorLeaves === '1' ? 1 : 2;
  const doorW = Number(p.doorWidth);
  const doorH = Number(p.doorHeight);
  const sill = DOOR_LAP + TRACK_RAIL + 1.5;
  const openZ0 = floorZ + sill;
  const openZ1 = openZ0 + doorH;
  const trackGap = 1.5 * c;
  const trackDepth = DOOR_T + 2 * c + TRACK_LIP;
  // The track stops short of the side walls, which then keep the leaves in.
  const trackX0 = xl1 + 0.5;
  const trackX1 = both ? bayRight - 0.5 : W / 2 - RIM;
  const half = doorW / 2 + DOOR_LAP;
  // Two leaves meet on a zigzag, so each reaches half the seam's swing past centre.
  const leafSpans: [number, number][] =
    leaves === 2 ? [[-half, SEAM_AMP / 2 - c], [-SEAM_AMP / 2 + c, half]] : [[-half, half]];
  const doorChamfer = Math.min(12, doorW / 5, doorH / 5);
  const headerZ0 = openZ1 + DOOR_LAP + trackGap + c + TRACK_RAIL + 1.5;
  const headerZ1 = headerZ0 + 8;

  // --- catwalk
  const catwalk = p.catwalk === true;
  const cz = floorZ + Number(p.catwalkHeight);
  const cd = Number(p.catwalkDepth);
  const deckY0 = yFront;
  // Short of the back wall by the door track, which runs right across it.
  const deckY1 = door ? yb0 - trackDepth - 1 : ySideEnd;
  const ladder = catwalk && p.ladder === true;
  // A real ladder: about 55 cm wide with rungs 30 cm apart, no finer than prints.
  const crewK = 1000 / Number(p.stairScale ?? 144);
  const ladderW = Math.max(5, 0.55 * crewK);
  const rungPitch = Math.max(2.1, 0.3 * crewK);
  const ladderY0 = deckY1 - 3 - ladderW;
  const bridge = catwalk && p.bridge === true;
  const pivotR = BRIDGE_W / 2 + 0.5;
  const pivot: [number, number] = [xl1 + cd - pivotR, deckY0 + pivotR];

  // --- tower
  const tower = p.tower === true;
  const tw = Number(p.towerWidth);
  const footW = tw + 8;
  const railY = yFront + footW / 2 + 3;
  const grooveX0 = xl1 + 4;
  // With the ceiling on one wall, its corner column stands at the front
  // right; the rail ends short of it so the tower stops before it.
  const columnRoom = p.ceiling === true && !both ? 8 : 0;
  const grooveX1 = bayRight - 4 - columnRoom;
  // Its foot stops short of the right wall and the ribs standing off it.
  const towerX = grooveX1 - footW / 2 + 1.5;
  const towerH = Number(p.towerHeight);
  const towerTop = floorZ + towerH - TOP_T - BOSS_H;

  // --- control room, over the back end of the catwalk
  const room = p.controlRoom === true;
  const rd = Number(p.roomDepth);
  const rl = p.roomFullLength === true ? deckY1 - deckY0 : Number(p.roomLength);
  const rh = Number(p.roomHeight);
  const roomLevel = catwalk ? cz : floorZ + Math.round(wallH * 0.45);
  // Room for the doorway and its hood above the walkway, then the 45 degree underside.
  const rz0 = roomLevel + ROOM_DOOR_ZONE + rd;

  const printedPins = p.pinStyle === 'printed';
  const pinD = printedPins ? Number(p.pinDiameter) : 1.75;

  return {
    W, D, baseH, wallH, t, fit, c, slotD, floorZ,
    wallTop: floorZ + wallH,
    both, xl0, xl1, bayRight, yBack, yb0, yFront, ySideEnd,
    door, leaves, doorW, doorH, openZ0, openZ1,
    leafZ0: openZ0 - DOOR_LAP,
    leafZ1: openZ1 + DOOR_LAP,
    trackGap, trackDepth, trackX0, trackX1, leafSpans,
    doorChamfer,
    header: door && headerZ1 + 2 <= floorZ + wallH,
    headerZ0, headerZ1,
    room, rd, rl, rh, roomLevel, rz0,
    rz1: rz0 + rh,
    ry0: deckY1 - rl,
    ry1: deckY1,
    roomWindows: Math.max(1, Math.round(Number(p.roomWindows))),
    roofRailing: room && p.roofRailing === true,
    hazard: p.hazardStripes === true,
    wallPanels: p.wallPanels === true,
    pipes: p.pipes === true,
    catwalk, cz, cd, deckY0, deckY1,
    railing: catwalk && p.railing === true,
    ladder, ladderY0, ladderW, rungPitch, crewK, bridge,
    railH: Math.max(6.5, 1.05 * crewK),
    postSpacing: Math.max(10, 1.8 * crewK),
    legs: catwalk && p.catwalkLegs === true,
    // Clear of the gantry tower, which slides along the front of the floor.
    legY0: tower ? Math.max(deckY0 + 2, railY + footW / 2 + 4) : deckY0 + 2,
    legY1: deckY1 - 1.5,
    legX0: xl1 + cd - 4,
    bridgeL: Number(p.bridgeLength),
    pivot, pivotR,
    tower, towerH, tw, footW, railY, grooveX0, grooveX1, towerX, towerTop,
    jib: tower && p.jib === true,
    jibL: Number(p.jibLength),
    jibDir: towerX >= 0 ? -1 : 1,
    robotArm: tower && p.jib === true && p.craneTool === 'arm',
    robotArmL: Number(p.robotArmLength),
    armPinD: printedPins ? ARM_PIN : 1.75,
    jointHole: (printedPins ? ARM_PIN : 1.75) + 2 * Number(p.jointFit),
    craneCab: tower && p.jib === true && p.craneCab === true,
    boomAngle: Number(p.boomAngle),
    ceiling: p.ceiling === true,
    trussSpacing: Number(p.trussSpacing),
    trussDepth: Number(p.trussDepth),
    ceilingLights: p.ceiling === true && p.ceilingLights === true,
    towerLadder: tower && p.towerLadder === true,
    printedPins, pinD,
    pinHole: pinD + 2 * c,
    floorPanels: p.floorPanels === true,
    panelSize: Number(p.panelSize),
    wallRibs: p.wallStyle === 'ribs',
    wallFrames: p.wallStyle === 'frames',
    frameBay: Number(p.frameBayWidth),
    ribSpacing: Number(p.ribSpacing),
    bedX: Number(p.bedX),
    bedY: Number(p.bedY),
  };
}

/** Top of the track over the door, from the floor. */
export function trackTop(d: Derived): number {
  return d.leafZ1 + d.trackGap + d.c + TRACK_RAIL;
}

/** How far each closed leaf has to travel to clear the opening, against the track it has. */
export function doorTravel(d: Derived): { need: number; room: number }[] {
  return d.leafSpans.map(([x0, x1]) => {
    const w = x1 - x0;
    // A leaf left of centre opens left; a single leaf opens toward the longer end.
    const left = d.leaves === 2 ? x1 <= 0 : -d.trackX0 >= d.trackX1;
    return left
      ? { need: d.doorW / 2 + w, room: -d.trackX0 }
      : { need: d.doorW / 2 + w, room: d.trackX1 };
  });
}

/** Flat footprint of each wall as printed, lying down. */
export function wallSizes(d: Derived): { back: [number, number]; side: [number, number] } {
  const h = d.wallH + d.slotD;
  return {
    back: [d.W - 2 * RIM, h],
    side: [d.ySideEnd - d.yFront, h],
  };
}

export function fitsBed(d: Derived, [w, h]: readonly [number, number]): boolean {
  return (w <= d.bedX && h <= d.bedY) || (w <= d.bedY && h <= d.bedX);
}
