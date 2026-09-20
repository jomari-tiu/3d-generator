// The ONLY module that talks to the Manifold WASM kernel.
//
// Memory discipline (this is load-bearing -- read before editing):
//   * Manifold objects are NOT garbage collected. Each needs delete().
//   * manifold's own lib/garbage-collector patches the whitelisted STATIC
//     factories and PROTOTYPE methods so their results land in one registry
//     that cleanup() drains. It does NOT cover the `new CrossSection(...)` /
//     `new Manifold(...)` CONSTRUCTORS -- those leak.
//     => Always prefer the static factories (CrossSection.ofPolygons,
//        CrossSection.circle/square, Manifold.cube/extrude/...). See xsec().
//   * cleanup() is all-or-nothing across one global registry, so NEVER cache a
//     Manifold or CrossSection between builds. Cache flattened Vec2 rings
//     instead -- those are plain JS.
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { setWasmUrl, getManifoldModule } from 'manifold-3d/lib/wasm';
import { garbageCollectManifold, cleanup } from 'manifold-3d/lib/garbage-collector';
import type { ManifoldToplevel, CrossSection, FillRule, Polygons } from 'manifold-3d';

/** Tessellation defaults, matched to a 0.4mm nozzle. */
const MIN_CIRCULAR_ANGLE = 6; // deg -> ~60 segments per full circle
const MIN_CIRCULAR_EDGE = 0.15; // mm

let ready: Promise<ManifoldToplevel> | null = null;

function initKernel(): Promise<ManifoldToplevel> {
  if (ready) return ready;
  // Never rely on manifold's default wasm resolution: handing it the
  // Vite-fingerprinted asset URL is what keeps the production build working.
  setWasmUrl(wasmUrl);
  ready = getManifoldModule().then((m: ManifoldToplevel) => {
    garbageCollectManifold(m);
    m.setMinCircularAngle(MIN_CIRCULAR_ANGLE);
    m.setMinCircularEdgeLength(MIN_CIRCULAR_EDGE);
    return m;
  });
  return ready;
}

/** Warm the kernel without building anything (used at boot). */
export function warmKernel(): Promise<void> {
  return initKernel().then(() => undefined);
}

/**
 * Run one build inside an arena. Everything the kernel allocated during `fn`
 * is freed on exit, so `fn` MUST fully serialize its results into plain
 * TypedArrays before returning. Never let a Manifold escape this callback.
 */
export async function withArena<T>(fn: (m: ManifoldToplevel) => T | Promise<T>): Promise<T> {
  const m = await initKernel();
  try {
    return await fn(m);
  } finally {
    cleanup();
  }
}

/**
 * Build a CrossSection from rings. Uses the STATIC factory rather than
 * `new CrossSection(...)` precisely because the static one is covered by
 * manifold's garbage collector -- see the memory note at the top.
 */
export function xsec(m: ManifoldToplevel, rings: Polygons, fill: FillRule = 'NonZero'): CrossSection {
  return m.CrossSection.ofPolygons(rings, fill);
}
