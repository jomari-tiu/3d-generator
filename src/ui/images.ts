import type { Bitmap } from '../core/image/types';

const DB_NAME = '3dgen.images.v1';
const STORE = 'bitmaps';
/** How many dropped images to keep. Enough to flick between a few, not a library. */
const KEEP = 12;

/**
 * File -> Bitmap. The ONE place in the project that turns pixels into numbers,
 * and the reason everything under src/core/image can stay DOM-free: decoding
 * needs a canvas, tracing does not.
 *
 * Downscaled to `maxDim` on the way in rather than at trace time. Past a few
 * hundred pixels of subject, more resolution stops adding shape and starts
 * adding JPEG ringing for the despeckle filter to take back out -- and every
 * one of those pixels would otherwise be walked again on every slider drag.
 */
export async function decodeImageFile(file: File, maxDim: number): Promise<Bitmap> {
  const source = await loadDrawable(file);
  const sw = source.width;
  const sh = source.height;
  if (!(sw > 0) || !(sh > 0)) throw new Error('That file did not decode to an image.');

  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('This browser would not give us a canvas to read the image with.');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(source.image as CanvasImageSource, 0, 0, w, h);
  if ('close' in source.image && typeof source.image.close === 'function') source.image.close();
  if (source.revoke) URL.revokeObjectURL(source.revoke);

  let data: Uint8ClampedArray;
  try {
    data = g.getImageData(0, 0, w, h).data;
  } catch {
    // Canvas tainting. Only reachable for a cross-origin source, which a
    // file drop is not, but a clear message beats a SecurityError.
    throw new Error('That image could not be read back out of the canvas.');
  }

  const n = w * h;
  const gray = new Uint8Array(n);
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const a = data[o + 3]!;
    alpha[i] = a;
    // Composite over WHITE before measuring brightness. Left un-composited, a
    // transparent PNG reads as black wherever it is empty, and the brightness
    // threshold then treats the empty half of a logo as solid ink.
    const t = a / 255;
    const u = 255 * (1 - t);
    const r = data[o]! * t + u;
    const gr = data[o + 1]! * t + u;
    const b = data[o + 2]! * t + u;
    gray[i] = (0.2126 * r + 0.7152 * gr + 0.0722 * b) | 0;
  }

  return { width: w, height: h, gray, alpha, name: file.name };
}

interface Drawable {
  readonly image: CanvasImageSource & { close?: () => void };
  readonly width: number;
  readonly height: number;
  readonly revoke?: string;
}

/**
 * createImageBitmap where it works, an <img> element where it does not.
 *
 * Both paths are needed. createImageBitmap is the fast one and is the only one
 * that applies EXIF orientation for us, so a photo taken sideways traces the
 * right way up -- but it rejects SVG sources in some browsers, and an SVG is a
 * perfectly reasonable thing to drop into an image tracer.
 */
async function loadDrawable(file: File): Promise<Drawable> {
  if (typeof createImageBitmap === 'function' && file.type !== 'image/svg+xml') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { image: bmp, width: bmp.width, height: bmp.height };
    } catch {
      // Fall through to the <img> path.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('That file is not an image this browser can read.'));
      el.src = url;
    });
    // An SVG with no intrinsic size reports 0 here; give it something to be.
    const width = img.naturalWidth || img.width || 512;
    const height = img.naturalHeight || img.height || 512;
    return { image: img, width, height, revoke: url };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

interface StoredBitmap {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly gray: Uint8Array;
  readonly alpha: Uint8Array;
  readonly at: number;
}

/**
 * Dropped images, kept in IndexedDB.
 *
 * They are stored for one reason: every other configuration in this app
 * survives a reload, because it is in the URL. A picture cannot go in a URL, so
 * without this a refresh would silently empty the one control the whole
 * generator is about. IndexedDB rather than localStorage because these are
 * TypedArrays measured in hundreds of kilobytes, which localStorage would have
 * to base64 and would then refuse.
 *
 * Every method swallows its failures. Private browsing, a blocked origin and a
 * full quota all show up here, and none of them is a reason to stop tracing the
 * image the user just dropped in -- it only means it will not still be there
 * tomorrow.
 */
export class ImageStore {
  private db: Promise<IDBDatabase | null> | null = null;

  private open(): Promise<IDBDatabase | null> {
    if (this.db) return this.db;
    this.db = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') return resolve(null);
      let req: IDBOpenDBRequest;
      try {
        req = indexedDB.open(DB_NAME, 1);
      } catch {
        return resolve(null);
      }
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
    return this.db;
  }

  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | null> {
    const db = await this.open();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => resolve(null);
        t.onabort = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async get(id: string): Promise<Bitmap | undefined> {
    const row = await this.tx<StoredBitmap | undefined>('readonly', (s) => s.get(id));
    if (!row) return undefined;
    return {
      width: row.width,
      height: row.height,
      // Copy out of whatever IndexedDB handed back, so the caller owns plain
      // arrays it can keep for the life of the session.
      gray: new Uint8Array(row.gray),
      alpha: new Uint8Array(row.alpha),
      name: row.name,
    };
  }

  async put(id: string, bmp: Bitmap): Promise<void> {
    const row: StoredBitmap = {
      id,
      name: bmp.name ?? id,
      width: bmp.width,
      height: bmp.height,
      gray: bmp.gray,
      alpha: bmp.alpha,
      at: Date.now(),
    };
    await this.tx('readwrite', (s) => s.put(row));
    await this.prune();
  }

  async remove(id: string): Promise<void> {
    await this.tx('readwrite', (s) => s.delete(id));
  }

  /** Ids held, newest first. */
  async list(): Promise<{ id: string; name: string; at: number }[]> {
    const rows = await this.tx<StoredBitmap[]>('readonly', (s) => s.getAll());
    if (!rows) return [];
    return rows
      .map((r) => ({ id: r.id, name: r.name, at: r.at }))
      .sort((a, b) => b.at - a.at);
  }

  private async prune(): Promise<void> {
    const rows = await this.list();
    for (const row of rows.slice(KEEP)) await this.remove(row.id);
  }
}
