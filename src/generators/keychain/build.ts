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

  const letters: readonly PlacedLetter[] = layout.letters;
  const word = layout.word;

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

  // ------------------------------------------------------------------ ring
  const ringMode = String(p.ring);
  const ringHole = Number(p.ringHole);
  const ringWall = Number(p.ringWall);
  const ring =
    ringMode === 'none'
      ? null
      : buildRing(m, body.section, {
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
  const connected = ring ? body.section.add(ring.solid) : body.section;
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
    parts.push({
      id: 'keychain',
      name: 'Keychain',
      mesh: serialize(section.extrude(thickness)),
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
      label: 'PEACE - solid, lime',
      values: {
        style: 'solid', text: 'PEACE', font: 'inter-bold', fontSize: 15,
        letterColor: '#b7e04b', thickness: 3, join: 'weld', overlap: 0.9, weldRadius: 0.7,
      },
    },
    {
      label: 'LOVE - solid, pink',
      values: {
        style: 'solid', text: 'LOVE', font: 'inter-bold', fontSize: 16,
        letterColor: '#ef4d94', thickness: 3.4, join: 'weld', overlap: 1.1, weldRadius: 0.8,
      },
    },
    {
      label: 'Name - outlined, black',
      values: {
        style: 'outline', text: 'Natasha', font: 'nunito-extrabold', fontSize: 12,
        plateColor: '#1c1c20', letterColor: '#ffffff', outlineWidth: 2.6, smooth: 1.4,
        thickness: 2.6, letterHeight: 1.2,
      },
    },
    {
      label: 'Name - outlined, red',
      values: {
        style: 'outline', text: 'Joshua', font: 'nunito-extrabold', fontSize: 12,
        plateColor: '#e14b3f', letterColor: '#ffffff', outlineWidth: 2.6, smooth: 1.4,
        thickness: 2.6, letterHeight: 1.2,
      },
    },
    {
      label: 'Name - double outline',
      values: {
        style: 'double', text: 'Dylan', font: 'nunito-extrabold', fontSize: 12,
        plateColor: '#f0a500', rimColor: '#ffffff', letterColor: '#7a4b12',
        outlineWidth: 2.2, outlineWidth2: 1.8, smooth: 1.2, thickness: 2.4,
        rimHeight: 0.8, letterHeight: 1.0,
      },
    },
    {
      label: 'Vertical zip pull',
      values: {
        style: 'solid', text: 'GYM', font: 'bebas-neue', direction: 'vertical',
        fontSize: 13, lineGap: 0, letterColor: '#4ec3e0', thickness: 3,
        join: 'weld', overlap: 0.9, weldRadius: 0.3, ringHole: 4,
      },
    },
    {
      label: 'Bag tag - vertical, outlined',
      values: {
        style: 'outline', text: 'CAMP', direction: 'vertical', fontSize: 11,
        lineGap: 1.5, outlineWidth: 2.4, smooth: 1.2,
        plateColor: '#2f6fb3', letterColor: '#f2f4f8',
      },
    },
  ],
};
