import type { CrossSection, Manifold } from 'manifold-3d';
import { dropSlivers, filletProfile } from '../../core/kernel/primitives';
import { serialize } from '../../core/kernel/serialize';
import type { BuildCtx, BuildResult, Generator, Issue, Params, Part } from '../../core/params/types';
import { EmptyTextError, hasThinStrokes, missingCharacters } from '../../core/text/textSolid';
import {
  countersLost,
  islandBridges,
  joinBar,
  layoutWord,
  looseLetters,
  weld,
  type Direction,
  type PlacedLetter,
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

function outlineOf(section: CrossSection, width: number, smooth: number): CrossSection {
  // Offsetting outward already rounds the CONVEX corners. What it leaves is a
  // sharp notch wherever the outline dives back in between two letters, and a
  // closing is what takes those out -- the same offset pair that fillets
  // everything else in this project.
  return filletProfile(section.offset(width, 'Round', 2, 48), smooth, 32);
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
  const fnt = ctx.font(String(p.font));
  const style = String(p.style);
  const solid = style === 'solid';
  const isDouble = style === 'double';
  const direction = String(p.direction) as Direction;
  const cap = Number(p.fontSize);
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
      paramIds: ['font', 'text'],
    });
  }

  // --------------------------------------------------------------- the word
  let layout;
  try {
    layout = layoutWord(m, fnt, raw, {
      capHeightMm: cap,
      tolerance: ctx.tolerance,
      direction,
      spacingMm: Number(p.letterSpacing),
      lineGapMm: Number(p.lineGap),
      // Tightening is a SOLID-style concern only. On a backed keychain the
      // backing is what joins the letters, so driving them into each other
      // buys nothing and costs legibility.
      overlapMm: solid && join === 'weld' ? Number(p.overlap) : 0,
    });
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
          direction,
          atEnd: ringMode === 'end',
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
  family: { id: 'keychain', label: 'Flat letters' },
  description: 'A word as a keychain - solid letters, or letters on a backing that follows them.',
  tagline: 'Names and words as keyrings, welded into one solid piece',
  highlights: [
    'Solid letters, an outlined backing, or a double outline',
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
  fontsNeeded: (p) => [String(p.font)],
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
        message: 'A space in a solid word is a gap with nothing spanning it, so the two halves print loose. Remove it, or use one of the backed styles.',
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
        style: 'outline', text: 'MAMA', font: 'chicle', direction: 'horizontal',
        fontSize: 16, widthScale: 85, weight: 0.25, letterSpacing: 3, thickness: 3, letterHeight: 3,
        outlineWidth: 3, smooth: 2.4, ring: 'start', ringHole: 4.5, ringWall: 4, ringGap: 0,
        plateColor: '#efb7bd', letterColor: '#efb7bd',
      },
    },
    {
      // Bubbly letters packed so they overlap, every other one standing tall
      // over the low ones between; a small eye off the low layer.
      label: 'BHENG - bubbly, alternating, lavender',
      values: {
        style: 'solid', text: 'BHENG', font: 'bagel-fat-one', direction: 'horizontal',
        fontSize: 13, thickness: 6, join: 'none', letterSpacing: -1.6, weldRadius: 0.3,
        stagger: true, lowHeight: 3,
        ring: 'start', ringHole: 3.5, ringWall: 1.8, ringGap: 0.2,
        letterColor: '#a99bd8',
      },
    },
    {
      label: 'aaron - round, alternating, slate',
      values: {
        style: 'solid', text: 'aaron', font: 'coiny', direction: 'horizontal',
        fontSize: 16, thickness: 6, join: 'none', letterSpacing: -3, weldRadius: 0.3,
        stagger: true, lowHeight: 3,
        ring: 'start', ringHole: 3.5, ringWall: 1.8, ringGap: 0.2,
        letterColor: '#5d6e7e',
      },
    },
  ],
};
