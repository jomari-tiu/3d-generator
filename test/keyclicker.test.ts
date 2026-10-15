import { describe, expect, it } from 'vitest';
import { cleanup, kernel, loadFont } from './kernel';
import { keyClickerGenerator } from '../src/generators/keyclicker/build';
import { derive, keyX, legendChars, SWITCHES } from '../src/generators/keyclicker/geometry';
import { coerceAll, defaultsOf } from '../src/core/params/validate';
import { packPlate } from '../src/core/build/layout';
import type { BuildCtx, Params } from '../src/core/params/types';
import type { ManifoldToplevel } from 'manifold-3d';

function ctxFor(m: ManifoldToplevel): BuildCtx {
  return { m, font: (id) => loadFont(id), image: () => undefined, tolerance: 0.02, issue: () => {} };
}

function paramsWith(patch: Params = {}): Params {
  return coerceAll(keyClickerGenerator, { ...defaultsOf(keyClickerGenerator), ...patch });
}

function errorsOf(patch: Params = {}): string[] {
  return (keyClickerGenerator.validate?.(paramsWith(patch)) ?? [])
    .filter((i) => i.level === 'error')
    .map((i) => i.message);
}

describe('key clicker', () => {
  it('makes one key per character and drops blanks', () => {
    expect(legendChars(paramsWith({ text: 'KONG' }))).toEqual(['K', 'O', 'N', 'G']);
    expect(legendChars(paramsWith({ text: 'A B' }))).toEqual(['A', 'B']);
    expect(legendChars(paramsWith({ text: '' }))).toEqual([]);
  });

  it('builds a closed body and a cap-plus-legend per key', async () => {
    const m = await kernel();
    try {
      const result = keyClickerGenerator.build(paramsWith({ text: 'KONG' }), ctxFor(m));
      expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);

      const ids = result.parts.map((p) => p.id);
      expect(ids).toEqual([
        'base',
        'cap-0', 'legend-0', 'cap-1', 'legend-1',
        'cap-2', 'legend-2', 'cap-3', 'legend-3',
      ]);
      for (const part of result.parts) {
        expect(part.mesh.stats.volumeMm3, `${part.name} volume`).toBeGreaterThan(0);
      }

      // Each cap and its legend print as one object, so they must stay grouped.
      for (let i = 0; i < 4; i++) {
        const cap = result.parts.find((p) => p.id === `cap-${i}`)!;
        const legend = result.parts.find((p) => p.id === `legend-${i}`)!;
        expect(cap.group).toBe(`key-${i}`);
        expect(legend.group).toBe(cap.group);
        // Both flip together, or the inlay lands on the wrong face.
        expect(legend.orientation).toEqual(cap.orientation);
      }
    } finally {
      cleanup();
    }
  });

  it('stands a raised legend proud of the cap, and prints that cap legend-up', async () => {
    const m = await kernel();
    try {
      const p = paramsWith({ text: 'AB', legendStyle: 'raised' });
      const d = derive(p);
      const result = keyClickerGenerator.build(p, ctxFor(m));

      const cap = result.parts.find((x) => x.id === 'cap-0')!;
      const legend = result.parts.find((x) => x.id === 'legend-0')!;

      // Raised letters cannot be pressed into the bed, so this is the one
      // legend style that prints the right way up -- which is also the only
      // way the preview shows the lettering rather than the underside.
      expect(cap.orientation).toEqual([0, 0, 0]);
      expect(legend.orientation).toEqual(cap.orientation);

      // The letter stands legendDepth above the dished face it sits on: never
      // higher than that above the rim, never lower than that above the floor...
      expect(cap.mesh.bbox.max[2]).toBeCloseTo(d.capH, 3);
      expect(legend.mesh.bbox.max[2]).toBeLessThanOrEqual(d.capH + d.legendDepth + 1e-3);
      expect(legend.mesh.bbox.max[2]).toBeGreaterThan(d.capH - d.dish + d.legendDepth - 1e-3);
      // ...and follows the dish down into it rather than floating over it.
      expect(legend.mesh.bbox.min[2]).toBeLessThan(d.capH);
      expect(legend.mesh.bbox.min[2]).toBeGreaterThan(d.capH - d.capTop);
    } finally {
      cleanup();
    }
  });

  it('keeps the cut-in legends printing upside down', async () => {
    const m = await kernel();
    try {
      for (const style of ['inlay', 'engraved']) {
        const result = keyClickerGenerator.build(
          paramsWith({ text: 'A', legendStyle: style }),
          ctxFor(m),
        );
        const cap = result.parts.find((x) => x.id === 'cap-0')!;
        expect(cap.orientation, style).toEqual([180, 0, 0]);
      }
    } finally {
      cleanup();
    }
  });

  it('scoops the whole top face, with nothing standing back up through it', async () => {
    const m = await kernel();
    try {
      for (const [type, patch] of [
        ['mx', {}],
        ['choc', { keyPitch: 18, keySize: 16.4, capHeight: 5.5 }],
        ['printed', { keyPitch: 16, keySize: 14.4, capHeight: 6, legendSize: 5 }],
      ] as [string, Params][]) {
        const p = paramsWith({ text: 'A', switchType: type, topCurve: -0.8, ...patch });
        const d = derive(p);
        const result = keyClickerGenerator.build(p, ctxFor(m));
        const cap = result.parts.find((x) => x.id === 'cap-0')!;
        const solid = m.Manifold.ofMesh({
          numProp: cap.mesh.numProp,
          vertProperties: cap.mesh.position,
          triVerts: cap.mesh.index,
        });

        // Height of the top surface at (x, y): the tallest solid in a thin column.
        const surfaceAt = (x: number, y: number) => {
          const hit = m.Manifold.cube([0.2, 0.2, d.capH * 3], true)
            .translate([x, y, 0])
            .intersect(solid);
          return hit.volume() > 0 ? hit.boundingBox().max[2] : NaN;
        };

        // The scoop is a full `dish` deep at the centre. Every stem is a boss
        // rising to the full cap height, so union it on after the dish is cut
        // and it plugs the middle of the scoop back up to capH -- a flat disc
        // across the face with the legend perched on it.
        expect(surfaceAt(0, 0), `${type} centre`).toBeCloseTo(d.capH - d.dish, 2);

        // And the scoop runs right off the edge. A sphere sized to capTopSize / 2
        // meets the top plane at the circle INSCRIBED in a square face, leaving
        // the corners flat at capH and a hard circular rim between the two.
        const half = d.capTopSize / 2;
        expect(surfaceAt(half - 0.2, 0), `${type} edge`).toBeLessThan(d.capH - 0.05);

        // No step anywhere between: the surface only ever rises outward.
        let last = -Infinity;
        for (const f of [0, 0.2, 0.4, 0.6, 0.8]) {
          const z = surfaceAt(f * half, 0);
          expect(z, `${type} surface at ${f} of half-width`).toBeGreaterThanOrEqual(last - 1e-3);
          last = z;
        }
        // The corners are what the scoop is sized to graze, so the cap is still
        // exactly as tall as it claims.
        expect(cap.mesh.bbox.max[2], `${type} height`).toBeCloseTo(d.capH, 2);
      }
    } finally {
      cleanup();
    }
  });

  it('never lets the stem socket break through the dished top', async () => {
    const m = await kernel();
    try {
      // The socket is cut from below and the dish is scooped from above, and
      // only `capTop` separates them. Overshoot either one and the cap gets a
      // stem-shaped hole in its face -- which a raised legend then grows down
      // into, so it shows up as loose fragments rather than a hole.
      for (const [type, patch] of [
        ['mx', {}],
        ['choc', { keyPitch: 18, keySize: 16.4, capHeight: 5.5 }],
        ['printed', { keyPitch: 16, keySize: 14.4, capHeight: 6, legendSize: 5 }],
      ] as [string, Params][]) {
        const p = paramsWith({ text: 'A', switchType: type, topCurve: -0.8, ...patch });
        const d = derive(p);
        const result = keyClickerGenerator.build(p, ctxFor(m));
        const cap = result.parts.find((x) => x.id === 'cap-0')!;
        const solid = m.Manifold.ofMesh({
          numProp: cap.mesh.numProp,
          vertProperties: cap.mesh.position,
          triVerts: cap.mesh.index,
        });

        // A thin slab taken just under the dish floor, wide enough to cover
        // the whole stem but inside the top face's rounded corners. If the
        // socket has opened through, the face is not solid there.
        const probeW = d.capTopSize - 2 * d.capCorner;
        const probe = m.Manifold.cube([probeW, probeW, 0.05], true).translate([
          0, 0, d.capH - d.dish - 0.05,
        ]);
        expect(probe.subtract(solid).volume(), `${type} top face`).toBeCloseTo(0, 3);
      }
    } finally {
      cleanup();
    }
  });

  it('drops the inlay parts when the legend is engraved or blank', async () => {
    const m = await kernel();
    try {
      for (const style of ['engraved', 'none']) {
        const result = keyClickerGenerator.build(
          paramsWith({ text: 'AB', legendStyle: style }),
          ctxFor(m),
        );
        expect(result.parts.map((p) => p.id), style).toEqual(['base', 'cap-0', 'cap-1']);
      }
    } finally {
      cleanup();
    }
  });

  it('cuts one opening per key, on pitch, through the plate', async () => {
    const m = await kernel();
    try {
      const p = paramsWith({ text: 'KONG' });
      const d = derive(p);
      const result = keyClickerGenerator.build(p, ctxFor(m));
      const base = result.parts.find((x) => x.id === 'base')!;

      // The bar is as long as the key row plus its end walls.
      expect(base.mesh.bbox.max[0] - base.mesh.bbox.min[0]).toBeGreaterThanOrEqual(d.baseW - 0.01);

      // Keys are centred on the bar and evenly spaced.
      expect(keyX(d, 0)).toBeCloseTo(-keyX(d, d.keys - 1), 6);
      expect(keyX(d, 1) - keyX(d, 0)).toBeCloseTo(d.pitch, 6);
    } finally {
      cleanup();
    }
  });

  it('gives every switch type a cap whose stem matches it', async () => {
    const m = await kernel();
    try {
      for (const [type, patch] of [
        ['mx', {}],
        ['choc', { keyPitch: 18, keySize: 16.4, capHeight: 5.5 }],
        ['printed', { keyPitch: 16, keySize: 14.4, capHeight: 6, legendSize: 5 }],
      ] as [string, Params][]) {
        const p = paramsWith({ text: 'AB', switchType: type, ...patch });
        const result = keyClickerGenerator.build(p, ctxFor(m));
        expect(result.issues.filter((i) => i.level === 'error'), type).toEqual([]);

        const cap = result.parts.find((x) => x.id === 'cap-0')!;
        const d = derive(p);
        // The cap is the footprint asked for, tapers inward, and is capH tall.
        expect(cap.mesh.bbox.max[0] - cap.mesh.bbox.min[0], type).toBeCloseTo(d.keySize, 1);
        expect(cap.mesh.bbox.max[2] - cap.mesh.bbox.min[2], type).toBeCloseTo(d.capH, 1);
        expect(d.capTopSize, type).toBeLessThan(d.keySize);

        // Only the printed variant carries domes, and one per key.
        const dome = result.parts.find((x) => x.id === 'dome');
        if (type === 'printed') {
          expect(dome, type).toBeDefined();
          expect(dome!.quantity).toBe(2);
        } else {
          expect(dome, type).toBeUndefined();
        }
      }
    } finally {
      cleanup();
    }
  });

  it('thins the plate under the MX clips so a switch snaps in', async () => {
    const m = await kernel();
    try {
      const p = paramsWith({ text: 'A', keyring: false });
      const d = derive(p);
      const body = keyClickerGenerator.build(p, ctxFor(m)).parts.find((x) => x.id === 'base')!;
      const solid = m.Manifold.ofMesh({
        numProp: body.mesh.numProp,
        vertProperties: body.mesh.position,
        triVerts: body.mesh.index,
      });
      const bottom = d.plateTop - d.plateT;
      // Plate material in a 0.4 mm column just outside the cutout edge.
      const plateAt = (x: number, y: number) =>
        solid.intersect(
          m.Manifold.cube([0.4, 0.4, d.plateT], false).translate([x - 0.2, y - 0.2, bottom]),
        ).volume() / 0.16;
      const edge = (d.sw.cutout + d.clear) / 2 + 0.4;
      // Mid-edge on all four sides: thinned to 1.3 mm for the clip to catch.
      for (const [x, y] of [[0, edge], [0, -edge], [edge, 0], [-edge, 0]]) {
        expect(plateAt(x!, y!), `clip at ${x},${y}`).toBeCloseTo(1.3, 2);
      }
      // Next to the corners the plate keeps its full 1.5 mm.
      expect(plateAt(edge - 0.6, edge)).toBeCloseTo(d.plateT, 2);
    } finally {
      cleanup();
    }
  });

  it('closes the bottom of the body, with no cover to print', async () => {
    const m = await kernel();
    try {
      for (const [type, patch] of [
        ['mx', {}],
        ['mx', { baseStyle: 'cells', text: 'AB' }],
        ['choc', { keyPitch: 18, keySize: 16.4, capHeight: 5.5 }],
      ] as [string, Params][]) {
        const p = paramsWith({ text: 'A', switchType: type, keyring: false, ...patch });
        const d = derive(p);
        const r = keyClickerGenerator.build(p, ctxFor(m));
        expect(r.parts.map((x) => x.id), type).not.toContain('cover');

        // Switches go in from the top, so the floor is solid under every key:
        // a slab through the floor keeps its full footprint.
        const body = r.parts.find((x) => x.id === 'base')!;
        const solid = m.Manifold.ofMesh({
          numProp: body.mesh.numProp,
          vertProperties: body.mesh.position,
          triVerts: body.mesh.index,
        });
        expect(body.mesh.bbox.min[2]).toBeCloseTo(0, 3);
        for (let i = 0; i < d.keys; i++) {
          const under = solid.intersect(
            m.Manifold.cube([4, 4, d.floorT * 0.8], true).translate([keyX(d, i), 0, d.floorT / 2]),
          );
          expect(under.volume(), `${type} floor under key ${i}`).toBeCloseTo(16 * d.floorT * 0.8, 3);
        }
        // ...and there is still room above it for the switch housing.
        const cavity = solid.intersect(
          m.Manifold.cube([4, 4, 1], true).translate([keyX(d, 0), 0, d.floorT + d.cavityD / 2]),
        );
        expect(cavity.volume(), `${type} cavity`).toBeLessThan(1e-6);
      }

      // The printed variant needs solid floor under each well for the guide
      // post to be anchored in. A cavity would leave the post floating - which
      // serialises as a loose pin, not a post.
      const printed = keyClickerGenerator.build(
        paramsWith({ text: 'A', switchType: 'printed', keyPitch: 16, keySize: 14.4, capHeight: 6 }),
        ctxFor(m),
      );

      const body = printed.parts.find((x) => x.id === 'base')!;
      const solid = m.Manifold.ofMesh({
        numProp: body.mesh.numProp,
        vertProperties: body.mesh.position,
        triVerts: body.mesh.index,
      });
      expect(solid.decompose().length, 'body plus its post is one piece').toBe(1);
      // There is floor left under the dome seat, not a hole into a cavity.
      expect(body.mesh.bbox.min[2]).toBeCloseTo(0, 3);
    } finally {
      cleanup();
    }
  });

  it('keeps the standard switch dimensions fixed', () => {
    // These are the switch's numbers, not ours. If they ever drift, a bought
    // switch stops clipping in and there is no way to tell from the preview.
    expect(SWITCHES.mx!.cutout).toBe(14);
    expect(SWITCHES.mx!.plate).toBe(1.5);
    expect(SWITCHES.choc!.cutout).toBe(13.8);
  });

  it('packs onto a default bed', async () => {
    const m = await kernel();
    try {
      const result = keyClickerGenerator.build(paramsWith({ text: 'FIDGET' }), ctxFor(m));
      const plate = packPlate(result.parts, [256, 256]);
      expect(plate.fits).toBe(true);
    } finally {
      cleanup();
    }
  });

  // --- validation ----------------------------------------------------------

  it('refuses keycaps that would touch each other', () => {
    expect(errorsOf({ keySize: 19, keyPitch: 19.05 }).join(' ')).toMatch(/touch/i);
  });

  it('refuses a pitch too tight for the chosen switch', () => {
    expect(errorsOf({ switchType: 'mx', keyPitch: 15 }).join(' ')).toMatch(/at least/i);
    // The same pitch is fine once the switch is smaller.
    expect(errorsOf({ switchType: 'printed', keyPitch: 15, keySize: 13.5 })).toEqual([]);
  });

  it('refuses a taper that leaves no top face for a letter', () => {
    expect(errorsOf({ keySize: 12, capTaper: 20, capHeight: 14 }).join(' ')).toMatch(/top face/i);
  });

  it('leaves a real MX cross socket in the stem', async () => {
    const m = await kernel();
    try {
      const p = paramsWith({ text: 'A', switchType: 'mx' });
      const d = derive(p);
      const result = keyClickerGenerator.build(p, ctxFor(m));
      const cap = result.parts.find((x) => x.id === 'cap-0')!;

      // Rebuild the cap as a solid so the socket can be probed: a switch stem
      // is 4.0 x 1.17 mm and 4 mm deep, and if that volume is not hollow the
      // cap simply will not go on the switch.
      const capSolid = m.Manifold.ofMesh({
        numProp: cap.mesh.numProp,
        vertProperties: cap.mesh.position,
        triVerts: cap.mesh.index,
      });
      const roof = d.capH - d.capTop;
      const arm = m.Manifold.extrude(
        m.CrossSection.union([
          m.CrossSection.square([4.0, 1.17], true),
          m.CrossSection.square([1.17, 4.0], true),
        ]),
        3.5,
      ).translate([0, 0, roof - 3.5]);

      // The stem volume has to be empty in the cap, to within rounding.
      expect(arm.subtract(capSolid).volume()).toBeCloseTo(arm.volume(), 1);
    } finally {
      cleanup();
    }
  });

  it('refuses no characters at all', () => {
    expect(errorsOf({ text: '   ' }).join(' ')).toMatch(/at least one character/i);
  });

  it('warns rather than fails when a printed dome is badly proportioned', () => {
    const issues = keyClickerGenerator.validate?.(
      paramsWith({
        switchType: 'printed', keyPitch: 16, keySize: 14.4,
        domeHeight: 0.6, layer: 0.3,
      }),
    ) ?? [];
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(issues.some((i) => i.level === 'warn' && /squash/i.test(i.message))).toBe(true);
  });

  it('leaves no part in more than one piece', async () => {
    const m = await kernel();
    try {
      // Stems, posts, keyring lugs, chamfers are all unioned
      // on. Each one is a chance to land exactly on a face, which reads as
      // watertight and prints as loose debris.
      for (const [type, patch] of [
        ['mx', { loopPosition: 'end' }],
        ['mx', { baseStyle: 'cells', loopPosition: 'side' }],
        ['mx', { baseStyle: 'cells', text: 'ABCD', cellCorner: 8 }],
        ['choc', { keyPitch: 18, keySize: 16.4, capHeight: 5.5, loopPosition: 'side' }],
        ['printed', { keyPitch: 16, keySize: 14.4, capHeight: 6, legendSize: 5 }],
      ] as [string, Params][]) {
        const result = keyClickerGenerator.build(
          paramsWith({ text: 'AB', switchType: type, ...patch }),
          ctxFor(m),
        );
        for (const part of result.parts) {
          const pieces = m.Manifold.ofMesh({
            numProp: part.mesh.numProp,
            vertProperties: part.mesh.position,
            triVerts: part.mesh.index,
          }).decompose();
          // Every part here is a single letter or a single body, so one piece
          // each -- unlike the name tag's lettering, which is a whole word.
          expect(pieces.length, `${type} / ${part.name}`).toBe(1);
        }
      }
    } finally {
      cleanup();
    }
  });

  it('builds every preset without errors', async () => {
    const m = await kernel();
    try {
      for (const preset of keyClickerGenerator.presets ?? []) {
        const result = keyClickerGenerator.build(paramsWith(preset.values), ctxFor(m));
        expect(
          result.issues.filter((i) => i.level === 'error'),
          `preset "${preset.label}"`,
        ).toEqual([]);
        expect(result.parts.length, `preset "${preset.label}"`).toBeGreaterThan(0);
      }
    } finally {
      cleanup();
    }
  });
});

