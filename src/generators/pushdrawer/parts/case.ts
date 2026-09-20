import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { roundedRect } from '../../../core/kernel/primitives';
import type { Derived } from '../geometry';
import { DOVETAIL_ZC, lugAt } from './hardware';
import { box, poly, prismY, thread } from './util';

/**
 * The case: the part that stays on the desk.
 *
 * A 2 mm floor, two side walls and a back wall; open at the front and open at
 * the top, because the case above (or the desk) is the only ceiling a drawer
 * needs. Everything that makes it a push-lock drawer rather than a shelf is on
 * or in the FLOOR: two dovetail rails the drawer hangs from, a window with the
 * sprung arm and its pin lying in it, and two posts the bands pull from.
 *
 * Printed floor-down. The arm lies flat on the bed inside its window rather
 * than floating above the floor as the original does, so it needs no supports;
 * the rails, posts and lugs all grow upward from there.
 */

/** The dovetail rail, as a profile in (x, z) for one side. */
function railProfile(d: Derived, s: -1 | 1): [number, number][] {
  const inner = d.railX - d.railBase / 2;
  const outer = d.railX + d.railBase / 2;
  const z0 = d.wall - 0.01;
  const zf = d.wall + d.railH - d.headH;
  const zt = d.wall + d.railH;
  const pts: [number, number][] = [
    [inner, z0],
    [outer, z0],
    [outer, zf],
    [outer + d.headOvh, zf + d.headOvh],
    [outer + d.headOvh, zt],
    [inner, zt],
  ];
  return pts.map(([x, z]) => [s * x, z]);
}

function rails(m: ManifoldToplevel, d: Derived): Manifold {
  return m.Manifold.union(
    ([-1, 1] as const).map((s) => prismY(m, poly(m, railProfile(d, s)), d.yFront + 3.5, d.yBackIn + 0.01)),
  );
}

/**
 * The latch: a window through the floor, and in it the arm, its root and its
 * pin. Modelled with the pin IN THE NOTCH -- the shut position -- so the arm is
 * drawn very slightly bent toward the cam, as it is when the drawer is closed.
 */
function latch(m: ManifoldToplevel, d: Derived): { cut: Manifold; add: Manifold } {
  const win = box(m, d.winX0, d.winX1, d.winY0, d.winY1, -1, d.wall + 1).subtract(
    box(m, d.rootX0 - 0.6, d.rootX1 + 0.6, d.rootY0 - 0.6, d.D / 2, -1, d.wall + 1),
  );

  const root = box(m, d.rootX0, d.rootX1, d.rootY0, d.yBackIn + 0.01, 0, d.armH);
  // The arm: a thin bar from the root to the pin, lying on the bed.
  const dx = d.xNotch - d.xRoot;
  const dy = d.yBoss - d.yRoot;
  const len = Math.hypot(dx, dy);
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const arm = m.Manifold.cube([len + 2, d.armW, d.armH], true)
    .rotate([0, 0, ang])
    .translate([(d.xRoot + d.xNotch) / 2 - (dx / len) * 1, (d.yRoot + d.yBoss) / 2 - (dy / len) * 1, d.armH / 2]);
  // The pin. It reaches PAST the deepest floor of the groove on purpose:
  // assembled, the arm is bowed down and pressing up the whole time, and a pin
  // that merely touches drops out the first time a ramp asks it to climb.
  // Sunk into the arm rather than stood on it, or the two are bodies that
  // merely touch and the pin slices off in the slicer.
  const r = d.bossD / 2;
  const tip = 0.5;
  const base = d.armH - 0.6;
  const boss = m.Manifold.union([
    m.Manifold.cylinder(d.bossTop - tip - base, r, r, 48).translate([0, 0, base]),
    m.Manifold.cylinder(tip, r, r - 0.4, 48).translate([0, 0, d.bossTop - tip]),
  ]).translate([d.xNotch, d.yBoss, 0]);

  return { cut: win, add: root.add(arm).add(boss) };
}

/** The two band posts: ovals standing up into the drawer's pocket. */
function posts(m: ManifoldToplevel, d: Derived): Manifold {
  return m.Manifold.union(
    [-1, 1].map((s) =>
      m.Manifold.extrude(roundedRect(m, d.postLx, d.postLy, d.postLy / 2 - 0.01), d.postTop - d.wall + 0.01).translate([
        s * d.postX,
        d.postY,
        d.wall - 0.01,
      ]),
    ),
  );
}

/** Counterbored holes for the stop-bar screws, up through the floor. */
function stopScrewHoles(m: ManifoldToplevel, d: Derived): Manifold {
  return m.Manifold.union(
    [-1, 1].flatMap((s) => [
      m.Manifold.cylinder(d.stopScrewHeadH + 0.01, d.stopScrewHeadD / 2 + 0.3, d.stopScrewHeadD / 2 + 0.3, 48).translate([
        s * d.earScrewX,
        d.earScrewY,
        -0.01,
      ]),
      m.Manifold.cylinder(d.wall + 1, d.stopScrewD / 2 + 0.35, d.stopScrewD / 2 + 0.35, 48).translate([
        s * d.earScrewX,
        d.earScrewY,
        -0.5,
      ]),
    ]),
  );
}

/**
 * Desk ears: a wedge along the top of each side wall's outer face, with a 45
 * degree underside so it prints without support, and a clearance hole near
 * each end. For tape, the same ledge with no holes: it is the flat area the
 * tape goes on.
 */
