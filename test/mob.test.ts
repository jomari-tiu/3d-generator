import { describe, expect, it } from 'vitest';
import type { ManifoldToplevel } from 'manifold-3d';
import { cleanup, kernel, loadFont } from './kernel';
import { mobClickerGenerator } from '../src/generators/keyclicker/mob';
import { MOBS } from '../src/generators/keyclicker/mobs';
import { coerceAll, defaultsOf } from '../src/core/params/validate';
import type { BuildCtx, BuildResult, Params } from '../src/core/params/types';

function ctxFor(m: ManifoldToplevel): BuildCtx {
  return { m, font: (id) => loadFont(id), image: () => undefined, tolerance: 0.02, issue: () => {} };
}
const paramsWith = (patch: Params = {}): Params =>
  coerceAll(mobClickerGenerator, { ...defaultsOf(mobClickerGenerator), ...patch });

const solidOf = (m: ManifoldToplevel, mesh: { numProp: number; position: Float32Array; index: Uint32Array }) =>
  m.Manifold.ofMesh({ numProp: mesh.numProp, vertProperties: mesh.position, triVerts: mesh.index });
/** A part where it sits in the clicker's own frame (before the face-forward turn). */
const placed = (m: ManifoldToplevel, r: BuildResult, id: string, push = 0) => {
  const part = r.parts.find((x) => x.id === id)!;
  const [x, y, z] = part.assembly ?? [0, 0, 0];
  return solidOf(m, part.mesh).translate([x, y, z - push]);
};

describe('mob faces', () => {
  it('are 8 x 8, use only their own colours, and keep to four filaments', () => {
    for (const [id, mob] of Object.entries(MOBS)) {
      expect(mob.face, id).toHaveLength(8);
      for (const row of mob.face) {
        expect(row, id).toHaveLength(8);
        for (const ch of row) expect(Object.keys(mob.palette), `${id} ${ch}`).toContain(ch);
      }
      expect(mob.palette[mob.base], id).toBeDefined();
      expect(new Set([mob.body, ...Object.values(mob.palette)]).size, id).toBeLessThanOrEqual(4);
    }
  });
});

describe('mob clicker', () => {
  it('builds every mob: a one-piece cube body, and a head with its face flush in it', async () => {
    const m = await kernel();
    try {
      for (const mob of Object.keys(MOBS)) {
        const r = mobClickerGenerator.build(paramsWith({ mob }), ctxFor(m));
        expect(r.issues.filter((i) => i.level === 'error'), mob).toEqual([]);
        const body = solidOf(m, r.parts.find((x) => x.id === 'body')!.mesh);
        expect(body.decompose().length, mob).toBe(1);

        // A cube, give or take the extra above the head: as deep as it is wide.
        const bb = body.boundingBox();
        const w = bb.max[0] - bb.min[0];
        expect(bb.max[2] - bb.min[2], `${mob} depth`).toBeCloseTo(w, 0);

        // The face: every inlay is flush with the head and shares no space
        // with it, and head plus inlays is the whole cap, square-faced.
        const head = solidOf(m, r.parts.find((x) => x.id === 'head')!.mesh);
        expect(head.decompose().length, `${mob} head`).toBe(1);
        const faces = r.parts.filter((x) => x.id.startsWith('face-')).map((x) => solidOf(m, x.mesh));
        expect(faces.length, mob).toBe(Object.keys(MOBS[mob]!.palette).length - 1);
        for (const f of faces) {
          expect(f.intersect(head).volume(), mob).toBeLessThan(0.01);
          expect(f.boundingBox().max[2], mob).toBeCloseTo(head.boundingBox().max[2], 3);
        }
        // Every part of one head is grouped, so the plate keeps them together.
        expect(new Set(r.parts.filter((x) => x.id !== 'body').map((x) => x.group)), mob).toEqual(new Set(['head']));
      }
    } finally {
      cleanup();
    }
  });

  it('lets the head sit in the body and press all the way in without touching it', async () => {
    const m = await kernel();
    try {
      for (const switchType of ['mx', 'choc']) {
        const r = mobClickerGenerator.build(paramsWith({ switchType }), ctxFor(m));
        const body = placed(m, r, 'body');
        // At rest it stands out of the front; pressed, it travels in without
        // ever meeting the body around it.
        const travel = switchType === 'mx' ? 4 : 3;
        for (const push of [0, travel / 2, travel]) {
          const head = placed(m, r, 'head', push);
          expect(head.intersect(body).volume(), `${switchType} pushed ${push}`).toBeLessThan(0.01);
        }
        expect(placed(m, r, 'head').boundingBox().max[2]).toBeGreaterThan(body.boundingBox().max[2] + 2);
      }
    } finally {
      cleanup();
    }
  });

  it('threads the keyring channel through the corner without reaching the switch', async () => {
    const m = await kernel();
    try {
      const withRing = mobClickerGenerator.build(paramsWith({ keyring: true }), ctxFor(m));
      const without = mobClickerGenerator.build(paramsWith({ keyring: false }), ctxFor(m));
      const a = withRing.parts.find((x) => x.id === 'body')!.mesh.stats;
      const b = without.parts.find((x) => x.id === 'body')!.mesh.stats;
      // One clean passage, top face to back face: exactly one more handle.
      // Breaking into the switch cavity would join it to the outside instead.
      expect(a.genus - b.genus).toBe(1);
      expect(a.volumeMm3).toBeLessThan(b.volumeMm3);
    } finally {
      cleanup();
    }
  });

  it('turns the whole thing face-forward in the assembled view only', async () => {
    const m = await kernel();
    try {
      const r = mobClickerGenerator.build(paramsWith(), ctxFor(m));
      for (const part of r.parts) expect(part.pose, part.name).toBeDefined();
      expect(r.parts.find((x) => x.id === 'head')!.orientation).toEqual([180, 0, 0]);
    } finally {
      cleanup();
    }
  });
});
