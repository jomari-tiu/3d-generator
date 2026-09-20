import { describe, expect, it } from 'vitest';
import { safeFilename } from '../src/core/export/download';
import { layAssembled, packPlate } from '../src/core/build/layout';
import { cleanup, kernel, loadFont } from './kernel';
import { coerceAll, defaultsOf } from '../src/core/params/validate';
import { GENERATORS } from '../src/generators/registry';
import { keyClickerGenerator } from '../src/generators/keyclicker/build';
import type { BuildCtx, Params, Part } from '../src/core/params/types';
import type { ManifoldToplevel } from 'manifold-3d';

function ctxFor(m: ManifoldToplevel): BuildCtx {
  return { m, font: (id) => loadFont(id), image: () => undefined, tolerance: 0.03, issue: () => {} };
}

/** The suffix packPlate adds per copy; the UI resolves both back to one part. */
function basePartId(id: string): string {
  const hash = id.indexOf('#');
  return hash < 0 ? id : id.slice(0, hash);
}

describe('assembled preview', () => {
  it('leaves parts that are modelled in place exactly where they are', async () => {
    const m = await kernel();
    try {
      // Most generators build every part where it belongs, so the assembled
      // view is the raw build and the offset is absent rather than zero.
      for (const gen of GENERATORS.filter((g) => g.id !== 'keyclicker')) {
        const result = gen.build(coerceAll(gen, defaultsOf(gen)), ctxFor(m));
        for (const part of result.parts) {
          expect(part.assembly, `${gen.name} / ${part.name}`).toBeUndefined();
        }
      }
    } finally {
      cleanup();
    }
  });

  it('spreads the keycaps across the bar instead of stacking them', async () => {
    const m = await kernel();
    try {
      const p = coerceAll(keyClickerGenerator, {
        ...defaultsOf(keyClickerGenerator),
        text: 'KONG',
      });
      const result = keyClickerGenerator.build(p, ctxFor(m));
      const caps = result.parts.filter((x) => x.id.startsWith('cap-'));
      expect(caps.length).toBe(4);

      // Every cap is BUILT at the origin, so without an assembly offset they
      // would all occupy the same place in the whole view.
      for (const cap of caps) {
        expect(Math.abs(cap.mesh.bbox.min[0] + cap.mesh.bbox.max[0]), cap.name).toBeLessThan(0.5);
      }

      const xs = caps.map((c) => c.assembly?.[0] ?? 0);
      expect(new Set(xs).size, 'four distinct seats').toBe(4);
      // Evenly spaced, and centred on the bar.
      const gaps = xs.slice(1).map((x, i) => x - xs[i]!);
      for (const g of gaps) expect(g).toBeCloseTo(gaps[0]!, 6);
      expect(xs[0]! + xs[3]!).toBeCloseTo(0, 6);

      // Each legend rides with its own cap, or the letter floats behind it.
      for (let i = 0; i < 4; i++) {
        const legend = result.parts.find((x) => x.id === `legend-${i}`);
        if (!legend) continue;
        expect(legend.assembly, `legend ${i}`).toEqual(caps[i]!.assembly);
      }
    } finally {
      cleanup();
    }
  });

  it('sits the keycaps above the bar, not inside it', async () => {
    const m = await kernel();
    try {
      const p = coerceAll(keyClickerGenerator, { ...defaultsOf(keyClickerGenerator), text: 'AB' });
      const result = keyClickerGenerator.build(p, ctxFor(m));
      const base = result.parts.find((x) => x.id === 'base')!;
      const cap = result.parts.find((x) => x.id === 'cap-0')!;
      const seatZ = cap.assembly?.[2] ?? 0;
      // Below the top of the bar (the stem goes in) but not down at the floor.
      expect(seatZ).toBeLessThan(base.mesh.bbox.max[2]);
      expect(seatZ).toBeGreaterThan(base.mesh.bbox.max[2] / 2);
    } finally {
      cleanup();
    }
  });
});