function ears(m: ManifoldToplevel, d: Derived): { add: Manifold; cut: Manifold | null } {
  const y0 = -d.D / 2 + 14;
  const y1 = d.D / 2 - 14;
  const wedge = (s: -1 | 1) => {
    const xf = s * (d.W / 2);
    const xo = s * (d.W / 2 + d.earOut);
    const pts: [number, number][] = [
      [xf, d.H],
      [xo, d.H],
      [xo, d.H - d.earT],
      [xf, d.H - d.earT - d.earOut],
    ];
    return prismY(m, poly(m, pts), y0, y1);
  };
  const add = m.Manifold.union([wedge(-1), wedge(1)]);
  if (d.mount !== 'screws') return { add, cut: null };
  const cut = m.Manifold.union(
    [-1, 1].flatMap((sx) =>
      [-1, 1].map((sy) =>
        m.Manifold.cylinder(d.H, d.screwD / 2, d.screwD / 2, 32).translate([
          sx * (d.W / 2 + d.earOut / 2),
          sy * d.earHoleY,
          d.H - d.earT - d.earOut - 1,
        ]),
      ),
    ),
  );
  return { add, cut };
}

/**
 * Corner lugs for the stack connector, one at the top and one at the bottom of
 * each side wall's outer face at each end. Every case carries both, so the
 * stack is one part printed again: the bottom lug of the case above meets the
 * top lug of the case below, end to end, and the connector joins them.
 */
function lugs(m: ManifoldToplevel, d: Derived): { add: Manifold; cut: Manifold } | null {
  if (d.connector === 'none') return null;
  const adds: Manifold[] = [];
  const cuts: Manifold[] = [];
  for (const sx of [-1, 1] as const) {
    for (const sy of [-1, 1] as const) {
      const l = lugAt(d, sx, sy);
      const cx = (l.x0 + l.x1) / 2;
      const cy = (l.y0 + l.y1) / 2;
      adds.push(box(m, l.x0, l.x1, l.y0, l.y1, 0, d.lugH));
      adds.push(box(m, l.x0, l.x1, l.y0, l.y1, d.H - d.lugH, d.H));

      if (d.connector === 'screws') {
        // Bottom lug: clearance hole with a counterbore for the head at its top.
        cuts.push(m.Manifold.cylinder(d.lugH + 1, d.stackScrewD / 2 + 0.3, d.stackScrewD / 2 + 0.3, 32).translate([cx, cy, -0.5]));
        cuts.push(
          m.Manifold.cylinder(2.5, d.stackScrewD / 2 + 1.8, d.stackScrewD / 2 + 1.8, 48).translate([cx, cy, d.lugH - 2]),
        );
        // Top lug: tapped from the top for the screw of the case above.
        cuts.push(
          thread(m, d.stackScrewD + 0.35, d.stackScrewPitch, d.H - (d.lugH - 2), d.H + 0.5).translate([cx, cy, 0]),
        );
      } else if (d.connector === 'bolts') {
        cuts.push(m.Manifold.cylinder(d.lugH + 1, d.boltD / 2, d.boltD / 2, 32).translate([cx, cy, -0.5]));
        cuts.push(m.Manifold.cylinder(3, 3.2, 3.2, 32).translate([cx, cy, d.lugH - 3]));
        cuts.push(m.Manifold.cylinder(d.lugH + 1, d.boltD / 2, d.boltD / 2, 32).translate([cx, cy, d.H - d.lugH - 0.5]));
        // A nut trap in the underside of the top lug: hex, 5.5 across flats.
        cuts.push(
          m.Manifold.cylinder(2.8, 5.7 / Math.sqrt(3), 5.7 / Math.sqrt(3), 6)
            .rotate([0, 0, 30])
            .translate([cx, cy, d.H - d.lugH - 0.01]),
        );
      } else if (d.connector === 'dovetail') {
        const face = sx > 0 ? l.x1 : l.x0;
        const groove = (zc: number) => {
          const pts: [number, number][] =
            sx > 0
              ? [
                  [face + 0.5, zc - 1.5],
                  [face - 3, zc - 2.5],
                  [face - 3, zc + 2.5],
                  [face + 0.5, zc + 1.5],
                ]
              : [
                  [face - 0.5, zc - 1.5],
                  [face + 3, zc - 2.5],
                  [face + 3, zc + 2.5],
                  [face - 0.5, zc + 1.5],
                ];
          return prismY(m, poly(m, pts), l.y0 - 1, l.y1 + 1);
        };
        cuts.push(groove(DOVETAIL_ZC));
        cuts.push(groove(d.H - DOVETAIL_ZC));
      }
    }
  }
  return { add: m.Manifold.union(adds), cut: cuts.length > 0 ? m.Manifold.union(cuts) : m.Manifold.cube([0.01, 0.01, 0.01]) };
}

export function buildCase(m: ManifoldToplevel, d: Derived): Manifold {
  const floor = box(m, -d.W / 2, d.W / 2, d.yFront, d.D / 2, 0, d.wall);
  const sides = m.Manifold.union(
    [-1, 1].map((s) => box(m, s > 0 ? d.W / 2 - d.wall : -d.W / 2, s > 0 ? d.W / 2 : -d.W / 2 + d.wall, d.yFront, d.D / 2, 0, d.H)),
  );
  const back = box(m, -d.W / 2, d.W / 2, d.yBackIn, d.D / 2, 0, d.H);

  let solid = floor.add(sides).add(back).add(rails(m, d));

  if (d.latch) {
    const l = latch(m, d);
    solid = solid.subtract(l.cut).add(l.add).add(posts(m, d));
  }
  solid = solid.subtract(stopScrewHoles(m, d));

  const e = ears(m, d);
  solid = solid.add(e.add);
  if (e.cut) solid = solid.subtract(e.cut);

  const lg = lugs(m, d);
  if (lg) solid = solid.add(lg.add).subtract(lg.cut);

  return solid;
}
