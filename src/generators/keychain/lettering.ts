import type { CrossSection, ManifoldToplevel } from 'manifold-3d';
import type { Font } from 'opentype.js';
import { filletProfile, roundedRect } from '../../core/kernel/primitives';
import { EmptyTextError, measureTextWidth, textOutline } from '../../core/text/textSolid';

/**
 * The word, laid out as a chain of letters that has to survive being picked up
 * by one end.
 *
 * This is the whole difference between this generator and the name tag. There,
 * the lettering sits ON a plate and the plate is what holds it together, so
 * where one glyph ends and the next begins is a matter of taste. Here the word
 * IS the object: two letters that merely look adjacent print as two loose
 * letters, and the only thing standing between a user and a bag of plastic
 * confetti is whether every glyph actually shares material with its neighbour.
 */

export type Direction = 'horizontal' | 'vertical';

export interface LayoutOpts {
  readonly capHeightMm: number;
  readonly tolerance: number;
  readonly direction: Direction;
  /** Extra space between letters, mm. Negative tightens. */
  readonly spacingMm: number;
  /** Clear space between stacked rows, mm. Vertical only. */
  readonly lineGapMm: number;
  /**
   * Pull every letter along the run until it genuinely touches what came
   * before it, then this much further. 0 disables tightening and leaves the
   * font's own metrics alone.
   */
  readonly overlapMm: number;
}

export interface PlacedLetter {
  readonly ch: string;
  readonly section: CrossSection;
}

export interface WordLayout {
  readonly letters: readonly PlacedLetter[];
  /** Union of every letter, centred on the origin. */
  readonly word: CrossSection;
  /**
   * Where the baseline ended up once the block was centred. The join bar hangs
   * off this, not off the bounding box, because a descender drags the box
   * floor well below where most of the letters actually stop.
   */
  readonly baselineY: number;
  /** Letters that had to stop at the tightening cap without reaching contact. */
  readonly notTouching: readonly string[];
}

/** Word-space advance, as a fraction of cap height, when the font has no space glyph. */
const FALLBACK_SPACE = 0.32;
/**
 * How far one letter may be pushed into the run before it, as a fraction of
 * its own advance. Past this a letter stops reading as a letter: "AV" tightened
 * to true contact would bury the V's arm inside the A. When the cap bites
 * first, the pair is reported and the connectivity check downstream decides
 * whether it actually mattered.
 */
const MAX_TIGHTEN = 0.42;
/** Contact search resolution, mm. Well under a nozzle width. */
const CONTACT_EPS = 0.02;
/**
 * The overlap, scaled down for stacked rows.
 *
 * The same number does very different things in the two directions, because
 * the letters meet along very different things. Across, two letters touch at
 * the edges of two narrow strokes, and a bite under about a millimetre is a
 * join you could snap with a thumbnail. Stacked, a whole cap-width band of one
 * letter lands on a whole cap-width band of the next, so the same bite is a
 * huge weld -- and it eats the row: driven a millimetre into the "G" above it,
 * a "Y" loses the valley between its arms and the column stops reading as
 * letters. Vertical gets the fraction of the bite it actually needs.
 */
const VERTICAL_OVERLAP = 0.45;

function isControl(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return cp < 0x20 || (cp >= 0x7f && cp <= 0x9f);
}

/**
 * Smallest distance `d` in [0, hi] such that moving `mover` by `-d` along
 * `axis` makes it overlap `fixed`.
 *
 * Bisection on an actual intersection test, because there is no closed form
 * for it and the bounding-box answer is wrong in exactly the cases that
 * matter. "AV" have overlapping boxes long before the glyphs touch -- the A's
 * foot and the V's arm are at opposite ends of the cap height -- so a
 * box-based tightening reports the pair welded and prints two letters.
 */
function contactShift(
  fixed: CrossSection,
  mover: CrossSection,
  axis: 0 | 1,
  hi: number,
): number | null {
  const at = (d: number): CrossSection =>
    axis === 0 ? mover.translate([-d, 0]) : mover.translate([0, d]);
  const touches = (d: number): boolean => at(d).intersect(fixed).area() > 1e-9;

  if (touches(0)) return 0;
  if (!touches(hi)) return null;

  let lo = 0;
  let high = hi;
  while (high - lo > CONTACT_EPS) {
    const mid = (lo + high) / 2;
    if (touches(mid)) high = mid;
    else lo = mid;
  }
  return high;
}

/**
 * Lay the word out one glyph at a time.
 *
 * Glyphs are placed individually rather than through `textOutline` on the
 * whole string, because tightening has to move one letter relative to the run
 * before it and a single section has no letters in it any more. Advances and
 * kerning still come from the font: `measureTextWidth` on a pair minus its two
 * halves is exactly the kern pair, which keeps this on the same shaper-free
 * path as everything else here.
 */
