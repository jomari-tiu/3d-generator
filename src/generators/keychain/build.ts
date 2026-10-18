import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import { dropSlivers, filletProfile } from '../../core/kernel/primitives';
import { serialize } from '../../core/kernel/serialize';
import type { BuildCtx, BuildResult, Generator, Issue, Params, Part } from '../../core/params/types';
import { EmptyTextError, hasThinStrokes, missingCharacters, textOutline } from '../../core/text/textSolid';
import {
  countersLost,
  islandBridges,
  joinBar,
  layoutWord,
  looseLetters,
  weld,
  type Direction,
  type PlacedLetter,
  type WordLayout,
} from './lettering';
import { buildRing } from './ring';
import { keychainGroups, keychainParams } from './schema';

/**
 * Lettering keychain: the word itself is the object.
 *
 * Three styles, and the difference between them is entirely about what holds
 * the letters together:
 *
 *   solid   - nothing does. The letters have to reach each other, which is why
 *             this is the only style with a Joining section and the only one
 *             that can fail the connectivity check.
 *   outline - a backing offset out from the word. The offset bridges every gap
 *             for free, so spacing stops being a structural question and goes
 *             back to being a matter of taste.
 *   double  - the same, twice, with a halo between the letters and the border.
 *
 * Every style is a stack of prismatic extrusions with a 2D section worked out
 * first, which is the rule the whole project runs on: there is no 3D fillet
 * here, so anything that wants a rounded corner has to get it from a Clipper2
 * offset pair before it leaves 2D.
 */

/** Below this a fragment is debris, not a feature. A dot on an "i" is ~0.3 mm³. */
const SLIVER = 0.005;
/** Stock left around the ring hole before it stops being a ring. */
const MIN_RING_WALL = 1.2;
/** Fillet blending the keyring eye into the initial, so it reads as a tab. */
const EYE_BLEND = 2;
/** How far below centre a name across a big letter sits, x the letter's height. */
const NAME_DROP = 0.08;

function outlineOf(section: CrossSection, width: number, smooth: number): CrossSection {
  // Offsetting outward already rounds the CONVEX corners. What it leaves is a
  // sharp notch wherever the outline dives back in between two letters, and a
  // closing is what takes those out -- the same offset pair that fillets
  // everything else in this project.
  return filletProfile(section.offset(width, 'Round', 2, 48), smooth, 32);
}

/**
 * Several lines of text stacked into one centred block, top line first.
 *
 * Fitted, every line is scaled to the width of the narrowest one -- the
 * longest words come out smallest, the shortest biggest, and the block has
 * straight sides, the way "BEST / MUMMY / EVER" is set. Scaling down only, so
 * the letter height asked for is the largest any line gets.
 */
function stackLines(m: ManifoldToplevel, lines: readonly WordLayout[], gap: number, fit: boolean): WordLayout {
  const widthOf = (l: WordLayout) => {
    const b = l.word.bounds();
    return b.max[0] - b.min[0];
  };
  const target = Math.min(...lines.map(widthOf));
  const letters: PlacedLetter[] = [];
  const notTouching: string[] = [];
  let top = 0;
  let baselineY = 0;
  for (const line of lines) {
    const s = fit ? target / widthOf(line) : 1;
    const b = line.word.bounds();
    const cx = (b.min[0] + b.max[0]) / 2;
    // Scaled about its own centre, then hung so its top sits `gap` under the
    // bottom of the line above.
    const place = (c: CrossSection) => c.translate([-cx, 0]).scale([s, s]);
    const placedTop = b.max[1] * s;
    const dy = top - placedTop;
    for (const l of line.letters) letters.push({ ...l, section: place(l.section).translate([0, dy]) });
    notTouching.push(...line.notTouching);
    baselineY = line.baselineY * s + dy;
    top = b.min[1] * s + dy - gap;
  }
  const word = m.CrossSection.union(letters.map((l) => l.section));
  const wb = word.bounds();
  const ox = -(wb.min[0] + wb.max[0]) / 2;
  const oy = -(wb.min[1] + wb.max[1]) / 2;
  return {
    letters: letters.map((l) => ({ ...l, section: l.section.translate([ox, oy]) })),
    word: word.translate([ox, oy]),
    baselineY: baselineY + oy,
    notTouching,
  };
}

function box2(m: ManifoldToplevel, x0: number, x1: number, y0: number, y1: number): CrossSection {
  return m.CrossSection.square([x1 - x0, y1 - y0]).translate([x0, y0]);
}

/**
 * Tag style: a plain rounded tag with the word cut right through it, or sunk
 * into its face, and a hole at one end to hang it from.
 *
 * Cut through, every enclosed counter -- the middle of an A, B, D, O, P, Q,
 * R -- would be a loose island that drops out of the print. Each is held in
 * the way a stencil holds it: a thin bar of tag left uncut across the letter,
 * from the island up to the solid tag above it. Found, not listed: the
 * islands are whatever pieces of tag come out separate from the main one, so
 * any font and any glyph are handled the same way.
 */
