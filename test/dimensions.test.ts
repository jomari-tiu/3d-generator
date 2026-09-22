import { describe, expect, it } from 'vitest';
import { dimensionDrawing, mm, type Vec3 } from '../src/ui/dimensions';

/** Every point the drawing touches, as triples. */
function points(seg: Float32Array): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < seg.length; i += 3) out.push([seg[i]!, seg[i + 1]!, seg[i + 2]!]);
  return out;
}

describe('preview dimensions', () => {
  const MIN: Vec3 = [-30, -20, 0];
  const MAX: Vec3 = [30, 20, 50];

  it('measures the box it was given, on the right axes', () => {
    const d = dimensionDrawing(MIN, MAX)!;
    expect(d.size).toEqual([60, 40, 50]);
    // Each label names its own axis's span. Getting depth and height the wrong
    // way round is the single easiest mistake here and the hardest to see in a
    // screenshot, because both numbers are plausible.
    expect(d.labels.map((l) => [l.axis, l.text])).toEqual([
      ['x', '60.0 mm'],
      ['y', '40.0 mm'],
      ['z', '50.0 mm'],
    ]);
  });

  it('puts each label on the middle of the edge it measures', () => {
    const d = dimensionDrawing(MIN, MAX)!;
    const by = (axis: string) => d.labels.find((l) => l.axis === axis)!;
    // Width label centred in x, held off the front; depth centred in y, held
    // off the right; height centred in z, out at the front-right corner.
    expect(by('x').at[0]).toBeCloseTo(0, 6);
    expect(by('x').at[1]).toBeLessThan(MIN[1]);
    expect(by('y').at[1]).toBeCloseTo(0, 6);
    expect(by('y').at[0]).toBeGreaterThan(MAX[0]);
    expect(by('z').at[2]).toBeCloseTo(25, 6);
    expect(by('z').at[0]).toBeGreaterThan(MAX[0]);
    expect(by('z').at[1]).toBeLessThan(MIN[1]);
  });

  it('separates the three dimensions so a flat part stays readable', () => {
    // A name tag: 51 x 20 x 3.6. Its depth and height are both short, and if
    // they are hung off the same corner the two labels sit on top of each other
    // and neither number can be read.
    const d = dimensionDrawing([0, 0, 0], [51.5, 20.2, 3.6])!;
    const at = (axis: string) => d.labels.find((l) => l.axis === axis)!.at;
    const apart = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const label = 51.5 * 0.07;
    for (const [p, q] of [['x', 'y'], ['x', 'z'], ['y', 'z']] as const) {
      expect(apart(at(p), at(q)), `${p} and ${q} labels`).toBeGreaterThan(label);
    }
  });

  it('keeps the lines clear of the model but anchored to it', () => {
    const d = dimensionDrawing(MIN, MAX)!;
    const pts = points(d.segments);
    // Nothing is drawn through the middle of the model: every point is either
    // on the bounding box or outside it in -y / +x. A dimension line crossing
    // the part it measures is worse than no dimension line.
    for (const [x, y, z] of pts) {
      const inside =
        x > MIN[0] + 1e-6 && x < MAX[0] - 1e-6 &&
        y > MIN[1] + 1e-6 && y < MAX[1] - 1e-6 &&
        z > MIN[2] + 1e-6 && z < MAX[2] - 1e-6;
      expect(inside, `point ${x},${y},${z} is inside the model`).toBe(false);
    }
    // ...and the extension lines really do touch the corners they measure, so
    // the drawing is anchored rather than floating beside the model.
    const touches = (want: Vec3) =>
      pts.some((p) => Math.hypot(p[0] - want[0], p[1] - want[1], p[2] - want[2]) < 1e-6);
    expect(touches([MIN[0], MIN[1], MIN[2]])).toBe(true);
    expect(touches([MAX[0], MIN[1], MIN[2]])).toBe(true);
    expect(touches([MAX[0], MAX[1], MIN[2]])).toBe(true);
    expect(touches([MAX[0], MIN[1], MAX[2]])).toBe(true);
  });

  it('scales its offsets with the model, not with the millimetre', () => {
    const small = dimensionDrawing([0, 0, 0], [10, 10, 10])!;
    const big = dimensionDrawing([0, 0, 0], [500, 500, 500])!;
    const reach = (d: ReturnType<typeof dimensionDrawing>) =>
      Math.max(...points(d!.segments).map((p) => p[0]));
    // A fixed offset would bury the drawing inside a 500 mm model and strand it
    // a long way from a 10 mm one.
    expect(reach(small) / 10).toBeCloseTo(reach(big) / 500, 2);
  });

  it('refuses a box with nothing in it', () => {
    expect(dimensionDrawing([0, 0, 0], [0, 0, 0])).toBeNull();
    // An empty Box3 arrives as +Infinity min and -Infinity max; a drawing of
    // that is a buffer full of NaN, which a renderer does not survive.
    expect(dimensionDrawing([Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]))
      .toBeNull();
    for (const v of dimensionDrawing(MIN, MAX)!.segments) expect(Number.isFinite(v)).toBe(true);
  });

  it('writes millimetres the way a caliper reads them', () => {
    expect(mm(9.55)).toBe('9.6');
    expect(mm(40)).toBe('40.0');
    // Tenths stop being meaningful once a number is this big, and four
    // significant figures in a label is just noise.
    expect(mm(100)).toBe('100');
    expect(mm(256.4)).toBe('256');
  });
});
