import { describe, expect, it } from 'vitest';
import { cleanup, kernel, loadFont } from './kernel';
import { petBowlGenerator } from '../src/generators/petbowl/build';
import {
  belowWaveSolid,
  bowlSolid,
  derive,
  wrapToWall,
} from '../src/generators/petbowl/geometry';
import { coerceAll, defaultsOf } from '../src/core/params/validate';
import { packPlate } from '../src/core/build/layout';
import type { BuildCtx, Params } from '../src/core/params/types';
import type { ManifoldToplevel } from 'manifold-3d';

function ctxFor(m: ManifoldToplevel): BuildCtx {
  return { m, font: (id) => loadFont(id), image: () => undefined, tolerance: 0.03, issue: () => {} };
}

function paramsWith(patch: Params = {}): Params {
  return coerceAll(petBowlGenerator, { ...defaultsOf(petBowlGenerator), ...patch });
}

function derived(patch: Params = {}) {
  const p = paramsWith(patch);
  return derive({ ...p, sideMotif: p.species === 'cat' ? 'whisker' : 'bone' });
}

function errorsOf(patch: Params = {}): string[] {
  return (petBowlGenerator.validate?.(paramsWith(patch)) ?? [])
    .filter((i) => i.level === 'error')
    .map((i) => i.message);
}

const DOG: Params = {
  species: 'dog', name: 'MILO', topDiameter: 170, height: 95, dishDepth: 52,
  baseFlare: 20, dishAngle: 12, nameSize: 12, plateWidth: 96, legHeight: 26,
};

