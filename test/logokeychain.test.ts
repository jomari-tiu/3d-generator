import { describe, expect, it } from 'vitest';
import type { ManifoldToplevel } from 'manifold-3d';
import { cleanup, kernel, loadFont } from './kernel';
import { bitmapOf, disc } from './traceFixtures';
import { imageId } from '../src/core/image/registry';
import { inkCount, looksLikeTile, removeTile, toMask } from '../src/core/image/mask';
import type { Bitmap } from '../src/core/image/types';
import { logoKeychainGenerator } from '../src/generators/logokeychain/build';
import { coerceAll, defaultsOf } from '../src/core/params/validate';
import type { BuildCtx, BuildResult, Params } from '../src/core/params/types';

function ctxFor(m: ManifoldToplevel, bmp?: Bitmap): BuildCtx {
  return { m, font: (id) => loadFont(id), image: () => bmp, tolerance: 0.02, issue: () => {} };
}

function paramsWith(patch: Params = {}): Params {
  return coerceAll(logoKeychainGenerator, { ...defaultsOf(logoKeychainGenerator), ...patch });
}

const messagesOf = (r: BuildResult, level: 'error' | 'warn'): string[] =>
  r.issues.filter((i) => i.level === level).map((i) => i.message);

/** Two blobs well apart: neither touches the other, and at 60% neither reaches the rim. */
const twoBlobs = bitmapOf([
  '####......####',
  '####......####',
  '####......####',
  '####......####',
]);

async function withKernel(fn: (m: ManifoldToplevel) => void): Promise<void> {
  const m = await kernel();
  try {
    fn(m);
  } finally {
    cleanup();
  }
}

