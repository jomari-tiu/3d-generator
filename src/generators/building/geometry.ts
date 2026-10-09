import type { Params } from '../../core/params/types';
import { traitsOf, type Ground, type Style, type StyleTraits } from './styles';

/**
 * Real-world -> model, and everything that follows from it.
 *
 * The whole generator is one conversion: a building is designed in feet and
 * inches and printed in millimetres, and every interesting problem lives at
 * that boundary. A 5-inch stud partition is 0.88 mm at 1:144 -- two extrusions
 * and no more -- and a 4-inch one does not exist as a printable object at all.
 * So every thickness here is scaled AND clamped up to what a nozzle can lay
 * down, and the clamp is reported rather than hidden: the user is told what
 * real thickness the wall they are actually getting represents.
 */

export const FT_MM = 304.8;
export const IN_MM = 25.4;

/** Real feet of landing at a switchback turn. Below this you cannot turn on it. */
export const LANDING_FT = 3.5;

/**
 * The scales the control offers, largest model first.
 *
 * One list, read by the schema to build the dropdown AND by validate() when it
 * has to name a scale that would fit the bed. Advice that recommended 1:137
 * would be advice to abandon the whole point of working at a standard scale.
 */
export const STANDARD_SCALES = [48, 72, 87, 100, 144, 160, 200] as const;

/**
 * The plate this generator designs to, fixed at 256 x 256 mm.
 *
 * Not a setting. A building is the one thing here whose size is dictated from
 * the other end -- you choose a real building and a scale, and the millimetres
 * are whatever falls out -- so the plate has to be the fixed point that the
 * scale advice is measured against. "1:144 would fit it on one plate" means
 * nothing if the plate is also a variable.
 */
export const BED_MM: readonly [number, number] = [256, 256];

/** Clearance on each side of a peg or a tongue, so the pieces go together. */
const PIN_CLEAR = 0.15;

export type Layout = 'open' | 'rooms' | 'corridor';
export type Windows = 'none' | 'punched' | 'ribbon';
export type Roof = 'flat' | 'parapet' | 'railing' | 'penthouse' | 'gable' | 'hip' | 'none';
/**
 * What the plan is: a free-standing rectangle, or an L that fills the inside
 * corner of a shelf with one wing along each wall.
 */
export type Shape = 'rect' | 'corner';
/** What stands on a flat roof. */
export type Rooftop = 'empty' | 'helipad' | 'garden' | 'plant' | 'watertank' | 'solar';
/** What the outside face of the exterior walls is drawn as. */
export type Cladding = 'smooth' | 'brick' | 'stone' | 'siding' | 'batten' | 'panels';
export type Stairs = 'none' | 'straight' | 'switchback';
export type Split = 'single' | 'storeys';

/**
 * How one printed storey connects to the next.
 *
 * `pins` are four pegs and four sockets: they stop the stack sliding, and that
 * is all they can do -- a peg is capped at the wall's own thickness, which at
 * 1:144 is a 1.2 mm stub. `tongue` runs the whole wall head instead: a rib
 * round the top of every wall and a matching groove in the underside of the
 * slab above, so the two pieces find each other on the way down, meet along
 * hundreds of millimetres of contact and cannot rack. It is the same joint a
 * kit box lid uses, for the same reason.
 */
export type Joint = 'tongue' | 'pins' | 'none';

export interface Derived {
  readonly scale: number;
  /** Model mm per real foot. Everything dimensional goes through this. */
  readonly perFt: number;

