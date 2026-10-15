import type { Params } from '../../core/params/types';

/** Clearance between a stacked bin's foot and the opening it drops into. */
export const STACK_CLEAR = 0.25;
/** Thickness of the label tab's front edge, above its sloped underside. */
export const LABEL_T = 1.2;
/** Clearance between a bin and its pocket in the tray, per side. */
export const POCKET_CLEAR = 0.25;
/** Thinnest the tray's outer rim and the ribs between pockets may get. */
export const TRAY_RIM = 2;
export const TRAY_RIB = 1.2;
/** How far a jigsaw knob reaches past the cut it crosses. */
export const KNOB_REACH = 7.5;

/** One bin in the grid: the cell it starts at, and how many cells it spans. */
export interface BinCell {
  readonly col: number;
  readonly row: number;
  readonly w: number;
  readonly h: number;
}

export interface Layout {
  readonly bins: readonly BinCell[];
  readonly errors: readonly string[];
}

/**
 * Read the bin layout: one line per row, front row first, each a list of bin
 * widths in columns. "2" is one bin two columns wide, "1,2" a single then a
 * double. "2x2" is two columns wide and two rows deep, and the row below
 * simply skips the cells it already covers. Anything a line leaves unsaid is
 * filled with single bins, so an empty layout is the plain grid.
 */
export function parseLayout(text: string, cols: number, rows: number): Layout {
  const taken: boolean[][] = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
  const bins: BinCell[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/);

  const place = (col: number, row: number, w: number, h: number) => {
    for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) taken[r]![c] = true;
    bins.push({ col, row, w, h });
  };
  const free = (col: number, row: number, w: number, h: number) => {
    if (col + w > cols || row + h > rows) return false;
    for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) if (taken[r]![c]) return false;
    return true;
  };

  for (let row = 0; row < rows; row++) {
    const tokens = (lines[row] ?? '').split(/[,\s]+/).filter((t) => t.length > 0);
    let col = 0;
    for (const token of tokens) {
      const match = /^(\d+)(?:\s*[xX*]\s*(\d+))?$/.exec(token);
      if (!match) {
        errors.push(`Row ${row + 1}: "${token}" is not a bin size. Use a number of columns, like 2, or columns x rows, like 2x2.`);
        break;
      }
      const w = Number(match[1]);
      const h = match[2] === undefined ? 1 : Number(match[2]);
      if (w < 1 || h < 1) {
        errors.push(`Row ${row + 1}: "${token}" - a bin has to be at least 1 x 1.`);
        break;
      }
      while (col < cols && taken[row]![col]) col++;
      if (col >= cols) {
        errors.push(`Row ${row + 1} is already full, so "${token}" has nowhere to go. There are ${cols} columns.`);
        break;
      }
      if (!free(col, row, w, h)) {
        errors.push(
          col + w > cols
            ? `Row ${row + 1}: a bin ${w} wide starting at column ${col + 1} runs past column ${cols}.`
            : row + h > rows
              ? `Row ${row + 1}: a bin ${h} rows deep runs past row ${rows}.`
              : `Row ${row + 1}: "${token}" would overlap a bin from the row before it.`,
        );
        break;
      }
      place(col, row, w, h);
      col += w;
    }
    for (let c = 0; c < cols; c++) if (!taken[row]![c]) place(c, row, 1, 1);
  }
  return { bins, errors };
}

export interface Derived {
  readonly drawerW: number;
  readonly drawerD: number;
  readonly drawerH: number;

  readonly cols: number;
  readonly rows: number;
  readonly layout: Layout;
  /** Gap between neighbouring bins. With a tray, at least room for a rib. */
  readonly gap: number;
  /** One grid cell. A bin spanning cells covers the gaps between them too. */
  readonly cellW: number;
  readonly cellD: number;
  /** Margin from the tray's edge to the outermost bins. Zero without a tray. */
  readonly margin: number;

  readonly binH: number;
  readonly corner: number;
  readonly wall: number;
  readonly floor: number;

  readonly stackable: boolean;
  readonly lipH: number;
  /**
   * How far the foot steps in from the outside wall: one wall plus clearance,
   * so it slides inside another bin's opening.
   */
  readonly footInset: number;

