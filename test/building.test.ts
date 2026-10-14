import type { ManifoldToplevel } from 'manifold-3d';
import { describe, expect, it } from 'vitest';
import { packPlate, packPlates } from '../src/core/build/layout';
import { coerceAll, defaultsOf } from '../src/core/params/validate';
import type { BuildCtx, Params } from '../src/core/params/types';
import { buildingGenerator } from '../src/generators/building/build';
import { derive, FT_MM, IN_MM } from '../src/generators/building/geometry';
import { area, depth, makePlan, width, type Rect } from '../src/generators/building/plan';
import { buildRoof, roofScreenSpan } from '../src/generators/building/parts/roof';
import { windowCentres } from '../src/generators/building/parts/shape';
import { stripeSpans } from '../src/generators/building/parts/facade';
import { buildStorey, jointAt, pinPositions } from '../src/generators/building/parts/storey';
import { buildStairs, risersFor, stairFit } from '../src/generators/building/parts/stairs';
import { cleanup, kernel, loadFont } from './kernel';

function ctxFor(m: ManifoldToplevel): BuildCtx {
  return { m, font: (id) => loadFont(id), image: () => undefined, tolerance: 0.03, issue: () => {} };
}

function paramsWith(patch: Params = {}): Params {
  return coerceAll(buildingGenerator, { ...defaultsOf(buildingGenerator), ...patch });
}

const derived = (patch: Params = {}) => derive(paramsWith(patch));

function issuesOf(patch: Params = {}, level: 'error' | 'warn'): string[] {
  return (buildingGenerator.validate?.(paramsWith(patch)) ?? [])
    .filter((i) => i.level === level)
    .map((i) => i.message);
}

/**
 * The same sliver floor build() drops at. Kept in step deliberately.
 *
 * A cut that lands exactly on the face it is trimming leaves shells of
 * numerically-zero volume -- the lobby's core doorway leaves one on the slab
 * top. They are real geometry and they are also nothing, which is why the
 * generator runs dropSlivers over every part before exporting it. Counting
 * them here would be holding the raw solid to a standard the shipped part is
 * not held to. Anything that genuinely came adrift -- a column, a balustrade,
 * a canopy post -- is cubic millimetres, orders of magnitude above this.
 */
const SLIVER = 0.05;

/**
 * Solid bodies in a part, ignoring enclosed cavities and sliver debris.
 *
 * decompose() reports a sealed void as a piece of NEGATIVE volume -- a hollow
 * pitched roof has exactly one, by design. What must never appear is a second
 * POSITIVE piece: that is a wall, a column or a stair that came away from the
 * model and would print as loose debris.
 */
function shells(solid: { decompose(): { volume(): number }[] }): number {
  return solid.decompose().filter((piece) => piece.volume() > SLIVER).length;
}

/** Do two rects overlap by more than a rounding error? */
function overlaps(a: Rect, b: Rect): boolean {
  const eps = 1e-6;
  return (
    a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.y0 < b.y1 - eps && b.y0 < a.y1 - eps
  );
}

