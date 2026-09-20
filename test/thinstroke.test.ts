import { describe, expect, it } from 'vitest';
import { cleanup, kernel, loadFont } from './kernel';
import { THIN_STROKE_LIMIT, textOutline, thinStrokeLoss } from '../src/core/text/textSolid';

/**
 * Locks in the separation the threshold depends on. If a Clipper2 or offset
 * change erodes the gap between "prints fine" and "genuinely too thin", this
 * fails rather than silently turning the warning into noise (or silence).
 */
describe('thin-stroke detection', () => {
  it('flags sub-nozzle strokes and leaves printable text alone', async () => {
    const m = await kernel();
    try {
      const nozzle = 0.4;

      // Known-bad: a script face, and any face at 3mm cap height.
      const tooThin: [string, number][] = [
        ['pacifico', 3],
        ['pacifico', 4],
        ['inter-bold', 3],
        ['nunito-extrabold', 3],
      ];
      for (const [id, cap] of tooThin) {
        const loss = thinStrokeLoss(
          textOutline(m, loadFont(id), { text: 'oaB8g', capHeightMm: cap }),
          nozzle,
        );
        expect(loss, `${id} @${cap}mm should be flagged`).toBeGreaterThan(THIN_STROKE_LIMIT);
      }

      // Known-good: bold faces at sensible sizes must not cry wolf.
      const fine: [string, number][] = [
        ['inter-bold', 6],
        ['inter-bold', 12],
        ['inter-bold', 24],
        ['nunito-extrabold', 4],
        ['roboto-slab-bold', 6],
        ['roboto-slab-bold', 12],
        ['pacifico', 8],
        ['bebas-neue', 8],
      ];
      for (const [id, cap] of fine) {
        const loss = thinStrokeLoss(
          textOutline(m, loadFont(id), { text: 'oaB8g', capHeightMm: cap }),
          nozzle,
        );
        expect(loss, `${id} @${cap}mm should NOT be flagged`).toBeLessThan(THIN_STROKE_LIMIT);
      }
    } finally {
      cleanup();
    }
  });

  it('scales with nozzle diameter', async () => {
    const m = await kernel();
    try {
      const s = textOutline(m, loadFont('inter-bold'), { text: 'oaB8g', capHeightMm: 6 });
      // A fat nozzle cannot render text that a fine one manages.
      expect(thinStrokeLoss(s, 0.2)).toBeLessThan(thinStrokeLoss(s, 0.8));
    } finally {
      cleanup();
    }
  });
});
