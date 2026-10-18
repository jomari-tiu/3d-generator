import type { ManifoldToplevel } from 'manifold-3d';
import { describe, expect, it } from 'vitest';
import { packPlates } from '../src/core/build/layout';
import { coerceAll, defaultsOf } from '../src/core/params/validate';
import type { BuildCtx, BuildResult, Params } from '../src/core/params/types';
import { pegboardGenerator } from '../src/generators/pegboard/build';
import { derive } from '../src/generators/pegboard/geometry';
import { cleanup, kernel, loadFont } from './kernel';

function ctxFor(m: ManifoldToplevel): BuildCtx {
  return { m, font: (id) => loadFont(id), image: () => undefined, tolerance: 0.05, issue: () => {} };
}

function paramsWith(patch: Params = {}): Params {
  return coerceAll(pegboardGenerator, { ...defaultsOf(pegboardGenerator), ...patch });
}

function errorsOf(patch: Params = {}): string[] {
  return (pegboardGenerator.validate?.(paramsWith(patch)) ?? []).filter((i) => i.level === 'error').map((i) => i.message);
}

async function built(patch: Params = {}): Promise<BuildResult> {
  const m = await kernel();
  try {
    return pegboardGenerator.build(paramsWith(patch), ctxFor(m));
  } finally {
    cleanup();
  }
}

const errors = (r: BuildResult) => r.issues.filter((i) => i.level === 'error').map((i) => i.message);
const size = (r: BuildResult, id: string, axis: number) => {
  const b = r.parts.find((p) => p.id === id)!.mesh.bbox;
  return b.max[axis]! - b.min[axis]!;
};

describe('clamp-on pegboard', () => {
  it('accepts its own defaults and presets', () => {
    expect(errorsOf()).toEqual([]);
    for (const preset of pegboardGenerator.presets ?? []) expect(errorsOf(preset.values), preset.label).toEqual([]);
  });

  it('builds the defaults with every accessory on the board and nothing colliding', async () => {
    const r = await built();
    expect(errors(r)).toEqual([]);
    for (const part of r.parts) expect(part.mesh.stats.volumeMm3, part.name).toBeGreaterThan(0);
    const panel = r.parts.find((p) => p.id.startsWith('panel-'))!;
    // Every hole is a handle through the board.
    const d = derive(paramsWith());
    expect(panel.mesh.stats.genus).toBeGreaterThanOrEqual(d.cols.length * d.rows.length);
    const ids = r.parts.map((p) => p.id);
    for (const id of ['acc-headphone', 'acc-cup', 'acc-phone', 'acc-cable', 'acc-pen', 'acc-bottom', 'acc-hooksA-0', 'acc-hooksA-1', 'clamp-0', 'clamp-1', 'tray-0', 'desk']) {
      expect(ids, id).toContain(id);
    }
    expect(r.parts.some((p) => p.color === '#e5484d')).toBe(false);
    expect(r.vectors?.[0]?.id).toBe('guide');
    const guide = r.vectors![0]!.data;
    expect(typeof guide === 'function' ? guide() : guide).toContain('Assembly');
  });

  it('builds every preset', async () => {
    for (const preset of pegboardGenerator.presets ?? []) {
      const r = await built(preset.values);
      expect(errors(r), preset.label).toEqual([]);
    }
  });

  it('builds every optional accessory and hook shape', async () => {
    for (const style of ['j', 'double', 'u', 'peg']) {
      const r = await built({
        headphone: false, phone: false, cable: false, pen: false, cup: false, bottom: false,
        hooksAStyle: style, controller: true, controllerRow: 4, shelf: true, shelfCol: 7, shelfRow: 1, hooksB: true,
      });
      expect(errors(r), style).toEqual([]);
      expect(r.parts.some((p) => p.id === 'acc-controller')).toBe(true);
      expect(r.parts.some((p) => p.id === 'acc-shelf')).toBe(true);
    }
  });

  it('resizes the hole grid and the pegs with the hole settings', () => {
    const a = derive(paramsWith());
    const b = derive(paramsWith({ pitchX: 20, holeD: 5 }));
    expect(b.cols.length).toBeGreaterThan(a.cols.length);
    expect(2 * b.pinR).toBeCloseTo(5 - 1.5, 6);
    expect(a.cols[1]! - a.cols[0]!).toBeCloseTo(25, 6);
  });

  it('winds the screw to the desk and refuses desks outside its range', async () => {
    const thin = derive(paramsWith({ deskThickness: 18 }));
    const thick = derive(paramsWith({ deskThickness: 38 }));
    expect(thin.screwRise - thick.screwRise).toBeCloseTo(20, 6);
    expect(errorsOf({ deskThickness: 45 }).join()).toMatch(/will not go into/);
    expect(errorsOf({ deskThickness: 12 }).join()).toMatch(/grips desks from/);

    // The swivel pad's top meets the underside of the desk.
    const r = await built({ deskThickness: 30 });
    const swivel = r.parts.find((p) => p.id === 'swivel-0')!;
    expect(swivel.mesh.bbox.max[2]).toBeCloseTo(-30, 3);
  });

  it('flags overlapping accessories and paints them red', async () => {
    const r = await built({ cupCol: 5, cupRow: 4 });
    expect(errors(r).join()).toMatch(/overlap/);
    expect(r.parts.find((p) => p.id === 'acc-cup')!.color).toBe('#e5484d');
  });

  it('refuses an accessory placed off the grid', async () => {
    const r = await built({ penCol: 20 });
    expect(errors(r).join()).toMatch(/pen holder needs/);
  });

  it('sizes the tray and the bottom shelf from their settings', async () => {
    const r = await built({ trayWidth: 200, trayDepth: 100, bottomWidth: 180, bottomDepth: 60 });
    expect(size(r, 'tray-0', 0)).toBeCloseTo(200, 1);
    expect(size(r, 'tray-0', 1)).toBeCloseTo(100, 1);
    expect(size(r, 'acc-bottom', 0)).toBeCloseTo(180, 1);
  });

  it('splits a board bigger than the bed into sections that each fit', async () => {
    const r = await built({ panelWidth: 400, panelHeight: 320, trayWidth: 400, bottomWidth: 380, clampCount: 3, headphoneCol: 2 });
    expect(errors(r)).toEqual([]);
    const panels = r.parts.filter((p) => p.id.startsWith('panel-'));
    expect(panels.length).toBe(4);
    expect(r.parts.some((p) => p.id.startsWith('dowel'))).toBe(true);
    expect(r.parts.filter((p) => p.id.startsWith('tray-')).length).toBe(2);
    const set = packPlates(r.parts.filter((p) => !p.previewOnly && p.id !== 'acc-bottom'), [256, 256], 6);
    expect(set.fits).toBe(true);
  });

  it('stands the board above the desk when asked', async () => {
    const r = await built({ mount: 'above', panelHeight: 300, tray: false });
    expect(errors(r)).toEqual([]);
    const panel = r.parts.find((p) => p.id.startsWith('panel-'))!;
    expect(panel.mesh.bbox.max[2]).toBeGreaterThan(200);
  });

  it('takes a metal bolt instead of the printed screw', async () => {
    const r = await built({ clampScrew: 'm8' });
    expect(errors(r)).toEqual([]);
    expect(r.parts.some((p) => p.id === 'screw-0')).toBe(false);
    expect(r.parts.find((p) => p.id === 'bolt-0')?.previewOnly).toBe(true);
    expect(r.readouts?.Hardware).toMatch(/M8/);
  });
});