export function layoutWord(
  m: ManifoldToplevel,
  font: Font,
  text: string,
  opts: LayoutOpts,
): WordLayout {
  const chars = [...text.replace(/\r?\n/g, ' ')].filter((c) => !isControl(c));
  if (chars.every((c) => c.trim().length === 0)) throw new EmptyTextError();

  const cap = opts.capHeightMm;
  const advance = (s: string): number =>
    measureTextWidth(font, { text: s, capHeightMm: cap });
  const spaceAdvance = Math.max(advance(' '), cap * FALLBACK_SPACE);

  const vertical = opts.direction === 'vertical';
  const axis: 0 | 1 = vertical ? 1 : 0;
  // Vertical rows step by the CAP HEIGHT, never by each glyph's own extent, so
  // the column is evenly spaced whatever letters it is given -- the same rule
  // the name tag's stacked mode follows, and for the same reason: measured
  // spacing makes "oo" tighter than "ff" and the run visibly breathes.
  const rowStep = cap + opts.lineGapMm;

  const overlapMm = opts.overlapMm * (vertical ? VERTICAL_OVERLAP : 1);

  const letters: PlacedLetter[] = [];
  const notTouching: string[] = [];
  let run: CrossSection | null = null;
  let pen = 0;
  let prev: string | null = null;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;

    if (ch.trim().length === 0) {
      // A space advances the pen and draws nothing. It is left holding the run
      // open rather than being dropped, so "MAX POWER" keeps its gap -- and so
      // the connectivity check can tell the user that the gap is exactly why
      // their keychain came out in two halves.
      pen += vertical ? rowStep : spaceAdvance + opts.spacingMm;
      prev = null;
      continue;
    }

    // Natural typographic position first: advance of the previous glyph, the
    // kern pair between them, then the user's own tracking.
    if (letters.length > 0 || prev !== null) {
      if (vertical) {
        pen += rowStep;
      } else if (prev !== null) {
        pen += advance(prev) + (advance(prev + ch) - advance(prev) - advance(ch)) + opts.spacingMm;
      }
    }

    let section: CrossSection;
    try {
      section = textOutline(m, font, {
        text: ch,
        capHeightMm: cap,
        tolerance: opts.tolerance,
        center: vertical, // stacked letters are centred on the column
      });
    } catch {
      prev = ch;
      continue; // an outline-less glyph advances the pen and nothing else
    }

    let placed = vertical ? section.translate([0, -pen]) : section.translate([pen, 0]);

    if (run && overlapMm > 0) {
      const cap_ = MAX_TIGHTEN * (vertical ? rowStep : advance(ch));
      const d = contactShift(run, placed, axis, cap_);
      if (d === null) {
        notTouching.push(ch);
        // Still close the distance as far as the cap allows: a pair that
        // cannot be welded is at least left near enough that raising the weld
        // radius or the outline width will reach it.
        placed = vertical ? placed.translate([0, cap_]) : placed.translate([-cap_, 0]);
        pen -= cap_;
      } else if (d > 0) {
        const step = d + overlapMm;
        placed = vertical ? placed.translate([0, step]) : placed.translate([-step, 0]);
        pen -= step;
      }
    }

    letters.push({ ch, section: placed });
    run = run === null ? placed : run.add(placed);
    prev = ch;
  }

  if (letters.length === 0) throw new EmptyTextError();

  const joined = letters.length === 1 ? letters[0]!.section : m.CrossSection.union(letters.map((l) => l.section));
  const b = joined.bounds();
  const dx = -(b.min[0] + b.max[0]) / 2;
  const dy = -(b.min[1] + b.max[1]) / 2;

  return {
    letters: letters.map((l) => ({ ch: l.ch, section: l.section.translate([dx, dy]) })),
    word: joined.translate([dx, dy]),
    baselineY: dy,
    notTouching,
  };
}

/**
 * Struts tying a glyph's floating islands back to its body.
 *
 * A glyph is not always one piece. The dot on an "i" or a "j" is its own
 * contour with clear air under it, and so are the two dots on an "ä" -- and
 * no amount of tightening the letters against EACH OTHER ever reaches them,
 * because the gap is inside a single glyph. On a backed keychain the backing
 * quietly picks them up; on a solid one they are loose plastic, and the first
 * names tried here -- "Amelia", "Julia" -- both shed their tittle.
 *
 * The strut runs between the two pieces' centres. Where they overlap
 * horizontally, which is every tittle, it is widened to the full width of that
 * overlap and stood upright, so the dot merges into the stem the way a printed
 * letterform is normally drawn rather than hanging off a visible wire.
 */
