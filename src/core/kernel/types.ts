/** A kernel mesh copied out of the WASM heap into plain TypedArrays. */
export interface RawMesh {
  /** Interleaved vertex properties, stride = numProp. First 3 props are x,y,z. */
  readonly position: Float32Array;
  readonly index: Uint32Array;
  readonly numProp: number;
  readonly bbox: { min: readonly [number, number, number]; max: readonly [number, number, number] };
  readonly stats: {
    readonly volumeMm3: number;
    readonly areaMm2: number;
    readonly genus: number;
    readonly tris: number;
  };
}

export class KernelError extends Error {
  constructor(
    readonly status: string,
    message?: string,
  ) {
    super(message ?? `Manifold reported status: ${status}`);
    this.name = 'KernelError';
  }
}
