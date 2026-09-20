import type { Params } from '../../core/params/types';

/**
 * Modular desk organizer: a base plate with a dovetail per bay, and modules
 * that slide onto it from behind.
 *
 * Two ideas hold it together. The first is that the base is DERIVED: you choose
 * the modules, each one is as wide as the thing it has to hold, and the plate
 * comes out exactly wide enough for them. Sizing the plate and then dividing it
 * into equal bays is the other way round, and it gives you a pen cup with 20 mm
 * of air beside it.
 *
 * The second is that every module is the same DEPTH and sits flush front and
 * back. That is the whole minimalist look: one unbroken line along the front,
 * one along the back, and the only vertical breaks are the reveals between
 * modules.
 */

export type Kind = 'stand' | 'cup' | 'tray' | 'pentray' | 'cards' | 'none';

/** Which end of the back wall a fitting takes. */
export type Side = 'left' | 'right';

/** Which of the two phone stands: the plain panel, or the thick wedge. */
export type StandStyle = 'ring' | 'rest';

/**
 * Lying on the desk, or standing on the wall.
 *
 * The same modules either way. What changes is which face the dovetail is on --
 * under the module for a plate, behind it for a panel -- and which axis the
 * bays run along: across for a desk set, up for a wall one.
 */
export type Form = 'desk' | 'wall';

/**
 * What the plate carries in FRONT of the modules, if anything.
 *
 * Two answers to one question, and they are genuinely different objects. A
 * GROOVE is machined into the plate: it holds the one pen you are using and
 * it is not going anywhere. A TRAY is a module -- it dovetails onto the ledge
 * the same way everything else on this plate dovetails onto it, lifts off to
 * be tipped out, and prints as its own part in its own colour.
 */
export type FrontLedge = 'none' | 'groove' | 'tray';

/**
 * What the phone actually stands on, on a leaning stand.
 *
 * A LIP is one ledge right across the front. It is the simpler object and it
 * holds anything you put on it, but it also runs straight across the phone's
 * charging port, so a plugged-in cable has to be threaded through a notch cut
 * under it and then bent back up into the socket.
 *
 * TABS are two short ledges, one at each end, with the middle left open. The
 * phone stands on the ends of its own bottom edge and the port in the centre
 * of that edge has nothing in front of it at all -- the plug goes straight in
 * from the front, which is the whole reason for the shape. Being separate from
 * the profile they can also be put anywhere UP the face, which is what sets
 * how high the phone hangs.
 */
export type LipStyle = 'full' | 'tabs';

/** One module's place on the plate, or up the panel. */
export interface Bay {
  readonly kind: Kind;
  readonly w: number;
  /** Centre in X, in the assembled frame. */
  readonly cx: number;
  /** Height of the module's floor. The plate's top face, or a shelf's place. */
  readonly cz: number;
  /** How tall the module itself is, above `cz`. */
  readonly h: number;
  /**
   * Bare plate round this module, on all four sides.
   *
   * Per module rather than one number for the set, because the modules are not
   * one object: a pen cup wants room round it and a card rack next to it does
   * not. The bay grows by it left and right, so a neighbour is pushed away;
   * front and back the module's BODY is inset inside a plate that stays the
   * same depth, because every module still has to reach the back edge to slide
   * onto its dovetail. The foot keeps its full length and stays hidden in the
   * slot -- it is the body you see.
   */
  readonly margin: number;
}

/** The depth a module's body occupies, once its margin is taken off. */
export function bodyD(d: Derived, bay: Bay): number {
  return d.D - 2 * bay.margin;
}

/** Where that body's FRONT face sits, in the assembled frame. */
export function bodyY0(d: Derived, bay: Bay): number {
  return -d.D / 2 + bay.margin;
}

/**
 * How deep the shallow tray a lift-off module sits in is.
 *
 * On a desk there are no dovetails any more: everything but the phone stand is
 * part of the plate, and the stand simply drops into a tray sunk into it. The
 * tray is as deep as it can be and still leave a real plate under it, capped at
 * the module's own plate thickness so the stand comes up flush with the plate
 * around it rather than standing on top of it.
 */
export function seatDepth(d: Derived): number {
  return Math.max(1.2, Math.min(d.plateT, d.baseT - 2 * d.minPlate));
}

