import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import { roundedRect } from '../../core/kernel/primitives';
import { bodyD, bodyW, bodyY0, seatDepth, type Bay, type Derived } from './geometry';

/**
 * The dovetail that every module slides onto, and the slot it slides into.
 *
 * ONE definition, used for both halves, with the clearance taken off the male
 * once. The alternative -- a slot dimensioned here and a foot dimensioned over
 * there -- is two numbers that have to agree forever, and they stop agreeing
 * the first time either is touched.
 *
 * Both halves print without support, which is not luck. Female: the slot is
 * open at the top and narrows going up, so the solid either side leans inward
 * at the dovetail angle. Male: the foot is widest at the bed and narrows going
 * up. The undercut is only ever an undercut from the other part's point of
 * view.
 */

/**
 * Cross-section of the joint, in the plane across the slide.
 *
 * `x` runs across the plate and `y` is height, with y = 0 at the plate's top
 * face and the joint hanging below it. Extruded and stood up by `alongY`.
 */
function section(m: ManifoldToplevel, d: Derived, inset: number, lap = 0): CrossSection {
  const h = d.dtH;
  const a = d.dtW / 2;
  const b = a + h * Math.tan((d.dtAngle * Math.PI) / 180);
  // `lap` puts a tab on top of the trapezoid. The foot is a separate solid from
  // the module it belongs to, and the two meeting exactly on the plate's top
  // plane is a shared face with no volume behind it -- a module that decomposes
  // into two bodies and prints as a box and a loose dovetail.
  const poly: [number, number][] =
    lap > 0
      ? [
          [-b, -h],
          [b, -h],
          [a, 0],
          [a, lap],
          [-a, lap],
          [-a, 0],
        ]
      : [
          [-b, -h],
          [b, -h],
          [a, 0],
          [-a, 0],
        ];
  const cs = m.CrossSection.ofPolygons([poly], 'NonZero');
  return inset === 0 ? cs : cs.offset(-inset, 'Miter', 4);
}

/**
 * Stand a profile up and run it front-to-back.
 *
 * Built in XY and extruded along Z because that is the only way Manifold
 * extrudes, then turned so the extrusion runs along Y and the profile's own up
 * stays up. Two rotations rather than one: rotate() takes XYZ in one call and
 * composing them in the wrong order is how a dovetail ends up lying on its side.
 */
function alongY(m: ManifoldToplevel, cs: CrossSection, len: number): Manifold {
  return m.Manifold.extrude(cs, len).rotate([90, 0, 0]);
}

/**
 * The slot in the plate: open at the BACK so modules push in from behind and
 * the front edge of the organizer stays an unbroken line, and stopped short of
 * the front so a module cannot be pushed out through it.
 */
export function dockSlot(m: ManifoldToplevel, d: Derived, bay: Bay): Manifold {
  const len = d.D - d.dtStop + 2;
  return alongY(m, section(m, d, 0), len).translate([bay.cx, d.D / 2 + 2, bay.cz]);
}

/**
 * The matching foot under a module. Inset once, here, by the running fit.
 *
 * It stops where the SLOT stops, not where the module does. The slot is closed
 * off `dtStop` short of the front edge so it cannot be seen from the front, and
 * a foot run the full depth of the module simply ploughs into that solid plate
 * -- eight millimetres of it, which measured as 334 mm3 of two parts occupying
 * the same place.
 */
export function dockFoot(m: ManifoldToplevel, d: Derived, bay: Bay): Manifold {
  const len = d.D - d.dtStop - 2 * d.clear;
  return alongY(m, section(m, d, d.clear, d.clear + 0.6), len).translate([
    bay.cx,
    d.D / 2 - d.clear,
    bay.cz,
  ]);
}

/**
 * The same joint again, run along X and hanging BACKWARD instead of down.
 *
 * `(sx, sy, t)` has to land on `(t, -sy, sx)`: the profile's across-the-slide
 * axis becomes height, its depth becomes depth into the panel, and the
 * extrusion runs across. Manifold applies `rotate` X then Y then Z, so that is
 * Ry(-90) followed by Rz(180), in one call.
 */
function alongX(m: ManifoldToplevel, cs: CrossSection, len: number): Manifold {
  return m.Manifold.extrude(cs, len).rotate([0, -90, 180]);
}

/**
 * Wall form: the slot across the panel, open at one END rather than the back.
 *
 * A shelf slides in sideways and stops against the far margin, which is the
 * same bargain the desk form strikes with its front edge -- the joint is
 * visible from exactly one direction, and it is not the one you look at.
 */
export function wallSlot(m: ManifoldToplevel, d: Derived, bay: Bay): Manifold {
  const len = d.W - d.margin + 2;
  return alongX(m, section(m, d, 0), len).translate([-d.W / 2 - 2, d.D / 2, slotZ(d, bay)]);
}

/**
 * The matching rail on a module's back. Inset once, here, by the running fit.
 *
 * A deeper lap than the desk form's, because this one is holding a cantilever
 * rather than sitting on a plate: the rail runs the module's whole width and
 * the lap is the weld between it and the back wall it hangs off.
 */
