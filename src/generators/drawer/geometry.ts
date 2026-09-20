import type { Params } from '../../core/params/types';

/**
 * Under-desk drawer: a carcass that screws or tapes to the underside of a
 * desktop, and one or two trays that hang in it on printed slides.
 *
 * Everything here is in millimetres already -- unlike the building generator
 * there is no scale to divide by, and the numbers you type are the numbers you
 * print. What this file does instead is resolve the CLEARANCES, because a
 * drawer is two printed parts that have to slide on each other, and every
 * dimension of one is the dimension of the other plus or minus a running fit.
 *
 * The latch is a push-push heart cam: push to open, push to close. See cam.ts
 * for the groove and parts/deck.ts for the printed leaf spring that rides it.
 *
 * The whole latch lives in a shallow BAY UNDER THE TRAY -- the cam groove cut
 * up into the tray's underside, the sprung follower lying flat below it with
 * its pin pointing up, and the ejector in a tunnel bored through the tray's
 * floor. It used to sit in a bay BEHIND the tray, and that cost the drawer
 * forty millimetres of depth it could not spare: the follower beam is as long
 * as its own strain budget says it must be, and behind the tray that length
 * came straight off the back of the box. Underneath, it costs a few
 * millimetres of HEIGHT instead, and the tray runs the full depth of the
 * carcass.
 *
 * Only ONE drawer is ever modelled. A carcass with two drawers in it is the
 * same tray twice at two heights, so every z below is TIER-LOCAL -- measured
 * from the floor of one drawer's opening -- and `tiers` says where those floors
 * are. Working the second tray out separately is how the two stop agreeing.
 */

export type Mount = 'tape' | 'screws';
export type Front = 'scoop' | 'bar' | 'flush';
export type Eject = 'spring' | 'band' | 'coil';
export type Follower = 'printed' | 'wire';

/**
 * How much strain the outside fibre of the follower beam is allowed at full
 * throw.
 *
 * PETG yields somewhere past 4%, and a printed part is not its datasheet: this
 * is roughly half of that, which is what turns "it flexes" into "it still
 * flexes after a thousand presses". It is the number the required beam length
 * falls out of, and the only reason a 25 mm beam is 25 mm.
 */
const STRAIN_MAX = 0.018;

/** How far apart the elastic band's two posts stand, across the carcass. */
const BAND_SPAN = 20;

/** Where one drawer sits in the carcass. */
export interface Tier {
  /** 0 is the top drawer. */
  readonly index: number;
  readonly name: string;
  /** Absolute z of the floor of this drawer's opening. */
  readonly z0: number;
}

export interface Derived {
  // ------------------------------------------------------------- the carcass
  /** Outer size of the carcass, EXCLUDING the top plate. */
  readonly W: number;
  readonly D: number;
  /** Total drop below the desk: one opening per drawer, stacked. */
  readonly H: number;
  /** ONE drawer's opening height. This is what the user types. */
  readonly openH: number;
  readonly tiers: readonly Tier[];
  readonly wall: number;
  /**
   * The SIDE walls, which are never thinner than the deepest groove cut into
   * them plus enough material to still be a wall behind it.
   *
   * Not the same number as `wall`, and that is the point: the grooves are cut
   * into the side from the inside, so a 2.5 mm tongue at 0.3 mm clearance eats
   * 2.8 mm of a 2.4 mm wall and opens a slot straight out through the side of
   * the carcass. It measured 122 mm across a 120 mm part before this existed.
   * The latch deck's rails are cut into the same wall and get the same veto.
   */
  readonly sideT: number;
  readonly topT: number;
  readonly mount: Mount;
  readonly screwD: number;
  readonly screwHeadD: number;
  readonly screwInset: number;

  // ---------------------------------------------------------------- the tray
  readonly trayW: number;
  readonly trayD: number;
  /** The tray's own height: what is left of the opening above the latch bay. */
  readonly trayH: number;
  /** Tier-local z of the tray's underside, which is the bay's ceiling. */
  readonly trayZ: number;
  readonly trayWall: number;
  readonly trayFloor: number;
  /** Running clearance between any two surfaces that slide on each other. */
  readonly clear: number;
  /**
   * Gap left between the tray's back face and the carcass back wall when shut.
   *
   * The overtravel plus a clearance. A push latch is pressed IN to release, and
   * a tray already against the back wall has nowhere to put that press.
   */
  readonly backGap: number;

