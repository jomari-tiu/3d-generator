import type { Bitmap, Mask, MaskOptions } from './types';

const ALPHA_CUTOFF = 250; // below full opacity, allowing for encoder rounding

/** Does this image carry real transparency, or is it just a rectangle? */
export function hasAlpha(bmp: Bitmap): boolean {
  const { alpha } = bmp;
  for (let i = 0; i < alpha.length; i++) if (alpha[i]! < ALPHA_CUTOFF) return true;
  return false;
}

/**
 * Does the opaque part of the image hold both dark and light artwork?
 *
 * Transparency is the right thing to key on when it is the ONLY thing marking
 * the artwork out -- a white logo on a clear background, where brightness sees
 * nothing. But a white logo knocked out of a black tile, exported with clear
 * corners, is fully opaque logo and tile alike: keyed on alpha it is one solid
 * square and the logo is gone. When the opaque pixels split into a real share
 * of dark and of light, brightness is what tells them apart.
 */
function mixedOpaque(bmp: Bitmap): boolean {
  let dark = 0;
  let light = 0;
  let opaque = 0;
  for (let i = 0; i < bmp.alpha.length; i++) {
    if (bmp.alpha[i]! < ALPHA_CUTOFF) continue;
    opaque++;
    const g = bmp.gray[i]!;
    if (g < 96) dark++;
    else if (g > 160) light++;
  }
  return opaque > 0 && dark / opaque >= 0.05 && light / opaque >= 0.05;
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
  const useAlpha = source === 'alpha' || (source === 'auto' && hasAlpha(bmp) && !mixedOpaque(bmp));
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

/**
 * Paper reachable from the image border, 4-connected: the page the artwork
 * sits on, as opposed to paper enclosed by ink. 1 = outside.
 */
function outsidePaper(mask: Mask): Uint8Array {
  const { w, h, bits } = mask;
  const out = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  const seed = (i: number): void => {
    if (bits[i] === 0 && out[i] === 0) {
      out[i] = 1;
      stack[sp++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (sp > 0) {
    const p = stack[--sp]!;
    const x = p % w;
    if (x > 0) seed(p - 1);
    if (x < w - 1) seed(p + 1);
    if (p >= w) seed(p - w);
    if (p < w * (h - 1)) seed(p + w);
  }
  return out;
}

/**
 * The paper INSIDE the ink, as ink: a light logo knocked out of a dark tile
 * comes back as the logo alone.
 *
 * Invert cannot do this. It flips the page around the tile as well, so the
 * corners of the picture become ink and the "logo" is the whole canvas. Only
 * paper the tile encloses is artwork; paper the border can reach is the page.
 */
export function removeTile(mask: Mask): Mask {
  const outside = outsidePaper(mask);
  const bits = new Uint8Array(mask.bits.length);
  for (let i = 0; i < bits.length; i++) bits[i] = mask.bits[i] === 0 && outside[i] === 0 ? 1 : 0;
  return { w: mask.w, h: mask.h, bits };
}

/**
 * Is this a light logo on a dark tile, rather than a dark logo?
 *
 * All three have to hold, because each alone also describes ordinary logos. A
 * tile is SOLID -- its outline fills its own bounding box like a square or a
 * disc does (a disc is pi/4, so 0.75 lets one through). It is mostly INK
 * inside that outline. And what it encloses keeps CLEAR of its edge: the
 * artwork sits inside a margin. A filled shield with a star in it is solid and
 * inky too, but its rings run right out to the rim, and that is what keeps it
 * a logo. And what it encloses is ARTWORK, not one plain hole: a ring is
 * solid, inky and has a clear margin too, but it is a frame to keep, and taking
 * its middle as the logo would print a disc. Artwork shows itself either by
 * its shape (a spider, a star in rings: far from filling its own box) or by
 * having dark detail inside it (a mask's eyes, the lines on a fist).
 *
 * Wrong guesses are one click to override; this only picks the default.
 */
export function looksLikeTile(mask: Mask): boolean {
  const { w, h, bits } = mask;
  const outside = outsidePaper(mask);
  let filled = 0;
  let ink = 0;
  let fx0 = w, fy0 = h, fx1 = -1, fy1 = -1;
  let hx0 = w, hy0 = h, hx1 = -1, hy1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (outside[i] === 1) continue;
      filled++;
      if (x < fx0) fx0 = x;
      if (x > fx1) fx1 = x;
      if (y < fy0) fy0 = y;
      if (y > fy1) fy1 = y;
      if (bits[i] === 1) {
        ink++;
        continue;
      }
      if (x < hx0) hx0 = x;
      if (x > hx1) hx1 = x;
      if (y < hy0) hy0 = y;
      if (y > hy1) hy1 = y;
    }
  }
  const holes = filled - ink;
  if (filled === 0 || holes === 0) return false;
  const fw = fx1 - fx0 + 1;
  const fh = fy1 - fy0 + 1;
  const solidity = filled / (fw * fh);
  const margin = Math.min(hx0 - fx0, fx1 - hx1, hy0 - fy0, fy1 - hy1) / Math.max(fw, fh);
  if (!(solidity >= 0.75 && ink / filled >= 0.5 && holes / filled >= 0.03 && margin >= 0.04)) return false;
  const holeSolidity = holes / ((hx1 - hx0 + 1) * (hy1 - hy0 + 1));
  return holeSolidity < 0.75 || ink - tileInk(mask) > filled * 0.002;
}

/**
 * Ink connected to the tile itself, 8-connected like the despeckle filter.
 * The first ink pixel in reading order is on the tile's top edge, so the flood
 * starts there; ink it cannot reach is detail floating inside the artwork.
 */
function tileInk(mask: Mask): number {
  const { w, h, bits } = mask;
  const start = bits.indexOf(1);
  if (start < 0) return 0;
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  let count = 0;
  stack[sp++] = start;
  seen[start] = 1;
  while (sp > 0) {
    const p = stack[--sp]!;
    count++;
    const x = p % w;
    const y = (p - x) / w;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= w) continue;
        const q = ny * w + nx;
        if (seen[q] === 1 || bits[q] !== 1) continue;
        seen[q] = 1;
        stack[sp++] = q;
      }
    }
  }
  return count;
}
