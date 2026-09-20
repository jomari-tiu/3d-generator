import type { CrossSection, Manifold } from 'manifold-3d';
import type { BuildCtx } from '../../../core/params/types';
import { roundedRect } from '../../../core/kernel/primitives';
import { textOutline } from '../../../core/text/textSolid';
import {
  boneSection,
  pawSection,
  whiskerSection,
  WRAP_FIDELITY,
  wrapToWall,
  type Derived,
} from '../geometry';

/** The recessed plaque the name sits in, as a flat 2D shape. */
function plateSection(ctx: BuildCtx, d: Derived): CrossSection {
  return roundedRect(ctx.m, d.plateW, d.plateH, d.plateH * 0.3).translate([0, d.plateZ]);
}

/** Cutter for the plaque recess. */
export function plateRecess(ctx: BuildCtx, d: Derived): Manifold {
  return wrapToWall(ctx.m, d, plateSection(ctx, d), {
    from: -d.plateDepth,
    to: 6,
    atDeg: 0,
    fidelity: WRAP_FIDELITY,
  });
}

/**
 * The name, and the icons flanking it.
 *
 * Raised off the FLOOR of the recess but still below the wall surface, which is
 * what the reference does and what prints cleanly: nothing stands proud of a
 * curved wall to be knocked off, and on a multi-material machine the letters
 * are simply a second body.
 */
export interface NameResult {
  readonly solid: Manifold;
  /** Set when the flanking motif had to be dropped, with the width it needed. */
  readonly motifDroppedAt: number;
}

export function buildName(ctx: BuildCtx, d: Derived, fontId: string): NameResult | null {
  const { m } = ctx;
  if (d.nameText.length === 0) return null;

  let flat: CrossSection;
  try {
    flat = textOutline(m, ctx.font(fontId), {
      text: d.nameText,
      capHeightMm: d.nameSize,
      tolerance: ctx.tolerance,
    });
  } catch {
    return null;
  }

  const bounds = flat.bounds();
  const textW = bounds.max[0] - bounds.min[0];
  const pieces: CrossSection[] = [flat.translate([0, d.plateZ])];

  // Bones either side, inside the plaque. Whiskers go outside it, so they are
  // built separately.
  let motifDroppedAt = 0;
  if (d.motif === 'bone') {
    const len = d.nameSize * 1.2;
    const gap = textW / 2 + len * 0.7;
    const needed = 2 * (gap + len / 2) + d.plateH * 0.5;
    if (needed <= d.plateW) {
      for (const sx of [-1, 1]) {
        pieces.push(boneSection(m, len).translate([sx * gap, d.plateZ]));
      }
    } else {
      // Dropping them quietly is the wrong call: the user asked for bones and
      // would have no idea why there are none.
      motifDroppedAt = needed;
    }
  }

  return {
    solid: wrapToWall(m, d, m.CrossSection.union(pieces), {
      // From below the recess floor so it fuses to it, up to just under flush.
      from: -d.plateDepth - 0.6,
      to: -d.plateDepth + d.letterRelief,
      atDeg: 0,
      fidelity: WRAP_FIDELITY,
    }),
    motifDroppedAt,
  };
}

/** Whiskers, engraved into the wall either side of the plaque. */
export function whiskerCutter(ctx: BuildCtx, d: Derived): Manifold | null {
  const { m } = ctx;
  if (d.motif !== 'whisker') return null;

  const len = d.nameSize * 1.6;
  const w = Math.max(1, 2.5 * d.nozzle);
  const inset = d.plateW / 2 + len * 0.22;
  const depth = Math.max(2 * d.layer, 0.6);

  const one = whiskerSection(m, len, w);
  const pieces = [
    one.translate([inset, d.plateZ]),
    one.mirror([1, 0]).translate([-inset, d.plateZ]),
  ];

  return wrapToWall(m, d, m.CrossSection.union(pieces), {
    from: -depth,
    to: 4,
    atDeg: 0,
    fidelity: WRAP_FIDELITY,
  });
}

/**
 * The maker's mark, laid out flat: a paw over one or two lines of text.
 *
 * Shared by the builder and the fits-in-its-band check, on purpose. Measuring
 * the height by re-adding the pieces' nominal sizes drifts from what the layout
 * actually produces -- it under-reported by a quarter here, so the check passed
 * and the mark's top tip ran off the colour it is meant to sit on.
 */
function logoStack(ctx: BuildCtx, d: Derived, fontId: string): CrossSection | null {
  const { m } = ctx;
  const pieces: CrossSection[] = [];

  const paw = pawSection(m, d.logoSize);
  const pawB = paw.bounds();
  pieces.push(paw);
  let cursor = pawB.min[1];

  const line = (text: string, cap: number): void => {
    if (text.length === 0) return;
    try {
      const outline = textOutline(m, ctx.font(fontId), {
        text,
        capHeightMm: cap,
        tolerance: ctx.tolerance,
      });
      const b = outline.bounds();
      cursor -= cap * 0.3;
      pieces.push(outline.translate([0, cursor - b.max[1]]));
      cursor -= b.max[1] - b.min[1];
    } catch {
      // A face with no glyph for this leaves the line off rather than failing
      // the whole bowl.
    }
  };

  line(d.logoText, d.logoSize * 0.45);
  line(d.logoSub, d.logoSubCap);
  return pieces.length === 0 ? null : m.CrossSection.union(pieces);
}

/** How tall the assembled mark is, for checking it against its band. */
export function logoHeight(ctx: BuildCtx, d: Derived, fontId: string): number {
  const stack = logoStack(ctx, d, fontId);
  if (!stack) return 0;
  const b = stack.bounds();
  return b.max[1] - b.min[1];
}

/**
 * The mark, wrapped onto the lower colour band and centred in it. Entirely
 * optional, and off is off -- no recess left behind.
 */
export function buildLogo(ctx: BuildCtx, d: Derived, fontId: string): Manifold | null {
  const { m } = ctx;
  const stack = logoStack(ctx, d, fontId);
  if (!stack) return null;

  const b = stack.bounds();
  const centred = stack.translate([0, d.logoZ - (b.min[1] + b.max[1]) / 2]);

  return wrapToWall(m, d, centred, {
    from: -1.2,
    to: d.logoRelief,
    atDeg: 0,
    fidelity: WRAP_FIDELITY,
  });
}