  // -------------------------------------------------------------- the slides
  /** Tongue on the tray side; groove in the carcass side. */
  readonly slideT: number;
  readonly slideP: number;
  /** TRAY-LOCAL height of the tongue's centreline above the tray's underside. */
  readonly slideZ: number;
  /** How far the tray can travel before the stop catches it. */
  readonly travel: number;

  // --------------------------------------------------------------- the front
  readonly front: Front;
  readonly frontT: number;
  readonly frontOver: number;
  /** Gap left between one drawer front and the next in a stack. */
  readonly frontReveal: number;
  readonly pullH: number;
  readonly pullD: number;

  // ----------------------------------------------------------- compartments
  readonly divX: number;
  readonly divY: number;
  readonly divT: number;
  readonly divH: number;

  // ----------------------------------------------------------------- latch
  readonly latch: boolean;
  /** Printed leaf spring, or a bent paperclip. */
  readonly follower: Follower;
  readonly wireD: number;
  /** Diameter of whatever rides the groove -- the wire, or the printed pin. */
  readonly pinD: number;
  /** How far the spring throws the tray out when the latch lets go. */
  readonly pop: number;
  /** Extra push past the latched point, which is what frees the pin. */
  readonly over: number;
  /** Straight run that funnels the pin back into the cam on the way in. */
  readonly lead: number;
  /** Groove width: the pin plus a sliding fit. */
  readonly grooveW: number;
  /** Half-width of the cam, across the travel. */
  readonly camV: number;
  /** Deepest floor of the groove, and the height of each one-way step. */
  readonly camDeep: number;
  readonly camStep: number;
  /**
   * The pad the cam is cut into, and how wide it is.
   *
   * The groove is cut UP into the tray's underside, and a 2 mm floor has no
   * 2.2 mm groove in it -- so the floor is thickened over the cam's footprint,
   * standing as a low island inside the tray. That island is all that is left
   * of what used to be a separate cam plate hanging off the tray's back.
   */
  readonly camPadT: number;
  readonly camPadW: number;
  /** Sideways offset of the entry, which is what sends the pin round the left. */
  readonly camBias: number;
  /** Width of the plain relief the pin runs in once it has left the cam. */
  readonly reliefW: number;
  /**
   * How far forward of the carcass back wall the follower's pin sits.
   *
   * The length of the paperclip's arm, and the free length of the printed beam
   * plus the dead stubs at each of its ends. Both are rooted on the back wall
   * and both end at the pin, so there is only one answer. Under the tray this
   * number is FREE -- it costs no depth at all -- which is why the beam can
   * simply be as long as its strain budget asks for and no haggling.
   */
  readonly reach: number;
  /** How far the face plate sinks into the tray, so the two make one body. */
  readonly frontBite: number;
  /** Tier-local height of the wire's pivot in its boss. */
  readonly wireZ: number;
  /** How proud the travel stop stands in the slide groove. */
  readonly stopH: number;
  /** How far the face plate stands proud of the carcass when latched. */
  readonly standoff: number;

  // ------------------------------------------------------- the printed deck
  /** Height of the bay under the tray that the whole latch lives in. */
  readonly bayH: number;
  /** Plate thickness. This is the follower's DOWNWARD stiffness. */
  readonly deckT: number;
  /** Front-to-back size of the deck, and its width across the rails. */
  readonly deckD: number;
  readonly deckW: number;
  /** Tier-local underside of the deck. */
  readonly deckZ: number;
  /** How far the rail grooves are cut into each side wall. */
  readonly railD: number;
  /** Height of the rail groove, and how proud the retaining bump stands in it. */
  readonly railH: number;
  readonly snapH: number;
  /** Beam width at the root and at the tip. This is its SIDEWAYS stiffness. */
  readonly beamRoot: number;
  readonly beamTip: number;
  /** Worst-case sideways deflection of the beam tip, and the length that needs. */
  readonly beamThrow: number;
  readonly beamNeed: number;
  /** Narrowest the relief slit ever gets, and the relief hole at its root. */
  readonly slitW: number;
  readonly reliefD: number;
  /**
   * The paddle on the beam's tip that carries the pin, and the stub of plate
   * behind the relief holes that the beam is rooted in.
   *
   * Both are DEAD LENGTH -- neither bends -- so both are added to the reach on
   * top of the beam the strain budget asked for. A pin hung straight off a
   * 0.8 mm tip is a pin on a stalk.
   */
  readonly padL: number;
  readonly padW: number;
  readonly beamRootSet: number;
  /**
   * How far the pin stands proud of the deck, and how much of that is
   * interference.
   *
   * The pin is modelled reaching ABOVE the deepest floor of the groove on
   * purpose. Assembled, the beam is bowed that far downward and is pressing up
   * the whole time -- a pin that merely touches is a pin that drops out of the
   * groove the first time a ramp asks it to climb.
   */
  readonly pinLen: number;
  readonly pinPreload: number;