describe('key clicker bases', () => {
  it('sinks the keys into the rim, and keeps a held-down key above it', () => {
    for (const baseStyle of ['tray', 'cells']) {
      const d = derive(paramsWith({ text: 'AB', baseStyle }));
      expect(d.rimH, baseStyle).toBeGreaterThan(0);
      // The rim hides `keyDepth` of the cap at rest...
      expect(d.plateTop + d.rimH - (d.plateTop + d.capRest)).toBeCloseTo(2, 6);
      // ...and still leaves some of it above the rim with the key held down.
      expect(d.pressedProud, baseStyle).toBeGreaterThanOrEqual(1);
    }
    expect(errorsOf({ keyDepth: 6 }).join(' ')).toMatch(/below the rim/);
  });

  it('spaces cells by pocket plus one shared wall, whatever the pitch slider says', () => {
    const d = derive(paramsWith({ text: 'ABC', baseStyle: 'cells', keyPitch: 24 }));
    expect(d.pitch).toBeCloseTo(d.keySize + 2 * d.keyGap + d.wallT, 6);
    expect(d.baseW).toBeCloseTo(2 * d.pitch + d.cell, 6);
  });

  it('builds a cells body with a pocket per key', async () => {
    const m = await kernel();
    try {
      const p = paramsWith({ text: 'ABC', baseStyle: 'cells', keyring: false });
      const d = derive(p);
      const result = keyClickerGenerator.build(p, ctxFor(m));
      expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);

      const body = result.parts.find((x) => x.id === 'base')!;
      expect(body.mesh.bbox.max[0] - body.mesh.bbox.min[0]).toBeCloseTo(d.baseW, 1);
      expect(body.mesh.bbox.max[2]).toBeCloseTo(d.baseH, 3);

      const solid = m.Manifold.ofMesh({
        numProp: body.mesh.numProp,
        vertProperties: body.mesh.position,
        triVerts: body.mesh.index,
      });
      // Just above the plate: open over each key, solid over the shared wall.
      const z = d.plateTop + d.rimH / 2;
      const probe = (x: number) =>
        solid.intersect(m.Manifold.cube([0.4, 0.4, 0.4], true).translate([x, 0, z])).volume();
      for (let i = 0; i < 3; i++) expect(probe(keyX(d, i)), `pocket ${i}`).toBeLessThan(1e-6);
      expect(probe((keyX(d, 0) + keyX(d, 1)) / 2), 'wall').toBeGreaterThan(0.06);
    } finally {
      cleanup();
    }
  });
});

