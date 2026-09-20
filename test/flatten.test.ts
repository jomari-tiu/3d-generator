import { describe, expect, it } from 'vitest';
import { commandsToRings, ringArea, type PathCommand } from '../src/core/text/flatten';

// Pure ring maths -- no kernel, no fonts. These lock in the three opentype.js
// quirks that silently produce garbage if mishandled.
describe('commandsToRings', () => {
  const square: PathCommand[] = [
    { type: 'M', x: 0, y: 0 },
    { type: 'L', x: 10, y: 0 },
    { type: 'L', x: 10, y: 10 },
    { type: 'L', x: 0, y: 10 },
    { type: 'Z' },
  ];

  it('un-negates Y, because getPath emits screen space', () => {
    const [ring] = commandsToRings(square, 0.02);
    expect(ring).toBeDefined();
    // Input y values were 0 and 10; output must be 0 and -10.
    const ys = ring!.map((p) => p[1]);
    // toBeCloseTo, not toBe: negating 0 yields -0, which fails Object.is.
    expect(Math.min(...ys)).toBeCloseTo(-10, 10);
    expect(Math.max(...ys)).toBeCloseTo(0, 10);
  });

  it('closes a ring even when the Z command is missing', () => {
    // getPath DROPS Z for fill-only paths, so a new M must close the previous
    // ring and end-of-stream must close the last one.
    const noZ = square.slice(0, -1);
    const rings = commandsToRings(noZ, 0.02);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(4);
  });

  it('splits multiple contours on M, so counters become their own rings', () => {
    const withHole: PathCommand[] = [
      ...square.slice(0, -1),
      { type: 'M', x: 3, y: 3 },
      { type: 'L', x: 7, y: 3 },
      { type: 'L', x: 7, y: 7 },
      { type: 'L', x: 3, y: 7 },
    ];
    const rings = commandsToRings(withHole, 0.02);
    expect(rings).toHaveLength(2);
    expect(rings[1]).toHaveLength(4);
  });

  it('drops the duplicate closing point', () => {
    const explicit: PathCommand[] = [...square.slice(0, -1), { type: 'L', x: 0, y: 0 }, { type: 'Z' }];
    const rings = commandsToRings(explicit, 0.02);
    expect(rings[0]).toHaveLength(4); // not 5
  });

  it('discards degenerate contours with fewer than three points', () => {
    const sliver: PathCommand[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 5, y: 0 },
      { type: 'Z' },
    ];
    expect(commandsToRings(sliver, 0.02)).toHaveLength(0);
  });

  it('flattens curves finer as the tolerance tightens', () => {
    const curve: PathCommand[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 0, y1: 10, x2: 10, y2: 10, x: 10, y: 0 },
      { type: 'L', x: 5, y: -5 },
      { type: 'Z' },
    ];
    const coarse = commandsToRings(curve, 0.2)[0]!.length;
    const fine = commandsToRings(curve, 0.005)[0]!.length;
    expect(fine).toBeGreaterThan(coarse);
  });

  it('keeps a flattened circle within tolerance of the true radius', () => {
    // Quarter arcs as quadratics, radius 10. The sagitta of each chord must
    // stay inside the requested tolerance.
    const eps = 0.02;
    const k = 10 * (4 / 3) * (Math.SQRT2 - 1); // cubic circle constant
    const cmds: PathCommand[] = [
      { type: 'M', x: 10, y: 0 },
      { type: 'C', x1: 10, y1: k, x2: k, y2: 10, x: 0, y: 10 },
      { type: 'C', x1: -k, y1: 10, x2: -10, y2: k, x: -10, y: 0 },
      { type: 'C', x1: -10, y1: -k, x2: -k, y2: -10, x: 0, y: -10 },
      { type: 'C', x1: k, y1: -10, x2: 10, y2: -k, x: 10, y: 0 },
      { type: 'Z' },
    ];
    const ring = commandsToRings(cmds, eps)[0]!;
    for (const [x, y] of ring) {
      expect(Math.hypot(x, y)).toBeGreaterThan(10 - eps * 3);
      expect(Math.hypot(x, y)).toBeLessThan(10 + eps * 3);
    }
  });

  it('reports winding via signed area', () => {
    // The Y-flip reverses the input winding, which is exactly why the kernel
    // is handed NonZero (sign-agnostic) rather than Positive.
    const ccw = ringArea([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    expect(ccw).toBeGreaterThan(0);
    expect(ringArea([...([[0, 0], [10, 0], [10, 10], [0, 10]] as [number, number][])].reverse())).toBeLessThan(0);
  });
});
