import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { describe, expect, it } from 'vitest';
import { cleanup, kernel } from './kernel';
import { hangarGenerator as gen } from '../src/generators/hangar/build';
import { derive, doorTravel } from '../src/generators/hangar/geometry';
import { armPose, craneFrame, towerLadder } from '../src/generators/hangar/parts';
import { hangarStairSpec } from '../src/generators/hangar/extras';
import { stairLayout } from '../src/generators/shared/stairs';
import { coerceAll, defaultsOf } from '../src/core/params/validate';
import type { BuildCtx, Params } from '../src/core/params/types';
import type { RawMesh } from '../src/core/kernel/types';

function ctxFor(m: ManifoldToplevel): BuildCtx {
  return { m, font: () => { throw new Error('no fonts'); }, image: () => undefined, tolerance: 0.05, issue: () => {} };
}

function paramsWith(patch: Params = {}): Params {
  return coerceAll(gen, { ...defaultsOf(gen), ...patch });
}

function errorsOf(patch: Params = {}): string[] {
  return (gen.validate?.(paramsWith(patch)) ?? []).filter((i) => i.level === 'error').map((i) => i.message);
}

const solidOf = (m: ManifoldToplevel, mesh: RawMesh) =>
  m.Manifold.ofMesh({ numProp: mesh.numProp, vertProperties: mesh.position, triVerts: mesh.index });

const overlap = (a: Manifold, b: Manifold) => a.intersect(b).volume();

function built(m: ManifoldToplevel, patch: Params = {}) {
  const p = paramsWith(patch);
  const result = gen.build(p, ctxFor(m));
  const get = (id: string) => {
    const part = result.parts.find((x) => x.id === id);
    if (!part) throw new Error(`no part ${id}`);
    return solidOf(m, part.mesh);
  };
  return { p, d: derive(p), result, get };
}