/** And how wide it is, once its margin is taken off its bay. */
export function bodyW(bay: Bay): number {
  return bay.w - 2 * bay.margin;
}

export interface Derived {
  // ------------------------------------------------------------- the plate
  /** Derived from the modules, never typed. */
  readonly W: number;
  readonly D: number;
  readonly form: Form;
  readonly baseT: number;
  /** Wall form only: the back panel's thickness and how tall it stands. */
  readonly panelT: number;
  readonly panelH: number;
  readonly margin: number;
  readonly gap: number;
  /**
   * The pen rail: a channel sunk into the top of the plate IN FRONT of the
   * modules, for the pen you are using right now.
   *
   * It is the one thing here that makes the plate deeper than a module. Every
   * module is exactly `D` deep and sits flush front and back, so there is no
   * front margin to sink a channel into -- the plate has to grow forward to
   * carry one. `plateD` is what the plate is, `D` is still
   * what every module is, and `plateY` is where the plate sits now that the
   * two are no longer the same rectangle.
   */
  readonly frontLedge: FrontLedge;
  /** Front-to-back size of the ledge feature, and of the ledge it stands on. */
  readonly frontD: number;
  /** Groove only: how far it is sunk into the plate. */
  readonly grooveD: number;
  /** Tray only: how tall its walls are. */
  readonly frontTrayH: number;
  /** Partitions across the front tray's length. */
  readonly frontTrayDiv: number;
  /** Centreline of whatever is on the front ledge. */
  readonly frontY: number;
  /**
   * The back wall, and where it stands.
   *
   * The other thing that makes the plate deeper than a module: the modules end
   * flush at the back, so an upstand behind them needs a ledge grown for it.
   * `backY` is the wall's centreline in the assembled frame.
   */
  readonly backWall: number;
  readonly backWallT: number;
  readonly backY: number;
  readonly keyHooks: number;
  readonly hookLen: number;
  readonly hookRise: number;
  /** Which end of the free wall the hooks group against. */
  readonly hookSide: Side;
  readonly watchPost: boolean;
  /** The watch bar: along the wall, out from it, and thick through. */
  readonly watchBarW: number;
  readonly watchBarD: number;
  readonly watchBarT: number;
  readonly coinShelf: number;
  readonly coinShelfD: number;
  /** And which end the change shelf takes. */
  readonly shelfSide: Side;
  readonly plateD: number;
  readonly plateY: number;
  readonly corner: number;
  readonly chamfer: number;
  readonly wall: number;
  readonly bays: readonly Bay[];

  // -------------------------------------------------------------- the dock
  /** Dovetail: width at the mouth, how deep, and how far it undercuts. */
  readonly dtW: number;
  readonly dtH: number;
  readonly dtAngle: number;
  /** Clearance on every sliding face. One number for the whole fit. */
  readonly clear: number;
  /** How far short of the front edge the slot stops, as a positive stop. */
  readonly dtStop: number;

  // ------------------------------------------------------------- the stand
  /**
   * Two ways to hold a phone up, and they are not variants of one shape.
   *
   * A CRADLE is a low block with a slot through it: the phone drops in and
   * stands in the slot, and the charging lead comes up the middle of the block
   * into the port. Nothing leans on anything, so it can be 30 mm tall instead
   * of 100, and the phone is charging the moment it is put down.
   *
   * A REST is the tall leaning back rest: a lip to stand on, a face to lean
   * against, and room on that face for a wireless puck. It is the only one of
   * the two with anywhere to put a MagSafe charger.
   */
  readonly phoneW: number;
  readonly phoneT: number;
  readonly lean: number;
  readonly fluted: boolean;
  readonly fluteW: number;
  readonly fluteD: number;
  readonly standH: number;
  readonly standStyle: StandStyle;
  readonly plateT: number;
  readonly lipH: number;
  readonly lipT: number;
  readonly lipStyle: LipStyle;
  /** Tabs only: how wide each one is, and how high the phone stands on them. */
  readonly tabW: number;
  readonly ledgeZ: number;
  readonly restT: number;
  readonly standW: number;
  /** How hard every outside edge of the stand is rounded. See `standSoftR`. */
  readonly standSoft: number;
  /** Wall form: the upstand at the stand's back that the dovetail lives in. */
  readonly standBackH: number;