describe('key clicker top surface', () => {
  const solidOf = (m: ManifoldToplevel, mesh: { numProp: number; position: Float32Array; index: Uint32Array }) =>
    m.Manifold.ofMesh({ numProp: mesh.numProp, vertProperties: mesh.position, triVerts: mesh.index });

  it('domes the top up by the depth asked for, falling away to the edges', async () => {
    const m = await kernel();
    try {
      const p = paramsWith({ text: 'A', topCurve: 1.2, legendStyle: 'none' });
      const d = derive(p);
      expect(d.capDome).toBe(1.2);
      expect(d.dish).toBe(0);
      const cap = keyClickerGenerator.build(p, ctxFor(m)).parts.find((x) => x.id === 'cap-0')!;
      const solid = solidOf(m, cap.mesh);
      const surfaceAt = (x: number) =>
        m.Manifold.cube([0.2, 0.2, d.capH * 3], true).translate([x, 0, 0]).intersect(solid)
          .boundingBox().max[2];

      expect(surfaceAt(0)).toBeCloseTo(d.capH + 1.2, 1);
      let last = Infinity;
      for (const f of [0, 0.3, 0.6, 0.9]) {
        const z = surfaceAt((f * d.capTopSize) / 2);
        expect(z).toBeLessThanOrEqual(last + 1e-3);
        last = z;
      }
      expect(last).toBeLessThan(d.capH + 0.6);
      expect(m.Manifold.ofMesh({
        numProp: cap.mesh.numProp, vertProperties: cap.mesh.position, triVerts: cap.mesh.index,
      }).decompose().length).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('lays raised letters and inlays along the dome, not flat across it', async () => {
    const m = await kernel();
    try {
      for (const legendStyle of ['raised', 'inlay']) {
        const p = paramsWith({ text: 'H', topCurve: 1.5, legendStyle, legendSize: 9 });
        const d = derive(p);
        const result = keyClickerGenerator.build(p, ctxFor(m));
        expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
        const insert = solidOf(m, result.parts.find((x) => x.id === 'legend-0')!.mesh);
        // Thickness of the letter in a thin column at x: the same everywhere
        // when it follows the dome, thin at the edges when it does not.
        const thickness = (x: number) => {
          const bb = m.Manifold.cube([0.15, 30, 30], true).translate([x, 0, d.capH]).intersect(insert)
            .boundingBox();
          return bb.max[2] - bb.min[2];
        };
        // The uprights of an H stand at the sides of the letter.
        const xs = [-3, 3];
        const ts = xs.map(thickness);
        for (const t of ts) expect(t, legendStyle).toBeGreaterThan(d.legendDepth - 0.15);
      }
    } finally {
      cleanup();
    }
  });

  it('loosens the stem socket on its own, leaving the plate cutout tight', async () => {
    const m = await kernel();
    try {
      const vol = (patch: Params, id: string) =>
        keyClickerGenerator.build(paramsWith({ text: 'AB', ...patch }), ctxFor(m))
          .parts.find((x) => x.id === id)!.mesh.stats.volumeMm3;
      // A bigger socket means less cap; the base does not move at all.
      expect(vol({ stemClearance: 0.3 }, 'cap-0')).toBeLessThan(vol({ stemClearance: 0.1 }, 'cap-0'));
      expect(vol({ stemClearance: 0.3 }, 'base')).toBeCloseTo(vol({ stemClearance: 0.1 }, 'base'), 3);
      expect(derive(paramsWith({ stemClearance: 0.25 })).clear).toBeCloseTo(0.1, 6);
    } finally {
      cleanup();
    }
  });

  it('props the plate on a wall between each pair of switches', async () => {
    const m = await kernel();
    try {
      const base = (on: boolean) =>
        keyClickerGenerator.build(paramsWith({ text: 'KONG', supportWalls: on }), ctxFor(m))
          .parts.find((x) => x.id === 'base')!.mesh;
      const withWalls = base(true);
      const without = base(false);
      expect(withWalls.stats.volumeMm3).toBeGreaterThan(without.stats.volumeMm3);
    } finally {
      cleanup();
    }
  });
});