function buildTag(
  m: ManifoldToplevel,
  p: Params,
  word: CrossSection,
  direction: Direction,
  letterCount: number,
  issues: Issue[],
): BuildResult {
  const thickness = Number(p.thickness);
  const margin = Number(p.tagMargin ?? 5);
  const ringMode = String(p.ring);
  const holeD = Number(p.ringHole);
  const wall = Number(p.ringWall);
  const engrave = String(p.tagCut) === 'engrave';
  const nozzle = Number(p.nozzle);
  const b = word.bounds();

  // The tag: the lettering plus a margin all round, lengthened at the hole
  // end by the hole and the wall beyond it. The margin is what then sits
  // between the hole and the first letter.
  let x0 = b.min[0] - margin;
  let x1 = b.max[0] + margin;
  let y0 = b.min[1] - margin;
  let y1 = b.max[1] + margin;
  const extra = holeD + wall;
  // Longer than the lettering needs: the tag grows equally at both ends, so
  // the word stays centred and the hole stays at its end.
  const vertical = direction === 'vertical' || ringMode === 'top';
  const fitted = (vertical ? y1 - y0 : x1 - x0) + (ringMode === 'none' ? 0 : extra);
  const pad = Math.max(0, Number(p.tagLength ?? 0) - fitted) / 2;
  if (vertical) {
    y0 -= pad;
    y1 += pad;
  } else {
    x0 -= pad;
    x1 += pad;
  }
  let hole: CrossSection | null = null;
  if (ringMode !== 'none') {
    const atEnd = ringMode === 'end';
    const cx = (b.min[0] + b.max[0]) / 2;
    const cy = (b.min[1] + b.max[1]) / 2;
    let at: [number, number];
    if (vertical) {
      if (atEnd) {
        y0 -= extra;
        at = [cx, y0 + wall + holeD / 2];
      } else {
        y1 += extra;
        at = [cx, y1 - wall - holeD / 2];
      }
    } else if (atEnd) {
      x1 += extra;
      at = [x1 - wall - holeD / 2, cy];
    } else {
      x0 -= extra;
      at = [x0 + wall + holeD / 2, cy];
    }
    hole = m.CrossSection.circle(holeD / 2, 48).translate(at);
  }
  const r = Math.min(Number(p.tagCorner ?? 4), (x1 - x0) / 2 - 0.01, (y1 - y0) / 2 - 0.01);
  let tag = box2(m, x0, x1, y0, y1);
  if (r > 0) tag = tag.offset(-r, 'Round', 2, 48).offset(r, 'Round', 2, 48);
  const blank = hole ? tag.subtract(hole) : tag;

  let solid: Manifold;
  let pieces = 1;
  let bridgeCount = 0;
  if (engrave) {
    const depth = Math.min(Number(p.engraveDepth ?? 1.2), thickness - 0.6);
    solid = blank.extrude(thickness).subtract(word.extrude(depth + 1).translate([0, 0, thickness - depth]));
  } else {
    const bw = Number(p.bridgeWidth ?? 1.4);
    const loose = blank.subtract(word).decompose().sort((a, c) => c.area() - a.area()).slice(1);
    const bars = loose.map((island) => {
      const ib = island.bounds();
      const cx = (ib.min[0] + ib.max[0]) / 2;
      return box2(m, cx - bw / 2, cx + bw / 2, (ib.min[1] + ib.max[1]) / 2, y1);
    });
    bridgeCount = bars.length;
    const cut = bars.length > 0 ? word.subtract(m.CrossSection.union(bars)) : word;
    const plate = blank.subtract(cut);
    pieces = plate.decompose().filter((s) => s.area() > 0.05).length;
    if (hasThinStrokes(plate, nozzle)) {
      issues.push({
        level: 'warn',
        message: 'Somewhere the tag between the cut letters narrows to less than a nozzle width. Raise the letter spacing or the margin, or widen the stencil bridges.',
        paramIds: ['letterSpacing', 'tagMargin', 'bridgeWidth'],
      });
    }
    solid = plate.extrude(thickness);
  }
  if (pieces > 1) {
    issues.push({
      level: 'error',
      message: `This comes out as ${pieces} separate pieces - part of a letter would drop out of the tag. Widen the stencil bridges or pick a bolder font.`,
      paramIds: ['bridgeWidth', 'font'],
    });
  }

  const bb = solid.boundingBox();
  const readouts: Record<string, string> = {
    Size: `${(bb.max[0] - bb.min[0]).toFixed(1)} x ${(bb.max[1] - bb.min[1]).toFixed(1)} x ${thickness.toFixed(1)} mm`,
    Letters: String(letterCount),
    Cut: engrave ? 'Engraved into the face' : `Through, ${bridgeCount} stencil ${bridgeCount === 1 ? 'bridge' : 'bridges'}`,
    Pieces: pieces === 1 ? 'One - it holds together' : `${pieces} - see the errors`,
  };
  if (hole) readouts['Hole'] = `${holeD} mm`;
  return {
    parts: [
      {
        id: 'tag',
        name: 'Tag',
        mesh: serialize(solid),
        color: String(p.plateColor),
        orientationNote: 'Prints flat on its back, face up. No supports.',
      },
    ],
    issues,
    readouts,
  };
}

