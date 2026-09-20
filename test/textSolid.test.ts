import { describe, expect, it } from 'vitest';
import { cleanup, kernel, loadFont, FONT_IDS } from './kernel';
import {
  EmptyTextError,
  measureTextWidth,
  missingCharacters,
  textOutline,
} from '../src/core/text/textSolid';
import type { Manifold } from 'manifold-3d';

/**
 * The golden corpus. This suite IS the specification of the text pipeline --
 * it is what stops a font quirk silently producing a broken solid.
 *
 * Strings are chosen for specific failure modes:
 *   oaB8g@   glyph counters, which must be holes rather than filled
 *   AVWA     kerning
 *   fi ffl   what would be ligatures (GSUB is bypassed, so these stay apart)
 *   AEIOU'   composite glyphs with accents
 *   W x24    a long run
 */
const STRINGS = ['Hello', 'oaB8g@', 'AVWA', 'fi ffl', 'ÀÉÎÕÜ', 'W'.repeat(24), '1234567890'];

/**
 * Counters ("holes") in a multi-glyph solid.
 *
 * Manifold's genus() is computed from the Euler characteristic of the WHOLE
 * solid, so for N disconnected glyphs it comes out as holes - (N - 1) and is
 * routinely NEGATIVE. "Hello" is 5 components with 2 counters => genus -2.
 * The hole count is therefore genus + components - 1.
 */
function holeCount(solid: Manifold): number {
  return solid.genus() + solid.decompose().length - 1;
}

describe('text -> solid', () => {
  it('produces a valid watertight solid for every bundled font x string', async () => {
    const m = await kernel();
    try {
      for (const id of FONT_IDS) {
        const font = loadFont(id);
        for (const text of STRINGS) {
          const label = `${id} / "${text.slice(0, 12)}"`;
          const section = textOutline(m, font, { text, capHeightMm: 10 });
          expect(section.area(), `${label}: outline area`).toBeGreaterThan(0);

          const solid = section.extrude(2);
          expect(solid.status(), `${label}: status`).toBe('NoError');
          expect(solid.volume(), `${label}: volume`).toBeGreaterThan(0);
          expect(solid.numTri(), `${label}: triangles`).toBeGreaterThan(0);
          // Counters can never be negative, whatever the component count.
          expect(holeCount(solid), `${label}: hole count`).toBeGreaterThanOrEqual(0);
        }
      }
    } finally {
      cleanup();
    }
  });

  it('hollows glyph counters rather than filling them', async () => {
    const m = await kernel();
    try {
      const font = loadFont('inter-bold');
      const holes = (text: string) =>
        holeCount(textOutline(m, font, { text, capHeightMm: 10 }).extrude(2));

      // Single glyphs: exact, and the tightest possible check on the fill rule.
      expect(holes('I'), 'I has no counter').toBe(0);
      expect(holes('O'), 'O has one counter').toBe(1);
      expect(holes('B'), 'B has two counters').toBe(2);
      expect(holes('8'), '8 has two counters').toBe(2);
      expect(holes('a'), 'a has one counter').toBe(1);

      // Multi-glyph: counters must survive the cross-glyph union.
      expect(holes('Hello'), 'Hello: e + o').toBe(2);
      expect(holes('OOO'), 'three O counters').toBe(3);
      expect(holes('1234567890')).toBeGreaterThanOrEqual(4);
    } finally {
      cleanup();
    }
  });

  it('rejects text with no printable outline', async () => {
    const m = await kernel();
    try {
      const font = loadFont('inter-bold');
      for (const text of ['', '   ', '\n', '\t\r']) {
        expect(
          () => textOutline(m, font, { text, capHeightMm: 10 }),
          `${JSON.stringify(text)} should be rejected`,
        ).toThrow(EmptyTextError);
      }
    } finally {
      cleanup();
    }
  });

  it('detects characters the font cannot render', async () => {
    const font = loadFont('inter-bold');
    // The bundled faces are latin-subset, so CJK is genuinely absent.
    expect(missingCharacters(font, '日本語')).toEqual(['日', '本', '語']);
    expect(missingCharacters(font, 'Hello')).toEqual([]);
    // Control characters are stripped, not reported as missing glyphs.
    expect(missingCharacters(font, 'A\nB')).toEqual([]);
  });

  it('applies cap height so text is the size the user asked for', async () => {
    const m = await kernel();
    try {
      for (const id of FONT_IDS) {
        const b = textOutline(m, loadFont(id), { text: 'H', capHeightMm: 10 }).bounds();
        const height = b.max[1] - b.min[1];
        // 'H' is flat-topped, so its height IS the cap height.
        expect(height, `${id}: cap height`).toBeGreaterThan(9.3);
        expect(height, `${id}: cap height`).toBeLessThan(10.7);
      }
    } finally {
      cleanup();
    }
  });

  it('honours letter spacing', async () => {
    const m = await kernel();
    try {
      const font = loadFont('inter-bold');
      const base = measureTextWidth(font, { text: 'AAAA', capHeightMm: 10 });
      const spaced = measureTextWidth(font, { text: 'AAAA', capHeightMm: 10, letterSpacingMm: 2 });
      expect(spaced - base, 'three gaps between four glyphs').toBeCloseTo(6, 1);
    } finally {
      cleanup();
    }
  });
});
