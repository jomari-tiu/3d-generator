// Node-side kernel + font loading for tests.
//
// Tests talk to manifold directly rather than through src/core/kernel/manifold.ts:
// that module imports the wasm via Vite's `?url`, which is a browser concern.
// The memory discipline is the same -- cleanup() after every build.
import Module from 'manifold-3d';
import { garbageCollectManifold, cleanup } from 'manifold-3d/lib/garbage-collector';
import type { ManifoldToplevel } from 'manifold-3d';
import { parse, type Font } from 'opentype.js';
import { existsSync, readFileSync } from 'node:fs';

let cached: ManifoldToplevel | null = null;

export async function kernel(): Promise<ManifoldToplevel> {
  if (cached) return cached;
  const m = await Module();
  // setup() installs the Manifold/CrossSection classes. lib/wasm does this for
  // the app; here we call Module() directly, so it is ours to do.
  m.setup();
  garbageCollectManifold(m);
  m.setMinCircularAngle(6);
  m.setMinCircularEdgeLength(0.15);
  cached = m;
  return m;
}

export { cleanup };

export const FONT_IDS = [
  'inter-bold',
  'roboto-slab-bold',
  'bebas-neue',
  'nunito-extrabold',
  'pacifico',
] as const;

const fonts = new Map<string, Font>();

export function loadFont(id: string): Font {
  const hit = fonts.get(id);
  if (hit) return hit;
  // Bundled faces are .woff, except where the family ships as .ttf.
  const buf = existsSync(`public/fonts/${id}.woff`) ? readFileSync(`public/fonts/${id}.woff`) : readFileSync(`public/fonts/${id}.ttf`);
  const font = parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  fonts.set(id, font);
  return font;
}
