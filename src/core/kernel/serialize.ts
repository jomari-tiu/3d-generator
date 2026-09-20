import type { Manifold } from 'manifold-3d';
import { KernelError, type RawMesh } from './types';

/**
 * Manifold -> RawMesh, copied out of the WASM heap.
 *
 * The copies are MANDATORY: wasm heap growth detaches the backing
 * ArrayBuffer and cleanup() frees the memory underneath, so a retained view
 * is a use-after-free that shows up as garbage geometry rather than a crash.
 *
 * Also gates on status()/volume(): a silently-failed boolean is the likely bug
 * class in this project, and we refuse to hand a broken solid downstream.
 */
export function serialize(solid: Manifold): RawMesh {
  const status = solid.status();
  if (status !== 'NoError') throw new KernelError(String(status));

  const mesh = solid.getMesh();
  const volumeMm3 = solid.volume();
  if (!(volumeMm3 > 0)) {
    throw new KernelError('EmptySolid', 'Solid has zero volume - nothing to export.');
  }

  const bb = solid.boundingBox();
  return {
    position: new Float32Array(mesh.vertProperties),
    index: new Uint32Array(mesh.triVerts),
    numProp: mesh.numProp,
    bbox: {
      min: [bb.min[0], bb.min[1], bb.min[2]] as const,
      max: [bb.max[0], bb.max[1], bb.max[2]] as const,
    },
    stats: {
      volumeMm3,
      areaMm2: solid.surfaceArea(),
      genus: solid.genus(),
      tris: mesh.numTri,
    },
  };
}

/**
 * Interleaved vertProperties (stride numProp) -> plain xyz Float32Array.
 * Shared by the preview, the STL writer and the 3MF writer, so every consumer
 * sees the same tightly-packed positions.
 */
export function deinterleave(mesh: RawMesh): Float32Array {
  if (mesh.numProp === 3) return mesh.position;
  const n = mesh.position.length / mesh.numProp;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const src = i * mesh.numProp;
    out[i * 3] = mesh.position[src]!;
    out[i * 3 + 1] = mesh.position[src + 1]!;
    out[i * 3 + 2] = mesh.position[src + 2]!;
  }
  return out;
}
