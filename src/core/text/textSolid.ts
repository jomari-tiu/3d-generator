import type { Font, Glyph } from 'opentype.js';
import type { CrossSection, ManifoldToplevel } from 'manifold-3d';
import { commandsToRings, type Vec2 } from './flatten';
import { xsec } from '../kernel/manifold';

export const DEFAULT_TOLERANCE = 0.02; // mm, half a typical slicer XY resolution

export interface TextOutlineOpts {
  readonly text: string;
  /** Cap height in mm -- what the user actually thinks of as "text size". */
  readonly capHeightMm: number;
  /** Extra space between glyphs, in mm. Negative tightens. */
  readonly letterSpacingMm?: number;
  /** Bezier flattening tolerance in mm. */
  readonly tolerance?: number;
  /** Centre the result on the origin. Default true. */
  readonly center?: boolean;
}

export class EmptyTextError extends Error {
  constructor() {
    super('Text produced no printable outline.');
    this.name = 'EmptyTextError';
  }
}

/**
 * Font units -> mm scale such that the cap height lands on capHeightMm.
 * getPath scales by fontSize / unitsPerEm, so passing this as `fontSize`
 * puts the output directly in millimetres.
 */
export function fontSizeForCapHeight(font: Font, capHeightMm: number): number {
  const upm = font.unitsPerEm;
  // sCapHeight is the right metric but is absent or zero in plenty of fonts;
  // 0.7 * ascender is the conventional stand-in.
  const cap = font.tables.os2?.sCapHeight || font.ascender * 0.7;
  return (capHeightMm * upm) / cap;
}

interface PlacedGlyph {
  readonly glyph: Glyph;
  /** Pen position in mm. */
  readonly x: number;
}

function isControl(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return cp < 0x20 || (cp >= 0x7f && cp <= 0x9f);
}

/**
 * Characters the font has no glyph for. Glyph index 0 is .notdef by
 * convention, and it usually has a box outline -- so without this check a
 * missing character prints as a solid rectangle with no warning.
 */
export function missingCharacters(font: Font, text: string): string[] {
  const missing = new Set<string>();
  for (const ch of text) {
    if (isControl(ch) || ch === ' ') continue;
    try {
      if (font.charToGlyph(ch).index === 0) missing.add(ch);
    } catch {
      missing.add(ch);
    }
  }
  return [...missing];
}

/**
 * Lay out one line glyph-by-glyph, WITHOUT opentype's shaper.
 *
 * font.getPaths()/getAdvanceWidth() route through stringToGlyphs, which
 * applies GSUB and throws outright on lookup types opentype 2.0 does not
 * implement ("substitutionType : 62 lookupType: 6 - substFormat: 2 is not yet
 * supported"). That fires on plenty of ordinary fonts -- 3 of the 5 bundled
 * here, including Inter -- so shaping is bypassed entirely: charToGlyph plus
 * the kern table is robust across arbitrary user fonts, which matters far more
 * for a print generator than ligature support does. (Losing ligatures is
 * arguably a feature: a printed "fi" ligature is a fused blob.)
 */
function layoutLine(font: Font, opts: TextOutlineOpts): { placed: PlacedGlyph[]; width: number } {
  const fontSize = fontSizeForCapHeight(font, opts.capHeightMm);
  const scale = fontSize / font.unitsPerEm;
  const extra = opts.letterSpacingMm ?? 0;

  // Iterate code points, not UTF-16 units, so astral characters survive.
  // Control characters are dropped: charToGlyph maps them to .notdef, which
  // has a real outline, so a stray newline or tab would print as a box.
  const chars = [...opts.text].filter((c) => !isControl(c));
  const placed: PlacedGlyph[] = [];
  let x = 0;

  for (let i = 0; i < chars.length; i++) {
    const glyph = font.charToGlyph(chars[i]!);
    placed.push({ glyph, x });

    x += (glyph.advanceWidth ?? 0) * scale;

    const next = chars[i + 1];
    if (next !== undefined) {
      let kern = 0;
      try {
        kern = font.getKerningValue(glyph, font.charToGlyph(next));
      } catch {
        kern = 0; // Missing/odd kern table: spacing is not worth failing over.
      }
      x += kern * scale;
      x += extra;
    }
  }

  return { placed, width: x };
}

/** Millimetre advance width of a string at a given cap height. */
export function measureTextWidth(font: Font, opts: TextOutlineOpts): number {
  return layoutLine(font, opts).width;
}

/**
 * A single line of text as a 2D outline, Y-up, in millimetres.
 *
 * Fill rule matters enormously here. TrueType glyf and CFF outlines are both
 * specified for NON-ZERO winding: outer contours wind one way and counters
 * (the holes in o, a, B, 8) the other. So:
 *   - NonZero hollows counters correctly AND unions self-overlapping strokes
 *     within one glyph, which EvenOdd would punch a spurious hole in.
 *   - NonZero is sign-agnostic (|w| != 0), so it survives both the getPath
 *     Y-flip and CFF-vs-glyf direction differences.
 *   - CrossSection's own default is 'Positive', which is WRONG here and
 *     silently yields an empty section.
 * EvenOdd is the per-glyph fallback for fonts whose composite glyphs use a
 * mirrored (negative-determinant) component transform, which inverts winding.
 */