  readonly labelTab: boolean;
  readonly labelDepth: number;
  /** Z of the label tab's top face. */
  readonly labelTop: number;

  readonly scoop: boolean;
  readonly scoopRadius: number;

  // --- tray
  readonly tray: boolean;
  readonly trayW: number;
  readonly trayD: number;
  readonly trayBase: number;
  /** Height of the pocket walls above the tray's base. */
  readonly trayWall: number;
  /** Where the bins' bottoms sit: on the tray's base, or on the drawer floor. */
  readonly binZ: number;
  readonly jointClear: number;
  /** Cut positions across the tray, outer edges included. */
  readonly cutsX: readonly number[];
  readonly cutsY: readonly number[];
  readonly splitError: string | null;

  readonly bedX: number;
  readonly bedY: number;
}

export interface BinSize {
  readonly w: number;
  readonly d: number;
}

export function binSize(d: Derived, b: { w: number; h: number }): BinSize {
  return { w: b.w * d.cellW + (b.w - 1) * d.gap, d: b.h * d.cellD + (b.h - 1) * d.gap };
}

/** Centre of a bin in the drawer, with the drawer's centre at 0,0. Row 0 is the front. */
export function binCentre(d: Derived, b: BinCell): [number, number] {
  const left = -d.trayW / 2 + d.margin;
  const front = -d.trayD / 2 + d.margin;
  const s = binSize(d, b);
  return [
    left + b.col * (d.cellW + d.gap) + s.w / 2,
    front + b.row * (d.cellD + d.gap) + s.d / 2,
  ];
}

export function derive(p: Params): Derived {
  const drawerW = Number(p.drawerWidth);
  const drawerD = Number(p.drawerDepth);
  const drawerH = Number(p.drawerHeight);
  const fit = Number(p.fitGap);
  const cols = Math.max(1, Math.round(Number(p.columns)));
  const rows = Math.max(1, Math.round(Number(p.rows)));
  const layout = parseLayout(String(p.layout ?? ''), cols, rows);

  const wall = Number(p.wall);
  const floor = Number(p.floor);
  const stackable = p.stackable === true;
  const lipH = stackable ? Number(p.lipHeight) : 0;
  const footInset = wall + STACK_CLEAR;

  const tray = p.tray === true;
  // The bins' footprint where they meet the tray: a stacking bin stands on
  // its stepped-in foot, so its pocket -- and the ribs between pockets -- are
  // that much further in.
  const footStep = stackable ? footInset : 0;
  const margin = tray ? Math.max(0, TRAY_RIM + POCKET_CLEAR - footStep) : 0;
  const gap = tray
    ? Math.max(Number(p.binGap), TRAY_RIB + 2 * POCKET_CLEAR - 2 * footStep)
    : Number(p.binGap);

  // The fit gap comes off the whole set, then the bins share what is left.
  const trayW = drawerW - fit;
  const trayD = drawerD - fit;
  const cellW = (trayW - 2 * margin - (cols - 1) * gap) / cols;
  const cellD = (trayD - 2 * margin - (rows - 1) * gap) / rows;

  const trayBase = tray ? Number(p.trayBase) : 0;
  // A stacking bin's walls slope out just above its foot, so a pocket wall
  // taller than the foot would catch that slope and hold the bin up.
  const trayWall = tray ? (stackable ? Math.min(Number(p.trayWall), lipH) : Number(p.trayWall)) : 0;
  const binZ = trayBase;
  const binH = drawerH - Number(p.headroom) - trayBase;
  const corner = Math.max(0, Math.min(Number(p.corner), Math.min(cellW, cellD) / 2 - 0.5));

  const labelTop = binH - (stackable ? lipH + 0.5 : 0.8);
  const bedX = Number(p.bedX);
  const bedY = Number(p.bedY);

  // --- where the tray is cut so each piece fits the bed
  const spansX = layout.bins.filter((b) => b.w > 1).map((b) => [b.col, b.col + b.w] as const);
  const spansY = layout.bins.filter((b) => b.h > 1).map((b) => [b.row, b.row + b.h] as const);
  const sx = tray
    ? splitAxis(trayW, margin, cellW, gap, cols, bedX - KNOB_REACH - 1, spansX)
    : { cuts: [-trayW / 2, trayW / 2], ok: true };
  const sy = tray
    ? splitAxis(trayD, margin, cellD, gap, rows, bedY - KNOB_REACH - 1, spansY)
    : { cuts: [-trayD / 2, trayD / 2], ok: true };
  const splitError =
    sx.ok && sy.ok
      ? null
      : `A single ${sx.ok ? 'row' : 'column'} of the tray is wider than your bed can take in one piece. Use more ${sx.ok ? 'rows' : 'columns'}, or turn the tray off.`;

  return {
    drawerW, drawerD, drawerH,
    cols, rows, layout, gap, cellW, cellD, margin,
    binH, corner, wall, floor,
    stackable, lipH, footInset,
    labelTab: p.labelTab === true,
    labelDepth: Number(p.labelDepth),
    labelTop,
    scoop: p.scoop === true,
    scoopRadius: Number(p.scoopRadius),
    tray, trayW, trayD, trayBase, trayWall, binZ,
    jointClear: Number(p.jointClearance),
    cutsX: sx.cuts,
    cutsY: sy.cuts,
    splitError,
    bedX, bedY,
  };
}