/**
 * Initial style: one big serif letter, with the name in a script standing up
 * across its face.
 *
 * The name is free to run past the initial's edges, the way it does on the
 * real thing, and that is what decides how it is built. Hung off the top of
 * the initial, everything past the edge would be an overhang over thin air;
 * extruded from the bed instead, the name is a solid column of its own colour
 * wherever it leaves the letter and simply stands taller than it wherever it
 * crosses it. One flat print, no supports, and the filament swap at the
 * initial's top face colours exactly the name.
 *
 * What holds it together is the overlap between the two. The name has to
 * cross the initial somewhere, and a script carries itself from letter to
 * letter -- except for the dots, which on an "i" or a "j" out past the
 * initial's edge have nothing under them and are tied down to their stems.
 */
function buildInitial(
  m: ManifoldToplevel,
  p: Params,
  ctx: BuildCtx,
  name: readonly PlacedLetter[],
  issues: Issue[],
): BuildResult {
  const thickness = Number(p.thickness);
  const rise = Number(p.letterHeight);
  const nozzle = Number(p.nozzle);
  const nameText = String(p.text ?? '').trim();
  const ch = ([...String(p.initial ?? '').trim()][0] ?? [...nameText][0] ?? '').toLocaleUpperCase();
  const fnt = ctx.font(String(p.initialFont));

  if (missingCharacters(fnt, ch).length > 0) {
    issues.push({
      level: 'warn',
      message: `The initial's font has no glyph for "${ch}" - it would print as a box. Pick another font for the initial.`,
      paramIds: ['initialFont', 'initial'],
    });
  }
  let initial: CrossSection;
  try {
    initial = textOutline(m, fnt, { text: ch, capHeightMm: Number(p.initialSize), tolerance: ctx.tolerance });
  } catch (err) {
    if (err instanceof EmptyTextError) {
      return {
        parts: [],
        issues: [{ level: 'error', message: 'The initial has no printable letter in it.', paramIds: ['initial', 'initialFont'] }],
      };
    }
    throw err;
  }

  // The name came out of the layout centred on the origin, and so did the
  // initial. Turned about its own middle first, so the position lines up the
  // tilted word's real edge, not the edge it had before it was turned.
  const angle = Number(p.nameAngle ?? 0);
  const turned = name.map((l) => ({ ...l, section: l.section.rotate(angle) }));
  const nb = m.CrossSection.union(turned.map((l) => l.section)).bounds();
  const ib = initial.bounds();
  const place = String(p.namePlace ?? 'middle');
  // Top and bottom run flush with the big letter's top and foot. The middle
  // sits a little low, where the eye reads a name across a letter as centred
  // -- dead centre looks high once the letter's top serifs are over it.
  const y =
    place === 'top'
      ? ib.max[1] - nb.max[1]
      : place === 'bottom'
        ? ib.min[1] - nb.min[1]
        : -(nb.min[1] + nb.max[1]) / 2 - (ib.max[1] - ib.min[1]) * NAME_DROP;
  const shift: [number, number] = [
    -(nb.min[0] + nb.max[0]) / 2 + Number(p.nameX ?? 0),
    y + Number(p.nameY ?? 0),
  ];
  const letters = turned.map((l) => ({ ...l, section: l.section.translate(shift) }));
  let nameSection = m.CrossSection.union(letters.map((l) => l.section));
  // Only letters with a piece out past the initial's edge need tying down;
  // a dot over the letter sits on it.
  const bridges = letters
    .filter((l) => l.section.decompose().some((piece) => !(piece.intersect(initial).area() > 1e-6)))
    .map((l) => islandBridges(m, l.section, Math.max(nozzle * 3, Number(p.smallSize) * 0.07)))
    .filter((b): b is CrossSection => b !== null);
  if (bridges.length > 0) nameSection = nameSection.add(m.CrossSection.union(bridges));

  // ------------------------------------------------------------------ ring
  const ringMode = String(p.ring);
  const ringHole = Number(p.ringHole);
  const ringWall = Number(p.ringWall);
  const ring =
    ringMode === 'none'
      ? null
      : buildRing(m, initial, {
          holeD: ringHole,
          wall: ringWall,
          gap: Number(p.ringGap),
          direction: ringMode === 'top' ? 'vertical' : 'horizontal',
          atEnd: ringMode === 'end',
          corner: ringMode === 'corner',
        });
  let plate = ring ? initial.add(ring.solid) : initial;
  if (ring) {
    // Round only the join, as on the backed styles: the same closing over the
    // whole letter would soften the initial's own serifs.
    const near = m.CrossSection.circle(ring.outerD / 2 + EYE_BLEND * 2.5, 64).translate([ring.centre[0], ring.centre[1]]);
    plate = plate.add(filletProfile(plate, EYE_BLEND, 32).intersect(near));
    if (ring.jointArea < ring.jointTarget * 0.9) {
      issues.push({
        level: 'warn',
        message: `The keyring eye only meets the initial across ${ring.jointArea.toFixed(1)} mm² - it wants about ${ring.jointTarget.toFixed(1)} mm² to take a bunch of keys. Move the eye, or raise the initial height.`,
        paramIds: ['ring', 'initialSize'],
      });
    }
    if (ringWall < MIN_RING_WALL) {
      issues.push({
        level: 'error',
        message: `A ${ringWall} mm ring wall is thinner than ${MIN_RING_WALL} mm and will tear off under a bunch of keys.`,
        paramIds: ['ringWall'],
      });
    }
    if (nameSection.intersect(m.CrossSection.circle(ring.outerD / 2, 48).translate([ring.centre[0], ring.centre[1]])).area() > 1e-6) {
      issues.push({
        level: 'warn',
        message: 'The name runs over the keyring eye. Slide the name away from it, or move the eye.',
        paramIds: ['nameX', 'nameY', 'ring'],
      });
    }
    // Whatever the name covers, the hole still goes through.
    nameSection = nameSection.subtract(ring.hole);
  }

  // --------------------------------------------------------- connectivity
  const connected = plate.add(nameSection);
  const pieceCount = connected.decompose().length;
  if (pieceCount > 1) {
    const loose = looseLetters(connected, letters);
    const named = loose.length > 0 ? ` ${loose.map((c) => `"${c}"`).join(', ')} ${loose.length === 1 ? 'is' : 'are'} not attached.` : '';
    issues.push({
      level: 'error',
      message: `This comes out as ${pieceCount} separate pieces, not one keychain.${named} Slide the name back across the initial, make the initial bigger, or tighten the letter spacing so the script joins up.`,
      paramIds: ['nameX', 'nameY', 'initialSize', 'letterSpacing'],
    });
  }
  if (hasThinStrokes(nameSection, nozzle)) {
    issues.push({
      level: 'warn',
      message: `Some strokes in the small text are thinner than the ${nozzle} mm nozzle and may not print. Raise its height or the letter weight.`,
      paramIds: ['smallSize', 'weight'],
    });
  }
  if (hasThinStrokes(initial, nozzle)) {
    issues.push({
      level: 'warn',
      message: `Some strokes in the initial are thinner than the ${nozzle} mm nozzle and may not print. Raise the initial height or pick a heavier font.`,
      paramIds: ['initialSize', 'initialFont'],
    });
  }

  // -------------------------------------------------------------------- 3D
  // The name is extruded from the bed and has the initial cut out of it, so
  // past the letter's edge it is a column down to the bed, not an overhang.
  const base = (ring ? plate.subtract(ring.hole) : plate).extrude(thickness);
  const nameSolid = dropSlivers(m, nameSection.extrude(thickness + rise).subtract(base), SLIVER);
  const parts: Part[] = [
    {
      id: 'initial',
      name: 'Initial',
      mesh: serialize(base),
      color: String(p.initialColor),
      group: 'keychain',
      orientationNote: 'Prints flat on its back, name upward. No supports.',
    },
    {
      id: 'name',
      name: 'Name',
      mesh: serialize(nameSolid),
      color: String(p.letterColor),
      group: 'keychain',
      orientationNote: 'Stands on the initial, and runs down to the bed past its edges. A filament change at the top of the initial gives the name its own colour.',
    },
  ];

  const b = connected.bounds();
  const readouts: Record<string, string> = {
    Size: `${(b.max[0] - b.min[0]).toFixed(1)} x ${(b.max[1] - b.min[1]).toFixed(1)} x ${(thickness + rise).toFixed(1)} mm`,
    Initial: ch,
    Letters: String(letters.length),
    Pieces: pieceCount === 1 ? 'One - it holds together' : `${pieceCount} - see the errors`,
  };
  if (ring) readouts['Ring'] = `${ringHole} mm hole, ${ring.outerD.toFixed(1)} mm across`;
  return { parts, issues, readouts };
}