export function wallFoot(m: ManifoldToplevel, d: Derived, bay: Bay): Manifold {
  const len = Math.min(bay.w - 2 * d.clear, d.W - d.margin - 2 * d.clear);
  return alongX(m, section(m, d, d.clear, d.clear + 1.5), len).translate([
    bay.cx - len / 2,
    d.D / 2,
    slotZ(d, bay),
  ]);
}

/**
 * The joint again, run left to right along the PLATE's top face.
 *
 * `alongY` stands the profile up and runs it front-to-back; this is that
 * turned a quarter turn about Z, so the run is across the plate and the
 * profile's across-the-slide axis becomes front-to-back. Manifold applies
 * rotate X then Y then Z, so the two go in one call as [90, 0, 90].
 */
function acrossX(m: ManifoldToplevel, cs: CrossSection, len: number): Manifold {
  return m.Manifold.extrude(cs, len).rotate([90, 0, 90]);
}

/**
 * A slot across one of the LEDGES, for the things that run the plate's width
 * rather than sitting in a bay: the back wall, the front tray.
 *
 * Open at BOTH ends, unlike a bay's. A bay module is narrower than the plate,
 * so a slot blinded at the front hides the joint and gives the module
 * something to fetch up against; these are as wide as the plate, so there is
 * no end to stop them against and nothing to hide -- they are held by the
 * tongue's undercut. Run two millimetres past each end so the mouth is never
 * a sliver.
 */
export function ledgeSlot(m: ManifoldToplevel, d: Derived, y: number): Manifold {
  return acrossX(m, section(m, d, 0), d.W + 4).translate([-d.W / 2 - 2, y, d.baseT]);
}

/** The matching tongue. Inset once, here, by the running fit. */
export function ledgeTongue(m: ManifoldToplevel, d: Derived, y: number): Manifold {
  const len = d.W - 2 * d.margin - 2 * d.clear;
  return acrossX(m, section(m, d, d.clear, d.clear + 0.6), len).translate([-len / 2, y, d.baseT]);
}

/**
 * The shallow tray a lift-off module drops into, and the pad that drops in.
 *
 * What replaced the dovetail on a desk. A dovetail is the right joint for a
 * module that has to be held ON something -- a wall panel, where gravity is
 * pulling it off the face -- and the wrong one for a module sitting on a plate
 * with gravity holding it there already. All it did there was put a slot
 * through the plate, a rail under the module, and a sliding fit between them
 * to get wrong.
 *
 * The two are one number apart: the tray is the module's own footprint plus a
 * running clearance, and the pad is the footprint itself.
 */
export function seatTray(m: ManifoldToplevel, d: Derived, bay: Bay): Manifold {
  const deep = seatDepth(d);
  const w = bodyW(bay);
  const dp = bodyD(d, bay);
  return m.Manifold.extrude(roundedRect(m, w, dp, Math.max(0.5, d.corner - d.clear)), deep + 1)
    .translate([bay.cx, bodyY0(d, bay) + dp / 2, bay.cz - deep]);
}

export function seatPad(m: ManifoldToplevel, d: Derived, bay: Bay): Manifold {
  const deep = seatDepth(d);
  const w = bodyW(bay) - 2 * d.clear;
  const dp = bodyD(d, bay) - 2 * d.clear;
  return m.Manifold.extrude(roundedRect(m, w, dp, Math.max(0.5, d.corner - d.clear)), deep + 0.01)
    .translate([bay.cx, bodyY0(d, bay) + dp / 2, bay.cz - deep]);
}

/**
 * Whichever half a module hangs by, for the form it is in.
 *
 * On a WALL there is still a dovetail, and there has to be: a module on a
 * vertical panel is held by the joint and nothing else. On a desk the only
 * lift-off part left is the phone stand, and it sits in its tray.
 */
export function moduleFoot(m: ManifoldToplevel, d: Derived, bay: Bay): Manifold {
  if (d.form === 'wall') return wallFoot(m, d, bay);
  return bay.kind === 'stand' ? seatPad(m, d, bay) : m.Manifold.cube([0.01, 0.01, 0.01]);
}

/**
 * Height of the joint for a given bay: the module's middle.
 *
 * A shelf is a cantilever, so the load is a moment, and the dovetail carries it
 * by being wedged rather than by being anywhere in particular -- but halfway up
 * puts equal pad above and below it to bear against the panel, which is what
 * actually stops the shelf nodding.
 */
export function slotZ(d: Derived, bay: Bay): number {
  // The phone stand is not a box: at half its height the only material is the
  // rest, ninety millimetres forward of the panel. Its joint goes in the
  // upstand at its back instead.
  if (d.form === 'wall' && bay.kind === 'stand') return bay.cz + d.plateT + d.standBackH / 2;
  return bay.cz + bay.h / 2;
}

/** Is there enough plate under the slot to be worth calling a plate? */
export function dockFits(d: Derived): boolean {
  return d.dtH + 2 * d.minPlate <= d.baseT && d.dtW > 4 * d.clear;
}
