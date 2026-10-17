import type { CrossSection, Manifold } from 'manifold-3d';
import { serialize } from '../../core/kernel/serialize';
import type { BuildCtx, BuildResult, Generator, Issue, Params, Part } from '../../core/params/types';
import { missingCharacters, textOutline } from '../../core/text/textSolid';
import { islandBridges } from '../keychain/lettering';
import { buildRing } from '../keychain/ring';
import { box, cylinderY, rect, slab, type M } from '../shared/solid';
import { flexiGroups, flexiParams } from './schema';

/**
 * Hinged lettering keychain: every letter its own deep block, hinged to the
 * next, printed flat in one go and moving the moment it comes off the bed.
 *
 * The hinge is a door hinge laid in the back colour, its pin running up the
 * letters -- along their height, at half the depth of the back colour:
 *
 *   knuckles - the left letter has one at the top and one at the bottom, with
 *              the pin through both; the right letter has the middle one,
 *              bored for the pin. Each is a barrel on a web that runs back
 *              into its own letter at the full depth of the back colour, so
 *              under the face it all reads as one block.
 *   cradles  - each letter is cut back round its neighbour's knuckles. Open
 *              at the letter's top and bottom edges, they show there as the
 *              round notches the bought ones have.
 *   bore     - snug round the pin at the middle and flared toward its ends,
 *              with a little more knuckle gap than a stiff hinge would need,
 *              so the middle knuckle rocks on the pin.
 *
 * So the word rolls on its pins -- up off the table, round when it hangs --
 * and the rocking gives it a little play side to side, which is what lets it
 * lie in a gentle arc.
 *
 * How far each joint really moves, both ways, is measured by turning the real
 * solids until they meet -- and a pair that cannot move far enough kerned up
 * tight is eased apart until it can.
 */

/** Web-to-glyph overlap a knuckle wants, x its own length. */
const ARM_BITE = 1.3;
/** Least roll a hinge is allowed before the pair is eased apart. */
const MIN_PITCH = 12;
/** Past this the swing search stops. */
const MAX_SWING = 60;
/** Step the swing search takes before it bisects, degrees. */
const SWING_STEP = 3;
/** How far a tight pair is eased apart per try, mm. */
const EASE_STEP = 0.4;
/** How far the knuckles and ring stop short of the colour change, mm. */
const HOUSING_DROP = 0.2;
/** How far the middle knuckle can rock on its pin, degrees. */
const WOBBLE = 8;
/** Knuckle wall left round the bore, mm. */
const MIN_KNUCKLE_WALL = 0.8;

type V3 = readonly [number, number, number];
type Mat = number[];

// ------------------------------------------------------------- 4x4 helpers
// Column-major, the order three.js and Part.pose use.

const IDENT: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function mul(a: Mat, b: Mat): Mat {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!;
      o[c * 4 + r] = s;
    }
  }
  return o;
}

const translation = (x: number, y: number, z: number): Mat => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

