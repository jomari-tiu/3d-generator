import type { Vec2 } from '../text/flatten';
import { circle, latticeRange, ngon, rect, stadium } from './geom';
import type { GridKind, HoleKind, Rings } from './types';

export interface HoleOptions {
  readonly kind: HoleKind;
  readonly grid: GridKind;
  /** Centre-to-centre spacing between nearest neighbours. */
  readonly cell: number;
  /** Material left between neighbouring holes. */
  readonly gap: number;
  /** Slot length as a multiple of the pitch. */
  readonly aspect: number;
  readonly radius: number;
  readonly tolerance: number;
}

/**
 * A perforation grid, sized so that `gap` is the WALL between neighbours.
 *
 * Straight and staggered use the same `cell` and get the same wall, which only
 * works because the row spacing changes with the grid: on a staggered grid the
 * nearest neighbour is diagonal, not vertical, so rows close up to
 * cell * sqrt(3)/2 to keep that diagonal distance at `cell`. Reusing the
 * straight row spacing would quietly leave a staggered sheet with thicker walls
 * than asked for and less open area than the readout claims.
 */
export function perforation(o: HoleOptions): Rings {
  const out: Rings = [];
  const size = Math.max(0.05, o.cell - o.gap);
  const staggered = o.grid === 'staggered';

  const isSlot = o.kind === 'slot';
  const slotLength = Math.max(size, o.cell * Math.max(1, o.aspect));
  const pitchX = isSlot ? slotLength + o.gap : o.cell;
  const pitchY = staggered ? (o.cell * Math.sqrt(3)) / 2 : o.cell;

  const ri = latticeRange(o.radius, pitchX) + 1;
  const rj = latticeRange(o.radius, pitchY) + 1;
  const keep = o.radius + Math.max(pitchX, pitchY);

  for (let j = -rj; j <= rj; j++) {
    const y = j * pitchY;
    const offset = staggered && (j & 1) !== 0 ? pitchX / 2 : 0;
    for (let i = -ri; i <= ri; i++) {
      const x = i * pitchX + offset;
      if (Math.hypot(x, y) > keep) continue;
      out.push(hole(o, x, y, size, slotLength));
    }
  }
  return out;
}

function hole(o: HoleOptions, x: number, y: number, size: number, slotLength: number): Vec2[] {
  switch (o.kind) {
    case 'round':
      return circle(x, y, size / 2, o.tolerance);
    case 'square':
      return rect(x, y, size, size);
    case 'hex':
      // Across-flats is the size, so a hex hole and a round hole of the same
      // number leave the same wall at their closest approach.
      return ngon(x, y, size / Math.sqrt(3), 6, 90);
    case 'slot':
      return stadium(x, y, slotLength, size, o.tolerance);
  }
}