describe('building miniature', () => {
  // --- the conversion everything else rests on -----------------------------

  it('divides real feet by the scale exactly once', () => {
    const d = derived({ scale: 144, floorHeight: 10, width: 60, depth: 40 });
    // 1:144 is a foot to the twelfth of an inch. A 10 ft storey is 21.17 mm.
    expect(d.perFt).toBeCloseTo(FT_MM / 144, 9);
    expect(d.levelH[0]!).toBeCloseTo((10 * FT_MM) / 144, 6);
    expect(d.levelH[0]!).toBeCloseTo(21.167, 3);
    expect(d.W).toBeCloseTo((60 * FT_MM) / 144, 6);
    expect(d.D).toBeCloseTo((40 * FT_MM) / 144, 6);
  });

  // A storey with every facade feature off is a slab plus a rectangular wall
  // ring, and that has a closed-form volume. Nothing here is eyeballed.
  const BARE: Params = {
    style: 'plain', windows: 'none', core: false, layout: 'open',
    groundOpen: false, joint: 'none', entrance: false,
  };

  it('matches closed-form volume at every scale', async () => {
    const m = await kernel();
    try {
      for (const scale of [48, 87, 100, 144, 200]) {
        const d = derived({ ...BARE, scale, width: 48, depth: 32, floorHeight: 9.5, slab: 9, extWall: 10 });
        const solid = buildStorey(m, d, makePlan(d), 1).solid;

        const wallH = d.levelH[1]! - d.slabT;
        const ring = d.W * d.D - (d.W - 2 * d.extT) * (d.D - 2 * d.extT);
        const expected = d.W * d.D * d.slabT + ring * wallH;
        // Parts per million, not "close enough": the scale is one division and
        // there is no reason for it to drift at all.
        expect(Math.abs(solid.volume() - expected) / expected, `1:${scale}`).toBeLessThan(1e-6);
      }
    } finally {
      cleanup();
    }
  });

  it('round-trips model millimetres back to the feet that were typed', () => {
    for (const scale of [48, 87, 100, 144, 200]) {
      for (const [w, dp, fh] of [[48, 32, 9.5], [120, 70, 20], [22, 30, 8.5]] as const) {
        const d = derived({ scale, width: w, depth: dp, floorHeight: fh, floors: 3 });
        expect(d.W / d.perFt).toBeCloseTo(w, 9);
        expect(d.D / d.perFt).toBeCloseTo(dp, 9);
        expect(d.levelH[1]! / d.perFt).toBeCloseTo(fh, 9);
        expect(d.roofZ / d.perFt).toBeCloseTo(3 * fh, 9);
      }
    }
  });

  it('agrees with the textbook statement of each scale', () => {
    // 1:144 is "one inch to twelve feet"; 1:100 is "one centimetre to a metre".
    // Stated the way a modeller would check it, not the way derive computes it.
    expect(12 * derived({ scale: 144 }).perFt).toBeCloseTo(25.4, 9);
    expect(derived({ scale: 100 }).perFt * 3.280839895).toBeCloseTo(10, 6);
  });

  it('measures a real storey and a real wall out of the built mesh', async () => {
    const m = await kernel();
    try {
      const d = derived({ ...BARE, scale: 144, floorHeight: 9.5, slab: 9, extWall: 10, floors: 3 });
      const plan = makePlan(d);
      for (let i = 0; i < 3; i++) {
        const b = buildStorey(m, d, plan, i).solid.boundingBox();
        expect((b.max[2]! - b.min[2]!) / d.perFt, `storey ${i}`).toBeCloseTo(9.5, 6);
      }

      // A thin bar driven through the building above the slab leaves exactly
      // the two walls it passed through, so their Y extent IS the wall.
      const solid = buildStorey(m, d, plan, 1).solid;
      const bar = m.Manifold.cube([0.05, d.D, 0.05], true).translate([
        d.W / 4,
        0,
        d.levelZ[1]! + d.slabT + 5,
      ]);
      const pieces = solid.intersect(bar).decompose();
      expect(pieces).toHaveLength(2);
      for (const piece of pieces) {
        const bb = piece.boundingBox();
        const realInches = ((bb.max[1]! - bb.min[1]!) * d.scale) / IN_MM;
        expect(realInches).toBeCloseTo(10, 6);
      }
    } finally {
      cleanup();
    }
  });

  it('reports the size of the whole model, not just the walls', async () => {
    const m = await kernel();
    try {
      const out = buildingGenerator.build(paramsWith(), ctxFor(m));
      const d = derived();
      // The readout used to quote roofZ as the model height, which is the roof
      // DECK -- it left out the roof, the parapet and a 13 ft stair tower, and
      // said 60 mm for a model that measures 89.
      const top = Math.max(...out.parts.map((p) => p.mesh.bbox.max[2]!));
      expect(top).toBeGreaterThan(d.roofZ + 20);
      const model = out.readouts?.['Model'] ?? '';
      // The overall height it quotes must be the height it actually built.
      expect(model).toContain(`x ${top.toFixed(1)} mm overall`);
      // And the wall-to-deck figure is still there, said to be what it is.
      expect(model).toContain(`x ${d.roofZ.toFixed(1)} mm to the roof deck`);
    } finally {
      cleanup();
    }
  });

  it('offers the standard scales, and a custom one for anything else', () => {
    // The two the control leads with, and what each actually means.
    expect(derived({ scale: 144 }).scale).toBe(144);
    expect(derived({ scale: 144 }).perFt).toBeCloseTo(FT_MM / 144, 9);
    expect(derived({ scale: 100 }).scale).toBe(100);
    expect(derived({ scale: 100 }).perFt).toBeCloseTo(3.048, 6);
    // 1:100 is the metric scale: a metre becomes a centimetre, exactly.
    expect(1000 / derived({ scale: 100 }).scale).toBeCloseTo(10, 9);

    for (const n of [48, 72, 87, 100, 144, 160, 200]) {
      expect(derived({ scale: n }).scale, `1:${n}`).toBe(n);
    }
    // A scale that is not a standard one is not silently accepted -- it falls
    // back to the default, and Custom is how you actually ask for it.
    expect(derived({ scale: 137 }).scale).toBe(144);
    expect(derived({ scale: 'custom', customScale: 137 }).scale).toBe(137);
    expect(derived({ scale: 'custom', customScale: 137 }).perFt).toBeCloseTo(FT_MM / 137, 9);
  });

  it('makes the same building bigger at a larger scale', () => {
    const small = derived({ scale: 200 });
    const mid = derived({ scale: 144 });
    const big = derived({ scale: 100 });
    // Same real building, three model sizes, and the ratio is exactly the
    // ratio of the scales -- the conversion happens once and nowhere else.
    expect(mid.W / big.W).toBeCloseTo(100 / 144, 9);
    expect(small.W / mid.W).toBeCloseTo(144 / 200, 9);
    expect(big.roofZ / mid.roofZ).toBeCloseTo(144 / 100, 9);
    // And the real building is untouched by any of it.
    expect(new Set([small.widthFt, mid.widthFt, big.widthFt]).size).toBe(1);
    expect(new Set([small.clearFt, mid.clearFt, big.clearFt]).size).toBe(1);
  });

  it('designs to a fixed 256 x 256 mm plate', () => {
    // Not a setting, and not settable. A building's millimetres fall out of a
    // real size and a scale, so the plate has to be the fixed point the scale
    // advice is measured against.
    expect(derived().bed).toEqual([256, 256]);
    expect(buildingGenerator.params.map((s) => s.id)).not.toContain('bedX');
    expect(buildingGenerator.params.map((s) => s.id)).not.toContain('bedY');
    // Nothing a user can type moves it.
    expect(derived({ bedX: 400, bedY: 400 }).bed).toEqual([256, 256]);
  });

  it('warns when a scale outgrows the bed, and names one that does not', () => {
    // 1:144 gets the default building four to a plate.
    expect(issuesOf({ scale: 144 }, 'warn').filter((msg) => /plate|bed/.test(msg))).toEqual([]);

    // 1:100 is the same building 44% bigger, and two of the four pieces fall
    // off the plate -- which is the moment a scale choice actually costs you.
    const bigger = issuesOf({ scale: 100 }, 'warn').filter((msg) => /plates/.test(msg));
    expect(bigger).toHaveLength(1);
    expect(bigger[0]).toMatch(/At 1:100 the 4 pieces need 2 plates/);
    // The advice has to be a scale you can actually select.
    expect(bigger[0]).toMatch(/1:144 would fit it on one plate/);

    // And at 1:48 one storey alone is bigger than the bed.
    expect(issuesOf({ scale: 48 }, 'warn').join(' ')).toMatch(/larger than the 256 x 256 mm plate on its own/);
  });

  it('keeps an 8 to 10 ft storey a real storey once the slab is taken off', () => {
    for (const ft of [8, 9, 9.5, 10]) {
      const d = derived({ floorHeight: ft, slab: 9 });
      expect(d.levelFt[0]).toBe(ft);
      // Floor to floor less the slab is the clear ceiling, and it has to stay
      // habitable: a 9 in slab in a 8 ft storey still leaves 7 ft 3 in.
      expect(d.clearFt).toBeCloseTo(ft - 0.75, 6);
      expect(d.clearFt).toBeGreaterThan(7.2);
    }
    // And the model height is the real height, not an approximation of it.
    const d = derived({ floors: 4, floorHeight: 9.5, scale: 144 });
    expect(d.roofZ).toBeCloseTo((4 * 9.5 * FT_MM) / 144, 6);
    expect(d.heightFt).toBe(38);
  });

  it('floors every thickness at what the nozzle can lay, and says so', () => {
    // A 4 in partition at 1:144 is 0.71 mm -- under two extrusions of a 0.4 mm
    // nozzle. It must come back 0.8 mm, not 0.71.
    const d = derived({ scale: 144, partition: 4, nozzle: 0.4 });
    expect(d.partTScaled).toBeCloseTo((4 * IN_MM) / 144, 6);
    expect(d.partTScaled).toBeLessThan(0.8);
    expect(d.partT).toBeCloseTo(0.8, 6);
    expect(issuesOf({ scale: 144, partition: 4 }, 'warn').join(' ')).toMatch(/nozzle can lay/);

    // At 1:48 the same wall is 2.1 mm and nothing is clamped.
    const big = derived({ scale: 48, partition: 4 });
    expect(big.partT).toBeCloseTo(big.partTScaled, 9);
  });

  // --- the plan ------------------------------------------------------------

  it('lays out rooms that tile the floor without overlapping', () => {
    const d = derived({ layout: 'rooms', rooms: 6, core: true });
    const plan = makePlan(d);
    expect(plan.rooms.length).toBeGreaterThanOrEqual(4);
    expect(plan.core).not.toBeNull();

    for (const r of plan.rooms) {
      expect(width(r)).toBeGreaterThan(0);
      expect(depth(r)).toBeGreaterThan(0);
      // Inside the building, not through a wall.
      expect(r.x0).toBeGreaterThanOrEqual(-d.innerW / 2 - 1e-6);
      expect(r.x1).toBeLessThanOrEqual(d.innerW / 2 + 1e-6);
      expect(r.y0).toBeGreaterThanOrEqual(-d.innerD / 2 - 1e-6);
      expect(r.y1).toBeLessThanOrEqual(d.innerD / 2 + 1e-6);
    }
    const all = [...plan.rooms, plan.core!];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        expect(overlaps(all[i]!, all[j]!)).toBe(false);
      }
    }
    // Rooms plus core plus the walls between them account for the whole plate.
    const covered = all.reduce((sum, r) => sum + area(r), 0);
    expect(covered).toBeGreaterThan(d.innerW * d.innerD * 0.75);
    expect(covered).toBeLessThanOrEqual(d.innerW * d.innerD + 1e-6);
  });

  it('honours the minimum room size over the room count, and says which won', () => {
    // Twenty rooms will not fit in a 48 x 32 ft plate at a 14 ft minimum.
    const d = derived({ layout: 'rooms', rooms: 20, minRoom: 14, core: false });
    const plan = makePlan(d);
    expect(plan.rooms.length).toBeLessThan(20);
    for (const r of plan.rooms) {
      expect(Math.min(width(r), depth(r))).toBeGreaterThanOrEqual(d.minRoom - 1e-6);
    }
    expect(plan.notes.join(' ')).toMatch(/not the 20 asked for/);
  });

  it('gives the same plan for the same seed and a different one otherwise', () => {
    const a = makePlan(derived({ seed: 7 }));
    const b = makePlan(derived({ seed: 7 }));
    const c = makePlan(derived({ seed: 8 }));
    expect(JSON.stringify(a.walls)).toBe(JSON.stringify(b.walls));
    expect(JSON.stringify(a.walls)).not.toBe(JSON.stringify(c.walls));
  });

  it('keeps the lobby core over the core above it', () => {
    // The one that would never be noticed by eye: an open ground floor deriving
    // its own core would put the shaft somewhere the stair does not come down.
    for (const layout of ['rooms', 'corridor'] as const) {
      const d = derived({ layout, core: true, groundOpen: true });
      const upper = makePlan(d);
      const lobby = makePlan(d, true);
      expect(lobby.core).toEqual(upper.core);
      expect(lobby.rooms.length).toBe(1);
    }
  });

  it('opens every room onto something', () => {
    const d = derived({ layout: 'corridor', rooms: 8 });
    const plan = makePlan(d);
    // A corridor plan has a door per room plus the one into the core.
    expect(plan.doors.length).toBeGreaterThanOrEqual(plan.rooms.length - 1);
  });

  // --- storey solids -------------------------------------------------------

  it('builds a storey that is one connected piece, hollow, and the right size', async () => {
    const m = await kernel();
    try {
      const d = derived();
      const plan = makePlan(d);
      const { solid } = buildStorey(m, d, plan, 1);
      expect(solid.status()).toBe('NoError');

      // Floor bands and spandrels stand proud of the wall, so the bounding box
      // is the footprint plus whatever the style projects -- on both sides.
      const proj = d.t.bands === 'none' ? 0 : d.bandProj;
      const b = solid.boundingBox();
      expect(b.max[0]! - b.min[0]!).toBeCloseTo(d.W + 2 * proj, 3);
      expect(b.max[1]! - b.min[1]!).toBeCloseTo(d.D + 2 * proj, 3);
      expect(b.min[2]!).toBeCloseTo(d.levelZ[1]!, 3);

      // Everything has to hang together, or the "storey" is a slab with a
      // scatter of loose walls that the preview renders perfectly.
      expect(shells(solid)).toBe(1);

      // And it has to be a floor with rooms on it, not a block: slab plus walls
      // is a small fraction of the bounding box it occupies.
      const box = d.W * d.D * d.levelH[1]!;
      expect(solid.volume()).toBeLessThan(box * 0.45);
      expect(solid.volume()).toBeGreaterThan(box * 0.05);
    } finally {
      cleanup();
    }
  });

  it('stacks storey on storey with no gap and no overlap', async () => {
    const m = await kernel();
    try {
      const d = derived({ floors: 3 });
      const plan = makePlan(d);
      let previousTop = 0;
      for (let i = 0; i < d.floors; i++) {
        const b = buildStorey(m, d, plan, i).solid.boundingBox();
        expect(b.min[2]!).toBeCloseTo(previousTop, 2);
        // The top of a storey is its wall head, which the next slab sits on.
        // Pins stand proud of it deliberately.
        expect(b.max[2]!).toBeGreaterThan(d.levelZ[i]! + d.levelH[i]! - 0.01);
        previousTop = d.levelZ[i]! + d.levelH[i]!;
      }
    } finally {
      cleanup();
    }
  });

  it('punches windows through the exterior wall and nothing else', async () => {
    const m = await kernel();
    try {
      const d = derived({ windows: 'punched' });
      const blank = derived({ windows: 'none' });
      const plan = makePlan(d);
      const withWin = buildStorey(m, d, plan, 1).solid;
      const without = buildStorey(m, blank, makePlan(blank), 1).solid;

      expect(withWin.volume()).toBeLessThan(without.volume());
      expect(shells(withWin)).toBe(1);

      // Five bays on a 48 ft front at 10 ft centres, three on a 32 ft side.
      // (windowCentres is the building's structural bay, so the columns under
      // an open ground floor are set out on the same numbers.)
      expect(windowCentres(d, d.W).length).toBe(5);
      expect(windowCentres(d, d.D).length).toBe(3);
      // Symmetric about the middle of the face, and clear of both corners.
      const centres = windowCentres(d, d.W);
      expect(centres[0]! + centres[centres.length - 1]!).toBeCloseTo(0, 6);
      expect(centres[0]! - d.winW / 2).toBeGreaterThan(-d.W / 2 + d.extT);
    } finally {
      cleanup();
    }
  });

  it('leaves the front off for a cutaway without dropping the floors', async () => {
    const m = await kernel();
    try {
      const d = derived({ openFront: true });
      const solid = buildStorey(m, d, makePlan(d), 1).solid;
      expect(solid.status()).toBe('NoError');
      expect(shells(solid)).toBe(1);
      // The slab still reaches the front edge even though the wall does not.
      expect(solid.boundingBox().min[1]!).toBeCloseTo(-d.D / 2, 3);
    } finally {
      cleanup();
    }
  });

  // --- stairs --------------------------------------------------------------

  it('climbs exactly one storey, in whole risers', async () => {
    const m = await kernel();
    try {
      const d = derived({ core: true, stairs: 'switchback' });
      const plan = makePlan(d);
      expect(plan.core).not.toBeNull();
      expect(stairFit(d, plan.core!, d.levelFt[0]!).ok).toBe(true);

      const h = d.levelH[0]!;
      const floor = d.levelZ[0]! + d.slabT;
      const stair = buildStairs(m, d, plan.core!, floor, h, d.levelFt[0]!)!;
      expect(stair).not.toBeNull();
      expect(stair.status()).toBe('NoError');
      // One flight, a landing and a return flight, all welded into one solid.
      expect(shells(stair)).toBe(1);

      const n = risersFor(d, d.levelFt[0]!);
      const b = stair.boundingBox();
      expect(b.min[2]!).toBeCloseTo(floor, 3);
      // The top tread is one riser short of the floor above -- that last riser
      // is the step onto the slab, not a tread of ours.
      expect(b.max[2]!).toBeCloseTo(floor + h - h / n, 3);
      // And it stays inside its shaft.
      expect(b.min[0]!).toBeGreaterThanOrEqual(plan.core!.x0 - 1e-6);
      expect(b.max[0]!).toBeLessThanOrEqual(plan.core!.x1 + 1e-6);
      expect(b.min[1]!).toBeGreaterThanOrEqual(plan.core!.y0 - 1e-6);
      expect(b.max[1]!).toBeLessThanOrEqual(plan.core!.y1 + 1e-6);
    } finally {
      cleanup();
    }
  });

  it('reports a stair that will not fit rather than running it through a wall', () => {
    // A straight flight climbing 9.5 ft needs about 14 ft of run; the default
    // core is 13 ft deep.
    const d = derived({ core: true, stairs: 'straight', coreDepth: 8, coreWidth: 8 });
    const plan = makePlan(d);
    const fit = stairFit(d, plan.core!, d.levelFt[0]!);
    expect(fit.ok).toBe(false);
    expect(fit.needs).toBeGreaterThan(fit.has);
    expect(issuesOf({ core: true, stairs: 'straight', coreDepth: 8, coreWidth: 8 }, 'warn').join(' ')).toMatch(
      /switchback needs far less run/,
    );
  });

  // --- roofs ---------------------------------------------------------------

  it('slopes a gable up from the eaves, not down', async () => {
    const m = await kernel();
    try {
      const d = derived({ roof: 'gable', roofPitch: 30, eaves: 1.5 });
      const roof = buildRoof(m, d, null);
      expect(roof.status()).toBe('NoError');
      expect(shells(roof)).toBe(1);

      const b = roof.boundingBox();
      expect(b.min[2]!).toBeCloseTo(d.roofZ, 3);
      // Ridge runs along the long axis, so the slope spans the short one.
      const span = Math.min(d.W, d.D) + 2 * d.eaves;
      const rise = (span / 2) * Math.tan((30 * Math.PI) / 180);
      expect(b.max[2]! - d.roofZ).toBeCloseTo(rise, 1);
      // Overhangs the walls all round.
      expect(b.max[0]! - b.min[0]!).toBeCloseTo(d.W + 2 * d.eaves, 3);
    } finally {
      cleanup();
    }
  });

  it('hips a roof in from all four sides', async () => {
    const m = await kernel();
    try {
      const d = derived({ roof: 'hip', roofPitch: 30 });
      const hip = buildRoof(m, d, null);
      const gable = buildRoof(m, derived({ roof: 'gable', roofPitch: 30 }), null);
      expect(hip.status()).toBe('NoError');
      // A hip takes the two ends off a gable, so it must be the smaller solid
      // and no taller.
      expect(hip.volume()).toBeLessThan(gable.volume());
      expect(hip.boundingBox().max[2]!).toBeLessThanOrEqual(gable.boundingBox().max[2]! + 1e-6);
    } finally {
      cleanup();
    }
  });

  it('stands a parapet thinner than the walls, flush outside, and as thick as asked', async () => {
    const m = await kernel();
    try {
      // Measured through the built roof: a bar 1 mm square driven in through the
      // middle of the back parapet, clear of the plant room over the core.
      const through = (patch: Params) => {
        const d = derived({ roof: 'parapet', ...patch });
        const roof = buildRoof(m, d, makePlan(d).core)!;
        const bar = m.Manifold.cube([1, 10, 1], true).translate([
          d.W / 4,
          d.D / 2 - 4,
          d.roofZ + d.roofT + d.parapetH / 2,
        ]);
        const hit = roof.intersect(bar);
        // Flush with the facade below: the outer face is the wall's outer face.
        expect(hit.boundingBox().max[1]!).toBeCloseTo(d.D / 2, 3);
        return { d, thick: hit.volume() };
      };

      const def = through({});
      expect(def.d.parapetTRealIn).toBe(6);
      expect(def.thick).toBeCloseTo((6 * IN_MM) / def.d.scale, 2);
      expect(def.thick).toBeLessThan(def.d.extT);

      // Floored at what the nozzle can lay, and said so.
      const thin = through({ parapetWall: 3 });
      expect(thin.thick).toBeCloseTo(thin.d.minWall, 2);
      expect(issuesOf({ roof: 'parapet', parapetWall: 3 }, 'warn').join()).toMatch(/3 in parapet/);

      // Never thicker than the wall it stands on.
      const thick = through({ parapetWall: 24 });
      expect(thick.thick).toBeCloseTo(thick.d.extT, 2);
    } finally {
      cleanup();
    }
  });

  it('caps a flat roof and stands a plant room on it', async () => {
    const m = await kernel();
    try {
      const d = derived({ roof: 'parapet', bulkhead: true, core: true });
      const plan = makePlan(d);
      const roof = buildRoof(m, d, plan.core);
      expect(roof.status()).toBe('NoError');
      expect(shells(roof)).toBe(1);
      expect(roof.boundingBox().max[2]!).toBeGreaterThan(d.roofZ + d.parapetH);
    } finally {
      cleanup();
    }
  });

  // --- the four building types --------------------------------------------

  it('builds all four types, each in one piece per part', async () => {
    const m = await kernel();
    try {
      for (const style of ['apartment', 'office', 'ribbon', 'curtain'] as const) {
        const d = derived({ style });
        const plan = makePlan(d);
        for (const level of [0, 1]) {
          const { solid } = buildStorey(m, d, level === 0 ? makePlan(d, d.groundOpen) : plan, level);
          expect(solid.status(), `${style} level ${level}`).toBe('NoError');
          // Balustrades, columns, canopy posts and sign panels all hang off the
          // outside of the wall. Any one of them left touching rather than
          // overlapping is a loose piece of plastic, and this is what catches it.
          expect(shells(solid), `${style} level ${level}`).toBe(1);
          expect(solid.volume(), `${style} level ${level}`).toBeGreaterThan(100);
        }
        expect(shells(buildRoof(m, d, plan.core)), `${style} roof`).toBe(1);
      }
    } finally {
      cleanup();
    }
  });

  it('gives each type its own facade rather than a repaint', async () => {
    const m = await kernel();
    try {
      const styles = ['apartment', 'office', 'ribbon', 'curtain'] as const;
      const shape = styles.map((style) => {
        const d = derived({ style });
        const solid = buildStorey(m, d, makePlan(d), 1).solid;
        const b = solid.boundingBox();
        return { style, volume: solid.volume(), width: b.max[0]! - b.min[0]! };
      });
      // No two types may come out the same solid: if they do, a trait is being
      // read but not built, which is invisible in a screenshot of one of them.
      for (let i = 0; i < shape.length; i++) {
        for (let j = i + 1; j < shape.length; j++) {
          const a = shape[i]!;
          const b = shape[j]!;
          expect(Math.abs(a.volume - b.volume), `${a.style} vs ${b.style}`).toBeGreaterThan(1);
        }
      }
    } finally {
      cleanup();
    }
  });

  it('resolves the window kind from the type, and lets it be overridden', () => {
    // The type picks the KIND of opening...
    expect(derived({ style: 'office' }).windows).toBe('ribbon');
    expect(derived({ style: 'ribbon' }).windows).toBe('ribbon');
    expect(derived({ style: 'apartment' }).windows).toBe('punched');
    expect(derived({ style: 'curtain' }).windows).toBe('punched');
    // ...and never overrides an explicit answer, or the sizes.
    expect(derived({ style: 'office', windows: 'punched' }).windows).toBe('punched');
    expect(derived({ style: 'office', windows: 'none' }).windows).toBe('none');
    expect(derived({ style: 'apartment', winWidth: 3 }).winW).toBeCloseTo(3 * (FT_MM / 144), 6);
  });

  it('wraps a chamfered corner instead of stopping dead at it', async () => {
    const m = await kernel();
    try {
      const d = derived({ style: 'ribbon', chamfer: 8 });
      expect(d.chamfer).toBeGreaterThan(0);
      const solid = buildStorey(m, d, makePlan(d), 1).solid;
      expect(shells(solid)).toBe(1);

      // The corners are gone: a chamfered plate has less area than the rectangle
      // it came from, and nothing pokes out past the footprint.
      const b = solid.boundingBox();
      expect(b.max[0]! - b.min[0]!).toBeCloseTo(d.W + 2 * d.bandProj, 3);
      const square = buildStorey(m, derived({ style: 'ribbon', chamfer: 0 }), makePlan(derived({ style: 'ribbon', chamfer: 0 })), 1).solid;
      expect(solid.volume()).toBeLessThan(square.volume());
    } finally {
      cleanup();
    }
  });

  it('stands the open ground floor on columns rather than on nothing', async () => {
    const m = await kernel();
    try {
      // Pins off: they stand a millimetre above the storey they key, which
      // would answer the question this measures on its own.
      const d = derived({ style: 'ribbon', chamfer: 8, joint: 'none' });
      expect(d.t.ground).toBe('pilotis');
      const ground = buildStorey(m, d, makePlan(d, d.groundOpen), 0).solid;
      // The columns are the ONLY thing between the slab and the storey above,
      // so the top of the ground floor is where their absence shows: without
      // them the tallest thing on the plate is the spandrel band, and the
      // floors above are standing on fresh air.
      const top = ground.boundingBox().max[2]!;
      expect(top).toBeGreaterThanOrEqual(d.levelZ[0]! + d.levelH[0]! - 1e-6);
      expect(top).toBeGreaterThan(d.levelZ[0]! + d.bandH * 2);
      // And the core lands on the slab as one body with it, not as a box
      // resting on a plane with the stair sealed inside.
      expect(shells(ground)).toBe(1);
      // The stack still keys together: the pins move onto a column, and a
      // column is thicker than the wall, so they are not on the wall line.
      const pins = pinPositions(d, 0);
      expect(pins.length).toBe(4);
      for (const [x, y] of pins) expect(Math.hypot(x, y)).toBeLessThan(Math.hypot(d.W, d.D) / 2);
    } finally {
      cleanup();
    }
  });

  it('frames the billboard, leaves its face blank, and keeps it on the front', async () => {
    const m = await kernel();
    try {
      const d = derived({ style: 'ribbon', floors: 5, chamfer: 8, signWidth: 14, signPlace: 'facade' });
      expect(d.t.sign).toBe(true);
      const plan = makePlan(d);
      const withSign = buildStorey(m, d, plan, 2).solid;
      const b = withSign.boundingBox();

      // On the building, not hanging over the chamfer void beside it.
      expect(b.min[0]!).toBeGreaterThanOrEqual(-d.W / 2 - d.bandProj - 1e-6);
      expect(b.max[0]!).toBeLessThanOrEqual(d.W / 2 + d.bandProj + 1e-6);
      // Standing proud of the spandrel band, or the band crosses its face.
      expect(-b.min[1]! - d.D / 2).toBeGreaterThan(d.bandProj + d.minWall);

      // The frame is real geometry, not a drawn line: the board is a border
      // standing in front of a recessed face, so it cannot be as thick as a
      // slab of the same footprint standing at the frame's depth.
      const noSign = buildStorey(
        m,
        derived({ style: 'office', floors: 5, chamfer: 8 }),
        plan,
        2,
      ).solid;
      expect(withSign.volume()).toBeGreaterThan(noSign.volume());
    } finally {
      cleanup();
    }
  });

  it('stands the screen from the first floor as tall as asked, two storeys by default', async () => {
    const m = await kernel();
    try {
      // The screen is the only thing standing further out than the spandrels,
      // so a storey reaches past them exactly when it carries a piece of it.
      const carries = (d: ReturnType<typeof derived>, level: number) =>
        -buildStorey(m, d, makePlan(d), level).solid.boundingBox().min[1]! - d.D / 2 >
        d.bandProj + 1e-3;
      // 18 ft on 9 ft 6 in storeys: the first floor and most of the second.
      const two = derived({ style: 'ribbon', floors: 7, signPlace: 'facade' });
      expect(two.signH / two.perFt).toBe(18);
      expect([0, 1, 2, 3, 4, 5, 6].map((i) => carries(two, i))).toEqual([
        false, true, true, false, false, false, false,
      ]);
      const four = derived({ style: 'ribbon', floors: 7, signHeight: 36, signPlace: 'facade' });
      expect([0, 1, 2, 3, 4, 5, 6].map((i) => carries(four, i))).toEqual([
        false, true, true, true, true, false, false,
      ]);
      // Never past the top storey on a short building.
      const short = derived({ style: 'ribbon', floors: 2, signPlace: 'facade' });
      expect([0, 1].map((i) => carries(short, i))).toEqual([false, true]);
    } finally {
      cleanup();
    }
  });

  it('builds each screen style, in one piece with the storey it is on', async () => {
    const m = await kernel();
    try {
      const vols: Record<string, number> = {};
      for (const signStyle of ['framed', 'slim', 'tiled']) {
        const d = derived({ style: 'ribbon', floors: 4, signStyle, signPlace: 'facade' });
        const solid = buildStorey(m, d, makePlan(d), 1).solid;
        expect(shells(solid), signStyle).toBe(1);
        vols[signStyle] = solid.volume();
      }
      // A slim screen's face is barely recessed, so it is more solid than a
      // framed board's; tiling cuts joints back into that face.
      expect(vols.slim!).toBeGreaterThan(vols.framed!);
      expect(vols.tiled!).toBeLessThan(vols.slim!);
    } finally {
      cleanup();
    }
  });

  it('stands the screen on the roof instead when asked, braced, facing the street', async () => {
    const m = await kernel();
    try {
      for (const patch of [{}, { footprint: 'corner', width: 54, depth: 46, wing: 20 }] as Params[]) {
        const d = derived({ style: 'ribbon', floors: 4, roof: 'parapet', signPlace: 'roof', signHeight: 16, ...patch });
        const label = JSON.stringify(patch);
        // Nothing up the facade any more.
        const storey = buildStorey(m, d, makePlan(d), 1).solid;
        expect(-storey.boundingBox().min[1]! - d.D / 2, label).toBeLessThanOrEqual(d.bandProj + 1e-3);
        // On the roof: one piece with it, as tall as asked above the deck.
        const roof = buildRoof(m, d, makePlan(d).core)!;
        expect(shells(roof), label).toBe(1);
        expect(roof.boundingBox().max[2]!, label).toBeGreaterThanOrEqual(d.roofZ + d.roofT + d.signH - 1e-3);
      }
      // Raised on its steel tower: one piece with the roof, the board's foot
      // at the frame height and its top as tall again as asked, plus lamps.
      for (const signStyle of ['framed', 'slim', 'tiled']) {
        const d = derived({
          style: 'ribbon', floors: 4, roof: 'parapet', signPlace: 'roof', signMount: 'frame',
          signLift: 12, signHeight: 14, signStyle,
        });
        const roof = buildRoof(m, d, makePlan(d).core)!;
        expect(roof.status(), signStyle).toBe('NoError');
        expect(shells(roof), signStyle).toBe(1);
        const top = d.roofZ + d.roofT + d.signLift + d.signH;
        expect(roof.boundingBox().max[2]!, signStyle).toBeGreaterThan(top);
        // The tower is open: a slice through its own footprint, above the
        // parapet and below the board, is mostly air.
        const s = roofScreenSpan(d)!;
        const zSlice = d.roofZ + d.roofT + d.signLift * 0.75;
        const slice = m.Manifold.cube([s.x1 - s.x0, s.y1 - s.y0, 0.4], true).translate([
          (s.x0 + s.x1) / 2,
          (s.y0 + s.y1) / 2,
          zSlice,
        ]);
        expect(roof.intersect(slice).volume(), signStyle).toBeLessThan(slice.volume() * 0.35);
        expect(roof.intersect(slice).volume(), signStyle).toBeGreaterThan(0);
      }
      // No flat roof, no rooftop screen -- and the app says why.
      expect(
        issuesOf({ style: 'ribbon', roof: 'gable', signPlace: 'roof' }, 'warn').join(),
      ).toMatch(/rooftop screen needs a flat roof/);
    } finally {
      cleanup();
    }
  });

  it('closes a window by not cutting through it, not by filling it afterwards', async () => {
    const m = await kernel();
    try {
      // Plain, so the ribbon has no mullion piers standing in it: the probe
      // below has to meet the pane or nothing, never a pier that happened to
      // land on it.
      const base: Params = { style: 'plain', windows: 'ribbon', layout: 'open', core: false, joint: 'none' };
      const open = derived(base);
      const glazed = derived({ ...base, glazing: true });
      expect(glazed.glazing).toBe(true);

      const sill = glazed.levelZ[1]! + glazed.slabT + glazed.sill;
      const probe = (d: typeof glazed) => {
        const solid = buildStorey(m, d, makePlan(d), 1).solid;
        expect(shells(solid)).toBe(1);
        // A bar driven along Y through the middle of the window band: it meets
        // whatever the front and back walls have left at that height.
        const bar = m.Manifold.cube([0.05, d.D + 4, 0.05], true).translate([
          0,
          0,
          sill + d.winH / 2,
        ]);
        return { solid, hits: solid.intersect(bar).decompose().filter((p) => p.volume() > 1e-9) };
      };

      // Open: the bar goes straight through both openings and meets nothing.
      expect(probe(open).hits).toHaveLength(0);
      // Glazed: it meets a pane at the back of each opening, and the pane is
      // the wall's own thickness less the reveal -- nothing was added.
      const closed = probe(glazed);
      expect(closed.hits).toHaveLength(2);
      for (const hit of closed.hits) {
        const b = hit.boundingBox();
        expect(b.max[1]! - b.min[1]!).toBeCloseTo(glazed.paneT, 3);
      }
      expect(closed.solid.volume()).toBeGreaterThan(probe(open).solid.volume());
    } finally {
      cleanup();
    }
  });

  it('hangs a door on both faces, or on one when the partition is too thin', async () => {
    const m = await kernel();
    try {
      // 5 in partitions at 1:144 are 0.88 mm: half of that, split two ways, is
      // not a reveal. The leaf goes in anyway, showing on one face.
      expect(derived({ doorLeaves: true }).leafOneSided).toBe(true);
      // Thick partitions at a big scale can afford both.
      expect(derived({ doorLeaves: true, partition: 14, scale: 87 }).leafOneSided).toBe(false);

      const d = derived({ style: 'plain', layout: 'rooms', rooms: 4, core: false, joint: 'none', doorLeaves: true, partition: 14, scale: 87 });
      const plan = makePlan(d);
      expect(plan.doors.length).toBeGreaterThan(0);
      const solid = buildStorey(m, d, plan, 1).solid;
      expect(shells(solid)).toBe(1);

      // A bar driven through a doorway, across the partition it is cut in.
      const dr = plan.doors[0]!;
      const z = d.levelZ[1]! + d.slabT + Math.min(d.doorH, d.levelH[1]! - d.slabT) / 2;
      const span = 4 * d.partT;
      const bar = m.Manifold.cube(
        dr.horizontal ? [0.05, span, 0.05] : [span, 0.05, 0.05],
        true,
      ).translate(dr.horizontal ? [dr.pos, dr.at, z] : [dr.at, dr.pos, z]);
      const hits = solid.intersect(bar).decompose().filter((piece) => piece.volume() > 1e-9);
      expect(hits).toHaveLength(1);
      const b = hits[0]!.boundingBox();
      const thick = dr.horizontal ? b.max[1]! - b.min[1]! : b.max[0]! - b.min[0]!;
      expect(thick).toBeCloseTo(d.leafT, 3);
      expect(thick).toBeLessThan(d.partT);
    } finally {
      cleanup();
    }
  });

  it('braces the columns with a shopfront, and says what the column became', async () => {
    const m = await kernel();
    try {
      // The minimum column is a slenderness, not just a real-world size: a
      // 14 ft ground storey would otherwise stand on 10:1 posts.
      const tall = derived({ style: 'ribbon', tallGround: true, groundHeight: 14 });
      expect(tall.colSize).toBeCloseTo(tall.colH / 8, 6);
      expect(tall.colSize).toBeGreaterThan(tall.colSizeScaled);
      expect(issuesOf({ style: 'ribbon', tallGround: true, groundHeight: 14 }, 'warn').join(' ')).toContain(
        'reads as a 1 ft 8 in column',
      );
      // A short ground storey needs no help and gets none.
      const short = derived({ style: 'ribbon' });
      expect(short.colSize).toBeCloseTo(short.colSizeScaled, 6);

      // The shopfront is on by default for this type, off for an apartment's
      // undercroft, and it is real material between the columns.
      expect(derived({ style: 'ribbon' }).shopfront).toBe(true);
      expect(derived({ style: 'apartment' }).shopfront).toBe(false);
      expect(derived({ style: 'ribbon', shopfront: 'open' }).shopfront).toBe(false);

      const braced = derived({ style: 'ribbon', joint: 'none' });
      const bare = derived({ style: 'ribbon', shopfront: 'open', joint: 'none' });
      const groundOf = (d: typeof braced) => buildStorey(m, d, makePlan(d, d.groundOpen), 0).solid;
      const withGlass = groundOf(braced);
      expect(shells(withGlass)).toBe(1);
      expect(withGlass.volume()).toBeGreaterThan(groundOf(bare).volume());
      expect(issuesOf({ style: 'ribbon', shopfront: 'open' }, 'warn').join(' ')).toContain(
        'Nothing braces the columns',
      );
    } finally {
      cleanup();
    }
  });

  it('caps the commercial block with a set-back penthouse', async () => {
    const m = await kernel();
    try {
      const d = derived({ style: 'ribbon', roof: 'penthouse', parapet: 4, penthouseHeight: 10 });
      const roof = buildRoof(m, d, makePlan(d).core);
      expect(roof.status()).toBe('NoError');
      expect(shells(roof)).toBe(1);
      const b = roof.boundingBox();
      // It stands well above the parapet -- that is the whole point of it --
      // and is set back inside the footprint rather than sitting on the wall.
      expect(b.max[2]!).toBeGreaterThan(d.roofZ + d.parapetH + d.penthouseH / 2);
      expect(b.max[0]! - b.min[0]!).toBeCloseTo(d.W, 1);
    } finally {
      cleanup();
    }
  });

  it('keeps every storey of the commercial preset in one piece', async () => {
    const m = await kernel();
    try {
      const preset = buildingGenerator.presets!.find((p) => p.label.startsWith('Commercial'))!;
      const d = derive(paramsWith(preset.values));
      const plan = makePlan(d);
      for (let level = 0; level < d.floors; level++) {
        const storey = buildStorey(m, d, level === 0 ? makePlan(d, d.groundOpen) : plan, level);
        expect(shells(storey.solid), `level ${level}`).toBe(1);
      }
      expect(shells(buildRoof(m, d, plan.core))).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('keys one storey into the next with a tongue and a groove that fits it', async () => {
    const m = await kernel();
    try {
      const d = derived({ style: 'plain', floors: 3, windows: 'none', layout: 'open', core: false });
      expect(d.joint).toBe('tongue');

      const plan = makePlan(d);
      const lower = buildStorey(m, d, plan, 1).solid;
      const upper = buildStorey(m, d, plan, 2).solid;
      expect(shells(lower)).toBe(1);
      expect(shells(upper)).toBe(1);

      // A pin on the wall centreline, driven down the middle of the side wall.
      const at = (solid: typeof lower, z0: number, z1: number) => {
        const probe = m.Manifold.cube([0.05, 0.05, z1 - z0], true).translate([
          d.W / 2 - d.extT / 2,
          0,
          (z0 + z1) / 2,
        ]);
        return solid.intersect(probe).boundingBox();
      };

      // The tongue stands above the wall head it grew out of.
      const top = d.levelZ[1]! + d.levelH[1]!;
      const rib = at(lower, top - 1, top + d.tongueH + 1);
      expect(rib.max[2]!).toBeCloseTo(top + d.tongueH, 3);

      // And the slab above it is hollowed out to exactly that depth, so the
      // two go together rather than meeting face to face.
      const base = d.levelZ[2]!;
      const slot = at(upper, base - 1, base + d.grooveD + 1);
      expect(slot.min[2]!).toBeCloseTo(base + d.grooveD, 3);
      // The groove clears the tongue on both sides, or the joint is a press
      // fit that splits the slab.
      expect(d.grooveD).toBeGreaterThan(d.tongueH);
      expect(d.tongueW + 2 * d.pinClear).toBeLessThan(d.extT);
    } finally {
      cleanup();
    }
  });

  it('falls back to pins where there is no wall head to run a tongue along', () => {
    // An open ground floor has no wall at the top of it at all -- only columns
    // -- so a rib run round the wall line up there would be a loose ring.
    const ribbon = derived({ style: 'ribbon' });
    expect(ribbon.joint).toBe('tongue');
    expect(jointAt(ribbon, 0)).toBe('pins');
    expect(jointAt(ribbon, 1)).toBe('tongue');
    // And a wall too thin to hold a tongue keys with pins throughout, said out
    // loud rather than silently downgraded.
    const thin = derived({ scale: 200, extWall: 4, slab: 4 });
    expect(thin.joint).toBe('pins');
    expect(issuesOf({ scale: 200, extWall: 4, slab: 4 }, 'warn').join(' ')).toContain(
      'no room for a tongue',
    );
  });

  // --- the generator end to end -------------------------------------------

  it('builds every part watertight, in one piece each', async () => {
    const m = await kernel();
    try {
      const p = paramsWith();
      const out = buildingGenerator.build(p, ctxFor(m));
      expect(out.issues.filter((i) => i.level === 'error')).toEqual([]);
      // Three storeys and a roof.
      expect(out.parts.length).toBe(4);

      for (const part of out.parts) {
        expect(part.mesh.stats.volumeMm3).toBeGreaterThan(1);
        expect(part.mesh.stats.tris).toBeGreaterThan(50);
      }
      expect(out.readouts?.['Scale']).toMatch(/^1:144/);
      expect(out.readouts?.['Storey']).toMatch(/9 ft 6 in floor to floor/);
    } finally {
      cleanup();
    }
  });

  it('fits its storeys on a 256 mm bed at the default size', async () => {
    const m = await kernel();
    try {
      const out = buildingGenerator.build(paramsWith(), ctxFor(m));
      const plate = packPlate(out.parts, [256, 256], buildingGenerator.plateGap);
      expect(plate.overflow).toEqual([]);
      expect(plate.fits).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('builds the whole thing as one sealed piece when asked', async () => {
    const m = await kernel();
    try {
      const out = buildingGenerator.build(paramsWith({ split: 'single' }), ctxFor(m));
      const building = out.parts.find((part) => part.id === 'building')!;
      expect(building).toBeDefined();
      // Grouped with the roof so the packer keeps the two together.
      expect(building.group).toBe('building');
      // Up to the roof deck -- plus the top tread of the stair to the roof,
      // which stands one riser below the deck's walking level and so rises
      // into the opening in the deck by however much thicker the deck is.
      const d = derived();
      const n = risersFor(d, d.levelFt[d.floors - 1]!);
      const rise = d.levelH[d.floors - 1]! / n;
      expect(building.mesh.bbox.max[2]! - building.mesh.bbox.min[2]!).toBeCloseTo(
        d.roofZ + Math.max(0, d.roofT - rise),
        1,
      );
    } finally {
      cleanup();
    }
  });

  it('builds each preset without an error', async () => {
    const m = await kernel();
    try {
      for (const preset of buildingGenerator.presets ?? []) {
        const p = paramsWith(preset.values);
        const out = buildingGenerator.build(p, ctxFor(m));
        const errors = out.issues.filter((i) => i.level === 'error').map((i) => i.message);
        expect(errors, preset.label).toEqual([]);
        expect(out.parts.length, preset.label).toBeGreaterThan(0);
        for (const part of out.parts) {
          expect(part.mesh.stats.volumeMm3, `${preset.label} / ${part.name}`).toBeGreaterThan(0.5);
        }
      }
    } finally {
      cleanup();
    }
  });
});

describe('building miniature — shelf corner, rooftop, wall finish', () => {
  const corner = (patch: Params = {}) =>
    derived({ footprint: 'corner', width: 48, depth: 40, wing: 18, ...patch });
  const cornerParams = (patch: Params = {}) =>
    paramsWith({ footprint: 'corner', width: 48, depth: 40, wing: 18, ...patch });

  it('lays an L on the plan, with a wing along each shelf wall', async () => {
    const m = await kernel();
    try {
      // Plain, so no floor band stands proud of the wall at slab height.
      const d = corner({ style: 'plain' });
      const slab = buildStorey(m, d, makePlan(d), 0).solid.intersect(
        m.Manifold.cube([d.W * 2, d.D * 2, d.slabT * 0.5], true).translate([0, 0, d.slabT * 0.25]),
      );
      // Bounding rectangle less the courtyard.
      const want = (d.W * d.D - (d.W - d.wing) * (d.D - d.wing)) * d.slabT * 0.5;
      expect(slab.volume()).toBeCloseTo(want, 0);
    } finally {
      cleanup();
    }
  });

  it('keeps everything flush with the two shelf walls, whatever stands proud elsewhere', async () => {
    const m = await kernel();
    try {
      // Floor bands, a base course and eaves all project by design.
      for (const patch of [
        { style: 'office' },
        { style: 'curtain' },
        { style: 'plain', roof: 'gable', eaves: 2 },
        { style: 'plain', roof: 'hip', eaves: 2 },
      ] as Params[]) {
        const d = corner(patch);
        const out = buildingGenerator.build(cornerParams(patch), ctxFor(m));
        expect(out.issues.filter((i) => i.level === 'error'), JSON.stringify(patch)).toEqual([]);
        for (const part of out.parts) {
          const label = `${JSON.stringify(patch)} / ${part.name}`;
          expect(part.mesh.bbox.min[0]!, label).toBeGreaterThan(-d.W / 2 - 1e-3);
          expect(part.mesh.bbox.max[1]!, label).toBeLessThan(d.D / 2 + 1e-3);
        }
        // And the walls actually reach them, or it does not go into the corner.
        const ground = out.parts.find((part) => part.id === 'storey-0')!;
        expect(ground.mesh.bbox.min[0]!).toBeCloseTo(-d.W / 2, 3);
        expect(ground.mesh.bbox.max[1]!).toBeCloseTo(d.D / 2, 3);
      }
    } finally {
      cleanup();
    }
  });

  it('turns into the right-hand corner as a mirror image', async () => {
    const m = await kernel();
    try {
      const d = corner({ cornerSide: 'right' });
      expect(d.mirror).toBe(true);
      const out = buildingGenerator.build(cornerParams({ cornerSide: 'right', style: 'office' }), ctxFor(m));
      for (const part of out.parts) {
        expect(part.mesh.bbox.max[0]!, part.name).toBeLessThan(d.W / 2 + 1e-3);
        expect(part.mesh.bbox.max[1]!, part.name).toBeLessThan(d.D / 2 + 1e-3);
      }
    } finally {
      cleanup();
    }
  });

  it('leaves the shelf walls blank and opens the faces you can see', async () => {
    const m = await kernel();
    try {
      const d = corner({ windows: 'punched', cladding: 'smooth' });
      const solid = buildStorey(m, d, makePlan(d), 1).solid;
      const z = d.levelZ[1]! + d.slabT + d.sill + d.winH / 2;
      // A probe the thickness of the wall, the length of the face, at window height.
      const probe = (x0: number, x1: number, y0: number, y1: number) =>
        m.Manifold.cube([x1 - x0, y1 - y0, 0.5], true).translate([(x0 + x1) / 2, (y0 + y1) / 2, z]);
      const back = probe(-d.W / 2 + d.wing, d.W / 2 - d.pier, d.D / 2 - d.extT, d.D / 2);
      const left = probe(-d.W / 2, -d.W / 2 + d.extT, -d.D / 2 + d.pier, d.D / 2 - d.wing);
      expect(solid.intersect(back).volume()).toBeCloseTo(back.volume(), 3);
      expect(solid.intersect(left).volume()).toBeCloseTo(left.volume(), 3);
      // The courtyard face of the back wing has windows in it.
      const iy = d.D / 2 - d.wing;
      const front = probe(-d.W / 2 + d.wing + d.pier, d.W / 2 - d.pier, iy, iy + d.extT);
      expect(solid.intersect(front).volume()).toBeLessThan(front.volume() * 0.8);
    } finally {
      cleanup();
    }
  });

  it('plans the L with the core in the shelf corner and every room inside the walls', () => {
    for (const layout of ['rooms', 'corridor', 'open']) {
      const d = corner({ layout });
      const plan = makePlan(d);
      const ix = -d.W / 2 + d.wing;
      const iy = d.D / 2 - d.wing;
      for (const r of plan.rooms) {
        // Not in the courtyard.
        expect(r.x0 >= ix - 1e-6 && r.y1 <= iy + 1e-6, layout).toBe(false);
        expect(r.x0).toBeGreaterThanOrEqual(-d.W / 2 + d.extT - 1e-6);
        expect(r.y1).toBeLessThanOrEqual(d.D / 2 - d.extT + 1e-6);
      }
      for (let i = 0; i < plan.rooms.length; i++) {
        for (let j = i + 1; j < plan.rooms.length; j++) {
          expect(overlaps(plan.rooms[i]!, plan.rooms[j]!), `${layout} ${i}/${j}`).toBe(false);
        }
      }
      // The shaft is tucked into the corner of the two shelf walls.
      expect(plan.core, layout).not.toBeNull();
      expect(plan.core!.x0).toBeCloseTo(-d.W / 2 + d.extT, 6);
      expect(plan.core!.y1).toBeCloseTo(d.D / 2 - d.extT, 6);
      expect(stairFit(d, plan.core!, d.levelFt[0]!).ok, layout).toBe(true);
    }
    // The open plan tiles the L exactly.
    const d = corner({ layout: 'open' });
    const floor = makePlan(d).rooms.reduce((s, r) => s + area(r), 0);
    const iw = d.W - 2 * d.extT;
    const id = d.D - 2 * d.extT;
    expect(floor).toBeCloseTo(iw * id - (d.W - d.wing) * (d.D - d.wing), 3);
  });

  it('refuses wings that leave no courtyard', () => {
    expect(issuesOf({ footprint: 'corner', width: 30, depth: 30, wing: 26 }, 'error').join()).toMatch(
      /courtyard/,
    );
  });

  it('builds every type as a corner building, in one piece per part', async () => {
    const m = await kernel();
    try {
      for (const style of ['apartment', 'office', 'ribbon', 'curtain', 'modern', 'plain']) {
        for (const openFront of [false, true]) {
          const d = corner({ style, openFront });
          const plan = makePlan(d);
          for (let i = 0; i < d.floors; i++) {
            const solid = buildStorey(m, d, i === 0 && d.groundOpen ? makePlan(d, true) : plan, i).solid;
            expect(solid.status()).toBe('NoError');
            expect(shells(solid), `${style} cutaway=${openFront} storey ${i}`).toBe(1);
          }
          const roof = buildRoof(m, d, plan.core)!;
          expect(shells(roof), `${style} roof`).toBe(1);
        }
      }
    } finally {
      cleanup();
    }
  });

  it('roofs an L with two pitched wings run into each other, sealed', async () => {
    const m = await kernel();
    try {
      for (const roof of ['gable', 'hip']) {
        const d = corner({ style: 'plain', roof });
        const solid = buildRoof(m, d, makePlan(d).core)!;
        expect(solid.status()).toBe('NoError');
        expect(shells(solid), roof).toBe(1);
        // The ridge stands over the middle of the wing, not over the courtyard.
        const ridge = solid.boundingBox().max[2]!;
        const rise = (d.wing / 2 + d.eaves) * Math.tan((d.pitchDeg * Math.PI) / 180);
        expect(ridge).toBeCloseTo(d.roofZ + rise, 1);
      }
    } finally {
      cleanup();
    }
  });

  it('puts each rooftop feature on the deck as its own part', async () => {
    const m = await kernel();
    try {
      for (const rooftop of ['helipad', 'garden', 'plant', 'watertank', 'solar']) {
        for (const patch of [{}, { footprint: 'corner', width: 60, depth: 50, wing: 30 }] as Params[]) {
          const patchAll = { width: 60, depth: 44, roof: 'parapet', rooftop, ...patch };
          const p = paramsWith(patchAll);
          const d = derive(p);
          const out = buildingGenerator.build(p, ctxFor(m));
          const label = `${rooftop} ${JSON.stringify(patch)}`;
          expect(issuesOf(patchAll, 'warn').join('\n'), label).not.toMatch(/left off/);
          const part = out.parts.find((x) => x.id === 'rooftop');
          expect(part, label).toBeDefined();
          expect(part!.mesh.stats.volumeMm3, label).toBeGreaterThan(1);
          // On the deck, not under it or floating over it.
          expect(part!.mesh.bbox.min[2]!, label).toBeGreaterThanOrEqual(d.roofZ + d.roofT - 0.31);
          expect(part!.mesh.bbox.min[2]!, label).toBeLessThan(d.roofZ + d.roofT + 0.01);
          expect(out.readouts?.['Prints as'], label).toMatch(/rooftop/);
        }
      }
    } finally {
      cleanup();
    }
  });

  it('carries the stair up from the top storey to the roof when there is a stair head', async () => {
    const m = await kernel();
    try {
      for (const patch of [{}, { footprint: 'corner', width: 48, depth: 40, wing: 18 }] as Params[]) {
        const label = JSON.stringify(patch);
        const d = derived({ roof: 'parapet', bulkhead: true, core: true, ...patch });
        const plan = makePlan(d);
        const top = d.floors - 1;
        expect(buildStorey(m, d, plan, top).hasStair, label).toBe(true);

        // The deck is open over the shaft, so the stair has somewhere to arrive.
        const c = plan.core!;
        const roof = buildRoof(m, d, c)!;
        const plug = m.Manifold.cube([c.x1 - c.x0 - 1, c.y1 - c.y0 - 1, d.roofT * 0.5], true).translate([
          (c.x0 + c.x1) / 2,
          (c.y0 + c.y1) / 2,
          d.roofZ + d.roofT / 2,
        ]);
        expect(roof.intersect(plug).volume(), label).toBeCloseTo(0, 3);
        expect(shells(roof), label).toBe(1);
      }
      // No stair head, no flight to nowhere.
      for (const patch of [{ roof: 'gable' }, { roof: 'parapet', bulkhead: false }, { roof: 'none' }] as Params[]) {
        const d = derived({ core: true, ...patch });
        expect(buildStorey(m, d, makePlan(d), d.floors - 1).hasStair, JSON.stringify(patch)).toBe(false);
      }
    } finally {
      cleanup();
    }
  });

  it('sets the helipad over the core in place of the plant room', async () => {
    const m = await kernel();
    try {
      const d = derived({ roof: 'parapet', rooftop: 'helipad', width: 60, depth: 44 });
      const withPad = buildRoof(m, d, makePlan(d).core)!;
      const plain = derived({ roof: 'parapet', rooftop: 'empty', width: 60, depth: 44 });
      const withPlant = buildRoof(m, plain, makePlan(plain).core)!;
      expect(withPad.boundingBox().max[2]!).toBeLessThan(withPlant.boundingBox().max[2]!);
    } finally {
      cleanup();
    }
  });

  it('says when a rooftop feature does not fit', () => {
    expect(
      issuesOf({ width: 20, depth: 16, roof: 'parapet', rooftop: 'helipad', core: false }, 'warn').join(),
    ).toMatch(/helipad needs about 24 ft/);
  });

  it('leaves the top open with no roof, and nothing to key one onto', async () => {
    const m = await kernel();
    try {
      const p = paramsWith({ roof: 'none' });
      const d = derive(p);
      const out = buildingGenerator.build(p, ctxFor(m));
      expect(out.parts.find((x) => x.id === 'roof')).toBeUndefined();
      expect(out.parts.length).toBe(d.floors);
      const top = out.parts.find((x) => x.id === `storey-${d.floors - 1}`)!;
      expect(top.mesh.bbox.max[2]!).toBeCloseTo(d.roofZ, 3);
      expect(jointAt(d, d.floors - 1)).toBe('none');
    } finally {
      cleanup();
    }
  });

  it('cuts every wall finish into the face without breaking the wall', async () => {
    const m = await kernel();
    try {
      const smooth = derived({ cladding: 'smooth' });
      const base = buildStorey(m, smooth, makePlan(smooth), 1).solid.volume();
      for (const cladding of ['brick', 'stone', 'siding', 'batten', 'panels']) {
        for (const patch of [{}, { footprint: 'corner', width: 48, depth: 40, wing: 18 }] as Params[]) {
          const d = derived({ cladding, ...patch });
          const solid = buildStorey(m, d, makePlan(d), 1).solid;
          const label = `${cladding} ${JSON.stringify(patch)}`;
          expect(solid.status(), label).toBe('NoError');
          expect(shells(solid), label).toBe(1);
          if (!patch.footprint) {
            // Joints take a little off the face and nothing else.
            expect(solid.volume(), label).toBeLessThan(base);
            expect(solid.volume(), label).toBeGreaterThan(base * 0.9);
          }
        }
      }
    } finally {
      cleanup();
    }
  });

  it('enlarges brick too fine to print, says so, and names the scale that shows it true', () => {
    const warns = issuesOf({ cladding: 'brick' }, 'warn').join('\n');
    expect(warns).toMatch(/drawn 2\.\d times real size/);
    expect(warns).toMatch(/At 1:48 it prints true to scale/);
    expect(issuesOf({ cladding: 'brick', scale: '48' }, 'warn').join('\n')).not.toMatch(/real size/);
  });

  it('divides each window into panes by leaving glazing bars standing', async () => {
    const m = await kernel();
    try {
      // Same building and windows, panes on and off: the bars are wall left
      // standing, so the paned storey has more of it -- and is still one piece.
      const on = derived({ style: 'modern', windows: 'punched', winWidth: 6, winHeight: 5 });
      const off = derived({ style: 'modern', windows: 'punched', winWidth: 6, winHeight: 5, panes: 'off' });
      expect(on.t.panes).toBe(true);
      expect(off.t.panes).toBe(false);
      const a = buildStorey(m, on, makePlan(on), 2).solid;
      const b = buildStorey(m, off, makePlan(off), 2).solid;
      expect(a.volume()).toBeGreaterThan(b.volume());
      expect(shells(a)).toBe(1);
      // Any type can take them.
      expect(derived({ style: 'office', panes: 'on' }).t.panes).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('opens the shop bays, squared or arched, and lets any type have them', async () => {
    const m = await kernel();
    try {
      const shop = derived({ style: 'modern' });
      expect(shop.t.ground).toBe('shop');
      const wall = derived({ style: 'modern', groundFloor: 'wall' });
      const arched = derived({ style: 'modern', archedShops: true });
      const vol = (d: ReturnType<typeof derived>) => {
        const s = buildStorey(m, d, makePlan(d, true), 0).solid;
        expect(shells(s)).toBe(1);
        return s.volume();
      };
      // Bays take more out of the front than the windows they replace; an
      // arched head takes less than a square one the same height.
      expect(vol(shop)).toBeLessThan(vol(wall));
      expect(vol(arched)).toBeGreaterThan(vol(shop));
      // The override reaches every type.
      expect(derived({ style: 'apartment', groundFloor: 'shop' }).t.ground).toBe('shop');
    } finally {
      cleanup();
    }
  });

  it('runs a guard rail round the roof: posts, a top rail and a curb, all one piece', async () => {
    const m = await kernel();
    try {
      for (const patch of [{}, { footprint: 'corner', width: 48, depth: 40, wing: 18 }] as Params[]) {
        const d = derived({ roof: 'railing', parapet: 3.5, ...patch });
        const roof = buildRoof(m, d, makePlan(d).core)!;
        expect(shells(roof)).toBe(1);
        // As tall as asked.
        const solidRail = derived({ roof: 'parapet', parapet: 3.5, ...patch });
        // Mid-height along the back: a rail is mostly gaps, a parapet is solid.
        const probe = m.Manifold.cube([d.W * 0.8, 2, 0.5], true).translate([
          0,
          d.D / 2 - 1,
          d.roofZ + d.roofT + d.parapetH / 2,
        ]);
        const railHit = roof.intersect(probe).volume();
        const wallHit = buildRoof(m, solidRail, makePlan(solidRail).core)!.intersect(probe).volume();
        expect(railHit, JSON.stringify(patch)).toBeGreaterThan(0);
        expect(railHit, JSON.stringify(patch)).toBeLessThan(wallHit * 0.6);
      }
    } finally {
      cleanup();
    }
  });

  it('glazes the curtain-wall stripes behind a grid, and keeps the windows out of them', async () => {
    const m = await kernel();
    try {
      // Window glazing OFF: the stripe still has its glass.
      const d = derived({ style: 'curtain', floors: 4, glazing: false });
      const spans = stripeSpans(d);
      expect(spans.length).toBe(d.stripeCount);
      const solid = buildStorey(m, d, makePlan(d), 2).solid;
      expect(shells(solid)).toBe(1);
      const front = -d.D / 2;
      const zMid = d.levelZ[2]! + d.levelH[2]! * 0.45;
      for (const [a, b] of spans) {
        // The pane: solid all the way across the stripe at the back of the wall.
        const pane = m.Manifold.cube([b - a - 1, d.paneT * 0.6, 0.4], true).translate([
          (a + b) / 2,
          front + d.extT - d.paneT / 2,
          zMid,
        ]);
        expect(solid.intersect(pane).volume()).toBeCloseTo(pane.volume(), 3);
        // In front of it: mostly open, but the mullions are there.
        const face = m.Manifold.cube([b - a - 1, 0.3, 0.4], true).translate([(a + b) / 2, front + 0.2, zMid]);
        const hit = solid.intersect(face).volume();
        expect(hit).toBeGreaterThan(0);
        expect(hit).toBeLessThan(face.volume() * 0.4);
        // No punched window left inside or beside it.
        for (const c of windowCentres(d, d.W)) {
          expect(c + d.winW / 2 <= a - d.pier || c - d.winW / 2 >= b + d.pier
            || !buildStorey(m, d, makePlan(d), 2).solid.intersect(
              m.Manifold.cube([d.winW * 0.5, d.extT * 0.5, 0.4], true).translate([c, front + d.extT * 0.75, d.levelZ[2]! + d.slabT + d.sill + d.winH / 2]),
            ).isEmpty()).toBe(true);
        }
      }
    } finally {
      cleanup();
    }
  });

  it('builds the commercial block: shops, sign board, framed windows, blades, cornice', async () => {
    const m = await kernel();
    try {
      const preset = buildingGenerator.presets!.find((x) => x.label.startsWith('Commercial:'))!;
      const p = paramsWith(preset.values);
      const d = derive(p);
      expect(d.t.label).toBe('Commercial');
      const plan = makePlan(d);
      for (let i = 0; i < d.floors; i++) {
        const solid = buildStorey(m, d, i === 0 && d.groundOpen ? makePlan(d, true) : plan, i).solid;
        expect(shells(solid), `storey ${i}`).toBe(1);
      }
      const roof = buildRoof(m, d, plan.core)!;
      expect(shells(roof)).toBe(1);

      const out = buildingGenerator.build(p, ctxFor(m));
      const type = out.readouts?.['Type'] ?? '';
      for (const word of ['paned windows', 'window surrounds and sills', 'glazed shop bays', 'shop sign board', 'blade signs', 'cornice', 'on the roof']) {
        expect(type, word).toContain(word);
      }
      // The blades stand further out from the front than anything else on the
      // upper floors; the cornice spreads past the walls all round the roof.
      const upper = buildStorey(m, d, plan, 1).solid.boundingBox();
      expect(-upper.min[1]! - d.D / 2).toBeGreaterThan(d.perFt * 2.5);
      expect(roof.boundingBox().max[0]! - d.W / 2).toBeGreaterThan(d.perFt);
      // The shop bays really open the street front: a ground floor with them is
      // lighter than the same floor walled up -- the door alone would not do it.
      const walled = derive(paramsWith({ ...preset.values, groundFloor: 'wall' }));
      const shopVol = buildStorey(m, d, makePlan(d, true), 0).solid.volume();
      const wallVol = buildStorey(m, walled, makePlan(walled, true), 0).solid.volume();
      // Glazed, so each bay takes out only its reveal: at least half the bays'
      // area less the windows they replace, times the reveal depth.
      const reveal = d.extT - d.paneT;
      const bays = 2 * 13 * 7.5;
      const windows = windowCentres(d, d.W).length * 3 * 5.5;
      expect(wallVol - shopVol).toBeGreaterThan(0.5 * (bays - windows) * d.perFt * d.perFt * reveal);
      // Five pieces on one plate, with the 10 mm gap.
      const plates = packPlates(out.parts, [256, 256], buildingGenerator.plateGap);
      expect(plates.plates.length).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('builds every Modern preset in one piece per part, with a stair that fits', async () => {
    const m = await kernel();
    try {
      const presets = buildingGenerator.presets!.filter((x) => x.label.startsWith('Modern:'));
      expect(presets.length).toBe(9);
      for (const preset of presets) {
        const p = paramsWith(preset.values);
        const d = derive(p);
        const warns = (buildingGenerator.validate?.(p) ?? []).map((i) => i.message).join('\n');
        expect(warns, preset.label).not.toMatch(/shafts have been left empty|rooms fit/);
        const plan = makePlan(d);
        for (let i = 0; i < d.floors; i++) {
          const solid = buildStorey(m, d, i === 0 && d.groundOpen ? makePlan(d, true) : plan, i).solid;
          expect(shells(solid), `${preset.label} storey ${i}`).toBe(1);
        }
        expect(shells(buildRoof(m, d, plan.core)!), `${preset.label} roof`).toBe(1);
      }
    } finally {
      cleanup();
    }
  });

  it('builds the shelf-corner preset as a stack that fits one plate', async () => {
    const m = await kernel();
    try {
      const preset = buildingGenerator.presets!.find((x) => /Shelf-corner/.test(x.label))!;
      const out = buildingGenerator.build(paramsWith(preset.values), ctxFor(m));
      expect(out.issues.filter((i) => i.level === 'error')).toEqual([]);
      const plate = packPlate(out.parts, [256, 256], buildingGenerator.plateGap);
      expect(plate.overflow).toEqual([]);
      // All of it on the one plate, with clear air between every pair of pieces.
      expect(plate.fits).toBe(true);
      const gap = buildingGenerator.plateGap!;
      expect(gap).toBeGreaterThanOrEqual(10);
      const boxes = plate.parts.map((part) => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let k = 0; k < part.positions.length; k += 3) {
          x0 = Math.min(x0, part.positions[k]!);
          x1 = Math.max(x1, part.positions[k]!);
          y0 = Math.min(y0, part.positions[k + 1]!);
          y1 = Math.max(y1, part.positions[k + 1]!);
        }
        return { x0, y0, x1, y1, group: part.group ?? part.id };
      });
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          if (a.group === b.group) continue;
          const clear = Math.max(b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1);
          expect(clear).toBeGreaterThanOrEqual(gap - 1e-3);
        }
      }
    } finally {
      cleanup();
    }
  });
});
