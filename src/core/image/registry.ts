import type { Bitmap } from './types';

export interface ImageEntry {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

/**
 * Content hash of a decoded bitmap, used as its id.
 *
 * Content-addressed rather than counter-addressed so that dropping the same
 * file in twice is the same image, and so that a permalink carries something
 * that still means the same picture tomorrow. Two 32-bit FNV-1a passes with
 * different offset bases, concatenated: a counter would collide across
 * sessions, which is the failure that actually matters here.
 *
 * Every fourth byte is sampled rather than all of them. A 600x600 image is
 * 720KB of channel data and this runs on the UI thread at drop time; the
 * dimensions and the stride make an accidental collision between two images a
 * user would ever have at once far less likely than one they would notice.
 */
export function imageId(bmp: Bitmap): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  const mix = (v: number): void => {
    a = Math.imul(a ^ v, 0x01000193) >>> 0;
    b = Math.imul(b ^ (v + 0x9e37), 0x85ebca6b) >>> 0;
  };
  mix(bmp.width);
  mix(bmp.height);
  for (let i = 0; i < bmp.gray.length; i += 4) mix(bmp.gray[i]!);
  for (let i = 0; i < bmp.alpha.length; i += 4) mix(bmp.alpha[i]!);
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/**
 * Decoded bitmaps by id, with an optional async loader behind it.
 *
 * Deliberately shaped like FontRegistry: peek() for a synchronous look inside a
 * build, load() for the runner to await before one. The loader is injected
 * because fetching a stored image is a browser concern (IndexedDB) and nothing
 * under src/core is allowed to know about the browser.
 */
export class ImageRegistry {
  private readonly bitmaps = new Map<string, Bitmap>();
  private readonly inflight = new Map<string, Promise<Bitmap | undefined>>();

  constructor(private readonly loader?: (id: string) => Promise<Bitmap | undefined>) {}

  list(): readonly ImageEntry[] {
    return [...this.bitmaps.entries()].map(([id, b]) => ({
      id,
      name: b.name ?? id,
      width: b.width,
      height: b.height,
    }));
  }

  peek(id: string): Bitmap | undefined {
    return this.bitmaps.get(id);
  }

  get(id: string): Bitmap {
    const b = this.bitmaps.get(id);
    if (!b) throw new Error(`Image not loaded: ${id}`);
    return b;
  }

  has(id: string): boolean {
    return this.bitmaps.has(id);
  }

  add(bmp: Bitmap): ImageEntry {
    const id = imageId(bmp);
    this.bitmaps.set(id, bmp);
    return { id, name: bmp.name ?? id, width: bmp.width, height: bmp.height };
  }

  remove(id: string): void {
    this.bitmaps.delete(id);
  }

  /**
   * Resolve an id that is not in memory yet, e.g. one arriving in a permalink
   * after a reload. Resolves to undefined rather than throwing when the image
   * simply is not on this machine -- that is an ordinary thing for a shared
   * link to mean, and the generator reports it as a missing image rather than
   * as a build failure.
   */
  async load(id: string): Promise<Bitmap | undefined> {
    const hit = this.bitmaps.get(id);
    if (hit) return hit;
    if (!this.loader) return undefined;

    const pending = this.inflight.get(id);
    if (pending) return pending;

    const p = this.loader(id)
      .then((bmp) => {
        if (bmp) this.bitmaps.set(id, bmp);
        return bmp;
      })
      .catch(() => undefined)
      .finally(() => this.inflight.delete(id));
    this.inflight.set(id, p);
    return p;
  }
}