  /**
   * The moulding on the end of the charger's own lead.
   *
   * Not a cradle's plug -- that went with the cradle. This is what has to be
   * threaded down the bore behind the puck pocket and up through the hole in
   * the plate, and every closed aperture on that route is sized from it.
   */
  readonly plugW: number;
  readonly plugT: number;

  // --------------------------------------------------------- the charging
  readonly wireless: boolean;
  readonly puckD: number;
  readonly puckT: number;
  /** Height of the puck's centre up the face, measured along the lean. */
  readonly puckH: number;
  /** The ring of plate left behind the puck. See `puckShoulder`. */
  readonly puckShoulder: number;
  readonly cableW: number;
  readonly cableD: number;
  readonly passthrough: boolean;
  /**
   * The clip on the BACK of a ring panel, and how far up the panel it sits.
   *
   * A ring hands its lead out of a slot in its own face and lets it hang down
   * the back, so unlike the rest it never routes anything through the plate.
   * The clip is what turns "hangs down the back" into a route.
   */
  readonly cableClip: boolean;
  readonly clipZ: number;

  // ------------------------------------------------------- other modules
  readonly cupD: number;
  readonly cupH: number;
  readonly trayW: number;
  readonly trayH: number;
  /** Partitions in the open tray: across the width, and front to back. */
  readonly trayDivX: number;
  readonly trayDivY: number;
  /**
   * The shallow pen tray, which is not a shorter open tray.
   *
   * A pen lies flat ACROSS it, so its width is set by pen length rather than by
   * what it has to hold upright, and it is the one module whose size is driven
   * by the long axis of the thing in it.
   */
  readonly penW: number;
  readonly penH: number;
  readonly penLanes: number;
  readonly cardsW: number;
  readonly cardsH: number;
  readonly cardSlots: number;
  readonly cardGap: number;

  // ------------------------------------------------------------- printer
  readonly nozzle: number;
  readonly layer: number;
  readonly bed: readonly [number, number];
  readonly minWall: number;
  readonly minPlate: number;
}

/**
 * The shortest ring panel that keeps the charger's window inside its arc.
 *
 * A ring's top is not a rectangle, it is a semicircle, so the panel is
 * narrower the higher you go. That makes the height and the charger one
 * question rather than two: a window that clears the sides at its own centre
 * can still come out through the shoulder, and when it does the panel is not
 * a ring with a hole in it but a fork with two horns.
 *
 * The window is a circle bored along the panel's own normal, so in the FRONT
 * elevation -- which is where the arc lives -- it is an ellipse: full width
 * across, and squashed by the cosine of the lean going up. Every point of it
 * has to stay `keep` inside the arc, and for each one that is a lower bound
 * on the height, because raising the panel lifts the arc's centre away from
 * a window that stays where the phone's magnets are. The largest of those
 * bounds is the answer, and in practice it is nearly always the ellipse's own
 * apex -- `apex + keep`, exactly.
 *
 * There are two answers here, and conflating them is how the first version of
 * this got the panel in the picture.
 *
 * **What it NEEDS** is that no point of the ellipse comes within `minKeep` of
 * the arc, measured radially from the arc's own centre. That is the check
 * that keeps the part a ring instead of a fork.
 *
 * **What it LOOKS like** is a different question, and a bare structural
 * shoulder answers it badly: two and a half millimetres of plate over the top
 * of the window, with a fat even margin down both sides of it, reads as a
 * circle that only just got away with it. So the shoulder is asked to match
 * that side margin -- `R - a`, the plain plate beside the window at its
 * widest, which is a number the panel already has. The window then sits in the
 * same amount of panel whichever way you look at it.
 *
 * That second one is a bound on the APEX and nowhere else. Applied round the
 * whole ellipse it is not a margin at all: the sides of the window are down in
 * the straight part of the panel, where the plate beside them is exactly
 * `R - a` by definition, and asking for `R - a` of ARC clearance there as well
 * is asking the panel to be tall enough that its arc has left them behind.
 *
 * Infinity when the panel is simply too narrow for the puck at any height.
 * That is a different fault with its own error, and the caller ignores this.
 */
