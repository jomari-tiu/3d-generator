import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { roundedRect } from '../../../core/kernel/primitives';
import { GRID_PITCH, GRID_PLATE_H, type Derived } from '../geometry';

/**
 * A Gridfinity baseplate that drops into the drawer.
 *
 * As many whole 42 mm cells as the tray fits, in a frame with no bottom: the
 * standard baseplate profile is a socket the bins' feet sit down into -- a 45
 * degree lead-in, a vertical section, and a wider 45 degree mouth at the top --
 * and that is all it is. Loose in the tray, so it lifts out.
 */

function socket(m: ManifoldToplevel): Manifold {
  // From the bottom up: 35.8 -> 37.2 over 0.7, straight for 1.8, 37.2 -> 41.5
  // over 2.15. Corner radii follow the bins' feet.
  const sec = (w: number, r: number, z: number) => m.Manifold.extrude(roundedRect(m, w, w, r), 0.02).translate([0, 0, z]);
  const lower = m.Manifold.hull([sec(35.8, 0.8, -0.02), sec(37.2, 1.6, 0.7)]);
  const mid = m.Manifold.extrude(roundedRect(m, 37.2, 37.2, 1.6), 1.8 + 0.02).translate([0, 0, 0.69]);
  const upper = m.Manifold.hull([sec(37.2, 1.6, 2.49), sec(41.5, 3.75, GRID_PLATE_H + 0.02)]);
  return m.Manifold.union([lower, mid, upper]);
}

export function buildGridPlate(m: ManifoldToplevel, d: Derived): Manifold | null {
  if (d.insert !== 'gridfinity' || d.gridCols < 1 || d.gridRows < 1) return null;
  const w = d.gridCols * GRID_PITCH;
  const l = d.gridRows * GRID_PITCH;
  const plate = m.Manifold.extrude(roundedRect(m, w, l, 4), GRID_PLATE_H);
  const cells: Manifold[] = [];
  for (let i = 0; i < d.gridCols; i++) {
    for (let j = 0; j < d.gridRows; j++) {
      cells.push(socket(m).translate([-w / 2 + GRID_PITCH * (i + 0.5), -l / 2 + GRID_PITCH * (j + 0.5), 0]));
    }
  }
  const yc = (d.boxFrontY + d.boxBackY) / 2;
  return plate.subtract(m.Manifold.union(cells)).translate([0, yc, d.boxZ + d.slabT]);
}
