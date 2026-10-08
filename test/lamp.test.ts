import { describe, expect, it } from 'vitest';
import type { ManifoldToplevel } from 'manifold-3d';
import { cleanup, kernel } from './kernel';
import { lampGenerator } from '../src/generators/lamp/build';
import {
  clearance,
  derive,
  bulbRadius,
  shadeInner,
  ringClearance,
  shadeRadius,
  shadeSurface,
} from '../src/generators/lamp/geometry';
import { baseProfile, baseSolid } from '../src/generators/lamp/parts/base';
import { baseInnerRadius, baseRadius } from '../src/generators/lamp/geometry';
import { shadeSolid } from '../src/generators/lamp/parts/shade';
import { FUSION_SCRIPT_NAME, fusionScript, sectionCount, shadeSections } from '../src/generators/lamp/fusion';
import { unzipSync, strFromU8 } from 'fflate';
import { coerceAll, defaultsOf } from '../src/core/params/validate';
import { segmentsForRadius } from '../src/core/kernel/primitives';
import { serialize } from '../src/core/kernel/serialize';
import type { BuildCtx, Params } from '../src/core/params/types';

function ctxFor(m: ManifoldToplevel): BuildCtx {
  return { m, font: () => { throw new Error('no fonts here'); }, image: () => undefined, tolerance: 0.03, issue: () => {} };
}

/** Coarse by default: these tests are about shape, not facet count. */
function paramsWith(patch: Params = {}): Params {
  return coerceAll(lampGenerator, {
    ...defaultsOf(lampGenerator),
    meshDetail: 'coarse',
    ...patch,
  });
}

function derived(patch: Params = {}) {
  return derive(paramsWith(patch));
}

function errorsOf(patch: Params = {}): string[] {
  return (lampGenerator.validate?.(paramsWith(patch)) ?? [])
    .filter((i) => i.level === 'error')
    .map((i) => i.message);
}

const TAU = Math.PI * 2;

/** The pleated empire preset, which is the other half of this generator. */
const PLEAT: Params = {
  shadeStyle: 'pleat', shadeHeight: 82, shadeBottomDia: 120, shadeTopDia: 58,
  bulge: 0, seatHeight: 12, baseDia: 76, baseHeight: 72, baseTopDia: 62,
  flutes: 44, fluteDepth: 3.6, crease: 85, twist: 0, bulbType: 'g45',
};

