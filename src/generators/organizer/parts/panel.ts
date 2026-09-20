import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { roundedRect } from '../../../core/kernel/primitives';
import { wallSlot } from '../dock';
import { cableGrooveH, standBay, type Derived } from '../geometry';

/**
 * The back panel: the plate stood up, for the wall form.
 *
 * Same object as the base plate, doing the same job through ninety degrees. The
 * modules do not change at all -- a tray is still a tray with a floor and four
 * walls -- only where their dovetail is: under them for a plate, behind them
 * for a panel. That is the whole of the wall form, and it is why the modules
 * needed nothing rewritten.
 *
 * Bays run UP it rather than across, each still exactly as wide as the thing it
 * holds and centred on the board.
 *
 * The panel is the front face of the assembly: it stands at the BACK of the
 * depth, at y = D/2, with everything cantilevered forward off it. Printed flat
 * on its back, slots facing the sky.
 */

/** Keyhole slots, so it goes on two screws already in the wall. */
function keyholes(m: ManifoldToplevel, d: Derived): Manifold {
  const headD = 8;
  const shankD = 4;
  const drop = 10;
  const x = Math.min(d.W / 2 - d.margin - headD / 2, d.W * 0.3);
  const z = d.panelH - d.margin / 2 - headD / 2;
  return m.Manifold.union(
    [-1, 1].flatMap((s) => [
      // The wide end the screw head goes through...
      m.Manifold.cylinder(d.panelT + 2, headD / 2, headD / 2, 32)
        .rotate([-90, 0, 0])
        .translate([s * x, d.D / 2 - 1, z]),
      // ...and the narrow slot it hangs down into.
      m.Manifold.cube([shankD, d.panelT + 2, drop], true)
        .translate([s * x, d.D / 2 + d.panelT / 2, z - drop / 2]),
      m.Manifold.cylinder(d.panelT + 2, shankD / 2, shankD / 2, 24)
        .rotate([-90, 0, 0])
        .translate([s * x, d.D / 2 - 1, z - drop]),
    ]),
  );
}

/**
 * A hole for the charger cable, behind wherever the stand ended up.
 *
 * On a desk the lead goes down through the plate and out under it; on a wall
 * there is no under, so it goes straight through the board and down the back.
 */
function cableHole(m: ManifoldToplevel, d: Derived): Manifold | null {
  const bay = standBay(d);
  if (!bay || !d.wireless) return null;
  const h = cableGrooveH(d);
  return m.Manifold.cube([d.cableW + 2 * d.clear, d.panelT + 4, h + 2 * d.clear], true).translate([
    bay.cx,
    d.D / 2 + d.panelT / 2,
    bay.cz + h / 2,
  ]);
}

export function buildPanel(m: ManifoldToplevel, d: Derived): Manifold {
  // Drawn in XZ and stood up, because the panel's own plane is the one the
  // outline lives in -- a rounded rectangle extruded backward through its
  // thickness, exactly as the base plate is a rounded rectangle extruded up.
  let solid = m.Manifold.extrude(roundedRect(m, d.W, d.panelH, Math.max(0.5, d.corner)), d.panelT)
    .rotate([90, 0, 0])
    .translate([0, d.D / 2 + d.panelT, d.panelH / 2]);

  for (const bay of d.bays) solid = solid.subtract(wallSlot(m, d, bay));
  solid = solid.subtract(keyholes(m, d));

  const hole = cableHole(m, d);
  if (hole) solid = solid.subtract(hole);

  return solid;
}
