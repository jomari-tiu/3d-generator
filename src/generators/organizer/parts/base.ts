import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { roundedRect, slot, taperedExtrude } from '../../../core/kernel/primitives';
import { dockSlot, ledgeSlot, seatTray } from '../dock';
import { buildFrontTray } from './fronttray';
import { buildModule } from './modules';
import { cableDropY, leadBore, passDropY, standBay, type Derived } from '../geometry';

/**
 * The plate everything stands on.
 *
 * Printed flat, top face up: the dovetail slots then face the sky and the only
 * overhang on the whole part is the chamfer round the bottom, which is a
 * chamfer precisely so it is not an overhang.
 */

/**
 * Rounded outline, at an inset.
 *
 * `plateD`, not `D`: a pen rail makes the plate deeper than the modules on it,
 * and `plateY` is where that deeper rectangle sits -- grown forward only, so
 * every module, dovetail and cable hole stays exactly where it was.
 */
const outline = (m: ManifoldToplevel, d: Derived, inset = 0) =>
  roundedRect(m, d.W - 2 * inset, d.plateD - 2 * inset, Math.max(0.5, d.corner - inset));

/**
 * The cable run: a channel in the UNDERSIDE from under the stand to the back
 * edge, and a hole up through the plate where the stand's own channel meets it.
 *
 * Underneath rather than on top, because the whole point of the thing is that
 * the top is clean. The cable goes in at the back, disappears, and comes up
 * inside the stand where the phone hides it.
 *
 * None of which applies to a RING, and it used to happen anyway. A ring hands
 * its lead out of a slot in its own face and lets it hang down the back; it
 * cuts no bore to meet a hole, and it has no lip for a passthrough notch. So
 * the plate was offering two square holes up through itself to a stand that
 * had nothing to put in either of them -- the first thing you saw on an
 * otherwise clean plate, and holes are the one feature that has to be earned.
 */
function cableRun(m: ManifoldToplevel, d: Derived): Manifold | null {
  const bay = standBay(d);
  if (!bay || d.standStyle === 'ring') return null;

  // Sized to pass the PLUG, not the cable. This hole is the one place on the
  // whole route where a lead is threaded through material on all four sides,
  // and at cable size it was 9.5 x 10.5 against a 12 x 7 moulding -- which
  // fits neither way round, so the charger could not be installed at all.
  const lead = leadBore(d);
  const w = Math.max(d.cableW + 2 * d.clear, lead.w);
  const deepY = Math.max(d.cableD * 2 + 2 * d.clear, lead.t);
  // One hole behind the stand for the puck's lead, and one in front of it for
  // a plug-in cable. Two routes, two holes -- the puck is fed from behind the
  // slab and a plug has to surface in front of it, and one hole between them
  // would be a compromise that serves neither.
  const drops: number[] = [];
  if (d.wireless) drops.push(cableDropY(d));
  if (d.passthrough) drops.push(passDropY(d));
  if (drops.length === 0) return null;

  const cuts: Manifold[] = [];

  // The way up, at exactly the point the stand brings its cable down. One per
  // route, because the puck is fed from behind the rest and a plug has to
  // surface in front of it -- two holes, not one compromise between them.
  for (const drop of drops) {
    cuts.push(
      m.Manifold.cube([w, deepY, d.baseT + 2], true).translate([bay.cx, drop, d.baseT / 2]),
    );
  }

  // A groove in the underside, from the frontmost hole back to the rear edge.
  // Stopped at the hole rather than carried through to the front, or it would
  // open as a slot in the one edge that faces the room.
  // Cable-sized, and that is not an oversight: the groove is open downward, so
  // the cable is laid into it rather than threaded along it. The plug goes up
  // through the hole from underneath with the plate lifted, once, and after
  // that only the lead itself ever lies in here.
  const deep = Math.min(d.cableD, d.baseT - d.minPlate * 2);
  if (deep > 0) {
    const y0 = Math.min(...drops);
    const y1 = d.D / 2 + 1;
    cuts.push(
      m.Manifold.cube([d.cableW + 2 * d.clear, y1 - y0, deep], true).translate([
        bay.cx,
        (y0 + y1) / 2,
        deep / 2,
      ]),
    );
  }
  return m.Manifold.union(cuts);
}