export function ringMinH(o: {
  panelW: number;
  plateT: number;
  puckH: number;
  puckD: number;
  clear: number;
  lean: number;
  minKeep: number;
}): number {
  const R = o.panelW / 2;
  const a = o.puckD / 2 + o.clear; // the window across the elevation
  const b = a * Math.cos((o.lean * Math.PI) / 180); // ...and up it
  const inner = R - o.minKeep;
  if (inner <= a) return Number.POSITIVE_INFINITY;

  let need = 0;
  for (let i = 0; i <= 64; i++) {
    // Half the ellipse; it is symmetric about the panel's centreline.
    const th = (i / 64) * Math.PI;
    const x = a * Math.sin(th);
    const z = o.plateT + o.puckH + b * Math.cos(th);
    need = Math.max(need, z + R - Math.sqrt(inner * inner - x * x));
  }
  // And the shoulder that makes it look like it was meant. Capped, so that a
  // phone twice as wide as its charger asks for a tall panel and not an
  // absurd one.
  const look = Math.min(18, Math.max(o.minKeep, R - a));
  return Math.max(need, o.plateT + o.puckH + b + look);
}

/** Bare plate round a module of this kind, on all four sides. */
function moduleMargin(kind: Kind, p: Params): number {
  switch (kind) {
    case 'stand':
      return Number(p.standMargin);
    case 'cup':
      return Number(p.cupMargin);
    case 'tray':
      return Number(p.trayMargin);
    case 'pentray':
      return Number(p.penTrayMargin);
    case 'cards':
      return Number(p.cardsMargin);
    default:
      return 0;
  }
}

/** What each kind of module needs across the plate, its own margin included. */
function bayWidth(kind: Kind, p: Params, wall: number): number {
  return contentWidth(kind, p, wall) + 2 * moduleMargin(kind, p);
}

/** What the thing it holds needs, before any margin round it. */
function contentWidth(kind: Kind, p: Params, wall: number): number {
  switch (kind) {
    case 'stand':
      return Number(p.phoneWidth) + 2 * wall;
    case 'cup':
      return Number(p.cupDiameter);
    case 'tray':
      return Number(p.trayWidth);
    case 'pentray':
      return Number(p.penTrayWidth);
    case 'cards':
      return Number(p.cardsWidth);
    default:
      return 0;
  }
}

/**
 * And how tall each one stands.
 *
 * Here rather than with the module that builds it, because on a wall the bays
 * are laid out UP the panel and the layout has to know a module's height before
 * anything has been built.
 */
export function bayHeight(kind: Kind, p: Params, plateT: number, standH?: number): number {
  switch (kind) {
    case 'stand':
      // A slab standing off a plate: the plate counts towards the height.
      // `standH` rather than the raw parameter, because a ring's height has a
      // floor under it that the slider does not know about -- see `ringMinH`.
      return (standH ?? Number(p.standHeight)) + plateT;
    case 'cup':
      return Number(p.cupHeight);
    case 'tray':
      return Number(p.trayHeight);
    case 'pentray':
      return Number(p.penTrayHeight);
    case 'cards':
      return Number(p.cardsHeight);
    default:
      return 0;
  }
}

