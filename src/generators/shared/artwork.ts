import type { CrossSection } from 'manifold-3d';
import { EmptyTraceError, sectionFromRings } from '../../core/image/section';
import { traceBitmap, type TraceResult } from '../../core/image/trace';
import type { Background, Bitmap, DiagonalPolicy, MaskSource } from '../../core/image/types';
import type { BuildCtx, Issue, Params } from '../../core/params/types';

export interface Artwork {
  readonly bmp: Bitmap;
  readonly trace: TraceResult;
  /** The traced shape in millimetres, Y up, centred on the origin. */
  readonly art: CrossSection;
  readonly mmPerPixel: number;
  /** Traced extent in pixels. */
  readonly pxW: number;
  readonly pxH: number;
}

/**
 * The picture under `p.image`, traced with the shared picture and tracing
 * controls and scaled into millimetres -- or the issue explaining why not.
 *
 * Every way this can fail is an ordinary thing for a user to do (a link opened
 * on another machine, a threshold dragged to blank, artwork too fine for the
 * size), so each comes back as an issue to show rather than an exception for
 * the runner. `scale` gets the traced extent in pixels and answers mm per
 * pixel, because only the generator knows what the artwork is being fitted to.
 */
export function traceArtwork(
  p: Params,
  ctx: BuildCtx,
  scale: (pxW: number, pxH: number) => number,
  /** The control that sets the artwork's size, for the too-fine message to point at. */
  sizeParam = 'width',
): { readonly artwork: Artwork } | { readonly issues: readonly Issue[] } {
  const id = String(p.image ?? '');
  const bmp = ctx.image(id);
  if (!bmp) {
    return {
      issues: [
        {
          level: 'error',
          message:
            id.length > 0
              ? 'That picture is not on this device. Images stay on the machine they were dropped into, so a shared link brings the settings but not the artwork - drop the file in again.'
              : 'Drop a picture in to trace.',
          paramIds: ['image'],
        },
      ],
    };
  }

  const trace = traceBitmap(bmp, {
    source: String(p.source) as MaskSource,
    threshold: Number(p.threshold),
    invert: p.invert === true,
    despeckle: Number(p.despeckle),
    // Only generators that offer the control get anything but 'keep'.
    background: (p.background === undefined ? 'keep' : String(p.background)) as Background,
    diagonal: String(p.diagonal) as DiagonalPolicy,
    detail: Number(p.detail),
    smooth: Number(p.smooth) / 100,
    cornerAngle: Number(p.cornerAngle),
  });

  if (!trace.bounds) {
    return {
      issues: [
        {
          level: 'error',
          message:
            'Nothing came through at this threshold - the whole picture read as blank paper. Move the threshold, or turn Invert on if the artwork is light on a dark background.',
          paramIds: ['threshold', 'invert', 'source'],
        },
      ],
    };
  }

  const pxW = trace.bounds.max[0] - trace.bounds.min[0];
  const pxH = trace.bounds.max[1] - trace.bounds.min[1];
  if (!(pxW > 0) || !(pxH > 0)) {
    return {
      issues: [{ level: 'error', message: 'That traced to a single line with no area.', paramIds: ['threshold'] }],
    };
  }

  const mmPerPixel = scale(pxW, pxH);
  let art: CrossSection;
  try {
    art = sectionFromRings(ctx.m, trace.rings, { mmPerPixel, tolerance: ctx.tolerance });
  } catch (err) {
    // Rings with area in pixels can still flatten to nothing once they are
    // scaled into millimetres and cleaned at the build tolerance. That is a
    // thing to explain, not a crash to hand to the runner.
    if (!(err instanceof EmptyTraceError)) throw err;
    return {
      issues: [
        {
          level: 'error',
          message:
            'What came through is too fine to survive at this size. Make the artwork bigger, or raise Despeckle to drop the specks.',
          paramIds: [sizeParam, 'despeckle', 'threshold'],
        },
      ],
    };
  }

  return { artwork: { bmp, trace, art, mmPerPixel, pxW, pxH } };
}

/** Warning for a threshold that has taken nearly the whole picture as ink. */
export function floodedIssue(trace: TraceResult): Issue | null {
  if (trace.inkFraction <= 0.92) return null;
  return {
    level: 'warn',
    message:
      'Almost the whole picture is reading as ink, so this is tracing as little more than a rectangle. Move the threshold down, or turn Invert off.',
    paramIds: ['threshold', 'invert', 'source'],
  };
}
