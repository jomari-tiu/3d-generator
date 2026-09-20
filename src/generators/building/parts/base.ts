import type { Manifold } from 'manifold-3d';
import { roundedRect, taperedExtrude } from '../../../core/kernel/primitives';
import type { BuildCtx } from '../../../core/params/types';
import { EmptyTextError, measureTextWidth, textOutline } from '../../../core/text/textSolid';
import type { Derived } from '../geometry';

/**
 * The display plinth, and the name on it.
 *
 * A battered block rather than a plain slab: the top is inset from the bottom,
 * which is what a museum plinth looks like and, less decoratively, means the
 * only horizontal edge the eye lands on is the one at the bottom, where a first
 * layer's elephant foot is invisible anyway.
 */

export interface BaseParts {
  readonly plinth: Manifold;
  /** Raised lettering, or null when there is no name or it produced no outline. */
  readonly label: Manifold | null;
  /** Cap height actually used, after any shrink to fit. */
  readonly labelHeight: number;
}

export function buildBase(ctx: BuildCtx, d: Derived, fontId: string): BaseParts {
  const { m } = ctx;
  const w = d.W + 2 * d.baseMargin;
  const h = d.D + 2 * d.baseMargin;
  const chamfer = Math.min(d.baseT * 0.6, d.baseMargin * 0.4);

  // Sits BELOW the model, so the building still stands at z = 0 and every
  // height in the readouts stays a height above ground rather than above a
  // plinth the user may switch off.
  const plinth = taperedExtrude(
    m,
    roundedRect(m, w, h, Math.min(2, d.baseMargin * 0.5)),
    d.baseT,
    (w - 2 * chamfer) / w,
    (h - 2 * chamfer) / h,
  ).translate([0, 0, -d.baseT]);

  if (d.baseText.length === 0) return { plinth, label: null, labelHeight: 0 };

  const font = ctx.font(fontId);
  // The label lives in the front margin, between the plinth edge and the
  // building. If the name is too long for the plinth, shrink it rather than
  // running it off the end -- a name that overhangs prints as loose letters.
  const bandW = w - 2 * (chamfer + 1);
  let capHeight = Math.min(d.baseTextH, Math.max(1, d.baseMargin - 2 * chamfer - 0.6));
  const wide = measureTextWidth(font, { text: d.baseText, capHeightMm: capHeight, tolerance: ctx.tolerance });
  if (wide > bandW) capHeight *= bandW / wide;
  if (capHeight < 1.2) return { plinth, label: null, labelHeight: 0 };

  try {
    const outline = textOutline(m, font, {
      text: d.baseText,
      capHeightMm: capHeight,
      tolerance: ctx.tolerance,
    });
    const y = -(d.D / 2 + d.baseMargin / 2);
    const label = outline
      // Reaching a touch INTO the plinth top, not balanced on it. Lettering
      // that merely meets the face it stands on is the loose-shell failure this
      // project has hit more than once.
      .extrude(d.baseRelief + 2 * d.layer)
      .translate([0, y, -2 * d.layer]);
    return { plinth, label, labelHeight: capHeight };
  } catch (err) {
    if (err instanceof EmptyTextError) return { plinth, label: null, labelHeight: 0 };
    throw err;
  }
}
