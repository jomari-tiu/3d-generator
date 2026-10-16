import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { describe, expect, it } from 'vitest';
import { cleanup, kernel } from './kernel';
import { msCageGenerator as gen } from '../src/generators/mscage/build';
import { derive } from '../src/generators/mscage/geometry';
import { clawSpec, columns, knobYs } from '../src/generators/mscage/parts';
import { talonAxis } from '../src/generators/shared/claw';
import { stairLayout } from '../src/generators/shared/stairs';
import { coerceAll, defaultsOf } from '../src/core/params/validate';
import type { BuildCtx, Params } from '../src/core/params/types';
import type { RawMesh } from '../src/core/kernel/types';

function ctxFor(m: ManifoldToplevel): BuildCtx {
  return { m, font: () => { throw new Error('no fonts'); }, image: () => undefined, tolerance: 0.05, issue: () => {} };
}

function paramsWith(patch: Params = {}): Params {
  return coerceAll(gen, { ...defaultsOf(gen), ...patch });
}

function issuesOf(patch: Params = {}, level: 'error' | 'warn' = 'error'): string[] {
  return (gen.validate?.(paramsWith(patch)) ?? []).filter((i) => i.level === level).map((i) => i.message);
}

const solidOf = (m: ManifoldToplevel, mesh: RawMesh) =>
  m.Manifold.ofMesh({ numProp: mesh.numProp, vertProperties: mesh.position, triVerts: mesh.index });

const overlap = (a: Manifold, b: Manifold) => a.intersect(b).volume();

function built(m: ManifoldToplevel, patch: Params = {}) {
  const p = paramsWith(patch);
  const result = gen.build(p, ctxFor(m));
  const get = (id: string) => {
    const part = result.parts.find((x) => x.id === id);
    if (!part) throw new Error(`no part ${id}`);
    return solidOf(m, part.mesh);
  };
  return { p, d: derive(p), result, get };
}

const PRESETS = () => (gen.presets ?? []).map((x) => x.values);