interface Body {
  /** Outermost 2D section, before the ring is added. */
  readonly section: CrossSection;
  /** The halo, on the double style only. */
  readonly halo: CrossSection | null;
}

function build(p: Params, ctx: BuildCtx): BuildResult {
  const { m } = ctx;
  const issues: Issue[] = [];

  const raw = String(p.text ?? '');
  const style = String(p.style);
  const solid = style === 'solid';
  const isDouble = style === 'double';
  // Across a big letter the word is the small text, with its own font and
  // size beside the big letter's; and it always reads across.
  const onInitial = style === 'initial';
  const fnt = ctx.font(String(onInitial ? p.smallFont : p.font));
  const direction = (onInitial ? 'horizontal' : String(p.direction)) as Direction;
  const cap = Number(onInitial ? p.smallSize : p.fontSize);
  const thickness = Number(p.thickness);
  const letterHeight = Number(p.letterHeight);
  const rimHeight = Number(p.rimHeight);
  const nozzle = Number(p.nozzle);
  const join = String(p.join);

  const missing = missingCharacters(fnt, raw);
  if (missing.length > 0) {
    issues.push({
      level: 'warn',
      message: `This font has no glyph for ${missing.map((c) => `"${c}"`).join(', ')} - those characters would print as boxes. Pick another font or remove them.`,
      paramIds: [onInitial ? 'smallFont' : 'font', 'text'],
    });
  }

  // --------------------------------------------------------------- the word
  let layout;
  try {
    const opts = {
      capHeightMm: cap,
      tolerance: ctx.tolerance,
      direction,
      spacingMm: Number(p.letterSpacing),
      lineGapMm: Number(p.lineGap),
      // Tightening is a SOLID-style concern only. On a backed keychain the
      // backing is what joins the letters, so driving them into each other
      // buys nothing and costs legibility.
      overlapMm: solid && join === 'weld' ? Number(p.overlap) : 0,
    };
    const lines = raw.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 0);
    layout =
      lines.length > 1 && direction === 'horizontal'
        ? stackLines(m, lines.map((l) => layoutWord(m, fnt, l, opts)), Number(p.lineSpacing ?? 1), p.fitLines !== false)
        : layoutWord(m, fnt, raw, opts);
  } catch (err) {
    if (err instanceof EmptyTextError) {
      return {
        parts: [],
        issues: [{ level: 'error', message: 'This word has no printable letters in it.', paramIds: ['text', 'font'] }],
      };
    }
    throw err;
  }

  if (layout.notTouching.length > 0) {
    issues.push({
      level: 'warn',
      message: `${layout.notTouching.map((c) => `"${c}"`).join(', ')} could not be pushed far enough to touch without being swallowed by the letter before it. The weld fillet may still bridge the gap - check the warnings below it, and use the bar if it does not.`,
      paramIds: ['overlap', 'join'],
    });
  }

  // Letter weight: every glyph grown outward (or thinned, below zero) with round corners, after
  // layout so the spacing the font set is what the extra weight eats into.
  // A slim display face comes out fat and soft, the way bubble lettering is.
  //
  // Letter width first: the whole row stretched along its length, so a
  // condensed face can be opened up to round, wide letters and the spacing
  // stretches with it.
  const weight = Number(p.weight ?? 0);
  const widen = Number(p.widthScale ?? 100) / 100;
  const reshaped = weight !== 0 || widen !== 1;
  const letters: readonly PlacedLetter[] = reshaped
    ? layout.letters.map((l) => {
        let section = widen !== 1 ? l.section.scale([widen, 1]) : l.section;
        // Growing rounds the outside corners on its own. Thinning does not --
        // an inward offset only rounds the inside ones -- so it goes in past
        // the target and comes back out, which rounds the outside corners by
        // the same amount: a slimmed fat face comes out soft, not boxy.
        if (weight > 0) section = section.offset(weight, 'Round', 2, 32);
        else if (weight < 0) section = section.offset(weight * 2, 'Round', 2, 32).offset(-weight, 'Round', 2, 32);
        return { ...l, section };
      })
    : layout.letters;
  const word = reshaped ? m.CrossSection.union(letters.map((l) => l.section)) : layout.word;

  if (style === 'tag') return buildTag(m, p, word, direction, letters.length, issues);
  if (style === 'initial') return buildInitial(m, p, ctx, letters, issues);

  // ------------------------------------------------------------- 2D bodies
  let body: Body;
  if (solid) {
    let s = word;
    // Tie every glyph's floating islands down first -- the dot on an "i" is
    // not reachable by anything the letters do to each other.
    const bridges = letters
      .map((l) => islandBridges(m, l.section, Math.max(nozzle * 3, cap * 0.07)))
      .filter((b): b is CrossSection => b !== null);
    if (bridges.length > 0) s = s.add(m.CrossSection.union(bridges));
    // Bar next, weld last: the weld then rounds where the letters meet the
    // bar as well as where they meet each other.
    if (join === 'bar') {
      s = s.add(
        joinBar(m, word, direction, Number(p.barThickness), Math.max(0.6, cap * 0.05), layout.baselineY),
      );
    }
    const weldR = Number(p.weldRadius);
    const welded = weld(s, weldR);
    const lost = countersLost(s, welded);
    if (lost > 0) {
      issues.push({
        level: 'warn',
        message: `The weld fillet closed up ${lost} ${lost === 1 ? 'counter' : 'counters'} - the holes in letters like "o", "a" and "e" have filled in. Reduce the weld fillet or raise the letter height.`,
        paramIds: ['weldRadius', 'fontSize'],
      });
    }
    body = { section: welded, halo: null };
  } else {
    const smooth = Number(p.smooth);
    const halo = outlineOf(word, Number(p.outlineWidth), smooth);
    body = isDouble
      ? { section: outlineOf(halo, Number(p.outlineWidth2), smooth), halo }
      : { section: halo, halo: null };
  }

  // ------------------------------------------------------ alternate heights
  // Every other letter stands tall -- the first, third, fifth -- and the ones
  // between sit low, tucked in under their neighbours where they overlap.
  // Everything that is not a tall letter (the low letters, the welds between
  // letters, the keyring eye) is the low layer.
  const stagger = solid && p.stagger === true;
  const lowHeight = Math.min(Number(p.lowHeight ?? 0), thickness - 0.4);
  const base2D = body.section;

  // ------------------------------------------------------------------ ring
  const ringMode = String(p.ring);
  const ringHole = Number(p.ringHole);
  const ringWall = Number(p.ringWall);
  const ring =
    ringMode === 'none'
      ? null
      : buildRing(m, base2D, {
          holeD: ringHole,
          wall: ringWall,
          gap: Number(p.ringGap),
          direction: ringMode === 'top' ? 'vertical' : direction,
          atEnd: ringMode === 'end',
          corner: ringMode === 'corner',
        });

  // A joint that came up short is the failure the piece count cannot see: the
  // eye is attached, so it counts as one piece, and it still snaps off in a
  // pocket. Say so rather than let it export quietly.
  if (ring && ring.jointArea < ring.jointTarget * 0.9) {
    issues.push({
      level: 'warn',
      message: `The keyring eye only meets the body across ${ring.jointArea.toFixed(1)} mm² - it wants about ${ring.jointTarget.toFixed(1)} mm² to take a bunch of keys. ${solid ? 'Put the eye at the other end, or raise the letter height.' : 'Raise the outline width, or put the eye at the other end.'}`,
      paramIds: solid ? ['ring', 'fontSize'] : ['ring', 'outlineWidth'],
    });
  }

  if (ring && ringWall < MIN_RING_WALL) {
    issues.push({
      level: 'error',
      message: `A ${ringWall} mm ring wall is thinner than ${MIN_RING_WALL} mm and will tear off under a bunch of keys.`,
      paramIds: ['ringWall'],
    });
  }

  // Connectivity is checked on the section WITH the ring and WITHOUT the hole:
  // the hole is a feature of the eye, and cutting it first would just confuse
  // the piece count.
  // On a backed keychain the eye is blended into the backing with a broad
  // fillet, so it reads as a tab grown out of it rather than a ring on a
  // neck. Only round the join: the same closing over the whole outline would
  // fill in the scallops between the letters too.
  let connected = ring ? base2D.add(ring.solid) : base2D;
  if (ring && !solid) {
    const r = Math.max(Number(p.smooth) * 1.6, 1.2);
    const near = m.CrossSection.circle(ring.outerD / 2 + r * 2.5, 64).translate([ring.centre[0], ring.centre[1]]);
    connected = connected.add(filletProfile(connected, r, 32).intersect(near));
  }
  const loose = looseLetters(connected, letters);
  const pieceCount = connected.decompose().length;

  if (pieceCount > 1) {
    const named = loose.length > 0 ? ` ${loose.map((c) => `"${c}"`).join(', ')} ${loose.length === 1 ? 'is' : 'are'} not attached.` : '';
    issues.push({
      level: 'error',
      message: solid
        ? `This comes out as ${pieceCount} separate pieces, not one keychain.${named} Raise the overlap or the weld fillet, tighten the letter spacing, or switch the join to the bar.`
        : `This comes out as ${pieceCount} separate pieces, not one keychain.${named} Raise the outline width so the backing bridges the gaps, or tighten the letter spacing.`,
      paramIds: solid ? ['overlap', 'weldRadius', 'join', 'letterSpacing'] : ['outlineWidth', 'letterSpacing'],
    });
  }

  // ----------------------------------------------------------- printability
  if (hasThinStrokes(word, nozzle)) {
    issues.push({
      level: 'warn',
      message: `Some letter strokes are thinner than the ${nozzle} mm nozzle and may not print. Increase the letter height or pick a bolder font.`,
      paramIds: ['font', 'fontSize'],
    });
  }
  if (!solid && hasThinStrokes(body.section, nozzle)) {
    issues.push({
      level: 'warn',
      message: 'The backing narrows to less than a nozzle width somewhere between two letters. Raise the outline width or the smoothing.',
      paramIds: ['outlineWidth', 'smooth'],
    });
  }
  if (solid && hasThinStrokes(body.section, nozzle * 2)) {
    issues.push({
      level: 'warn',
      message: 'The letters join each other on necks barely two nozzle widths across. It will hold together in the slicer and snap in a pocket - raise the overlap or the weld fillet.',
      paramIds: ['overlap', 'weldRadius'],
    });
  }

  // -------------------------------------------------------------------- 3D
  const section = ring ? connected.subtract(ring.hole) : connected;
  const parts: Part[] = [];
  const letterColor = String(p.letterColor);
  const flatNote = 'Prints flat on its back, lettering upward. No supports.';

  if (solid) {
    // Staggered, the tall letters rise the full thickness and the rest stops at
    // the low height. Both start at z = 0 so they overlap rather than meet on
    // a plane.
    const tall = stagger ? letters.filter((_, i) => i % 2 === 0).map((l) => l.section) : [];
    const solid3D = stagger
      ? section.extrude(lowHeight).add(m.CrossSection.union(tall).extrude(thickness))
      : section.extrude(thickness);
    parts.push({
      id: 'keychain',
      name: 'Keychain',
      mesh: serialize(solid3D),
      color: letterColor,
      orientationNote: flatNote,
    });
  } else {
    const plate: Manifold = section.extrude(thickness);
    const rimTop = thickness + (isDouble ? rimHeight : 0);

    // Each layer is extruded from z = 0 and has everything below it
    // subtracted, rather than being built at its own height and set down on
    // what it sits on. Same reason the name tag does it: a solid that starts
    // at the top of the one below is a knife-edge contact, and this way the
    // overlap is real before the cut takes it away.
    const haloFull = body.halo ? body.halo.extrude(rimTop) : null;
    const letterFull = word.extrude(rimTop + letterHeight);

    parts.push({
      id: 'backing',
      name: 'Backing',
      mesh: serialize(plate),
      color: String(p.plateColor),
      group: 'keychain',
      orientationNote: flatNote,
    });

    if (haloFull) {
      parts.push({
        id: 'halo',
        name: 'Halo',
        mesh: serialize(dropSlivers(m, haloFull.subtract(plate), SLIVER)),
        color: String(p.rimColor),
        group: 'keychain',
        orientationNote: 'Sits on the backing. A filament change at that layer gives it its own colour.',
      });
    }

    parts.push({
      id: 'lettering',
      name: 'Lettering',
      mesh: serialize(dropSlivers(m, letterFull.subtract(haloFull ?? plate), SLIVER)),
      color: letterColor,
      group: 'keychain',
      orientationNote: 'Stands on the backing. A filament change at that layer gives it its own colour.',
    });
  }

  // -------------------------------------------------------------- readouts
  const b = section.bounds();
  const totalThickness = solid ? thickness : thickness + (isDouble ? rimHeight : 0) + letterHeight;
  const readouts: Record<string, string> = {
    Size: `${(b.max[0] - b.min[0]).toFixed(1)} x ${(b.max[1] - b.min[1]).toFixed(1)} x ${totalThickness.toFixed(1)} mm`,
    Letters: String(letters.length),
    Pieces: pieceCount === 1 ? 'One - it holds together' : `${pieceCount} - see the errors`,
  };
  if (ring) readouts['Ring'] = `${ringHole} mm hole, ${ring.outerD.toFixed(1)} mm across`;

  return { parts, issues, readouts };
}