export function derive(p: Params): Derived {
  const nozzle = Number(p.nozzle);
  const layer = Number(p.layer);
  const minWall = Math.max(2 * nozzle, 0.8);
  const minPlate = Math.max(3 * layer, 0.6);

  const wall = Math.max(Number(p.wall), minWall);

  /**
   * The thinnest any limb of the stand may be if the softening is to survive.
   *
   * The rounding is a 3D opening, and an opening erodes by r before it dilates:
   * a limb thinner than 2r is deleted and never comes back. That was handled by
   * throttling the softening down to whatever the thinnest limb already allowed
   * -- which on the leaning stands is the 4 mm lip, so the control capped at
   * 1.7 mm. Its default is 3 and its maximum is 8, so it was saturated before
   * it was touched and dragging it did nothing whatsoever.
   *
   * Raised to carry it instead, which is what this generator already does for
   * the rest when a puck and a cable groove both have to fit in it. The limbs
   * grow with the softening and the readout says which ones moved.
   */
  const softLimb = Number(p.standSoft) > 0.05 ? 2 * Number(p.standSoft) + 0.6 : 0;
  const gap = Number(p.gap);
  const margin = Number(p.margin);
  const D = Number(p.depth);
  // The rail grows the plate forward by its own width plus a rim either side.
  // On a wall there is no plate to grow and nothing would stay in the channel.
  const railRim = Math.max(Number(p.wall), Number(p.corner));
  // Nothing stays in a channel cut into a vertical panel, and a tray hung off
  // the front of one is a shelf, which is what the bays already are.
  const frontLedge = (String(p.form) === 'wall' ? 'none' : String(p.frontLedge)) as FrontLedge;
  const frontD = Number(p.frontDepth);
  // And the same again at the back, for the wall. A wall form is already a
  // back panel, so there is nothing to add one to.
  const backWall = String(p.form) === 'wall' ? 0 : Number(p.backWall);
  const backWallT = Number(p.backWallT);
  // The ledge has to carry the DOVETAIL, not just the slab standing on it.
  // A 4 mm wall wants 12 mm of ledge; the joint under it is 17.7 mm across the
  // slide once the undercut is counted, and sized for the slab the tongue ran
  // forward out of its own ledge and straight through the feet of the modules
  // in front -- two parts in the same 83 mm3 of plate.
  const dtFull =
    Number(p.dovetailWidth) +
    2 * Number(p.dovetailHeight) * Math.tan((Number(p.dovetailAngle) * Math.PI) / 180);
  const backD = backWall > 0 ? Math.max(backWallT + 2 * railRim, dtFull + 4 * minPlate) : 0;
  // A groove wants a rim of plate round it. A tray sits flush the way every
  // module does, but the ledge under it still has to carry a dovetail -- the
  // joint is 17.7 mm across the slide at stock settings, however shallow the
  // tray on top of it is.
  const ledgeD =
    frontLedge === 'groove'
      ? frontD + 2 * railRim
      : frontLedge === 'tray'
        ? Math.max(frontD, dtFull + 4 * minPlate)
        : 0;

  const kinds = [p.slot1, p.slot2, p.slot3, p.slot4, p.slot5]
    .map((v) => String(v) as Kind)
    .filter((k) => k !== 'none');

  const form = String(p.form) as Form;
  const baseT = Math.max(Number(p.baseThickness), minPlate);
  const plateT = Math.max(Number(p.baseThickness) * 0.75, minPlate * 2, softLimb);
  const panelT = Math.max(Number(p.baseThickness), Number(p.dovetailHeight) + 2 * minPlate);

  const widths = kinds.map((k) => bayWidth(k, p, wall));

  // The stand's height, before the bays are laid out with it -- on a wall
  // they stack, so a panel that grew after the layout would overlap the
  // module above it.
  //
  // A RING has a floor under that slider, and it is not a preference. The
  // window has to stay inside an arc, and the arc is the height; asked for a
  // panel too short to hold the charger the answer is not a fork with two
  // horns where the window came out through the shoulder, it is a taller
  // panel and a line in the readouts saying so.
  const askedH = Number(p.standHeight);
  const floorH =
    String(p.standStyle) === 'ring' && p.wireless === true
      ? ringMinH({
          panelW: contentWidth('stand', p, wall) - 2 * Number(p.clearance),
          plateT,
          puckH: Number(p.puckHeight),
          puckD: Number(p.puckDiameter),
          clear: Number(p.clearance),
          lean: Number(p.standAngle),
          minKeep: Math.max(2.5, 2 * minPlate),
        })
      : 0;
  const standH = Number.isFinite(floorH) ? Math.max(askedH, floorH) : askedH;

  const heights = kinds.map((k) => bayHeight(k, p, plateT, standH));

  const bays: Bay[] = [];
  let W: number;
  let panelH = 0;

  if (form === 'wall') {
    // Up the panel, top module first, each still exactly as wide as the thing
    // it holds and centred. The panel is as wide as the widest of them --
    // sizing it first and then centring narrow modules on a wide board is the
    // other way round, and gives a card rack adrift in the middle of a plank.
    W = Math.max(...widths, 0) + 2 * margin;
    panelH = heights.reduce((a, b) => a + b, 0) + Math.max(0, kinds.length - 1) * gap + 2 * margin;
    let z = panelH - margin;
    for (const [i, kind] of kinds.entries()) {
      const h = heights[i]!;
      z -= h;
      bays.push({ kind, w: widths[i]!, cx: 0, cz: z, h, margin: moduleMargin(kind, p) });
      z -= gap;
    }
  } else {
    // Left to right from the left margin, each at its own width.
    const span = widths.reduce((a, b) => a + b, 0) + Math.max(0, kinds.length - 1) * gap;
    W = span + 2 * margin;
    let x = -W / 2 + margin;
    for (const [i, kind] of kinds.entries()) {
      const w = widths[i]!;
      bays.push({ kind, w, cx: x + w / 2, cz: baseT, h: heights[i]!, margin: moduleMargin(kind, p) });
      x += w + gap;
    }
  }

  const lean = Number(p.standAngle);
  const puckT = Number(p.puckThickness);
  const wireless = p.wireless === true;

  return {
    W,
    D,
    form,
    baseT,
    panelT,
    panelH,
    margin,
    gap,
    frontLedge,
    frontD: frontLedge === 'tray' ? ledgeD : frontD,
    grooveD: Number(p.grooveDepth),
    frontTrayH: Number(p.frontTrayHeight),
    frontTrayDiv: Math.round(Number(p.frontTrayDiv)),
    frontY: -D / 2 - ledgeD / 2,
    plateD: D + ledgeD + backD,
    plateY: (backD - ledgeD) / 2,
    backWall,
    backWallT,
    // Centred in the LEDGE, so the dovetail under it is centred there too and
    // stays clear of the modules that end flush at D / 2.
    backY: D / 2 + backD / 2,
    keyHooks: Math.round(Number(p.keyHooks)),
    hookLen: Number(p.hookLen),
    hookRise: Number(p.hookRise),
    hookSide: String(p.hookSide) as Side,
    watchPost: p.watchPost === true,
    watchBarW: Number(p.watchBarW),
    watchBarD: Number(p.watchBarD),
    watchBarT: Number(p.watchBarT),
    coinShelf: Number(p.coinShelf),
    coinShelfD: Number(p.coinShelfDepth),
    shelfSide: String(p.shelfSide) as Side,
    corner: Number(p.corner),
    chamfer: Number(p.chamfer),
    wall,
    bays,

    dtW: Number(p.dovetailWidth),
    dtH: Number(p.dovetailHeight),
    dtAngle: Number(p.dovetailAngle),
    clear: Number(p.clearance),
    dtStop: Number(p.dovetailStop),

    phoneW: Number(p.phoneWidth),
    phoneT: Number(p.phoneThickness),
    lean,
    fluted: p.fluted === true,
    fluteW: Number(p.fluteWidth),
    // Never more than a third of the wall: the flutes are a finish, and a
    // finish that eats the wall is a hole with a pattern round it.
    fluteD: Math.min(Number(p.fluteDepth), wall / 3),
    standH,
    standStyle: String(p.standStyle) as StandStyle,
    plateT,
    lipH: Number(p.lipHeight),
    lipStyle: String(p.lipStyle) as LipStyle,
    tabW: Number(p.lipTabW),
    ledgeZ: Number(p.ledgeHeight),
    lipT: Math.max(Number(p.lipThickness), minWall, softLimb),
    // Thick enough to bury the puck from the front AND take the cable groove
    // down the back, with a plate left between them. Those are two bites out of
    // opposite faces of the same rest, so it is the sum that has to fit, not
    // either one. With the charger off it is just a slab and there is no reason
    // for it to be fat.
    restT: wireless
      ? Math.max(
          Number(p.restThickness),
          puckT + Math.max(2 * minPlate, 2),
          Number(p.cableDepth) + 2 * minPlate,
          softLimb,
        )
      : Math.max(Number(p.restThickness), minWall * 2, softLimb),
    standW: Number(p.phoneWidth) + 2 * wall,
    standSoft: Number(p.standSoft),
    standBackH: form === 'wall' ? Math.max(Number(p.dovetailWidth) + 4 * wall, 24) : 0,

    plugW: Number(p.plugWidth),
    plugT: Number(p.plugThickness),

    wireless,
    puckD: Number(p.puckDiameter),
    puckT,
    puckH: Number(p.puckHeight),
    puckShoulder: Number(p.puckShoulder),
    cableW: Number(p.cableWidth),
    cableD: Number(p.cableDepth),
    passthrough: p.passthrough === true,
    cableClip: p.cableClip === true,
    clipZ: Number(p.clipHeight),
    cupD: Number(p.cupDiameter),
    cupH: Number(p.cupHeight),
    trayW: Number(p.trayWidth),
    trayH: Number(p.trayHeight),
    trayDivX: Math.round(Number(p.trayDivX)),
    trayDivY: Math.round(Number(p.trayDivY)),
    penW: Number(p.penTrayWidth),
    penH: Number(p.penTrayHeight),
    penLanes: Math.round(Number(p.penTrayLanes)),
    cardsW: Number(p.cardsWidth),
    cardsH: Number(p.cardsHeight),
    cardSlots: Math.round(Number(p.cardSlots)),
    cardGap: Number(p.cardGap),

    nozzle,
    layer,
    bed: [Number(p.bedX), Number(p.bedY)] as const,
    minWall,
    minPlate,
  };
}