describe('assembled export layout', () => {
  it('keeps the storeys stacked, and separate', async () => {
    const m = await kernel();
    try {
      const gen = GENERATORS.find((g) => g.id === 'building')!;
      const p = coerceAll(gen, defaultsOf(gen));
      const result = gen.build(p, ctxFor(m));
      const assembled = layAssembled(result.parts);
      const plate = packPlate(result.parts, [256, 256]);

      // One body per part, the same bodies, in the same order.
      expect(assembled.map((x) => x.id)).toEqual(result.parts.map((x) => x.id));
      expect(assembled).toHaveLength(4);

      // Stacked: every storey sits at a different height, ascending, and none
      // of them was dropped to z = 0 the way the plate drops them.
      const floors = assembled.map((x) => x.origin[2]);
      expect([...floors].sort((a, b) => a - b)).toEqual(floors);
      expect(new Set(floors).size).toBe(floors.length);
      expect(floors[0]).toBeCloseTo(0, 3);
      expect(floors[3]).toBeGreaterThan(50);
      // The plate, by contrast, puts every part on the bed.
      for (const part of plate.parts) expect(part.origin[2]).toBeCloseTo(0, 6);

      // Stacked, not spread: on the plate they sit side by side, assembled they
      // share the same footprint. That difference IS the feature.
      const spanX = (ps: readonly { origin: readonly number[]; size: readonly number[] }[]) =>
        Math.max(...ps.map((x) => x.origin[0]! + x.size[0]!)) - Math.min(...ps.map((x) => x.origin[0]!));
      expect(spanX(assembled)).toBeLessThan(spanX(plate.parts) * 0.75);

      // And the pieces still come apart: nothing was welded on the way out.
      for (const part of assembled) expect(part.positions.length).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });

  it('does not walk the cached build away from the origin', async () => {
    const m = await kernel();
    try {
      const gen = GENERATORS.find((g) => g.id === 'keyclicker')!;
      const p = coerceAll(gen, { ...defaultsOf(gen), text: 'KONG' });
      const result = gen.build(p, ctxFor(m));
      // Keycaps are the one generator that declares an `assembly` offset, so
      // this is where laying out twice could shift the source mesh twice.
      const once = layAssembled(result.parts).map((x) => [...x.origin]);
      const twice = layAssembled(result.parts).map((x) => [...x.origin]);
      expect(twice).toEqual(once);
    } finally {
      cleanup();
    }
  });
});

describe('per-part export', () => {
  it('resolves a repeated part back to the one part it is', async () => {
    const m = await kernel();
    try {
      const p = coerceAll(keyClickerGenerator, {
        ...defaultsOf(keyClickerGenerator),
        text: 'AB', switchType: 'printed', keyPitch: 16, keySize: 14.4, capHeight: 6,
      });
      const result = keyClickerGenerator.build(p, ctxFor(m));
      const dome = result.parts.find((x) => x.id === 'dome')!;
      expect(dome.quantity).toBe(2);

      // packPlate expands the quantity into copies with a # suffix, so the
      // panel's id and the plate's ids are not the same string.
      const plate = packPlate(result.parts, [256, 256]);
      const copies = plate.parts.filter((x) => basePartId(x.id) === 'dome');
      expect(copies.length).toBe(2);
      expect(copies.map((c) => c.id)).toEqual(['dome#1', 'dome#2']);
      // Downloading one part means one copy, not the quantity.
      expect(plate.parts.find((x) => basePartId(x.id) === 'dome')).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it('gives every part of every generator a distinct file name', async () => {
    const m = await kernel();
    try {
      for (const gen of GENERATORS) {
        const result = gen.build(coerceAll(gen, defaultsOf(gen)), ctxFor(m));
        const names = result.parts.map((part: Part) => safeFilename(part.name, part.id));
        expect(new Set(names).size, gen.name).toBe(names.length);
        for (const n of names) expect(n, gen.name).toMatch(/^[A-Za-z0-9._-]+$/);
      }
    } finally {
      cleanup();
    }
  });
});

describe('safeFilename', () => {
  it('keeps only characters every filesystem agrees on', () => {
    // An allow-list, so the ones nobody thought of are handled too. A curly
    // apostrophe reached a filename through the old block-list.
    expect(safeFilename('Maker’s mark')).toBe('Maker-s-mark');
    expect(safeFilename(String.raw`a/b\c:d*e?f"g<h>i|j`)).toBe('a-b-c-d-e-f-g-h-i-j');
    // Accents come off their letters and the letters survive.
    expect(safeFilename('Café Ann')).toBe('Cafe-Ann');
    // A letter that is not an accented form of an ASCII one has nothing to
    // decompose to, so it becomes a separator. Lossy, deliberately: the model
    // carries the real text, this is only what the file is called.
    expect(safeFilename('Grüße, Ann')).toBe('Gru-e-Ann');
    expect(safeFilename('emoji 🐈 bowl')).toBe('emoji-bowl');
    expect(safeFilename('  spaced   out  ')).toBe('spaced-out');
  });

  it('never returns something that is not a name', () => {
    expect(safeFilename('', 'fallback')).toBe('fallback');
    expect(safeFilename('🐈🐕', 'fallback')).toBe('fallback');
    expect(safeFilename('---', 'fallback')).toBe('fallback');
    expect(safeFilename('...', 'fallback')).toBe('fallback');
  });

  it('keeps names short enough to survive a zip and a filesystem', () => {
    expect(safeFilename('x'.repeat(200)).length).toBeLessThanOrEqual(48);
  });
});
