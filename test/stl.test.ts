import { describe, expect, it } from 'vitest';
import { cleanup, kernel, loadFont } from './kernel';
import { serialize } from '../src/core/kernel/serialize';
import { stlByteLength, writeBinarySTL } from '../src/core/export/stl';
import { textOutline } from '../src/core/text/textSolid';
import { KernelError } from '../src/core/kernel/types';

describe('binary STL', () => {
  it('has the exact documented byte layout', async () => {
    const m = await kernel();
    try {
      const mesh = serialize(m.Manifold.cube([10, 20, 3], true));
      const buf = writeBinarySTL(mesh, 'cube');

      expect(buf.byteLength).toBe(stlByteLength(mesh.stats.tris));
      expect(buf.byteLength).toBe(84 + 50 * mesh.stats.tris);

      const dv = new DataView(buf);
      expect(dv.getUint32(80, true), 'triangle count field').toBe(mesh.stats.tris);

      // Must NOT start with "solid" -- parsers sniff that and switch to ASCII.
      const head = new TextDecoder().decode(new Uint8Array(buf, 0, 5));
      expect(head).not.toBe('solid');
    } finally {
      cleanup();
    }
  });

  it('writes unit-length outward normals', async () => {
    const m = await kernel();
    try {
      // A cube: every facet normal must be a unit axis vector.
      const mesh = serialize(m.Manifold.cube([10, 10, 10], true));
      const buf = writeBinarySTL(mesh);
      const dv = new DataView(buf);
      const nTri = dv.getUint32(80, true);

      for (let t = 0; t < nTri; t++) {
        const o = 84 + t * 50;
        const n = [dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)];
        const len = Math.hypot(n[0]!, n[1]!, n[2]!);
        expect(len, `facet ${t} normal length`).toBeCloseTo(1, 4);
        // Exactly one axis component is +/-1 on an axis-aligned cube.
        const axes = n.filter((c) => Math.abs(Math.abs(c) - 1) < 1e-4).length;
        expect(axes, `facet ${t} is axis-aligned`).toBe(1);
        expect(dv.getUint16(o + 48, true), 'attribute byte count').toBe(0);
      }
    } finally {
      cleanup();
    }
  });

  it('preserves millimetre scale with no hidden scaling', async () => {
    const m = await kernel();
    try {
      const mesh = serialize(m.Manifold.cube([12.5, 40, 2.4], true));
      const buf = writeBinarySTL(mesh);
      const dv = new DataView(buf);
      const nTri = dv.getUint32(80, true);

      let minX = Infinity, maxX = -Infinity, maxZ = -Infinity, minZ = Infinity;
      for (let t = 0; t < nTri; t++) {
        const o = 84 + t * 50 + 12;
        for (let v = 0; v < 3; v++) {
          const x = dv.getFloat32(o + v * 12, true);
          const z = dv.getFloat32(o + v * 12 + 8, true);
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
        }
      }
      expect(maxX - minX).toBeCloseTo(12.5, 4);
      expect(maxZ - minZ).toBeCloseTo(2.4, 4);
    } finally {
      cleanup();
    }
  });

  it('exports real lettering geometry', async () => {
    const m = await kernel();
    try {
      const solid = textOutline(m, loadFont('inter-bold'), {
        text: 'Hello',
        capHeightMm: 10,
      }).extrude(2);
      const mesh = serialize(solid);
      const buf = writeBinarySTL(mesh, 'Hello');
      expect(buf.byteLength).toBe(stlByteLength(mesh.stats.tris));
      expect(mesh.stats.tris).toBeGreaterThan(100);
    } finally {
      cleanup();
    }
  });
});

describe('serialize gate', () => {
  it('refuses to hand on an empty solid rather than exporting nothing', async () => {
    const m = await kernel();
    try {
      const empty = m.Manifold.cube([5, 5, 5], true).subtract(m.Manifold.cube([9, 9, 9], true));
      expect(() => serialize(empty)).toThrow(KernelError);
    } finally {
      cleanup();
    }
  });

  it('reports millimetre stats that match the geometry', async () => {
    const m = await kernel();
    try {
      const mesh = serialize(m.Manifold.cube([10, 10, 10], true));
      expect(mesh.stats.volumeMm3).toBeCloseTo(1000, 3);
      expect(mesh.stats.areaMm2).toBeCloseTo(600, 3);
      expect(mesh.stats.genus).toBe(0);
      expect(mesh.bbox.min).toEqual([-5, -5, -5]);
      expect(mesh.bbox.max).toEqual([5, 5, 5]);
    } finally {
      cleanup();
    }
  });
});