  // ------------------------------------------------------------------ style
  readonly style: Style;
  /** Which facade elements this style has. See styles.ts. */
  readonly t: StyleTraits;
  /** Model mm cut off each corner in plan. Zero for a plain rectangle. */
  readonly chamfer: number;
  readonly balconyD: number;
  /** How far the canopy slab over the ground floor runs out. Zero without one. */
  readonly awningD: number;
  /** Width of a glazing bar dividing a window into panes. */
  readonly paneBar: number;
  /** Shop bays with round heads instead of square ones. */
  readonly archedShops: boolean;
  readonly balconyW: number;
  readonly railT: number;
  readonly railH: number;
  /** How far a floor or spandrel band stands proud of the wall. */
  readonly bandProj: number;
  readonly bandH: number;
  readonly stripeW: number;
  readonly stripeCount: number;
  readonly signW: number;
  /** How tall the screen stands, model mm: from the first floor on the facade, from the deck on the roof. */
  readonly signH: number;
  /** Where the screen goes: up the front, or standing on the roof behind the parapet. */
  readonly signPlace: 'facade' | 'roof';
  /** How the screen's face is worked -- see screenSolid in facade.ts. */
  readonly signStyle: 'framed' | 'slim' | 'tiled';
  /** How a rooftop screen stands: low and braced, or raised on a steel frame. */
  readonly signMount: 'braced' | 'frame';
  /** How far a framed rooftop screen is lifted above the deck. */
  readonly signLift: number;
  readonly signProj: number;
  /** Width of the raised border standing round the blank billboard face. */
  readonly signFrame: number;
  readonly canopyW: number;
  readonly canopyD: number;
  readonly canopyT: number;
  /** Side of a square column under an open ground floor. */
  readonly colSize: number;
  /** What the column would have been on the real building alone, unclamped. */
  readonly colSizeScaled: number;
  /** Clear height of a column: the ground storey less its slab. */
  readonly colH: number;
  /** A glazed shopfront set back behind the columns, bracing them. */
  readonly shopfront: boolean;
  readonly shopT: number;
  /** How far the shopfront stands behind the face of the columns. */
  readonly shopSet: number;
  readonly mullionPitch: number;
  readonly mullionT: number;
  /** Model mm the stair tower rises above the roof deck. */
  readonly towerH: number;

  // ---------------------------------------------------------------- storeys
  readonly floors: number;
  /** Real feet floor-to-floor, per level. Index 0 is the ground floor. */
  readonly levelFt: readonly number[];
  /** Model mm floor-to-floor, per level. */
  readonly levelH: readonly number[];
  /** Model mm z of each level's slab UNDERSIDE. */
  readonly levelZ: readonly number[];
  /** Model mm z of the top of the top storey -- where the roof sits. */
  readonly roofZ: number;
  /** Real feet, ground to roof deck. */
  readonly heightFt: number;

  // -------------------------------------------------------------- footprint
  readonly shape: Shape;
  /**
   * Model mm from the shelf wall to the courtyard face, the same for both wings
   * of a corner building. Zero on a rectangle.
   */
  readonly wing: number;
  readonly wingFt: number;
  /** Built for the left-hand corner, then mirrored into the right-hand one. */
  readonly mirror: boolean;
  readonly widthFt: number;
  readonly depthFt: number;
  /** Model mm exterior footprint. X is width, Y is depth, the front face is -Y. */
  readonly W: number;
  readonly D: number;
  readonly innerW: number;
  readonly innerD: number;

  // -------------------------------------------------------------- structure
  /** Model mm AS PRINTED: scaled, then floored at what the nozzle can do. */
  readonly extT: number;
  readonly partT: number;
  readonly slabT: number;
  /** Model mm as the scale alone would have it, before any clamp. */
  readonly extTScaled: number;
  readonly partTScaled: number;
  readonly slabTScaled: number;
  /** Real inches asked for. Compare against the scaled value to see the clamp. */
  readonly extTRealIn: number;
  readonly partTRealIn: number;
  readonly slabTRealIn: number;
  /** How far a partition reaches into whatever it lands on. */
  readonly tie: number;
  /** Real feet of clear ceiling on a typical floor: floor-to-floor less the slab. */
  readonly clearFt: number;

  // ------------------------------------------------------------------- plan
  readonly layout: Layout;
  readonly roomCount: number;
  /** Model mm, the smallest room dimension the splitter will leave. */
  readonly minRoom: number;
  readonly minRoomFt: number;
  readonly seed: number;
  readonly corridorW: number;
  readonly groundOpen: boolean;

  // ------------------------------------------------------------------ doors
  readonly doorW: number;
  readonly doorH: number;
  readonly lintel: boolean;
  readonly entrance: boolean;
  readonly entranceW: number;
  readonly entranceH: number;

  // ---------------------------------------------------------------- windows
  readonly windows: Windows;
  /** Leave a pane of wall at the back of every opening instead of a hole. */
  readonly glazing: boolean;
  readonly paneT: number;
  /** Leave a leaf in every doorway, recessed from its face. */
  readonly doorLeaves: boolean;
  readonly leafT: number;
  /** The shallowest recess that still reads as a reveal rather than a tool mark. */
  readonly revealMin: number;
  /** True when the partition could only afford a reveal on one face. */
  readonly leafOneSided: boolean;
  readonly winW: number;
  readonly winH: number;
  readonly sill: number;
  readonly pitch: number;
  /** Model mm of solid wall kept at each corner before the first window. */
  readonly pier: number;

