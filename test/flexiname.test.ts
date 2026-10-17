import { describe, expect, it } from 'vitest';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { cleanup, kernel, loadFont } from './kernel';
import { flexiNameGenerator } from '../src/generators/flexiname/build';
import { transformPoints } from '../src/core/build/layout';
import { coerceAll, defaultsOf } from '../src/core/params/validate';
import type { BuildCtx, BuildResult, Params, Part } from '../src/core/params/types';

function ctxFor(m: ManifoldToplevel): BuildCtx {
  return { m, font: (id) => loadFont(id), image: () => undefined, tolerance: 0.02, issue: () => {} };
}

const paramsWith = (patch: Params = {}): Params =>
  coerceAll(flexiNameGenerator, { ...defaultsOf(flexiNameGenerator), ...patch });

const errorsOf = (r: BuildResult): string[] =>
  r.issues.filter((i) => i.level === 'error').map((i) => i.message);

function solidOf(m: ManifoldToplevel, part: Part, posed: boolean): Manifold {
  const pos = posed && part.pose ? transformPoints(part.mesh.position, part.pose) : part.mesh.position;
  // Merged before import: the exported triangles repeat vertices along seams,
  // and imported unmerged they come back as a different solid -- an "I" that
  // weighs 37 mm³ more than the one that was built.
  const mesh = new m.Mesh({ numProp: 3, vertProperties: pos, triVerts: part.mesh.index });
  mesh.merge();
  return m.Manifold.ofMesh(mesh);
}

/** Each letter, back and face put back together. */
function letters(m: ManifoldToplevel, r: BuildResult, posed: boolean): Manifold[] {
  const out: Manifold[] = [];
  for (let i = 0; ; i++) {
    const back = r.parts.find((p) => p.id === `l${i}-back`);
    const face = r.parts.find((p) => p.id === `l${i}-face`);
    if (!back || !face) return out;
    out.push(solidOf(m, back, posed).add(solidOf(m, face, posed)));
  }
}

describe('hinged lettering keychain', () => {
  it('builds every preset with each letter in one piece and none touching', async () => {
    const m = await kernel();
    try {
      for (const preset of flexiNameGenerator.presets ?? []) {
        const r = flexiNameGenerator.build(paramsWith({ ...preset.values, pose: 'flat' }), ctxFor(m));
        expect(errorsOf(r), preset.label).toEqual([]);
        const ls = letters(m, r, false);
        expect(ls.length, preset.label).toBe(String(preset.values.text).length);
        ls.forEach((l, i) => {
          const pieces = l.decompose().filter((p) => p.volume() > 0.05).length;
          expect(pieces, `${preset.label}: letter ${i} came apart`).toBe(1);
        });
        // Printed in place, so every pair has to be apart already -- pin in
        // its hole, knuckles in their reliefs.
        for (let i = 0; i < ls.length; i++) {
          for (let k = i + 1; k < ls.length; k++) {
            expect(ls[i]!.intersect(ls[k]!).volume(), `${preset.label}: ${i} and ${k} fused`).toBeLessThan(1e-3);
          }
        }
      }
    } finally {
      cleanup();
    }
  });

  it('curls side to side and rolls up and down to its full swing without neighbours colliding', async () => {
    const m = await kernel();
    try {
      for (const text of ['ETHAN', 'MASON', 'LIAM', 'WAVE']) {
        for (const pose of [{ pose: 'curve', bend: 45 }, { pose: 'arch', tilt: 45 }]) {
          // 45 is past the limit for these proportions, so this is the clamp.
          const r = flexiNameGenerator.build(paramsWith({ text, ...pose }), ctxFor(m));
          expect(errorsOf(r), text).toEqual([]);
          const ls = letters(m, r, true);
          for (let i = 0; i + 1 < ls.length; i++) {
            expect(ls[i]!.intersect(ls[i + 1]!).volume(), `${text} ${pose.pose}: ${i} hit ${i + 1}`).toBeLessThan(0.02);
          }
          // On the table, not floating over it or sunk into it.
          const minZ = Math.min(...ls.map((l) => l.boundingBox().min[2]));
          expect(Math.abs(minZ), `${text} ${pose.pose}`).toBeLessThan(0.05);
        }
      }
    } finally {
      cleanup();
    }
  });

  it('exports every part as the solid it was built as', async () => {
    const m = await kernel();
    try {
      // A feature ending exactly on the colour change leaves a zero-thickness
      // sheet in the face part: the kernel's volume ignores it, the triangles
      // a slicer reads do not.
      for (const text of ['LIAM', 'ETHAN']) {
        const r = flexiNameGenerator.build(paramsWith({ text, pose: 'flat' }), ctxFor(m));
        for (const part of r.parts) {
          expect(solidOf(m, part, false).volume(), `${text} ${part.id}`).toBeCloseTo(part.mesh.stats!.volumeMm3, 1);
        }
      }
    } finally {
      cleanup();
    }
  });

  it('keeps every pin captive in its knuckles', async () => {
    const m = await kernel();
    try {
      const r = flexiNameGenerator.build(paramsWith({ text: 'ETHAN', pose: 'flat' }), ctxFor(m));
      const ls = letters(m, r, false);
      // Pull each letter straight off its neighbour, along the word and
      // straight up: a captive ball cannot leave without passing through it.
      for (let i = 0; i + 1 < ls.length; i++) {
        expect(ls[i]!.translate([-1.5, 0, 0]).intersect(ls[i + 1]!).volume(), `${i} pulls out sideways`).toBeGreaterThan(0.05);
        expect(ls[i]!.translate([0, 0, 1.5]).intersect(ls[i + 1]!).volume(), `${i} lifts out`).toBeGreaterThan(0.05);
      }
      expect(r.readouts?.Joints).toBe('4 hinges');
    } finally {
      cleanup();
    }
  });

  it('keeps the print flat and straight whatever the pose', async () => {
    const m = await kernel();
    try {
      const r = flexiNameGenerator.build(paramsWith({ pose: 'hang' }), ctxFor(m));
      for (const part of r.parts) {
        const z = part.mesh.position.filter((_, i) => i % 3 === 2);
        expect(Math.min(...z)).toBeGreaterThanOrEqual(-1e-4);
        expect(Math.max(...z)).toBeLessThanOrEqual(10 + 1e-4);
      }
    } finally {
      cleanup();
    }
  });
});
