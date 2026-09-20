import { BufferAttribute, BufferGeometry } from 'three';
import { deinterleave } from '../core/kernel/serialize';
import type { RawMesh } from '../core/kernel/types';

/**
 * RawMesh -> BufferGeometry for preview.
 *
 * No normal attribute is set on purpose: the preview material uses
 * flatShading, under which three.js derives the normal from
 * dFdx/dFdy(vViewPosition) and never declares vNormal. That is exactly the
 * faceted look a mechanical part wants, and it skips a calculateNormals()
 * WASM call on every rebuild.
 */
export function toBufferGeometry(mesh: RawMesh): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(deinterleave(mesh), 3));
  // Uint32 indices need WebGL2 (or OES_element_index_uint); both are fine here.
  g.setIndex(new BufferAttribute(mesh.index, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/**
 * Same conversion, offset to where the part sits in the assembled model.
 *
 * Copies the positions before shifting them, always. `deinterleave` hands back
 * the mesh's OWN array when there are no extra vertex properties, and a
 * three.js `translate()` mutates in place -- so offsetting the returned
 * geometry would walk the cached build result away from the origin a little
 * further on every repaint.
 */
export function assembledToBufferGeometry(
  mesh: RawMesh,
  offset: readonly [number, number, number] = [0, 0, 0],
): BufferGeometry {
  const xyz = new Float32Array(deinterleave(mesh));
  const [dx, dy, dz] = [offset[0] ?? 0, offset[1] ?? 0, offset[2] ?? 0];
  if (dx !== 0 || dy !== 0 || dz !== 0) {
    for (let i = 0; i < xyz.length; i += 3) {
      xyz[i] = (xyz[i] ?? 0) + dx;
      xyz[i + 1] = (xyz[i + 1] ?? 0) + dy;
      xyz[i + 2] = (xyz[i + 2] ?? 0) + dz;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(xyz, 3));
  g.setIndex(new BufferAttribute(mesh.index, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/**
 * Same conversion for a part that has already been rotated into print
 * orientation and placed on the plate. Positions are tightly packed xyz, so
 * they can be handed straight to three.js and to the exporters alike.
 */
export function laidOutToBufferGeometry(
  part: {
    positions: Float32Array;
    index: Uint32Array;
  },
  offsetX = 0,
): BufferGeometry {
  const g = new BufferGeometry();
  // A non-zero offset gets a COPY. The array handed in is the part's own, and
  // the exports read it: shifting it in place to draw plate 2 to the right
  // would put plate 2's parts 280 mm off the bed in the file as well.
  let xyz = part.positions;
  if (offsetX !== 0) {
    xyz = new Float32Array(part.positions);
    for (let i = 0; i < xyz.length; i += 3) xyz[i] = xyz[i]! + offsetX;
  }
  g.setAttribute('position', new BufferAttribute(xyz, 3));
  g.setIndex(new BufferAttribute(part.index, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}
