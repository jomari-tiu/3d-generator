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
   * Does the body need an open bottom and a cover?
   *
   * A bought switch clips onto the plate from underneath, so it does. The
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
  readonly dish: number;
  /** Rise of a domed top above its edges. Not the printed switch dome. */
  readonly capDome: number;

  readonly legendSize: number;
  readonly legendDepth: number;
  readonly legendStyle: string;

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
  /** Rim above the plate's top face: how far the keys sit down in the base. */
  readonly rimH: number;
  /** Z of the plate's top face, which is where the switches clip in. */
  readonly plateTop: number;
  /** Z of a keycap's bottom edge at rest, relative to the plate top. */
  readonly capRest: number;
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

  // --- bottom cover
  readonly coverT: number;
  readonly coverBead: number;
  readonly floorT: number;
  readonly wellDepth: number;

  // --- printed dome variant
  readonly postR: number;
  readonly postH: number;
  readonly travel: number;
  readonly domeR: number;
  readonly domeH: number;
  readonly domeWall: number;

  // --- keyring
  readonly loop: boolean;
  readonly loopD: number;
  readonly loopSide: string;

  readonly material: string;
}

/** One key per character. Spaces are dropped -- a blank key is a gap, not a key. */
export function legendChars(p: Params): string[] {
  return [...String(p.text ?? '')].filter((c) => c.trim().length > 0).slice(0, 12);
}

export function derive(p: Params): Derived {
  const nozzle = Number(p.nozzle);
  const layer = Number(p.layer);
  const fit = Number(p.fitOffset);
  const clear = Number(p.partClearance) + fit;

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
  const recess = legendStyle === 'engraved' || legendStyle === 'inlay' ? legendDepth : 0;

  // The top face has to survive everything taken out of it. The dish scoops
  // from above and the legend recess cuts below that, and 1.2 mm of top with a
  // 0.7 mm dish and a 0.6 mm recess is a letter-shaped hole -- which severs the
  // stem from the face it hangs off and leaves the cap in three pieces.
  const capTop = Math.max(1.2, 5 * layer, dish + recess + 2 * layer);

  const wallT = Number(p.wall);
  const endWall = Math.max(wallT, Number(p.endWall));
  const travel = Number(p.travel);
  const domeR = Number(p.domeDiameter) / 2;
  const domeH = Number(p.domeHeight);
  const domeWall = Math.max(0.5, 3 * layer);
  const floorT = Math.max(1.6, wallT);

  // How deep the keycap skirt drops into its well, printed variant only.
  const wellDepth = travel + capH * 0.45;

  // A hollow body is a plate over a cavity, closed by a cover. A solid one is
  // sized from the well downward instead, so there is always floor beneath the
  // dome seat for the post to be anchored in.
  const plateT = sw.hollow ? sw.plate : wellDepth + domeH + 0.4;
  const cavityD = sw.hollow ? sw.under : 0;
  const coverT = sw.hollow ? Math.max(1.2, 5 * layer) : 0;

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
  const rimH = sw.hollow ? Math.max(0, capRest + Number(p.keyDepth)) : 0;
  const pressedProud = capRest - keyTravel + capH - rimH;

  const baseW =
    baseStyle === 'cells'
      ? (keys - 1) * pitch + cell
      : (keys - 1) * pitch + pocket + 2 * endWall;
  const baseD = cell;
  const plateTop = sw.hollow ? coverT + cavityD + plateT : floorT + plateT;
  const baseH = plateTop + rimH;
  const baseCorner = Number(p.baseCorner);
  const chamfer = Math.min(1.2, wallT * 0.5);

  const postR = Math.max(1.6, 2 * nozzle + 0.8);
  // Tall enough for the cap's tube to stay engaged over the whole travel, and
  // short enough to stay inside the cap's own hollow.
  const postH = Math.max(1.5, Math.min(wellDepth * 0.8, capH - capTop - 0.6));

  return {
    nozzle, layer, fit, clear,
    sw, legend, keys,
    pitch, keySize, capH, capTaperDeg, capTopSize, capWall, capTop, capCorner, dish, capDome,
    legendSize: Number(p.legendSize),
    legendDepth,
    legendStyle,
    baseStyle, keyGap, pocket, cell,
    cellCorner: Number(p.cellCorner),
    rimH, plateTop, capRest, keyTravel, pressedProud,
    plateT, cavityD, wallT, endWall, baseW, baseD, baseH, baseCorner, chamfer,
    coverT,
    coverBead: Math.max(0.4, wallT * 0.3),
    floorT,
    wellDepth,
    postR, postH, travel, domeR, domeH, domeWall,
    loop: p.keyring === true,
    loopD: Number(p.loopDiameter),
    loopSide: String(p.loopPosition),
    material: String(p.material),
  };
}

/** X centre of key i, measured from the middle of the bar. */
export function keyX(d: Derived, i: number): number {
  return -((d.keys - 1) * d.pitch) / 2 + i * d.pitch;
}
