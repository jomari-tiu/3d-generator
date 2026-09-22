/**
 * Dimension lines for whatever is on screen: the drawing, worked out as pure
 * arithmetic on a bounding box.
 *
 * Kept out of the viewer, and out of three.js, so it can be tested the way the
 * rest of the geometry in this project is -- a WebGL context is a terrible
 * place to find out that the height dimension is measuring the depth.
 */

export type Vec3 = readonly [number, number, number];

export interface DimLabel {
  readonly text: string;
  readonly at: Vec3;
  /** Which axis this label belongs to, for tests and for tooltips. */
  readonly axis: 'x' | 'y' | 'z';
}

export interface DimDrawing {
  /** Line segments as flat xyz pairs, ready for a BufferAttribute. */
  readonly segments: Float32Array;
  readonly labels: readonly DimLabel[];
  readonly size: Vec3;
}

/** Millimetres, written the way a caliper reads them. */
export function mm(v: number): string {
  return v >= 100 ? v.toFixed(0) : v.toFixed(1);
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const mid = (a: Vec3, b: Vec3): Vec3 => mul(add(a, b), 0.5);

function norm(a: Vec3): Vec3 {
  const len = Math.hypot(a[0], a[1], a[2]);
  return len < 1e-9 ? [0, 0, 0] : mul(a, 1 / len);
}

/**
 * Width along the front-bottom edge, depth up the right-bottom edge, height
 * standing off the front-right corner: the three edges of the box that a Z-up
 * camera at the default angle can see at once, so no dimension is hiding round
 * the back of the model it is measuring.
 *
 * Returns null for an empty or degenerate box rather than a drawing of
 * nothing, which would otherwise reach the renderer as NaNs.
 */
export function dimensionDrawing(min: Vec3, max: Vec3): DimDrawing | null {
  const size: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const span = Math.max(size[0], size[1], size[2]);
  if (!Number.isFinite(span) || span < 1e-6) return null;

  const gap = span * 0.07;
  const tick = span * 0.02;
  const pts: number[] = [];
  const labels: DimLabel[] = [];

  const line = (a: Vec3, b: Vec3): void => {
    pts.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  };

  /**
   * One dimension: the line, a slash at each end, and an extension line back to
   * each end of the feature being measured.
   *
   * Slashes rather than arrowheads. An arrowhead is drawn in a plane and turns
   * into a line the moment you orbit round to look along that plane; a slash is
   * two points and reads from anywhere.
   */
  const dim = (from: Vec3, to: Vec3, anchorA: Vec3, anchorB: Vec3, axis: 'x' | 'y' | 'z'): void => {
    line(from, to);
    const along = norm(sub(to, from));
    const away = norm(sub(from, anchorA));
    const slash = mul(norm(add(along, away)), tick);
    line(sub(from, slash), add(from, slash));
    line(sub(to, slash), add(to, slash));
    // Extension lines overshoot the dimension line a little, the way they do on
    // a drawing, so where the measurement ends is unambiguous.
    line(anchorA, add(from, mul(norm(sub(from, anchorA)), tick * 0.8)));
    line(anchorB, add(to, mul(norm(sub(to, anchorB)), tick * 0.8)));
    labels.push({ text: `${mm(size[axis === 'x' ? 0 : axis === 'y' ? 1 : 2])} mm`, at: mid(from, to), axis });
  };

  dim(
    [min[0], min[1] - gap, min[2]],
    [max[0], min[1] - gap, min[2]],
    [min[0], min[1], min[2]],
    [max[0], min[1], min[2]],
    'x',
  );
  dim(
    [max[0] + gap, min[1], min[2]],
    [max[0] + gap, max[1], min[2]],
    [max[0], min[1], min[2]],
    [max[0], max[1], min[2]],
    'y',
  );
  // The height stands off TWICE as far as the other two. At one gap it shares
  // the front-right corner with the depth dimension, and on a flat part -- a
  // name tag is 51 x 20 x 3.6 -- the two labels land on top of each other and
  // neither can be read. Three different offsets, three readable dimensions.
  dim(
    [max[0] + gap * 2, min[1] - gap * 2, min[2]],
    [max[0] + gap * 2, min[1] - gap * 2, max[2]],
    [max[0], min[1], min[2]],
    [max[0], min[1], max[2]],
    'z',
  );

  return { segments: new Float32Array(pts), labels, size };
}