  // ----------------------------------------------------------------- eject
  readonly eject: Eject;
  readonly springFree: number;
  /** Back wall to the tunnel's blind end when the drawer is shut. */
  readonly springGap: number;
  readonly springW: number;
  readonly springT: number;
  readonly springTurns: number;
  readonly springSeatH: number;
  readonly bandPost: number;
  readonly bandSpan: number;
  /**
   * The tunnel bored forward through the tray's floor that the ejector pushes
   * along, and the floor left under it.
   *
   * The ejector has to shove on a face that points BACKWARD and lives below the
   * tray, and the tray prints floor-down -- so it cannot be a lug hanging under
   * the floor, because then the tray stands on the lug instead of on its floor.
   * It is the blind end of a tunnel instead. The floor under that tunnel is
   * kept thicker than the cam is deep, so the follower's pin runs straight
   * beneath it in its relief.
   */
  readonly tunnelW: number;
  readonly tunnelH: number;
  readonly tunnelFloor: number;
  /** Working height of whichever ejector is fitted, inside that tunnel. */
  readonly ejectH: number;

  // --------------------------------------------------------------- printer
  readonly nozzle: number;
  readonly layer: number;
  readonly bed: readonly [number, number];
  readonly minWall: number;
  readonly minPlate: number;
}

const TIER_NAMES: Record<number, readonly string[]> = {
  1: ['Tray'],
  2: ['Top tray', 'Bottom tray'],
  3: ['Top tray', 'Middle tray', 'Bottom tray'],
};

