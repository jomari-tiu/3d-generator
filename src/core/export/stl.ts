import { deinterleave } from '../kernel/serialize';
import type { RawMesh } from '../kernel/types';

/**
 * Binary STL writer.
 *
 * Layout (all little-endian):
 *   [0, 80)   header, free-form
 *   [80, 84)  uint32 triangle count
 *   then count * 50 bytes:
 *     float32[3] facet normal
 *     float32[3] v0, v1, v2
 *     uint16     attribute byte count (0)
 * Total = 84 + 50 * N.
 *
 * Units: STL carries none. Manifold output is already millimetres because we
 * fed it millimetres, and slicers assume mm -- so no scaling happens anywhere.
 */
export function writeBinarySTL(mesh: RawMesh, name = 'model'): ArrayBuffer {
  const pos = deinterleave(mesh);
  const idx = mesh.index;
  const nTri = idx.length / 3;

  const buf = new ArrayBuffer(84 + nTri * 50);
  const dv = new DataView(buf);

  // The header must NOT begin with "solid": many parsers sniff that prefix and
  // then try to read the whole file as ASCII STL.
  const header = `3dgen binary STL: ${name}`.slice(0, 79);
  new Uint8Array(buf, 0, 80).set(new TextEncoder().encode(header));
  dv.setUint32(80, nTri, true);

  let o = 84;
  for (let t = 0; t < nTri; t++) {
    const a = idx[t * 3]! * 3;
    const b = idx[t * 3 + 1]! * 3;
    const c = idx[t * 3 + 2]! * 3;

    const ax = pos[a]!, ay = pos[a + 1]!, az = pos[a + 2]!;
    const bx = pos[b]!, by = pos[b + 1]!, bz = pos[b + 2]!;
    const cx = pos[c]!, cy = pos[c + 1]!, cz = pos[c + 2]!;

    // Manifold's triVerts are documented CCW as seen from outside, so
    // (b-a) x (c-a) is the outward normal by the right-hand rule.
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    } else {
      // Degenerate triangle. A zero normal is legal and every slicer
      // recomputes normals anyway.
      nx = ny = nz = 0;
    }

    dv.setFloat32(o, nx, true);
    dv.setFloat32(o + 4, ny, true);
    dv.setFloat32(o + 8, nz, true);
    dv.setFloat32(o + 12, ax, true);
    dv.setFloat32(o + 16, ay, true);
    dv.setFloat32(o + 20, az, true);
    dv.setFloat32(o + 24, bx, true);
    dv.setFloat32(o + 28, by, true);
    dv.setFloat32(o + 32, bz, true);
    dv.setFloat32(o + 36, cx, true);
    dv.setFloat32(o + 40, cy, true);
    dv.setFloat32(o + 44, cz, true);
    dv.setUint16(o + 48, 0, true);
    o += 50;
  }

  return buf;
}

/** Expected byte length for a given triangle count -- asserted in tests. */
export function stlByteLength(triangleCount: number): number {
  return 84 + 50 * triangleCount;
}
