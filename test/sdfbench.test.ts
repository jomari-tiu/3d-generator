import { it, expect } from 'vitest';
import { cleanup, kernel } from './kernel';

/** Smooth minimum -- the blend that makes an SDF figure look organic. */
function smin(a: number, b: number, k: number): number {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b * (1 - h) + a * h - k * h * (1 - h);
}

it('benchmarks levelSet for a chibi-shaped SDF', async () => {
  const m = await kernel();
  try {
    const sphere = (p: number[], c: number[], r: number) =>
      Math.hypot(p[0]! - c[0]!, p[1]! - c[1]!, p[2]! - c[2]!) - r;

    // Rough chibi: big head, small body, stubby limbs.
    const sdf = (p: number[]): number => {
      let d = sphere(p, [0, 0, 42], 16);           // head
      d = smin(d, sphere(p, [0, 0, 20], 11), 4);   // torso
      d = smin(d, sphere(p, [-11, 0, 22], 4.5), 3); // arms
      d = smin(d, sphere(p, [11, 0, 22], 4.5), 3);
      d = smin(d, sphere(p, [-5, 0, 6], 5), 3);    // legs
      d = smin(d, sphere(p, [5, 0, 6], 5), 3);
      return d;
    };

    const bounds = { min: [-24, -20, -2] as [number, number, number], max: [24, 20, 62] as [number, number, number] };
    for (const edge of [1.5, 1.0, 0.7, 0.5]) {
      const t0 = performance.now();
      const solid = m.Manifold.levelSet(sdf as never, bounds as never, edge);
      const ms = performance.now() - t0;
      console.log(
        `edge=${edge}mm  ${ms.toFixed(0)}ms  tris=${solid.numTri()}  vol=${(solid.volume() / 1000).toFixed(1)}cm3  status=${solid.status()}  genus=${solid.genus()}`,
      );
      expect(solid.volume()).toBeGreaterThan(0);
    }
  } finally {
    cleanup();
  }
}, 120_000);
