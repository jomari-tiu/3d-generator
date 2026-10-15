import type { Params } from '../../core/params/types';

export type ShapeId = 'hexagon' | 'square' | 'diamond' | 'triangle' | 'octagon';
export type ModuleType = 'wall' | 'shelf' | 'frame';
export type Vec2 = readonly [number, number];

/** One edge of a cell outline, in the cell's own frame. */
export interface Edge {
  readonly mid: Vec2;
  /** Outward normal, radians. */
  readonly angle: number;
  readonly length: number;
  /** Another cell meets this face. */
  readonly shared: boolean;
}

/**
 * One module in the cluster.
 *
 * The outline is centred on its centroid, which for a regular polygon is also
 * the centre of every inset of it -- so the chamfered rim can be made by
 * SCALING the opening about the origin and still come out an even width.
 */
export interface Cell {
  readonly index: number;
  /** Centroid in the wall plane: x across, y up. */
  readonly cx: number;
  readonly cy: number;
  /** Triangles alternate; the point-down ones are a different printed part. */
  readonly flipped: boolean;
  readonly verts: readonly Vec2[];
  readonly edges: readonly Edge[];
}

export const SHAPES: Record<ShapeId, { label: string; apothem: (h: number) => number }> = {
  hexagon: { label: 'Hexagon', apothem: (h) => h / 2 },
  square: { label: 'Square', apothem: (h) => h / 2 },
  diamond: { label: 'Diamond', apothem: (h) => h / (2 * Math.SQRT2) },
  triangle: { label: 'Triangle', apothem: (h) => h / 3 },
  octagon: { label: 'Octagon', apothem: (h) => h / 2 },
};

const SQRT3 = Math.sqrt(3);

/** Outline of one cell `h` tall, centred on its centroid, counter-clockwise. */
export function outline(shape: ShapeId, h: number, flipped = false): Vec2[] {
  let pts: Vec2[];
  switch (shape) {
    case 'square':
      pts = [[-h / 2, -h / 2], [h / 2, -h / 2], [h / 2, h / 2], [-h / 2, h / 2]];
      break;
    case 'diamond':
      pts = [[0, -h / 2], [h / 2, 0], [0, h / 2], [-h / 2, 0]];
      break;
    case 'hexagon': {
      // Flat top and bottom, so every module has a level floor to stand things on.
      const r = h / SQRT3;
      pts = Array.from({ length: 6 }, (_, k) => [r * Math.cos((k * Math.PI) / 3), r * Math.sin((k * Math.PI) / 3)] as Vec2);
      break;
    }
    case 'triangle': {
      const s = (2 * h) / SQRT3;
      pts = [[-s / 2, -h / 3], [s / 2, -h / 3], [0, (2 * h) / 3]];
      if (flipped) pts = pts.map(([x, y]) => [x, -y] as Vec2).reverse();
      break;
    }
    case 'octagon': {
      const r = h / (2 * Math.cos(Math.PI / 8));
      pts = Array.from({ length: 8 }, (_, k) => {
        const a = Math.PI / 8 + (k * Math.PI) / 4;
        return [r * Math.cos(a), r * Math.sin(a)] as Vec2;
      });
      break;
    }
  }
  return pts;
}

/** Lattice position of cell (i, j) -- column i, row j -- and its parity. */
function place(shape: ShapeId, h: number, i: number, j: number): { x: number; y: number; flipped: boolean } {
  switch (shape) {
    case 'square':
    case 'octagon':
      // Octagons meet on their flat faces and leave a small square gap between
      // four of them -- the classic tiling, without the filler squares.
      return { x: i * h, y: j * h, flipped: false };
    case 'diamond':
      return { x: i * h + ((j % 2) * h) / 2, y: (j * h) / 2, flipped: false };
    case 'hexagon': {
      const r = h / SQRT3;
      return { x: i * 1.5 * r, y: j * h + ((i % 2) * h) / 2, flipped: false };
    }
    case 'triangle': {
      const s = (2 * h) / SQRT3;
      const down = (i + j) % 2 === 1;
      return { x: (i * s) / 2, y: j * h + (down ? (2 * h) / 3 : h / 3), flipped: down };
    }
  }
}

const key = (x: number, y: number) => `${Math.round(x * 100)},${Math.round(y * 100)}`;

/**
 * Every cell of a columns x rows cluster, shifted so the cluster is centred
 * left to right and its lowest point sits on y = 0.
 *
 * Shared faces are found by matching edge midpoints: in an edge-to-edge tiling
 * two cells meet on a face exactly when they share its midpoint, whatever the
 * shape.
 */
