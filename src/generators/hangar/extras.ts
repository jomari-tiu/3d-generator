import type { ClawSpec } from '../shared/claw';
import type { StairSpec } from '../shared/stairs';
import { ceilingGrid } from './ceiling';
import { DOOR_LAP, type Derived } from './geometry';

/**
 * Where the shared stair tower and ceiling claw go in the hangar.
 *
 * The stair tower stands against the back wall, right of the door: clear of
 * the door's opening and of the beam over it, in front of the track the
 * leaves slide in, and in from the right wall past its relief.
 */
export function stairBounds(d: Derived): { minX: number; maxX: number; yBack: number } {
  const header = d.door && d.header ? Math.min(d.doorW / 2 + 12, -d.xl0 - 4) + 2 : -Infinity;
  const opening = d.door ? d.doorW / 2 + DOOR_LAP + 2 : -Infinity;
  return {
    minX: Math.max(header, opening, d.xl1 + (d.catwalk ? d.cd : 0) + 2),
    maxX: d.bayRight - 2.5,
    yBack: d.door ? d.yb0 - d.trackDepth - 1 : d.yb0 - 2,
  };
}

/**
 * The stair tower, as wide as asked or as the space beside the door allows,
 * whichever is less: adding the right wall or widening the door should not
 * turn a working stair into an error.
 */
export function hangarStairSpec(d: Derived, span: number, height: number, scale: number): StairSpec {
  const b = stairBounds(d);
  const width = Math.min(span, b.maxX - b.minX);
  return {
    x0: b.maxX - width,
    x1: b.maxX,
    yBack: b.yBack,
    zFloor: d.floorZ,
    sillDepth: d.slotD,
    height,
    scale,
    fit: d.fit,
  };
}

/**
 * The claw hangs from one of the beams along the top of the ceiling: the one
 * nearest the middle of the bay, between the two trusses either side of it.
 */
export function hangarClawSpec(d: Derived, drop: number): ClawSpec {
  const g = ceilingGrid(d);
  const mid = (d.xl1 + d.bayRight) / 2;
  const bx = g.beams.length > 0 ? g.beams.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a)) : mid;
  const lines = [g.edges.y0, ...g.across, g.edges.y1];
  let y = 0;
  for (let i = 0; i + 1 < lines.length; i++) {
    if (lines[i]! <= 0 && 0 <= lines[i + 1]!) y = (lines[i]! + lines[i + 1]!) / 2;
  }
  return {
    barX: bx,
    barZ: g.ztop - g.beamH / 2,
    barW: g.beamW,
    barH: g.beamH,
    y,
    drop,
    c: d.c,
    pinD: d.printedPins ? 1.6 : 1.75,
  };
}
