import type { Vec2 } from '../text/flatten';
import { rotateRings, thickPolyline } from './geom';
import type { LineKind, Rings } from './types';

export interface LineOptions {
  readonly kind: LineKind;
  /** PERPENDICULAR period: stroke plus gap, measured across the lines. */
  readonly cell: number;
  /** Clear space between neighbouring strokes, measured perpendicular. */
  readonly gap: number;
  readonly radius: number;
  readonly tolerance: number;
}

/** Knurling is cut at 30 degrees to the axis, not 45. That is what makes it read as knurl. */
const KNURL_ANGLE = 30;
const CROSSHATCH_ANGLE = 45;

/**
 * Stroke patterns, all sized so `gap` is the clear space ACROSS the strokes.
 *
 * That is the only reading of "gap" that survives a sloping pattern, and
 * getting it right is why chevron and wave compute their row spacing instead of
 * declaring it. A row of 45-degree arms stacked `cell` apart vertically is only
 * cell/sqrt(2) apart perpendicular, so the strokes would run into each other at
 * a gap the control says is still open. Each family divides its vertical pitch
 * by the cosine of its own steepest slope, so one number means one thing across
 * all five.
 */
export function lines(o: LineOptions): Rings {
  const stroke = Math.max(0.05, o.cell - o.gap);
  const span = o.radius * 1.6;

  switch (o.kind) {
    case 'ribs':
      return straightSet(o, stroke, span, 0);

    case 'crosshatch':
      return [
        ...straightSet(o, stroke, span, CROSSHATCH_ANGLE),
        ...straightSet(o, stroke, span, -CROSSHATCH_ANGLE),
      ];

    case 'knurl':
      return [
        ...straightSet(o, stroke, span, KNURL_ANGLE),
        ...straightSet(o, stroke, span, -KNURL_ANGLE),
      ];

    case 'chevron': {
      // 45-degree arms, so the run and the rise are equal and the vertical
      // pitch has to open up by sqrt(2) to keep `cell` perpendicular.
      const run = o.cell * 2;
      const pitch = o.cell * Math.SQRT2;
      const rows = Math.ceil(span / pitch) + 1;
      const steps = Math.ceil(span / run) + 1;
      const out: Rings = [];
      for (let j = -rows; j <= rows; j++) {
        const pts: Vec2[] = [];
        for (let k = -steps; k <= steps; k++) {
          pts.push([k * run, j * pitch + ((k & 1) === 0 ? -run / 2 : run / 2)]);
        }
        const ring = thickPolyline(pts, stroke);
        if (ring.length >= 3) out.push(ring);
      }
      return out;
    }

    case 'wave': {
      const wavelength = o.cell * 4;
      const amplitude = o.cell;
      const slope = (2 * Math.PI * amplitude) / wavelength;
      const pitch = o.cell * Math.hypot(1, slope);
      const rows = Math.ceil(span / pitch) + 1;
      // Sample the sine at the chord tolerance, not at a fixed count: a long
      // shallow wave needs far fewer points than a short steep one.
      const perWave = Math.max(
        8,
        Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - o.tolerance / Math.max(amplitude, 1e-6)))),
      );
      const step = wavelength / Math.min(128, perWave);
      const out: Rings = [];
      for (let j = -rows; j <= rows; j++) {
        const pts: Vec2[] = [];
        for (let x = -span; x <= span + step; x += step) {
          pts.push([x, j * pitch + amplitude * Math.sin((2 * Math.PI * x) / wavelength)]);
        }
        const ring = thickPolyline(pts, stroke);
        if (ring.length >= 3) out.push(ring);
      }
      return out;
    }
  }
}

/** Parallel strokes at `degrees`, period `cell`, covering the disc. */
function straightSet(o: LineOptions, stroke: number, span: number, degrees: number): Rings {
  const rows = Math.ceil(span / o.cell) + 1;
  const out: Rings = [];
  for (let j = -rows; j <= rows; j++) {
    const y = j * o.cell;
    out.push([
      [-span, y - stroke / 2],
      [span, y - stroke / 2],
      [span, y + stroke / 2],
      [-span, y + stroke / 2],
    ]);
  }
  return degrees === 0 ? out : rotateRings(out, degrees);
}