describe('logo keychain', () => {
  it('asks for a logo before it has one', () => {
    const issues = logoKeychainGenerator.validate?.(paramsWith()) ?? [];
    expect(issues.some((i) => i.level === 'error' && i.paramIds?.includes('image'))).toBe(true);
    expect(logoKeychainGenerator.imagesNeeded?.(paramsWith({ image: 'abc' }))).toEqual(['abc']);
  });

  it('refuses a rim that leaves no opening, and a backing as thick as the whole', () => {
    const rim = logoKeychainGenerator.validate?.(paramsWith({ image: 'x', size: 20, rim: 8 })) ?? [];
    expect(rim.some((i) => i.level === 'error' && i.paramIds?.includes('rim'))).toBe(true);
    const back =
      logoKeychainGenerator.validate?.(paramsWith({ image: 'x', style: 'backed', thickness: 2, backThickness: 2 })) ?? [];
    expect(back.some((i) => i.level === 'error' && i.paramIds?.includes('backThickness'))).toBe(true);
  });

  it('ties floating pieces of an open logo to the rim', () =>
    withKernel((m) => {
      const out = logoKeychainGenerator.build(
        paramsWith({ image: imageId(twoBlobs), logoSize: 60, despeckle: 0 }),
        ctxFor(m, twoBlobs),
      );
      expect(messagesOf(out, 'error')).toEqual([]);
      expect(messagesOf(out, 'warn').join(' ')).not.toMatch(/loose|fall out/);
      expect(out.readouts?.Pieces).toMatch(/^One/);
      expect(Number(out.readouts?.Ties)).toBeGreaterThanOrEqual(2);
      // Frame and logo share a colour by default, so they are one solid part.
      expect(out.parts.map((p) => p.id)).toEqual(['keychain']);
      expect(out.parts[0]!.mesh.stats.volumeMm3).toBeGreaterThan(0);
    }));

  it('splits the logo out only when it is a different colour', () =>
    withKernel((m) => {
      const out = logoKeychainGenerator.build(
        paramsWith({ image: imageId(twoBlobs), logoSize: 60, despeckle: 0, logoColor: '#c8262c' }),
        ctxFor(m, twoBlobs),
      );
      expect(out.parts.map((p) => p.id)).toEqual(['frame', 'logo']);
      expect(out.parts.map((p) => p.color)).toEqual(['#1d1f24', '#c8262c']);
      expect(new Set(out.parts.map((p) => p.group)).size).toBe(1);
      for (const part of out.parts) expect(part.mesh.stats.volumeMm3).toBeGreaterThan(0);
    }));

  it('says so when floating pieces are left untied', () =>
    withKernel((m) => {
      const out = logoKeychainGenerator.build(
        paramsWith({ image: imageId(twoBlobs), logoSize: 60, despeckle: 0, bridges: false }),
        ctxFor(m, twoBlobs),
      );
      expect(messagesOf(out, 'warn').join(' ')).toMatch(/2 pieces of the logo touch nothing/);
    }));

  it('stands the logo on a backing disc, which needs no ties', () =>
    withKernel((m) => {
      const out = logoKeychainGenerator.build(
        paramsWith({ image: imageId(twoBlobs), style: 'backed', logoSize: 60, despeckle: 0 }),
        ctxFor(m, twoBlobs),
      );
      expect(out.parts.map((p) => p.id)).toEqual(['backing', 'frame-logo']);
      expect(out.readouts?.Pieces).toMatch(/^One/);
      expect(out.readouts?.Ties).toBeUndefined();
      expect(new Set(out.parts.map((p) => p.group)).size).toBe(1);
    }));

  it('keeps a black frame and backing out of the space the white logo fills', () =>
    withKernel((m) => {
      // Backing and frame one colour, the logo another. Raising the backing's
      // outline to full height alongside the logo once made the two bodies
      // overlap by the logo's whole volume, which shows as z-fighting streaks.
      const ring = disc(96, 40, 20);
      for (const shape of ['circle', 'square']) {
        const out = logoKeychainGenerator.build(
          paramsWith({
            image: imageId(ring), style: 'backed', shape, size: 45, rim: 2.5, thickness: 3.6, backThickness: 2.4,
            logoSize: 80, hanger: 'none', frameColor: '#111111', backColor: '#111111', logoColor: '#ffffff',
          }),
          ctxFor(m, ring),
        );
        expect(out.parts.map((p) => p.color)).toEqual(['#111111', '#ffffff']);
        const tile = (shape === 'circle' ? (Math.PI * 45 * 45) / 4 : 45 * 45) * 3.6;
        const sum = out.parts.reduce((t, p) => t + p.mesh.stats.volumeMm3, 0);
        expect(sum).toBeLessThan(tile);
      }
    }));

  it('ties in the counter a cut-out leaves behind', () =>
    withKernel((m) => {
      // A ring cut out of the disc leaves its middle as an island.
      const ring = disc(96, 40, 20);
      const out = logoKeychainGenerator.build(
        paramsWith({ image: imageId(ring), style: 'cutout', logoSize: 80 }),
        ctxFor(m, ring),
      );
      expect(out.parts).toHaveLength(1);
      expect(out.readouts?.Pieces).toMatch(/^One/);
      expect(Number(out.readouts?.Ties)).toBe(1);
    }));

  it('hangs a holed loop above the frame', () =>
    withKernel((m) => {
      const bmp = disc(64, 26, 0);
      for (const hanger of ['cap', 'loop']) {
        const out = logoKeychainGenerator.build(
          paramsWith({ image: imageId(bmp), hanger, size: 50, logoColor: '#ffffff' }),
          ctxFor(m, bmp),
        );
        const [w, h] = out.readouts!.Size!.split(' x ').map(Number);
        expect(w).toBeCloseTo(50, 0);
        expect(h).toBeGreaterThan(55);
        expect(out.readouts?.Pieces).toMatch(/^One/);
        // The hole goes through the frame body: one more handle than the rim alone.
        expect(out.parts.find((p) => p.id === 'frame')!.mesh.stats.genus).toBe(2);
      }
      const bare = logoKeychainGenerator.build(paramsWith({ image: imageId(bmp), hanger: 'none', size: 50 }), ctxFor(m, bmp));
      expect(Number(bare.readouts!.Size!.split(' x ')[1])).toBeCloseTo(50, 0);
    }));

  it('makes a rounded rectangle to the width and height asked for, the logo fitted inside', () =>
    withKernel((m) => {
      const bar = bitmapOf(['##########', '##########']);
      // Long side 60 and short 30, both ways up.
      for (const [orientation, w, h] of [['horizontal', 60, 30], ['vertical', 30, 60]] as const) {
        const out = logoKeychainGenerator.build(
          paramsWith({
            image: imageId(bar), shape: 'rectangle', orientation, size: 60, height: 30, rim: 2, hanger: 'none', logoSize: 100,
          }),
          ctxFor(m, bar),
        );
        expect(messagesOf(out, 'error')).toEqual([]);
        const [sw, sh] = out.readouts!.Size!.split(' x ').map(Number);
        expect(sw).toBeCloseTo(w, 0);
        expect(sh).toBeCloseTo(h, 0);
        // The 5:1 bar runs out of width first, so it spans the opening across.
        expect(Number(out.readouts!.Logo!.split(' x ')[0])).toBeCloseTo(w - 4, 0);
        expect(out.readouts?.Pieces).toMatch(/^One/);
      }
      const tight = logoKeychainGenerator.validate?.(paramsWith({ image: 'x', shape: 'rectangle', size: 60, height: 20, rim: 8 })) ?? [];
      expect(tight.some((i) => i.level === 'error' && i.paramIds?.includes('height'))).toBe(true);
    }));

  it('trims a wide logo at the rim, or lets it stick out', () =>
    withKernel((m) => {
      const bar = bitmapOf(['##########', '##########']);
      const size = (overflow: string): number => {
        const out = logoKeychainGenerator.build(
          paramsWith({ image: imageId(bar), overflow, logoSize: 150, size: 40, hanger: 'none' }),
          ctxFor(m, bar),
        );
        return Number(out.readouts!.Size!.split(' x ')[0]);
      };
      expect(size('clip')).toBeCloseTo(40, 0);
      expect(size('extend')).toBeGreaterThan(45);
    }));

  it('exports the outline as an SVG', () =>
    withKernel((m) => {
      const bmp = disc(64, 26, 0);
      const out = logoKeychainGenerator.build(paramsWith({ image: imageId(bmp) }), ctxFor(m, bmp));
      expect(out.vectors?.find((v) => v.id === 'svg')?.data).toContain('<path');
    }));

});

