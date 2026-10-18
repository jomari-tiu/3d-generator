import { describe, expect, it } from 'vitest';
import type { ManifoldToplevel } from 'manifold-3d';
import { cleanup, kernel } from './kernel';
import { drawerOrganizerGenerator as gen } from '../src/generators/drawer/build';
import {
  binCentre, binSize, derive, parseLayout, STACK_CLEAR,
} from '../src/generators/drawer/geometry';
import { coerceAll, defaultsOf } from '../src/core/params/validate';
import type { BuildCtx, Params } from '../src/core/params/types';
import type { RawMesh } from '../src/core/kernel/types';

function ctxFor(m: ManifoldToplevel): BuildCtx {
  return { m, font: () => { throw new Error('no fonts'); }, image: () => undefined, tolerance: 0.02, issue: () => {} };
}

function paramsWith(patch: Params = {}): Params {
  return coerceAll(gen, { ...defaultsOf(gen), ...patch });
}

const solidOf = (m: ManifoldToplevel, mesh: RawMesh) =>
  m.Manifold.ofMesh({ numProp: mesh.numProp, vertProperties: mesh.position, triVerts: mesh.index });

/** Material in a small cube at a point, as a fraction of the cube. */
const fill = (m: ManifoldToplevel, solid: ReturnType<typeof solidOf>, x: number, y: number, z: number) =>
  solid.intersect(m.Manifold.cube([0.4, 0.4, 0.4], true).translate([x, y, z])).volume() / 0.064;

const firstBin = (parts: readonly { id: string; mesh: RawMesh }[]) => parts.find((x) => x.id.startsWith('bin-'))!;

describe('drawer organizer layout', () => {
  it('reads one line per row, widths in columns, and fills the rest with singles', () => {
    const { bins, errors } = parseLayout('2,1', 3, 2);
    expect(errors).toEqual([]);
    expect(bins).toEqual([
      { col: 0, row: 0, w: 2, h: 1 },
      { col: 2, row: 0, w: 1, h: 1 },
      { col: 0, row: 1, w: 1, h: 1 },
      { col: 1, row: 1, w: 1, h: 1 },
      { col: 2, row: 1, w: 1, h: 1 },
    ]);
  });

  it('lets a bin span rows, and the next row steps around it', () => {
    const { bins, errors } = parseLayout('1,2x2\n1', 3, 2);
    expect(errors).toEqual([]);
    expect(bins).toEqual([
      { col: 0, row: 0, w: 1, h: 1 },
      { col: 1, row: 0, w: 2, h: 2 },
      { col: 0, row: 1, w: 1, h: 1 },
    ]);
    // Every cell is covered exactly once.
    const area = bins.reduce((n, b) => n + b.w * b.h, 0);
    expect(area).toBe(6);
  });

  it('says what is wrong with a layout that does not fit', () => {
    expect(parseLayout('2,2', 3, 1).errors[0]).toMatch(/runs past column 3/);
    expect(parseLayout('1x3', 3, 2).errors[0]).toMatch(/runs past row 2/);
    expect(parseLayout('1,1,1,1', 3, 1).errors[0]).toMatch(/already full/);
    expect(parseLayout('big', 3, 1).errors[0]).toMatch(/not a bin size/);
    expect(gen.validate!(paramsWith({ layout: '4' })).some((i) => i.level === 'error')).toBe(true);
  });
});