  // ------------------------------------------------------------------- core
  readonly core: boolean;
  readonly coreW: number;
  readonly coreD: number;
  readonly stairs: Stairs;
  /** Risers per storey, and the real riser height that falls out of it. */
  readonly risers: number;
  readonly riserIn: number;
  /** The riser height asked for, before it was divided into the floor height. */
  readonly riserTargetIn: number;
  readonly treadIn: number;
  /** Model mm of going per tread. */
  readonly treadMm: number;
  /** Model mm of run each flight arrangement needs. */
  readonly runStraight: number;
  readonly runSwitchback: number;

  // ------------------------------------------------------------------- roof
  readonly roof: Roof;
  readonly parapetH: number;
  /**
   * Model mm through the parapet wall, as printed, as scaled, and the real
   * inches asked for. Thinner than the walls below it, as a real one is: it
   * carries nothing but its own coping.
   */
  readonly parapetT: number;
  readonly parapetTScaled: number;
  readonly parapetTRealIn: number;
  /** Model mm the set-back rooftop penthouse stands above the deck. */
  readonly penthouseH: number;
  readonly pitchDeg: number;
  readonly eaves: number;
  readonly roofT: number;
  readonly bulkhead: boolean;
  readonly rooftop: Rooftop;

  // --------------------------------------------------------------- cladding
  readonly cladding: Cladding;

  // ----------------------------------------------------------------- output
  readonly split: Split;
  readonly openFront: boolean;
  /** How one storey keys into the next. See `Joint`. */
  readonly joint: Joint;
  readonly pinR: number;
  readonly pinH: number;
  readonly pinClear: number;
  /** Width of the tongue running round the wall head, across the wall. */
  readonly tongueW: number;
  /** How far it stands above the wall head. */
  readonly tongueH: number;
  /** Depth of the groove that receives it, in the underside of the slab above. */
  readonly grooveD: number;
  readonly base: boolean;
  readonly baseT: number;
  readonly baseMargin: number;
  readonly baseText: string;
  readonly baseTextH: number;
  readonly baseRelief: number;

  // ---------------------------------------------------------------- printer
  readonly nozzle: number;
  readonly layer: number;
  readonly bed: readonly [number, number];
  /** Two extrusions -- the thinnest vertical wall worth printing. */
  readonly minWall: number;
  /** Three layers -- the thinnest horizontal plate worth printing. */
  readonly minPlate: number;
}

