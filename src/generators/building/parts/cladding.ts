import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import { IN_MM, rng, type Cladding, type Derived } from '../geometry';
import { cutAway, faceLen, faces, windowCentres, type Face } from './shape';

/**
 * The wall finish: brick, stone, siding, boards or panels, as joints cut into
 * the outer face of the exterior walls.
 *
 * Cut, never added. A course of brick standing proud of the wall would be a
 * thousand loose ledges, and every one of them an overhang; a mortar joint cut
 * a few tenths of a millimetre into the face is the same line on the model and
 * prints as part of the wall it is in.
 *
 * The interesting problem is the one the rest of this generator keeps meeting:
 * a real brick is too small to print. A course is 2 2/3 in, which is 0.47 mm at
 * 1:144 -- two layers, with the mortar joint between them a sixteenth of a
 * millimetre. So the joints are floored at what the printer can draw (two
 * layers across a horizontal joint, one nozzle across a vertical one), the
 * pattern is enlarged until the brick between them is at least twice the joint,
 * and the enlargement is REPORTED: the user is told the bricks are drawn 2.6
 * times real size, and which scale would show them true.
 */

interface Pattern {
  readonly label: string;
  /** Real inches, course to course. Zero for no horizontal joints. */
  readonly courseIn: number;
  /** Real inches, unit to unit along a course. Zero for no vertical joints. */
  readonly unitIn: number;
  /** Real inches across the joint. */
  readonly jointIn: number;
  /** How far each course is offset from the one below, as a share of a unit. */
  readonly bond: number;
  /** How much unit lengths vary, as a share of a unit. Stone is not sawn to size. */
  readonly jitter: number;
}

/**
 * Real-world sizes. A modular brick is 7 5/8 x 2 1/4 in laid with a 3/8 in
 * joint, which is where 8 in and 2 2/3 in come from. Ashlar is coursed in 16 in
 * stones about twice as long as they are high. Lap siding shows 6 in of each
 * board; board and batten puts a batten every foot. Precast panels are set out
 * on the building's own structural bay -- see `panelJoints`.
 */
const PATTERNS: Readonly<Record<Exclude<Cladding, 'smooth'>, Pattern>> = {
  brick: { label: 'brick', courseIn: 8 / 3, unitIn: 8, jointIn: 0.375, bond: 0.5, jitter: 0 },
  stone: { label: 'stone', courseIn: 16, unitIn: 32, jointIn: 0.75, bond: 0.5, jitter: 0.35 },
  siding: { label: 'siding board', courseIn: 6, unitIn: 0, jointIn: 0.5, bond: 0, jitter: 0 },
  batten: { label: 'board', courseIn: 0, unitIn: 12, jointIn: 0.75, bond: 0, jitter: 0 },
  panels: { label: 'panel', courseIn: 0, unitIn: 0, jointIn: 0.75, bond: 0, jitter: 0 },
};

export interface CladdingSize {
  readonly label: string;
  /** Model mm, course to course, after any enlargement. Zero for none. */
  readonly course: number;
  /** Model mm, unit to unit along a course, after any enlargement. Zero for none. */
  readonly unit: number;
  /** Model mm across a horizontal joint, and across a vertical one. */
  readonly jointZ: number;
  readonly jointU: number;
  /** How far the joints are cut into the face. */
  readonly depth: number;
  /** How many times real size the pattern is drawn. 1 when it is true to scale. */
  readonly blowup: number;
  /** What the course would have been at true scale, for the report. */
  readonly courseTrue: number;
}

/**
 * How deep a joint can be cut.
 *
 * Bounded by what reads -- a fifth of a millimetre is a line, a tenth is a
 * texture the slicer may or may not reproduce -- and by the storey joint: the
 * tongue runs round the middle of the wall head, and a joint cut deeper than
 * the lip outside it would break through into the groove of the storey above.
 */
function grooveDepth(d: Derived): number {
  let depth = Math.min(0.4, Math.max(0.2, d.extT * 0.25));
  if (d.joint === 'tongue') depth = Math.min(depth, (d.extT - d.tongueW) / 2 - 0.1);
  return depth;
}

/** The pattern at a given scale, or null for a smooth wall or one too thin to cut. */
export function claddingSize(d: Derived, scale = d.scale): CladdingSize | null {
  if (d.cladding === 'smooth' || !(d.cladding in PATTERNS)) return null;
  const p = PATTERNS[d.cladding];
  const depth = grooveDepth(d);
  if (depth < 0.15) return null;

  const perIn = IN_MM / scale;
  const jointZ = Math.max(p.jointIn * perIn, 2 * d.layer);
  const jointU = Math.max(p.jointIn * perIn, d.nozzle);
  const course = p.courseIn * perIn;
  const unit = p.unitIn * perIn;
  // Every unit at least twice as wide as the joint round it, or the face is
  // mostly mortar and the eye reads it as a grid rather than as bricks.
  const blowup = Math.max(
    1,
    course > 0 ? (3 * jointZ) / course : 1,
    unit > 0 ? (3 * jointU) / unit : 1,
  );
  return {
    label: p.label,
    course: course * blowup,
    unit: unit * blowup,
    jointZ,
    jointU,
    depth,
    blowup,
    courseTrue: course,
  };
}

/** Did the user ask for a finish this wall has no room to take? */
export function claddingTooThin(d: Derived): boolean {
  return d.cladding !== 'smooth' && grooveDepth(d) < 0.15;
}