describe('hangar', () => {
  it('accepts its own defaults and presets', () => {
    expect(errorsOf()).toEqual([]);
    for (const preset of gen.presets ?? []) expect(errorsOf(preset.values), preset.label).toEqual([]);
    expect(gen.validate!(paramsWith()).filter((i) => i.level === 'warn')).toEqual([]);
  });

  it('builds every part as one solid, with no part inside another', async () => {
    const m = await kernel();
    try {
      for (const patch of [{}, { sideWalls: 'both', doorLeaves: '1' }, { door: false, catwalk: false }]) {
        const { result } = built(m, patch);
        expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
        const solids = result.parts.map((x) => solidOf(m, x.mesh));
        result.parts.forEach((part, i) => {
          expect(solids[i]!.decompose().length, part.name).toBe(1);
        });
        for (let i = 0; i < solids.length; i++) {
          for (let j = i + 1; j < solids.length; j++) {
            const a = result.parts[i]!.name;
            const b = result.parts[j]!.name;
            expect(overlap(solids[i]!, solids[j]!), `${a} / ${b}`).toBeLessThan(0.01);
          }
        }
      }
    } finally {
      cleanup();
    }
  });

  it('slides the door leaves open along their track, and holds them in it', async () => {
    const m = await kernel();
    try {
      for (const leaves of ['2', '1']) {
        // One leaf has to clear the whole opening, so it gets a narrower one.
        const { d, get } = built(m, { doorLeaves: leaves, doorWidth: leaves === '1' ? 56 : 86 });
        const wall = get('back-wall');
        const travel = doorTravel(d);
        d.leafSpans.forEach(([x0], i) => {
          const leaf = get(`door-${i}`);
          const left = leaves === '2' ? x0 < 0 : -d.trackX0 >= d.trackX1;
          const open = leaf.translate([(left ? -1 : 1) * (d.doorW / 2 + (d.leafSpans[i]![1] - x0)), 0, 0]);
          expect(travel[i]!.need).toBeLessThanOrEqual(travel[i]!.room);
          expect(overlap(open, wall), `leaf ${i} open`).toBeLessThan(0.01);
          // Pulled out of the track, toward the bay, it hits the dovetail.
          expect(overlap(leaf.translate([0, -1, 0]), wall), `leaf ${i} pulled`).toBeGreaterThan(1);
          expect(overlap(leaf.translate([0, 0, 1]), wall), `leaf ${i} lifted`).toBeGreaterThan(1);
        });
      }
    } finally {
      cleanup();
    }
  });

  it('rolls the tower along its floor rail and keeps it on it', async () => {
    const m = await kernel();
    try {
      const { d, get } = built(m);
      const base = get('base');
      const tower = get('tower');
      const reach = d.towerX - (d.grooveX0 + d.footW / 2);
      expect(reach).toBeGreaterThan(50);
      for (const dx of [-reach / 2, -reach]) {
        expect(overlap(tower.translate([dx, 0, 0]), base), `slid ${dx}`).toBeLessThan(0.01);
      }
      expect(overlap(tower.translate([0, 1, 0]), base)).toBeGreaterThan(1);
    } finally {
      cleanup();
    }
  });

  it('swings the bridge and the crane arm round on their pins', async () => {
    const m = await kernel();
    try {
      const { d, get } = built(m);
      const swing = (s: Manifold, [x, y]: readonly [number, number], deg: number) =>
        s.translate([-x, -y, 0]).rotate([0, 0, deg]).translate([x, y, 0]);

      const wall = get('left-wall');
      const railing = get('railing');
      const bridge = get('bridge');
      const pin = get('bridge-pin');
      // From pointing across the bay round to lying along the front: the
      // railing starts behind the pivot, so it is the other way that is blocked.
      for (const deg of [-90, -45, 0]) {
        const b = swing(bridge, d.pivot, deg);
        expect(overlap(b, wall), `bridge ${deg} / wall`).toBeLessThan(0.01);
        expect(overlap(b, railing), `bridge ${deg} / railing`).toBeLessThan(0.01);
        expect(overlap(b, pin), `bridge ${deg} / pin`).toBeLessThan(0.01);
      }

      const tower = get('tower');
      const jib = get('jib');
      for (const deg of [45, 90, 180, 270]) {
        expect(overlap(swing(jib, [d.towerX, d.railY], deg), tower), `jib ${deg}`).toBeLessThan(0.01);
      }
    } finally {
      cleanup();
    }
  });

  it('poses the robot arm and opens its claw without one part running into another', async () => {
    const m = await kernel();
    try {
      const { d, get } = built(m);
      const pose = armPose(d);
      const turn = (s: Manifold, [x, z]: readonly [number, number], deg: number) =>
        s.translate([-x, 0, -z]).rotate([0, deg, 0]).translate([x, 0, z]);
      const jib = get('jib');
      const upper = get('arm-upper');
      const fore = get('arm-fore');
      const wrist = get('arm-wrist');
      const claws = [get('claw-0'), get('claw-1')];

      // The whole arm swings at the shoulder, clear of the crane arm.
      for (const deg of [-25, 25]) {
        for (const part of [upper, fore, wrist, ...claws]) {
          expect(overlap(turn(part, pose.S, deg), jib), `shoulder ${deg}`).toBeLessThan(0.01);
        }
      }
      // The forearm and what it carries fold at the elbow, past the upper arm.
      for (const deg of [-40, 40]) {
        for (const part of [fore, wrist, ...claws]) {
          expect(overlap(turn(part, pose.E, deg), upper), `elbow ${deg}`).toBeLessThan(0.01);
        }
      }
      // Each finger turns on its pin; opening, neither hits the other or the wrist.
      const open = [turn(claws[0]!, pose.F[0], 20 * d.jibDir), turn(claws[1]!, pose.F[1], -20 * d.jibDir)];
      expect(overlap(open[0]!, open[1]!)).toBeLessThan(0.01);
      for (const c of open) expect(overlap(c, wrist)).toBeLessThan(0.01);
      // Closed, the tips nearly meet: something gripped between them stays gripped.
      const gap = Math.hypot(pose.H[0][0] - pose.H[1][0], pose.H[0][1] - pose.H[1][1]) - 2.4;
      expect(gap).toBeGreaterThan(0.3);
      expect(gap).toBeLessThan(2);

      // The pins hold every joint together and stand clear of what turns on them.
      for (const id of ['pin-shoulder', 'pin-elbow', 'pin-wrist', 'pin-claw-0', 'pin-claw-1']) {
        const pin = get(id);
        for (const part of [jib, upper, fore, wrist, ...claws]) expect(overlap(pin, part), id).toBeLessThan(0.01);
      }
    } finally {
      cleanup();
    }
  });

  it('swings the crane arm, robot arm and all, round past the operator cab', async () => {
    const m = await kernel();
    try {
      const { d, get } = built(m);
      const tower = get('tower');
      const hung = ['jib', 'arm-upper', 'arm-fore', 'arm-wrist', 'claw-0', 'claw-1'].map(get);
      for (const deg of [30, 90, 180, 270, 330]) {
        for (const part of hung) {
          const swung = part.translate([-d.towerX, -d.railY, 0]).rotate([0, 0, deg]).translate([d.towerX, d.railY, 0]);
          expect(overlap(swung, tower), `${deg}`).toBeLessThan(0.01);
        }
      }
    } finally {
      cleanup();
    }
  });

  it('runs a ladder up the tower to its top platform, on the tower\'s own foot', async () => {
    const m = await kernel();
    try {
      const { d, get } = built(m);
      const lad = towerLadder(d);
      expect(lad.top).toBeCloseTo(d.towerTop + 3, 6);
      // No higher than the platform, where the house turns just above.
      expect(lad.z1).toBeLessThanOrEqual(lad.top);
      // Inside the foot's footprint, so the tower still slides without it catching.
      expect(lad.y0).toBeGreaterThanOrEqual(d.railY - d.footW / 2 - 1e-6);
      const tower = get('tower');
      expect(tower.decompose().length).toBe(1);
      const probe = (x: number, y: number, z: number) =>
        tower.intersect(m.Manifold.cube([0.3, 0.3, 0.3], true).translate([x, y, z])).volume();
      expect(probe((lad.x0 + lad.x1) / 2, lad.y0 + 1.2, lad.top - 0.6)).toBeGreaterThan(0.01);
      expect(built(m, { towerLadder: false }).get('tower').volume()).toBeLessThan(tower.volume() - 20);
    } finally {
      cleanup();
    }
  });

  it('turns the house, cab, boom and robot arm together on the tower, like an excavator', async () => {
    const m = await kernel();
    try {
      const { d, get } = built(m);
      const f = craneFrame(d);
      const tower = get('tower');
      const house = get('house');
      expect(house.decompose().length).toBe(1);
      // The visor's glass sits in its pocket, held top and bottom.
      const glass = get('cab-glass');
      expect(overlap(glass, house)).toBeLessThan(0.01);
      expect(overlap(glass.translate([0, 0, -0.5]), house)).toBeGreaterThan(0.1);
      // The house sits on the tower's boss, clear of the platform under it.
      expect(house.boundingBox().min[2]).toBeCloseTo(f.z0, 3);

      const upper = ['house', 'cab-glass', 'jib', 'jib-pin', 'boom-pin', 'arm-upper', 'arm-fore', 'arm-wrist', 'claw-0', 'claw-1', 'pin-shoulder'].map(get);
      for (const deg of [0, 45, 90, 135, 180, 225, 270, 315]) {
        for (const part of upper) {
          const swung = part.translate([-d.towerX, -d.railY, 0]).rotate([0, 0, deg]).translate([d.towerX, d.railY, 0]);
          expect(overlap(swung, tower), `${deg}`).toBeLessThan(0.01);
        }
      }
    } finally {
      cleanup();
    }
  });

  it('tips the boom up and down on its hinge, the robot arm going with it', async () => {
    const m = await kernel();
    try {
      const { d, get } = built(m);
      const f = craneFrame(d);
      const [hx, hz] = f.xz(f.hinge);
      // Raising the boom means turning its far end upward, whichever way it points.
      const tip = (s: Manifold, deg: number) =>
        s.translate([-hx, 0, -hz]).rotate([0, -d.jibDir * deg, 0]).translate([hx, 0, hz]);
      const house = m.Manifold.union([get('house'), get('cab-glass')]);
      const pin = get('boom-pin');
      const carried = ['jib', 'arm-upper', 'arm-fore', 'arm-wrist', 'claw-0', 'claw-1', 'pin-shoulder'].map(get);
      for (const deg of [-12, 20, 45]) {
        for (const part of carried) {
          const moved = tip(part, deg);
          expect(overlap(moved, house), `${deg}`).toBeLessThan(0.01);
          expect(overlap(moved, pin), `${deg}`).toBeLessThan(0.01);
        }
      }
      // Built at the angle asked for.
      const flat = built(m, { boomAngle: 0 });
      const raised = built(m, { boomAngle: 30 });
      expect(raised.get('jib').boundingBox().max[2]).toBeGreaterThan(flat.get('jib').boundingBox().max[2] + 20);
    } finally {
      cleanup();
    }
  });


  it('sets the ceiling on the wall tops, pegged in, propped at the open corner', async () => {
    const m = await kernel();
    try {
      for (const sideWalls of ['left', 'both']) {
        const { d, result, get } = built(m, { sideWalls });
        const ceiling = get('ceiling');
        expect(ceiling.decompose().length, sideWalls).toBe(1);
        const walls = m.Manifold.union(['back-wall', 'left-wall', ...(sideWalls === 'both' ? ['right-wall'] : [])].map(get));
        // Resting on the walls, not in them; slid sideways, its pegs catch.
        expect(overlap(ceiling, walls), sideWalls).toBeLessThan(0.01);
        expect(overlap(ceiling.translate([0, 1, 0]), walls), sideWalls).toBeGreaterThan(0.5);
        expect(overlap(ceiling.translate([1, 0, 0]), walls), sideWalls).toBeGreaterThan(0.5);
        // The trusses stand on the wall tops; only the lamps and pegs reach below.
        const bb = ceiling.boundingBox();
        expect(bb.max[2]).toBeCloseTo(d.wallTop + d.trussDepth, 3);
        // One wall: a column holds the open corner, standing in the base.
        const ids = result.parts.map((x) => x.id);
        expect(ids.includes('column'), sideWalls).toBe(sideWalls === 'left');
        if (sideWalls === 'left') {
          const column = get('column');
          expect(overlap(column, get('base'))).toBeLessThan(0.01);
          expect(overlap(column, ceiling)).toBeLessThan(0.01);
          expect(overlap(column.translate([0, 0, -1]), get('base'))).toBeGreaterThan(1);
          expect(overlap(column.translate([1, 0, 0]), ceiling)).toBeGreaterThan(0.1);
        }
      }
      // As built by default, nothing reaches the frame; raised high, the crane is flagged.
      expect(gen.build(paramsWith(), ctxFor(m)).issues.filter((i) => /into the ceiling/.test(i.message))).toEqual([]);
      const warns = gen.validate!(paramsWith()).concat(gen.build(paramsWith({ boomAngle: 60 }), ctxFor(m)).issues);
      expect(warns.some((i) => /into the ceiling/.test(i.message))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('sizes what the crew climb and lean on to the crew, and leaves them headroom', async () => {
    const m = await kernel();
    try {
      for (const patch of [{}, { sideWalls: 'both' }, gen.presets!.find((x) => x.label === '1/100 MG')!.values]) {
        const { p, d, result, get } = built(m, patch);
        const k = d.crewK;
        const label = JSON.stringify(patch).slice(0, 40);
        // Railings 1.05 m, ladder rungs 30 cm apart, at the crew scale.
        expect(d.railH / k, label).toBeCloseTo(1.05, 1);
        expect(d.rungPitch / k, label).toBeLessThanOrEqual(0.31);
        const rail = get('railing').boundingBox();
        expect(rail.max[2] - d.cz, label).toBeCloseTo(d.railH, 1);

        // The legs peg into the deck and the floor: slid along, they catch.
        const legs = get('catwalk-legs');
        expect(overlap(legs.translate([0, 0.6, 0]), get('left-wall')), label).toBeGreaterThan(0.01);
        expect(overlap(legs.translate([0, 0.6, 0]), get('base')), label).toBeGreaterThan(0.01);

        // 2 m clear above the stairs' nosings and over every landing.
        const spec = hangarStairSpec(d, Number(p.stairSpan), Number(p.stairHeight), Number(p.stairScale));
        const L = stairLayout(spec);
        const everything = m.Manifold.union(result.parts.map((x) => solidOf(m, x.mesh)));
        const column = (x: number, y: number, z0: number, z1: number) =>
          m.Manifold.cube([0.4 * k, 0.4 * k, z1 - z0], true).translate([x, y, (z0 + z1) / 2]);
        for (const f of L.flights) {
          for (const t of [0.15, 0.5, 0.85]) {
            const x = f.sa + t * (f.sb - f.sa);
            const line = f.za + t * (f.zb - f.za);
            expect(overlap(column(x, (f.y0 + f.y1) / 2, line + 0.5 * k, line + 2 * k), everything), `${label} flight ${f.index + 1}`).toBeLessThan(0.01);
          }
        }
        for (const l of L.landings) {
          expect(overlap(column((l.x0 + l.x1) / 2, (L.laneFront + L.laneBack) / 2, l.z + 1.2, l.z + 2 * k), everything), `${label} landing`).toBeLessThan(0.01);
        }
      }
    } finally {
      cleanup();
    }
  });

  it('pegs the railing into the catwalk deck', async () => {
    const m = await kernel();
    try {
      const { get } = built(m);
      const railing = get('railing');
      const wall = get('left-wall');
      // Its pegs reach down into the deck, so it cannot slide along it.
      expect(railing.boundingBox().min[2]).toBeLessThan(derive(paramsWith()).cz - 2);
      expect(overlap(railing.translate([0, 0.5, 0]), wall)).toBeGreaterThan(0.1);
    } finally {
      cleanup();
    }
  });

  it('leaves out what is switched off, and uses filament for pins on request', async () => {
    const m = await kernel();
    try {
      const ids = (patch: Params) => built(m, patch).result.parts.map((x) => x.id);
      expect(ids({})).toEqual([
        'base', 'back-wall', 'left-wall', 'floor-stripes', 'kit-pad', 'header-stripes', 'glass', 'pipes',
        'door-0', 'door-0-stripes', 'door-1', 'door-1-stripes', 'roof-railing',
        'railing', 'bridge', 'bridge-pin', 'tower', 'house', 'house-lights', 'cab-glass', 'jib-pin', 'jib', 'boom-pin',
        'arm-upper', 'arm-fore', 'arm-wrist', 'claw-0', 'claw-1',
        'pin-shoulder', 'pin-elbow', 'pin-wrist', 'pin-claw-0', 'pin-claw-1',
        'catwalk-legs', 'stair-frame', ...[1, 2, 3, 4, 5, 6].map((i) => `stair-flight-${i}`),
        'claw-chain', 'claw-hub', 'claw-talon-0', 'claw-pin-0', 'claw-talon-1', 'claw-pin-1', 'claw-talon-2', 'claw-pin-2',
        'ceiling', 'column',
      ]);
      expect(ids({ craneTool: 'hook', craneCab: false })).not.toContain('arm-upper');
      expect(ids({ pinStyle: 'filament' }).filter((id) => id.startsWith('pin-'))).toEqual([]);
      expect(ids({ pinStyle: 'filament' })).not.toContain('bridge-pin');
      expect(
        ids({ door: false, catwalk: false, tower: false, controlRoom: false, hazardStripes: false, pipes: false, ceiling: false, stairs: false }),
      ).toEqual(['base', 'back-wall', 'left-wall']);
      expect(ids({ sideWalls: 'both', doorLeaves: '1' })).toContain('right-wall');
    } finally {
      cleanup();
    }
  });

  it('hangs the control room over the back of the catwalk, clear of it', async () => {
    const m = await kernel();
    try {
      const { d, result, get } = built(m);
      expect(d.rz0 - d.rd).toBeGreaterThan(d.cz + 12);
      expect(d.ry1).toBe(d.deckY1);
      // Full length by default: the whole wall, from its front edge.
      expect(d.ry0).toBeCloseTo(d.deckY0, 6);
      // High enough over the swing bridge's side panels for it to turn under.
      expect(d.rz0 - d.rd).toBeGreaterThan(d.cz + 2 + 8);
      // The glass sits in its pocket, the mullions over it, and the wall is still one piece.
      const wall = get('left-wall');
      expect(wall.decompose().length).toBe(1);
      const glass = get('glass');
      expect(overlap(glass, wall)).toBeLessThan(0.01);
      expect(overlap(glass.translate([0.5, 0, 0]), wall)).toBeGreaterThan(1);
      expect(result.parts.filter((x) => x.group === 'left-wall').map((x) => x.id)).toEqual(['left-wall', 'glass', 'pipes']);
    } finally {
      cleanup();
    }
  });

  it('says when the control room does not fit', () => {
    expect(errorsOf({ roomHeight: 60 }).join()).toMatch(/above the wall/);
    expect(errorsOf({ roomDepth: 22 }).join()).toMatch(/further than the catwalk/);
    expect(errorsOf({ roomFullLength: false, roomLength: 130 }).join()).toMatch(/longer than the wall/);
    expect(errorsOf({ roomFullLength: false, roomLength: 60 })).toEqual([]);
  });

  it('says when the door outgrows its track or the walls outgrow the bed', () => {
    expect(errorsOf({ doorWidth: 190 }).join()).toMatch(/wider than the track/);
    expect(errorsOf({ doorHeight: 175 }).join()).toMatch(/taller than the wall/);
    expect(errorsOf({ bayWidth: 300 }).join()).toMatch(/bigger than your/);
    const warns = gen.validate!(paramsWith({ doorWidth: 140 })).filter((i) => i.level === 'warn');
    expect(warns.map((w) => w.message).join()).toMatch(/slide all the way open/);
  });
});