export function derive(p: Params): Derived {
  const nozzle = Number(p.nozzle);
  const layer = Number(p.layer);
  const minWall = Math.max(2 * nozzle, 0.8);
  const minPlate = Math.max(3 * layer, 0.6);

  const W = Number(p.width);
  const D = Number(p.depth);
  const n = Math.min(3, Math.max(1, Math.round(Number(p.drawers))));
  const openH = Number(p.height);
  const H = n * openH;
  const wall = Math.max(Number(p.wall), minWall);
  const topT = Math.max(Number(p.topPlate), minPlate);
  const clear = Number(p.clearance);

  const trayWall = Math.max(Number(p.trayWall), minWall);
  const trayFloor = Math.max(Number(p.trayFloor), minPlate);

  const slideT = Number(p.slideHeight);
  const slideP = Number(p.slideDepth);
  const railD = 2.5;
  // Every groove is cut into the side from the inside, and the side has to
  // survive the deepest of them.
  const sideT = Math.max(wall, slideP + clear + minWall, railD + clear + minWall);

  const latch = p.latch === true;
  const follower = String(p.follower) as Follower;
  const printed = latch && follower === 'printed';
  const wireD = Number(p.wireDiameter);
  // A printed pin cannot be a paperclip: at 1.1 mm it is three extrusions of
  // unsupported plastic taking the whole sideways load of the cam.
  const pinD = printed ? Math.max(2, 5 * nozzle) : wireD;

  const pop = Number(p.pop);
  const over = Number(p.overtravel);
  const lead = Number(p.leadIn);
  const grooveW = pinD + 2 * clear;
  /**
   * The cam has to be wide enough that its SHORT segments -- apex to notch --
   * are longer than the pin is fat.
   *
   * Each corner is rounded off by half a groove width from either side, so a
   * segment only two groove widths long is all corner and has no ramp left in
   * the middle to carry the one-way step. A 1.1 mm paperclip never noticed;
   * a 2 mm printed pin in a 10 mm cam turned both short segments into one
   * shallow dish, and the latch skipped. The apex-to-notch run is
   * sqrt(over^2 + camV^2), so this is that solved for camV.
   */
  const camFloor = Math.sqrt(Math.max(0, (2.6 * grooveW) ** 2 - over ** 2));
  const camV = Math.max(Number(p.camWidth) / 2, printed ? camFloor : 0);
  const camStep = Math.max(2 * layer, Number(p.camStep));
  const camDeep = pinD * 0.9 + camStep;
  const camPadT = camDeep + Math.max(2 * layer, 1.2);
  const camPadW = 2 * camV + grooveW + 6;
  // Enough to commit the pin to the left branch, never so much that it misses
  // the funnel on the way back in.
  const camBias = grooveW * 0.35;
  const reliefW = grooveW + 1;

  // --- the printed follower
  const beamRoot = Math.max(Number(p.beamThickness), 2 * nozzle);
  const beamTip = beamRoot * 0.55;
  const beamThrow = camV + camBias;
  // Cantilever with an end load: the outside fibre sees 3*t*d / (2*L^2). Solve
  // that for L at the strain we are willing to spend, and out falls the
  // shortest beam that survives being thrown all the way to a cam apex.
  const beamNeed = Math.sqrt((3 * beamRoot * beamThrow) / (2 * STRAIN_MAX));

  const slitW = Math.max(2 * nozzle, 0.8);
  const reliefD = Math.max(3, 3 * slitW);
  const padW = pinD + 1.6;
  const padL = pinD + 2;
  const beamRootSet = reliefD / 2 + 1.5;

  // The face plate sinks this far into the tray's front wall. Butted face to
  // face instead, the union has no volume to work with and Manifold hands back
  // two bodies that merely touch -- so the whole tray sits that much further
  // forward, or the drawer cannot be pressed in without the face fouling the
  // carcass it is supposed to stand clear of.
  const frontBite = 0.6;
  const standoff = (latch ? over : 0) + clear + frontBite;
  const backGap = (latch ? over : 0) + clear;

  // --- the bay under the tray, which is the whole of what the latch costs now
  const deckT = Math.max(3, beamRoot * 2.2);
  // A rail groove that opens through the BOTTOM edge of the side wall is not a
  // groove, it is a rebate, and the deck drops straight out of it. Leave a
  // ledge under it.
  const railFloor = Math.max(1.2, minWall);
  const deckZ = railFloor + clear;
  // A wire needs room for the arm and for the boss to have material round its
  // hole, and nothing else -- which is the whole of why the paperclip is still
  // an option: it is the shallower bay, and under the tray shallow means the
  // drawer keeps the height.
  const bayH = !latch
    ? 0
    : printed
      ? deckZ + deckT + clear
      : Math.max(wireD + 2 * minWall + clear, 3);

  const trayZ = bayH;
  const trayH = openH - clear - bayH;
  // Hung near the top, because an under-desk drawer hangs from its rails --
  // put the tongue low and the tray pivots on it every time you load the front.
  // TRAY-local: the carcass adds `trayZ` to find where to cut the groove.
  const slideZ = trayH - slideT / 2 - Math.max(2, trayWall);
  // The wire's arm runs along the bay with its tip bent UP into the groove, so
  // the pivot wants to sit two diameters under the tray's underside -- clamped
  // both ways, because the boss still has to have material round the hole.
  const wireZ = Math.min(
    Math.max(bayH - 2 * wireD + 0.3, wireD / 2 + minWall),
    Math.max(wireD / 2 + minWall, bayH - wireD / 2 - minWall),
  );

  // --- the ejector, in a tunnel bored forward from the tray's back face
  const springW = Number(p.springWidth);
  const springT = Math.max(Number(p.springThickness), 2 * nozzle);
  const springTurns = Math.round(Number(p.springTurns));
  // The spring stands on edge in the tunnel, so its height is what the tray's
  // floor has to be raised by to make room -- and the force it can give goes
  // straight up with it. That trade is the price of moving the ejector out of
  // the back of the box: under the tray it is a shorter spring than it was, and
  // the ribbon thickness is the control that buys the throw back.
  const springSeatH = Math.max(5, Math.min(springW + 4, 10, trayH * 0.3));
  const bandPost = Math.min(8, Math.max(4, trayH * 0.2));
  const eject = String(p.ejector) as Eject;
  const ejectH = eject === 'band' ? bandPost : springSeatH;

  const springSolid = (springTurns + 1) * springT;
  // Derived, never typed. A gap shorter than the folded ribbon is a spring that
  // goes solid before the latch ever releases, and a gap the seat cannot reach
  // into is a spring with nothing behind it.
  const springGap = !latch
    ? 0
    : eject === 'band'
      ? Math.max(pop + 12, backGap + 10)
      : Math.max(springSolid + over + 4, backGap + 10);

  const tunnelFloor = latch ? camDeep + Math.max(minPlate, 0.8) : 0;
  const tunnelH = latch ? ejectH + 2 * clear : 0;
  const tunnelW = !latch
    ? 0
    : (eject === 'band' ? BAND_SPAN + 4.8 : springW + 2 * wall) + 2 * clear;

  // How far forward of the back wall the pin sits. The beam gets the length its
  // strain budget asked for outright; the only floor under that is that the cam
  // pattern, funnel and all, has to land UNDER the tray rather than off the
  // back of it.
  const reach = !latch
    ? 0
    : Math.max(
        printed ? beamNeed + padL + beamRootSet : Math.max(20, lead + pop + over + 4),
        pop + lead + backGap + 2,
      );

  // The tray is the carcass interior less a running fit on every face it
  // passes. Derived, never typed: the two parts are one fit, and letting them
  // be set independently is how you print a drawer that does not go in. It runs
  // the WHOLE depth now -- the latch is underneath it, not behind it.
  const trayW = W - 2 * sideT - 2 * clear;
  const trayD = D - wall - backGap + standoff;

  return {
    W,
    D,
    H,
    openH,
    tiers: Array.from({ length: n }, (_, k) => ({
      index: k,
      name: TIER_NAMES[n]![k]!,
      z0: (n - 1 - k) * openH,
    })),
    wall,
    sideT,
    topT,
    mount: String(p.mount) as Mount,
    screwD: Number(p.screwDiameter),
    screwHeadD: Number(p.screwDiameter) * 2,
    screwInset: Number(p.screwInset),

    trayW,
    trayD,
    trayH,
    trayZ,
    trayWall,
    trayFloor,
    clear,
    backGap,

    slideT,
    slideP,
    slideZ,
    travel: Math.min(Number(p.travel), trayD - 10),

    front: String(p.frontStyle) as Front,
    frontT: Math.max(Number(p.frontThickness), minWall),
    frontOver: Number(p.frontOverhang),
    frontReveal: Math.max(1, 2 * clear),
    pullH: Number(p.pullHeight),
    pullD: Number(p.pullDepth),

    divX: Math.round(Number(p.dividersX)),
    divY: Math.round(Number(p.dividersY)),
    divT: Math.max(Number(p.dividerThickness), minWall),
    divH: Number(p.dividerHeight) / 100,

    latch,
    follower,
    wireD,
    pinD,
    pop,
    over,
    lead,
    grooveW,
    camV,
    camDeep,
    camStep,
    camPadT,
    camPadW,
    camBias,
    reliefW,
    reach,
    frontBite,
    wireZ,
    stopH: Math.max(0.4, slideP * 0.25),
    standoff,

    bayH,
    deckT,
    deckD: reach + pinD / 2,
    deckW: W - 2 * sideT + 2 * railD - 2 * clear,
    deckZ,
    railD,
    railH: deckT + 2 * clear,
    // Bigger than the running clearance, or the bump the deck is meant to snap
    // past sits inside the fit and stops nothing.
    snapH: clear + 0.3,
    beamRoot,
    beamTip,
    beamThrow,
    beamNeed,
    slitW,
    reliefD,
    padL,
    padW,
    beamRootSet,
    pinLen: clear + camDeep + 0.3,
    pinPreload: 0.3,

    eject,
    springGap,
    // Still compressed by the preload when the tray is all the way out, which
    // is the only thing that puts any push behind the last millimetre.
    springFree: springGap + pop + Number(p.springPreload),
    springW,
    springT,
    springTurns,
    springSeatH,
    bandPost,
    bandSpan: BAND_SPAN,
    tunnelW,
    tunnelH,
    tunnelFloor,
    ejectH,

    nozzle,
    layer,
    bed: [Number(p.bedX), Number(p.bedY)] as const,
    minWall,
    minPlate,
  };
}