describe('drawer organizer bins', () => {
  it('fills the drawer with one-piece bins, merged ones covering the gaps they span', async () => {
    const m = await kernel();
    try {
      const p = paramsWith({ connectors: false });
      const d = derive(p);
      const result = gen.build(p, ctxFor(m));
      expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
      // Default layout "2,1" on 3 x 4: one double, then eleven singles.
      expect(result.parts.length).toBe(11);

      const double = result.parts.find((x) => x.id === 'bin-0-0')!;
      const b = double.mesh.bbox;
      expect(b.max[0] - b.min[0]).toBeCloseTo(2 * d.cellW + d.gap, 1);
      expect(b.max[1] - b.min[1]).toBeCloseTo(d.cellD, 1);
      expect(b.max[2] - b.min[2]).toBeCloseTo(d.binH, 3);
      expect(double.name).toMatch(/2x1/);
      for (const part of result.parts) {
        expect(solidOf(m, part.mesh).decompose().length, part.name).toBe(1);
      }

      // Placed in the drawer: the whole set sits inside it with the fit gap to
      // spare, and the double sits over the two cells it replaces.
      const minX = Math.min(...result.parts.map((x) => x.assembly![0] - (x.mesh.bbox.max[0] - x.mesh.bbox.min[0]) / 2));
      const maxX = Math.max(...result.parts.map((x) => x.assembly![0] + (x.mesh.bbox.max[0] - x.mesh.bbox.min[0]) / 2));
      expect(maxX - minX).toBeCloseTo(d.drawerW - Number(p.fitGap), 1);
      expect(double.assembly![0]).toBeCloseTo(
        (binCentre(d, { col: 0, row: 0, w: 1, h: 1 })[0] + binCentre(d, { col: 1, row: 0, w: 1, h: 1 })[0]) / 2,
        6,
      );
      expect(d.binH).toBe(d.drawerH - Number(p.headroom));
    } finally {
      cleanup();
    }
  });

  it('steps the foot in so one bin drops into the top of another', async () => {
    const m = await kernel();
    try {
      const p = paramsWith({ layout: '', labelTab: false, scoop: false });
      const d = derive(p);
      const bin = solidOf(m, firstBin(gen.build(p, ctxFor(m)).parts).mesh);

      const foot = bin.slice(0.5).bounds();
      const footW = foot.max[0] - foot.min[0];
      const openingW = d.cellW - 2 * d.wall;
      expect(footW).toBeLessThan(openingW);
      expect(openingW - footW).toBeCloseTo(2 * STACK_CLEAR, 1);

      // And without the lip the walls go straight down.
      const plain = solidOf(m, firstBin(gen.build(paramsWith({ layout: '', stackable: false }), ctxFor(m)).parts).mesh);
      const flat = plain.slice(0.5).bounds();
      expect(flat.max[0] - flat.min[0]).toBeCloseTo(d.cellW, 1);
    } finally {
      cleanup();
    }
  });

  it('adds a label tab at the back and a scoop at the front', async () => {
    const m = await kernel();
    try {
      const p = paramsWith({ layout: '' });
      const d = derive(p);
      const bin = solidOf(m, firstBin(gen.build(p, ctxFor(m)).parts).mesh);
      const back = d.cellD / 2 - d.wall;
      const front = -d.cellD / 2 + d.wall;
      const labelD = d.labelDepth;

      // Tab: solid just under its top face, out from the back wall...
      // Probed off the middle of the wall, where a connector clip's slot is cut.
      expect(fill(m, bin, d.cellW * 0.3, back - labelD / 2, d.labelTop - 0.4)).toBeCloseTo(1, 2);
      // ...and the opening above it is clear, for a stacked bin's foot.
      expect(fill(m, bin, d.cellW * 0.3, back - labelD / 2, d.labelTop + 0.4)).toBeCloseTo(0, 2);

      // Scoop: the floor-to-wall corner is filled, the middle of the bin is not.
      // Probed past the stepped-in foot, whose wall stands further in.
      expect(fill(m, bin, 0, front + 2.5, d.floor + 1)).toBeCloseTo(1, 2);
      expect(fill(m, bin, 0, 0, d.floor + 1)).toBeCloseTo(0, 2);

      const bare = solidOf(m, firstBin(gen.build(paramsWith({ layout: '', labelTab: false, scoop: false }), ctxFor(m)).parts).mesh);
      expect(fill(m, bare, 0, front + 2.5, d.floor + 1)).toBeCloseTo(0, 2);
      expect(fill(m, bare, d.cellW * 0.3, back - labelD / 2, d.labelTop - 0.4)).toBeCloseTo(0, 2);
    } finally {
      cleanup();
    }
  });
});

