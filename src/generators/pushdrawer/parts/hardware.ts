import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { Derived } from '../geometry';
import { box, poly, prismY, slotCut, thread } from './util';

/**
 * The small printed parts: the stop bar and its screws, the travel pins, and
 * whatever the stack connector needs. All modelled IN PLACE in the tier's frame
 * so the assembled view is honest; the layout flips what needs flipping.
 */

/**
 * The stop bar. A flat strip across the front of the case at floor-top level,
 * screwed down through two ears, with a lip that hooks over the floor's front
 * edge. The drawer's stop pins fetch up against its back face at full travel.
 *
 * Fitted LAST, from underneath: the drawer drops onto its rails from the open
 * front, and then the bar closes the door behind it.
 */
export function buildStopBar(m: ManifoldToplevel, d: Derived): Manifold {
  const x1 = d.innerW / 2 - 0.4;
  const y0 = d.barBackY - d.barW;
  const z0 = d.wall;
  const bar = box(m, -x1, x1, y0, d.barBackY, z0, z0 + d.barT);
  // The lip hangs in front of the floor's edge, so the bar cannot creep back
  // under the drawer when a pin hits it.
  const lip = box(m, -x1, x1, y0, d.yFront - 0.3, z0 - d.barLipH, z0 + 0.01);
  const ears = m.Manifold.union(
    [-1, 1].map((s) =>
      box(
        m,
        s > 0 ? x1 - d.earL : -x1,
        s > 0 ? x1 : -x1 + d.earL,
        d.barBackY - 0.01,
        d.barBackY + d.earL,
        z0,
        z0 + d.barT,
      ),
    ),
  );
  // Tapped for the printed screw: the same helix, a quarter millimetre bigger.
  const taps = m.Manifold.union(
    [-1, 1].map((s) =>
      thread(m, d.stopScrewD + 0.35, d.stopScrewPitch, z0 - 0.5, z0 + d.barT + 0.5).translate([
        s * d.earScrewX,
        d.earScrewY,
        0,
      ]),
    ),
  );
  return bar.add(lip).add(ears).subtract(taps);
}

/**
 * A stop-bar screw: a slotted head that sits flush in a counterbore under the
 * floor, and a thread that passes the floor loosely and bites the ear above.
 */
export function buildStopScrew(m: ManifoldToplevel, d: Derived, side: -1 | 1): Manifold {
  const head = m.Manifold.cylinder(d.stopScrewHeadH, d.stopScrewHeadD / 2, d.stopScrewHeadD / 2, 48).subtract(
    slotCut(m, d.stopScrewHeadD, d.stopScrewHeadH),
  );
  const shank = thread(m, d.stopScrewD, d.stopScrewPitch, d.stopScrewHeadH - 0.3, d.wall + d.barT - 0.3);
  return head.add(shank).translate([side * d.earScrewX, d.earScrewY, 0]);
}

/**
 * A travel-stop pin: screws up into the drawer's underside near a back corner,
 * head hanging down into the gap over the case floor. Its head is what meets
 * the stop bar -- rounded, because it hits that bar every time the drawer is
 * pulled all the way out.
 */
export function buildTravelPin(m: ManifoldToplevel, d: Derived, side: -1 | 1): Manifold {
  const r = d.pinHeadD / 2;
  // A domed edge on the head rather than a square one: a chamfered cylinder
  // from a slightly smaller bottom radius.
  const head = m.Manifold.cylinder(d.pinHeadH, r - 0.6, r, 48)
    .subtract(slotCut(m, d.pinHeadD, d.pinHeadH))
    .translate([0, 0, d.boxZ - d.pinHeadH]);
  const shank = thread(m, d.pinD, d.pinPitch, d.boxZ - 0.3, d.boxZ + d.pinHoleDeep - 0.3);
  return head.add(shank).translate([side * d.pinX, d.pinY, 0]);
}

/** Where a corner lug sits, for the case and the connector parts to agree. */
export function lugAt(d: Derived, sx: -1 | 1, sy: -1 | 1): { x0: number; x1: number; y0: number; y1: number } {
  const xIn = d.W / 2;
  return {
    x0: sx > 0 ? xIn : -xIn - d.lugW,
    x1: sx > 0 ? xIn + d.lugW : -xIn,
    y0: sy * d.lugY - d.lugL / 2,
    y1: sy * d.lugY + d.lugL / 2,
  };
}

/**
 * A stack screw, in the frame of the UPPER case: head flush in the top of its
 * bottom lug, thread running down through that lug and into the tapped top lug
 * of the case below.
 */
export function buildStackScrew(m: ManifoldToplevel, d: Derived, sx: -1 | 1, sy: -1 | 1): Manifold {
  const headD = d.stackScrewD + 3;
  const headH = 2;
  const l = lugAt(d, sx, sy);
  const cx = (l.x0 + l.x1) / 2;
  const cy = (l.y0 + l.y1) / 2;
  const head = m.Manifold.cylinder(headH, headD / 2, headD / 2, 48)
    .subtract(slotCut(m, headD, headH))
    .translate([0, 0, d.lugH - headH]);
  // The shank reaches from the head down through the seam into the lug below.
  // Its thread is phased to the LOWER case's frame (zRef = -H), which is where
  // the tapped hole it mates with was built.
  const shank = thread(m, d.stackScrewD, d.stackScrewPitch, -(d.lugH - 2) + 0.5, d.lugH - headH + 0.3, 0.5, -d.H);
  return head.add(shank).translate([cx, cy, 0]);
}

/**
 * A dovetail key, in the frame of the UPPER case: two tenons joined by a web,
 * one into the groove on the upper case's bottom lug, one into the groove on
 * the lower case's top lug, slid in from the front.
 */
export function buildDovetailKey(m: ManifoldToplevel, d: Derived, sx: -1 | 1, sy: -1 | 1): Manifold {
  const l = lugAt(d, sx, sy);
  const face = sx > 0 ? l.x1 : l.x0; // outer face of the lug
  const c = 0.2; // running clearance on the tenons
  const webT = 3;
  const tenon = (zc: number) => {
    // Profile in (x, z): mouth 3 wide at the face, 5 wide 3 deep in.
    const deep = 3 - c;
    const pts: [number, number][] =
      sx > 0
        ? [
            [face + 0.01, zc - 1.5 + c],
            [face - deep, zc - 2.5 + c],
            [face - deep, zc + 2.5 - c],
            [face + 0.01, zc + 1.5 - c],
          ]
        : [
            [face - 0.01, zc - 1.5 + c],
            [face + deep, zc - 2.5 + c],
            [face + deep, zc + 2.5 - c],
            [face - 0.01, zc + 1.5 - c],
          ];
    return prismY(m, poly(m, pts), l.y0 + 0.3, l.y1 - 0.3);
  };
  // The upper case's bottom lug groove is centred 6.5 up; the lower case's top
  // lug groove 6.5 down from the seam (z = 0 here).
  const web = box(
    m,
    sx > 0 ? face : face - webT,
    sx > 0 ? face + webT : face,
    l.y0 + 0.3,
    l.y1 - 0.3,
    -d.lugH + 2,
    d.lugH - 2,
  );
  return web.add(tenon(6.5)).add(tenon(-6.5));
}

/** Groove centre heights for the dovetail connector, from a lug's own base. */
export const DOVETAIL_ZC = 6.5;
