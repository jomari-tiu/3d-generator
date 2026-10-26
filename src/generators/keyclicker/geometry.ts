import type { Params } from '../../core/params/types';

/**
 * Switch options.
 *
 * The MX and Choc numbers are the published plate standards, not guesses: a
 * 14.0 mm square in a 1.5 mm plate is what an MX switch's clips are moulded
 * for, and getting it wrong by a few tenths is the difference between a switch
 * that snaps home and one that falls out in a pocket. They are NOT offered as
 * adjustable dimensions for that reason -- `fitOffset` trims them together.
 */
export interface SwitchSpec {
  readonly id: string;
  readonly label: string;
  /** Square plate cutout, mm. Zero means the base carries its own well. */
  readonly cutout: number;
  /** Plate thickness the switch clips onto. */
  readonly plate: number;
  /** Room needed under the plate for the body and its pins. */
  readonly under: number;
  /** Below this pitch the plate webs between cutouts stop being printable. */
  readonly minPitch: number;
  readonly stem: 'mx' | 'choc' | 'post';
  /** How far the stem reaches up into the keycap's hollow. */
  readonly stemDepth: number;
  /**
   * Top of the stem above the plate's top face, at rest. Sets where the cap
   * rides, which a sunken base has to know: its rim must stay below the cap's
   * top even with the key held down. Erring LOW is the safe side -- a cap that
   * really sits higher only stands further proud of the rim. Zero for the
   * printed variant, whose cap sits in a well instead.
   */
  readonly stemTop: number;
  /** Full key travel. */
  readonly keyTravel: number;
  /**
   * Does the body need a cavity under the plate?
   *
   * A bought switch pushes down through the plate from above until its clips
   * snap under it, so it needs room below the plate for its housing and pins --
   * but not an open bottom: the cavity is closed by the body's own floor. The
   * printed variant has nothing to insert -- the well and the dome ARE the
   * mechanism -- and it needs SOLID material under each well for the guide post
   * to stand on. Hollowing it out leaves the post floating in the cavity.
   */
  readonly hollow: boolean;
  readonly hardware: string;
}

export const SWITCHES: Record<string, SwitchSpec> = {
  mx: {
    id: 'mx',
    label: 'Cherry MX or clone',
    cutout: 14,
    plate: 1.5,
    under: 9,
    minPitch: 16.5,
    stem: 'mx',
    stemDepth: 4,
    stemTop: 10.2,
    keyTravel: 4,
    hollow: true,
    hardware: 'one MX-style switch per key',
  },
  choc: {
    id: 'choc',
    label: 'Kailh Choc v1 (low profile)',
    cutout: 13.8,
    plate: 1.3,
    under: 5.5,
    minPitch: 15.5,
    stem: 'choc',
    stemDepth: 3,
    stemTop: 5,
    keyTravel: 3,
    hollow: true,
    hardware: 'one Kailh Choc v1 switch per key',
  },
  printed: {
    id: 'printed',
    label: 'Printed snap dome (no hardware)',
    cutout: 0,
    plate: 2,
    under: 6.5,
    minPitch: 14,
    stem: 'post',
    stemDepth: 3,
    stemTop: 0,
    keyTravel: 0,
    hollow: false,
    hardware: 'none',
  },
};

export interface Derived {
  readonly nozzle: number;
  readonly layer: number;
  readonly fit: number;
  readonly clear: number;
  /** Clearance on the keycap's stem socket -- looser than the plate cutout. */
  readonly stemClear: number;

  readonly sw: SwitchSpec;
  readonly legend: string[];
  readonly keys: number;

  readonly pitch: number;
  readonly keySize: number;
  readonly capH: number;
  readonly capTaperDeg: number;
  readonly capTopSize: number;
  readonly capWall: number;
  readonly capTop: number;
  readonly capCorner: number;
  /** How far in the cap's top edge is rounded over, clamped to half the top. */
  readonly capRound: number;
  /** How far DOWN it is rounded: capRound, unless the cap is too short for that. */
  readonly capRoundZ: number;
  readonly dish: number;
  /** Rise of a domed top above its edges. Not the printed switch dome. */
  readonly capDome: number;

  readonly legendSize: number;
  readonly legendDepth: number;
  readonly legendStyle: string;
  /** Gap round a separate letter in its recess. */
  readonly letterClear: number;