describe('drawer organizer connectors', () => {
  it('clips every pair of neighbouring bins, and nothing else', async () => {
    const m = await kernel();
    try {
      // "2,1" on 3 x 4: the double's inner edge needs no clip.
      const p = paramsWith({ layout: '2,1' });
      const result = gen.build(p, ctxFor(m));
      expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
      const clips = result.parts.filter((x) => x.id.startsWith('clip-'));
      // 3 x 4 grid: 2 x 4 edges between columns + 3 x 3 between rows = 17, less the double's one.
      expect(clips.length).toBe(16);
      expect(result.readouts?.Connectors).toBe('16 clips');
      expect(result.parts.some((x) => x.id.startsWith('tray'))).toBe(false);
      for (const c of clips) expect(c.orientation).toEqual([180, 0, 0]);
      expect(solidOf(m, clips[0]!.mesh).decompose().length).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('sits in its notches clear of both bins, and holds them together', async () => {
    const m = await kernel();
    try {
      const p = paramsWith({ layout: '', columns: 2, rows: 1, drawerWidth: 200, drawerDepth: 120 });
      const result = gen.build(p, ctxFor(m));
      expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
      const place = (part: (typeof result.parts)[number]) => solidOf(m, part.mesh).translate(part.assembly as [number, number, number]);
      const [a, b] = ['bin-0-0', 'bin-0-1'].map((id) => place(result.parts.find((x) => x.id === id)!));
      const clips = result.parts.filter((x) => x.id.startsWith('clip-'));
      expect(clips.length).toBe(1);
      const clip = place(clips[0]!);
      // Clear as assembled: it drops in and lifts out.
      expect(clip.intersect(a!).volume()).toBeLessThan(1e-3);
      expect(clip.intersect(b!).volume()).toBeLessThan(1e-3);
      // Caught: pull either bin away from the other and it runs into the clip...
      expect(a!.translate([-1, 0, 0]).intersect(clip).volume()).toBeGreaterThan(0.05);
      expect(b!.translate([1, 0, 0]).intersect(clip).volume()).toBeGreaterThan(0.05);
      // ...and the clip cannot slide along the edge out of its notches.
      expect(clip.translate([0, 1, 0]).intersect(a!).volume()).toBeGreaterThan(0.05);
    } finally {
      cleanup();
    }
  });

  it('can be turned off, leaving plain rims', async () => {
    const m = await kernel();
    try {
      const result = gen.build(paramsWith({ connectors: false }), ctxFor(m));
      expect(result.parts.some((x) => x.id.startsWith('clip-'))).toBe(false);
      expect(result.readouts?.Connectors).toBeUndefined();
    } finally {
      cleanup();
    }
  });
});

describe('drawer organizer checks', () => {
  it('refuses bins too big for the bed', () => {
    const issues = gen.validate!(paramsWith({ drawerWidth: 600, columns: 2, layout: '' }));
    expect(issues.find((i) => i.level === 'error')?.message).toMatch(/bigger than your 256 x 256 mm bed/);
  });

  it('refuses a drawer too shallow for the bins', () => {
    const issues = gen.validate!(paramsWith({ drawerHeight: 15, headroom: 5 }));
    expect(issues.some((i) => i.level === 'error' && /headroom/i.test(i.message))).toBe(true);
  });

  it('builds every preset without errors, every part in one piece', async () => {
    const m = await kernel();
    try {
      for (const preset of gen.presets!) {
        const result = gen.build(paramsWith(preset.values), ctxFor(m));
        expect(result.issues.filter((i) => i.level === 'error'), preset.label).toEqual([]);
        expect(result.parts.length, preset.label).toBeGreaterThan(0);
        const seen = new Set<RawMesh>();
        for (const part of result.parts) {
          if (seen.has(part.mesh)) continue;
          seen.add(part.mesh);
          expect(solidOf(m, part.mesh).decompose().length, `${preset.label} / ${part.name}`).toBe(1);
        }
      }
    } finally {
      cleanup();
    }
  });
});
