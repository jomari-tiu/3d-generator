import type { Vec2 } from '../text/flatten';
import { ccw, insetConvex, latticeRange, ngon, rect } from './geom';
import type { Rings, TilingKind } from './types';

export interface TilingOptions {
  readonly kind: TilingKind;
  /** Pitch. Hex across-flats, triangle side, square side, brick length. */
  readonly cell: number;
  /** Clear space between tiles. Half of it is taken off every tile. */
  readonly gap: number;
  /** Second axis where the tiling has one: brick height as a fraction of its length. */
  readonly aspect: number;
  readonly radius: number;
}

/**
 * Tiles are generated at FULL size and then inset by half the gap each.
 *
 * Inset rather than shrunk about the centre: scaling is only the same thing for
 * a shape whose edges are all the same distance from the centre, so it is right
 * for a hexagon and wrong for every brick -- a 40x10 brick scaled to leave 1mm
 * at the ends leaves 0.25mm at the sides. Insetting gives one honest number the
 * user can read as "web thickness" whatever tiling is selected.
 */
export function tiling(o: TilingOptions): Rings {
  const out: Rings = [];
  const d = Math.max(0, o.gap) / 2;
  const keep = o.radius + o.cell * 2;
  const push = (poly: Vec2[]): void => {
    if (poly.length < 3) return;
    let cx = 0;
    let cy = 0;
    for (const [x, y] of poly) {
      cx += x;
      cy += y;
    }
    if (Math.hypot(cx / poly.length, cy / poly.length) > keep) return;
    const inset = insetConvex(ccw(poly), d);
    if (inset.length >= 3) out.push(inset);
  };

  switch (o.kind) {
    case 'hex': {
      // Pointy-top: across-flats is the horizontal pitch, which is the number
      // a user measures off a grille with a ruler.
      const across = o.cell;
      const R = across / Math.sqrt(3);
      const rowStep = 1.5 * R;
      const ri = latticeRange(o.radius, across);
      const rj = latticeRange(o.radius, rowStep);
      for (let j = -rj; j <= rj; j++) {
        const offset = (j & 1) === 0 ? 0 : across / 2;
        for (let i = -ri; i <= ri; i++) {
          push(ngon(i * across + offset, j * rowStep, R, 6, 90));
        }
      }
      break;
    }

    case 'triangle': {
      const s = o.cell;
      const h = (s * Math.sqrt(3)) / 2;
      const ri = latticeRange(o.radius, s);
      const rj = latticeRange(o.radius, h);
      for (let j = -rj; j <= rj; j++) {
        const y0 = j * h;
        const offset = (j & 1) === 0 ? 0 : s / 2;
        for (let i = -ri; i <= ri; i++) {
          const x = i * s + offset;
          // A row of height h is exactly tiled by alternating up and down
          // triangles; the row offset is only there for the classic look.
          push([
            [x, y0],
            [x + s, y0],
            [x + s / 2, y0 + h],
          ]);
          push([
            [x + s / 2, y0 + h],
            [x + (3 * s) / 2, y0 + h],
            [x + s, y0],
          ]);
        }
      }
      break;
    }

    case 'square': {
      const s = o.cell;
      const r = latticeRange(o.radius, s);
      for (let j = -r; j <= r; j++) {
        for (let i = -r; i <= r; i++) push(rect(i * s, j * s, s, s));
      }
      break;
    }

    case 'diamond': {
      // A square turned 45 degrees, on the lattice its own half-diagonals make.
      const s = o.cell;
      const half = s / 2;
      const r = latticeRange(o.radius, half) + 1;
      for (let j = -r; j <= r; j++) {
        for (let i = -r; i <= r; i++) {
          if (((i + j) & 1) !== 0) continue;
          const cx = (i * s) / 2;
          const cy = (j * s) / 2;
          push([
            [cx + half, cy],
            [cx, cy + half],
            [cx - half, cy],
            [cx, cy - half],
          ]);
        }
      }
      break;
    }

    case 'brick': {
      const w = o.cell;
      const h = o.cell * o.aspect;
      const ri = latticeRange(o.radius, w) + 1;
      const rj = latticeRange(o.radius, h);
      for (let j = -rj; j <= rj; j++) {
        const offset = (j & 1) === 0 ? 0 : w / 2;
        for (let i = -ri; i <= ri; i++) push(rect(i * w + offset, j * h, w, h));
      }
      break;
    }

    case 'basketweave': {
      // Pairs of half-length bricks, alternating direction on a checkerboard.
      const L = o.cell;
      const W = L / 2;
      const r = latticeRange(o.radius, L) + 1;
      for (let j = -r; j <= r; j++) {
        for (let i = -r; i <= r; i++) {
          const cx = i * L;
          const cy = j * L;
          if (((i + j) & 1) === 0) {
            push(rect(cx, cy - W / 2, L, W));
            push(rect(cx, cy + W / 2, L, W));
          } else {
            push(rect(cx - W / 2, cy, W, L));
            push(rect(cx + W / 2, cy, W, L));
          }
        }
      }
      break;
    }

    case 'herringbone': {
      // Herringbone only closes up when the brick is exactly twice as long as
      // it is wide, so the length is the control and the width follows. On the
      // lattice (3W, W) and (-W, W) the cell area is 4W^2 and holds exactly the
      // two bricks below -- it tiles with no gaps and no overlaps, which the
      // test suite checks by area rather than by eye.
      const L = o.cell;
      const W = L / 2;
      const r = latticeRange(o.radius, W) + 2;
      for (let j = -r; j <= r; j++) {
        for (let i = -r; i <= r; i++) {
          const ox = i * 3 * W - j * W;
          const oy = i * W + j * W;
          push(rect(ox + W, oy + W / 2, L, W));
          push(rect(ox + 2.5 * W, oy + W, W, L));
        }
      }
      break;
    }
  }

  return out;
}