  // --- layout
  /** 'row': one straight line of keys. 'wasd': W over a row of A S D, staggered as on a keyboard. */
  readonly layout: 'row' | 'wasd';
  /** Centre of each key, in key order, with the whole set centred on the origin. */
  readonly keyCentres: readonly (readonly [number, number])[];
  /**
   * The body seen from above, as CONVEX rounded rectangles: one bar for a row
   * tray, one cell per key, or for a WASD tray a bar under the bottom row and a
   * block under W. Convex because the chamfer and the round-over are insets,
   * and an inset is only even on a convex outline.
   */
  readonly bodyPieces: readonly BodyPiece[];
  /** Where the keyring tab meets the body: a point on its edge, and which way is out. */
  readonly loopAnchor: { readonly x: number; readonly y: number; readonly axis: 'x' | 'y' };

  // --- base
  /** 'tray': one sunken pocket for the whole row. 'cells': a housing per key. */
  readonly baseStyle: string;
  /** Clearance between a keycap and the pocket wall around it. */
  readonly keyGap: number;
  /** Inside of one key's pocket, square. */
  readonly pocket: number;
  /** Outside of one cell, square. Cells style only. */
  readonly cell: number;
  readonly cellCorner: number;
  /** Top edge round-over of each cell housing; 0 keeps the chamfer. */
  readonly cellRound: number;
  /** Rim above the plate's top face: how far the keys sit down in the base. */
  readonly rimH: number;
  /** Z of the plate's top face, which is where the switches clip in. */
  readonly plateTop: number;
  /** Z of a keycap's bottom edge at rest, relative to the plate top. */
  readonly capRest: number;
  /**
   * How far the bottom of the cap's skirt is cut back, in the cap's own frame,
   * so that pressed all the way down it still clears the plate. Zero when the
   * skirt already clears it.
   */
  readonly skirtLift: number;
  /** How far a key moves when pressed. */
  readonly keyTravel: number;
  /** How much of the cap stands above the rim with the key held down. */
  readonly pressedProud: number;
  readonly plateT: number;
  readonly cavityD: number;
  readonly wallT: number;
  readonly endWall: number;
  readonly baseW: number;
  readonly baseD: number;
  readonly baseH: number;
  readonly baseCorner: number;
  readonly chamfer: number;

  // --- bottom
  /** Solid floor under the cavity or the wells. The body has no open bottom. */
  readonly floorT: number;
  readonly wellDepth: number;

  // --- printed dome variant
  readonly postR: number;
  readonly postH: number;
  readonly travel: number;
  readonly domeR: number;
  readonly domeH: number;
  readonly domeWall: number;

  /** Ribs from floor to plate between neighbouring switches. */
  readonly supportWalls: boolean;

  // --- keyring
  readonly loop: boolean;
  readonly loopD: number;
  readonly loopSide: string;

  readonly material: string;
}

export interface BodyPiece {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly corner: number;
}

/**
 * Where the keys of a WASD cluster sit, in pitch units and in typing order:
 * W, then A S D along the row below. W is a QUARTER key left of S because that
 * is where it is on a real keyboard -- the row above the home row starts a
 * quarter key further left -- and a clicker for a player's fingers should put
 * the keys where those fingers already expect them.
 */
const WASD_SLOTS: readonly (readonly [number, number])[] = [
  [-0.25, 1],
  [-1, 0],
  [0, 0],
  [1, 0],
];

/** One key per character. Spaces are dropped -- a blank key is a gap, not a key. */
export function legendChars(p: Params): string[] {
  const max = String(p.layout ?? 'row') === 'wasd' ? WASD_SLOTS.length : 12;
  return [...String(p.text ?? '')].filter((c) => c.trim().length > 0).slice(0, max);
}