describe('pet bowl', () => {
  // --- the wrap, which everything decorative goes through -------------------

  it('wraps decals onto the wall the right way out', async () => {
    const m = await kernel();
    try {
      const d = derived();
      const flat = m.CrossSection.square([20, 10], true).translate([0, d.plateZ]);
      const wrapped = wrapToWall(m, d, flat, { from: -1, to: 1, atDeg: 0 });

      // POSITIVE volume. The obvious frame for this -- arc to the right,
      // outward toward the viewer, height up -- is left-handed at a surface you
      // are looking at from outside, so the map inverts every solid it touches.
      // Inside-out solids still report a clean status and still boolean, they
      // just do the opposite of what was asked, which is near-impossible to see
      // in a preview.
      expect(wrapped.volume()).toBeGreaterThan(0);
      expect(wrapped.status()).toBe('NoError');
      // Area x thickness, give or take the curvature it was bent around.
      expect(wrapped.volume()).toBeCloseTo(20 * 10 * 2, -1);

      // It lands at the front (-Y) and straddles the wall surface there.
      const box = wrapped.boundingBox();
      expect(box.max[1]).toBeLessThan(0);
      expect(-box.min[1]).toBeGreaterThan(30);
    } finally {
      cleanup();
    }
  });

  it('puts a decal where it was asked round the bowl', async () => {
    const m = await kernel();
    try {
      const d = derived();
      const flat = m.CrossSection.square([12, 8], true).translate([0, d.plateZ]);
      const at = (deg: number) => {
        const b = wrapToWall(m, d, flat, { from: -1, to: 1, atDeg: deg }).boundingBox();
        return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
      };
      // Front is -Y, and the angle runs positive to the viewer's right (+X).
      expect(at(0)[1]!).toBeLessThan(0);
      expect(Math.abs(at(0)[0]!)).toBeLessThan(1);
      expect(at(90)[0]!).toBeGreaterThan(30);
      expect(at(180)[1]!).toBeGreaterThan(30);
      expect(at(270)[0]!).toBeLessThan(-30);
    } finally {
      cleanup();
    }
  });

  // --- the colour split -----------------------------------------------------

  it('splits the shell into two solids that add back up to it', async () => {
    const m = await kernel();
    try {
      const d = derived();
      const shell = bowlSolid(m, d);
      const below = belowWaveSolid(m, d, Math.max(d.rTop, d.rBase) + 4, -10);
      const lower = shell.intersect(below);
      const upper = shell.subtract(below);

      expect(lower.volume()).toBeGreaterThan(100);
      expect(upper.volume()).toBeGreaterThan(100);
      expect(upper.volume() + lower.volume()).toBeCloseTo(shell.volume(), 0);
      // Two colours, not one region counted twice.
      expect(upper.intersect(lower).volume()).toBeLessThan(0.5);
    } finally {
      cleanup();
    }
  });

  it('keeps the whole dish in one colour', async () => {
    const m = await kernel();
    try {
      // The invariant that matters: whatever the sliders say, the cut must stay
      // below the inside floor. Above it the split surfaces inside the bowl and
      // the animal eats out of a two-tone dish.
      for (const patch of [{}, DOG, { waveHeight: 80 }, { waveHeight: 80, waveAmplitude: 20 }]) {
        const d = derived(patch);
        const result = petBowlGenerator.build(paramsWith(patch), ctxFor(m));
        const lower = result.parts.find((x) => x.id === 'lower');
        if (!lower) continue;
        expect(lower.mesh.bbox.max[2], JSON.stringify(patch)).toBeLessThanOrEqual(d.zFloor);
      }
    } finally {
      cleanup();
    }
  });

  it('makes the split wavy, or flat when asked', async () => {
    const m = await kernel();
    try {
      const heightAt = (amp: number, deg: number): number => {
        const d = derived({ waveAmplitude: amp });
        const below = belowWaveSolid(m, d, Math.max(d.rTop, d.rBase) + 4, -10);
        const probe = m.Manifold.cube([4, 4, 200], true)
          .rotate([0, 0, -deg])
          .translate([
            (d.rTop - 6) * Math.sin((deg * Math.PI) / 180),
            -(d.rTop - 6) * Math.cos((deg * Math.PI) / 180),
            0,
          ]);
        return below.intersect(probe).boundingBox().max[2];
      };

      // Three lobes, dipping at the front: the band is lowest under the name
      // and rides up at the sides, which is what a real colour break does.
      const front = heightAt(6, 0);
      const side = heightAt(6, 60);
      expect(side - front).toBeGreaterThan(6);

      // Zero amplitude is a straight band, all the way round.
      expect(heightAt(0, 0)).toBeCloseTo(heightAt(0, 60), 1);
    } finally {
      cleanup();
    }
  });

  // --- parts ----------------------------------------------------------------

  it('gives the cat ears and the dog legs, and never the other way round', async () => {
    const m = await kernel();
    try {
      const cat = petBowlGenerator.build(paramsWith(), ctxFor(m));
      const ids = cat.parts.map((x) => x.id);
      expect(ids).toContain('ear-0');
      expect(ids).toContain('ear-1');
      // Ears stand above the rim they grow out of.
      const d = derived();
      const upper = cat.parts.find((x) => x.id === 'upper')!;
      expect(upper.mesh.bbox.max[2]).toBeGreaterThan(d.height + d.earH * 0.4);

      const dog = petBowlGenerator.build(paramsWith(DOG), ctxFor(m));
      expect(dog.parts.map((x) => x.id)).not.toContain('ear-0');
      // The dog's skirt is cut away for legs, so it weighs less than the same
      // bowl without them.
      const solidSkirt = petBowlGenerator.build(
        paramsWith({ ...DOG, legs: 0, handles: false }),
        ctxFor(m),
      );
      const vol = (r: typeof dog) =>
        r.parts.filter((x) => x.group === 'bowl').reduce((s, x) => s + x.mesh.stats.volumeMm3, 0);
      expect(vol(dog)).toBeLessThan(vol(solidSkirt));
    } finally {
      cleanup();
    }
  });

  it('cuts carry slots clean through the wall', async () => {
    const m = await kernel();
    try {
      const d = derived(DOG);
      const withSlots = petBowlGenerator.build(paramsWith(DOG), ctxFor(m));
      const upper = withSlots.parts.find((x) => x.id === 'upper')!;
      const solid = m.Manifold.ofMesh(
        new m.Mesh({
          numProp: upper.mesh.numProp,
          vertProperties: upper.mesh.position,
          triVerts: upper.mesh.index,
        }),
      );
      // A thin radial probe through the slot's middle must find no material.
      const probe = m.Manifold.cube([4, d.rTop * 3, 3], true).translate([0, 0, d.handleZ]);
      expect(solid.intersect(probe.rotate([0, 0, 90])).volume()).toBeLessThan(1);
      // The same probe turned to the front, where the plaque is, hits plenty.
      expect(solid.intersect(probe).volume()).toBeGreaterThan(20);
    } finally {
      cleanup();
    }
  });

  it('switches the maker’s mark off completely', async () => {
    const m = await kernel();
    try {
      const on = petBowlGenerator.build(paramsWith(), ctxFor(m));
      expect(on.parts.map((x) => x.id)).toContain('logo');

      const off = petBowlGenerator.build(paramsWith({ logo: false }), ctxFor(m));
      expect(off.parts.map((x) => x.id)).not.toContain('logo');
      // Off means gone, not hidden: no recess is left in the shell behind it.
      const lowerOn = on.parts.find((x) => x.id === 'lower')!.mesh.stats.volumeMm3;
      const lowerOff = off.parts.find((x) => x.id === 'lower')!.mesh.stats.volumeMm3;
      expect(lowerOff).toBeGreaterThanOrEqual(lowerOn - 0.5);
    } finally {
      cleanup();
    }
  });

  it('leaves the plaque empty but present when the name is blank', async () => {
    const m = await kernel();
    try {
      const blank = petBowlGenerator.build(paramsWith({ name: '   ' }), ctxFor(m));
      expect(blank.issues.filter((i) => i.level === 'error')).toEqual([]);
      expect(blank.parts.map((x) => x.id)).not.toContain('name');

      // The recess is still cut, so the plaque reads as a plaque.
      const named = petBowlGenerator.build(paramsWith(), ctxFor(m));
      const upperOf = (r: typeof blank) =>
        r.parts.find((x) => x.id === 'upper')!.mesh.stats.volumeMm3;
      expect(upperOf(blank)).toBeCloseTo(upperOf(named), -1);
    } finally {
      cleanup();
    }
  });

  it('reports capacity as a truncated cone, in millilitres', () => {
    const d = derived();
    // Over the dish's REAL run -- from under the rim's inner round-over down to
    // the top of the floor fillet -- not the nominal depth, and between the
    // radii at those two heights.
    const expected =
      (Math.PI * d.dishRun * (d.rTopIn ** 2 + d.rTopIn * d.rDishBot + d.rDishBot ** 2)) /
      3 /
      1000;
    expect(d.capacityMl).toBeCloseTo(expected, 6);
    // A sanity anchor: a 150 mm cat bowl 26 mm deep is a few hundred ml.
    expect(d.capacityMl).toBeGreaterThan(150);
    expect(d.capacityMl).toBeLessThan(600);
    // Twice as deep is twice the food, near enough on a gentle taper.
    expect(derived({ dishDepth: 40 }).capacityMl).toBeGreaterThan(d.capacityMl * 1.4);
  });

  it('leaves every part in one piece', async () => {
    const m = await kernel();
    try {
      for (const patch of [{}, DOG]) {
        const result = petBowlGenerator.build(paramsWith(patch), ctxFor(m));
        for (const part of result.parts) {
          const pieces = m.Manifold.ofMesh(
            new m.Mesh({
              numProp: part.mesh.numProp,
              vertProperties: part.mesh.position,
              triVerts: part.mesh.index,
            }),
          ).decompose();
          // The name and the mark are whole words, so one piece per glyph;
          // everything structural has to be a single body.
          if (part.id === 'name' || part.id === 'logo') {
            expect(pieces.length, `${part.name}`).toBeGreaterThanOrEqual(1);
            for (const piece of pieces) {
              expect(piece.volume(), `${part.name} sliver`).toBeGreaterThan(0.01);
            }
          } else {
            expect(pieces.length, `${part.name}`).toBe(1);
          }
        }
      }
    } finally {
      cleanup();
    }
  });

  it('packs onto a default bed', async () => {
    const m = await kernel();
    try {
      for (const patch of [{}, DOG]) {
        const result = petBowlGenerator.build(paramsWith(patch), ctxFor(m));
        const plate = packPlate(result.parts, [256, 256]);
        expect(plate.fits, `${JSON.stringify(patch)}: ${plate.overflow.join(', ')}`).toBe(true);
      }
    } finally {
      cleanup();
    }
  });

  // --- validation -----------------------------------------------------------

  it('refuses a dish deeper than the body it sits in', () => {
    expect(errorsOf({ height: 50, dishDepth: 48 }).join(' ')).toMatch(/no floor under it/i);
  });

  it('refuses an inside wall that overhangs too far to print', () => {
    // The OUTSIDE cannot overhang: it leans inward going up, so it is an
    // underhang whatever the flare. The inside is the one that can droop.
    expect(errorsOf({ dishAngle: 45 }).join(' ')).toMatch(/overhangs past 45/i);
    expect(errorsOf({ dishAngle: 30 })).toEqual([]);
    expect(errorsOf({ baseFlare: 60 })).toEqual([]);
  });

  it('is widest at its base, and still a bowl inside', () => {
    const d = derived();
    expect(d.rBase).toBeGreaterThan(d.rTop);
    // Which is what makes the outer wall an underhang: radius falls with height.
    expect(d.slope).toBeLessThan(0);
    // And the inside narrows on the way down, or it would be an undercut you
    // could neither print rim-up nor get a cloth into.
    expect(d.rDishBot).toBeLessThan(d.rTopIn);
  });

  it('refuses a plaque that wraps too far round the bowl', () => {
    expect(errorsOf({ topDiameter: 80, plateWidth: 150 }).join(' ')).toMatch(/wraps too far/i);
  });

  it('refuses a plaque cut deeper than the wall', () => {
    expect(errorsOf({ wall: 2, plateDepth: 2 }).join(' ')).toMatch(/nothing behind it/i);
  });

  it('refuses legs with nothing left between them', () => {
    expect(
      errorsOf({
        ...DOG, topDiameter: 70, baseFlare: 0, plateWidth: 60, nameSize: 8,
        legs: 6, archShare: 85,
      }).join(' '),
    ).toMatch(/of leg between/i);
  });

  it('warns rather than fails when the split is pushed above the floor', () => {
    const issues = petBowlGenerator.validate?.(paramsWith({ waveHeight: 80 })) ?? [];
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(issues.some((i) => /held down/i.test(i.message))).toBe(true);
  });

  it('builds every preset without errors', async () => {
    const m = await kernel();
    try {
      for (const preset of petBowlGenerator.presets ?? []) {
        const result = petBowlGenerator.build(paramsWith(preset.values), ctxFor(m));
        expect(
          result.issues.filter((i) => i.level === 'error'),
          `preset "${preset.label}"`,
        ).toEqual([]);
        expect(result.parts.length, `preset "${preset.label}"`).toBeGreaterThan(2);
        for (const part of result.parts) {
          expect(part.mesh.stats.volumeMm3, `${preset.label} / ${part.name}`).toBeGreaterThan(0);
        }
      }
    } finally {
      cleanup();
    }
  });
});
