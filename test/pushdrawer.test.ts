import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { describe, expect, it } from 'vitest';
import { layFlat } from '../src/core/build/layout';
import { coerceAll, defaultsOf } from '../src/core/params/validate';
import type { BuildCtx, Params } from '../src/core/params/types';
import { camPath, camSegments, camToLocal } from '../src/core/mech/heartCam';
import { pushDrawerGenerator } from '../src/generators/pushdrawer/build';
import {
  camOriginY,
  camSpanY,
  camSpec,
  derive,
  funnelY,
} from '../src/generators/pushdrawer/geometry';
import { buildDrawer } from '../src/generators/pushdrawer/parts/box';
import { buildCase } from '../src/generators/pushdrawer/parts/case';
import {
  buildDovetailKey,
  buildStackScrew,
  buildStopBar,
  buildStopScrew,
  buildTravelPin,
  lugAt,
} from '../src/generators/pushdrawer/parts/hardware';
import { cleanup, kernel, loadFont } from './kernel';

function ctxFor(m: ManifoldToplevel): BuildCtx {
  return { m, font: (id) => loadFont(id), image: () => undefined, tolerance: 0.03, issue: () => {} };
}
const paramsWith = (patch: Params = {}): Params =>
  coerceAll(pushDrawerGenerator, { ...defaultsOf(pushDrawerGenerator), ...patch });
const derived = (patch: Params = {}) => derive(paramsWith(patch));
const noIssue = () => {};

const SLIVER = 0.05;
const shells = (s: Manifold) => s.decompose().filter((p) => p.volume() > SLIVER).length;

/** The groove and its relief: the one place the case's pin is ALLOWED to be. */
function pocket(m: ManifoldToplevel, d: ReturnType<typeof derived>): Manifold {
  const [y0] = camSpanY(d);
  return m.Manifold.cube(
    [2 * d.camV + 2 * d.grooveW, d.boxBackY + 2 - y0, d.camDeep + 2],
    true,
  ).translate([0, (y0 + d.boxBackY + 2) / 2, d.boxZ + d.camDeep / 2]);
}