export function derive(p: Params): Derived {
  // The scale control is a list of the standard scales plus Custom, and Custom
  // is the only case that defers to the number beside it -- the same bargain
  // `Windows: match the building type` makes with the window kind.
  const scale = Math.max(
    1,
    String(p.scale) === 'custom' ? Number(p.customScale) : Number(p.scale),
  );
  const perFt = FT_MM / scale;
  const ft = (n: number) => n * perFt;
  const inch = (n: number) => (n * IN_MM) / scale;

  const nozzle = Number(p.nozzle);
  const layer = Number(p.layer);
  const minWall = Math.max(2 * nozzle, 0.6);
  const minPlate = Math.max(3 * layer, 0.5);

  // --- storeys
  const floors = Math.max(1, Math.round(Number(p.floors)));
  const typicalFt = Number(p.floorHeight);
  const groundFt = p.tallGround === true ? Number(p.groundHeight) : typicalFt;
  const levelFt = Array.from({ length: floors }, (_, i) => (i === 0 ? groundFt : typicalFt));
  const levelH = levelFt.map(ft);
  const levelZ: number[] = [];
  let z = 0;
  for (const h of levelH) {
    levelZ.push(z);
    z += h;
  }
  const roofZ = z;

  // --- footprint
  const widthFt = Number(p.width);
  const depthFt = Number(p.depth);
  const W = ft(widthFt);
  const D = ft(depthFt);
  const shape: Shape = String(p.footprint) === 'corner' ? 'corner' : 'rect';
  const wingFt = shape === 'corner' ? Number(p.wing) : 0;
  // The facade the front elements go on: the whole front of a rectangle, the
  // courtyard face of the back wing of a corner building.
  const frontLen = shape === 'corner' ? W - ft(wingFt) : W;

  // --- structure. Scaled first, then floored at what the nozzle can lay down.
  const extTRealIn = Number(p.extWall);
  const partTRealIn = Number(p.partition);
  const slabTRealIn = Number(p.slab);
  const extTScaled = inch(extTRealIn);
  const partTScaled = inch(partTRealIn);
  const slabTScaled = inch(slabTRealIn);
  const extT = Math.max(extTScaled, minWall);
  const partT = Math.max(partTScaled, minWall);
  const slabT = Math.max(slabTScaled, minPlate);

  const innerW = Math.max(1, W - 2 * extT);
  const innerD = Math.max(1, D - 2 * extT);

  // A partition stops INSIDE whatever it lands on rather than crossing it: a
  // three-quarter bite welds solidly at any slicer resolution, and never pokes
  // a stub out into the room on the far side.
  const tie = Math.max(0.3, Math.min(extT, partT) * 0.75);

  // --- core and stairs
  const riserIn = Number(p.riser);
  const treadIn = Number(p.tread);
  // Risers divide the floor height exactly; the input is a target, not the
  // answer. A 9 ft 6 in floor at a 7 in target comes out 16 risers of 7.125 in.
  const risers = Math.max(2, Math.round((typicalFt * 12) / riserIn));
  // n risers means n-1 treads: the top landing is the floor above, not a tread.
  const runStraight = inch((risers - 1) * treadIn);
  // A switchback turns at a landing, so the first flight is one tread shorter
  // than its riser count suggests -- the landing IS that tread, only deeper.
  const runSwitchback = inch((Math.ceil(risers / 2) - 1) * treadIn) + ft(LANDING_FT);

  // --- style. The traits decide WHICH facade elements exist; the numbers
  // below are the user's, and are read only by the elements that are on.
  const style = String(p.style) as Style;
  // Two traits the user can take over, the way Windows can: the ground floor
  // and the panes are what most separate one real building from the next, so
  // a type's choice is a default, not a rule. Folded into the traits here so
  // every element downstream reads one answer.
  const base = traitsOf(style);
  const groundAsk = String(p.groundFloor);
  const panesAsk = String(p.panes);
  const t: StyleTraits = {
    ...base,
    ground: groundAsk === 'auto' || !groundAsk ? base.ground : (groundAsk as Ground),
    panes: panesAsk === 'on' ? true : panesAsk === 'off' ? false : base.panes,
  };
  const sill = ft(Number(p.winSill));

  // --- the column under an open ground floor.
  //
  // A real 1 ft 3 in column is 2.6 mm at 1:144, and 2.6 mm is a perfectly
  // printable post -- until the ground storey is 14 ft and it is 28 mm tall,
  // which is ten to one and snaps at the slab the first time the model is
  // picked up by an upper floor. So the minimum is a SLENDERNESS, not just a
  // real-world size: no column leaves here thinner than an eighth of its own
  // clear height. Like every other clamp in this file it is reported rather
  // than hidden -- validate() says what real column the printed one now reads
  // as -- because the alternative is a model that is quietly out of scale in
  // the one member holding it up.
  const colH = levelH[0]! - slabT;
  const colSizeScaled = Math.max(extT * 1.6, ft(1.25));
  const colSize = Math.max(colSizeScaled, colH / 8);

  // --- the joint between one storey and the next.
  //
  // The tongue is bounded at both ends. Across the wall it has to leave a lip
  // either side of its groove, or the groove opens out through the face of the
  // slab above and there is no joint, just a thinner wall. Upwards it is
  // bounded by the slab it goes into: the groove is a blind channel in the
  // underside, and a groove as deep as the slab is a slot straight through the
  // floor. Where the wall cannot give either, the joint falls back to pins --
  // which are worse, and are reported as such, but always fit.
  const grooveD = Math.min(slabT - 2 * layer, 1.4);
  const tongueW = Math.min(extT * 0.45, extT - 2 * PIN_CLEAR - 0.5);
  const tongueH = grooveD - 0.25;
  const asked = String(p.joint);
  const joint: Joint =
    String(p.split) !== 'storeys'
      ? 'none'
      : asked === 'tongue' && (tongueW < nozzle || tongueH < 2 * layer)
        ? 'pins'
        : ((asked === 'tongue' || asked === 'pins' ? asked : 'none') as Joint);

  // --- closing the openings.
  //
  // The pane and the leaf are wall LEFT STANDING at the back of the opening,
  // so both are bounded by the wall they are part of: whatever is left after
  // a reveal deep enough to read as one. A reveal shallower than a couple of
  // layers is not a reveal, it is a tool mark, so if the wall cannot spare
  // that much the opening stays a hole and validate() says why.
  const revealMin = Math.max(nozzle, 2 * layer);
  const paneT = Math.min(Math.max(nozzle, extT * 0.45), extT - revealMin);
  const leafT = Math.min(Math.max(nozzle, partT * 0.5), partT - revealMin);
  // A spandrel band fills the whole wall under the glass, so its height is the
  // sill: a floor band is just a line at the slab. Both are the same ring.
  const bandH = t.bands === 'spandrel' ? slabT + sill : Math.max(slabT * 1.6, ft(0.6));

  return {
    scale,
    perFt,

    style,
    t,
    // A corner building's outside corners are in the shelf corner or against
    // its walls, where a chamfer only opens a gap nobody can see into.
    chamfer: t.chamfer && shape === 'rect' ? Math.min(ft(Number(p.chamfer)), Math.min(W, D) / 2 - extT * 2) : 0,
    balconyD: ft(Number(p.balconyDepth)),
    awningD: t.awning ? ft(Number(p.awningDepth)) : 0,
    // A real glazing bar is 2 to 3 in -- a third of a millimetre at 1:144 -- so it
    // is floored at two extrusions like every other wall here, and reads heavier.
    paneBar: Math.max(minWall, inch(3)),
    archedShops: p.archedShops === true,
    balconyW: (frontLen - 2 * extT) * Math.min(0.95, Number(p.balconyWidth) / 100),
    railT: Math.max(minWall, inch(6)),
    railH: ft(Number(p.railHeight)),
    bandProj: Math.max(minWall * 0.75, inch(Number(p.bandProjection))),
    bandH,
    stripeW: ft(Number(p.stripeWidth)),
    stripeCount: Math.max(1, Math.round(Number(p.stripes))),
    signW: ft(Number(p.signWidth)),
    signH: ft(Number(p.signHeight)),
    signPlace: String(p.signPlace) === 'roof' ? 'roof' : 'facade',
    signStyle: (['framed', 'slim', 'tiled'].includes(String(p.signStyle))
      ? String(p.signStyle)
      : 'framed') as 'framed' | 'slim' | 'tiled',
    signMount: String(p.signMount) === 'frame' ? 'frame' : 'braced',
    signLift: ft(Number(p.signLift)),
    signProj: Math.max(minWall, inch(Number(p.signProjection))),
    // A border thinner than two extrusions is a line the slicer lays or skips
    // depending on where the panel happens to fall on its grid, and a frame
    // that appears on some sign widths and not others is worse than none.
    signFrame: Math.max(minWall * 1.5, ft(1.1)),
    canopyW: ft(Number(p.entranceWidth)) + ft(4),
    canopyD: ft(Number(p.canopyDepth)),
    canopyT: Math.max(minPlate, inch(10)),
    colSize,
    colSizeScaled,
    colH,
    // Glass behind the columns is not decoration: it ties eighteen separate
    // cantilevers into one braced frame, and it is what the buildings this
    // style is drawn from actually have under them.
    shopfront:
      String(p.shopfront) === 'auto' ? t.shopfront : String(p.shopfront) === 'glazed',
    shopT: Math.max(minWall, inch(6)),
    shopSet: colSize * 0.9,
    mullionPitch: ft(Number(p.mullionPitch)),
    mullionT: Math.max(minWall, ft(0.7)),
    towerH: ft(Number(p.towerHeight)),

    floors,
    levelFt,
    levelH,
    levelZ,
    roofZ,
    heightFt: levelFt.reduce((a, b) => a + b, 0),

    shape,
    wing: ft(wingFt),
    wingFt,
    mirror: shape === 'corner' && String(p.cornerSide) === 'right',
    widthFt,
    depthFt,
    W,
    D,
    innerW,
    innerD,

    extT,
    partT,
    slabT,
    extTScaled,
    partTScaled,
    slabTScaled,
    extTRealIn,
    partTRealIn,
    slabTRealIn,
    tie,
    clearFt: typicalFt - slabTRealIn / 12,

    layout: String(p.layout) as Layout,
    roomCount: Math.max(1, Math.round(Number(p.rooms))),
    minRoom: ft(Number(p.minRoom)),
    minRoomFt: Number(p.minRoom),
    seed: Math.round(Number(p.seed)),
    corridorW: ft(Number(p.corridorWidth)),
    groundOpen: p.groundOpen === true,

    doorW: ft(Number(p.doorWidth)),
    doorH: ft(Number(p.doorHeight)),
    lintel: p.doorLintel === true,
    entrance: p.entrance === true,
    entranceW: ft(Number(p.entranceWidth)),
    entranceH: ft(Number(p.entranceHeight)),

    // 'auto' is the default and defers to the style, the way the pet bowl's
    // motif defers to the species. The dimensions stay the user's either way:
    // the style picks the KIND of opening, never how big it is.
    windows: (String(p.windows) === 'auto' ? t.windows : String(p.windows)) as Windows,
    // Closing an opening is done by NOT cutting it all the way through, not by
    // dropping a pane into the hole afterwards. A pane that exactly fills its
    // opening meets the jambs on four coincident planes, which is the loose
    // shell this project keeps rediscovering; wall left standing cannot come
    // away from the wall it is part of, and it braces the opening as well.
    glazing: p.glazing === true && paneT >= nozzle,
    paneT,
    doorLeaves: p.doorLeaves === true && leafT >= nozzle,
    leafT,
    revealMin,
    leafOneSided: (partT - leafT) / 2 < revealMin,
    winW: ft(Number(p.winWidth)),
    winH: ft(Number(p.winHeight)),
    sill,
    pitch: ft(Number(p.winPitch)),
    pier: Math.max(ft(1.5), extT * 1.5),

    core: p.core === true,
    coreW: ft(Number(p.coreWidth)),
    coreD: ft(Number(p.coreDepth)),
    stairs: String(p.stairs) as Stairs,
    risers,
    riserIn: (typicalFt * 12) / risers,
    riserTargetIn: riserIn,
    treadIn,
    treadMm: inch(treadIn),
    runStraight,
    runSwitchback,

    roof: String(p.roof) as Roof,
    parapetH: ft(Number(p.parapet)),
    // Floored at the nozzle like every wall, and never thicker than the wall it
    // stands on -- a parapet overhanging the room below has nothing under it.
    parapetT: Math.min(extT, Math.max(inch(Number(p.parapetWall)), minWall)),
    parapetTScaled: inch(Number(p.parapetWall)),
    parapetTRealIn: Number(p.parapetWall),
    penthouseH: ft(Number(p.penthouseHeight)),
    pitchDeg: Number(p.roofPitch),
    eaves: ft(Number(p.eaves)),
    roofT: Math.max(slabTScaled, minPlate),
    bulkhead: p.bulkhead === true,
    rooftop: String(p.rooftop) as Rooftop,

    cladding: String(p.cladding) as Cladding,

    split: String(p.split) as Split,
    openFront: p.openFront === true,
    joint,
    // Sized off the slab it keys into, not off the scale: the socket is a
    // blind hole in the slab above and cannot be deeper than the slab is.
    pinR: Math.max(0.5, Math.min(extT * 0.35, 1)),
    pinH: Math.max(0.4, Math.min(slabT - 2 * layer, 1.2)),
    pinClear: PIN_CLEAR,
    tongueW,
    tongueH,
    grooveD,
    base: p.base === true,
    baseT: Number(p.baseThickness),
    baseMargin: Number(p.baseMargin),
    baseText: String(p.baseName).trim(),
    baseTextH: Number(p.baseNameSize),
    baseRelief: Math.max(2 * layer, 0.4),

    nozzle,
    layer,
    bed: BED_MM,
    minWall,
    minPlate,
  };
}