export function islandBridges(
  m: ManifoldToplevel,
  section: CrossSection,
  minWidth: number,
): CrossSection | null {
  const pieces = section.decompose();
  if (pieces.length <= 1) return null;

  let main = pieces[0]!;
  for (const piece of pieces) if (piece.area() > main.area()) main = piece;
  const mb = main.bounds();
  const mc: [number, number] = [(mb.min[0] + mb.max[0]) / 2, (mb.min[1] + mb.max[1]) / 2];

  const struts: CrossSection[] = [];
  for (const piece of pieces) {
    if (piece === main) continue;
    const pb = piece.bounds();
    const pc: [number, number] = [(pb.min[0] + pb.max[0]) / 2, (pb.min[1] + pb.max[1]) / 2];

    const loX = Math.max(pb.min[0], mb.min[0]);
    const hiX = Math.min(pb.max[0], mb.max[0]);
    if (hiX - loX > minWidth * 0.5) {
      const w = Math.max(minWidth, hiX - loX);
      const h = Math.abs(pc[1] - mc[1]);
      if (h > 1e-6) {
        struts.push(
          m.CrossSection.square([w, h], true).translate([(loX + hiX) / 2, (pc[1] + mc[1]) / 2]),
        );
      }
      continue;
    }

    // No shared column: lay the strut along the line between the centres.
    const dx = mc[0] - pc[0];
    const dy = mc[1] - pc[1];
    const len = Math.hypot(dx, dy);
    if (!(len > 1e-6)) continue;
    struts.push(
      m.CrossSection.square([len, minWidth], true)
        .rotate((Math.atan2(dy, dx) * 180) / Math.PI)
        .translate([(pc[0] + mc[0]) / 2, (pc[1] + mc[1]) / 2]),
    );
  }

  if (struts.length === 0) return null;
  return struts.length === 1 ? struts[0]! : m.CrossSection.union(struts);
}

/**
 * Weld the letters: a morphological closing at `r`.
 *
 * Two jobs at once, which is why the radius is worth a slider. It bridges any
 * remaining gap narrower than 2r, and it rounds the sharp concave notch where
 * two letters cross -- and that notch is a stress riser running the full depth
 * of the part, i.e. exactly where a keychain snaps.
 *
 * The cost is that a closing also fills any COUNTER narrower than 2r, so the
 * "o" in a small word quietly becomes a blob. `countersLost` measures that
 * rather than guessing at a safe radius, because how much room a counter has
 * is a fact about the font and the text size, not about this code.
 */
export function weld(word: CrossSection, r: number): CrossSection {
  return r <= 1e-6 ? word : filletProfile(word, r, 32);
}

/** Enclosed holes (counters) that the weld closed up. */
export function countersLost(before: CrossSection, after: CrossSection): number {
  const holes = (s: CrossSection): number =>
    Math.max(0, s.numContour() - s.decompose().length);
  return Math.max(0, holes(before) - holes(after));
}

/**
 * Letters that are not part of the main body.
 *
 * Counted in 2D on purpose: the section is what decides it, the test is far
 * cheaper than decomposing a mesh, and a 2D piece can still be named. The
 * biggest piece is taken as the body and everything else is loose -- which is
 * the right reading for a keychain, where "the bit with the ring on it" is
 * what you are left holding.
 */
export function looseLetters(
  body: CrossSection,
  letters: readonly PlacedLetter[],
): string[] {
  const pieces = body.decompose();
  if (pieces.length <= 1) return [];

  let mainIndex = 0;
  let mainArea = -1;
  pieces.forEach((piece, i) => {
    const a = piece.area();
    if (a > mainArea) {
      mainArea = a;
      mainIndex = i;
    }
  });
  const main = pieces[mainIndex]!;

  const loose: string[] = [];
  for (const l of letters) {
    if (!(l.section.intersect(main).area() > 1e-6)) loose.push(l.ch);
  }
  return loose;
}

/**
 * The join bar: a rail the letters all stand on, for words the weld cannot
 * reach across.
 *
 * Horizontal, it runs under the baseline and pokes far enough above it to bite
 * into every letter sitting on it. The top is set just ABOVE the baseline
 * rather than at the bottom of the bounding box: a word with a descender in it
 * ("dog") has its box floor a fifth of a cap height below where the "d" and
 * "o" actually stop, and a bar hung off the box floor holds hands with the "g"
 * and nothing else.
 *
 * Vertical, it is a spine straight up the middle of the column. Stacked
 * letters are centred on x = 0, so the centre line is the one place every
 * glyph is guaranteed to have material somewhere along its height -- even an
 * "O", whose counter opens on the centre line but whose arcs close over it top
 * and bottom.
 */
export function joinBar(
  m: ManifoldToplevel,
  word: CrossSection,
  direction: Direction,
  thicknessMm: number,
  biteMm: number,
  baselineY: number,
): CrossSection {
  const b = word.bounds();
  if (direction === 'vertical') {
    const h = b.max[1] - b.min[1];
    return roundedRect(m, thicknessMm, h, thicknessMm / 2).translate([
      (b.min[0] + b.max[0]) / 2,
      (b.min[1] + b.max[1]) / 2,
    ]);
  }
  const top = baselineY + biteMm;
  const bottom = Math.min(b.min[1], baselineY) - thicknessMm;
  const h = top - bottom;
  const w = b.max[0] - b.min[0];
  return roundedRect(m, w, h, Math.min(thicknessMm, h / 2) * 0.5).translate([
    (b.min[0] + b.max[0]) / 2,
    (top + bottom) / 2,
  ]);
}