/** Turn about the y axis: positive carries +x toward -z. */
function rotY(deg: number): Mat {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

/** Turn about the z axis: positive is anticlockwise seen from above. */
function rotZ(deg: number): Mat {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

const about = (rot: Mat, [x, y, z]: V3): Mat => mul(translation(x, y, z), mul(rot, translation(-x, -y, -z)));

function apply(mat: Mat, [x, y, z]: V3): V3 {
  return [
    mat[0]! * x + mat[4]! * y + mat[8]! * z + mat[12]!,
    mat[1]! * x + mat[5]! * y + mat[9]! * z + mat[13]!,
    mat[2]! * x + mat[6]! * y + mat[10]! * z + mat[14]!,
  ];
}

/** Word running down from the first letter, face toward the viewer (-y). */
const HANG_FROM_START: Mat = [0, 0, -1, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 1];
/** Word running down from the last letter, face toward the viewer. */
const HANG_FROM_END: Mat = [0, 0, 1, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 1];

// ------------------------------------------------------------------ joints

interface Glyph {
  readonly ch: string;
  section: CrossSection;
  x0: number;
  x1: number;
  readonly y0: number;
  readonly y1: number;
}

/** The middle of the hinge line: on the axis, halfway up the knuckles. */
type Joint = V3;

interface Dims {
  readonly depth: number;
  /** Height of the back colour; the hinge lives in it. */
  readonly back: number;
  readonly gap: number;
  readonly c: number;
  readonly ax: number;
  /** Axis height: the middle of the back colour. */
  readonly zh: number;
  readonly knuckleR: number;
  readonly pinR: number;
  /** Hole round the pin at the middle of the knuckle. */
  readonly holeMid: number;
  /** How fast the bore opens toward the knuckle ends, as a tangent. */
  readonly flare: number;
  /** The cradle each letter is cut back to round its neighbour's knuckles. */
  readonly cradleR: number;
  /** Where a knuckle's web stops short of the axis, so it can roll in its cradle. */
  readonly webStop: number;
}

/** One joint's share of each letter: what it cuts, adds and hollows. */
interface Pieces {
  readonly aCut: Manifold;
  readonly aAdd: Manifold;
  readonly bCut: Manifold;
  readonly bAdd: Manifold;
  readonly bVoid: Manifold;
  readonly weak: boolean;
}

/** Per letter, everything its joints do to it, in the order it is applied. */
interface Work {
  cuts: Manifold[];
  adds: Manifold[];
  voids: Manifold[];
}

/**
 * Shortest web from x = `from` into a glyph that overlaps it by `target` mm²,
 * growing toward `dir`. Bisection on the real overlap, because a glyph's edge
 * is wherever its strokes happen to be and nothing about its box says so.
 */
function armLength(
  m: M,
  glyph: CrossSection,
  from: number,
  dir: 1 | -1,
  y0: number,
  y1: number,
  minL: number,
  maxL: number,
  target: number,
): { length: number; ok: boolean } {
  const overlap = (L: number): number => {
    const r = dir > 0 ? rect(m, from, from + L, y0, y1) : rect(m, from - L, from, y0, y1);
    return r.intersect(glyph).area();
  };
  if (maxL <= minL) return { length: minL, ok: overlap(minL) >= target * 0.5 };
  if (overlap(minL) >= target) return { length: minL, ok: true };
  const best = overlap(maxL);
  if (best < target) return { length: maxL, ok: best >= target * 0.5 };
  let lo = minL;
  let hi = maxL;
  while (hi - lo > 0.1) {
    const mid = (lo + hi) / 2;
    if (overlap(mid) >= target) hi = mid;
    else lo = mid;
  }
  return { length: hi, ok: true };
}

/**
 * The hinge line between two placed letters: up the whole height they share,
 * at the middle of the gap between the material each has halfway up it.
 * Returns the centre of the joint and the knuckle breaks along it.
 */
function jointAt(m: M, A: Glyph, B: Glyph, d: Dims): { p: Joint; y0: number; a: number; b: number; y1: number } | null {
  const lo = Math.max(A.y0, B.y0);
  const hi = Math.min(A.y1, B.y1);
  const h = hi - lo;
  if (h < 3 * 2 + 2 * d.ax) return null;
  const py = (lo + hi) / 2;
  const half = h * 0.3;
  const strip = (g: Glyph) => g.section.intersect(rect(m, g.x0 - 1, g.x1 + 1, py - half, py + half));
  const aBand = strip(A);
  const bBand = strip(B);
  const aEdge = aBand.area() > 0 ? aBand.bounds().max[0] : A.x1;
  const bEdge = bBand.area() > 0 ? bBand.bounds().min[0] : B.x0;
  return { p: [(aEdge + bEdge) / 2, py, d.zh], y0: lo, a: lo + h / 3, b: hi - h / 3, y1: hi };
}

/** A cone along +y from y0 to y1, radius r0 at y0 and r1 at y1, centred on (x, z). */
function coneY(m: M, r0: number, r1: number, x: number, z: number, y0: number, y1: number): Manifold {
  return m.Manifold.cylinder(y1 - y0, r0, r1, 48).rotate([-90, 0, 0]).translate([x, y0, z]);
}

/**
 * One knuckle: a barrel round the axis, and a web that carries it back into
 * its own letter -- full depth of the back colour where it meets the letter,
 * narrowing to the barrel as it reaches the axis, so it rolls in its cradle
 * without its corners catching.
 */
function knuckle(m: M, g: Glyph, x: number, dir: 1 | -1, s0: number, s1: number, reach: number, d: Dims): { solid: Manifold; ok: boolean } {
  const { zh, knuckleR, webStop, back } = d;
  const top = back - HOUSING_DROP;
  const barrel = cylinderY(m, knuckleR, x, zh, s0, s1);
  const at = x + dir * webStop;
  const throat = box(m, Math.min(at, at + dir * 0.01), Math.max(at, at + dir * 0.01), s0, s1, 0, top);
  const web = m.Manifold.hull([barrel, throat]);
  const minL = webStop + 0.4;
  const { length, ok } = armLength(m, g.section, x, dir, s0, s1, minL, Math.max(minL, reach), (s1 - s0) * ARM_BITE);
  const lo = dir > 0 ? at : x - length;
  const hi = dir > 0 ? x + length : at;
  return { solid: m.Manifold.union([barrel, web, box(m, lo, hi, s0, s1, 0, top)]), ok };
}

function jointPieces(
  m: M,
  A: Glyph,
  B: Glyph,
  j: { p: Joint; y0: number; a: number; b: number; y1: number },
  reachA: number,
  reachB: number,
  d: Dims,
): Pieces {
  const [x, , zh] = j.p;
  const { cradleR, pinR, holeMid, flare, ax } = d;
  const kA1 = knuckle(m, A, x, -1, j.y0, j.a, reachA, d);
  const kA2 = knuckle(m, A, x, -1, j.b, j.y1, reachA, d);
  const kB = knuckle(m, B, x, 1, j.a + ax, j.b - ax, reachB, d);
  const mid = (j.a + j.b) / 2;
  const holeEnd = holeMid + (mid - j.a) * flare;
  return {
    // The right letter's knuckle rolls in a cradle cut from the left letter...
    aCut: cylinderY(m, cradleR, x, zh, j.a, j.b),
    // ...and the left letter's pin runs through both of its own, top to bottom.
    aAdd: m.Manifold.union([kA1.solid, kA2.solid, cylinderY(m, pinR, x, zh, j.y0, j.y1)]),
    // Cradles for the left letter's two knuckles, open at the top and bottom
    // edges, where they show as the round notches.
    bCut: cylinderY(m, cradleR, x, zh, j.y0 - 1, j.a + ax).add(cylinderY(m, cradleR, x, zh, j.b - ax, j.y1 + 1)),
    bAdd: kB.solid,
    // Hourglass bore: snug at the middle, flared to the ends, so the knuckle
    // can rock on the pin -- the side-to-side play.
    bVoid: coneY(m, holeEnd, holeMid, x, zh, j.a - 0.01, mid).add(coneY(m, holeMid, holeEnd, x, zh, mid, j.b + 0.01)),
    weak: !(kA1.ok && kA2.ok && kB.ok),
  };
}

function assemble(m: M, g: Glyph, w: Work, depth: number): Manifold {
  let s = slab(m, g.section, 0, depth);
  if (w.cuts.length > 0) s = s.subtract(m.Manifold.union(w.cuts));
  if (w.adds.length > 0) s = m.Manifold.union([s, ...w.adds]);
  if (w.voids.length > 0) s = s.subtract(m.Manifold.union(w.voids));
  return s;
}

/**
 * How far `b` turns about `j` before it meets `a`, in degrees, the smaller of
 * the two directions -- letters are not symmetric top to bottom or side to
 * side, so neither direction answers for the other.
 */
function swing(m: M, a0: Manifold, b0: Manifold, j: Joint, axis: 'y' | 'z'): number {
  // A solid that has been through dozens of booleans carries a loosened
  // tolerance, and the first contact between two letters is exactly the thin
  // sliver that tolerance rounds away -- measured that way, an "I" and an "A"
  // reported a clear 11 degrees that were already 0.04 mm³ into each other at
  // 9. Tightened back before measuring.
  const a = m.Manifold.ofMesh(a0.getMesh());
  const b = m.Manifold.ofMesh(b0.getMesh());
  const turned = (deg: number): Manifold =>
    b.translate([-j[0], -j[1], -j[2]]).rotate(axis === 'z' ? [0, 0, deg] : [0, deg, 0]).translate([j[0], j[1], j[2]]);
  const clash = (deg: number): boolean => turned(deg).intersect(a).volume() > 0.005;
  // Stepped out from zero, then bisected: a neck can catch its mouth partway
  // through a swing and come clear again past it, so the far end alone proves
  // nothing.
  const one = (sign: 1 | -1): number => {
    if (clash(0)) return 0;
    let lo = 0;
    let hi = Infinity;
    for (let deg = SWING_STEP; deg <= MAX_SWING; deg += SWING_STEP) {
      if (clash(sign * deg)) {
        hi = deg;
        break;
      }
      lo = deg;
    }
    if (hi === Infinity) return MAX_SWING;
    while (hi - lo > 0.5) {
      const mid = (lo + hi) / 2;
      if (clash(sign * mid)) hi = mid;
      else lo = mid;
    }
    return lo;
  };
  return Math.min(one(1), one(-1));
}

/**
 * Closest the next letter can sit: its outline kept `gap` clear of the letter
 * before it everywhere, the way a typesetter kerns rather than the way boxes
 * stack. Never pulled in by more than half its own width.
 */
function kernedX(A: Glyph, next: CrossSection, w: number, gap: number): number {
  const halo = A.section.offset(gap, 'Round', 2, 24);
  const clear = (x: number): boolean => halo.intersect(next.translate([x, 0])).area() < 1e-6;
  const far = A.x1 + gap;
  const near = far - w * 0.5;
  if (clear(near)) return near;
  let lo = near;
  let hi = far;
  while (hi - lo > 0.05) {
    const mid = (lo + hi) / 2;
    if (clear(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

function build(p: Params, ctx: BuildCtx): BuildResult {
  const { m } = ctx;
  const issues: Issue[] = [];

  const raw = String(p.text ?? '');
  const fnt = ctx.font(String(p.font));
  const cap = Number(p.fontSize);
  const depth = Number(p.thickness);
  const faceDepth = Math.min(Number(p.faceDepth), depth - 4);
  const back = depth - faceDepth;
  const gap = Number(p.gap);
  const c = Number(p.clearance);
  const poseMode = String(p.pose);
  const ringMode = String(p.ring);

  const missing = missingCharacters(fnt, raw);
  if (missing.length > 0) {
    issues.push({
      level: 'warn',
      message: `This font has no glyph for ${missing.map((ch) => `"${ch}"`).join(', ')} - those characters would print as boxes. Pick another font or remove them.`,
      paramIds: ['font', 'text'],
    });
  }

  // ------------------------------------------------------------ the letters
  const shapes: { ch: string; section: CrossSection }[] = [];
  for (const ch of [...raw]) {
    if (ch.trim().length === 0) continue;
    let section: CrossSection;
    try {
      section = textOutline(m, fnt, { text: ch, capHeightMm: cap, tolerance: ctx.tolerance, center: false });
    } catch {
      continue;
    }
    // The dot on an "i" is a separate island; tie it down or it prints loose.
    const bridge = islandBridges(m, section, Math.max(1.2, cap * 0.07));
    if (bridge) section = section.add(bridge);
    shapes.push({ ch, section });
  }
  if (shapes.length === 0) {
    return {
      parts: [],
      issues: [{ level: 'error', message: 'This word has no printable letters in it.', paramIds: ['text', 'font'] }],
    };
  }

  // ------------------------------------------------------------- the hinge
  // A door hinge in the back colour, its pin running up the letters.
  const zh = back / 2;
  const knuckleR = Math.min(zh - 0.55, Math.max(2, cap * 0.18));
  const pinR = Math.max(0.9, knuckleR * 0.4);
  const holeMid = pinR + c;
  // Rock the middle knuckle WOBBLE degrees on its pin: the bore opens by
  // half its length times the tangent at each end, and the knuckle ends
  // swing through the knuckle gap by their radius times the sine.
  const flare = Math.tan((WOBBLE * Math.PI) / 180);
  // Worst case: a middle knuckle a third of the cap height long.
  const holeEnd = holeMid + (cap / 6) * flare;
  const d: Dims = {
    depth, back, gap, c,
    ax: Math.max(Number(p.axialGap), knuckleR * Math.sin((WOBBLE * Math.PI) / 180) + 0.2),
    zh, knuckleR, pinR, holeMid, flare,
    cradleR: knuckleR + c,
    webStop: knuckleR * 0.75,
  };
  if (knuckleR - holeEnd < MIN_KNUCKLE_WALL) {
    issues.push({
      level: 'error',
      message: `The back colour is only ${back.toFixed(1)} mm deep - too shallow for a hinge round a pin. Make the letters deeper or the face colour shallower.`,
      paramIds: ['thickness', 'faceDepth'],
    });
    return { parts: [], issues };
  }

  // ------------------------------------------------------------ placement
  // Each letter is kerned up to the one before it, then eased apart until its
  // joint turns and tilts far enough -- measured on the real solids, because
  // whether an "A" foot meets a "V" arm is not a question a box can answer.
  const glyphs: Glyph[] = [];
  const joints: Joint[] = [];
  const work: Work[] = [];
  const yaws: number[] = [];
  const pitches: number[] = [];
  const stiff: string[] = [];
  let weak = false;
  for (let k = 0; k < shapes.length; k++) {
    const { ch, section } = shapes[k]!;
    const b = section.bounds();
    const w = b.max[0] - b.min[0];
    const base = section.translate([-b.min[0], -cap / 2]);
    const at = (x: number): Glyph => ({
      ch, section: base.translate([x, 0]), x0: x, x1: x + w, y0: b.min[1] - cap / 2, y1: b.max[1] - cap / 2,
    });
    if (k === 0) {
      glyphs.push(at(0));
      work.push({ cuts: [], adds: [], voids: [] });
      continue;
    }
    const A = glyphs[k - 1]!;
    const wA = work[k - 1]!;
    const left = k >= 2 ? joints[k - 2]! : null;
    let x = kernedX(A, base, w, gap);
    let placed: { B: Glyph; j: Joint; jp: Pieces; pitch: number } | null = null;
    for (let tries = 0; tries < 20; tries++, x += EASE_STEP) {
      const B = at(x);
      const found = jointAt(m, A, B, d);
      if (!found) break;
      const hx = found.p[0];
      // A web stops short of the cradle at its letter's other end.
      const reachA = hx - (left ? left[0] + d.cradleR + 0.4 : A.x0);
      const jp = jointPieces(m, A, B, found, reachA, B.x1 - hx, d);
      const a = assemble(m, A, { cuts: [...wA.cuts, jp.aCut], adds: [...wA.adds, jp.aAdd], voids: wA.voids }, depth);
      const bb = assemble(m, B, { cuts: [jp.bCut], adds: [jp.bAdd], voids: [jp.bVoid] }, depth);
      // Only the roll eases a pair apart. The side-to-side play is the pin
      // rocking in its bore, which no amount of gap adds to; it is measured
      // once the letters are finished.
      const pitch = swing(m, a, bb, found.p, 'y');
      placed = { B, j: found.p, jp, pitch };
      if (pitch >= MIN_PITCH) break;
    }
    if (!placed) {
      issues.push({
        level: 'error',
        message: `"${A.ch}" and "${ch}" share too little height for a joint between them. Raise the letter height, or use capitals.`,
        paramIds: ['fontSize', 'text'],
      });
      return { parts: [], issues };
    }
    if (placed.pitch < MIN_PITCH) stiff.push(`${A.ch}${ch}`);
    if (placed.jp.weak) weak = true;
    wA.cuts.push(placed.jp.aCut);
    wA.adds.push(placed.jp.aAdd);
    glyphs.push(placed.B);
    work.push({ cuts: [placed.jp.bCut], adds: [placed.jp.bAdd], voids: [placed.jp.bVoid] });
    joints.push(placed.j);
    pitches.push(placed.pitch);
  }
  if (stiff.length > 0) {
    issues.push({
      level: 'warn',
      message: `The joint${stiff.length === 1 ? '' : 's'} between ${stiff.map((s) => `"${s}"`).join(', ')} barely move${stiff.length === 1 ? 's' : ''}. Widen the gap between letters.`,
      paramIds: ['gap'],
    });
  }
  if (weak) {
    issues.push({
      level: 'warn',
      message: 'Some hinge knuckles only just reach into their letters. Raise the letter height or pick a bolder font.',
      paramIds: ['fontSize', 'font'],
    });
  }

  // ------------------------------------------------------------------ ring
  // In the back colour only, so it reads as part of the joints.
  const ringHole = Number(p.ringHole);
  const ringWall = Number(p.ringWall);
  let ringOuter = 0;
  if (ringMode !== 'none') {
    const atEnd = ringMode === 'end';
    const i = atEnd ? glyphs.length - 1 : 0;
    const g = glyphs[i]!;
    const ring = buildRing(m, g.section, { holeD: ringHole, wall: ringWall, gap: 0.8, direction: 'horizontal', atEnd });
    if (ring) {
      work[i]!.adds.push(slab(m, ring.solid, 0, back - HOUSING_DROP));
      work[i]!.voids.push(slab(m, ring.hole, -1, depth + 1));
      ringOuter = ring.outerD;
      if (ring.jointArea < ring.jointTarget * 0.9) {
        issues.push({
          level: 'warn',
          message: `The keyring eye only meets "${g.ch}" across ${ring.jointArea.toFixed(1)} mm². Put it on the other end, or raise the letter height.`,
          paramIds: ['ring', 'fontSize'],
        });
      }
    }
  }

  // --------------------------------------------------------------- solids
  const letters = glyphs.map((g, i) => assemble(m, g, work[i]!, depth));
  letters.forEach((l, i) => {
    if (l.decompose().filter((piece) => piece.volume() > 0.05).length > 1) {
      issues.push({
        level: 'error',
        message: `"${glyphs[i]!.ch}" comes apart from its own joint. Raise the letter height or pick a bolder font.`,
        paramIds: ['fontSize', 'font'],
      });
    }
  });

  // Placement measured each joint before its letters had their other joint
  // and the ring; a narrow letter carries a housing, a neck and a relief all
  // within a few millimetres of each other, and those move the limits. So
  // the figures shown and posed are taken again on the finished letters.
  joints.forEach((j, i) => {
    yaws.push(0);
    yaws[i] = swing(m, letters[i]!, letters[i + 1]!, j, 'z');
    pitches[i] = swing(m, letters[i]!, letters[i + 1]!, j, 'y');
  });

  // ------------------------------------------------------------------ pose
  // Each joint turned as asked, two degrees short of where it was measured to stop.
  const bend = Number(p.bend);
  const tilt = Number(p.tilt);
  let poses: Mat[] | null = null;
  if (poseMode !== 'flat' && joints.length > 0) {
    const yawAt = (i: number, want: number) => Math.min(want, Math.max(0, yaws[i]! - 2));
    const pitchAt = (i: number, want: number) => Math.min(want, Math.max(0, pitches[i]! - 2));
    const chain: Mat[] = [IDENT];
    let total = 0;
    joints.forEach((j, i) => {
      let r: Mat;
      if (poseMode === 'arch') {
        // Ends rolled up off the table.
        const a = pitchAt(i, tilt);
        total += a;
        r = about(rotY(-a), j);
      } else if (poseMode === 'hang') {
        const a = yawAt(i, bend * 0.3) * Math.sin(1.9 * i + 0.7);
        r = mul(about(rotZ(a), j), about(rotY(pitchAt(i, tilt * 0.3) * Math.cos(1.3 * i)), j));
      } else {
        const a = yawAt(i, bend);
        total += a;
        r = about(rotZ(-a), j);
      }
      chain.push(mul(chain[i]!, r));
    });
    const base =
      poseMode === 'hang'
        ? ringMode === 'end'
          ? HANG_FROM_END
          : HANG_FROM_START
        : poseMode === 'arch'
          ? rotY(total / 2)
          : rotZ(total / 2);
    const posed = chain.map((mat) => mul(base, mat));

    // Sit the posed word on the floor, centred.
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    // From the real vertices: a turned bounding box reaches below the letters
    // and would leave a rolled-up word hovering over the table.
    letters.forEach((l, i) => {
      const mesh = l.getMesh();
      const v = mesh.vertProperties;
      for (let n = 0; n < v.length; n += mesh.numProp) {
        const q = apply(posed[i]!, [v[n]!, v[n + 1]!, v[n + 2]!]);
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k]!, q[k]!);
          hi[k] = Math.max(hi[k]!, q[k]!);
        }
      }
    });
    const centre = translation(-(lo[0]! + hi[0]!) / 2, -(lo[1]! + hi[1]!) / 2, -lo[2]!);
    poses = posed.map((mat) => mul(centre, mat));
  }

  // ----------------------------------------------------------------- parts
  const parts: Part[] = [];
  const note = 'Prints flat, face up, as one object with every joint in place. No supports. Work each joint side to side and up and down to free it.';
  letters.forEach((l, i) => {
    const label = `${i + 1}. ${glyphs[i]!.ch}`;
    const pose = poses ? poses[i] : undefined;
    parts.push({
      id: `l${i}-back`,
      name: `${label} - back`,
      mesh: serialize(l.trimByPlane([0, 0, -1], -back)),
      color: String(p.backColor),
      group: 'chain',
      orientationNote: note,
      ...(pose ? { pose } : {}),
    });
    parts.push({
      id: `l${i}-face`,
      name: `${label} - face`,
      mesh: serialize(l.trimByPlane([0, 0, 1], back)),
      color: String(p.faceColor),
      group: 'chain',
      orientationNote: 'The face colour. A filament change at this layer gives the two-tone look.',
      ...(pose ? { pose } : {}),
    });
  });

  // -------------------------------------------------------------- readouts
  const boxes = letters.map((l) => l.boundingBox());
  const x0 = Math.min(...boxes.map((bb) => bb.min[0]));
  const x1 = Math.max(...boxes.map((bb) => bb.max[0]));
  const y0 = Math.min(...boxes.map((bb) => bb.min[1]));
  const y1 = Math.max(...boxes.map((bb) => bb.max[1]));
  const range = (v: number[]) => {
    const lo = Math.min(...v);
    const hi = Math.max(...v);
    return hi - lo >= 1 ? `±${lo.toFixed(0)}-${hi.toFixed(0)}°` : `±${lo.toFixed(0)}°`;
  };
  const readouts: Record<string, string> = {
    'Printed size': `${(x1 - x0).toFixed(1)} x ${(y1 - y0).toFixed(1)} x ${depth.toFixed(1)} mm`,
    Letters: String(letters.length),
    Joints: joints.length === 0 ? 'None - one letter' : `${joints.length} hinges`,
    'Side to side': joints.length === 0 ? '-' : range(yaws),
    'Up and down': joints.length === 0 ? '-' : range(pitches),
    Pin: `${(pinR * 2).toFixed(1)} mm, in a ${(knuckleR * 2).toFixed(1)} mm knuckle`,
    'Colour change': `at ${back.toFixed(1)} mm`,
  };
  if (ringOuter > 0) readouts['Ring'] = `${ringHole} mm hole, ${ringOuter.toFixed(1)} mm across`;
  if (joints.length === 0) {
    issues.push({ level: 'warn', message: 'One letter has nothing to join to.', paramIds: ['text'] });
  }

  return { parts, issues, readouts };
}

export const flexiNameGenerator: Generator = {
  id: 'flexi-name',
  name: 'Hinged lettering keychain',
  family: { id: 'keychain', label: 'Hinged letters' },
  description: 'A name as a chain of chunky letters, hinged to each other, that prints in one go and moves.',
  tagline: 'Chunky two-tone letters on hidden print-in-place hinges',
  highlights: [
    'Every letter its own block, hinged to the next',
    'Rolls up and down, with a little play side to side',
    'Prints flat in one piece, hinges already in place',
    'Hinges hidden in the back colour, under the face',
    'Every joint\'s movement measured, not guessed',
  ],
  art: `<svg viewBox="0 0 120 96" role="img" aria-hidden="true">
    <circle cx="16" cy="48" r="8" fill="none" stroke="#9aa3b2" stroke-width="3"/>
    <g font-size="26" font-weight="900" font-family="ui-sans-serif, system-ui, sans-serif">
      <text x="25" y="62" fill="#6b4a32">N</text><text x="23" y="59" fill="#d8c08f">N</text>
      <text x="50" y="58" fill="#6b4a32" transform="rotate(8 60 48)">A</text><text x="48" y="55" fill="#d8c08f" transform="rotate(8 60 48)">A</text>
      <text x="76" y="56" fill="#6b4a32" transform="rotate(18 86 46)">M</text><text x="74" y="53" fill="#d8c08f" transform="rotate(18 86 46)">M</text>
    </g>
  </svg>`,
  params: flexiParams,
  groups: flexiGroups,
  fontsNeeded: (p) => [String(p.font)],
  validate: (p) => {
    const out: Issue[] = [];
    if (String(p.text ?? '').trim().length === 0) {
      out.push({ level: 'error', message: 'Enter a word.', paramIds: ['text'] });
    }
    if (Number(p.faceDepth) > Number(p.thickness) - 4) {
      out.push({
        level: 'warn',
        message: 'The back colour needs at least 4 mm under the face to hold the joints, so the face colour is held back to leave it.',
        paramIds: ['faceDepth', 'thickness'],
      });
    }
    return out;
  },
  build,
  presets: [
    {
      label: 'ETHAN - tan & brown',
      values: { text: 'ETHAN', faceColor: '#d8c08f', backColor: '#6b4a32' },
    },
    {
      label: 'MASON - blue & navy',
      values: { text: 'MASON', faceColor: '#1f7fd1', backColor: '#16314f' },
    },
    {
      label: 'EMMA - pink & lilac',
      values: { text: 'EMMA', faceColor: '#f4a3c0', backColor: '#9b7bd0' },
    },
    {
      label: 'LIAM - sky & dark blue',
      values: { text: 'LIAM', faceColor: '#2a8ae0', backColor: '#0f1d33' },
    },
    {
      label: 'AVA - hanging, mint',
      values: { text: 'AVA', pose: 'hang', faceColor: '#9be3c5', backColor: '#2f6f5a' },
    },
  ],
};
