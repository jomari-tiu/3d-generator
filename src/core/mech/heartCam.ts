import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import { slot } from '../kernel/primitives';

/**
 * The push-push heart cam: push to open, push to close.
 *
 * A closed loop of groove and a sprung pin that rides in it. The moving part
 * travels along one axis only, so every sideways move the pin makes is the
 * groove walls camming it across and the follower springing back.
 *
 * `u` is how far the drawer has been pushed IN from where the ejector throws
 * it; `v` is across. The pin walks:
 *
 *        v
 *        ^        A(-)                      B(+)
 *        |         \                        /
 *        |          \      N (latched)     /
 *   0 ---E----S------\------o-------------/------>  u
 *        entry  rest  \    /  \          /
 *
 *   E -> S   pushed in, the pin enters through the funnel
 *   S -> A   pushed in hard: the pin is cammed LEFT to the far corner
 *   A -> N   let go: the ejector pulls it back into the notch. CLOSED.
 *   N -> B   pushed again: it leaves the notch to the RIGHT
 *   B -> S   let go: it runs home and the ejector throws the drawer out. OPEN.
 *
 * Two things make it one-way, and both are in the FLOOR rather than the plan.
 * Each segment's floor ramps UP along the direction of travel, and at every
 * corner it DROPS back to full depth. The pin can always climb a ramp; it can
 * never climb the step behind it. Take the steps away and you have a groove the
 * pin wanders back down the way it came, which is a drawer that does nothing --
 * and a cam built as free-standing islands with no steps at all is that same
 * drawer, which is what a kinematic simulation of one showed in the end: both
 * strokes take the same path and it never latches.
 *
 * The notch holds for a reason worth seeing: both of N's neighbours sit at
 * HIGHER u, so there is simply no groove on the side the ejector is pulling.
 * The pin is not gripped, it is cornered.
 *
 * Shared by the two drawer generators, because it is one mechanism and two
 * copies of it would be two mechanisms the day one of them was corrected.
 */

/** Everything the cam needs to know about the machine it is fitted to. */
export interface CamSpec {
  /** How far the ejector throws the drawer when the latch lets go. */
  readonly pop: number;
  /** Extra push past the latched point, which is what frees the pin. */
  readonly over: number;
  /** Straight run that funnels the pin back into the cam on the way in. */
  readonly lead: number;
  /** Half-width of the cam, across the travel. */
  readonly camV: number;
  /** Sideways offset of the entry, which sends the pin round the left first. */
  readonly camBias: number;
  /** Groove width: the pin plus a sliding fit. */
  readonly grooveW: number;
  /** Deepest floor of the groove, and the height of each one-way step. */
  readonly camDeep: number;
  readonly camStep: number;
}

export interface CamPoint {
  readonly u: number;
  readonly v: number;
}

/**
 * The pin's path, in order, as the corners of a closed walk.
 *
 * The first point is off the end of the plate: that is the funnel mouth, and
 * the pin leaves through it whenever the drawer is pulled further open than the
 * latch ever throws it.
 */
export function camPath(d: CamSpec): CamPoint[] {
  const uA = d.pop + d.over;
  return [
    { u: -d.lead, v: -d.camBias }, // E, off the front of the plate
    { u: 0, v: -d.camBias }, //        S, rest
    { u: uA, v: -d.camV }, //          A, hard push, cammed left
    { u: d.pop, v: 0 }, //             N, latched
    { u: uA, v: d.camV }, //           B, second push, released right
  ];
}

/** The walk as segments, closing B back to S rather than to the funnel mouth. */
export function camSegments(d: CamSpec): [CamPoint, CamPoint][] {
  const p = camPath(d);
  const out: [CamPoint, CamPoint][] = [];
  for (let i = 0; i + 1 < p.length; i++) out.push([p[i]!, p[i + 1]!]);
  out.push([p[p.length - 1]!, p[1]!]); // B -> S
  return out;
}

/** Where a point in cam coordinates lands on the plate, in the drawer's frame. */
export function camToLocal(pt: CamPoint): [number, number] {
  // Pushing the drawer IN moves it toward +Y, so the pin -- which never moves --
  // travels toward -Y in the plate's own frame. u therefore runs against Y.
  return [pt.v, -pt.u];
}

/** The groove as a 2D region: every segment swept at the pin's width. */
export function camGroove(m: ManifoldToplevel, d: CamSpec): CrossSection {
  const parts = camSegments(d).map(([a, b]) => {
    const [ax, ay] = camToLocal(a);
    const [bx, by] = camToLocal(b);
    const len = Math.hypot(bx - ax, by - ay);
    const deg = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
    return slot(m, len + d.grooveW, d.grooveW)
      .rotate(deg)
      .translate([(ax + bx) / 2, (ay + by) / 2]);
  });
  return m.CrossSection.union(parts);
}

/**
 * The groove as a solid to subtract, with the ramped, stepped floor that makes
 * the whole thing one-way.
 *
 * Built segment by segment as a prism intersected with a TILTED half-space:
 * Manifold has no lofting, and a floor that ramps is a plane, so a plane is
 * what we cut with. The plate's top face is z = 0 here and the groove goes down
 * from it; the caller places it, and a caller cutting into an UNDERSIDE mirrors
 * it in z first.
 */
export function camCutter(m: ManifoldToplevel, d: CamSpec): Manifold {
  const big = 4 * (d.lead + d.pop + d.over + d.camV + 20);
  const solids: Manifold[] = [];

  for (const [a, b] of camSegments(d)) {
    const [ax, ay] = camToLocal(a);
    const [bx, by] = camToLocal(b);
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1e-6) continue;
    const deg = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;

    // Full depth where the segment starts, one step shallower where it ends.
    // Uniform per segment: each corner is then exactly one step, and the pin
    // drops the same amount however far it has come.
    const d0 = d.camDeep;
    const d1 = d.camDeep - d.camStep;

    const prism = m.Manifold.extrude(
      slot(m, len + d.grooveW, d.grooveW)
        .rotate(deg)
        .translate([(ax + bx) / 2, (ay + by) / 2]),
      2 * big,
    ).translate([0, 0, -big]);

    // A box sitting on z = 0, tilted so its underside becomes the ramp, then
    // spun to point along the segment and dropped onto the segment's start.
    // The spin is deg - 90 because tilting about X lifts the +Y side, and +Y
    // has to end up pointing along the segment.
    const rise = (Math.atan2(d0 - d1, len) * 180) / Math.PI;
    const above = m.Manifold.cube([big, big, big], true)
      .translate([0, 0, big / 2])
      .rotate([rise, 0, 0])
      .rotate([0, 0, deg - 90])
      .translate([ax, ay, -d0]);

    // Clamped at full depth. The ramp plane keeps falling away past the end of
    // its own segment, and each capsule reaches half a groove width beyond
    // that -- so without this every corner is a bowl deeper than the floor
    // anywhere else, and the pin has to climb further out of it than the step
    // it was supposed to climb. The step is meant to be camStep everywhere.
    const floor = m.Manifold.cube([big, big, 2 * d.camDeep], true).translate([0, 0, 0]);
    solids.push(prism.intersect(above).intersect(floor));
  }

  return m.Manifold.union(solids);
}

/**
 * Where the pin sits when the drawer is shut, in the plate's frame.
 *
 * Exported because other parts are set out from it: a wire follower's pivot,
 * and the stop that decides how far the drawer can travel.
 */
export function latchedPoint(d: CamSpec): [number, number] {
  return camToLocal({ u: d.pop, v: 0 });
}
