import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { roundedRect, taperedExtrude } from '../../../core/kernel/primitives';
import { ledgeTongue } from '../dock';
import { flutes, partitions } from './modules';
import type { Derived } from '../geometry';

/**
 * The front tray: a long shallow tray across the FRONT of the plate, on the
 * ledge the plate grew for it.
 *
 * A module, not a feature of the plate. That is the whole difference between
 * this and the groove, which is the other thing the front ledge can carry: a
 * groove is machined into the plate and whatever is in it stays there, while
 * this lifts off to be tipped out, prints as its own part in its own colour,
 * and can be left off entirely without changing the plate under it.
 *
 * It is not a BAY module either, and could not be. Every bay runs the full
 * depth of the plate and they are laid out left to right across it; this runs
 * the full WIDTH and sits in front of all of them, so it hangs on the same
 * joint the back wall uses -- a dovetail across the ledge rather than one
 * along a bay.
 *
 * Shallow on purpose. Deep enough and it is a second row of modules, which is
 * a different object; at fifteen millimetres it is somewhere to sweep a pen, a
 * stylus and a paperclip without any of them being out of sight.
 */

/** Everything the tray is, in one place, so the shell and the pocket agree. */
function box(d: Derived) {
  const w = d.W - 2 * d.margin - 2 * d.clear;
  const dep = d.frontD - 2 * d.clear;
  return { w, dep, h: d.frontTrayH, r: Math.max(0.5, Math.min(d.corner, dep / 2 - 0.5)) };
}

export function buildFrontTray(m: ManifoldToplevel, d: Derived): Manifold | null {
  if (d.frontLedge !== 'tray') return null;
  const { w, dep, h, r } = box(d);
  if (w <= 2 * d.wall || dep <= 2 * d.wall || h <= d.wall) return null;

  // The same bottom chamfer as every other module and as the plate itself.
  // One number everywhere is what makes a set of parts read as a set.
  const c = Math.min(d.chamfer, h / 3);
  const lower = taperedExtrude(
    m,
    roundedRect(m, w - 2 * c, dep - 2 * c, Math.max(0.5, r - c)),
    c,
    w / (w - 2 * c),
    dep / (dep - 2 * c),
  );
  const upper = m.Manifold.extrude(roundedRect(m, w, dep, r), h - c).translate([0, 0, c]);
  const shell = lower.add(upper).translate([0, d.frontY, d.baseT]);

  const pocket = m.Manifold.extrude(
    roundedRect(m, w - 2 * d.wall, dep - 2 * d.wall, Math.max(0.5, r - d.wall)),
    h,
  ).translate([0, d.frontY, d.baseT + d.wall]);

  let tray = shell.subtract(pocket);

  // The same fluting the bay modules get, on the one other box in the set.
  const fl = flutes(m, d, { cx: 0, cy: d.frontY, cz: d.baseT, w, dp: dep, h });
  if (fl) tray = tray.subtract(fl);

  // Partitions across its length only. It runs the plate's width and is
  // shallow, so dividing it the other way gives two strips too narrow to put
  // anything in -- which `partitions` would refuse anyway.
  const p = partitions(
    m,
    d,
    {
      cx: 0,
      cy: d.frontY,
      floor: d.baseT + d.wall,
      w: w - 2 * d.wall,
      dp: dep - 2 * d.wall,
      h,
    },
    d.frontTrayDiv,
    0,
  );
  if (p) tray = tray.add(p);

  // A tongue only where there is still a slot to slide it into. On a desk the
  // tray is part of the plate and a rail under it would be a rail into itself.
  return d.form === 'wall' ? tray.add(ledgeTongue(m, d, d.frontY)) : tray;
}

/** How tall it stands, for the readouts and for checking the bed. */
export function frontTrayHeight(d: Derived): number {
  return d.frontLedge === 'tray' ? d.frontTrayH : 0;
}
