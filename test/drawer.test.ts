import type { ManifoldToplevel } from 'manifold-3d';
import { describe, expect, it } from 'vitest';
import { layFlat, packPlate } from '../src/core/build/layout';
import { coerceAll, defaultsOf } from '../src/core/params/validate';
import type { BuildCtx, Params } from '../src/core/params/types';
import { camPath, camSegments, camToLocal } from '../src/generators/drawer/cam';
import { drawerGenerator } from '../src/generators/drawer/build';
import { derive } from '../src/generators/drawer/geometry';
import { buildCarcass } from '../src/generators/drawer/parts/carcass';
import { beamFree, buildDeck } from '../src/generators/drawer/parts/deck';
import {
  backY,
  camOriginY,
  ejectFaceY,
  frontY,
  funnelY,
  pinY,
  trayBackY,
} from '../src/generators/drawer/parts/layout';
import { buildTray } from '../src/generators/drawer/parts/tray';
import { cleanup, kernel, loadFont } from './kernel';

function ctxFor(m: ManifoldToplevel): BuildCtx {
  return { m, font: (id) => loadFont(id), image: () => undefined, tolerance: 0.03, issue: () => {} };
}
const paramsWith = (patch: Params = {}): Params =>
  coerceAll(drawerGenerator, { ...defaultsOf(drawerGenerator), ...patch });
const derived = (patch: Params = {}) => derive(paramsWith(patch));

const SLIVER = 0.05;
const shells = (s: { decompose(): { volume(): number }[] }) =>
  s.decompose().filter((p) => p.volume() > SLIVER).length;

