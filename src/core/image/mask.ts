import type { Bitmap, Mask, MaskOptions } from './types';

const ALPHA_CUTOFF = 250; // below full opacity, allowing for encoder rounding

/** Does this image carry real transparency, or is it just a rectangle? */
export function hasAlpha(bmp: Bitmap): boolean {
  const { alpha } = bmp;
  for (let i = 0; i < alpha.length; i++) if (alpha[i]! < ALPHA_CUTOFF) return true;
  return false;
}

/**
 * Threshold a bitmap into ink/paper.
 *
 * The threshold reads the same way in both channels -- higher means more ink --
 * even though the underlying comparisons point opposite ways: a LOW luminance
 * is ink, a HIGH alpha is ink. Flipping the alpha comparison here is what keeps
 * one slider honest across both sources; doing it any other way makes the
 * control run backwards the moment "auto" switches channels under the user.
 */
export function toMask(bmp: Bitmap, opts: MaskOptions): Mask {
  const w = bmp.width;
  const h = bmp.height;
  const n = w * h;
  const bits = new Uint8Array(n);

  const source = opts.source ?? 'auto';
  const useAlpha = source === 'alpha' || (source === 'auto' && hasAlpha(bmp));
  const t = Math.min(100, Math.max(0, opts.threshold)) / 100;
  const invert = opts.invert === true;

  if (useAlpha) {
    // Inverted cut, so that raising the slider still means MORE ink: it has to
    // reach further DOWN the alpha channel to do it.
    const cut = (1 - t) * 255;
    const a = bmp.alpha;
    for (let i = 0; i < n; i++) bits[i] = a[i]! > cut ? 1 : 0;
  } else {
    const cut = t * 255;
    const g = bmp.gray;
    for (let i = 0; i < n; i++) bits[i] = g[i]! < cut ? 1 : 0;
  }

  if (invert) for (let i = 0; i < n; i++) bits[i] = bits[i] === 1 ? 0 : 1;

  const mask: Mask = { w, h, bits };
  const speck = Math.max(0, Math.round(opts.despeckle ?? 0));
  return speck > 0 ? despeckle(mask, speck) : mask;
}

/** Ink pixels in a mask. */
export function inkCount(mask: Mask): number {
  let c = 0;
  for (let i = 0; i < mask.bits.length; i++) c += mask.bits[i]!;
  return c;
}

/**
 * Remove ink blobs and interior holes below `minPx` pixels, in place on a copy.
 *
 * Both directions matter and for different reasons: stray ink blobs are JPEG
 * noise and dust off a scan, and each one becomes its own loose 0.2mm shard on
 * the plate; pinholes are the same noise inverted, and each one becomes a ring
 * the slicer has to trace around for nothing.
 *
 * Ink is 8-connected and paper 4-connected, matching the 'connect' diagonal
 * policy in the tracer: if the contour is going to weld a diagonal touch into
 * one body, the speck filter has to have counted it as one body too, or a
 * diagonal chain of single pixels gets culled piece by piece as "specks" and
 * the stroke it belonged to vanishes.
 *
 * Background regions touching the border are the paper the image sits on, never
 * a hole, so they are exempt however small a sliver they are.
 */
export function despeckle(mask: Mask, minPx: number): Mask {
  const { w, h } = mask;
  const bits = Uint8Array.from(mask.bits);
  const n = w * h;
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  const blob = new Int32Array(n);

  for (let start = 0; start < n; start++) {
    if (seen[start] === 1) continue;
    const value = bits[start]!;
    const eight = value === 1;

    let sp = 0;
    let count = 0;
    let touchesBorder = false;
    stack[sp++] = start;
    seen[start] = 1;

    while (sp > 0) {
      const p = stack[--sp]!;
      blob[count++] = p;
      const x = p % w;
      const y = (p - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesBorder = true;

      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (!eight && dx !== 0 && dy !== 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (seen[q] === 1 || bits[q] !== value) continue;
          seen[q] = 1;
          stack[sp++] = q;
        }
      }
    }

    if (count >= minPx) continue;
    if (value === 0 && touchesBorder) continue;
    const flipped = value === 1 ? 0 : 1;
    for (let i = 0; i < count; i++) bits[blob[i]!] = flipped;
  }

  return { w, h, bits };
}