describe('table lamp', () => {
  // --- the surface, which everything else is measured against ---------------

  it('cuts flutes inward, so a typed diameter is a measured diameter', () => {
    const d = derived({ bulge: 0, twist: 0 });
    // Every sample sits between the silhouette and the silhouette less the two
    // ripple depths. Rippling symmetrically instead would make the hem come out
    // several mm wider than the number in the sidebar, which then quietly
    // fouls the shade ring the hem has to clear.
    for (const z of [0, 20, 44, 88]) {
      let max = -Infinity;
      for (let i = 0; i < 360; i++) {
        const r = shadeSurface(d, z, (i / 360) * TAU);
        expect(r).toBeLessThanOrEqual(shadeRadius(d, z) + 1e-9);
        expect(r).toBeGreaterThan(shadeRadius(d, z) - d.rippleDepth - 1e-9);
        max = Math.max(max, r);
      }
      expect(max).toBeCloseTo(shadeRadius(d, z), 4);
    }
  });

  it('measures the wall through the wall, not across the radius', () => {
    // A plain cone: hem 100, top 40, over 90 mm. Its flank leans at a known
    // angle, and the radial gap between the two surfaces has to be the wall
    // DIVIDED by the cosine of that lean -- otherwise a 1.2 mm wall on a raked
    // shade prints as two perimeters where three were asked for.
    const d = derived({
      flutes: 0, lobes: 0, bulge: 0, twist: 0,
      shadeBottomDia: 100, shadeTopDia: 40, shadeHeight: 90, shadeWall: 1.2,
    });
    const slope = (20 - 50) / 90;
    const expected = 1.2 * Math.sqrt(1 + slope * slope);
    for (const z of [20, 45, 70]) {
      const gap = shadeSurface(d, z, 0.7) - shadeInner(d, z, 0.7);
      expect(gap).toBeCloseTo(expected, 2);
      expect(gap).toBeGreaterThan(1.2);
    }
  });

  it('creases the valleys without moving the crests', () => {
    const soft = derived({ ...PLEAT, crease: 0 });
    const hard = derived({ ...PLEAT, crease: 100 });
    const z = 40;
    // Crest at theta = 0 either way, and the same radius there.
    expect(shadeSurface(hard, z, 0)).toBeCloseTo(shadeSurface(soft, z, 0), 6);
    expect(shadeSurface(soft, z, 0)).toBeCloseTo(shadeRadius(soft, z), 6);
    // The valley reaches the same depth; it is the approach that changes.
    const valley = Math.PI / soft.flutes;
    expect(shadeSurface(hard, z, valley)).toBeCloseTo(shadeSurface(soft, z, valley), 6);
    // Halfway down the flank the creased profile is FULLER: a scallop is two
    // arcs meeting at a cusp, not a cosine.
    const mid = valley / 2;
    expect(shadeSurface(hard, z, mid)).toBeGreaterThan(shadeSurface(soft, z, mid) + 0.05);
  });

  // --- the solids -----------------------------------------------------------

  it('lofts a watertight shade with its normals the right way out', async () => {
    const m = await kernel();
    try {
      const d = derived();
      const shade = shadeSolid(m, d);
      expect(shade.status()).toBe('NoError');
      // Positive, which is the whole test: the inner wall is the outer wall
      // wound backwards, and getting that wrong gives a solid that still passes
      // status() and still booleans -- it just does the opposite of what it was
      // asked, which is invisible in a preview.
      expect(shade.volume()).toBeGreaterThan(0);
      // A tube: one hole through it, hem to top opening.
      expect(shade.genus()).toBe(1);
      // Thin. A shade that came back solid would still be manifold.
      const bbox = shade.boundingBox();
      const envelope = Math.PI * d.rShadeMax ** 2 * d.shadeH;
      expect(shade.volume()).toBeLessThan(envelope * 0.15);
      expect(bbox.min[2]).toBeCloseTo(0, 3);
      expect(bbox.max[2]).toBeCloseTo(d.shadeH, 3);

      // The mesh really reaches the silhouette. Measured as a RADIUS over the
      // vertices, not as the width of the bounding box: with three lobes the
      // widest point and the point opposite it are not the same distance out,
      // so a box round a swirled shade is narrower than twice its radius and
      // reads as a mesh that fell short of the numbers it was given.
      const xyz = shade.getMesh().vertProperties;
      let far = 0;
      for (let i = 0; i < xyz.length; i += 3) {
        far = Math.max(far, Math.hypot(xyz[i]!, xyz[i + 1]!));
      }
      expect(far).toBeCloseTo(d.rShadeMax, 1);
    } finally {
      cleanup();
    }
  });

  it('builds a pleated shade with a fitter it can hang from', async () => {
    const m = await kernel();
    try {
      const d = derived(PLEAT);
      expect(d.mount).toBe('ring');
      const shade = shadeSolid(m, d);
      expect(shade.status()).toBe('NoError');
      expect(shade.volume()).toBeGreaterThan(0);
      // The fitter is a spider, so every gap between two spokes is another way
      // through the shade: four spokes plus the hub's own aperture is five
      // tunnels, and a solid that came back with one would be a shade whose
      // bottom had been blanked off.
      expect(d.spokes).toBe(4);
      expect(shade.genus()).toBe(d.spokes + 1);

      // The flange has to be a real annulus over the shade ring: its hole
      // clears the thread, and its outer edge reaches the wall.
      const ringR = d.socket.ring / 2;
      expect(d.rHole).toBeLessThan(ringR - 1);
      // A slab at the fitter height, inside the aperture, must be empty -- that
      // is the hole the holder comes up through.
      const probe = m.Manifold.cylinder(6, d.rHole - 0.2, d.rHole - 0.2, 24)
        .translate([0, 0, d.seatH - 1]);
      expect(shade.intersect(probe).volume()).toBeLessThan(0.01);
      // And a thin ring just outside it must be solid: the bearing face.
      const bearing = m.Manifold.cylinder(0.4, ringR - 0.5, ringR - 0.5, 48)
        .subtract(m.Manifold.cylinder(2, d.rHole + 0.3, d.rHole + 0.3, 48).translate([0, 0, -0.8]))
        .translate([0, 0, d.seatH + 0.3]);
      expect(shade.intersect(bearing).volume()).toBeGreaterThan(1);
    } finally {
      cleanup();
    }
  });

  it('leaves the holder a hole to come up through, and the cord a way out', async () => {
    const m = await kernel();
    try {
      const d = derived();
      const base = baseSolid(m, d);
      expect(base.status()).toBe('NoError');
      expect(base.volume()).toBeGreaterThan(0);

      // The threaded skirt passes clean through the deck.
      const skirt = m.Manifold.cylinder(d.deckT + 8, d.socket.thread / 2, d.socket.thread / 2, 64)
        .translate([0, 0, d.deckZ - d.deckT - 4]);
      expect(base.intersect(skirt).volume()).toBeLessThan(0.01);

      // The cord notch is a notch: same silhouette, less material than the
      // plain body of revolution it was cut from.
      const plain = m.Manifold.revolve(baseProfile(m, d), segmentsForRadius(d.rBase, 0.12));
      expect(base.volume()).toBeLessThan(plain.volume() - 20);
      expect(base.boundingBox().max[2]).toBeCloseTo(plain.boundingBox().max[2], 3);
      // ...and it is at the back, low down.
      const front = m.Manifold.cube([40, 40, d.socket.cord + 3], true).translate([0, -d.rBase, 0]);
      expect(base.intersect(front).volume()).toBeGreaterThan(10);
    } finally {
      cleanup();
    }
  });

  it('keeps the base a shell of the wall it was given, in both mounts', async () => {
    const m = await kernel();
    try {
      for (const [label, patch] of [['mushroom', {}], ['pleat', PLEAT]] as const) {
        const d = derived(patch);
        const base = baseSolid(m, d);
        // Slice the cone at a few heights and weigh each slice. A shell of the
        // right thickness is the one thing a self-intersecting profile does not
        // give you: cross the inner wall over its own edge and the revolve
        // comes back solid through the neck -- manifold, positive volume, right
        // silhouette, and several times the material.
        for (const frac of [0.25, 0.5, 0.75]) {
          const z = d.footH + frac * (d.neckZ - d.footH - 2);
          const slab = m.Manifold.cube([400, 400, 1], true).translate([0, 0, z + 0.5]);
          const ring = base.intersect(slab);
          const rO = baseRadius(d, z + 0.5);
          const rI = baseInnerRadius(d, z + 0.5);
          expect(ring.volume(), `${label} at ${z.toFixed(0)} mm`).toBeCloseTo(
            Math.PI * (rO * rO - rI * rI),
            -1,
          );
        }
      }
    } finally {
      cleanup();
    }
  });

  it('fits the two parts together without them sharing any material', async () => {
    const m = await kernel();
    try {
      for (const patch of [{}, PLEAT]) {
        const d = derived(patch);
        const base = baseSolid(m, d);
        const shade = shadeSolid(m, d);
        // Lift the shade off its seat by half a millimetre and the two solids
        // share nothing at all -- the spigot still reaches most of the way into
        // the hem, so this is a real check that it clears the fluted inner
        // surface rather than an arithmetic one on radii.
        //
        // Measured lifted rather than seated because seated they are MEANT to
        // touch: the hem's underside and the collar's shoulder are the same
        // plane, and intersecting two coincident faces gives back a scatter of
        // zero-thickness slivers with a volume attached to them. That is the
        // contact being real, not the parts fouling.
        const lifted = shade.translate([0, 0, d.shadeZ + 0.5]);
        expect(base.intersect(lifted).volume()).toBeLessThan(0.01);
        expect(d.shadeZ).toBeGreaterThanOrEqual(0);
      }
    } finally {
      cleanup();
    }
  });

  // --- the bulb, which is what the whole thing has to line up around --------

  it('measures the bulb by its widest silhouette, shoulder included', () => {
    const d = derived({ bulbType: 'a60' });
    const rise = d.socket.bulbRise;
    // The equator of a 60 mm envelope.
    const zc = rise + 110 - 30;
    expect(bulbRadius(d, zc)).toBeCloseTo(30, 1);
    // Above the tip and below the cap, nothing. The shade ring is deliberately
    // NOT folded in here: it is an assembly clearance where a few mm is plenty,
    // not a thermal one that wants centimetres, and one number covering both
    // reports a shade that clears its bulb by 8 mm as having 2.7.
    expect(bulbRadius(d, rise + 111)).toBe(0);
    expect(bulbRadius(d, 2)).toBe(0);
    // On the shoulder, between the cap and the equator, the hull is wider than
    // the cap and narrower than the envelope -- and strictly rising. Reading
    // only the cap and the sphere here is what tells a narrow shade it clears a
    // bulb it would actually rest against.
    const shoulder = rise + d.socket.capLen + 6;
    const capR = d.socket.capDia / 2;
    expect(bulbRadius(d, shoulder)).toBeGreaterThan(capR + 1);
    expect(bulbRadius(d, shoulder)).toBeLessThan(30);
    expect(bulbRadius(d, shoulder + 4)).toBeGreaterThan(bulbRadius(d, shoulder));
  });

  it('reports the clearance at the tightest point, not the average', () => {
    const roomy = clearance(derived({ bulbType: 'g45' }));
    expect(roomy.gap).toBeGreaterThan(5);
    // A bulb that plainly does not fit is reported as fouling, and refused.
    const tight = clearance(derived({ bulbType: 'g95' }));
    expect(tight.gap).toBeLessThan(roomy.gap);
    expect(errorsOf({ bulbType: 'g95' }).join(' ')).toMatch(/closes on the bulb/);
  });

  it('knows when the bulb pokes out of the top opening', () => {
    // A long thin bulb in a short shade sticks out of the top -- which is what
    // the reference lamps do, so it is worth saying rather than worth refusing.
    const tall: Params = { bulbType: 'c35', shadeHeight: 70 };
    expect(clearance(derived(tall)).bulbAbove).toBeGreaterThan(10);
    expect(errorsOf(tall)).toEqual([]);
    expect(clearance(derived({ bulbType: 'g45' })).bulbAbove).toBeLessThan(0);
  });

  // --- what it refuses ------------------------------------------------------

  it('checks the shade clears the ring all the way down, not just at the hem', () => {
    // Widest at the hem and closing in above it: the hem passes the ring and
    // the shade then jams halfway on. Checking one cross-section misses this.
    const waisted: Params = {
      shadeBottomDia: 110, shadeTopDia: 44, shadeHeight: 60, bulge: 0,
      flutes: 0, lobes: 4, lobeDepth: 18, twist: 0, bulbType: 'none',
    };
    // The hem itself is fine - 70 mm across inside, against a 55 mm ring.
    expect(derived(waisted).rHemIn).toBeGreaterThan(30);
    expect(ringClearance(derived(waisted))).toBeLessThan(0.5);
    expect(errorsOf(waisted).join(' ')).toMatch(/down over the shade ring/);
    // The defaults have real room to spare.
    expect(ringClearance(derived())).toBeGreaterThan(1);
  });

  it('refuses a lamp that cannot be assembled or printed', () => {
    // A hem that will not pass over the shade ring.
    expect(errorsOf({ shadeBottomDia: 58 }).join(' ')).toMatch(/shade ring|holder/);
    // A neck too narrow for the ring to land on, in the ring mount.
    expect(errorsOf({ ...PLEAT, baseTopDia: 44 }).join(' ')).toMatch(/shade ring is/);
    // Flutes deep enough to close the top opening.
    expect(errorsOf({ shadeBottomDia: 110, shadeTopDia: 20, fluteDepth: 8, lobes: 0, bulge: 0 }).join(' ')).toMatch(
      /top opening/,
    );
    // A bulge so abrupt that the wall outruns its own thickness per layer.
    expect(
      errorsOf({ shadeHeight: 40, bulge: 60, bulgeAt: 10, bulbType: 'none' }).join(' '),
    ).toMatch(/moves .* sideways per/);
    // A ring-hung shade on a base too short to hold it off the table.
    expect(errorsOf({ ...PLEAT, baseHeight: 26, seatHeight: 60 }).join(' ')).toMatch(
      /below the table/,
    );
    // And the defaults, plus both presets, are clean.
    expect(errorsOf()).toEqual([]);
    for (const preset of lampGenerator.presets ?? []) {
      expect(errorsOf(preset.values), preset.label).toEqual([]);
    }
  });

  it('judges the flare by the step per layer, not by an overhang angle', () => {
    const all = (patch: Params) =>
      (lampGenerator.validate?.(paramsWith(patch)) ?? []).map((i) => i.message).join(' ');

    // A rib crest that steps further sideways per layer than the wall is thick
    // is a layer hanging off the edge of the one below it.
    expect(errorsOf({ twist: 700, shadeWall: 0.8, bulbType: 'none' }).join(' ')).toMatch(
      /moves .* sideways per/,
    );

    // The default mushroom leans out 44 degrees at its steepest, which every
    // generic overhang rule would refuse and which prints perfectly: at a
    // 0.2 mm layer that is 0.19 mm of step inside a 1.2 mm wall. Refusing it
    // would have made the reference shape unreachable.
    const d = derived();
    expect(d.flareDeg).toBeGreaterThan(40);
    expect(d.lateralStep).toBeLessThan(0.6 * d.shadeWall);
    expect(all({})).not.toMatch(/sideways per/);
  });

  // --- the whole build ------------------------------------------------------

  it('builds both designs end to end', async () => {
    const m = await kernel();
    try {
      for (const patch of [{}, PLEAT]) {
        const result = lampGenerator.build(paramsWith(patch), ctxFor(m));
        expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
        expect(result.parts.map((p) => p.id)).toEqual(['base', 'shade']);
        for (const part of result.parts) {
          expect(part.mesh.stats.volumeMm3).toBeGreaterThan(0);
          // A tube, plus one more way through for every gap between spokes.
          expect(part.mesh.stats.genus).toBeLessThanOrEqual(derived(patch).spokes + 1);
        }
        // The shade is placed on the base in the assembled view, never left at
        // the origin sitting inside it.
        const shade = result.parts.find((p) => p.id === 'shade');
        expect(shade?.assembly?.[2]).toBeCloseTo(derived(patch).shadeZ, 6);
        expect(result.readouts?.['Bulb clearance']).toMatch(/mm above the deck/);
        expect(result.readouts?.['Over the ring']).toMatch(/to spare/);
        // An LED warning, every time there is a bulb to warn about.
        expect(result.issues.some((i) => /LED bulb/.test(i.message))).toBe(true);
      }
    } finally {
      cleanup();
    }
  });

  // --- the lamp it opens on, and the way out to Fusion -----------------------

  it('opens on the 170 x 120 mm swirl with a 3 mm wall', async () => {
    const d = derived();
    expect(d.shadeWall).toBe(3);
    expect(d.style).toBe('swirl');
    expect(d.mount).toBe('base');
    // Measured across the finished shade, not the silhouette the lobes dip in from.
    const m = await kernel();
    try {
      const { bbox } = serialize(shadeSolid(m, derive(paramsWith({ meshDetail: 'normal' }))));
      expect(bbox.max[0] - bbox.min[0]).toBeGreaterThan(169.5);
      expect(bbox.max[0] - bbox.min[0]).toBeLessThan(171);
      expect(bbox.max[2] - bbox.min[2]).toBeCloseTo(120, 6);
    } finally {
      cleanup();
    }
  });

  it('samples the Fusion sections along the flutes, off the preview surface', () => {
    const d = derived({ meshDetail: 'normal' });
    const sections = shadeSections(d);
    expect(sections).toHaveLength(sectionCount(d) + 1);
    expect(sections[0]!.z).toBe(0);
    expect(sections.at(-1)!.z).toBeCloseTo(d.shadeH, 9);
    for (const s of sections) {
      const spin = d.twistRad * (s.z / d.shadeH);
      s.outer.forEach(([x, y], j) => {
        const th = (j / s.outer.length) * TAU - spin;
        expect(Math.hypot(x, y)).toBeCloseTo(shadeSurface(d, s.z, th), 6);
        const [xi, yi] = s.inner[j]!;
        expect(Math.hypot(x, y) - Math.hypot(xi, yi)).toBeGreaterThanOrEqual(d.shadeWall - 1e-6);
      });
    }
    // Sample 0 rides the twist, so the loft joins a rib to the same rib.
    const top = sections.at(-1)!.outer[0]!;
    expect(Math.atan2(top[1], top[0])).toBeCloseTo(-d.twistRad, 6);
  });

  it('bundles the Fusion script with a manifest of the same name', async () => {
    const m = await kernel();
    try {
      for (const patch of [{}, PLEAT]) {
        const result = lampGenerator.build(paramsWith(patch), ctxFor(m));
        const fusion = result.vectors?.find((v) => v.id === 'fusion');
        expect(fusion?.extension).toBe('zip');
        const data = typeof fusion!.data === 'function' ? fusion!.data() : fusion!.data;
        const files = unzipSync(data as Uint8Array);
        const n = FUSION_SCRIPT_NAME;
        expect(Object.keys(files).sort()).toEqual(['README.txt', `${n}/${n}.manifest`, `${n}/${n}.py`]);
        expect(JSON.parse(strFromU8(files[`${n}/${n}.manifest`]!)).type).toBe('script');
        const py = strFromU8(files[`${n}/${n}.py`]!);
        expect(py).toMatch(/^def run\(context\):/m);
        expect(py).toContain('MM = 0.1');
        expect(py).toContain(patch === PLEAT ? 'FLANGE = (' : 'FLANGE = None');
      }
    } finally {
      cleanup();
    }
    // Every number is finite: a NaN would be a Python NameError halfway in.
    expect(fusionScript(derived(), 'Table lamp')).not.toMatch(/NaN|Infinity/);
  });
});
