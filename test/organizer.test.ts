import type { ManifoldToplevel } from 'manifold-3d';
import { describe, expect, it } from 'vitest';
import { layFlat, packPlate } from '../src/core/build/layout';
import { coerceAll, defaultsOf } from '../src/core/params/validate';
import type { BuildCtx, Params } from '../src/core/params/types';
import { organizerGenerator } from '../src/generators/organizer/build';
import {
  backX,
  bodyW,
  cableDropY,
  clipSpec,
  derive,
  faceX,
  phoneFootZ,
  passDropY,
  puckRing,
  ringMinH,
  seatDepth,
  standBay,
  standSoftR,
  type Bay,
} from '../src/generators/organizer/geometry';
import { buildBase } from '../src/generators/organizer/parts/base';
import {
  buildCards,
  buildModule,
  moduleHeight,
} from '../src/generators/organizer/parts/modules';
import { buildBackWall, shelfZ } from '../src/generators/organizer/parts/backwall';
import { buildFrontTray } from '../src/generators/organizer/parts/fronttray';
import { buildPanel } from '../src/generators/organizer/parts/panel';
import { buildStand } from '../src/generators/organizer/parts/stand';
import { cleanup, kernel, loadFont } from './kernel';

function ctxFor(m: ManifoldToplevel): BuildCtx {
  return { m, font: (id) => loadFont(id), image: () => undefined, tolerance: 0.03, issue: () => {} };
}
const paramsWith = (patch: Params = {}): Params =>
  coerceAll(organizerGenerator, { ...defaultsOf(organizerGenerator), ...patch });
const derived = (patch: Params = {}) => derive(paramsWith(patch));

/** One of every kind at once. There are exactly as many kinds as there are slots. */
const ALL_KINDS: Params = {
  slot1: 'cards',
  slot2: 'stand',
  slot3: 'cup',
  slot4: 'tray',
  slot5: 'pentray',
};

const SLIVER = 0.05;
const shells = (s: { decompose(): { volume(): number }[] }) =>
  s.decompose().filter((p) => p.volume() > SLIVER).length;