/** Real feet as feet-and-inches, for readouts that have to read like a drawing. */
export function ftIn(feet: number): string {
  const totalIn = Math.round(feet * 12);
  const f = Math.floor(totalIn / 12);
  const i = totalIn - f * 12;
  return i === 0 ? `${f} ft` : `${f} ft ${i} in`;
}

/**
 * Deterministic PRNG -- a bare Lehmer generator.
 *
 * The plan MUST be reproducible: the same seed has to give the same rooms on
 * every build, or dragging an unrelated slider reshuffles the whole floor plan
 * under the user. Math.random() is disqualified for exactly that reason.
 */
export function rng(seed: number): () => number {
  let s = (Math.abs(Math.round(seed)) % 2147483646) + 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Does the stair carry on up to the roof?
 *
 * Only where there is something for it to arrive in: the stair head over the
 * core on a flat roof. That box is what makes a roof a terrace you can walk out
 * onto rather than a lid, so the top storey gets a flight like every other, the
 * deck is opened over the shaft, and the box gets a door. A helipad takes the
 * place of the stair head, a penthouse is set out without regard to the core,
 * and a pitched roof has nowhere to stand -- none of them gets the flight.
 */
export function roofAccess(d: Derived): boolean {
  return d.core && d.bulkhead && (d.roof === 'flat' || d.roof === 'parapet' || d.roof === 'railing') && d.rooftop !== 'helipad';
}