describe('MS dock', () => {
  it('accepts its own defaults and presets', () => {
    expect(issuesOf()).toEqual([]);
    expect(issuesOf({}, 'warn')).toEqual([]);
    for (const preset of gen.presets ?? []) expect(issuesOf(preset.values), preset.label).toEqual([]);
  });

  it('builds every part as one solid, with no part inside another', async () => {
    const m = await kernel();
    try {
      for (const patch of PRESETS()) {
        const { result } = built(m, patch);
        expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
        const solids = result.parts.map((x) => solidOf(m, x.mesh));
        result.parts.forEach((part, i) => expect(solids[i]!.decompose().length, part.name).toBe(1));
        for (let i = 0; i < solids.length; i++) {
          for (let j = i + 1; j < solids.length; j++) {
            expect(overlap(solids[i]!, solids[j]!), `${result.parts[i]!.name} / ${result.parts[j]!.name}`).toBeLessThan(0.01);
          }
        }
      }
    } finally {
      cleanup();
    }
  });

  it('has the reference\'s pieces: four columns, a top frame, galleries both sides, two stair towers, a cabin and a claw', async () => {
    const m = await kernel();
    try {
      const ids = built(m).result.parts.map((x) => x.id);
      expect(ids.filter((id) => id.startsWith('column-')).length).toBe(4);
      expect(ids).toContain('top-frame');
      expect(ids.filter((id) => id.startsWith('gallery-left-')).length).toBe(3);
      expect(ids.filter((id) => id.startsWith('gallery-right-')).length).toBe(3);
      expect(ids).toContain('stair-left-frame');
      expect(ids).toContain('stair-right-frame');
      expect(ids).toContain('cabin');
      expect(ids).toContain('claw-hub');
      expect(ids.some((id) => id.includes('support') || id.startsWith('arm-'))).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('puts a gallery at every landing in the towers\' outer bays, level with it and right behind it', () => {
    for (const patch of [{}, PRESETS()[1]!]) {
      const d = derive(paramsWith(patch));
      for (const [i, s] of d.stairs!.entries()) {
        const L = stairLayout(s);
        const outer = L.landings.filter((l) => (i === 0 ? l.x0 === s.x0 : l.x1 === s.x1));
        expect(outer.map((l) => l.z)).toEqual([...d.levels]);
        for (const l of outer) {
          // The landing's bay is inside the gallery's width, and the gallery
          // starts right behind the tower, at the same height.
          const [g0, g1] = i === 0 ? [d.gxo, d.gxi] : [-d.gxi, -d.gxo];
          expect(l.x0).toBeGreaterThanOrEqual(g0 - 1e-6);
          expect(l.x1).toBeLessThanOrEqual(g1 + 1e-6);
          expect(d.gy0 - s.yBack).toBeLessThan(0.5);
        }
      }
    }
  });

  it('leaves a figure 2 m of headroom on every flight, landing and gallery, at both crew scales', async () => {
    const m = await kernel();
    try {
      for (const patch of [{}, PRESETS()[1]!]) {
        const { d, result } = built(m, patch);
        const k = d.crewK;
        const label = JSON.stringify(patch).slice(0, 40);
        const everything = m.Manifold.union(result.parts.map((x) => solidOf(m, x.mesh)));
        const column = (x: number, y: number, z0: number, z1: number) =>
          m.Manifold.cube([0.4 * k, 0.4 * k, z1 - z0], true).translate([x, y, (z0 + z1) / 2]);
        for (const s of d.stairs!) {
          const L = stairLayout(s);
          for (const f of L.flights) {
            for (const t of [0.15, 0.5, 0.85]) {
              const x = f.sa + t * (f.sb - f.sa);
              const line = f.za + t * (f.zb - f.za);
              expect(overlap(column(x, (f.y0 + f.y1) / 2, line + 0.5 * k, line + 2 * k), everything), `${label} flight ${f.index + 1}`).toBeLessThan(0.01);
            }
          }
          for (const l of L.landings) {
            expect(overlap(column((l.x0 + l.x1) / 2, (L.laneFront + L.laneBack) / 2, l.z + 1.2, l.z + 2 * k), everything), `${label} landing`).toBeLessThan(0.01);
          }
        }
        // Along each gallery, between its inner rail and the columns.
        for (const side of [-1, 1]) {
          const x = side * -(d.gxi + (d.gxi - d.gxo) * -0.5 + 0) ;
          const xm = side < 0 ? (d.gxo + 12 + d.gxi) / 2 : -(d.gxo + 12 + d.gxi) / 2;
          for (const z of d.levels.slice(0, -1)) {
            for (const y of [d.cyF, d.kitY, d.cyB]) {
              expect(overlap(column(xm, y, z + 1.2, z + 2 * k), everything), `${label} gallery ${side} ${z.toFixed(0)} ${x}`).toBeLessThan(0.01);
            }
          }
        }
        // Gallery railings 1.05 m at the scale.
        const g = result.parts.find((x) => x.id === 'gallery-left-1')!.mesh.bbox;
        expect((g.max[2] - d.levels[0]!) / k, label).toBeCloseTo(1.05, 1);
      }
    } finally {
      cleanup();
    }
  });

  it('pegs everything together: columns in the base, galleries into the columns, the frame on top', async () => {
    const m = await kernel();
    try {
      const { d, get } = built(m);
      const base = get('base');
      const cols = m.Manifold.union([1, 2, 3, 4].map((i) => get(`column-${i}`)));
      expect(overlap(cols.translate([0, 0, -1]), base)).toBeGreaterThan(1);
      expect(overlap(cols.translate([1, 0, 0]), base)).toBeGreaterThan(0.1);
      const gallery = get('gallery-left-2');
      expect(overlap(gallery.translate([0, 0.6, 0]), cols)).toBeGreaterThan(0.01);
      expect(overlap(gallery.translate([0, 0, 0.6]), cols)).toBeGreaterThan(0.01);
      const top = get('top-frame');
      expect(overlap(top.translate([0.6, 0, 0]), cols)).toBeGreaterThan(0.01);
      expect(overlap(get('back-frame').translate([0, 0, -1]), base)).toBeGreaterThan(1);
      expect(overlap(get('cabin').translate([0.6, 0, 0]), get('gallery-right-3'))).toBeGreaterThan(0.01);
      expect(columns(d).length).toBe(4);
    } finally {
      cleanup();
    }
  });

  it('hangs the claw from the hoist over the kit and opens its talons', async () => {
    const m = await kernel();
    try {
      const { d, p, get } = built(m);
      const spec = clawSpec(d, Number(p.clawDrop));
      expect(spec.y).toBeCloseTo(d.kitY, 6);
      const hub = get('claw-hub');
      const chain = get('claw-chain');
      expect(overlap(chain.translate([0, 0, -0.5]), get('top-frame'))).toBeGreaterThan(0.01);
      for (let i = 0; i < 3; i++) {
        const talon = get(`claw-talon-${i}`);
        const pin = get(`claw-pin-${i}`);
        const a = talonAxis(spec, i);
        const turn = (s: Manifold, deg: number) =>
          s.translate([-a.x, -a.y, -a.z]).rotate([0, 0, -a.azimuth]).rotate([0, deg, 0]).rotate([0, 0, a.azimuth]).translate([a.x, a.y, a.z]);
        for (const deg of [-25, -10, 10]) {
          const moved = turn(talon, deg);
          expect(overlap(moved, hub), `${i} ${deg}`).toBeLessThan(0.01);
          expect(overlap(moved, pin), `${i} ${deg}`).toBeLessThan(0.01);
        }
      }
    } finally {
      cleanup();
    }
  });

  it('keys one base into the next, side by side', async () => {
    const m = await kernel();
    try {
      const { d, get } = built(m);
      const a = get('base');
      const b = a.translate([d.W, 0, 0]);
      expect(overlap(a, b)).toBeLessThan(0.01);
      expect(overlap(a, b.translate([0, 1, 0]))).toBeGreaterThan(0.1);
      expect(overlap(a, b.translate([0.8, 0, 0]))).toBeGreaterThan(0.1);
      expect(knobYs(d).length).toBe(2);
    } finally {
      cleanup();
    }
  });
});
