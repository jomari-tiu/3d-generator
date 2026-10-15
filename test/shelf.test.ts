import type { ManifoldToplevel } from 'manifold-3d';
import { describe, expect, it } from 'vitest';
import { packPlates } from '../src/core/build/layout';
import { coerceAll, defaultsOf } from '../src/core/params/validate';
import type { BuildCtx, Params } from '../src/core/params/types';
import { shelfGenerator } from '../src/generators/shelf/build';
import { cluster, derive, type ShapeId } from '../src/generators/shelf/geometry';
import { cleanup, kernel, loadFont } from './kernel';

function ctxFor(m: ManifoldToplevel): BuildCtx {
  return { m, font: (id) => loadFont(id), image: () => undefined, tolerance: 0.05, issue: () => {} };
}

function paramsWith(patch: Params = {}): Params {
  return coerceAll(shelfGenerator, { ...defaultsOf(shelfGenerator), ...patch });
}

function errorsOf(patch: Params = {}): string[] {
  return (shelfGenerator.validate?.(paramsWith(patch)) ?? [])
    .filter((i) => i.level === 'error')
    .map((i) => i.message);
}

const SHAPES: ShapeId[] = ['hexagon', 'square', 'diamond', 'triangle', 'octagon'];

describe('modular shelf', () => {
  it('finds the faces neighbouring modules share', () => {
    const shared = (shape: ShapeId, cols: number, rows: number) => {
      let n = 0;
      for (const c of cluster(shape, 100, cols, rows)) for (const e of c.edges) if (e.shared) n++;
      return n / 2;
    };
    expect(shared('hexagon', 3, 2)).toBe(9);
    expect(shared('square', 3, 2)).toBe(7);
    expect(shared('triangle', 5, 1)).toBe(4);
    expect(shared('octagon', 2, 2)).toBe(4);
    expect(shared('diamond', 2, 2)).toBe(3);
    expect(shared('hexagon', 1, 1)).toBe(0);
  });

  it('sits the cluster on the floor, centred', () => {
    for (const shape of SHAPES) {
      const cells = cluster(shape, 100, 3, 2);
      const ys = cells.flatMap((c) => c.verts.map(([, y]) => c.cy + y));
      const xs = cells.flatMap((c) => c.verts.map(([x]) => c.cx + x));
      expect(Math.min(...ys), shape).toBeCloseTo(0, 6);
      expect(Math.min(...xs) + Math.max(...xs), shape).toBeCloseTo(0, 6);
    }
  });

  it('accepts its own defaults and presets', () => {
    expect(errorsOf()).toEqual([]);
    for (const preset of shelfGenerator.presets ?? []) {
      expect(errorsOf(preset.values), preset.label).toEqual([]);
    }
  });

  for (const shape of SHAPES) {
    for (const moduleType of ['wall', 'shelf', 'frame']) {
      it(`builds ${moduleType} ${shape} modules as single solid pieces`, async () => {
        const m = await kernel();
        try {
          const patch: Params = { shape, moduleType, columns: 2, rows: 2, depth: moduleType === 'frame' ? 16 : 80, rebate: 8 };
          const result = shelfGenerator.build(paramsWith(patch), ctxFor(m));
          expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
          const modules = result.parts.filter((p) => p.id.startsWith('module-'));
          expect(modules).toHaveLength(4);
          for (const part of result.parts) {
            expect(part.mesh.stats.volumeMm3, part.name).toBeGreaterThan(0);
            // genus counts the holes: a closed body with none would mean the
            // cavity or the join holes silently failed to cut.
            if (part.id.startsWith('module-')) expect(part.mesh.stats.genus, part.name).toBeGreaterThan(0);
          }
          if (moduleType === 'frame') expect(result.parts.some((p) => p.id.startsWith('backer-'))).toBe(true);
          const d = derive(paramsWith(patch));
          const pin = result.parts.find((p) => p.id === 'pin');
          if (d.sharedFaces > 0) expect(pin?.quantity).toBe(d.sharedFaces * d.joinAt.length);
        } finally {
          cleanup();
        }
      });
    }
  }

  it('stands the shelf up in the preview and lays it on its back to print', async () => {
    const m = await kernel();
    try {
      const p = paramsWith({ shape: 'hexagon', columns: 1, rows: 1, depth: 90, cellHeight: 120 });
      const result = shelfGenerator.build(p, ctxFor(m));
      const body = result.parts.find((x) => x.id === 'module-0')!;
      // Standing: the depth runs toward the viewer (-y), the height is z.
      expect(body.mesh.bbox.max[1] - body.mesh.bbox.min[1]).toBeCloseTo(90, 1);
      expect(body.mesh.bbox.max[2] - body.mesh.bbox.min[2]).toBeCloseTo(120, 1);

      const set = packPlates(result.parts, [256, 256]);
      expect(set.fits).toBe(true);
      const laid = set.plates[0]!.parts.find((x) => x.id === 'module-0')!;
      expect(laid.size[2]).toBeCloseTo(90, 1);
    } finally {
      cleanup();
    }
  });

  it('fuses a one-piece cluster into one body with no join holes or pins', async () => {
    const m = await kernel();
    try {
      const result = shelfGenerator.build(paramsWith({ joinMode: 'single', columns: 3, rows: 2, cornerRadius: 0 }), ctxFor(m));
      expect(result.parts.map((p) => p.id)).toEqual(['cluster']);
      const d = derive(paramsWith({ joinMode: 'single', columns: 3, rows: 2, cornerRadius: 0 }));
      const bb = result.parts[0]!.mesh.bbox;
      expect(bb.max[0] - bb.min[0]).toBeCloseTo(d.width, 1);
      expect(bb.max[2] - bb.min[2]).toBeCloseTo(d.height, 1);
    } finally {
      cleanup();
    }
  });

  it('refuses dimensions that cannot work', () => {
    expect(errorsOf({ wall: 0.6 }).length).toBeGreaterThan(0);
    expect(errorsOf({ cellHeight: 30, wall: 8 }).length).toBeGreaterThan(0);
    expect(errorsOf({ moduleType: 'frame', depth: 10, rebate: 10 }).length).toBeGreaterThan(0);
    expect(errorsOf({ connector: 'pins', wall: 1.5 }).length).toBeGreaterThan(0);
    expect(errorsOf({ frontRim: 20, depth: 15 }).length).toBeGreaterThan(0);
  });
});
