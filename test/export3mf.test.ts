import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { cleanup, kernel } from './kernel';
import { serialize } from '../src/core/kernel/serialize';
import { write3MF } from '../src/core/export/threemf';
import { write3mfBundle, writeStlBundle } from '../src/core/export/bundle';
import { layFlat, packPlate, packPlates } from '../src/core/build/layout';
import type { Part } from '../src/core/params/types';

async function twoParts(): Promise<Part[]> {
  const m = await kernel();
  return [
    {
      id: 'body',
      name: 'Body',
      mesh: serialize(m.Manifold.cube([30, 20, 10], true)),
      color: '#2f6fb3',
    },
    {
      id: 'keycap',
      name: 'Keycap',
      mesh: serialize(m.Manifold.cube([25, 6, 2], true)),
      color: '#f2f4f8',
      orientation: [0, 0, 0],
    },
  ];
}

describe('3MF export', () => {
  it('produces a valid OPC package with the required parts', async () => {
    try {
      const parts = (await twoParts()).map(layFlat);
      const zip = write3MF(parts, { title: 'Key clicker' });
      const entries = unzipSync(zip);
      const names = Object.keys(entries);

      // [Content_Types].xml must come first -- OPC readers expect it.
      expect(names[0]).toBe('[Content_Types].xml');
      expect(names).toContain('_rels/.rels');
      expect(names).toContain('3D/3dmodel.model');

      const rels = strFromU8(entries['_rels/.rels']!);
      expect(rels).toContain('/3D/3dmodel.model');
      expect(rels).toContain('3dmanufacturing/2013/01/3dmodel');
    } finally {
      cleanup();
    }
  });

  it('declares millimetres and one object per part', async () => {
    try {
      const parts = (await twoParts()).map(layFlat);
      const model = strFromU8(
        unzipSync(write3MF(parts, { title: 'Key clicker' }))['3D/3dmodel.model']!,
      );

      expect(model).toContain('unit="millimeter"');
      expect(model).toContain('name="Body"');
      expect(model).toContain('name="Keycap"');
      expect((model.match(/<object /g) ?? []).length).toBe(2);
      expect((model.match(/<item /g) ?? []).length).toBe(2);

      // Object ids must be unique positive integers, and must not collide
      // with the basematerials resource id.
      const ids = [...model.matchAll(/<object id="(\d+)"/g)].map((mm) => mm[1]!);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).not.toContain('1');
    } finally {
      cleanup();
    }
  });

  it('bakes per-part colour as basematerials with matching pindex', async () => {
    try {
      const parts = (await twoParts()).map(layFlat);
      const model = strFromU8(
        unzipSync(write3MF(parts, { title: 'Colours' }))['3D/3dmodel.model']!,
      );

      expect(model).toContain('<basematerials id="1">');
      expect(model).toContain('displaycolor="#2F6FB3FF"');
      expect(model).toContain('displaycolor="#F2F4F8FF"');
      // Each object points at its own material slot, in part order.
      expect(model).toMatch(/<object id="2"[^>]*pid="1"[^>]*pindex="0"/);
      expect(model).toMatch(/<object id="3"[^>]*pid="1"[^>]*pindex="1"/);
    } finally {
      cleanup();
    }
  });

  it('can be written without colour', async () => {
    try {
      const parts = (await twoParts()).map(layFlat);
      const model = strFromU8(
        unzipSync(write3MF(parts, { title: 'Plain', color: false }))['3D/3dmodel.model']!,
      );
      expect(model).not.toContain('basematerials');
      expect(model).not.toContain('pindex');
    } finally {
      cleanup();
    }
  });

  it('carries a thumbnail when given one', async () => {
    try {
      const parts = (await twoParts()).map(layFlat);
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
      const entries = unzipSync(write3MF(parts, { title: 'Thumb', thumbnail: png }));
      expect(Object.keys(entries)).toContain('Metadata/thumbnail.png');
      expect(strFromU8(entries['_rels/.rels']!)).toContain('thumbnail');
    } finally {
      cleanup();
    }
  });
});

describe('STL bundle', () => {
  it('writes one STL per part plus a readme, never a merged solid', async () => {
    try {
      const parts = (await twoParts()).map(layFlat);
      const entries = unzipSync(
        writeStlBundle(parts, { title: 'Key clicker', notes: ['Print the keycaps upside down.'] }),
      );
      const names = Object.keys(entries);
      expect(names).toContain('Body.stl');
      expect(names).toContain('Keycap.stl');
      expect(names).toContain('README.txt');

      const readme = strFromU8(entries['README.txt']!);
      expect(readme).toContain('millimetres');
      expect(readme).toContain('Print the keycaps upside down.');
      // Each STL keeps the documented layout.
      for (const n of ['Body.stl', 'Keycap.stl']) {
        const buf = entries[n]!;
        const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        expect(buf.byteLength).toBe(84 + 50 * dv.getUint32(80, true));
      }
    } finally {
      cleanup();
    }
  });
});