/**
 * The softening the stand can actually carry.
 *
 * The rounding is a 3D opening (`softPrism`), and an opening erodes by r before
 * it dilates: anything thinner than 2r is deleted and never comes back. The
 * limbs are raised to carry whatever is asked for rather than the ask being
 * throttled to fit them -- see `softLimb` -- so this is the backstop, not the
 * rule. Clamped here rather than at the call site so the readout can say what
 * it came out at.
 */
export function standSoftR(d: Derived): number {
  const thin = Math.min(d.lipT, d.restT, d.plateT);
  return Math.max(0, Math.min(d.standSoft, thin / 2 - 0.3));
}

/** Every number in the cable clip, or null when the lean will not carry one. */
export interface ClipSpec {
  /** Across the panel, out from its back face, and the mouth between the lips. */
  readonly w: number;
  readonly t: number;
  readonly mouth: number;
  readonly wall: number;
  /** How far the clip stands off the face where the channel is. */
  readonly out: number;
  /** Its full height, the ramp included, and how much of that is full section. */
  readonly h: number;
  readonly grip: number;
  /** How far the whole bracket reaches back from the face at its foot. */
  readonly reach: number;
}

/**
 * The two radii of a ring's charger window: the seat, and the hole behind it.
 *
 * Shared, because three things have to agree about them -- the seat cut from
 * the front, the window bored through the back, and the lead slot, which has
 * to bite into the WINDOW and not merely into the seat. Worked out separately,
 * a wider shoulder moved the window out from under the slot, and the slot
 * became a second hole through the panel with the lead's way out inside it.
 *
 * The shoulder is a SETTING rather than a structural number. A millimetre of
 * it holds the puck perfectly well and looks like a mistake: from the front
 * the shoulder IS the ring, the only plate between the window and the seat's
 * edge, and at 1.2 mm on a 56 mm charger it read as a hairline. So it is
 * floored at what holds, and capped by what the window is FOR -- pushing the
 * puck back out with a thumb. Past that it stops being a rim round a window
 * and becomes a dish with a hole in it.
 */