export function textOutline(
  m: ManifoldToplevel,
  font: Font,
  opts: TextOutlineOpts,
): CrossSection {
  const eps = opts.tolerance ?? DEFAULT_TOLERANCE;
  const fontSize = fontSizeForCapHeight(font, opts.capHeightMm);
  const { placed } = layoutLine(font, opts);

  const parts: CrossSection[] = [];
  for (const { glyph, x } of placed) {
    // Glyph.getPath applies the same Y negation as Font.getPath, which
    // commandsToRings undoes.
    const path = glyph.getPath(x, 0, fontSize);
    const rings = commandsToRings(path.commands, eps) as Vec2[][];
    if (rings.length === 0) continue; // space, .notdef, outline-less glyphs

    let cs = xsec(m, rings, 'NonZero');
    if (!(cs.area() > 0)) cs = xsec(m, rings, 'EvenOdd');
    if (cs.area() > 0) parts.push(cs);
  }
  if (parts.length === 0) throw new EmptyTextError();

  // Union across glyphs rather than throwing every ring into one section:
  // the latter works only until one mirrored glyph subtracts itself from its
  // neighbour. Clipper2 makes this cheap.
  let joined = parts.length === 1 ? parts[0]! : m.CrossSection.union(parts);
  joined = joined.simplify(eps * 0.25);

  if (opts.center !== false) {
    const b = joined.bounds();
    joined = joined.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]);
  }
  return joined;
}

/**
 * Multi-line text as one outline. Lines are stacked downward with `lineGapMm`
 * of clear space between cap-height bands, then the block is centred.
 */
export function multilineTextOutline(
  m: ManifoldToplevel,
  font: Font,
  lines: readonly string[],
  opts: Omit<TextOutlineOpts, 'text'> & {
    lineGapMm?: number;
    align?: 'left' | 'center' | 'right';
  },
): CrossSection {
  const live = lines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (live.length === 0) throw new EmptyTextError();

  const gap = opts.lineGapMm ?? 3;
  const step = opts.capHeightMm + gap;
  const align = opts.align ?? 'center';

  const sections: CrossSection[] = [];
  const built = live.map((text) => textOutline(m, font, { ...opts, text, center: false }));
  const widths = built.map((s) => {
    const b = s.bounds();
    return { section: s, min: b.min[0], width: b.max[0] - b.min[0] };
  });
  const widest = Math.max(...widths.map((w) => w.width));

  widths.forEach((w, i) => {
    const dx =
      align === 'left'
        ? -w.min
        : align === 'right'
          ? widest - w.width - w.min
          : (widest - w.width) / 2 - w.min;
    sections.push(w.section.translate([dx, -i * step]));
  });

  let block = sections.length === 1 ? sections[0]! : m.CrossSection.union(sections);
  if (opts.center !== false) {
    const b = block.bounds();
    block = block.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]);
  }
  return block;
}

/**
 * One character per row, reading downward -- the layout a tag hanging on a
 * door or a bag wants.
 *
 * Rows are stepped by the cap height rather than by each glyph's own extent,
 * so the column is evenly spaced whatever mix of letters it is given: measured
 * spacing would put "oo" closer together than "ff" and the run would visibly
 * breathe. For the same reason a space advances a row without drawing one --
 * dropping it instead would silently close up a name that has a space in it.
 */
export function stackedTextOutline(
  m: ManifoldToplevel,
  font: Font,
  text: string,
  opts: Omit<TextOutlineOpts, 'text'> & { lineGapMm?: number },
): CrossSection {
  const chars = [...text.replace(/\r?\n/g, ' ')];
  if (chars.every((c) => c.trim().length === 0)) throw new EmptyTextError();

  const step = opts.capHeightMm + (opts.lineGapMm ?? 3);
  const rows: CrossSection[] = [];
  chars.forEach((ch, i) => {
    if (ch.trim().length === 0) return;
    // Each glyph centred on the column, not on its own advance width: a comma
    // and a W have nothing in common horizontally, and left-aligning them
    // makes the column look like it is falling over.
    rows.push(textOutline(m, font, { ...opts, text: ch, center: true }).translate([0, -i * step]));
  });

  const block = rows.length === 1 ? rows[0]! : m.CrossSection.union(rows);
  if (opts.center === false) return block;
  const b = block.bounds();
  return block.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]);
}

/**
 * Fraction of area lost to a morphological opening (erode then dilate) at the
 * nozzle radius. Anything narrower than one nozzle width does not survive the
 * erosion, so the loss is a direct measure of unprintably thin strokes -- the
 * usual reason a script font comes out broken, and why uploaded fonts need it.
 *
 * A small loss is unavoidable even for chunky text, because dilation rounds
 * sharp convex corners. Measured with the bundled faces on "oaB8g":
 *
 *   Inter Bold      3mm 0.0262 | 4mm 0.0046 | 6mm 0.0014 | 12mm 0.0004
 *   Nunito XBold    3mm 0.0191 | 4mm 0.0014 | 6mm 0.0003 | 12mm 0.0000
 *   Pacifico        3mm 0.2737 | 4mm 0.0194 | 6mm 0.0012 | 12mm 0.0001
 *
 * Cases with genuinely sub-nozzle features all land >= 0.019; cases that print
 * fine all land <= 0.0046. THIN_STROKE_LIMIT sits in that gap.
 *
 * (Dividing out the corner-rounding baseline by probing a second, smaller
 * radius was tried and rejected: at small radii Clipper2 rounding noise makes
 * the reference term unstable, sometimes negative.)
 */
export function thinStrokeLoss(section: CrossSection, nozzleMm: number): number {
  const before = section.area();
  if (!(before > 0)) return 1;
  const r = nozzleMm / 2;
  const after = section.offset(-r, 'Round').offset(r, 'Round').area();
  return Math.max(0, 1 - after / before);
}

export const THIN_STROKE_LIMIT = 0.01;

export function hasThinStrokes(section: CrossSection, nozzleMm: number): boolean {
  return thinStrokeLoss(section, nozzleMm) > THIN_STROKE_LIMIT;
}
