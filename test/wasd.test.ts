import { describe, expect, it } from 'vitest';
import type { ManifoldToplevel } from 'manifold-3d';
import { cleanup, kernel, loadFont } from './kernel';
import { wasdClickerGenerator } from '../src/generators/keyclicker/wasd';
import { derive, keyPos } from '../src/generators/keyclicker/geometry';
import { coerceAll, defaultsOf } from '../src/core/params/validate';
import type { BuildCtx, Params } from '../src/core/params/types';

function ctxFor(m: ManifoldToplevel): BuildCtx {
  return { m, font: (id) => loadFont(id), image: () => undefined, tolerance: 0.02, issue: () => {} };
}

/** As the generator sees them: its own defaults, with the WASD layout it builds with. */
function paramsWith(patch: Params = {}): Params {
  return coerceAll(wasdClickerGenerator, { ...defaultsOf(wasdClickerGenerator), ...patch });
}
const derived = (patch: Params = {}) => derive({ ...paramsWith(patch), layout: 'wasd' });

const solidOf = (m: ManifoldToplevel, mesh: { numProp: number; position: Float32Array; index: Uint32Array }) =>
  m.Manifold.ofMesh({ numProp: mesh.numProp, vertProperties: mesh.position, triVerts: mesh.index });

describe('WASD clicker', () => {
  it('puts W a row above S and a quarter key to its left, as on a keyboard', () => {
    for (const baseStyle of ['tray', 'cells']) {
      const d = derived({ baseStyle });
      expect(d.legend).toEqual(['W', 'A', 'S', 'D']);
      const [w, a, s, dd] = [0, 1, 2, 3].map((i) => keyPos(d, i));
      // A S D along one row, on the pitch.
      expect(a![1]).toBeCloseTo(s![1], 6);
      expect(dd![1]).toBeCloseTo(s![1], 6);
      expect(s![0] - a![0]).toBeCloseTo(d.pitch, 6);
      expect(dd![0] - s![0]).toBeCloseTo(d.pitch, 6);
      // W one pitch up, a quarter pitch left.
      expect(w![1] - s![1]).toBeCloseTo(d.pitch, 6);
      expect(s![0] - w![0]).toBeCloseTo(d.pitch / 4, 6);
      // The cluster is centred, so the body and the plate layout are too.
      const xs = [w, a, s, dd].map((c) => c![0]);
      const ys = [w, a, s, dd].map((c) => c![1]);
      expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 6);
      expect(Math.min(...ys) + Math.max(...ys)).toBeCloseTo(0, 6);
    }
  });

  it('needs all four keys', () => {
    const errors = (text: string) =>
      (wasdClickerGenerator.validate?.(paramsWith({ text })) ?? []).filter((i) => i.level === 'error');
    expect(errors('WAS').map((i) => i.message).join(' ')).toMatch(/four keys/);
    expect(errors('WASD')).toEqual([]);
    // Extra letters past the fourth are not keys.
    expect(derived({ text: 'WASDQ' }).legend).toEqual(['W', 'A', 'S', 'D']);
  });

  it('builds a one-piece body with a switch opening under every key, in both styles', async () => {
    const m = await kernel();
    try {
      for (const baseStyle of ['tray', 'cells']) {
        for (const loopPosition of ['end', 'side']) {
          const p = paramsWith({ baseStyle, loopPosition });
          const d = derived({ baseStyle, loopPosition });
          const result = wasdClickerGenerator.build(p, ctxFor(m));
          const tag = `${baseStyle} / ${loopPosition}`;
          expect(result.issues.filter((i) => i.level === 'error'), tag).toEqual([]);
          const base = solidOf(m, result.parts.find((x) => x.id === 'base')!.mesh);
          // One piece: the bar and W's block are joined, and so is the loop.
          expect(base.decompose().length, tag).toBe(1);

          // A clear switch hole through the plate at each key, and plate
          // between W and S, where the two rows meet.
          for (let i = 0; i < 4; i++) {
            const [x, y] = keyPos(d, i);
            const plate = m.Manifold.cube([3, 3, d.plateT * 0.6], true).translate([x, y, d.plateTop - d.plateT / 2]);
            expect(plate.intersect(base).volume(), `${tag} hole ${i}`).toBeLessThan(0.01);
          }
          const [wx, wy] = keyPos(d, 0);
          const [, sy] = keyPos(d, 2);
          const between = m.Manifold.cube([3, 0.6, d.plateT * 0.6], true).translate([wx + 2, (wy + sy) / 2, d.plateTop - d.plateT / 2]);
          expect(between.intersect(base).volume(), `${tag} plate between rows`).toBeGreaterThan(0);
        }
      }
    } finally {
      cleanup();
    }
  });

  it('leaves the rim one unbroken ring, with nothing standing loose in the pocket', async () => {
    const m = await kernel();
    try {
      // Rounded per-key pockets meeting under W once left a cusp of rim
      // standing in the tray's pocket: a second piece in a slice near the top.
      for (const baseStyle of ['tray', 'cells']) {
        const d = derived({ baseStyle, keyring: false });
        const out = wasdClickerGenerator.build(paramsWith({ baseStyle, keyring: false }), ctxFor(m));
        const base = solidOf(m, out.parts.find((x) => x.id === 'base')!.mesh);
        const rim = base.slice(d.baseH - 0.3);
        // Tray: one ring round one pocket. Cells: still one connected piece.
        expect(rim.decompose().length, baseStyle).toBe(1);
      }
    } finally {
      cleanup();
    }
  });

  it('props the plate between the rows as well as along them, clear of every cutout', async () => {
    const m = await kernel();
    try {
      const p = paramsWith({ baseStyle: 'tray', switchType: 'mx' });
      const d = derived({ baseStyle: 'tray', switchType: 'mx' });
      const base = solidOf(m, wasdClickerGenerator.build(p, ctxFor(m)).parts.find((x) => x.id === 'base')!.mesh);
      const midCavity = d.floorT + d.cavityD / 2;
      const probe = (x: number, y: number) =>
        m.Manifold.cube([0.6, 0.6, 1], true).translate([x, y, midCavity]).intersect(base).volume();
      const [wx, wy] = keyPos(d, 0);
      const [ax, ay] = keyPos(d, 1);
      const [sx, sy] = keyPos(d, 2);
      // Between A and S, and between W and S.
      expect(probe((ax + sx) / 2, ay)).toBeGreaterThan(0);
      expect(probe(wx, (wy + sy) / 2)).toBeGreaterThan(0);
      // Nothing in the cavity under any switch.
      for (let i = 0; i < 4; i++) expect(probe(...keyPos(d, i)), `under key ${i}`).toBe(0);
    } finally {
      cleanup();
    }
  });

  it('seats each keycap on its own key, and builds every preset', async () => {
    const m = await kernel();
    try {
      const result = wasdClickerGenerator.build(paramsWith(), ctxFor(m));
      const seats = result.parts.filter((x) => x.id.startsWith('cap-')).map((x) => x.assembly!);
      expect(seats).toHaveLength(4);
      expect(new Set(seats.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)).size).toBe(4);
      const d = derived();
      seats.forEach(([x, y], i) => {
        expect(x).toBeCloseTo(keyPos(d, i)[0], 6);
        expect(y).toBeCloseTo(keyPos(d, i)[1], 6);
      });

      for (const preset of wasdClickerGenerator.presets ?? []) {
        const out = wasdClickerGenerator.build(paramsWith(preset.values), ctxFor(m));
        expect(out.issues.filter((i) => i.level === 'error'), preset.label).toEqual([]);
        expect(solidOf(m, out.parts.find((x) => x.id === 'base')!.mesh).decompose().length, preset.label).toBe(1);
      }
    } finally {
      cleanup();
    }
  });
});