export function puckRing(d: Derived): { outer: number; inner: number; shoulder: number } {
  const outer = d.puckD / 2 + d.clear;
  const thumb = Math.max(6, outer * 0.35);
  const shoulder = d.wireless
    ? Math.min(Math.max(d.puckShoulder, 1.2, 2 * d.minPlate), outer - thumb)
    : 0;
  return { outer, inner: Math.max(2, outer - shoulder), shoulder };
}

/**
 * The clip on the back of a ring panel -- shared, because whether it can be
 * built at all is a question the validator has to answer in words before the
 * part answers it in silence.
 *
 * The whole thing turns on one sum. The clip stands upright, because a cable
 * hanging off the back hangs straight down; the panel leans away from it as it
 * rises; and the clip's underside has to be a 45-degree ramp off that face,
 * because there is nothing under it. So every millimetre of height buys a
 * millimetre of ramp and hands `tan(lean)` of it straight back to the panel --
 *
 *     h * (1 - tan) = out + grip
 *
 * -- which is fine at fifteen degrees and runs away at forty-five, where the
 * face and the ramp are parallel and no finite bracket is ever supported. So
 * the reach is capped, and past about thirty-two degrees of lean there is no
 * height left that grips anything. That is a real limit of leaning a panel
 * back that far, not an arbitrary one, and it is reported rather than fudged.
 */
