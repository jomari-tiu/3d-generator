import type { Params } from '../../core/params/types';

/** Clearance between a stacked bin's foot and the opening it drops into. */
export const STACK_CLEAR = 0.25;
/** Thickness of the label tab's front edge, above its sloped underside. */
export const LABEL_T = 1.2;

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
  /** Gap between neighbouring bins. */
  readonly gap: number;
  /** One grid cell. A bin spanning cells covers the gaps between them too. */
  readonly cellW: number;
  readonly cellD: number;
  /** The whole set of bins: the drawer less the fit gap. */
  readonly setW: number;
  readonly setD: number;

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

  // --- connectors
  /** Clips joining neighbouring bins, dropped in over their rims. */
  readonly connectors: boolean;
  /** Width of a clip along the edge it bridges. */
  readonly clipW: number;
  /** Thickness of a clip's bar and legs. */
  readonly clipT: number;
  /** How far a clip's legs hang down inside the bins. */
  readonly clipLeg: number;
  /** Gap round a clip in its notches. */
  readonly clipClear: number;

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
  const left = -d.setW / 2;
  const front = -d.setD / 2;
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

  const gap = Number(p.binGap);

  // The fit gap comes off the whole set, then the bins share what is left.
  const setW = drawerW - fit;
  const setD = drawerD - fit;
  const cellW = (setW - (cols - 1) * gap) / cols;
  const cellD = (setD - (rows - 1) * gap) / rows;

  const binH = drawerH - Number(p.headroom);
  const corner = Math.max(0, Math.min(Number(p.corner), Math.min(cellW, cellD) / 2 - 0.5));

  const labelTop = binH - (stackable ? lipH + 0.5 : 0.8);
  const bedX = Number(p.bedX);
  const bedY = Number(p.bedY);

  return {
    drawerW, drawerD, drawerH,
    cols, rows, layout, gap, cellW, cellD, setW, setD,
    binH, corner, wall, floor,
    stackable, lipH, footInset,
    labelTab: p.labelTab === true,
    labelDepth: Number(p.labelDepth),
    labelTop,
    scoop: p.scoop === true,
    scoopRadius: Number(p.scoopRadius),
    connectors: p.connectors === true,
    clipW: Number(p.clipWidth ?? 8),
    clipT: Number(p.clipThickness ?? 2),
    clipLeg: Number(p.clipLeg ?? 6),
    clipClear: Number(p.clipClearance ?? 0.2),
    bedX, bedY,
  };
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
