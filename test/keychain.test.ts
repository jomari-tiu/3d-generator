import { describe, expect, it } from 'vitest';
import type { ManifoldToplevel } from 'manifold-3d';
import { cleanup, kernel, loadFont } from './kernel';
import { keychainGenerator } from '../src/generators/keychain/build';
import { islandBridges, layoutWord, looseLetters, weld } from '../src/generators/keychain/lettering';
import { buildRing } from '../src/generators/keychain/ring';
import { filletProfile } from '../src/core/kernel/primitives';
import { coerceAll, defaultsOf } from '../src/core/params/validate';
import type { BuildCtx, BuildResult, Params } from '../src/core/params/types';

function ctxFor(m: ManifoldToplevel): BuildCtx {
  return { m, font: (id) => loadFont(id), image: () => undefined, tolerance: 0.02, issue: () => {} };
}

function paramsWith(patch: Params = {}): Params {
  return coerceAll(keychainGenerator, { ...defaultsOf(keychainGenerator), ...patch });
}

const errorsOf = (r: BuildResult): string[] =>
  r.issues.filter((i) => i.level === 'error').map((i) => i.message);

/** Every part, decomposed, with the debris floor the exporter would care about. */
function pieceCounts(r: BuildResult, m: ManifoldToplevel): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of r.parts) {
    const mesh = m.Manifold.ofMesh(
      new m.Mesh({
        numProp: part.mesh.numProp,
        vertProperties: part.mesh.position,
        triVerts: part.mesh.index,
      }),
    );
    out[part.id] = mesh.decompose().filter((piece) => piece.volume() > 0.01).length;
  }
  return out;
}