export function clipSpec(d: Derived): ClipSpec | null {
  if (!d.cableClip || !d.wireless) return null;
  const wall = Math.max(d.minPlate, 1.2);
  const w = d.cableW + 2 * d.clear;
  const t = d.cableD + 2 * d.clear;
  // Narrower than the lead, or it is a hole and not a clip. Never so narrow
  // the lips meet, and never a lip so long it cannot flex out of the way.
  const mouth = Math.min(w - 0.8, Math.max(2.5, w - 2 * Math.min(1.5, wall)));
  const out = t + wall;
  const tan = Math.tan((d.lean * Math.PI) / 180);
  const h = Math.min(
    (out + 5) / Math.max(0.05, 1 - tan),
    tan > 1e-3 ? 14 / tan : Number.POSITIVE_INFINITY,
  );
  const grip = h * (1 - tan) - out;
  if (grip < 3) return null;
  return { w, t, mouth, wall, out, h, grip, reach: h * tan + out };
}

/**
 * How high the phone's BOTTOM EDGE sits, above the stand's own plate.
 *
 * Zero on a lip: the phone stands in the well, on the plate. On tabs it is
 * wherever the tabs were put. Everything about the wireless charger is really
 * a question about this number -- the puck has to meet the magnet ring, and
 * the ring's height is measured from the bottom of the phone, so the two only
 * line up through wherever the bottom of the phone actually is.
 */
export function phoneFootZ(d: Derived): number {
  return d.lipStyle === 'tabs' ? d.ledgeZ : 0;
}

/** The bay a phone stand is sitting in, if any. */
export function standBay(d: Derived): Bay | undefined {
  return d.bays.find((b) => b.kind === 'stand');
}

/** Depth of the stand's phone-side face, `h` above its plate. */
export function faceX(d: Derived, h: number): number {
  return d.lipT + d.phoneT + 2 * d.clear + h * Math.tan((d.lean * Math.PI) / 180);
}

/**
 * Height of the channel that carries the cable back to the panel, wall form.
 *
 * Shared, because it is a groove in the underside of one part and a hole
 * through another, and the two only line up if they are the same number.
 */
export function cableGrooveH(d: Derived): number {
  return Math.min(d.cableD, d.plateT - d.minPlate);
}

/** Depth of the BACK of the stand's rest, `h` above its plate. */
export function backX(d: Derived, h: number): number {
  return faceX(d, h) + d.restT;
}

/**
 * Y where the charger's cable comes down through the plate.
 *
 * Shared, because the hole up through the plate and the route down through the
 * stand are two halves of one run through two different parts. Worked out
 * separately, they came out 80 mm apart -- the stand dropping its cable at the
 * front and the plate offering a hole at the back.
 *
 * BEHIND the rest, not in front of it. The cable used to be grooved down the
 * leaning face, which meant it ran between the phone and the thing holding the
 * phone: a lump under the screen, and a cable pinched every time the phone went
 * on. It goes through the back of the rest now and never appears on the face.
 */
/** The stand's own margin, which its charging holes have to move with. */
function standMarginOf(d: Derived): number {
  return standBay(d)?.margin ?? 0;
}

export function cableDropY(d: Derived): number {
  return backX(d, 0) + d.cableD - d.D / 2 + standMarginOf(d);
}

/**
 * The hole a LEAD has to be threaded through -- which is the plug on the end of
 * it, not the cable.
 *
 * Every closed aperture on every charging route used to be sized from the cable
 * channel, and a cable channel is 9 x 5. The thing you actually have to push
 * through it is a USB-C moulding at 12 x 7, and it went through none of them:
 * not the hole up through the plate, not the bore behind the puck pocket. The
 * routes were all correct and all impossible to thread.
 *
 * Open channels are exempt and stay cable-sized on purpose -- a groove down the
 * back of the rest or along the underside of the plate is one the cable is LAID
 * into from the side, so only the cable's own girth has to fit. It is the holes
 * with material all the way round that have to swallow the plug.
 */
export function leadBore(d: Derived): { readonly w: number; readonly t: number } {
  return { w: d.plugW + 2 * d.clear, t: d.plugT + 2 * d.clear };
}



/**
 * And where a plug-in cable surfaces instead: under the lip, at the front.
 *
 * A different hole for a different route. The wireless puck is fed from behind;
 * a plug on the end of a lead has to come up in front of the phone's bottom
 * edge, which is the one place the drop behind the rest cannot reach.
 */
export function passDropY(d: Derived): number {
  return faceX(d, 0) - d.D / 2 + standMarginOf(d) - d.cableD;
}