describe('plate layout', () => {
  it('drops parts onto z = 0 and keeps them inside the bed', async () => {
    try {
      const parts = await twoParts();
      const plate = packPlate(parts, [256, 256]);
      expect(plate.fits).toBe(true);
      expect(plate.overflow).toEqual([]);

      for (const p of plate.parts) {
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < p.positions.length; i += 3) {
          minZ = Math.min(minZ, p.positions[i + 2]!);
          maxX = Math.max(maxX, Math.abs(p.positions[i]!));
          maxY = Math.max(maxY, Math.abs(p.positions[i + 1]!));
        }
        expect(minZ, `${p.name} sits on the plate`).toBeCloseTo(0, 4);
        expect(maxX).toBeLessThan(128);
        expect(maxY).toBeLessThan(128);
      }
    } finally {
      cleanup();
    }
  });

  it('spreads onto as many plates as it takes rather than dropping the overflow', async () => {
    const m = await kernel();
    try {
      // Four slabs 130 mm deep: two fit a 256 bed side by side, the other two
      // cannot share a shelf with them, so this is a two-plate model. Before
      // packPlates the second pair simply vanished from the preview and the
      // export -- which is how a drawer came to be exported without its drawer.
      const slab = (id: string): Part => ({
        id,
        name: id.toUpperCase(),
        mesh: serialize(m.Manifold.cube([110, 130, 6], true)),
        color: '#ffffff',
      });
      const parts = [slab('a'), slab('b'), slab('c'), slab('d')];

      const one = packPlate(parts, [256, 256]);
      expect(one.fits).toBe(false);
      expect(one.overflow.length).toBeGreaterThan(0);

      const set = packPlates(parts, [256, 256]);
      expect(set.fits).toBe(true);
      expect(set.overflow).toEqual([]);
      expect(set.plates.length).toBe(2);
      // Every part landed exactly once, and each plate's parts are centred on
      // that plate rather than strung out along x.
      const placed = set.plates.flatMap((p) => p.parts);
      expect(placed.map((p) => p.name).sort()).toEqual(['A', 'B', 'C', 'D']);
      set.plates.forEach((plate, i) => {
        for (const p of plate.parts) {
          expect(p.plate, p.name).toBe(i);
          for (let k = 0; k < p.positions.length; k += 3) {
            expect(Math.abs(p.positions[k]!)).toBeLessThan(128);
            expect(Math.abs(p.positions[k + 1]!)).toBeLessThan(128);
          }
        }
      });
    } finally {
      cleanup();
    }
  });

  it('files a multi-plate export one folder, and one 3MF, per plate', async () => {
    const m = await kernel();
    try {
      const slab = (id: string): Part => ({
        id,
        name: id.toUpperCase(),
        mesh: serialize(m.Manifold.cube([110, 130, 6], true)),
        color: '#ffffff',
      });
      const set = packPlates([slab('a'), slab('b'), slab('c'), slab('d')], [256, 256]);
      const placed = set.plates.flatMap((p) => p.parts);

      const stl = unzipSync(writeStlBundle(placed, { title: 'T' }));
      const stls = Object.keys(stl).filter((n) => n.endsWith('.stl')).sort();
      expect(stls).toEqual(['plate-1/A.stl', 'plate-1/B.stl', 'plate-2/C.stl', 'plate-2/D.stl']);
      expect(strFromU8(stl['README.txt']!)).toContain('2 plates');

      const zip = unzipSync(write3mfBundle(placed, { title: 'T', base: 'thing' }));
      expect(Object.keys(zip).filter((n) => n.endsWith('.3mf')).sort()).toEqual([
        'thing-plate-1.3mf',
        'thing-plate-2.3mf',
      ]);
      // Each 3MF holds only its own plate's parts.
      for (const [name, expected] of [
        ['thing-plate-1.3mf', ['A', 'B']],
        ['thing-plate-2.3mf', ['C', 'D']],
      ] as const) {
        const model = strFromU8(unzipSync(zip[name]!)['3D/3dmodel.model']!);
        for (const want of expected) expect(model, name).toContain(`name="${want}"`);
        for (const other of ['A', 'B', 'C', 'D'].filter((x) => !expected.includes(x as never))) {
          expect(model, name).not.toContain(`name="${other}"`);
        }
      }
    } finally {
      cleanup();
    }
  });

  it('reports parts too big for the bed instead of silently dropping them', async () => {
    const m = await kernel();
    try {
      const huge: Part = {
        id: 'huge',
        name: 'Huge',
        mesh: serialize(m.Manifold.cube([400, 20, 5], true)),
        color: '#ffffff',
      };
      const plate = packPlate([huge], [256, 256]);
      expect(plate.fits).toBe(false);
      expect(plate.overflow).toEqual(['Huge']);
      // And no number of plates rescues it: it is wider than any of them.
      const set = packPlates([huge], [256, 256]);
      expect(set.fits).toBe(false);
      expect(set.overflow).toEqual(['Huge']);
      expect(set.plates).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('rotates into the declared print orientation', async () => {
    const m = await kernel();
    try {
      // A tall thin part laid on its side becomes short and long.
      const upright: Part = {
        id: 'p',
        name: 'Upright',
        mesh: serialize(m.Manifold.cube([4, 4, 40], true)),
        color: '#fff',
        orientation: [90, 0, 0],
      };
      const laid = layFlat(upright);
      expect(laid.size[2]).toBeCloseTo(4, 3);
      expect(laid.size[1]).toBeCloseTo(40, 3);
    } finally {
      cleanup();
    }
  });

  it('expands quantities into separate placed copies', async () => {
    const m = await kernel();
    try {
      const wheel: Part = {
        id: 'wheel',
        name: 'Digit wheel',
        mesh: serialize(m.Manifold.cylinder(8, 12, 12, 32, true)),
        color: '#fff',
        quantity: 3,
      };
      const plate = packPlate([wheel], [256, 256]);
      expect(plate.parts).toHaveLength(3);
      expect(new Set(plate.parts.map((p) => p.id)).size).toBe(3);
    } finally {
      cleanup();
    }
  });
});

describe('grouped parts', () => {
  it('keeps a two-colour object together in all three axes', async () => {
    const m = await kernel();
    try {
      // A plate with lettering standing on top of it: one printed object made
      // of two coloured bodies. Packing them apart, or dropping each to z=0
      // independently, would slide the lettering off the plate.
      const plate: Part = {
        id: 'plate',
        name: 'Plate',
        mesh: serialize(m.Manifold.cube([40, 20, 2.4], true)),
        color: '#2f6fb3',
        group: 'tag',
      };
      const letters: Part = {
        id: 'lettering',
        name: 'Lettering',
        mesh: serialize(m.Manifold.cube([30, 8, 1.2], true).translate([0, 0, 1.8])),
        color: '#ffffff',
        group: 'tag',
      };

      const plate2 = packPlate([plate, letters], [256, 256]);
      const gotPlate = plate2.parts.find((p) => p.id === 'plate')!;
      const gotText = plate2.parts.find((p) => p.id === 'lettering')!;

      const zRange = (p: typeof gotPlate) => {
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = 2; i < p.positions.length; i += 3) {
          lo = Math.min(lo, p.positions[i]!);
          hi = Math.max(hi, p.positions[i]!);
        }
        return [lo, hi] as const;
      };

      // The plate rests on the bed; the lettering sits on TOP of it.
      expect(zRange(gotPlate)[0]).toBeCloseTo(0, 4);
      expect(zRange(gotText)[0]).toBeCloseTo(2.4, 3);
      expect(zRange(gotText)[1]).toBeCloseTo(3.6, 3);

      // And they stay concentric in XY rather than being packed side by side.
      const centreX = (p: typeof gotPlate) => p.origin[0]! + p.size[0] / 2;
      expect(centreX(gotText)).toBeCloseTo(centreX(gotPlate), 3);
    } finally {
      cleanup();
    }
  });

  it('still packs ungrouped parts side by side', async () => {
    const m = await kernel();
    try {
      const mk = (id: string): Part => ({
        id,
        name: id,
        mesh: serialize(m.Manifold.cube([20, 20, 4], true)),
        color: '#fff',
      });
      const plate = packPlate([mk('a'), mk('b')], [256, 256]);
      const [a, b] = [plate.parts[0]!, plate.parts[1]!];
      // Different x origins, and neither overlaps the other.
      expect(Math.abs(a.origin[0]! - b.origin[0]!)).toBeGreaterThanOrEqual(20);
    } finally {
      cleanup();
    }
  });
});