describe('push-lock drawer', () => {
  // --- the cam, as a shape ------------------------------------------------

  it('corners the pin at the notch rather than gripping it', () => {
    const d = derived();
    const [, S, A, N, B] = camPath(camSpec(d));
    // The whole latch in one assertion. The band pulls the pin toward LOWER u,
    // and both of the notch's neighbours sit at HIGHER u -- so on the side it
    // is being pulled, there is no groove at all.
    expect(A!.u).toBeGreaterThan(N!.u);
    expect(B!.u).toBeGreaterThan(N!.u);
    expect(N!.u).toBeGreaterThan(S!.u);
    // The two apexes are on opposite sides, and rest is biased toward the one
    // the pin has to take first.
    expect(A!.v).toBeLessThan(0);
    expect(B!.v).toBeGreaterThan(0);
    expect(S!.v).toBeLessThan(0);
    expect(Math.abs(S!.v)).toBeLessThan(Math.abs(A!.v));
    // And the notch is exactly as far from rest as the band throws the drawer,
    // or the pin comes to rest somewhere the groove does not expect it.
    expect(N!.u).toBeCloseTo(d.pop, 9);
  });

  it('ramps the groove floor up, then drops it at every corner', async () => {
    const m = await kernel();
    try {
      const d = derived();
      const drawer = buildDrawer(m, d, noIssue);
      const base = d.boxZ;
      // The groove is cut UPWARD into the drawer's floor, so its floor is a
      // ceiling: stand a column on the underside and see where material starts.
      const depthAt = (x: number, y: number): number | null => {
        const col = m.Manifold.cube([0.25, 0.25, 60], true).translate([x, y, base]);
        const bit = drawer.intersect(col);
        if (bit.volume() <= 1e-9) return null;
        return bit.boundingBox().min[2]! - base;
      };

      // Every segment is swept at the full groove width, so near a corner two
      // of them share the same ground and the deeper one wins. A fixed skirt
      // is not enough to step clear of that: at this cam's proportions the
      // apexes close to 26 degrees and the neighbour reaches ten millimetres
      // back. So find, per segment, the stretch of it that NO other segment
      // covers, and read the ramp only there.
      const segs = camSegments(camSpec(d)).map(([a, b]) => {
        const [ax, ay] = camToLocal(a);
        const [bx, by] = camToLocal(b);
        return { ax, ay, bx, by, len: Math.hypot(bx - ax, by - ay) };
      });
      const distTo = (s: (typeof segs)[number], px: number, py: number) => {
        const dx = s.bx - s.ax;
        const dy = s.by - s.ay;
        const t = Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / (dx * dx + dy * dy)));
        return Math.hypot(px - (s.ax + t * dx), py - (s.ay + t * dy));
      };
      const soleRange = (i: number) => {
        const s = segs[i]!;
        const ts: number[] = [];
        for (let t = 0.02; t <= 0.98; t += 0.01) {
          const px = s.ax + t * (s.bx - s.ax);
          const py = s.ay + t * (s.by - s.ay);
          const clean = segs.every((o, j) => j === i || distTo(o, px, py) > d.grooveW / 2 + 0.25);
          if (clean) ts.push(t);
        }
        return ts.length >= 2 ? ([ts[0]!, ts[ts.length - 1]!] as const) : null;
      };

      let ramped = 0;
      for (let i = 1; i < segs.length; i++) {
        const s = segs[i]!;
        const sole = soleRange(i);
        if (!sole) continue;
        const [t0, t1] = sole;
        const len = (t1 - t0) * s.len;
        const at = (t: number) =>
          depthAt(d.xNotch + s.ax + t * (s.bx - s.ax), camOriginY(d) + s.ay + t * (s.by - s.ay));
        const start = at(t0);
        const end = at(t1);

        // It started near full depth again, so the floor DROPPED at the corner
        // behind it rather than carrying on up. That reset is the ratchet --
        // and the island cam this generator shipped with first had no
        // equivalent anywhere, which is exactly why it never latched.
        expect(start, 'floor early in a segment').not.toBeNull();
        expect(end, 'floor late in a segment').not.toBeNull();
        expect(start!).toBeGreaterThan(d.camDeep - 0.7 * d.camStep);
        expect(start!).toBeLessThanOrEqual(d.camDeep + 0.05);
        expect(end!).toBeLessThanOrEqual(start! + 0.02);
        if (len >= 3 * d.grooveW) {
          expect(end!).toBeLessThan(start! - d.camStep * 0.15);
          ramped++;
        }
      }
      // The two long runs are the ones the pin coasts down. If neither could be
      // measured, this test has stopped testing anything.
      expect(ramped).toBeGreaterThanOrEqual(2);
    } finally {
      cleanup();
    }
  });

  // --- what two prints have to agree on -----------------------------------

  it('hangs the drawer on the rail flanks, clear of the crests and the arm', () => {
    const d = derived();
    expect(d.crestClear).toBeGreaterThan(0.5);
    // The slot's slanted wall and the rail's flank are the same 45-degree plane.
    const railOuter = d.railX + d.railBase / 2;
    const flankZ0 = d.railH - d.headH;
    // Parallel to it, offset outward by one running clearance along the normal.
    expect(d.slotMouth - d.hb).toBeCloseTo(railOuter - flankZ0 + Math.SQRT2 * d.clear, 6);
    // The mouth clears the rail's base, and the head still overhangs it by more
    // than a millimetre: the drawer goes on from the end and cannot lift off.
    expect(d.slotMouth).toBeGreaterThan(railOuter + d.clear);
    expect(railOuter + d.headOvh - d.slotMouth).toBeGreaterThan(1);
    // Under the drawer: the arm clears the drawer's underside, the pin reaches
    // PAST the deepest floor of the groove so it is always pressing up, and the
    // band posts stay below the drawer altogether.
    expect(d.armH).toBeLessThan(d.hb);
    expect(d.bossTop).toBeCloseTo(d.boxZ + d.camDeep + d.pinPreload, 6);
    expect(d.postTop).toBeLessThan(d.boxZ);
  });

  it('builds a case that measures what was asked for', async () => {
    const m = await kernel();
    try {
      const d = derived();
      const b = buildCase(m, d).boundingBox();
      // Ears stand outside the width; nothing stands above the wall tops.
      expect(b.max[0]! - b.min[0]!).toBeCloseTo(d.W + 2 * d.earOut, 3);
      expect(b.max[1]! - b.min[1]!).toBeCloseTo(d.D, 3);
      expect(b.max[2]!).toBeCloseTo(d.H, 3);
      expect(b.min[2]!).toBeCloseTo(0, 3);
    } finally {
      cleanup();
    }
  });

  it('keeps the case and the drawer as single bodies', async () => {
    const m = await kernel();
    try {
      const d = derived();
      expect(shells(buildCase(m, d))).toBe(1);
      expect(shells(buildDrawer(m, d, noIssue))).toBe(1);
      expect(shells(buildStopBar(m, d))).toBe(1);
      expect(shells(buildStopScrew(m, d, 1))).toBe(1);
      expect(shells(buildTravelPin(m, d, 1))).toBe(1);
      const two = derived({ drawers: 2 });
      expect(shells(buildStackScrew(m, two, 1, 1))).toBe(1);
      expect(shells(buildDovetailKey(m, derived({ drawers: 2, connector: 'dovetail' }), 1, 1))).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('leaves the drawer clear of the case everywhere but inside the cam pocket', async () => {
    const m = await kernel();
    try {
      const d = derived();
      const kase = buildCase(m, d);
      const drawer = buildDrawer(m, d, noIssue);
      const pk = pocket(m, d);
      // Shut, pressed all the way in, popped, half open, and at the stop. The
      // pin and posts live in the pocket and may touch cam islands there --
      // that is the mechanism -- but nothing may foul outside it.
      for (const out of [0, -d.over, d.pop, d.travel / 2, d.travel]) {
        const at = drawer.translate([0, -out, 0]);
        const clash = kase.intersect(at).subtract(pk.translate([0, -out, 0]));
        expect(clash.volume(), `drawer out ${out.toFixed(0)} mm`).toBeLessThan(SLIVER);
      }
    } finally {
      cleanup();
    }
  });

  it('presses the pin into the notch when shut, and touches the drawer nowhere else', async () => {
    const m = await kernel();
    try {
      const d = derived();
      const kase = buildCase(m, d);
      const drawer = buildDrawer(m, d, noIssue);
      // Shut, the only contact is the pin, and it is INTERFERENCE: the pin is
      // modelled past the deepest floor so the arm is bowed and pressing up the
      // whole time. A pin that merely touches drops out at the first ramp.
      const clash = kase.intersect(drawer);
      const nominal = Math.PI * (d.bossD / 2) ** 2 * d.pinPreload;
      expect(clash.volume()).toBeGreaterThan(0.05);
      expect(clash.volume()).toBeLessThan(nominal * 2.5);
      const b = clash.boundingBox();
      expect((b.min[1]! + b.max[1]!) / 2).toBeCloseTo(d.yBoss, 0);
      expect(Math.abs(b.min[0]! - d.xNotch)).toBeLessThan(d.bossD);

      // Open, the pin has left the cam through the funnel and is clear.
      expect(kase.intersect(drawer.translate([0, -d.travel, 0])).volume()).toBeLessThan(SLIVER);

      // The groove is a channel, not a hole in the bottom of the drawer: there
      // is still a skin of material over its deepest floor.
      const skin = m.Manifold.cube([0.4, 0.4, 0.4], true).translate([
        d.xNotch,
        funnelY(d) - 2,
        d.boxZ + d.camDeep + d.skin / 2,
      ]);
      expect(skin.subtract(drawer).volume()).toBeLessThan(SLIVER * 0.2);
    } finally {
      cleanup();
    }
  });

  it('stops the drawer on its pins at the bar, and not before', async () => {
    const m = await kernel();
    try {
      const d = derived();
      const bar = buildStopBar(m, d);
      const pins = m.Manifold.union([buildTravelPin(m, d, -1), buildTravelPin(m, d, 1)]);
      expect(pins.intersect(bar).volume()).toBeLessThan(SLIVER);
      expect(pins.translate([0, -(d.travel - 1), 0]).intersect(bar).volume()).toBeLessThan(SLIVER);
      expect(pins.translate([0, -(d.travel + 1), 0]).intersect(bar).volume()).toBeGreaterThan(0.5);
      // The pins hang under the drawer but clear the case floor and the bar's
      // top as they run over it.
      const kase = buildCase(m, d);
      for (const out of [0, d.travel / 2]) {
        expect(pins.translate([0, -out, 0]).intersect(kase).volume()).toBeLessThan(SLIVER);
      }
      // The heads hang low enough to meet the bar, and high enough to clear the floor.
      expect(d.boxZ - d.pinHeadH).toBeLessThan(d.wall + d.barT - 0.5);
      expect(d.boxZ - d.pinHeadH).toBeGreaterThan(d.wall + 0.5);
    } finally {
      cleanup();
    }
  });

  it('mates every printed thread with its hole at a running clearance', async () => {
    const m = await kernel();
    try {
      const d = derived();
      const kase = buildCase(m, d);
      const drawer = buildDrawer(m, d, noIssue);
      const bar = buildStopBar(m, d);
      for (const s of [-1, 1] as const) {
        const screw = buildStopScrew(m, d, s);
        expect(screw.intersect(bar).volume()).toBeLessThan(SLIVER);
        expect(screw.intersect(kase).volume()).toBeLessThan(SLIVER);
        // It really is in the hole, not beside it.
        expect(m.Manifold.hull([screw]).intersect(bar).volume()).toBeGreaterThan(5);
        const pin = buildTravelPin(m, d, s);
        expect(pin.intersect(drawer).volume()).toBeLessThan(SLIVER);
        expect(m.Manifold.hull([pin]).intersect(drawer).volume()).toBeGreaterThan(5);
      }
    } finally {
      cleanup();
    }
  });

  // --- the band ------------------------------------------------------------

  it('lets the band throw the drawer a graspable distance, then go slack', () => {
    const d = derived();
    expect(d.pop).toBeGreaterThan(12);
    expect(d.pop).toBeLessThan(d.travel);
    // The case posts are ahead of the drawer's moats when shut: that is the
    // direction the band pulls.
    expect(d.postY).toBeLessThan(d.moatY);
    expect(d.bandStretchOpen).toBeLessThan(3);
  });

  // --- the stack -----------------------------------------------------------

  it('stacks two cases lug to lug with a screw through both', async () => {
    const m = await kernel();
    try {
      const d = derived({ drawers: 2, connector: 'screws' });
      const kase = buildCase(m, d);
      const upper = kase.translate([0, 0, d.H]);
      expect(kase.intersect(upper).volume()).toBeLessThan(SLIVER);
      // The upper case's bottom lug sits squarely on the lower's top lug.
      const outside = m.Manifold.union(
        ([-1, 1] as const).flatMap((sx) =>
          ([-1, 1] as const).map((sy) => {
            const l = lugAt(d, sx, sy);
            return m.Manifold.cube([l.x1 - l.x0 + 1, l.y1 - l.y0 + 1, 0.2], true).translate([
              (l.x0 + l.x1) / 2,
              (l.y0 + l.y1) / 2,
              d.H,
            ]);
          }),
        ),
      );
      const lugsTop = kase.intersect(outside.translate([0, 0, -0.2]));
      const lugsBot = upper.intersect(outside.translate([0, 0, 0.2]));
      // Same footprint either side of the seam; the holes through them differ
      // (a tapped hole below, a clearance hole above), so compare extents.
      expect(lugsTop.volume()).toBeGreaterThan(4 * d.lugW * d.lugL * 0.2 * 0.6);
      expect(lugsBot.volume()).toBeGreaterThan(4 * d.lugW * d.lugL * 0.2 * 0.6);
      const bt = lugsTop.boundingBox();
      const bb = lugsBot.boundingBox();
      for (const i of [0, 1]) {
        expect(bb.min[i]!).toBeCloseTo(bt.min[i]!, 1);
        expect(bb.max[i]!).toBeCloseTo(bt.max[i]!, 1);
      }
      // The screw threads the lower lug and passes the upper, touching neither.
      const screw = buildStackScrew(m, d, 1, 1).translate([0, 0, d.H]);
      expect(screw.intersect(kase).volume()).toBeLessThan(SLIVER);
      expect(screw.intersect(upper).volume()).toBeLessThan(SLIVER);
      expect(m.Manifold.hull([screw]).intersect(kase).volume()).toBeGreaterThan(50);
      expect(screw.boundingBox().max[2]!).toBeLessThanOrEqual(d.H + d.lugH + 1e-6);
    } finally {
      cleanup();
    }
  });

  it('keys two cases together with a dovetail slid in from the front', async () => {
    const m = await kernel();
    try {
      const d = derived({ drawers: 2, connector: 'dovetail' });
      const kase = buildCase(m, d);
      const upper = kase.translate([0, 0, d.H]);
      const key = buildDovetailKey(m, d, 1, 1).translate([0, 0, d.H]);
      expect(key.intersect(kase).volume()).toBeLessThan(SLIVER);
      expect(key.intersect(upper).volume()).toBeLessThan(SLIVER);
      // Both tenons are in their grooves: the key's hull overlaps both cases.
      const hull = m.Manifold.hull([key]);
      expect(hull.intersect(kase).volume()).toBeGreaterThan(10);
      expect(hull.intersect(upper).volume()).toBeGreaterThan(10);
      // And it cannot lift out: pushed straight up, it collides.
      expect(key.translate([0, 0, 1]).intersect(kase).volume()).toBeGreaterThan(0.5);
    } finally {
      cleanup();
    }
  });

  // --- the front -----------------------------------------------------------

  it('engraves the front without breaking through, and embosses without growing the box', async () => {
    const m = await kernel();
    try {
      const plain = derived({ surface: 'plain' });
      const base = buildDrawer(m, plain, noIssue);
      for (const surface of ['ribs', 'hex', 'voronoi', 'dots']) {
        const d = derived({ surface });
        const cut = buildDrawer(m, d, noIssue);
        expect(shells(cut), surface).toBe(1);
        expect(cut.volume(), surface).toBeLessThan(base.volume());
        expect(cut.volume(), surface).toBeGreaterThan(base.volume() * 0.97);
        // The relief stays in the front wall's outer half.
        const b = cut.boundingBox();
        expect(b.min[1]!, surface).toBeCloseTo(d.boxFrontY, 3);
      }
      const em = derived({ surface: 'hex', surfaceMode: 'emboss' });
      const raised = buildDrawer(m, em, noIssue);
      expect(shells(raised)).toBe(1);
      expect(raised.volume()).toBeGreaterThan(base.volume());
      expect(raised.boundingBox().min[1]!).toBeCloseTo(em.boxFrontY - Math.min(em.surfaceDepth, em.trayWall - 0.6) + 0.05, 2);
    } finally {
      cleanup();
    }
  });

  // --- the parts -----------------------------------------------------------

  it('builds every part in one piece and fits each on a bed', async () => {
    const m = await kernel();
    try {
      const out = pushDrawerGenerator.build(paramsWith(), ctxFor(m));
      expect(out.issues.filter((i) => i.level === 'error')).toEqual([]);
      expect(out.parts.map((p) => p.id)).toEqual([
        'case',
        'drawer',
        'stop-bar',
        'stop-screw-1',
        'stop-screw-2',
        'stop-pin-1',
        'stop-pin-2',
        'baseplate',
      ]);
      for (const part of out.parts) {
        expect(part.mesh.stats.volumeMm3, part.name).toBeGreaterThan(20);
        const [w, h] = layFlat(part).size;
        expect(Math.max(w, h), part.name).toBeLessThan(250);
      }
    } finally {
      cleanup();
    }
  });

  it('drops the latch parts when the latch is off', async () => {
    const m = await kernel();
    try {
      const d = derived({ latch: false });
      const kase = buildCase(m, d);
      const drawer = buildDrawer(m, d, noIssue);
      // No pin, no posts: nothing stands above the rails' crests on the floor
      // inside the walls.
      const inside = m.Manifold.cube([d.innerW - 1, d.D - 2 * d.wall - 1, d.H], true).translate([0, 0, d.wall + d.railH + 0.3 + d.H / 2]);
      expect(kase.intersect(inside).volume()).toBeLessThan(SLIVER);
      expect(kase.intersect(drawer).volume()).toBeLessThan(SLIVER);
    } finally {
      cleanup();
    }
  });

  it('builds every preset without an error', async () => {
    const m = await kernel();
    try {
      for (const preset of pushDrawerGenerator.presets ?? []) {
        const out = pushDrawerGenerator.build(paramsWith(preset.values), ctxFor(m));
        expect(out.issues.filter((i) => i.level === 'error').map((i) => i.message), preset.label).toEqual([]);
        expect(out.parts.length, preset.label).toBeGreaterThan(3);
      }
    } finally {
      cleanup();
    }
  });
});