describe('under-desk drawer', () => {
  // --- the fit, which is the only thing that decides if it is a drawer ------

  it('never lets a groove cut through the side wall', () => {
    // A 2.5 mm tongue at 0.3 mm clearance eats 2.8 mm, and a 2.4 mm wall does
    // not have it. The side thickness is derived for exactly this reason, and
    // the latch deck's rails are cut into the same wall.
    const d = derived({ wall: 2.4, slideDepth: 2.5, clearance: 0.3 });
    expect(d.sideT).toBeGreaterThanOrEqual(d.slideP + d.clear + d.minWall);
    expect(d.sideT).toBeGreaterThanOrEqual(d.railD + d.clear + d.minWall);
    expect(d.sideT).toBeGreaterThan(d.wall);
    // A thick enough wall is left alone.
    expect(derived({ wall: 6, slideDepth: 2.5 }).sideT).toBe(6);
  });

  it('builds a carcass that measures what was asked for', async () => {
    const m = await kernel();
    try {
      for (const drawers of [1, 2]) {
        const d = derived({ drawers });
        const b = buildCarcass(m, d).boundingBox();
        // Nothing -- not a stop bump, not a rail snap -- may stand outside the
        // box, and the height is one opening per drawer.
        expect(d.H, `${drawers} drawers`).toBe(drawers * d.openH);
        expect(b.max[0]! - b.min[0]!).toBeCloseTo(d.W, 3);
        expect(b.max[1]! - b.min[1]!).toBeCloseTo(d.D, 3);
        expect(b.max[2]! - b.min[2]!, `${drawers} drawers`).toBeCloseTo(d.H + d.topT, 3);
      }
    } finally {
      cleanup();
    }
  });

  it('leaves every tray clear of the carcass through its whole travel', async () => {
    const m = await kernel();
    try {
      const d = derived();
      const carcass = buildCarcass(m, d);
      const tray = buildTray(m, d);
      // Shut, half open, and at the stop, for each drawer in the stack. Two
      // printed parts that foul anywhere in between is a drawer you can only
      // find out about after nine hours.
      for (const tier of d.tiers) {
        for (const out of [0, d.travel / 2, d.travel]) {
          const at = tray.translate([0, -out, tier.z0]);
          const clash = carcass.intersect(at);
          expect(clash.volume(), `${tier.name} open ${out} mm`).toBeLessThan(SLIVER);
        }
      }
    } finally {
      cleanup();
    }
  });

  it('stands the face proud so the push has somewhere to go', async () => {
    const m = await kernel();
    try {
      const d = derived();
      // Latched, the face is clear of the carcass by at least the overtravel:
      // flush would jam the whole mechanism against the front of the box before
      // the pin ever reached the notch.
      expect(d.standoff).toBeGreaterThanOrEqual(d.over);

      const carcass = buildCarcass(m, d);
      // Pressed fully in -- the release stroke -- it still must not touch.
      const pressed = buildTray(m, d).translate([0, d.over, 0]);
      expect(carcass.intersect(pressed).volume()).toBeLessThan(SLIVER);

      // With the latch off there is still the face plate's own bite to clear.
      expect(derived({ latch: false }).standoff).toBeLessThan(d.standoff);
    } finally {
      cleanup();
    }
  });

  // --- two drawers ---------------------------------------------------------

  it('stacks the second drawer without the two fronts grinding', async () => {
    const m = await kernel();
    try {
      const d = derived({ drawers: 2 });
      expect(d.tiers.map((t) => t.z0)).toEqual([d.openH, 0]);

      const tray = buildTray(m, d);
      const upper = tray.translate([0, 0, d.openH]);
      // The gap between one tray and the next is the running clearance and
      // nothing else, so a front that laps its tray at all laps the front below
      // it too. This measured 516 cubic millimetres of interference before the
      // faces were pulled in short of the tray.
      expect(tray.intersect(upper).volume()).toBeLessThan(SLIVER);

      // And the whole stack, fronts included, stays inside the carcass drop.
      const box = upper.boundingBox();
      expect(box.max[2]!).toBeLessThanOrEqual(d.H + 1e-6);
      expect(tray.boundingBox().min[2]!).toBeGreaterThanOrEqual(-1e-6);
    } finally {
      cleanup();
    }
  });

  it('gives a lone drawer the lapping front it can afford', () => {
    // Nothing above or below it, so the face laps the opening the old way.
    const one = derived({ drawers: 1 });
    expect(one.tiers).toHaveLength(1);
    expect(one.H).toBe(one.openH);
    expect(derived({ drawers: 2 }).H).toBe(2 * one.openH);
  });

  // --- the cam -------------------------------------------------------------

  it('corners the pin at the notch rather than gripping it', () => {
    const d = derived();
    const [, S, A, N, B] = camPath(d);
    // This is the whole latch in one assertion. The ejector pulls the pin
    // toward LOWER u, and both of the notch's neighbours sit at HIGHER u --
    // so on the side it is being pulled, there is no groove at all.
    expect(A!.u).toBeGreaterThan(N!.u);
    expect(B!.u).toBeGreaterThan(N!.u);
    // And the notch is further in than the rest position, or "closed" would be
    // further out than "open".
    expect(N!.u).toBeGreaterThan(S!.u);
    expect(N!.u).toBeCloseTo(d.pop, 9);
  });

  it('sends the pin round one way and not the other', () => {
    const d = derived();
    const [, S, A, , B] = camPath(d);
    // The two apexes are on opposite sides, and the rest position is biased
    // toward the one the pin is meant to take first.
    expect(A!.v).toBeLessThan(0);
    expect(B!.v).toBeGreaterThan(0);
    expect(S!.v).toBeLessThan(0);
    expect(Math.abs(S!.v)).toBeLessThan(Math.abs(A!.v));
  });

  it('ramps the groove floor up, then drops it at every corner', async () => {
    const m = await kernel();
    try {
      const d = derived();
      const tray = buildTray(m, d);
      const base = d.trayZ;

      // Probe the groove depth by standing a thin column on the tray's
      // underside and seeing where the material STARTS. The groove is cut
      // upward into the floor now, so its 'floor' is a ceiling and depth is
      // measured up from the underside rather than down from a plate's face.
      const depthAt = (x: number, y: number): number | null => {
        const col = m.Manifold.cube([0.25, 0.25, 60], true).translate([x, y, base]);
        const bit = tray.intersect(col);
        if (bit.volume() <= 1e-9) return null;
        return bit.boundingBox().min[2]! - base;
      };

      let ramped = 0;
      for (const [a, b] of camSegments(d).slice(1)) {
        const [ax, ay] = camToLocal(a);
        const [bx, by] = camToLocal(b);
        const len = Math.hypot(bx - ax, by - ay);
        // Sampled clear of both corners. Every segment's capsule reaches half a
        // groove width past its own ends, so a probe closer in than a full
        // groove width is reading the NEIGHBOUR'S floor, not this ramp -- which
        // is exactly what a fixed 30% read once the pin grew from 1.1 mm to 2.
        const skirt = d.grooveW / len;
        const at = (t: number) =>
          depthAt(ax + t * (bx - ax), camOriginY(d) + ay + t * (by - ay));
        const start = at(skirt);
        const end = at(1 - skirt);
        expect(start, 'floor early in a segment').not.toBeNull();
        expect(end, 'floor late in a segment').not.toBeNull();

        // It started near full depth again -- so the floor DROPPED at the
        // corner behind it rather than carrying on up. That reset is the
        // ratchet, and without it the pin walks back the way it came.
        expect(start!).toBeGreaterThan(d.camDeep - 0.5 * d.camStep);
        expect(start!).toBeLessThanOrEqual(d.camDeep + 0.05);
        // Never deeper at the end than at the start, on any segment.
        expect(end!).toBeLessThanOrEqual(start! + 0.05);

        // And on the long runs, where there is enough clean ramp between the
        // corners to measure one, it visibly climbs.
        if (len >= 4 * d.grooveW) {
          expect(end!).toBeLessThan(start! - d.camStep * 0.2);
          ramped++;
        }
      }
      // The two long runs are the ones the pin coasts down; if neither could be
      // measured this test has stopped testing anything.
      expect(ramped).toBeGreaterThanOrEqual(2);
    } finally {
      cleanup();
    }
  });

  // --- the printed follower ------------------------------------------------

  it('gives the beam the length its own strain budget asks for', () => {
    // The bay behind the tray is sized FROM the beam, not the other way round,
    // so this holds however the cam is set up. A beam that is merely as long as
    // it fits is a beam that cracks in a month.
    for (const patch of [{}, { camWidth: 24 }, { beamThickness: 2.4 }, { clearance: 0.6 }]) {
      const d = derived(patch);
      const free = beamFree(d);
      expect(free, JSON.stringify(patch)).toBeGreaterThanOrEqual(d.beamNeed - 1e-6);
      const strain = (3 * d.beamRoot * d.beamThrow) / (2 * free * free);
      expect(strain, JSON.stringify(patch)).toBeLessThan(0.02);
    }
  });

  it('makes the beam soft sideways and stiff downward at once', () => {
    const d = derived();
    // The two second moments of the same rectangle. This ratio is the entire
    // argument for a flat plate over a wire: one arm, both stiffnesses.
    const ratio = (d.deckT / d.beamRoot) ** 2;
    expect(ratio).toBeGreaterThan(3);
    // And the relief either side has to be wider than the swing, or the beam
    // closes the slit before it reaches the cam apex.
    expect(d.padW / 2 + d.beamThrow + 1).toBeGreaterThan(d.camV + d.pinD / 2);
  });

  it('holds the deck in its rails, clear of the carcass and blocked from sliding out', async () => {
    const m = await kernel();
    try {
      const d = derived();
      const carcass = buildCarcass(m, d);
      const deck = buildDeck(m, d)!;
      expect(shells(deck)).toBe(1);

      // Home, it is a running fit in the rails and touches nothing.
      expect(carcass.intersect(deck).volume()).toBeLessThan(SLIVER);
      // Its ends are actually IN the rails rather than floating between them.
      expect(deck.boundingBox().max[0]!).toBeGreaterThan(d.W / 2 - d.sideT);
      // And it cannot walk forward out of them: the snap bumps are in the way.
      const out = deck.translate([0, -2, 0]);
      expect(carcass.intersect(out).volume()).toBeGreaterThan(0.01);
    } finally {
      cleanup();
    }
  });

  it('presses the pin into the groove, and touches the tray nowhere else', async () => {
    const m = await kernel();
    try {
      const d = derived();
      const tray = buildTray(m, d);
      const deck = buildDeck(m, d)!;

      // Shut, the only contact is the pin, and it is INTERFERENCE: the pin is
      // modelled below the deepest floor so the beam is bowed upward and
      // pressing down the whole time. A pin that merely touches lifts out of
      // the groove the first time a ramp asks it to.
      const clash = tray.intersect(deck);
      const nominal = Math.PI * (d.pinD / 2) ** 2 * d.pinPreload;
      expect(clash.volume()).toBeGreaterThan(0.1);
      expect(clash.volume()).toBeLessThan(nominal * 1.5);
      const box = clash.boundingBox();
      expect((box.min[1]! + box.max[1]!) / 2).toBeCloseTo(pinY(d), 1);
      expect(Math.abs(box.min[0]!)).toBeLessThan(d.pinD);

      // Pressed fully in, the pin is under solid floor -- which is what the
      // beam being thrown sideways MEANS -- but nothing outside the cam
      // pattern may foul, because nothing outside it ever moves.
      const yLo = pinY(d) - d.over - d.grooveW;
      const yHi = funnelY(d) + d.grooveW;
      const bay = m.Manifold.cube([2 * d.camV + 2 * d.grooveW, yHi - yLo, 60], true).translate([
        0,
        (yLo + yHi) / 2,
        d.deckZ,
      ]);
      const pressed = deck.intersect(tray.translate([0, d.over, 0]));
      expect(pressed.subtract(bay).volume()).toBeLessThan(SLIVER);

      // Open, the pin has left the cam plate through the funnel and the deck is
      // clear of the tray altogether.
      expect(deck.intersect(tray.translate([0, -d.travel, 0])).volume()).toBeLessThan(SLIVER);
    } finally {
      cleanup();
    }
  });

  // --- the paperclip, for anyone who still wants it ------------------------

  // --- the latch lives under the tray, not behind it -----------------------

  it('costs the drawer height rather than depth', () => {
    const on = derived();
    const off = derived({ latch: false });

    // The whole point of the move. A latched drawer and a plain one are the
    // same length of tray in the same box -- the forty millimetres the bay
    // behind the tray used to eat are simply not spent any more.
    expect(on.trayD).toBeCloseTo(off.trayD, 6);
    // And the tray really does run back to the wall, bar the press stroke.
    expect(trayBackY(on)).toBeCloseTo(backY(on) - on.over - on.clear, 6);

    // What it costs instead is the bay, and the bay plus the tray plus one
    // running clearance is the opening. Nothing is unaccounted for.
    expect(on.bayH).toBeGreaterThan(0);
    expect(on.trayZ).toBe(on.bayH);
    expect(on.bayH + on.trayH + on.clear).toBeCloseTo(on.openH, 6);
    expect(off.bayH).toBe(0);
  });

  it('hangs nothing below the tray, so it still prints on its own floor', async () => {
    const m = await kernel();
    try {
      const d = derived();
      const tray = buildTray(m, d);
      // Everything the tray gives the latch is a RECESS. Put a lug under the
      // floor instead and the part prints standing on the lug with its whole
      // floor in mid-air -- so behind the face plate there must be nothing at
      // all below the underside.
      const len = d.trayD + 40;
      const under = m.Manifold.cube([d.trayW + 40, len, 40], true).translate([
        0,
        frontY(d) + d.frontBite + len / 2,
        d.trayZ - 20,
      ]);
      expect(tray.intersect(under).volume()).toBeLessThan(SLIVER);
      // The face plate is the one thing that does reach down, and on purpose:
      // it covers the mouth of the bay.
      expect(tray.boundingBox().min[2]!).toBeLessThan(d.trayZ);
    } finally {
      cleanup();
    }
  });

  it('never lets the groove break through into the tray', async () => {
    const m = await kernel();
    try {
      const d = derived();
      const tray = buildTray(m, d);
      // The groove is cut UP into a floor only 2 mm thick, which is why the
      // floor is thickened over the cam's footprint. Take the pad away and the
      // heart cam is a hole in the bottom of the drawer.
      expect(d.camPadT).toBeGreaterThan(d.camDeep + d.minPlate - 1e-9);
      const y0 = pinY(d) - d.over;
      const y1 = trayBackY(d) - 4;
      const skin = m.Manifold.cube([d.camPadW - 8, y1 - y0, 0.4], true).translate([
        0,
        (y0 + y1) / 2,
        d.trayZ + d.camDeep + 0.2,
      ]);
      expect(skin.subtract(tray).volume()).toBeLessThan(SLIVER);
    } finally {
      cleanup();
    }
  });

  it('swallows the ejector seat in the tray’s own tunnel', async () => {
    const m = await kernel();
    try {
      const d = derived();
      const carcass = buildCarcass(m, d);
      const tray = buildTray(m, d);

      const bore = m.Manifold.cube(
        [d.tunnelW, trayBackY(d) - ejectFaceY(d), d.tunnelH],
        true,
      ).translate([
        0,
        (trayBackY(d) + ejectFaceY(d)) / 2,
        d.trayZ + d.tunnelFloor + d.tunnelH / 2,
      ]);

      // The seat is genuinely inside the tray when the drawer is shut -- that
      // is what lets the ejector push on a face that is under the tray without
      // the tray growing a lug it could not be printed with.
      expect(carcass.intersect(bore).volume()).toBeGreaterThan(20);
      // And still nowhere near touching it, pressed all the way in.
      expect(carcass.intersect(tray.translate([0, d.over, 0])).volume()).toBeLessThan(SLIVER);
    } finally {
      cleanup();
    }
  });

  it('runs the pin out along its relief instead of dragging it on the floor', async () => {
    const m = await kernel();
    try {
      const d = derived();
      const tray = buildTray(m, d);
      const deck = buildDeck(m, d)!;
      // Once past the funnel the pin is off the cam altogether, and without a
      // relief carried back to the tray's edge it would ride the flat of the
      // underside -- the beam bowed the whole depth of the cam, all the way
      // open, every time. The clash may never be more than the groove is deep.
      const cap = Math.PI * (d.pinD / 2) ** 2 * (d.pinPreload + d.camStep) * 1.6;
      for (const out of [d.pop, d.reach * 0.5, d.reach - d.backGap - 1]) {
        const clash = deck.intersect(tray.translate([0, -out, 0]));
        expect(clash.volume(), `open ${out.toFixed(0)} mm`).toBeLessThan(cap);
        const b = clash.boundingBox();
        expect(Math.abs(b.min[0]!), `open ${out.toFixed(0)} mm`).toBeLessThan(d.pinD);
      }
    } finally {
      cleanup();
    }
  });

  it('keeps the wire a length a paperclip can actually be', () => {
    const d = derived({ follower: 'wire' });
    const arm = d.reach;
    expect(arm).toBeGreaterThan(10);
    expect(arm).toBeLessThan(60);
    // The whole cam pattern, funnel and all, has to land under the tray rather
    // than off the back edge of it.
    expect(funnelY(d)).toBeLessThan(trayBackY(d));
    // A wire reaches less far and needs a shallower bay than a printed beam,
    // which is the only reason it is still an option -- and under the tray that
    // buys HEIGHT rather than depth.
    expect(d.reach).toBeLessThan(derived().reach);
    expect(d.bayH).toBeLessThan(derived().bayH);
    expect(d.trayH).toBeGreaterThan(derived().trayH);
    // Neither of them costs the drawer a millimetre of depth.
    expect(d.trayD).toBeCloseTo(derived().trayD, 6);
  });

  it('swaps the gauge in for the deck when the follower is a wire', async () => {
    const m = await kernel();
    try {
      const wire = drawerGenerator.build(paramsWith({ drawers: 1, follower: 'wire' }), ctxFor(m));
      expect(wire.parts.map((p) => p.id)).toEqual(['carcass', 'tray', 'spring', 'gauge']);
      expect(buildDeck(m, derived({ follower: 'wire' }))).toBeNull();

      const printed = drawerGenerator.build(paramsWith({ drawers: 1 }), ctxFor(m));
      expect(printed.parts.map((p) => p.id)).toEqual(['carcass', 'tray', 'deck', 'spring']);
    } finally {
      cleanup();
    }
  });

  // --- the ejector ---------------------------------------------------------

  it('makes the spring long enough to still be pushing when the tray is out', () => {
    const d = derived();
    // Free length shorter than the gap it lives in is a spring that is simply
    // not touching anything, which is what a hand-picked number gave.
    expect(d.springFree).toBeGreaterThan(d.springGap + d.pop);
    // And it still has to fold up inside the gap at the bottom of the press.
    expect((d.springTurns + 1) * d.springT).toBeLessThan(d.springGap - d.over);
  });

  // --- the parts -----------------------------------------------------------

  it('builds every part in one piece, and each of them fits a bed', async () => {
    const m = await kernel();
    try {
      const out = drawerGenerator.build(paramsWith(), ctxFor(m));
      expect(out.issues.filter((i) => i.level === 'error')).toEqual([]);
      expect(out.parts.map((p) => p.id)).toEqual([
        'carcass',
        'tray-1',
        'tray-2',
        'deck-1',
        'deck-2',
        'spring-1',
        'spring-2',
      ]);
      for (const part of out.parts) {
        expect(part.mesh.stats.volumeMm3, part.name).toBeGreaterThan(50);
        const [w, h] = layFlat(part).size;
        expect(Math.max(w, h), part.name).toBeLessThan(246);
      }
      // Two drawers is genuinely two plates on a 256 bed -- the carcass and two
      // trays do not share one. One drawer does.
      const single = drawerGenerator.build(paramsWith({ drawers: 1 }), ctxFor(m));
      const plate = packPlate(single.parts, [256, 256]);
      expect(plate.overflow).toEqual([]);
      expect(plate.fits).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('keeps the carcass and tray as single bodies', async () => {
    const m = await kernel();
    try {
      const d = derived();
      expect(shells(buildCarcass(m, d))).toBe(1);
      expect(shells(buildTray(m, d))).toBe(1);
      // Dividers, a bar pull and no latch: a different set of unions entirely.
      const alt = derived({ latch: false, frontStyle: 'bar', dividersX: 3, dividersY: 2 });
      expect(shells(buildTray(m, alt))).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('drops the latch parts when the latch is off', async () => {
    const m = await kernel();
    try {
      const out = drawerGenerator.build(paramsWith({ latch: false, drawers: 1 }), ctxFor(m));
      expect(out.parts.map((p) => p.id)).toEqual(['carcass', 'tray']);
      const d = derived({ latch: false });
      expect(d.bayH).toBe(0);
      // The bay goes with it, so the whole opening is tray again.
      expect(d.trayH).toBeGreaterThan(derived().trayH);
      expect(d.trayH).toBeCloseTo(d.openH - d.clear, 6);
    } finally {
      cleanup();
    }
  });

  it('no longer refuses a shallow carcass, because the latch is not behind the tray', () => {
    // This exact drawer -- a short box with a long lead-in and a big pop-out --
    // was an error before the latch moved underneath: the bay behind the tray
    // wanted more room than the whole carcass had. Under the tray it costs
    // nothing but a run along the floor.
    const p = paramsWith({ depth: 80, leadIn: 20, pop: 25, drawers: 1, travel: 60 });
    const errors = (drawerGenerator.validate?.(p) ?? []).filter((i) => i.level === 'error');
    expect(errors.map((i) => i.message)).toEqual([]);
  });

  it('refuses a drawer too short for the latch to live under', () => {
    // The latch costs HEIGHT now, and there is a floor under how much of the
    // opening it may take: a thick floor, a fat beam and a 25 mm drawer leaves
    // the ejector tunnel standing in a tray with nothing above it.
    const errors = (
      drawerGenerator.validate?.(paramsWith({ height: 25, trayFloor: 5, beamThickness: 2.5 })) ?? []
    )
      .filter((i) => i.level === 'error')
      .map((i) => i.message);
    expect(errors.join(' ')).toMatch(/ejector tunnel|latch bay/);
  });

  it('builds every preset without an error', async () => {
    const m = await kernel();
    try {
      for (const preset of drawerGenerator.presets ?? []) {
        const out = drawerGenerator.build(paramsWith(preset.values), ctxFor(m));
        expect(
          out.issues.filter((i) => i.level === 'error').map((i) => i.message),
          preset.label,
        ).toEqual([]);
        expect(out.parts.length, preset.label).toBeGreaterThan(1);
      }
    } finally {
      cleanup();
    }
  });
});