export function cluster(shape: ShapeId, h: number, cols: number, rows: number): Cell[] {
  const raw = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const at = place(shape, h, i, j);
      raw.push({ ...at, verts: outline(shape, h, at.flipped) });
    }
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity;
  for (const c of raw) {
    for (const [vx, vy] of c.verts) {
      minX = Math.min(minX, c.x + vx);
      maxX = Math.max(maxX, c.x + vx);
      minY = Math.min(minY, c.y + vy);
    }
  }
  const dx = -(minX + maxX) / 2;
  const dy = -minY;

  const seen = new Map<string, number>();
  for (const c of raw) {
    c.verts.forEach(([ax, ay], k) => {
      const [bx, by] = c.verts[(k + 1) % c.verts.length]!;
      const id = key(c.x + (ax + bx) / 2, c.y + (ay + by) / 2);
      seen.set(id, (seen.get(id) ?? 0) + 1);
    });
  }

  return raw.map((c, index) => ({
    index,
    cx: c.x + dx,
    cy: c.y + dy,
    flipped: c.flipped,
    verts: c.verts,
    edges: c.verts.map(([ax, ay], k) => {
      const [bx, by] = c.verts[(k + 1) % c.verts.length]!;
      const mid: Vec2 = [(ax + bx) / 2, (ay + by) / 2];
      return {
        mid,
        // CCW outline: the outward normal is the edge direction turned clockwise.
        angle: Math.atan2(-(bx - ax), by - ay),
        length: Math.hypot(bx - ax, by - ay),
        shared: (seen.get(key(c.x + mid[0], c.y + mid[1])) ?? 0) > 1,
      };
    }),
  }));
}

export interface Derived {
  readonly type: ModuleType;
  readonly shape: ShapeId;
  readonly cols: number;
  readonly rows: number;
  readonly modular: boolean;
  readonly h: number;
  readonly depth: number;
  readonly wall: number;
  readonly corner: number;
  /** Back panel thickness, 0 when the back is open. */
  readonly back: number;
  readonly rim: number;
  readonly mount: 'keyhole' | 'screw' | 'none';
  readonly border: number;
  readonly rebate: number;
  readonly backer: number;
  readonly connector: 'pins' | 'bolts' | 'none';
  readonly holeD: number;
  readonly pinD: number;
  readonly pinLength: number;
  readonly clear: number;
  readonly nozzle: number;
  readonly layer: number;
  /** Apothem of the outside outline, and of the opening. */
  readonly apothem: number;
  readonly innerApothem: number;
  /** Heights along the depth at which each shared face is joined. */
  readonly joinAt: readonly number[];
  readonly cells: readonly Cell[];
  readonly sharedFaces: number;
  readonly width: number;
  readonly height: number;
}

export const M3_CLEAR = 3.4;

export function derive(p: Params): Derived {
  const type = String(p.moduleType) as ModuleType;
  const shape = String(p.shape) as ShapeId;
  const cols = Math.round(Number(p.columns));
  const rows = Math.round(Number(p.rows));
  const h = Number(p.cellHeight);
  const depth = Number(p.depth);
  const wall = Number(p.wall);
  const modular = String(p.joinMode) === 'modules';
  const clear = Number(p.clearance);
  const back = type === 'wall' || (type === 'shelf' && p.backPanel === true) ? Number(p.backThickness) : 0;
  const rim = type === 'frame' ? 0 : Number(p.frontRim);
  const backer = type === 'frame' && p.backer === true ? Number(p.backerThickness) : 0;
  const connector = modular ? (String(p.connector) as Derived['connector']) : 'none';
  const pinD = Number(p.pinDiameter);
  const holeD = connector === 'bolts' ? M3_CLEAR : pinD + clear;
  const apothem = SHAPES[shape].apothem(h);

  // Joins sit in the plain stretch of wall: clear of the back panel and the
  // rim at the front, one in the middle of a shallow module, two further apart
  // on a deep one so a joined pair cannot hinge.
  const lo = back + holeD / 2 + 1.5;
  const hi = depth - rim - holeD / 2 - 1.5;
  const joinAt = hi < lo ? [] : hi - lo > 2.5 * holeD + 20 ? [lo + (hi - lo) * 0.15, hi - (hi - lo) * 0.15] : [(lo + hi) / 2];

  const cells = cluster(shape, h, cols, rows);
  let sharedFaces = 0;
  for (const c of cells) for (const e of c.edges) if (e.shared) sharedFaces++;
  sharedFaces /= 2;

  let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of cells) {
    for (const [vx, vy] of c.verts) {
      minX = Math.min(minX, c.cx + vx);
      maxX = Math.max(maxX, c.cx + vx);
      maxY = Math.max(maxY, c.cy + vy);
    }
  }

  return {
    type,
    shape,
    cols,
    rows,
    modular,
    h,
    depth,
    wall,
    corner: Number(p.cornerRadius),
    back,
    rim,
    mount: type === 'shelf' || (type === 'frame' && backer === 0) ? 'none' : (String(p.mount) as Derived['mount']),
    border: Number(p.border),
    rebate: Number(p.rebate),
    backer,
    connector,
    holeD,
    pinD,
    // Spans both walls of a joined pair, less a little so it never stands proud
    // of the inside face.
    pinLength: 2 * wall - 0.6,
    clear,
    nozzle: Number(p.nozzle),
    layer: Number(p.layer),
    apothem,
    innerApothem: apothem - wall,
    joinAt,
    cells,
    sharedFaces,
    width: maxX - minX,
    height: maxY,
  };
}

/** Footprint of one module across the wall, for the bed check. */
export function cellSpan(d: Derived): { w: number; h: number } {
  const v = outline(d.shape, d.h);
  const xs = v.map(([x]) => x);
  const ys = v.map(([, y]) => y);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