describe('lettering keychain', () => {
  it('welds a solid word into exactly one piece', async () => {
    const m = await kernel();
    try {
      for (const text of ['PEACE', 'LOVE', 'Amelia', 'AVA', 'WOW']) {
        const r = keychainGenerator.build(paramsWith({ style: 'solid', text }), ctxFor(m));
        expect(errorsOf(r), `${text} built with errors`).toEqual([]);
        expect(r.readouts?.Pieces, `${text} came out loose`).toBe('One - it holds together');
        expect(pieceCounts(r, m).keychain, `${text} decomposed into fragments`).toBe(1);
      }
    } finally {
      cleanup();
    }
  });

  it('reports the loose letters rather than exporting confetti', async () => {
    const m = await kernel();
    try {
      // Natural spacing, no weld, no bar: the letters are exactly where the
      // font put them, which for a keychain means nowhere near each other.
      const r = keychainGenerator.build(
        paramsWith({ style: 'solid', text: 'PEACE', join: 'none', weldRadius: 0, ring: 'none' }),
        ctxFor(m),
      );
      const errs = errorsOf(r);
      expect(errs.length).toBe(1);
      expect(errs[0]).toMatch(/separate pieces/);
      // The message has to name the letters, or there is nothing to act on.
      expect(errs[0]).toMatch(/"E"|"A"|"C"/);
    } finally {
      cleanup();
    }
  });

  it('ties the dot on an "i" down instead of shedding it', async () => {
    const m = await kernel();
    try {
      const font = loadFont('inter-bold');
      // The tittle is its own contour inside the glyph, so no amount of
      // tightening the letters against each other ever reaches it.
      const layout = layoutWord(m, font, 'i', {
        capHeightMm: 15,
        tolerance: 0.02,
        direction: 'horizontal',
        spacingMm: 0,
        lineGapMm: 0,
        overlapMm: 0.9,
      });
      expect(layout.word.decompose().length).toBe(2);
      const strut = islandBridges(m, layout.letters[0]!.section, 1.2)!;
      expect(strut).not.toBeNull();
      expect(layout.word.add(strut).decompose().length).toBe(1);

      // And end to end, through the generator, on names that have one.
      for (const text of ['Amelia', 'Julia', 'Mia']) {
        const r = keychainGenerator.build(paramsWith({ style: 'solid', text }), ctxFor(m));
        expect(errorsOf(r), text).toEqual([]);
        expect(pieceCounts(r, m).keychain, text).toBe(1);
      }
    } finally {
      cleanup();
    }
  });

  it('joins with the bar whatever the spacing does', async () => {
    const m = await kernel();
    try {
      const r = keychainGenerator.build(
        paramsWith({ style: 'solid', text: 'PEACE', join: 'bar', letterSpacing: 3 }),
        ctxFor(m),
      );
      expect(errorsOf(r)).toEqual([]);
      expect(pieceCounts(r, m).keychain).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('the bar reaches letters that do not descend', async () => {
    const m = await kernel();
    try {
      // "dog" has one descender. A bar hung off the bounding box floor would
      // catch the "g" and leave the "d" and "o" standing on nothing.
      const r = keychainGenerator.build(
        paramsWith({ style: 'solid', text: 'dog', font: 'inter-bold', join: 'bar', letterSpacing: 2 }),
        ctxFor(m),
      );
      expect(errorsOf(r)).toEqual([]);
      expect(pieceCounts(r, m).keychain).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('bridges the gaps with the backing on the outlined styles', async () => {
    const m = await kernel();
    try {
      for (const style of ['outline', 'double']) {
        const r = keychainGenerator.build(paramsWith({ style, text: 'Natasha' }), ctxFor(m));
        expect(errorsOf(r), style).toEqual([]);
        const counts = pieceCounts(r, m);
        expect(counts.backing, `${style} backing`).toBe(1);
        // The lettering is one body per glyph -- seven in "Natasha".
        expect(counts.lettering, `${style} lettering`).toBe(7);
        if (style === 'double') expect(counts.halo).toBe(1);
      }
    } finally {
      cleanup();
    }
  });

  it('stacks the word downward when asked, and keeps it one piece', async () => {
    const m = await kernel();
    try {
      const boxOf = (r: BuildResult): { w: number; h: number } => {
        const b = r.parts[0]!.mesh.bbox;
        return { w: b.max[0] - b.min[0], h: b.max[1] - b.min[1] };
      };
      const across = keychainGenerator.build(
        paramsWith({ style: 'solid', text: 'GYM', font: 'bebas-neue' }),
        ctxFor(m),
      );
      const down = keychainGenerator.build(
        paramsWith({ style: 'solid', text: 'GYM', font: 'bebas-neue', direction: 'vertical', lineGap: 0, weldRadius: 0.3 }),
        ctxFor(m),
      );
      expect(errorsOf(down)).toEqual([]);
      expect(boxOf(across).w).toBeGreaterThan(boxOf(across).h);
      expect(boxOf(down).h).toBeGreaterThan(boxOf(down).w);
      expect(pieceCounts(down, m).keychain).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('defaults to reading across', () => {
    const spec = keychainGenerator.params.find((s) => s.id === 'direction')!;
    expect(spec.default).toBe('horizontal');
  });

  it('tightens to real contact, not to touching bounding boxes', async () => {
    const m = await kernel();
    try {
      const font = loadFont('inter-bold');
      // "AV" is the case a box test gets wrong: the boxes overlap while the
      // A's foot and the V's arm are still a long way apart.
      const opts = {
        capHeightMm: 15,
        tolerance: 0.02,
        direction: 'horizontal' as const,
        spacingMm: 0,
        lineGapMm: 0,
      };
      const loose = layoutWord(m, font, 'AV', { ...opts, overlapMm: 0 });
      const tight = layoutWord(m, font, 'AV', { ...opts, overlapMm: 0.9 });
      expect(looseLetters(loose.word, loose.letters).length).toBeGreaterThan(0);
      expect(looseLetters(tight.word, tight.letters)).toEqual([]);
      // And it did not simply overlap them into a blob.
      const w = (l: typeof loose): number => l.word.bounds().max[0] - l.word.bounds().min[0];
      expect(w(tight)).toBeLessThan(w(loose));
      expect(w(tight)).toBeGreaterThan(w(loose) * 0.6);
    } finally {
      cleanup();
    }
  });

  it('warns when the weld fillet fills the counters in', async () => {
    const m = await kernel();
    try {
      const fine = keychainGenerator.build(
        paramsWith({ style: 'solid', text: 'BOB', fontSize: 20, weldRadius: 0.4 }),
        ctxFor(m),
      );
      expect(fine.issues.some((i) => /counter/.test(i.message))).toBe(false);

      // A 2.5 mm closing spans a 5 mm gap. The counters in "B" and "O" at a
      // 7 mm cap height are nothing like that wide.
      const blob = keychainGenerator.build(
        paramsWith({ style: 'solid', text: 'BOB', fontSize: 7, weldRadius: 2.5 }),
        ctxFor(m),
      );
      expect(blob.issues.some((i) => /counter/.test(i.message))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('hangs the ring off the end the user asked for, in both directions', async () => {
    const m = await kernel();
    try {
      const boxOf = (r: BuildResult) => r.parts[0]!.mesh.bbox;
      const wordOnly = keychainGenerator.build(
        paramsWith({ style: 'solid', text: 'LOVE', ring: 'none' }),
        ctxFor(m),
      );
      const width = boxOf(wordOnly).max[0] - boxOf(wordOnly).min[0];

      const start = keychainGenerator.build(paramsWith({ style: 'solid', text: 'LOVE', ring: 'start' }), ctxFor(m));
      const end = keychainGenerator.build(paramsWith({ style: 'solid', text: 'LOVE', ring: 'end' }), ctxFor(m));
      // Both grow the part along X by about the eye, and both stay one piece.
      for (const r of [start, end]) {
        expect(errorsOf(r)).toEqual([]);
        expect(boxOf(r).max[0] - boxOf(r).min[0]).toBeGreaterThan(width);
        expect(pieceCounts(r, m).keychain).toBe(1);
      }
      // The eye is a hole, so the ring end has a genus the plain word does not.
      expect(start.parts[0]!.mesh.stats.genus).toBeGreaterThan(wordOnly.parts[0]!.mesh.stats.genus);

      const down = keychainGenerator.build(
        paramsWith({ style: 'solid', text: 'GYM', font: 'bebas-neue', direction: 'vertical', lineGap: 0, weldRadius: 0.3 }),
        ctxFor(m),
      );
      const downNoRing = keychainGenerator.build(
        paramsWith({ style: 'solid', text: 'GYM', font: 'bebas-neue', direction: 'vertical', lineGap: 0, weldRadius: 0.3, ring: 'none' }),
        ctxFor(m),
      );
      // Vertical hangs the eye ABOVE the column, so it grows in Y, not in X.
      expect(boxOf(down).max[1] - boxOf(down).min[1]).toBeGreaterThan(
        boxOf(downNoRing).max[1] - boxOf(downNoRing).min[1] + 2,
      );
      expect(pieceCounts(down, m).keychain).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('attaches the ring to a letter that has no material at its corner', async () => {
    const m = await kernel();
    try {
      // "A" at the start: the far left of it exists only near the baseline, so
      // an eye hung at mid-height would be a ring attached to fresh air.
      for (const text of ['AVA', 'TOM', 'Julia']) {
        const r = keychainGenerator.build(
          paramsWith({ style: 'solid', text, join: 'bar', ring: 'start' }),
          ctxFor(m),
        );
        expect(errorsOf(r), text).toEqual([]);
        expect(pieceCounts(r, m).keychain, text).toBe(1);
      }
    } finally {
      cleanup();
    }
  });

  it('puts the eye clear of the word, not on top of it', async () => {
    const m = await kernel();
    try {
      const font = loadFont('inter-bold');
      const layout = layoutWord(m, font, 'LOVE', {
        capHeightMm: 15,
        tolerance: 0.02,
        direction: 'horizontal',
        spacingMm: 0,
        lineGapMm: 0,
        overlapMm: 0.9,
      });
      const body = weld(layout.word, 0.7);
      const ring = buildRing(m, body, {
        holeD: 5,
        wall: 2,
        gap: 0.8,
        direction: 'horizontal',
        atEnd: false,
      })!;
      expect(ring.outerD).toBeCloseTo(9, 6);
      // Eye to the left of the word, and the hole entirely inside the eye.
      expect(ring.centre[0]).toBeLessThan(body.bounds().min[0]);
      expect(ring.hole.subtract(ring.solid).area()).toBeLessThan(0.01);
      // And the neck actually reaches material.
      expect(ring.solid.intersect(body).area()).toBeGreaterThan(0.5);
    } finally {
      cleanup();
    }
  });

  it('joins the eye on a real area of material, never on a tangent', async () => {
    const m = await kernel();
    try {
      // "Joshua" is the case that found this: the "J" hooks left, so the
      // backing curves away from the neck and a fixed-depth neck came away
      // with 1.13 mm² of contact where every other preset had 8.8 -- one
      // piece by every check the exporter makes, and a joint you could break
      // with a fingernail.
      const font = loadFont('nunito-extrabold');
      const layout = layoutWord(m, font, 'Joshua', {
        capHeightMm: 12,
        tolerance: 0.02,
        direction: 'horizontal',
        spacingMm: 0,
        lineGapMm: 0,
        overlapMm: 0,
      });
      const backing = filletProfile(layout.word.offset(2.6, 'Round', 2, 48), 1.4, 32);
      const ring = buildRing(m, backing, {
        holeD: 5,
        wall: 2,
        gap: 0.8,
        direction: 'horizontal',
        atEnd: false,
      })!;
      expect(ring.jointArea).toBeGreaterThanOrEqual(ring.jointTarget);
      expect(ring.solid.intersect(backing).area()).toBeCloseTo(ring.jointArea, 2);
    } finally {
      cleanup();
    }
  });

  it('holds the eye on across a sweep of words, fonts, styles and ends', async () => {
    const m = await kernel();
    try {
      // The words are chosen for the shapes that give a neck trouble: a
      // left-hooking descender, a letter with nothing at its left corner, an
      // open bowl, a single letter, and a narrow one.
      const cases = [
        { text: 'Joshua', font: 'nunito-extrabold' },
        { text: 'AVA', font: 'inter-bold' },
        { text: 'Toby', font: 'pacifico' },
        { text: 'J', font: 'bebas-neue' },
        { text: 'Illi', font: 'roboto-slab-bold' },
        { text: 'Zoe', font: 'nunito-extrabold' },
      ];
      const styles = ['solid', 'outline', 'double'];
      const failures: string[] = [];

      for (const { text, font } of cases) {
        for (const style of styles) {
          for (const ringPos of ['start', 'end']) {
            for (const direction of ['horizontal', 'vertical']) {
              const label = `${text}/${font}/${style}/${ringPos}/${direction}`;
              const r = keychainGenerator.build(
                paramsWith({ text, font, style, ring: ringPos, direction, fontSize: 12 }),
                ctxFor(m),
              );
              const errs = errorsOf(r);
              if (errs.length > 0) failures.push(`${label}: ${errs[0]}`);
              const weak = r.issues.find((i) => /keyring eye only meets/.test(i.message));
              if (weak) failures.push(`${label}: ${weak.message}`);
              // And the part really is one body once it is a mesh.
              const counts = pieceCounts(r, m);
              const bodyId = style === 'solid' ? 'keychain' : 'backing';
              if (counts[bodyId] !== 1) {
                failures.push(`${label}: ${bodyId} came out in ${counts[bodyId]} pieces`);
              }
            }
          }
        }
      }
      expect(failures).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('cuts a tag stencil-style, every enclosed middle held in by a bridge', async () => {
    const m = await kernel();
    try {
      const base = { style: 'tag', font: 'inter-bold', direction: 'vertical', fontSize: 22, thickness: 3, tagMargin: 6 };
      for (const text of ['A', 'B', 'O', 'R', 'P', 'Q', 'D', '8']) {
        for (const tagCut of ['through', 'engrave']) {
          const r = keychainGenerator.build(paramsWith({ ...base, text, tagCut }), ctxFor(m));
          expect(errorsOf(r), `${text} ${tagCut}`).toEqual([]);
          expect(pieceCounts(r, m).tag, `${text} ${tagCut} fell apart`).toBe(1);
        }
      }
      // A counter-free letter needs no bridge at all.
      const l = keychainGenerator.build(paramsWith({ ...base, text: 'L', tagCut: 'through' }), ctxFor(m));
      expect(l.readouts?.Cut).toBe('Through, 0 stencil bridges');
    } finally {
      cleanup();
    }
  });

  it('stacks lines, fitted to one width, with the eye on top', async () => {
    const m = await kernel();
    try {
      const r = keychainGenerator.build(
        paramsWith({ style: 'outline', text: 'BEST\nMUMMY\nEVER', font: 'bebas-neue', fitLines: true, ring: 'top' }),
        ctxFor(m),
      );
      expect(errorsOf(r)).toEqual([]);
      expect(r.readouts?.Letters).toBe('13');
      // Taller than wide once stacked, where one line would be a long strip.
      const b = r.parts.find((q) => q.id === 'backing')!.mesh.bbox;
      expect(b.max[1] - b.min[1]).toBeGreaterThan(b.max[0] - b.min[0]);
      // Unfitted, MUMMY sticks out past BEST and EVER: wider overall.
      const loose = keychainGenerator.build(
        paramsWith({ style: 'outline', text: 'BEST\nMUMMY\nEVER', font: 'bebas-neue', fitLines: false, ring: 'top' }),
        ctxFor(m),
      );
      const lb = loose.parts.find((q) => q.id === 'backing')!.mesh.bbox;
      expect(lb.max[0] - lb.min[0]).toBeGreaterThan(b.max[0] - b.min[0] + 3);
    } finally {
      cleanup();
    }
  });

  it('stands a name across an initial, in one piece and two colours', async () => {
    const m = await kernel();
    try {
      for (const text of ['Amelia', 'Ryan', 'Mason', 'Sophia', 'Lily', 'James']) {
        const r = keychainGenerator.build(
          paramsWith({ style: 'initial', text, smallFont: 'pacifico', initialFont: 'ultra', weight: 0.3, ring: 'corner', ringGap: 0 }),
          ctxFor(m),
        );
        expect(errorsOf(r), `${text} built with errors`).toEqual([]);
        expect(r.readouts?.Initial).toBe(text[0]);
        expect(r.readouts?.Pieces, `${text} came out loose`).toBe('One - it holds together');
        expect(r.parts.map((p) => p.id)).toEqual(['initial', 'name']);
      }
      // Slid right off the letter, the name has nothing holding it on.
      const off = keychainGenerator.build(
        paramsWith({ style: 'initial', text: 'Ryan', initialFont: 'ultra', namePlace: 'top', nameY: 40, ring: 'none' }),
        ctxFor(m),
      );
      expect(errorsOf(off).join(' ')).toMatch(/separate pieces/);
    } finally {
      cleanup();
    }
  });

  it('takes any big letter, and puts the small text at its top, middle or foot', async () => {
    const m = await kernel();
    try {
      const nameMidY = (place: string): number => {
        const r = keychainGenerator.build(
          paramsWith({ style: 'initial', text: 'Mia', initial: 'w', initialFont: 'roboto-slab-bold', smallSize: 10, namePlace: place, ring: 'none' }),
          ctxFor(m),
        );
        expect(errorsOf(r), place).toEqual([]);
        expect(r.readouts?.Initial).toBe('W');
        const name = r.parts.find((p) => p.id === 'name')!;
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = 1; i < name.mesh.position.length; i += name.mesh.numProp) {
          lo = Math.min(lo, name.mesh.position[i]!);
          hi = Math.max(hi, name.mesh.position[i]!);
        }
        return (lo + hi) / 2;
      };
      const top = nameMidY('top');
      const middle = nameMidY('middle');
      const bottom = nameMidY('bottom');
      expect(top).toBeGreaterThan(middle + 10);
      expect(bottom).toBeLessThan(middle - 10);
    } finally {
      cleanup();
    }
  });

  it('builds every preset without errors', async () => {
    const m = await kernel();
    try {
      for (const preset of keychainGenerator.presets ?? []) {
        const r = keychainGenerator.build(paramsWith(preset.values), ctxFor(m));
        expect(errorsOf(r), preset.label).toEqual([]);
        for (const [id, n] of Object.entries(pieceCounts(r, m))) {
          expect(n, `${preset.label} / ${id}`).toBeGreaterThan(0);
        }
      }
    } finally {
      cleanup();
    }
  });
});