describe('desk organizer', () => {
  // --- the layout ----------------------------------------------------------

  it('sizes the plate from the modules, not the other way round', () => {
    const d = derived();
    const span = d.bays.reduce((a, b) => a + b.w, 0) + (d.bays.length - 1) * d.gap;
    expect(d.W).toBeCloseTo(span + 2 * d.margin, 9);

    // Each module is as wide as the thing it holds -- the stand by the phone,
    // the cup by the cup. Equal bays would leave a pen cup with air beside it.
    expect(d.bays.find((b) => b.kind === 'stand')!.w).toBeCloseTo(d.phoneW + 2 * d.wall, 9);
    expect(d.bays.find((b) => b.kind === 'cup')!.w).toBeCloseTo(d.cupD, 9);

    // Drop a module and the plate gets narrower by exactly that much.
    const narrower = derived({ slot3: 'none' });
    expect(narrower.W).toBeCloseTo(d.W - d.cupD - d.gap, 6);
  });

  it('lays the bays out left to right without overlapping', () => {
    const d = derived(ALL_KINDS);
    expect(d.bays).toHaveLength(5);
    for (let i = 1; i < d.bays.length; i++) {
      const prev = d.bays[i - 1]!;
      const here = d.bays[i]!;
      // Exactly one reveal between them, every time.
      expect(here.cx - here.w / 2 - (prev.cx + prev.w / 2)).toBeCloseTo(d.gap, 6);
    }
    // And the outer edges sit a margin in from the plate.
    expect(d.bays[0]!.cx - d.bays[0]!.w / 2).toBeCloseTo(-d.W / 2 + d.margin, 6);
    const last = d.bays[d.bays.length - 1]!;
    expect(last.cx + last.w / 2).toBeCloseTo(d.W / 2 - d.margin, 6);
  });

  // --- the back wall -------------------------------------------------------

  const WALL = { backWall: 150, keyHooks: 4, watchPost: true, coinShelf: 75 } as Params;

  it('stands a back wall on the plate without either occupying the other', async () => {
    const m = await kernel();
    try {
      const d = derived(WALL);
      const back = buildBackWall(m, d)!;
      const base = buildBase(m, d);
      expect(back, 'there is a wall').toBeTruthy();
      expect(shells(back), 'the wall and everything on it is one body').toBe(1);
      expect(shells(base), 'the plate is still one piece').toBe(1);

      // The tongue is IN the slot, not resting on a closed plate.
      expect(base.intersect(back).volume(), 'wall vs plate').toBeLessThan(SLIVER);
      const below = back.boundingBox().min[2]!;
      expect(below, 'the tongue reaches below the plate top').toBeLessThan(d.baseT);

      // And it clears everything already on the plate -- it stands BEHIND them.
      for (const bay of d.bays) {
        const mod = bay.kind === 'stand' ? buildStand(m, d, bay) : buildModule(m, d, bay)!;
        expect(back.intersect(mod).volume(), `wall vs ${bay.kind}`).toBeLessThan(SLIVER);
      }
    } finally {
      cleanup();
    }
  }, 60000);

  it('grows the plate backward for the wall and leaves the modules where they were', () => {
    const plain = derived();
    const walled = derived(WALL);
    expect(walled.plateD).toBeGreaterThan(plain.plateD);
    expect(walled.D).toBe(plain.D);
    for (const [i, bay] of walled.bays.entries()) {
      expect(bay.cx, `bay ${i} did not move`).toBeCloseTo(plain.bays[i]!.cx, 9);
    }
    // The wall stands clear behind the modules, which end flush at D / 2.
    expect(walled.backY - walled.backWallT / 2).toBeGreaterThanOrEqual(walled.D / 2);
    // A wall FORM is already a back panel; there is nothing to add one to.
    expect(derived({ form: 'wall', ...WALL }).backWall).toBe(0);
  });

  it('tilts every hook up far enough to print in clean air and hold a ring', async () => {
    const m = await kernel();
    try {
      // The wall prints lying on its back, so a LEVEL peg is a post growing
      // sideways out of the bed -- and a ring slides off it the moment the
      // wall is knocked. The first version rotated these the wrong way: every
      // post went backward into the slab and every ball tip hung in mid-air
      // out in front of it, which decomposed into five separate bodies.
      const d = derived({ ...WALL, hookRise: 35 });
      const back = buildBackWall(m, d)!;
      expect(shells(back), 'nothing is hanging loose').toBe(1);

      // Material out in FRONT of the wall face, above the root: that is a hook
      // leaning up and out, and it is the whole claim.
      const rise = (d.hookRise * Math.PI) / 180;
      const y = d.backY - d.backWallT / 2 - d.hookLen * Math.cos(rise) * 0.6;
      const probe = m.Manifold.cube([d.W, 2, 2], true).translate([
        0,
        y,
        d.baseT + Math.max(d.backWallT * 2, d.backWall - Math.max(18, d.hookLen * 0.9)) +
          d.hookLen * Math.sin(rise) * 0.6,
      ]);
      expect(probe.intersect(back).volume(), 'hooks out in front and rising').toBeGreaterThan(1);

      // And nothing pokes out the BACK of the slab.
      // Above the joint, where the wall is meant to be a plain slab: the
      // tongue itself reaches behind the face on purpose, because that is what
      // an undercut is. Clear of the face by more than a rounded corner's own
      // faceting, which stands a couple of hundredths proud of the nominal.
      const up = d.baseT + d.dtH + 2;
      const behind = m.Manifold.cube([d.W, 8, d.backWall], true).translate([
        0,
        d.backY + d.backWallT / 2 + 4.5,
        up + d.backWall / 2,
      ]);
      expect(behind.intersect(back).volume(), 'the back of the wall is flat').toBeLessThan(SLIVER);
    } finally {
      cleanup();
    }
  }, 60000);

  it('puts the shelf and the hooks at whichever end they were asked for', async () => {
    const m = await kernel();
    try {
      // Mass either side of the centreline is the whole claim: the shelf is by
      // far the heaviest thing on the wall, so whichever half it is on weighs
      // more, and swapping the sides has to swap the two numbers exactly.
      const halves = (patch: Params) => {
        const d = derived({ ...WALL, ...patch });
        const wall = buildBackWall(m, d)!;
        const side = (lo: number, hi: number) =>
          wall.intersect(
            m.Manifold.cube([hi - lo, 400, 400], true).translate([(lo + hi) / 2, 0, 0]),
          ).volume();
        return [side(-d.W / 2, 0), side(0, d.W / 2), wall.volume(), shells(wall)] as const;
      };

      const [aL, aR, aV, aS] = halves({ shelfSide: 'left', hookSide: 'right' });
      const [bL, bR, bV, bS] = halves({ shelfSide: 'right', hookSide: 'left' });
      expect(aS, 'one body either way').toBe(1);
      expect(bS).toBe(1);
      expect(aV, 'the same wall, mirrored').toBeCloseTo(bV, 3);
      expect(aL, 'left becomes right').toBeCloseTo(bR, 3);
      expect(aR, 'and right becomes left').toBeCloseTo(bL, 3);
      expect(aL, 'the shelf end is the heavy one').toBeGreaterThan(aR);

      // Both at the same end is a legal thing to ask for and must not put two
      // fittings in one place: the shelf takes its end, and the hooks group
      // against the shelf rather than through it.
      const [, , sameV, sameS] = halves({ shelfSide: 'left', hookSide: 'left' });
      expect(sameS, 'still one body').toBe(1);
      expect(sameV, 'and nothing lost inside anything else').toBeCloseTo(aV, 3);
    } finally {
      cleanup();
    }
  }, 60000);

  it('groups the hooks instead of smearing them across the wall', async () => {
    const m = await kernel();
    try {
      // Spread across the free run, four hooks on a 200 mm wall were 60 mm
      // apart, which is not how anybody hangs keys -- and a group has a
      // position to ask for, where a smear does not.
      const d = derived({ ...WALL, keyHooks: 4, watchPost: false, coinShelf: 0 });
      const wall = buildBackWall(m, d)!;
      const bare = buildBackWall(m, derived({ ...WALL, keyHooks: 0, watchPost: false, coinShelf: 0 }))!;
      const cluster = wall.subtract(bare).boundingBox();
      const span = cluster.max[0]! - cluster.min[0]!;
      expect(span, 'four hooks, not four regions').toBeLessThan(90);
      // ...and it sits at the end it was sent to.
      expect(cluster.max[0]!, 'over on the right').toBeGreaterThan(d.W / 2 - d.margin - 12);

      const left = buildBackWall(m, derived({ ...WALL, keyHooks: 4, watchPost: false, coinShelf: 0, hookSide: 'left' }))!;
      const lc = left.subtract(bare).boundingBox();
      expect(lc.min[0]!, 'and over on the left').toBeLessThan(-(d.W / 2 - d.margin - 12));
      expect(lc.max[0]! - lc.min[0]!).toBeCloseTo(span, 3);
    } finally {
      cleanup();
    }
  }, 60000);

  it('hooks the watch bar up at the free end, and prints the hook in clean air', async () => {
    const m = await kernel();
    try {
      // A watch is DRAPED, not hung: the case lies on the arm and the strap
      // falls down both sides. A round post gives it a tangent line to balance
      // on; a plain flat stub gives it a seat and nothing to stop it walking
      // off the end. The upturn is the whole point.
      const d = derived({ ...WALL, keyHooks: 0, coinShelf: 0, watchPost: true });
      const wall = buildBackWall(m, d)!;
      expect(shells(wall), 'welded to the wall').toBe(1);
      const bar = wall.subtract(
        buildBackWall(m, derived({ ...WALL, keyHooks: 0, coinShelf: 0, watchPost: false }))!,
      );
      const bb = bar.boundingBox();
      const faceY = d.backY - d.backWallT / 2;
      const armBot =
        d.baseT +
        Math.max(d.backWallT * 2, d.backWall - Math.max(18, d.hookLen * 0.9)) -
        d.watchBarT / 2;
      const armTop = armBot + d.watchBarT;
      const lip = Math.max(3, Math.min(d.watchBarT, d.watchBarD / 2 - 2));
      const scoop = Math.min(2.5, lip / 2);

      expect(bb.max[0]! - bb.min[0]!, 'width').toBeCloseTo(d.watchBarW, 3);
      expect(bb.min[2]!, 'where the fittings hang').toBeCloseTo(armBot, 3);
      expect(bb.min[1]!, 'reach').toBeCloseTo(faceY - d.watchBarD, 3);
      // It stands proud of the arm -- that is the hook.
      expect(bb.max[2]! - armTop, 'the hook rises').toBeGreaterThan(lip * 0.6);

      const edges = (dz: number) => {
        const b = bar.slice(armBot + dz).bounds();
        return { front: b.min[1]!, back: b.max[1]! };
      };
      // The ARM: square at the back, top to bottom, and out to the full reach.
      // A rounded rectangle this thin comes out as a stadium -- round at BOTH
      // ends -- and its top rolls away from the wall a whole radius short.
      for (const dz of [0.4, d.watchBarT / 2, d.watchBarT - 0.4]) {
        expect(edges(dz).back, `meets the wall at ${dz.toFixed(1)}`).toBeCloseTo(faceY, 2);
      }
      // The front reaches all the way at every height but the rounded corners
      // themselves, which draw back by their own radius and are meant to.
      const r = Math.min(1.6, d.watchBarT / 3);
      for (const dz of [r + 0.6, d.watchBarT / 2, d.watchBarT - r - 0.6]) {
        expect(edges(dz).front, `full reach at ${dz.toFixed(1)}`).toBeCloseTo(bb.min[1]!, 1);
      }
      // Above the arm there is only the hook, and only at the free end.
      const up = edges(d.watchBarT + 1.5);
      expect(up.front, 'the hook is at the tip').toBeCloseTo(bb.min[1]!, 1);
      expect(faceY - up.back, 'and nowhere near the wall').toBeGreaterThan(d.watchBarD / 2);

      // And the inside of the hook is a ramp, not a square corner. The wall
      // prints lying on its back, so out of the face IS up: a square corner
      // would be the section jumping `lip` taller at the top of a 30 mm tower,
      // which is a flat unsupported ledge the full width of the bar. Nothing
      // may sit above the arm AND above a 45-degree line off it.
      const S = 800;
      const yStart = faceY - (d.watchBarD - lip - scoop);
      const overhang = bar
        .intersect(
          m.Manifold.cube([S, S, S], true)
            .translate([0, 0, S / 2])
            .rotate([-45, 0, 0])
            .translate([0, yStart + 0.35, armTop + 0.35]),
        )
        .intersect(m.Manifold.cube([S, S, S], true).translate([0, 0, armTop + 0.35 + S / 2]));
      expect(overhang.volume(), 'nothing printing on nothing').toBeLessThan(SLIVER);
    } finally {
      cleanup();
    }
  }, 60000);

  it('sets the change shelf above what is under IT, not above the tallest module', () => {
    // Measured against the tallest module anywhere, a shelf over a 60 mm card
    // rack stood 114 mm up to clear a phone stand at the far end of the plate.
    // A NARROW shelf, so only the card rack is under it. At 75 mm it reaches
    // past the rack into the phone stand beside it, and then it does have to
    // clear the stand -- which is the rule working, not failing.
    const d = derived({ ...WALL, coinShelf: 30, slot1: 'cards', slot2: 'stand', slot3: 'cup' });
    const tallest = Math.max(...d.bays.map((b) => moduleHeight(d, b)));
    expect(shelfZ(d)).toBeLessThan(tallest);
    expect(shelfZ(d)).toBeGreaterThan(0);
    // And it tracks what is actually beneath it: the same shelf over a card
    // rack sits lower than it does over a phone stand.
    const overStand = derived({ ...WALL, coinShelf: 30, slot1: 'stand', slot2: 'cards' });
    expect(shelfZ(d), 'over a card rack').toBeLessThan(shelfZ(overStand));
  });

  it('partitions a tray without turning it into slots you have to fish in', async () => {
    const m = await kernel();
    try {
      const d = derived({ slot1: 'tray', slot2: 'none', slot3: 'none', trayDivX: 3, trayDivY: 1 });
      const bay = d.bays[0]!;
      const tray = buildModule(m, d, bay)!;
      expect(shells(tray), 'one body, no loose fins').toBe(1);

      const w = bay.w - 2 * d.clear - 2 * d.wall;
      const dp = d.D - 2 * d.clear - 2 * d.wall;
      // A partition where one was asked for...
      const at = bay.cx - w / 2 + w / 4;
      const onIt = m.Manifold.cube([d.wall * 0.5, 4, 0.5], true).translate([
        at,
        0,
        bay.cz + d.wall + 2,
      ]);
      expect(tray.intersect(onIt).volume(), 'a partition across').toBeGreaterThan(SLIVER);
      const across = m.Manifold.cube([4, d.wall * 0.5, 0.5], true).translate([
        bay.cx,
        -dp / 2 + dp / 2,
        bay.cz + d.wall + 2,
      ]);
      expect(tray.intersect(across).volume(), 'and one front to back').toBeGreaterThan(SLIVER);

      // ...but nothing at the rim, or the tray no longer sweeps out.
      const atRim = m.Manifold.cube([d.wall * 0.5, 4, 0.5], true).translate([
        at,
        0,
        bay.cz + d.trayH - 0.4,
      ]);
      expect(tray.intersect(atRim).volume(), 'short of the rim').toBeLessThan(SLIVER);
    } finally {
      cleanup();
    }
  }, 60000);

  it('refuses to divide a tray into compartments nothing fits in', async () => {
    const m = await kernel();
    try {
      // Six partitions across a 40 mm tray is 5 mm a compartment. Rather than
      // hand back a comb, it stops dividing -- the same bargain the pen tray's
      // lanes make.
      const d = derived({ slot1: 'tray', slot2: 'none', slot3: 'none', trayWidth: 40, trayDivX: 6 });
      const tray = buildModule(m, d, d.bays[0]!)!;
      expect(shells(tray)).toBe(1);
      const plain = derived({ slot1: 'tray', slot2: 'none', slot3: 'none', trayWidth: 40 });
      expect(tray.volume()).toBeCloseTo(buildModule(m, plain, plain.bays[0]!)!.volume(), 3);
    } finally {
      cleanup();
    }
  }, 60000);

  it('partitions the front tray along its length', async () => {
    const m = await kernel();
    try {
      const d = derived({ frontLedge: 'tray', frontDepth: 26, frontTrayHeight: 15, frontTrayDiv: 4 });
      const tray = buildFrontTray(m, d)!;
      expect(shells(tray), 'one body').toBe(1);
      const plain = derived({ frontLedge: 'tray', frontDepth: 26, frontTrayHeight: 15 });
      expect(tray.volume()).toBeGreaterThan(buildFrontTray(m, plain)!.volume());
    } finally {
      cleanup();
    }
  }, 60000);

  // --- the pen rail --------------------------------------------------------

  it('grows the plate forward for the front ledge and leaves the modules where they were', async () => {
    const m = await kernel();
    try {
      const plain = derived();
      const railed = derived({ frontLedge: 'groove', frontDepth: 12 });

      // The plate gets deeper; nothing else moves. Every module is still the
      // same depth and still flush, which is the whole look -- the rail is a
      // ledge in FRONT of them, not a margin taken out of them.
      expect(railed.plateD).toBeGreaterThan(plain.plateD);
      expect(railed.D).toBe(plain.D);
      expect(railed.W).toBe(plain.W);
      for (const [i, bay] of railed.bays.entries()) {
        expect(bay.cx, `bay ${i} did not move`).toBeCloseTo(plain.bays[i]!.cx, 9);
      }

      const base = buildBase(m, railed);
      expect(shells(base), 'the plate is still one piece').toBe(1);
      // Against the plain plate rather than against `plateD`: a rounded corner
      // is a polygon, so both bounding boxes sit a fraction proud of the
      // nominal rectangle, and the difference is what this is about.
      const bb = base.boundingBox();
      const was = buildBase(m, plain).boundingBox();
      expect(
        bb.max[1]! - bb.min[1]! - (was.max[1]! - was.min[1]!),
        'deeper by exactly the ledge',
      ).toBeCloseTo(railed.plateD - plain.plateD, 3);
      // Grown FORWARD only, so the back edge is exactly where it always was.
      expect(bb.max[1]!, 'back edge unmoved').toBeCloseTo(was.max[1]!, 3);

      // There is a channel in the top of the ledge...
      const cy = railed.frontY;
      const inRail = m.Manifold.cube([20, railed.frontD - 1, 1], true).translate([
        0,
        cy,
        railed.baseT - 0.6,
      ]);
      expect(base.intersect(inRail).volume(), 'the channel is open').toBeLessThan(SLIVER);

      // ...and it stops short of the underside, or it would open the plate
      // straight into the cable run grooved along that underside.
      const under = m.Manifold.cube([20, railed.frontD - 1, 0.4], true).translate([0, cy, 0.2]);
      expect(base.intersect(under).volume(), 'floor left under the channel').toBeGreaterThan(1);
    } finally {
      cleanup();
    }
  }, 60000);

  it('leaves the plate alone with nothing in front, and on a wall', () => {
    expect(derived({ frontLedge: 'none' }).plateD).toBe(derived().D);
    // A wall panel is vertical: nothing stays in a channel cut into it, and a
    // tray hung off the front of one is a shelf, which the bays already are.
    expect(derived({ form: 'wall', frontLedge: 'tray' }).frontLedge).toBe('none');
  });

  it('builds the front tray into the plate on a desk, and hangs it on a wall', async () => {
    const m = await kernel();
    try {
      const opts = { frontLedge: 'tray', frontDepth: 26, frontTrayHeight: 15 } as Params;
      const d = derived(opts);
      const tray = buildFrontTray(m, d)!;
      expect(shells(tray), 'the tray is one body').toBe(1);
      expect(tray.boundingBox().max[1]!, 'entirely in front of the bays').toBeLessThan(
        -d.D / 2 + 0.01,
      );

      // On a DESK it is part of the plate: the plate grows by it, and there is
      // no tongue hanging below the top face to hang it by.
      const base = buildBase(m, d);
      const bare = buildBase(m, derived({ ...opts, frontLedge: 'none' }));
      expect(shells(base), 'the plate is still one body').toBe(1);
      expect(base.volume()).toBeGreaterThan(bare.volume());
      expect(tray.boundingBox().min[2]!, 'no tongue below the plate').toBeGreaterThanOrEqual(
        d.baseT - 1e-6,
      );

      // It is open at the top and floored -- measured on the plate it is now
      // part of, because that is the object.
      const inside = m.Manifold.cube([20, 4, 1], true).translate([
        0,
        d.frontY,
        d.baseT + d.frontTrayH - 0.6,
      ]);
      expect(base.intersect(inside).volume(), 'open at the top').toBeLessThan(SLIVER);
      const floor = m.Manifold.cube([20, 4, 0.4], true).translate([
        0,
        d.frontY,
        d.baseT + d.wall / 2,
      ]);
      expect(base.intersect(floor).volume(), 'and floored').toBeGreaterThan(1);
    } finally {
      cleanup();
    }
  }, 60000);

  it('never makes the front ledge too shallow for the joint under it', () => {
    // A 10 mm tray asked for on a 17.7 mm dovetail is not a 10 mm tray -- the
    // ledge is what carries the joint, and the tongue would otherwise run out
    // of it and into the feet of the modules behind.
    const d = derived({ frontLedge: 'tray', frontDepth: 10 });
    const dtFull = d.dtW + 2 * d.dtH * Math.tan((d.dtAngle * Math.PI) / 180);
    expect(d.frontD).toBeGreaterThan(dtFull);
    // A groove is only a hole, so it is free to be as narrow as it likes.
    expect(derived({ frontLedge: 'groove', frontDepth: 10 }).frontD).toBe(10);
  });

  // --- the pen tray --------------------------------------------------------

  it('lays a pen flat across the pen tray, in lanes, under a low rim', async () => {
    const m = await kernel();
    try {
      const d = derived({ slot1: 'pentray', slot2: 'none', slot3: 'none' });
      const bay = d.bays[0]!;
      const tray = buildModule(m, d, bay)!;
      expect(shells(tray)).toBe(1);

      // The point of the thing: a pen lies ACROSS it, so the clear span between
      // the walls has to take a pen's LENGTH. A deep tray is sized by what it
      // holds upright and would not.
      const clear = bay.w - 2 * d.clear - 2 * d.wall;
      expect(clear, 'a 140 mm biro lies flat').toBeGreaterThan(140);
      expect(moduleHeight(d, bay), 'and it stays low').toBeLessThan(d.trayH);

      // Lanes: ribs across the full width, so a pen cannot roll between rows.
      const dp = d.D - 2 * d.clear - 2 * d.wall;
      const laneD = (dp - (d.penLanes - 1) * d.wall) / d.penLanes;
      const rib = m.Manifold.cube([clear * 0.9, d.wall * 0.5, 0.5], true).translate([
        bay.cx,
        -dp / 2 + laneD + d.wall / 2,
        bay.cz + d.wall + 1,
      ]);
      expect(tray.intersect(rib).volume(), 'a rib between two lanes').toBeGreaterThan(SLIVER);

      // But short of the rim, or the tray never sweeps out in one go.
      const atRim = m.Manifold.cube([clear * 0.9, d.wall * 0.5, 0.5], true).translate([
        bay.cx,
        -dp / 2 + laneD + d.wall / 2,
        bay.cz + d.penH - 0.4,
      ]);
      expect(tray.intersect(atRim).volume(), 'and nothing at the rim').toBeLessThan(SLIVER);
    } finally {
      cleanup();
    }
  });

  it('leaves the pen tray plain on one lane, and never combs it into slivers', async () => {
    const m = await kernel();
    try {
      for (const patch of [{ penTrayLanes: 1 }, { penTrayLanes: 6, depth: 60 }]) {
        const d = derived({ slot1: 'pentray', slot2: 'none', slot3: 'none', ...patch });
        const bay = d.bays[0]!;
        const tray = buildModule(m, d, bay)!;
        // Six lanes in a 60 mm depth is under 8 mm a lane. Rather than hand back
        // a comb no pen fits in, it stops dividing -- so either way this is one
        // open box, not a row of slots.
        expect(shells(tray), JSON.stringify(patch)).toBe(1);
      }
    } finally {
      cleanup();
    }
  });

  it('gives each module its own margin, on all four sides', async () => {
    const m = await kernel();
    try {
      const plain = derived({ slot1: 'cup', slot2: 'cards', slot3: 'none' });
      const roomy = derived({ slot1: 'cup', slot2: 'cards', slot3: 'none', cupMargin: 6 });

      // Left and right it widens the BAY, so the neighbour is pushed away and
      // the plate grows -- the margin belongs to the cup, not to the set.
      expect(roomy.bays[0]!.w - plain.bays[0]!.w).toBeCloseTo(12, 9);
      expect(roomy.W - plain.W).toBeCloseTo(12, 9);
      expect(roomy.bays[1]!.w, 'the card rack is untouched').toBeCloseTo(plain.bays[1]!.w, 9);

      // Front and back it insets the BODY inside a plate that stays put.
      expect(roomy.plateD).toBeCloseTo(plain.plateD, 9);
      const cup = buildModule(m, roomy, roomy.bays[0]!)!;
      const was = buildModule(m, plain, plain.bays[0]!)!;
      expect(shells(cup)).toBe(1);
      const a = cup.boundingBox();
      const b = was.boundingBox();
      expect(a.min[1]! - b.min[1]!, 'front face pulled back by the margin').toBeCloseTo(6, 3);

      // And by the same at the back. With no dovetail left to slide onto there
      // is no foot that has to reach the back edge, so a desk module is simply
      // inset all round -- which is what a margin should have meant all along.
      expect(b.max[1]! - a.max[1]!, 'back face pulled in too').toBeCloseTo(6, 3);

      // The BODY is inset at the back all the same: above the plate, the last
      // six millimetres before the back edge are empty.
      const bay = roomy.bays[0]!;
      const behind = m.Manifold.cube([bay.w, 5, 4], true).translate([
        bay.cx,
        roomy.D / 2 - 2.6,
        bay.cz + 8,
      ]);
      expect(cup.intersect(behind).volume(), 'body inset at the back too').toBeLessThan(SLIVER);

      // And it is PART of the plate now rather than docked onto it, so the
      // plate contains it rather than clearing it.
      expect(buildBase(m, roomy).intersect(cup).volume()).toBeGreaterThan(cup.volume() * 0.9);
    } finally {
      cleanup();
    }
  }, 60000);

  it('makes the ring stand a panel with a window through it', async () => {
    const m = await kernel();
    try {
      const d = derived({ standStyle: 'ring', wireless: true });
      const bay = standBay(d)!;
      const ring = buildStand(m, d, bay);
      expect(shells(ring), 'one body').toBe(1);

      // A window, not a pocket: a column on the puck's axis passes clean
      // through the panel, which is the whole difference from the rest.
      const [fy, fz] = [
        faceX(d, d.puckH) - d.D / 2 + bay.margin,
        bay.cz + d.plateT + d.puckH,
      ];
      const probe = m.Manifold.cylinder(60, 1, 1, 24, true)
        .rotate([90 - d.lean, 0, 0])
        .translate([bay.cx, fy, fz]);
      expect(probe.intersect(ring).volume(), 'the middle is open').toBeLessThan(SLIVER);

      // Open right across the WINDOW, which is the shoulder's diameter rather
      // than the charger's -- the shoulder is the ring you see, and it is
      // material on purpose.
      const { inner, outer, shoulder } = puckRing(d);
      const ring1 = m.Manifold.cylinder(60, inner - 0.6, inner - 0.6, 48, true)
        .rotate([90 - d.lean, 0, 0])
        .translate([bay.cx, fy, fz]);
      expect(ring1.intersect(ring).volume(), 'nothing across the window').toBeLessThan(2);
      // And wide enough to be a rim rather than a hairline: a millimetre of it
      // holds the charger perfectly well and reads as a mistake.
      expect(shoulder, 'a rim you can see').toBeGreaterThan(3);
      expect(outer - shoulder, 'and a window you can get a thumb into').toBeGreaterThan(8);

      // The charger seats from the FRONT, against a shoulder left at the back.
      // Put the puck in its seat and check both halves of that: the seat is
      // open forwards over the puck's full thickness, and the annulus behind
      // it is solid, so the puck cannot go on through and drop out the back.
      const puck = (t: number, back: number) =>
        m.Manifold.cylinder(t, d.puckD / 2, d.puckD / 2, 64)
          .translate([0, 0, back])
          .rotate([90 - d.lean, 0, 0])
          .translate([bay.cx, fy, fz]);
      expect(puck(d.puckT - 0.2, -d.puckT + 0.1).intersect(ring).volume(), 'the seat is clear')
        .toBeLessThan(SLIVER);
      expect(puck(0.6, -d.puckT - 0.9).intersect(ring).volume(), 'stopped by a shoulder')
        .toBeGreaterThan(20);

      // And nothing breaks out of the bottom of the panel. The lead's way out
      // is a radial notch across the shoulder, entirely inside the window's own
      // circle -- it used to run DOWN the panel from the seat and stick out
      // below the circle as a tab, and run far enough it came out of the foot,
      // which is where the whole stand's load goes through.
      const foot = m.Manifold.cube([bay.w + 20, d.D + 20, 1.2], true).translate([
        bay.cx,
        0,
        bay.cz + d.plateT + 1.2,
      ]);
      const sole = ring.intersect(foot);
      const slotCol = m.Manifold.cube([Math.max(d.cableW, 4) - 0.6, d.D + 20, 4], true).translate([
        bay.cx,
        fy,
        bay.cz + d.plateT + 1.2,
      ]);
      expect(sole.intersect(slotCol).volume(), 'no slot out of the foot').toBeGreaterThan(5);

      // The top is an arc, so the panel is narrower up there than at its waist.
      const widthAt = (z: number) => {
        const slab = m.Manifold.cube([bay.w + 20, d.D + 20, 1], true).translate([bay.cx, 0, z]);
        const cut = ring.intersect(slab);
        if (cut.volume() < SLIVER) return 0;
        const b = cut.boundingBox();
        return b.max[0]! - b.min[0]!;
      };
      const waist = widthAt(bay.cz + d.plateT + 8);
      const crown = widthAt(bay.cz + d.standH - 6);
      expect(crown, 'rounded off at the top').toBeLessThan(waist - 4);
      expect(crown).toBeGreaterThan(0);

      // And it still docks on the plate without the two occupying each other.
      expect(buildBase(m, d).intersect(ring).volume()).toBeLessThan(SLIVER);
    } finally {
      cleanup();
    }
  }, 60000);

  it('lets the lead out across the shoulder, without a tab below the circle', async () => {
    const m = await kernel();
    try {
      // The lead used to leave the seat down a slot that ran below the window
      // and showed on the front as a little tab. It never needed to: the back
      // of the panel is a shoulder's width away, so the notch is radial and
      // lives entirely inside the window's own circle.
      const cos = (d: ReturnType<typeof derived>) => Math.cos((d.lean * Math.PI) / 180);
      const onAxis = (d: ReturnType<typeof derived>, bay: Bay, below: number) => {
        const h = d.puckH - below * cos(d);
        return m.Manifold.cube([Math.max(d.cableW, 4) - 1, 60, 1], true)
          .rotate([-d.lean, 0, 0])
          .translate([bay.cx, faceX(d, h) - d.D / 2 + bay.margin, bay.cz + d.plateT + h]);
      };

      for (const puckShoulder of [1.2, 4, 10]) {
        const d = derived({ wireless: true, puckShoulder });
        const bay = standBay(d)!;
        const ring = buildStand(m, d, bay);
        const r = puckRing(d);
        const tag = `shoulder ${puckShoulder}`;
        expect(shells(ring), tag).toBe(1);
        // One hole, not two: the notch has to join the window rather than
        // punch a second opening with the lead's way out inside it.
        expect(ring.genus(), `${tag}: one opening`).toBe(1);
        // Open across the shoulder, where the lead lies under the puck's rim.
        expect(ring.intersect(onAxis(d, bay, r.outer - 1)).volume(), `${tag}: a way out`)
          .toBeLessThan(SLIVER);
        // And solid everywhere below the seat -- no tab.
        for (const past of [1, 4, 9]) {
          expect(ring.intersect(onAxis(d, bay, r.outer + past)).volume(), `${tag}: no tab at +${past}`)
            .toBeGreaterThan(20);
        }
      }

      // The shoulder is capped by what the window is for. A small charger has
      // less to give, so asking for a huge rim gets the biggest one that still
      // leaves a hole you can push the puck out through.
      const small = derived({ wireless: true, puckDiameter: 30, puckShoulder: 15 });
      expect(puckRing(small).shoulder, 'trimmed').toBeLessThan(15);
      expect(puckRing(small).inner, 'and a window is left').toBeGreaterThan(5);
    } finally {
      cleanup();
    }
  }, 60000);

  it('flutes every box in the set, and never through its wall', async () => {
    const m = await kernel();
    try {
      const plain = derived({ fluted: false });
      const fluted = derived({ fluted: true });
      // Capped at a third of the wall: a finish that eats the wall is a hole
      // with a pattern round it.
      expect(fluted.fluteD).toBeLessThanOrEqual(fluted.wall / 3 + 1e-9);

      for (const kind of ['cup', 'tray', 'pentray', 'cards'] as const) {
        const a = plain.bays.find((b) => b.kind === kind);
        const b = fluted.bays.find((x) => x.kind === kind);
        if (!a || !b) continue;
        const bare = buildModule(m, plain, a)!;
        const cut = buildModule(m, fluted, b)!;
        expect(shells(cut), kind).toBe(1);
        // Material came off the outside, and not very much of it.
        expect(cut.volume(), kind).toBeLessThan(bare.volume());
        expect(cut.volume(), kind).toBeGreaterThan(bare.volume() * 0.8);
        // The bay is unchanged: fluting is a finish, not a size.
        expect(b.w, kind).toBeCloseTo(a.w, 9);
        expect(cut.boundingBox().max[0]!, kind).toBeLessThanOrEqual(
          bare.boundingBox().max[0]! + 1e-6,
        );
      }

      // The front tray is the one other box in the set and gets the same.
      const t0 = buildFrontTray(m, derived({ frontLedge: 'tray', fluted: false }))!;
      const t1 = buildFrontTray(m, derived({ frontLedge: 'tray', fluted: true }))!;
      expect(shells(t1)).toBe(1);
      expect(t1.volume()).toBeLessThan(t0.volume());
    } finally {
      cleanup();
    }
  }, 60000);

  it('keeps the stand’s tabs on its face when it is given a margin', async () => {
    const m = await kernel();
    try {
      // A margin widens the BAY and leaves the body where it was, so anything
      // on the stand set out from the bay walks outward by the margin on each
      // side. The tabs did: at 6 mm they stood on bare plate with daylight
      // between them and the face they are part of, and the stand came back
      // three millimetres wider on each side than the body it belongs to.
      let lastW = -1;
      for (const standMargin of [0, 4, 6, 12]) {
        const d = derived({ standStyle: 'rest', lipStyle: 'tabs', ledgeHeight: 12, standMargin });
        const bay = standBay(d)!;
        const stand = buildStand(m, d, bay);
        const b = stand.boundingBox();
        const w = b.max[0]! - b.min[0]!;

        // One body, and the same width however much bare plate is asked for.
        expect(shells(stand), `margin ${standMargin}`).toBe(1);
        if (lastW >= 0) expect(w, `margin ${standMargin}`).toBeCloseTo(lastW, 3);
        lastW = w;

        // And never wider than the body it is built on: the bay grows, the
        // stand does not.
        expect(w, `margin ${standMargin}`).toBeLessThanOrEqual(bay.w - 2 * bay.margin + 1e-6);
      }
    } finally {
      cleanup();
    }
  }, 60000);

  // --- the dock ------------------------------------------------------------

  it('docks every module on a wall without either part occupying the other', async () => {
    const m = await kernel();
    try {
      // Only the wall still has a dock. A module on a vertical panel is held
      // by the joint and nothing else; one on a desk is held by gravity, and
      // all a dovetail did there was put a slot through the plate and a fit
      // between two parts to get wrong.
      const d = derived({ ...ALL_KINDS, form: 'wall' });
      const base = buildPanel(m, d)!;
      for (const bay of d.bays) {
        const mod = bay.kind === 'stand' ? buildStand(m, d, bay) : buildModule(m, d, bay)!;
        expect(base.intersect(mod).volume(), bay.kind).toBeLessThan(SLIVER);
        expect(shells(mod), bay.kind).toBe(1);
      }
    } finally {
      cleanup();
    }
  });

  it('leaves a shallow tray under the phone stand, and no joint anywhere else', async () => {
    const m = await kernel();
    try {
      const d = derived(ALL_KINDS);
      const base = buildBase(m, d);
      const bay = standBay(d)!;
      const stand = buildStand(m, d, bay);
      expect(shells(base), 'one plate with everything on it').toBe(1);

      // The stand is the only thing that lifts off, and it drops in rather
      // than sliding on: the two never occupy each other, and the pad under it
      // reaches BELOW the plate's top face, into the tray.
      expect(base.intersect(stand).volume(), 'stand vs plate').toBeLessThan(SLIVER);
      expect(stand.boundingBox().min[2]!).toBeCloseTo(bay.cz - seatDepth(d), 3);

      // Lift it out and what is left is a tray: empty to a floor one seat down,
      // and solid plate under that rather than a slot through it.
      const inTray = m.Manifold.cube([bay.w - 10, d.D - 20, 0.4], true).translate([
        bay.cx,
        0,
        bay.cz - seatDepth(d) / 2,
      ]);
      expect(base.intersect(inTray).volume(), 'the tray is empty').toBeLessThan(SLIVER);
      const under = m.Manifold.cube([bay.w - 10, d.D - 20, 0.4], true).translate([
        bay.cx,
        0,
        (bay.cz - seatDepth(d)) / 2,
      ]);
      expect(base.intersect(under).volume(), 'and floored, not slotted').toBeGreaterThan(50);

      // Every other module IS the plate now, so there is nothing to take off.
      for (const b of d.bays) {
        if (b.kind === 'stand') continue;
        const mod = buildModule(m, d, b)!;
        expect(base.intersect(mod).volume(), b.kind).toBeGreaterThan(mod.volume() * 0.9);
      }
    } finally {
      cleanup();
    }
  }, 60000);

  it('keeps the front edge of the plate unbroken', async () => {
    const m = await kernel();
    try {
      const d = derived();
      const base = buildBase(m, d);
      // A slice across the very front of the plate: the dovetails are stopped
      // short of it and the cable groove is stopped at the drop, so there is
      // solid plate all the way across the one edge that faces the room.
      const front = m.Manifold.cube([d.W, 1, d.baseT], true).translate([
        0,
        -d.D / 2 + 3,
        d.baseT / 2,
      ]);
      const cut = base.intersect(front);
      expect(shells(cut)).toBe(1);
      const b = cut.boundingBox();
      expect(b.max[2]! - b.min[2]!).toBeCloseTo(d.baseT, 1);
    } finally {
      cleanup();
    }
  });

  // --- charging ------------------------------------------------------------

  it('brings the cable up where the stand brings it down', async () => {
    const m = await kernel();
    try {
      // The REST, which is the one of the two that routes through the plate.
      // A ring hands its lead out of its own face and the plate stays whole --
      // which the test below this one is about.
      const d = derived({ standStyle: 'rest' });
      const bay = standBay(d)!;
      const drop = cableDropY(d);

      // Worked out separately these came out 80 mm apart, the stand dropping at
      // the front and the plate offering a hole at the back. One shared answer.
      const probe = m.Manifold.cube([2, 2, 200], true).translate([bay.cx, drop, 0]);
      expect(buildBase(m, d).intersect(probe).volume(), 'plate is holed here').toBeLessThan(SLIVER);

      // The plate lies on the desk, so the channel in its underside has to
      // reach the back edge -- that is the cable's only way out.
      const back = m.Manifold.cube([2, 2, d.baseT], true).translate([
        bay.cx,
        d.D / 2 - 1,
        d.baseT / 2,
      ]);
      const atBack = buildBase(m, d).intersect(back);
      expect(atBack.boundingBox().min[2]!, 'open underneath, closed on top').toBeGreaterThan(0.5);
    } finally {
      cleanup();
    }
  });

  // --- the stand -----------------------------------------------------------

  it('does not claim the stand is missing when it is looking right at one', () => {
    // The "no stand in any bay" warning hung off the REST branch, so every
    // stand got told there was no phone stand in the bay it was in.
    const warns = (organizerGenerator.validate?.(paramsWith()) ?? [])
      .filter((i) => i.level === 'warn')
      .map((i) => i.message);
    expect(warns.join(' ')).not.toMatch(/no phone stand in any bay/);
    // And it still fires when it is actually true.
    const none = (organizerGenerator.validate?.(
      paramsWith({ slot1: 'cup', slot2: 'none', slot3: 'none', wireless: true }),
    ) ?? [])
      .filter((i) => i.level === 'warn')
      .map((i) => i.message);
    expect(none.join(' ')).toMatch(/no phone stand in any bay/);
  });

  // --- the ring's own cable route ------------------------------------------

  it('never lets the window come out through the shoulder of the arc', async () => {
    const m = await kernel();
    try {
      // A ring's top is a semicircle, so the panel narrows the higher you go.
      // Ask for a panel too short for the charger and the window breaks out
      // of the shoulder -- the part is then not a ring with a hole in it but
      // a fork with two horns, which is a silhouette fault and shows up as
      // genus: a closed window is one handle, a broken one is none.
      const short = derived({ wireless: true, standHeight: 100 });
      expect(short.standH, 'the height has a floor under it').toBeGreaterThan(100);
      const bay = standBay(short)!;
      expect(buildStand(m, short, bay).genus(), 'still a closed window').toBe(1);

      // It is a floor, not an override: ask for more and you get more.
      expect(derived({ wireless: true, standHeight: 140 }).standH).toBe(140);
      // And it is only the ring's problem -- the rest's top is square.
      expect(derived({ standStyle: 'rest', wireless: true, standHeight: 100 }).standH).toBe(100);
      // ...as is a panel with no charger to fit in it.
      expect(derived({ wireless: false, standHeight: 100 }).standH).toBe(100);

      // Raised rather than refused, and said out loud.
      const warns = (organizerGenerator.validate?.(paramsWith({ wireless: true, standHeight: 100 })) ?? [])
        .filter((i) => i.level === 'warn')
        .map((i) => i.message)
        .join(' ');
      expect(warns).toMatch(/has been raised from 100/);

      // And the floor is not the structural minimum, it is the one that makes
      // the thing look like it was meant: the shoulder over the window comes
      // out the same as the plate beside it. A 2.5 mm shoulder holds a panel
      // together perfectly well and reads as a circle that only just got away
      // with it.
      const stock = derived({ wireless: true });
      const sb = standBay(stock)!;
      const panelW = bodyW(sb) - 2 * stock.clear;
      const rO = stock.puckD / 2 + stock.clear;
      const floor = ringMinH({
        panelW,
        plateT: stock.plateT,
        puckH: stock.puckH,
        puckD: stock.puckD,
        clear: stock.clear,
        lean: stock.lean,
        minKeep: 2.5,
      });
      const apex = stock.plateT + stock.puckH + rO * Math.cos((stock.lean * Math.PI) / 180);
      expect(floor - apex, 'shoulder matches the side margin').toBeCloseTo(panelW / 2 - rO, 6);
      // The stock stand clears that floor without being raised at all.
      expect(stock.standH).toBe(130);
      expect(stock.standH).toBeGreaterThan(floor);
    } finally {
      cleanup();
    }
  }, 60000);

  it('refuses a panel that leans off the back of its own foot', () => {
    // Height and lean together decide whether the top of the panel is still
    // over its plate. The profile is one polygon and it does not fold: past
    // that point it comes out inside out and the part is neither a ring nor
    // a rest. There was a check on the well at the BOTTOM and none at the top.
    const errs = (p: Params) =>
      (organizerGenerator.validate?.(p) ?? []).filter((i) => i.level === 'error').map((i) => i.message);
    expect(errs(paramsWith({ standHeight: 200, standAngle: 40 })).join(' ')).toMatch(
      /hangs off the back of its own foot/,
    );
    expect(errs(paramsWith({ standHeight: 120, standAngle: 15 }))).toEqual([]);
    // Deeper is one of the three ways out the message offers.
    expect(errs(paramsWith({ standHeight: 200, standAngle: 40, depth: 200 }))).toEqual([]);
  });

  it('leaves the plate whole under a ring, and holed under a rest', async () => {
    const m = await kernel();
    try {
      // The plate used to offer two square holes up through itself wherever
      // there was a stand: one behind it for the puck's lead and one in front
      // for a plug-in cable. A ring uses neither -- it hands its lead out of
      // its own face and lets it hang down the back -- so on a ring those were
      // two holes in the middle of an otherwise clean plate leading nowhere.
      const ring = derived({ wireless: true, passthrough: true });
      const bay = standBay(ring)!;
      // Down at the plate's own floor, which is all that is left under the
      // stand's seat: solid there is a plate, empty there is a hole through it.
      const through = (y: number) => m.Manifold.cube([2, 2, 1.2], true).translate([bay.cx, y, 0.6]);

      const plate = buildBase(m, ring);
      for (const y of [cableDropY(ring), passDropY(ring)]) {
        expect(plate.intersect(through(y)).volume(), `hole at ${y.toFixed(1)}`).toBeGreaterThan(4);
      }

      // The rest still routes through the plate, and still gets its holes.
      const rest = derived({ standStyle: 'rest', wireless: true, passthrough: true });
      const rplate = buildBase(m, rest);
      for (const y of [cableDropY(rest), passDropY(rest)]) {
        expect(rplate.intersect(through(y)).volume(), `rest hole at ${y.toFixed(1)}`).toBeLessThan(
          SLIVER,
        );
      }
    } finally {
      cleanup();
    }
  }, 60000);

  it('catches the lead in a clip on the back, and prints the clip in mid-air', async () => {
    const m = await kernel();
    try {
      const d = derived({ wireless: true });
      const bay = standBay(d)!;
      const spec = clipSpec(d)!;
      expect(spec, 'a fifteen-degree lean carries a clip').toBeTruthy();
      const stand = buildStand(m, d, bay);
      expect(shells(stand), 'the clip is part of the panel').toBe(1);

      const y = (at: number) => backX(d, at) - d.D / 2 + bay.margin;
      const z0 = bay.cz + d.plateT + d.clipZ;
      const yCh = y(d.clipZ + spec.h); // the channel, clear of the leaning panel
      const mid = z0 + spec.h - spec.grip / 2; // and the full-section part of it

      // The cable's own room, up the whole clip: open.
      const lead = m.Manifold.cube([d.cableW, d.cableD, spec.h - 1], true).translate([
        bay.cx,
        yCh + spec.t / 2,
        z0 + spec.h / 2,
      ]);
      expect(stand.intersect(lead).volume(), 'the channel is clear').toBeLessThan(SLIVER);

      // Behind it, a mouth NARROWER than the cable: open in the middle so the
      // lead can be pressed in, and lipped at both sides so it stays.
      const across = (w: number) =>
        m.Manifold.cube([w, spec.wall - 0.3, spec.grip - 0.6], true).translate([
          bay.cx,
          yCh + spec.t + spec.wall / 2,
          mid,
        ]);
      expect(stand.intersect(across(spec.mouth - 0.6)).volume(), 'the mouth is open').toBeLessThan(
        SLIVER,
      );
      expect(stand.intersect(across(spec.w + 2 * spec.wall)).volume(), 'and lipped either side')
        .toBeGreaterThan(1);
      expect(spec.mouth, 'by less than the lead is wide').toBeLessThan(d.cableW);

      // And it stands in mid-air off a wall, so every millimetre of it has to
      // sit above a 45-degree ramp rising out of that wall. The half-space
      // below that ramp -- nudged a fraction clear of it -- is empty.
      const S = 600;
      const under = m.Manifold.cube([S, S, S], true)
        .translate([0, 0, -S / 2])
        .rotate([45, 0, 0])
        .translate([bay.cx, y(d.clipZ) + 0.3, z0]);
      const clip = stand.subtract(buildStand(m, derived({ wireless: true, cableClip: false }), bay));
      expect(clip.volume(), 'there is a clip at all').toBeGreaterThan(50);
      expect(clip.intersect(under).volume(), 'nothing printing on nothing').toBeLessThan(SLIVER);
    } finally {
      cleanup();
    }
  }, 60000);

  it('says so when the lean will not carry a clip, rather than dropping it quietly', () => {
    // Past about thirty-two degrees the panel's back runs away faster than a
    // 45-degree ramp can follow it, and no finite bracket is ever supported.
    expect(clipSpec(derived({ wireless: true, standAngle: 15 }))).toBeTruthy();
    expect(clipSpec(derived({ wireless: true, standAngle: 40 }))).toBeNull();
    const warns = (organizerGenerator.validate?.(paramsWith({ wireless: true, standAngle: 40 })) ?? [])
      .filter((i) => i.level === 'warn')
      .map((i) => i.message)
      .join(' ');
    expect(warns).toMatch(/no clip that would print without support/);
  });

  it('centres the charger where the slider says, 80 mm up by default', async () => {
    const m = await kernel();
    try {
      const d = derived({ wireless: true });
      expect(d.puckH, 'the stock phone puts its magnet ring here').toBe(80);
      // Clean at the stock stand height: the panel's top is an arc, so a
      // charger this high needs the height that comes with it.
      expect((organizerGenerator.validate?.(paramsWith({ wireless: true })) ?? [])
        .filter((i) => i.level === 'error')).toEqual([]);

      const bay = standBay(d)!;
      const stand = buildStand(m, d, bay);
      // A bore along the face's normal, `up` above the stand's own plate.
      const at = (up: number, dx = 0) =>
        m.Manifold.cylinder(80, 1.5, 1.5, 16, true)
          .rotate([90 - d.lean, 0, 0])
          .translate([bay.cx + dx, faceX(d, up) - d.D / 2 + bay.margin, bay.cz + d.plateT + up]);

      const cos = Math.cos((d.lean * Math.PI) / 180);
      expect(stand.intersect(at(80)).volume(), 'open at the centre').toBeLessThan(SLIVER);
      expect(stand.intersect(at(80 + (d.puckD / 2 + 4) * cos)).volume(), 'panel above it')
        .toBeGreaterThan(5);
      expect(stand.intersect(at(80 - (d.puckD / 2 + 4) * cos, d.cableW)).volume(), 'and below')
        .toBeGreaterThan(5);
    } finally {
      cleanup();
    }
  }, 60000);

  it('keeps the charger cable off the face the phone lies on', async () => {
    const m = await kernel();
    try {
      const d = derived({ standStyle: 'rest', wireless: true });
      const bay = standBay(d)!;
      const stand = buildStand(m, d, bay);

      // Below the puck POCKET -- not below the puck's centre, which is half a
      // charger further up and inside the hole. The cable used to be grooved
      // down this face, which put a ridge between the phone and the thing
      // holding the phone.
      const clearOf = d.puckH - d.puckD / 2 - d.clear;
      for (const h of [clearOf * 0.4, clearOf * 0.8]) {
        const [fy, fz] = [faceX(d, h) - d.D / 2, d.baseT + d.plateT + h];
        // A probe just inside the face, on the centre line where the groove was.
        const probe = m.Manifold.cube([d.cableW * 0.6, 1, 1], true).translate([
          bay.cx,
          fy + 1.2,
          fz,
        ]);
        expect(stand.intersect(probe).volume(), `face at ${h.toFixed(0)} mm`).toBeGreaterThan(0.4);
      }

      // And it goes out the BACK instead: bored through the rest at the puck.
      const [by, bz] = [backX(d, d.puckH) - d.D / 2, d.baseT + d.plateT + d.puckH];
      const bore = m.Manifold.cube([d.cableW * 0.5, 1, 1], true).translate([bay.cx, by - 0.8, bz]);
      expect(stand.intersect(bore).volume(), 'bore through the rest').toBeLessThan(SLIVER);
    } finally {
      cleanup();
    }
  });

  it('leans the back rest back, and the puck with it', async () => {
    const m = await kernel();
    try {
      // Charger off: its pocket is cut into the very face being measured, and a
      // probe inside it reads the back of the pocket rather than the face.
      const d = derived({ standStyle: 'rest', standAngle: 20, wireless: false });
      const bay = standBay(d)!;
      const stand = buildStand(m, d, bay);

      // The face at two heights: it must move BACKWARD as it rises, by exactly
      // the tangent of the lean. A stand that leans forward still builds.
      const faceAt = (h: number) => {
        const z = d.baseT + h;
        const knife = m.Manifold.cube([1, d.D, 0.6], true).translate([bay.cx + d.cableW, 0, z]);
        const pieces = knife
          .intersect(stand)
          .decompose()
          .filter((p) => p.volume() > SLIVER)
          .map((p) => p.boundingBox());
        return Math.max(...pieces.map((b) => b.min[1]!));
      };
      const low = faceAt(d.lipH + 4);
      const high = faceAt(d.lipH + 34);
      expect(high - low).toBeCloseTo(30 * Math.tan((20 * Math.PI) / 180), 1);
    } finally {
      cleanup();
    }
  });

  it('sinks the puck in the face and thickens the rest to take it', () => {
    const d = derived({ wireless: true, puckThickness: 6, restThickness: 4 });
    // Asked for 4 mm of rest and a 6 mm puck: the rest is raised rather than
    // the pocket being allowed to come out of the back of it.
    expect(d.restT).toBeGreaterThanOrEqual(d.puckT + 2 * d.minPlate);
    // Switched off, it is just a slab again and there is no reason for it to be fat.
    expect(derived({ wireless: false, restThickness: 6 }).restT).toBe(6);
  });

  it('refuses a charger that will not fit the stand', () => {
    const errors = (organizerGenerator.validate?.(paramsWith({ wireless: true, puckDiameter: 88, phoneWidth: 60 })) ?? [])
      .filter((i) => i.level === 'error')
      .map((i) => i.message);
    expect(errors.join(' ')).toMatch(/will not fit in a stand/);
  });

  // --- threading the lead --------------------------------------------------

  it('passes the PLUG through every hole a lead is threaded through', async () => {
    const m = await kernel();
    try {
      // The thing you push through these holes is not the cable, it is the
      // moulding on the end of it. Every one of them used to be sized from the
      // cable channel -- 9 x 5 against a 12 x 7 plug -- so the charger could
      // not be installed at all, in either orientation, on either stand.
      {
        const d = derived({ standStyle: 'rest', wireless: true, passthrough: true });
        const bay = standBay(d)!;
        const base = buildBase(m, d);
        const stand = buildStand(m, d, bay);
        const plug = (w: number, t: number, h: number) => m.Manifold.cube([w, t, h], true);

        // Up through the plate, at every hole the plate offers.
        const drops = [cableDropY(d), passDropY(d)];
        for (const y of drops) {
          const probe = plug(d.plugW, d.plugT, d.baseT + 4).translate([bay.cx, y, d.baseT / 2]);
          expect(
            base.intersect(probe).volume(),
            `plate hole at y=${y.toFixed(1)}`,
          ).toBeLessThan(0.01);
        }

        // And out through the bore behind the puck pocket, which is the only
        // way the puck's own captive lead ever gets threaded.
        const along: [number, number, number] = [270 - d.lean, 0, 0];
        const len = d.restT + d.puckT + 6;
        const face: [number, number] = [faceX(d, d.puckH) - d.D / 2, bay.cz + d.plateT + d.puckH];
        const bore = plug(d.plugW, d.plugT, len)
          .translate([0, 0, len / 2 - 1])
          .rotate(along)
          .translate([bay.cx, face[0], face[1]]);
        expect(stand.intersect(bore).volume(), 'puck bore').toBeLessThan(0.01);

      }
    } finally {
      cleanup();
    }
  }, 60000);

  it('sits the puck flush with the face the phone leans on', async () => {
    const m = await kernel();
    try {
      // Cut a pocket deeper than the puck is thick and the phone rests on the
      // plastic rim instead, with the magnets working across an air gap they
      // did not need to cross.
      {
        const d = derived({ standStyle: 'rest', wireless: true });
        const bay = standBay(d)!;
        const stand = buildStand(m, d, bay);
        const face: [number, number] = [faceX(d, d.puckH) - d.D / 2, bay.cz + d.plateT + d.puckH];
        const puck = m.Manifold.cylinder(d.puckT, d.puckD / 2 - 1, d.puckD / 2 - 1, 48)
          .rotate([270 - d.lean, 0, 0])
          .translate([bay.cx, face[0], face[1]]);
        expect(
          stand.intersect(puck).volume(),
          'puck sits proud of the face',
        ).toBeLessThan(0.01);
      }
    } finally {
      cleanup();
    }
  }, 60000);

  it('delivers the softening that was asked for, right across the slider', async () => {
    const m = await kernel();
    try {
      // The rounding is a ball rolled over the outside, and a ball of radius r
      // rolls a limb thinner than 2r out of existence. That used to be handled
      // by throttling the ball down to whatever the thinnest limb allowed: on
      // a leaning stand that is the 4 mm lip, so the control capped at 1.7 mm
      // while defaulting to 3 and offering 8 -- saturated before it was
      // touched, and dragging it did nothing whatsoever.
      {
        let last = -1;
        for (const standSoft of [0, 1.5, 3, 5, 8]) {
          const d = derived({ standSoft });
          expect(standSoftR(d), `asked ${standSoft}`).toBeCloseTo(standSoft, 6);
          // Every step up is a visibly rounder part, not the same one again.
          const v = buildStand(m, d, standBay(d)!).volume();
          expect(v).not.toBe(last);
          last = v;
        }
        // Which it pays for in limbs: the lip has to be twice the radius.
        expect(derived({ standSoft: 8 }).lipT).toBeGreaterThanOrEqual(16.6);
      }
    } finally {
      cleanup();
    }
  }, 60000);

  it('leaves the stock stand exactly as it was, and says when it thickens one', () => {
    // The default is the value a stock 4 mm lip carries on its own, so loading
    // an old design does not quietly fatten its lip.
    const stock = derived();
    expect(stock.lipT).toBe(4);
    expect(standSoftR(stock)).toBeCloseTo(1.5, 6);

    const warned = (organizerGenerator.validate?.(paramsWith({ standSoft: 5 })) ?? [])
      .filter((i) => i.level === 'warn')
      .map((i) => i.message)
      .join(' ');
    expect(warned).toMatch(/lip has been thickened/i);
  });

  it('leaves the phone’s charging port clear when it stands on tabs', async () => {
    const m = await kernel();
    try {
      {
        const d = derived({ standStyle: 'rest', lipStyle: 'tabs', ledgeHeight: 12, lipTabW: 20 });
        const bay = standBay(d)!;
        const s = buildStand(m, d, bay);
        expect(shells(s), 'in one piece').toBe(1);

        const zTop = bay.cz + d.plateT + d.ledgeZ;
        const yFace = faceX(d, d.ledgeZ) - d.D / 2;
        const ahead = yFace - (d.phoneT + 2 * d.clear) / 2;

        // A tab under each end of the phone...
        const w = bay.w - 2 * d.clear;
        for (const side of [-1, 1]) {
          const on = m.Manifold.cube([2, 2, 0.6], true).translate([
            bay.cx + side * (w / 2 - d.wall - d.tabW / 2),
            ahead,
            zTop - d.lipT / 2,
          ]);
          expect(s.intersect(on).volume(), `tab ${side}`).toBeGreaterThan(0.5);
        }

        // ...and NOTHING across the middle, between the stand's own plate and
        // the phone sitting above it. That window is where the port and its
        // plug live, and it is the entire reason for the shape. (Below it is
        // the stand's plate, which is meant to be there.)
        // In front of the face at EVERY height in the window, not just at the
        // ledge: the face leans back as it rises, so down at the plate it is
        // further forward than it is at the tabs, and a probe placed off the
        // ledge's own face reaches into the slab lower down.
        const clearY = faceX(d, 0) - d.D / 2 - 3;
        const gap = m.Manifold.cube([10, 4, d.ledgeZ - 0.4], true).translate([
          bay.cx,
          clearY,
          bay.cz + d.plateT + d.ledgeZ / 2,
        ]);
        expect(s.intersect(gap).volume(), 'the port column is open').toBeLessThan(
          SLIVER,
        );
      }
    } finally {
      cleanup();
    }
  }, 60000);

  it('hangs the phone higher without losing the charger', async () => {
    const m = await kernel();
    try {
      // Raising the tabs is the other way to line the magnet ring up with the
      // puck -- move the phone to the puck rather than the puck to the phone.
      const low = derived({ lipStyle: 'tabs', ledgeHeight: 12, wireless: true });
      const high = derived({ lipStyle: 'tabs', ledgeHeight: 40, wireless: true });
      expect(phoneFootZ(high) - phoneFootZ(low)).toBe(28);
      // A lip does not move: the phone stands in the well, on the plate.
      expect(phoneFootZ(derived({ lipStyle: 'full', ledgeHeight: 40 }))).toBe(0);

      for (const d of [low, high]) {
        const bay = standBay(d)!;
        const s = buildStand(m, d, bay);
        expect(shells(s), `ledge ${d.ledgeZ}`).toBe(1);
        // The puck pocket is still cut, and still opens on the face.
        const puck = m.Manifold.cylinder(d.puckT, d.puckD / 2 - 1, d.puckD / 2 - 1, 48)
          .rotate([270 - d.lean, 0, 0])
          .translate([bay.cx, faceX(d, d.puckH) - d.D / 2, bay.cz + d.plateT + d.puckH]);
        expect(s.intersect(puck).volume(), `puck pocket at ledge ${d.ledgeZ}`).toBeLessThan(0.01);
      }

      // And the validator measures the puck against the TABS, not the plate:
      // a puck that clears the plate can still be under a raised phone.
      const warned = (organizerGenerator.validate?.(
        paramsWith({ lipStyle: 'tabs', ledgeHeight: 60, wireless: true, puckHeight: 40 }),
      ) ?? [])
        .filter((i) => i.level === 'warn')
        .map((i) => i.message)
        .join(' ');
      expect(warned).toMatch(/below where the phone stands/i);
    } finally {
      cleanup();
    }
  }, 60000);

  it('leaves the tabs high enough for a plug to get under the phone', () => {
    // The gap between the tabs is only half the job: the plug also has to fit
    // in the window BETWEEN the stand's plate and the bottom of the phone, and
    // that window is exactly how high the tabs were put.
    const tight = (organizerGenerator.validate?.(
      paramsWith({ lipStyle: 'tabs', ledgeHeight: 2, passthrough: true }),
    ) ?? [])
      .filter((i) => i.level === 'warn')
      .map((i) => i.message)
      .join(' ');
    expect(tight).toMatch(/plug/i);

    const roomy = (organizerGenerator.validate?.(
      paramsWith({ lipStyle: 'tabs', ledgeHeight: 14, passthrough: true }),
    ) ?? [])
      .filter((i) => /plug .*under/i.test(i.message));
    expect(roomy).toHaveLength(0);
  });

  // --- the finned wedge ----------------------------------------------------

  // --- the softening -------------------------------------------------------

  it('rounds every outside edge without shedding the part into slices', async () => {
    const m = await kernel();
    try {
      {
        const plain = derived({ standSoft: 0 });
        // 1.5 is inside what the stock limbs already carry, so here softening
        // is purely a finish: nothing is thickened to make room for it.
        const soft = derived({ standSoft: 1.5 });
        const a = buildStand(m, plain, standBay(plain)!);
        const b = buildStand(m, soft, standBay(soft)!);

        // The sweep is a stack of slices and they are unioned. Butted exactly
        // they meet on a shared plane with no volume either side, and the part
        // comes back as a pile of loose discs.
        expect(shells(b), 'after softening').toBe(1);

        // Within that range, rounding takes material off and moves no face.
        expect(b.volume()).toBeLessThan(a.volume());
        const pb = b.boundingBox();
        const pa = a.boundingBox();
        for (const i of [0, 1, 2]) {
          expect(pb.max[i]! - pb.min[i]!, `axis ${i}`).toBeCloseTo(pa.max[i]! - pa.min[i]!, 6);
        }
        expect(standSoftR(soft)).toBeCloseTo(1.5, 6);
      }
    } finally {
      cleanup();
    }
  }, 60000);

  it('leaves the face it prints on square', async () => {
    const m = await kernel();
    try {
      // An edge rounded where the part meets the bed curves out of it: a
      // zero-degree overhang running right round the footprint. The profile
      // gets a skirt below its bottom line, the ball rounds the skirt's edges
      // instead, and the skirt is sliced off flush.
      const d = derived({ standSoft: 4 });
      const bay = standBay(d)!;
      const stand = buildStand(m, d, bay);
      const across = (z: number) => {
        const b = stand
          .intersect(m.Manifold.cube([400, 400, 0.2], true).translate([0, 0, z]))
          .boundingBox();
        return [b.max[0]! - b.min[0]!, b.max[1]! - b.min[1]!];
      };
      const bed = across(bay.cz + 0.15);
      // Two millimetres up, not five. The softening rounds the TOP edge of the
      // stand's own plate too, and that plate is 8.6 mm thick at this setting
      // -- so a slice taken at 5 mm is already inside a round that is supposed
      // to be there, and reads as a taper that is not. At 1, 2 and 3 mm the
      // part measures a flat 105.0000; the bed slice is 104.9930, which is the
      // seven microns below.
      const up = across(bay.cz + 2);
      // Within a twentieth of a millimetre, not exact: the round offsets are
      // polygonal, so a face that has been through an erode-dilate pair comes
      // back a few microns shy of where it started. Seven of them, here, which
      // is a thirtieth of a layer. What would show up is a TAPER -- the bed
      // slice measurably narrower than the one above it.
      expect(Math.abs(bed[0]! - up[0]!), 'width tapers off the bed').toBeLessThan(0.05);
      expect(Math.abs(bed[1]! - up[1]!), 'depth tapers off the bed').toBeLessThan(0.05);
    } finally {
      cleanup();
    }
  }, 60000);

  // --- the wall form -------------------------------------------------------

  it('stacks the bays up the panel instead of across the plate', () => {
    const d = derived({ form: 'wall', slot1: 'cards', slot2: 'stand', slot3: 'tray' });
    // Slot 1 is the TOP one, and each sits under the last with one reveal.
    expect(d.bays.map((b) => b.kind)).toEqual(['cards', 'stand', 'tray']);
    expect(d.bays.every((b) => b.cx === 0), 'centred on the board').toBe(true);
    for (let i = 1; i < d.bays.length; i++) {
      const above = d.bays[i - 1]!;
      const here = d.bays[i]!;
      expect(above.cz - (here.cz + here.h)).toBeCloseTo(d.gap, 6);
    }
    // The panel is as wide as the WIDEST module, not the sum of them, and as
    // tall as the stack. Both derived from the modules, as the plate is.
    expect(d.W).toBeCloseTo(Math.max(...d.bays.map((b) => b.w)) + 2 * d.margin, 6);
    const stack = d.bays.reduce((a, b) => a + b.h, 0) + (d.bays.length - 1) * d.gap;
    expect(d.panelH).toBeCloseTo(stack + 2 * d.margin, 6);
    // Top and bottom each get their margin.
    expect(d.bays[0]!.cz + d.bays[0]!.h).toBeCloseTo(d.panelH - d.margin, 6);
    expect(d.bays[d.bays.length - 1]!.cz).toBeCloseTo(d.margin, 6);
  });

  it('hangs every wall module off the panel without either occupying the other', async () => {
    const m = await kernel();
    try {
      const d = derived({ form: 'wall', ...ALL_KINDS });
      const panel = buildPanel(m, d);
      expect(shells(panel)).toBe(1);

      for (const bay of d.bays) {
        const mod = bay.kind === 'stand' ? buildStand(m, d, bay) : buildModule(m, d, bay)!;
        expect(shells(mod), `${bay.kind} is one body`).toBe(1);
        expect(panel.intersect(mod).volume(), `${bay.kind} vs panel`).toBeLessThan(SLIVER);

        // The rail is actually IN the slot rather than hanging in front of it:
        // the module has to reach past the panel's front face.
        expect(mod.boundingBox().max[1]!, bay.kind).toBeGreaterThan(d.D / 2);
        // And it hangs at its own height, nowhere near the next one.
        const box = mod.boundingBox();
        expect(box.min[2]!).toBeGreaterThan(bay.cz - 1);
        expect(box.max[2]!).toBeLessThan(bay.cz + bay.h + 1);
      }

      // Neighbours clear each other by the reveal, so nothing rubs.
      const built = d.bays.map((bay) =>
        bay.kind === 'stand' ? buildStand(m, d, bay) : buildModule(m, d, bay)!,
      );
      for (let i = 1; i < built.length; i++) {
        expect(built[i - 1]!.intersect(built[i]!).volume(), `bay ${i}`).toBeLessThan(SLIVER);
      }
    } finally {
      cleanup();
    }
  });

  it('gives the wall form a panel, and says how each one is mounted', async () => {
    const m = await kernel();
    try {
      const wall = organizerGenerator.build(
        paramsWith({ form: 'wall', slot1: 'stand', slot2: 'tray', slot3: 'none' }),
        ctxFor(m),
      );
      expect(wall.issues.filter((i) => i.level === 'error')).toEqual([]);
      expect(wall.parts.map((p) => p.id)).toEqual(['panel', 'stand-1', 'tray-1']);
      // Nothing to lift off a desk it is not standing on.
      expect(wall.readouts?.['Mounting']).toMatch(/screws in the wall/);
    } finally {
      cleanup();
    }
  });

  // --- the parts -----------------------------------------------------------

  it('counts the pieces it actually prints', async () => {
    const m = await kernel();
    try {
      // The readout used to be worked out from a formula beside the list
      // rather than from the list, so it went on counting a plinth that is no
      // longer built and never counted the back wall that is.
      const check = (patch: Params) => {
        const out = organizerGenerator.build(paramsWith(patch), ctxFor(m));
        expect(out.readouts?.['Prints as'], JSON.stringify(patch)).toMatch(
          new RegExp(`^${out.parts.length} piece`),
        );
        return out.parts.map((q) => q.id);
      };
      expect(check({})).toEqual(['base', 'stand-1']);
      expect(check({ slot1: 'cards', slot2: 'cup', slot3: 'none' })).toEqual(['base']);
      expect(check({ ...WALL })).toContain('backwall');
      check({ form: 'wall', slot1: 'stand', slot2: 'tray', slot3: 'none' });
    } finally {
      cleanup();
    }
  }, 60000);

  it('builds every part in one piece and fits them on a bed', async () => {
    const m = await kernel();
    try {
      const out = organizerGenerator.build(paramsWith(), ctxFor(m));
      expect(out.issues.filter((i) => i.level === 'error')).toEqual([]);
      // Only three parts on a desk: the trays are part of the plate now, and
      // the stand is the one thing that lifts off it.
      expect(out.parts.map((p) => p.id)).toEqual(['base', 'stand-1']);
      for (const part of out.parts) {
        expect(part.mesh.stats.volumeMm3, part.name).toBeGreaterThan(100);
        const [w, h] = layFlat(part).size;
        expect(Math.max(w, h), part.name).toBeLessThan(246);
      }
      // A plate with three modules built into it is genuinely more than one
      // 256 bed holds. Drop a module and it fits.
      const fewer = organizerGenerator.build(paramsWith({ slot3: 'none' }), ctxFor(m));
      const plate = packPlate(fewer.parts, [256, 256]);
      expect(plate.overflow).toEqual([]);
      expect(plate.fits).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('cuts the card slots right through', async () => {
    const m = await kernel();
    try {
      const d = derived({ slot1: 'cards', slot2: 'none', slot3: 'none', cardSlots: 3 });
      const rack = buildCards(m, d, d.bays[0]!);
      expect(shells(rack)).toBe(1);
      // Open at both ends, so a card can be pushed out rather than fished at.
      // Sliced ABOVE the floor: the slots stop on it, so a slice taken through
      // the floor is one connected piece however many slots there are.
      const above = d.baseT + d.wall + 2;
      const h = d.cardsH - d.wall - 2;
      const back = m.Manifold.cube([d.bays[0]!.w, 1, h], true).translate([
        d.bays[0]!.cx,
        d.D / 2 - 1,
        above + h / 2,
      ]);
      expect(shells(rack.intersect(back))).toBe(4); // 3 slots leave 4 walls
    } finally {
      cleanup();
    }
  });

  it('refuses a plate with nothing on it', () => {
    const errors = (organizerGenerator.validate?.(
      paramsWith({ slot1: 'none', slot2: 'none', slot3: 'none' }),
    ) ?? [])
      .filter((i) => i.level === 'error')
      .map((i) => i.message);
    expect(errors.join(' ')).toMatch(/Every bay is empty/);
  });

  it('builds every preset without an error', async () => {
    const m = await kernel();
    try {
      for (const preset of organizerGenerator.presets ?? []) {
        const out = organizerGenerator.build(paramsWith(preset.values), ctxFor(m));
        expect(
          out.issues.filter((i) => i.level === 'error').map((i) => i.message),
          preset.label,
        ).toEqual([]);
        // One is a real answer now: a desk set with no phone stand in it has
        // nothing that lifts off and nothing under it, so it is one part.
        expect(out.parts.length, preset.label).toBeGreaterThan(0);
      }
    } finally {
      cleanup();
    }
  });
});