/** Shallow pockets for stick-on feet, so the plate does not skate about. */
function feet(m: ManifoldToplevel, d: Derived): Manifold {
  const r = 5;
  const inset = Math.max(d.corner, 10);
  const pads = [-1, 1].flatMap((sx) =>
    [-1, 1].map((sy) =>
      m.Manifold.cylinder(0.8, r, r, 32).translate([
        (sx * (d.W / 2 - inset)) as number,
        (sy * (d.D / 2 - inset)) as number,
        -0.01,
      ]),
    ),
  );
  return m.Manifold.union(pads);
}

/**
 * The pen rail: a channel along the front of the plate, ahead of the modules.
 *
 * Cut into the ledge the plate grew for it, and stopped short of the underside
 * -- the cable run is grooved into that underside, and a channel that met it
 * would open the top of the plate straight into the wiring.
 */
function penGroove(m: ManifoldToplevel, d: Derived): Manifold | null {
  if (d.frontLedge !== 'groove') return null;
  const rim = Math.max(d.wall, d.corner);
  const w = d.W - 2 * rim;
  if (w <= 0) return null;
  const deep = Math.min(d.grooveD, d.baseT - 2 * d.minPlate);
  if (deep <= 0) return null;
  return m.Manifold.extrude(
    roundedRect(m, w, d.frontD, Math.min(d.frontD / 2, 3)),
    deep + 1,
  ).translate([0, d.frontY, d.baseT - deep]);
}

export function buildBase(m: ManifoldToplevel, d: Derived): Manifold {
  const c = Math.min(d.chamfer, d.baseT / 2);

  // A chamfer round the bottom, built as a tapered first slice rather than cut
  // afterwards: a taper IS the chamfer, and there is no edge to fillet later.
  const small = outline(m, d, c);
  const lower = taperedExtrude(m, small, c, d.W / (d.W - 2 * c), d.plateD / (d.plateD - 2 * c));
  const upper = m.Manifold.extrude(outline(m, d), d.baseT - c).translate([0, 0, c]);
  // Drawn about the origin and moved into place as a solid, AFTER the taper.
  // Everything cut into it below -- dovetails, cable holes, the rail -- is in
  // the assembled frame already, so the plate has to be there before they land.
  let solid = lower.add(upper).translate([0, d.plateY, 0]);

  // On a WALL every module hangs by a dovetail and the panel is slotted for
  // them. On a desk there are no joints left: the modules ARE the plate, and
  // the only lift-off part is the phone stand, which drops into a shallow tray
  // sunk into it. Lifted out, that tray is what you see -- which is the whole
  // reason it is a tray and not a slot.
  if (d.form === 'wall') {
    for (const bay of d.bays) solid = solid.subtract(dockSlot(m, d, bay));
  } else {
    for (const bay of d.bays) {
      if (bay.kind === 'stand') solid = solid.subtract(seatTray(m, d, bay));
    }
  }

  const cable = cableRun(m, d);
  if (cable) solid = solid.subtract(cable);

  // The plate is what meets the desk, so the pads belong on it.
  solid = solid.subtract(feet(m, d));
  const groove = penGroove(m, d);
  if (groove) solid = solid.subtract(groove);

  // The back wall still hangs on a joint, and has to: it prints lying on its
  // back so its hooks come off the bed as posts, which it cannot do as part of
  // a plate lying the other way up.
  if (d.backWall > 0) solid = solid.subtract(ledgeSlot(m, d, d.backY));
  // On a wall a front tray hangs on the front ledge too; on a desk it is part
  // of the plate like everything else.
  if (d.frontLedge === 'tray' && d.form === 'wall') {
    solid = solid.subtract(ledgeSlot(m, d, d.frontY));
  }

  // A shallow tray for oddments in the margin behind the modules would be a
  // different product; the margin is left as plate on purpose.
  void slot;

  // And then everything that used to lift off. Unioned LAST, after every hole
  // in the plate has been cut: a module added first would have the cable run
  // and the pen groove taken straight back out of it.
  if (d.form !== 'wall') {
    for (const bay of d.bays) {
      if (bay.kind === 'stand') continue;
      const mod = buildModule(m, d, bay);
      if (mod) solid = solid.add(mod);
    }
    const front = buildFrontTray(m, d);
    if (front) solid = solid.add(front);
  }
  return solid;
}