export function derive(p: Params): Derived {
  const nozzle = Number(p.nozzle);
  const layer = Number(p.layer);
  const fit = Number(p.fitOffset);
  const clear = Number(p.partClearance) + fit;
  const stemClear = Number(p.stemClearance ?? 0.2) + fit;

  const sw = SWITCHES[String(p.switchType)] ?? SWITCHES.mx!;
  const legend = legendChars(p);
  const keys = Math.max(1, legend.length);

  const keySize = Number(p.keySize);
  const capH = Number(p.capHeight);
  const capTaperDeg = Number(p.capTaper);
  // Taper is quoted as a wall angle, which is how a keycap is actually
  // described, and converted to the top footprint the extrude needs.
  const capTopSize = Math.max(
    4,
    keySize - 2 * capH * Math.tan((capTaperDeg * Math.PI) / 180),
  );
  const capWall = Math.max(1.2, 3 * nozzle);
  const capCorner = Number(p.capCorner);
  // One signed slider: below zero is a dish, above zero a dome.
  const curve = Number(p.topCurve);
  const dish = curve < 0 ? -curve : 0;
  // A dome adds material on top of the edge height rather than taking it out,
  // so unlike the dish it costs the top face nothing.
  const capDome = curve > 0 ? curve : 0;
  const legendDepth = Number(p.legendDepth);

  const legendStyle = String(p.legendStyle);
  // A raised legend adds material on top of the face instead of taking it out,
  // so only the two cut-in styles have to be paid for here.
  const recess =
    legendStyle === 'engraved' || legendStyle === 'inlay' || legendStyle === 'separate' ? legendDepth : 0;

  // The top face has to survive everything taken out of it. The dish scoops
  // from above and the legend recess cuts below that, and 1.2 mm of top with a
  // 0.7 mm dish and a 0.6 mm recess is a letter-shaped hole -- which severs the
  // stem from the face it hangs off and leaves the cap in three pieces.
  const capTop = Math.max(1.2, 5 * layer, dish + recess + 2 * layer);
  // A round-over can go no further in than the middle of the top: there the
  // top has closed into a ball. It can go no further DOWN than the cap is
  // tall, and on a cap shorter than it is wide it is the depth that gives --
  // the quarter circle squashes to a quarter ellipse -- so turning it all the
  // way up still closes the top, rather than stopping short at the cap height.
  const capRound = Math.max(0, Math.min(Number(p.capRound ?? 0), capTopSize / 2));
  const capRoundZ = Math.min(capRound, capH - 0.2);

  const wallT = Number(p.wall);
  const endWall = Math.max(wallT, Number(p.endWall));
  const travel = Number(p.travel);
  const domeR = Number(p.domeDiameter) / 2;
  const domeH = Number(p.domeHeight);
  const domeWall = Math.max(0.5, 3 * layer);
  // floorExtra is not a control: a design built on this body (the mob
  // clicker's cube) asks for a deeper back than the switch alone needs.
  const floorT = Math.max(1.6, wallT) + Math.max(0, Number(p.floorExtra ?? 0));

  // How deep the keycap skirt drops into its well, printed variant only.
  const wellDepth = travel + capH * 0.45;

  // A hollow body is a plate over a closed cavity on a solid floor. A solid one is
  // sized from the well downward instead, so there is always floor beneath the
  // dome seat for the post to be anchored in.
  const plateT = sw.hollow ? sw.plate : wellDepth + domeH + 0.4;
  const cavityD = sw.hollow ? sw.under : 0;

  // Where a cap rides, measured from the plate's top face. A bought switch
  // holds it by the stem; the printed one sinks it into its well.
  const roof = capH - capTop;
  const capRest = sw.hollow ? sw.stemTop - roof : -wellDepth - (roof - sw.stemDepth);
  const keyTravel = sw.hollow ? sw.keyTravel : travel;

  const baseStyle = String(p.baseStyle) === 'cells' ? 'cells' : 'tray';
  const keyGap = Number(p.keyGap);
  const pocket = keySize + 2 * keyGap;
  const cell = pocket + 2 * wallT;
  // Cells share one wall between neighbours, so their spacing is not a free
  // choice: it is the pocket plus that wall. The tray keeps its pitch slider.
  const pitch = baseStyle === 'cells' ? pocket + wallT : Number(p.keyPitch);

  // The rim is placed by how much of the CAP it hides at rest, which is the
  // number you see -- not by a height above a plate you never see.
  // The printed variant already sinks its caps into wells cut in the plate, so
  // it gets no rim on top of that.
  // The skirt hangs down round the switch, and pressed fully it must not reach
  // the plate, or the key bottoms out on the plate before the switch clicks.
  // A tall cap on a short switch (any cap over about 6 mm on a Choc) would, so
  // the hidden bottom of its skirt is cut back to clear the plate by a margin
  // at full travel. The stem is left alone: it reaches the switch, not the
  // plate. The rim stays where it was: the stem fixes how high the cap's TOP
  // sits, so raising the rim to the shortened skirt would only bury the key.
  const skirtLift = sw.hollow ? Math.max(0, keyTravel + 0.3 - capRest) : 0;
  const rimH = sw.hollow ? Math.max(0, capRest + Number(p.keyDepth)) : 0;
  const pressedProud = capRest - keyTravel + capH - rimH;

  const baseCorner = Number(p.baseCorner);
  const cellCorner = Number(p.cellCorner);
  const layout = String(p.layout ?? 'row') === 'wasd' ? 'wasd' : 'row';

  // Key centres. A row runs along X about the origin; a WASD cluster is laid
  // out from its slots and then centred on its own bounding box, so the body,
  // the caps and the plate layout all stay centred as they are for a row.
  let keyCentres: [number, number][];
  if (layout === 'wasd') {
    const raw = WASD_SLOTS.slice(0, keys).map(([u, v]) => [u * pitch, v * pitch] as [number, number]);
    const xs = raw.map((c) => c[0]);
    const ys = raw.map((c) => c[1]);
    const mx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const my = (Math.min(...ys) + Math.max(...ys)) / 2;
    keyCentres = raw.map(([x, y]) => [x - mx, y - my]);
  } else {
    keyCentres = Array.from({ length: keys }, (_, i) => [-((keys - 1) * pitch) / 2 + i * pitch, 0]);
  }

  // The body, as convex pieces. A tray bar spans its keys plus a pocket and
  // the two end walls; a cell is one pocket and its walls.
  const bar = (row: [number, number][]): BodyPiece => {
    const xs = row.map((c) => c[0]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    return { x: (x0 + x1) / 2, y: row[0]![1], w: x1 - x0 + pocket + 2 * endWall, h: cell, corner: baseCorner };
  };
  let bodyPieces: BodyPiece[];
  if (baseStyle === 'cells') {
    bodyPieces = keyCentres.map(([x, y]) => ({ x, y, w: cell, h: cell, corner: cellCorner }));
  } else if (layout === 'wasd' && keys > 1) {
    // A bar under the bottom row and a block under W, overlapping by the rim
    // between them: two convex pieces where one T-shaped outline would not be.
    const [w, ...bottom] = keyCentres;
    bodyPieces = [bar(bottom), { x: w![0], y: w![1], w: cell, h: cell, corner: baseCorner }];
  } else {
    bodyPieces = [bar(keyCentres)];
  }
  const px0 = Math.min(...bodyPieces.map((b) => b.x - b.w / 2));
  const px1 = Math.max(...bodyPieces.map((b) => b.x + b.w / 2));
  const py0 = Math.min(...bodyPieces.map((b) => b.y - b.h / 2));
  const py1 = Math.max(...bodyPieces.map((b) => b.y + b.h / 2));
  const baseW = px1 - px0;
  const baseD = py1 - py0;

  // The keyring tab: off the far end of the last key's piece, on its centre
  // line, or off the top edge of the first key's piece -- for a row, the end
  // of the bar or the middle of its long side, as it always was; for WASD, the
  // end of the A S D row or the top of W.
  const endPiece = bodyPieces.reduce((a, b) => (b.x + b.w / 2 > a.x + a.w / 2 ? b : a));
  const topPiece = layout === 'wasd' ? bodyPieces.reduce((a, b) => (b.y + b.h / 2 > a.y + a.h / 2 ? b : a)) : null;
  const loopSide = String(p.loopPosition);
  const loopAnchor: Derived['loopAnchor'] =
    loopSide === 'side'
      ? { x: topPiece ? topPiece.x : 0, y: topPiece ? topPiece.y + topPiece.h / 2 : baseD / 2, axis: 'y' }
      : { x: endPiece.x + endPiece.w / 2, y: endPiece.y, axis: 'x' };
  const plateTop = floorT + cavityD + plateT;
  const baseH = plateTop + rimH;
  const chamfer = Math.min(1.2, wallT * 0.5);

  const postR = Math.max(1.6, 2 * nozzle + 0.8);
  // Tall enough for the cap's tube to stay engaged over the whole travel, and
  // short enough to stay inside the cap's own hollow.
  const postH = Math.max(1.5, Math.min(wellDepth * 0.8, capH - capTop - 0.6));

  return {
    nozzle, layer, fit, clear, stemClear,
    sw, legend, keys,
    pitch, keySize, capH, capTaperDeg, capTopSize, capWall, capTop, capCorner, capRound, capRoundZ, dish, capDome,
    legendSize: Number(p.legendSize),
    legendDepth,
    legendStyle,
    letterClear: Math.max(0, Number(p.letterClearance ?? 0.12) + fit),
    layout, keyCentres, bodyPieces, loopAnchor,
    baseStyle, keyGap, pocket, cell,
    cellCorner,
    // The round-over comes in from the outside and the pocket is cut from the
    // inside: past the wall between them the rim's top would be a knife edge,
    // so a land of 0.4 mm is always left.
    cellRound: Math.max(0, Math.min(Number(p.cellRound ?? 0), wallT - 0.4, baseH - 0.2)),
    rimH, plateTop, capRest, skirtLift, keyTravel, pressedProud,
    plateT, cavityD, wallT, endWall, baseW, baseD, baseH, baseCorner, chamfer,
    floorT,
    wellDepth,
    postR, postH, travel, domeR, domeH, domeWall,
    supportWalls: p.supportWalls !== false,
    loop: p.keyring === true,
    loopD: Number(p.loopDiameter),
    loopSide,
    material: String(p.material),
  };
}

/** Centre of key i, with the whole set of keys centred on the origin. */
export function keyPos(d: Derived, i: number): readonly [number, number] {
  return d.keyCentres[i]!;
}