export const keychainGenerator: Generator = {
  id: 'keychain',
  name: 'Lettering keychain',
  description: 'A word as a keychain - cut-out letters, letters on a backing that follows them, or layered with a halo and border.',
  tagline: 'Names and words as keyrings, welded into one solid piece',
  highlights: [
    'Cut-out, Backed, Layered, Tag, or a name across a big initial',
    'Reads across, or stacked one letter per row',
    'Letters welded by real contact, not by eye',
    'Integrated keyring eye at either end',
    'Two- and three-colour export, ready for a filament swap',
  ],
  art: `<svg viewBox="0 0 120 96" role="img" aria-hidden="true">
    <defs><linearGradient id="kc-p" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f2695c"/><stop offset="1" stop-color="#d13a2e"/>
    </linearGradient></defs>
    <circle cx="21" cy="48" r="11" fill="none" stroke="#9aa3b2" stroke-width="3.4"/>
    <path d="M30 48h10" stroke="url(#kc-p)" stroke-width="7" stroke-linecap="round"/>
    <rect x="36" y="30" width="74" height="36" rx="15" fill="url(#kc-p)"/>
    <text x="73" y="55" text-anchor="middle" font-size="22" font-weight="800"
      font-family="ui-rounded, ui-sans-serif, system-ui, sans-serif" fill="#fdfdfd">LOVE</text>
  </svg>`,
  params: keychainParams,
  groups: keychainGroups,
  fontsNeeded: (p) => (String(p.style) === 'initial' ? [String(p.smallFont), String(p.initialFont)] : [String(p.font)]),
  validate: (p) => {
    const out: Issue[] = [];
    if (String(p.text ?? '').trim().length === 0) {
      out.push({ level: 'error', message: 'Enter a word.', paramIds: ['text'] });
    }
    if (String(p.style) !== 'solid' && Number(p.letterHeight) + Number(p.thickness) < 2.4) {
      out.push({
        level: 'warn',
        message: 'Under about 2.4 mm overall a keychain snaps in a pocket. Raise the thickness.',
        paramIds: ['thickness', 'letterHeight'],
      });
    }
    if (String(p.style) === 'solid' && String(p.text ?? '').includes(' ')) {
      out.push({
        level: 'warn',
        message: 'A space in a cut-out word is a gap with nothing spanning it, so the two halves print loose. Remove it, or use the Backed or Layered style.',
        paramIds: ['text', 'style'],
      });
    }
    return out;
  },
  build,
  presets: [
    {
      // Groovy 70s lettering, raised on a bubbly backing that follows it, all
      // in one colour; hung from the eye, the word runs down the tag.
      label: 'MAMA - groovy, pink',
      values: {
        style: 'outline', text: 'MAMA', font: 'oi', direction: 'horizontal',
        fontSize: 16, widthScale: 62, weight: -1.1, letterSpacing: 3, thickness: 3, letterHeight: 3,
        outlineWidth: 3, smooth: 2.4, ring: 'start', ringHole: 4.5, ringWall: 4, ringGap: 0,
        plateColor: '#efb7bd', letterColor: '#efb7bd',
      },
    },
    {
      // Three lines fitted to one width -- the short words come out big --
      // on a backing that follows the whole block, hung from the top.
      label: 'BEST MUMMY EVER - lines, pink on cream',
      values: {
        style: 'outline', text: 'BEST\nMUMMY\nEVER', font: 'bebas-neue', direction: 'horizontal',
        fontSize: 18, weight: 0.35, letterSpacing: -0.2, lineSpacing: 0.6, fitLines: true,
        thickness: 3, letterHeight: 2.4, outlineWidth: 2.2, smooth: 1.2,
        ring: 'top', ringHole: 4, ringWall: 2, ringGap: 0,
        plateColor: '#f3cfae', letterColor: '#ec7a80',
      },
    },
    {
      // Bubbly letters packed so they overlap, every other one standing tall
      // over the low ones between; a small eye off the low layer.
      label: 'BHENG - bubbly, alternating, lavender',
      values: {
        style: 'solid', text: 'BHENG', font: 'bowlby-one-sc', direction: 'horizontal',
        fontSize: 13, thickness: 6, join: 'none', letterSpacing: -1.6, weldRadius: 0.3,
        stagger: true, lowHeight: 3,
        ring: 'start', ringHole: 3.5, ringWall: 1.8, ringGap: 0.2,
        letterColor: '#a99bd8',
      },
    },
    {
      label: 'aaron - round, alternating, slate',
      values: {
        style: 'solid', text: 'aaron', font: 'changa-one', direction: 'horizontal',
        fontSize: 16, thickness: 6, join: 'none', letterSpacing: -1.8, weldRadius: 0.3,
        stagger: true, lowHeight: 3,
        ring: 'start', ringHole: 3.5, ringWall: 1.8, ringGap: 0.2,
        letterColor: '#5d6e7e',
      },
    },
    {
      // A plain rounded tag with one big initial cut right through it,
      // hanging from a hole at the top.
      label: 'L - initial tag, stencil, coral',
      values: {
        style: 'tag', text: 'L', font: 'inter-bold', direction: 'vertical',
        fontSize: 22, thickness: 3, tagCut: 'through', bridgeWidth: 1.4, tagMargin: 6, tagCorner: 4, tagLength: 72,
        ring: 'start', ringHole: 4.5, ringWall: 2.5,
        plateColor: '#f47c72',
      },
    },
    {
      label: 'R - initial tag, stencil, lilac',
      values: {
        style: 'tag', text: 'R', font: 'inter-bold', direction: 'vertical',
        fontSize: 22, thickness: 3, tagCut: 'through', bridgeWidth: 1.4, tagMargin: 6, tagCorner: 4, tagLength: 72,
        ring: 'start', ringHole: 4.5, ringWall: 2.5,
        plateColor: '#a9a3e0',
      },
    },
    {
      label: 'E - initial tag, engraved, mint',
      values: {
        style: 'tag', text: 'E', font: 'inter-bold', direction: 'vertical',
        fontSize: 22, thickness: 3, tagCut: 'engrave', engraveDepth: 1.2, tagMargin: 6, tagCorner: 4, tagLength: 72,
        ring: 'start', ringHole: 4.5, ringWall: 2.5,
        plateColor: '#7fd8c4',
      },
    },
    {
      // A big fat-serif initial, the name in a script standing up across it
      // and running off its left edge; hung from a tab at the top corner.
      label: 'Amelia - name across an initial, red and white',
      values: {
        style: 'initial', text: 'Amelia', initial: '', initialFont: 'ultra', initialSize: 50,
        smallFont: 'pacifico', smallSize: 15, weight: 0.3, namePlace: 'middle', nameX: 0, nameY: 0, nameAngle: 0,
        thickness: 3, letterHeight: 1.2, ring: 'corner', ringHole: 5, ringWall: 2, ringGap: 0,
        initialColor: '#d8322b', letterColor: '#fbfbfb',
      },
    },
    {
      label: 'Ethan - name across an initial, yellow and green',
      values: {
        style: 'initial', text: 'Ethan', initial: '', initialFont: 'ultra', initialSize: 50,
        smallFont: 'pacifico', smallSize: 15, weight: 0.3, namePlace: 'middle', nameX: 0, nameY: 0, nameAngle: 0,
        thickness: 3, letterHeight: 1.2, ring: 'corner', ringHole: 5, ringWall: 2, ringGap: 0,
        initialColor: '#f5c518', letterColor: '#3a9a3a',
      },
    },
    {
      label: 'James - name across an initial, white and sky blue',
      values: {
        style: 'initial', text: 'James', initial: '', initialFont: 'ultra', initialSize: 50,
        smallFont: 'pacifico', smallSize: 15, weight: 0.3, namePlace: 'middle', nameX: 0, nameY: 0, nameAngle: 0,
        thickness: 3, letterHeight: 1.2, ring: 'corner', ringHole: 5, ringWall: 2, ringGap: 0,
        initialColor: '#fbfbfb', letterColor: '#3db0ea',
      },
    },
  ],
};