/**
 * Vertical joints for precast panels, on the lines between window bays.
 *
 * A panel system is set out on the structural grid, and the windows are set
 * out on the same grid -- so a joint between two bays is where the eye expects
 * one, and a joint through the middle of a window is where it does not.
 */
function panelJoints(d: Derived, len: number): number[] {
  const n = windowCentres(d, len).length;
  const bay = d.pitch > 0 ? d.pitch : d.perFt * 10;
  const offset = n % 2 === 1 ? 0.5 : 0;
  const out: number[] = [];
  for (let k = -Math.ceil(len / bay) - 1; k <= Math.ceil(len / bay) + 1; k++) {
    const u = (k + offset) * bay;
    if (Math.abs(u) < len / 2 - d.pier) out.push(u + len / 2);
  }
  return out;
}

/**
 * The joint pattern for one face, in face coordinates: u along the face from
 * its start, v up the wall from the floor.
 */
function faceSection(
  m: ManifoldToplevel,
  d: Derived,
  s: CladdingSize,
  len: number,
  wallH: number,
  seed: number,
): CrossSection | null {
  const rects: CrossSection[] = [];
  const rect = (u0: number, v0: number, u1: number, v1: number) => {
    const a = Math.max(0, u0);
    const b = Math.min(len, u1);
    const lo = Math.max(0, v0);
    const hi = Math.min(wallH, v1);
    if (b - a > 1e-3 && hi - lo > 1e-3) {
      rects.push(m.CrossSection.square([b - a, hi - lo]).translate([a, lo]));
    }
  };
  const hJoint = (v: number) => rect(0, v - s.jointZ / 2, len, v + s.jointZ / 2);
  const vJoint = (u: number, v0: number, v1: number) =>
    rect(u - s.jointU / 2, v0, u + s.jointU / 2, v1);

  if (d.cladding === 'panels') {
    for (const u of panelJoints(d, len)) vJoint(u, 0, wallH);
    // A horizontal joint at the sill and at the head, which is where a
    // spandrel panel meets the glazing either side of it.
    for (const v of [d.sill, d.sill + d.winH]) {
      if (v > 2 * s.jointZ && v < wallH - 2 * s.jointZ) hJoint(v);
    }
  } else if (s.course > 0) {
    const p = PATTERNS[d.cladding as Exclude<Cladding, 'smooth'>];
    const rnd = rng(seed);
    const rows = Math.ceil(wallH / s.course);
    for (let k = 0; k < rows; k++) {
      const v0 = k * s.course;
      const v1 = v0 + s.course;
      if (k > 0) hJoint(v0);
      if (s.unit <= 0) continue;
      // Running bond: every other course set over by half a unit, so no head
      // joint lines up with the one below it.
      let u = (k % 2) * p.bond * s.unit;
      if (u <= 0) u = s.unit;
      while (u < len - s.jointU) {
        vJoint(u, v0, v1);
        u += s.unit * (1 + p.jitter * (rnd() - 0.5) * 2);
      }
    }
  } else if (s.unit > 0) {
    for (let u = s.unit; u < len - s.jointU; u += s.unit) vJoint(u, 0, wallH);
  }
  return rects.length > 0 ? m.CrossSection.union(rects) : null;
}

/**
 * Turn a face-coordinate pattern into a cutter in the wall it belongs to:
 * `depth` into the wall and `out` clear of its face.
 */
function placeOnFace(
  section: CrossSection,
  f: Face,
  start: number,
  floor: number,
  depth: number,
  out: number,
): Manifold {
  const t = depth + out;
  // Rotating +90 about X stands the pattern up: u stays along X, v becomes
  // height, and the extrusion runs toward -Y. A further +90 about Z turns it
  // to run along Y with the extrusion toward +X.
  const slab = section.extrude(t);
  if (f.alongX) {
    // y spans [-t, 0] after the rotation.
    const y = f.side < 0 ? f.at + depth : f.at + out;
    return slab.rotate([90, 0, 0]).translate([start, y, floor]);
  }
  // x spans [0, t] after both rotations.
  const x = f.side > 0 ? f.at - depth : f.at - out;
  return slab.rotate([90, 0, 90]).translate([x, start, floor]);
}

/** Every joint on the walls of one storey, as one cutter, or null for a smooth wall. */
export function claddingCutter(m: ManifoldToplevel, d: Derived, level: number): Manifold | null {
  const s = claddingSize(d);
  if (!s) return null;
  const floor = d.levelZ[level]! + d.slabT;
  const wallH = d.levelH[level]! - d.slabT;
  if (wallH <= 0) return null;

  const cutters: Manifold[] = [];
  for (const [i, f] of faces(d).entries()) {
    // A shelf wall is never seen, and a wall that is not there has no face.
    if (f.blank || cutAway(d, f)) continue;
    // On a chamfered plan the straight run of each face stops where the
    // chamfer starts; the chamfer faces themselves are left smooth.
    const start = f.c0 + d.chamfer;
    const len = faceLen(f) - 2 * d.chamfer;
    if (len <= 0) continue;
    // The seed is the face and the storey, so stone does not repeat the same
    // pattern on every wall but does stay put while other sliders move.
    const section = faceSection(m, d, s, len, wallH, d.seed * 31 + level * 7 + i);
    if (section) cutters.push(placeOnFace(section, f, start, floor, s.depth, 1));
  }
  return cutters.length > 0 ? m.Manifold.union(cutters) : null;
}