describe('a light logo on a dark tile', () => {
  // A black rounded-off square with a white plus knocked out of it, inside a
  // margin -- the reference sheet's tiles, in miniature.
  const tile = bitmapOf([
    '..................',
    '..##############..',
    '.################.',
    '.######....######.',
    '.######....######.',
    '.######....######.',
    '.###..........###.',
    '.###..........###.',
    '.###..........###.',
    '.######....######.',
    '.######....######.',
    '.######....######.',
    '.################.',
    '..##############..',
    '..................',
  ]);
  const mask = (b: Bitmap) => toMask(b, { threshold: 50 });

  it('is told apart from a dark logo, a plain ring and a solid shape', () => {
    expect(looksLikeTile(mask(tile))).toBe(true);
    expect(looksLikeTile(mask(disc(96, 40, 20)))).toBe(false);
    expect(looksLikeTile(mask(disc(64, 26, 0)))).toBe(false);
    expect(looksLikeTile(mask(twoBlobs))).toBe(false);
    // A compact white face -- as square as a ring's hole -- with dark eyes in
    // it: the eyes are what make it artwork rather than a ring.
    const face = bitmapOf([
      '..................',
      '.################.',
      '.################.',
      '.###..........###.',
      '.###..........###.',
      '.###..##..##..###.',
      '.###..........###.',
      '.###..........###.',
      '.###..........###.',
      '.###..........###.',
      '.################.',
      '.################.',
      '..................',
    ]);
    expect(looksLikeTile(mask(face))).toBe(true);
  });

  it('comes back as the logo alone, with the page around the tile left out', () => {
    const out = removeTile(mask(tile));
    // The plus: 3 arms of 4x3 and a 3x8... counted rather than drawn.
    expect(inkCount(out)).toBe(mask(tile).bits.length - inkCount(mask(tile)) - outsideCount(tile));
    expect(out.bits[0]).toBe(0);
    expect(out.bits[7 * 18 + 8]).toBe(1);
  });

  it('traces the white logo, not the black square, when left to work it out', () =>
    withKernel((m) => {
      const go = (background: string) =>
        logoKeychainGenerator.build(
          paramsWith({ image: imageId(tile), background, despeckle: 0, logoSize: 100, size: 40, rim: 2, hanger: 'none' }),
          ctxFor(m, tile),
        );
      const auto = go('auto');
      expect(auto.readouts?.Background).toBe('Dark tile removed');
      expect(go('keep').readouts?.Background).toBeUndefined();
      // Working it out lands on exactly the tile reading, and that is not the
      // same model as tracing the square.
      const volume = (r: BuildResult) => r.parts.reduce((t, p) => t + p.mesh.stats.volumeMm3, 0);
      expect(volume(auto)).toBeCloseTo(volume(go('tile')), 3);
      expect(Math.abs(volume(auto) - volume(go('keep')))).toBeGreaterThan(100);
    }));
});

/** Paper pixels the border can reach, for checking removeTile's arithmetic. */
function outsideCount(b: Bitmap): number {
  const m = toMask(b, { threshold: 50 });
  const inverse = removeTile({ ...m, bits: m.bits });
  let paper = 0;
  for (let i = 0; i < m.bits.length; i++) if (m.bits[i] === 0) paper++;
  return paper - inkCount(inverse);
}

describe('reading a tile exported with clear corners', () => {
  it('keys on brightness when the opaque part is both dark and light', () => {
    // Black tile, white plus, transparent page round it: alpha alone would
    // read the whole tile as one solid square.
    const rows = ['......', '.####.', '.#..#.', '.####.', '......'];
    const gray = new Uint8Array(30).fill(255);
    const alpha = new Uint8Array(30);
    rows.forEach((r, y) =>
      [...r].forEach((c, x) => {
        const inside = y >= 1 && y <= 3 && x >= 1 && x <= 4;
        alpha[y * 6 + x] = inside ? 255 : 0;
        if (c === '#') gray[y * 6 + x] = 0;
      }),
    );
    const bmp: Bitmap = { width: 6, height: 5, gray, alpha };
    expect(inkCount(toMask(bmp, { threshold: 50 }))).toBe(10);
  });
});