/**
 * Where to cut one axis of the tray.
 *
 * Cuts only ever fall in the gap between two columns (or rows), down the
 * middle of a rib, where the tray is full height and a joint has something to
 * grip. Gaps that a merged bin spans are avoided when possible -- a cut there
 * runs under the bin through nothing but floor. The pieces are kept as even
 * as the gaps allow, rather than filling the bed and leaving a sliver at the end.
 */
function splitAxis(
  length: number,
  margin: number,
  cell: number,
  gap: number,
  n: number,
  maxPiece: number,
  spans: readonly (readonly [number, number])[],
): { cuts: number[]; ok: boolean } {
  const start = -length / 2;
  const end = length / 2;
  if (length <= maxPiece) return { cuts: [start, end], ok: true };

  const gaps: { at: number; crossed: boolean }[] = [];
  for (let k = 1; k < n; k++) {
    gaps.push({
      at: start + margin + k * cell + (k - 0.5) * gap,
      crossed: spans.some(([a, b]) => a < k && k < b),
    });
  }

  const pieces = Math.ceil(length / maxPiece);
  const cuts = [start];
  for (let k = 1; k < pieces; k++) {
    const prev = cuts[cuts.length - 1]!;
    const target = start + (k * length) / pieces;
    const reachable = gaps.filter((g) => g.at > prev + 1 && g.at - prev <= maxPiece);
    if (reachable.length === 0) return { cuts: [start, end], ok: false };
    const score = (g: { at: number; crossed: boolean }) =>
      Math.abs(g.at - target) + (g.crossed ? length : 0);
    cuts.push(reachable.reduce((best, g) => (score(g) < score(best) ? g : best)).at);
  }
  // The even split can still leave the last piece too long; keep cutting.
  while (end - cuts[cuts.length - 1]! > maxPiece) {
    const prev = cuts[cuts.length - 1]!;
    const reachable = gaps.filter((g) => g.at > prev + 1 && g.at - prev <= maxPiece);
    if (reachable.length === 0) return { cuts: [start, end], ok: false };
    const best = reachable.filter((g) => !g.crossed);
    cuts.push((best.length > 0 ? best : reachable).reduce((a, b) => (b.at > a.at ? b : a)).at);
  }
  cuts.push(end);
  return { cuts, ok: true };
}

/**
 * The trimmed scoop and label tab for one bin size. A scoop bigger than the
 * bin is shallow or short turns into a ramp that eats the compartment, and a
 * tab must not reach the floor, so both are fitted to the bin they are in.
 */
export function binExtras(d: Derived, size: BinSize): { scoopR: number; labelD: number } {
  const innerD = size.d - 2 * d.wall;
  const innerH = d.binH - d.floor;
  const labelD = d.labelTab
    ? Math.max(0, Math.min(d.labelDepth, innerD / 2, d.labelTop - LABEL_T - d.floor - 1))
    : 0;
  const scoopR = d.scoop
    ? Math.max(0, Math.min(d.scoopRadius, innerH * 0.6, innerD * (d.labelTab ? 0.4 : 0.5)))
    : 0;
  return { scoopR, labelD };
}
