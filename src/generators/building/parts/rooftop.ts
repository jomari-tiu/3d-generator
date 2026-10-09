import type { CrossSection, Manifold, ManifoldToplevel, Vec2 } from 'manifold-3d';
import type { Derived, Rooftop } from '../geometry';
import { area, depth, width, type Rect } from '../plan';
import { hasBulkhead, penthouseSpan, roofScreenSpan } from './roof';
import { innerCorner, isCorner } from './shape';

/**
 * What stands on a flat roof.
 *
 * The things real flat roofs actually carry, and the reason each is there: a
 * helipad over the core of a tall office, a roof garden on a residential
 * block, air-handling plant on a commercial one, a timber water tank on legs
 * over an older city block where the mains pressure gives out a few floors up,
 * and rows of solar panels on anything built lately.
 *
 * Every piece is printable as it stands -- deck down, nothing overhanging by
 * more than 45 degrees except the water tank's platform, which bridges between
 * its legs -- and every piece is rooted a few tenths into the deck, the same
 * discipline as everything else standing on something in this generator. They
 * come out as one part of their own, so they can take a colour of their own.
 */

/** Below this, in real feet across, the feature does not fit on the roof. */
export const ROOFTOP_MIN_FT: Readonly<Record<Exclude<Rooftop, 'empty'>, number>> = {
  helipad: 24,
  garden: 12,
  plant: 9,
  watertank: 16,
  solar: 9,
};

export const ROOFTOP_LABEL: Readonly<Record<Exclude<Rooftop, 'empty'>, string>> = {
  helipad: 'Helipad',
  garden: 'Roof garden',
  plant: 'Rooftop plant',
  watertank: 'Water tank',
  solar: 'Solar panels',
};

/** Is there a deck for anything to stand on? */
export function flatDeck(d: Derived): boolean {
  return d.roof === 'flat' || d.roof === 'parapet' || d.roof === 'penthouse' || d.roof === 'railing';
}

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** The biggest part of `r` left clear of `o`. */
function clearOf(r: Rect, o: Rect | null): Rect {
  if (!o || !overlaps(r, o)) return r;
  const options: Rect[] = [
    { ...r, x1: o.x0 },
    { ...r, x0: o.x1 },
    { ...r, y1: o.y0 },
    { ...r, y0: o.y1 },
  ].filter((q) => width(q) > 0 && depth(q) > 0);
  return options.reduce((a, b) => (area(b) > area(a) ? b : a), { ...r, x1: r.x0 });
}

/**
 * The open deck: inside the parapet, in front of the penthouse, clear of the
 * plant room over the core. On a corner building, the longer of the two arms.
 */
export function deckSpan(d: Derived, core: Rect | null): Rect | null {
  const t = (d.roof === 'flat' ? 0 : d.parapetT) + Math.max(d.perFt, d.minWall);
  const c = d.chamfer * 0.6;
  let candidates: Rect[];
  if (isCorner(d)) {
    const { ix, iy } = innerCorner(d);
    candidates = [
      { x0: -d.W / 2 + t, x1: d.W / 2 - t, y0: iy + t, y1: d.D / 2 - t },
      { x0: -d.W / 2 + t, x1: ix - t, y0: -d.D / 2 + t, y1: d.D / 2 - t },
    ];
  } else {
    candidates = [{ x0: -d.W / 2 + t + c, x1: d.W / 2 - t - c, y0: -d.D / 2 + t + c, y1: d.D / 2 - t - c }];
  }

  const pent = d.roof === 'penthouse' ? penthouseSpan(d) : null;
  const plant =
    core && hasBulkhead(d, core)
      ? { x0: core.x0 - d.extT - t, x1: core.x1 + d.extT + t, y0: core.y0 - d.extT - t, y1: core.y1 + d.extT + t }
      : null;
  const pentKeepOut = pent ? { x0: pent.x0 - t, x1: pent.x1 + t, y0: pent.y0 - t, y1: pent.y1 + t } : null;
  const scr = roofScreenSpan(d);
  const screenKeepOut = scr ? { x0: scr.x0 - t, x1: scr.x1 + t, y0: scr.y0 - t, y1: scr.y1 + t } : null;

  const clear = candidates
    .map((r) => clearOf(clearOf(clearOf(r, pentKeepOut), plant), screenKeepOut))
    .filter((r) => width(r) > 0 && depth(r) > 0);
  if (clear.length === 0) return null;
  return clear.reduce((a, b) => (Math.min(width(b), depth(b)) > Math.min(width(a), depth(a)) ? b : a));
}

/** Does the chosen feature fit on this roof? */
export function rooftopFits(d: Derived, core: Rect | null): boolean {
  if (!flatDeck(d) || d.rooftop === 'empty') return true;
  const span = deckSpan(d, core);
  if (!span) return false;
  return Math.min(width(span), depth(span)) >= ROOFTOP_MIN_FT[d.rooftop] * d.perFt;
}

function box(
  m: ManifoldToplevel,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
): Manifold {
  return m.Manifold.cube([x1 - x0, y1 - y0, z1 - z0], true).translate([
    (x0 + x1) / 2,
    (y0 + y1) / 2,
    (z0 + z1) / 2,
  ]);
}

/**
 * A helipad: a square pad with the standard touchdown ring and H on it.
 *
 * A real rooftop pad is 40 to 60 ft across; this one is as big as the roof
 * allows up to 56 ft. The markings are raised rather than painted, two layers
 * of relief, so a filament change -- or a dab of white paint -- picks them out.
 */
function helipad(m: ManifoldToplevel, d: Derived, r: Rect, z: number): Manifold[] {
  const s = Math.min(width(r), depth(r), d.perFt * 56);
  const cx = (r.x0 + r.x1) / 2;
  const cy = (r.y0 + r.y1) / 2;
  const padH = Math.max(d.perFt * 1.5, 2 * d.minPlate);
  const top = z + padH;
  const relief = Math.max(2 * d.layer, 0.3);
  const line = Math.max(2 * d.nozzle, s * 0.04);

  const ringR = s * 0.42;
  const ring = m.CrossSection.circle(ringR, 64).subtract(m.CrossSection.circle(ringR - line, 64));
  const hH = s * 0.36;
  const hW = s * 0.24;
  const stroke = Math.max(2 * d.nozzle, s * 0.06);
  const letter = m.CrossSection.union([
    m.CrossSection.square([stroke, hH], true).translate([-hW / 2 + stroke / 2, 0]),
    m.CrossSection.square([stroke, hH], true).translate([hW / 2 - stroke / 2, 0]),
    m.CrossSection.square([hW, stroke], true),
  ]);
  const marks: CrossSection = ring.add(letter);

  return [
    box(m, cx - s / 2, cx + s / 2, cy - s / 2, cy + s / 2, z - 0.3, top),
    m.Manifold.extrude(marks, relief + 0.1).translate([cx, cy, top - 0.1]),
  ];
}

/**
 * A roof garden: planters round the edge, a lawn, and trees.
 *
 * The trees are two cones point to point -- spreading out at 45 degrees from
 * the trunk, then closing to a point -- because a ball on a stick is an
 * overhang the whole way round and a cone standing on its base is not.
 */
function garden(m: ManifoldToplevel, d: Derived, r: Rect, z: number): Manifold[] {
  const out: Manifold[] = [];
  const pw = Math.max(d.perFt * 3, 3 * d.minWall);
  const planterH = d.perFt * 2.5;
  const outer = m.CrossSection.square([width(r), depth(r)]).translate([r.x0, r.y0]);
  const inner = m.CrossSection.square([width(r) - 2 * pw, depth(r) - 2 * pw]).translate([
    r.x0 + pw,
    r.y0 + pw,
  ]);
  out.push(m.Manifold.extrude(outer.subtract(inner), planterH + 0.3).translate([0, 0, z - 0.3]));

  const lawnInset = pw + d.perFt * 2;
  const lawnH = Math.max(d.perFt * 0.6, 2 * d.layer);
  const lawn: Rect = {
    x0: r.x0 + lawnInset,
    x1: r.x1 - lawnInset,
    y0: r.y0 + lawnInset,
    y1: r.y1 - lawnInset,
  };
  if (width(lawn) <= 0 || depth(lawn) <= 0) return out;
  out.push(box(m, lawn.x0, lawn.x1, lawn.y0, lawn.y1, z - 0.3, z + lawnH));

  const spacing = d.perFt * 14;
  const nx = Math.max(1, Math.min(4, Math.floor(width(lawn) / spacing)));
  const ny = Math.max(1, Math.min(3, Math.floor(depth(lawn) / spacing)));
  const trunkR = Math.max(d.perFt * 0.5, d.nozzle * 1.25);
  const spread = Math.min(d.perFt * 4, width(lawn) / (2 * nx), depth(lawn) / (2 * ny));
  if (spread < 2 * trunkR) return out;
  const base = z + lawnH - 0.2;
  const trunkH = d.perFt * 3;
  const rise = spread - trunkR;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const tx = lawn.x0 + (width(lawn) * (i + 0.5)) / nx;
      const ty = lawn.y0 + (depth(lawn) * (j + 0.5)) / ny;
      out.push(
        m.Manifold.cylinder(trunkH + 0.2, trunkR, trunkR, 16).translate([tx, ty, base]),
        m.Manifold.cylinder(rise, trunkR, spread, 24).translate([tx, ty, base + trunkH]),
        m.Manifold.cylinder(spread * 1.6, spread, 0, 24).translate([tx, ty, base + trunkH + rise]),
      );
    }
  }
  return out;
}

/**
 * Air-handling units on a common curb: boxes with a fan recessed into the top,
 * the thing every commercial flat roof has a row of.
 */
function plant(m: ManifoldToplevel, d: Derived, r: Rect, z: number): Manifold[] {
  const alongX = width(r) >= depth(r);
  const len = alongX ? width(r) : depth(r);
  const cross = alongX ? depth(r) : width(r);
  const uw = d.perFt * 8;
  const ud = Math.min(d.perFt * 6, cross);
  const uh = d.perFt * 5;
  const gap = d.perFt * 2;
  const n = Math.min(4, Math.floor((len + gap) / (uw + gap)));
  if (n < 1) return [];
  const run = n * uw + (n - 1) * gap;
  const cx = (r.x0 + r.x1) / 2;
  const cy = (r.y0 + r.y1) / 2;
  const curbH = Math.max(d.perFt * 0.75, 2 * d.layer);
  const at = (u: number, v: number): [number, number] => (alongX ? [cx + u, cy + v] : [cx + v, cy + u]);

  const out: Manifold[] = [];
  const [c0x, c0y] = at(-run / 2 - d.perFt, -ud / 2 - d.perFt * 0.5);
  const [c1x, c1y] = at(run / 2 + d.perFt, ud / 2 + d.perFt * 0.5);
  out.push(box(m, Math.min(c0x, c1x), Math.max(c0x, c1x), Math.min(c0y, c1y), Math.max(c0y, c1y), z - 0.3, z + curbH));

  const fanR = Math.min(uw, ud) * 0.32;
  const fanD = Math.max(2 * d.layer, 0.3);
  for (let k = 0; k < n; k++) {
    const u = -run / 2 + uw / 2 + k * (uw + gap);
    const [ux, uy] = at(u, 0);
    const [hx, hy] = alongX ? [uw / 2, ud / 2] : [ud / 2, uw / 2];
    const unit = box(m, ux - hx, ux + hx, uy - hy, uy + hy, z + curbH - 0.2, z + curbH + uh);
    const fan = m.Manifold.cylinder(fanD + 0.1, fanR, fanR, 32).translate([ux, uy, z + curbH + uh - fanD]);
    out.push(unit.subtract(fan));
  }
  return out;
}

/**
 * A timber water tank on a steel stand, the rooftop silhouette of an older
 * city block. Five legs rather than four: the centre one halves the bridge
 * the platform has to print across.
 */
function waterTank(m: ManifoldToplevel, d: Derived, r: Rect, z: number): Manifold[] {
  const span = Math.min(width(r), depth(r));
  const tankR = Math.min(d.perFt * 6, span * 0.4);
  const cx = (r.x0 + r.x1) / 2;
  const cy = (r.y0 + r.y1) / 2;
  const leg = Math.max(d.perFt, 2.5 * d.nozzle);
  const legH = d.perFt * 9;
  const platT = Math.max(d.perFt * 0.8, d.minPlate);
  const plat = tankR + d.perFt * 0.75;
  const tankH = d.perFt * 11;
  const capH = d.perFt * 3.5;
  const zPlat = z + legH;

  const out: Manifold[] = [];
  const legAt = (x: number, y: number) =>
    out.push(box(m, x - leg / 2, x + leg / 2, y - leg / 2, y + leg / 2, z - 0.3, zPlat + 0.2));
  const off = plat - leg / 2;
  legAt(cx - off, cy - off);
  legAt(cx + off, cy - off);
  legAt(cx - off, cy + off);
  legAt(cx + off, cy + off);
  legAt(cx, cy);
  out.push(box(m, cx - plat, cx + plat, cy - plat, cy + plat, zPlat, zPlat + platT));
  const zTank = zPlat + platT - 0.2;
  out.push(
    m.Manifold.cylinder(tankH + 0.2, tankR, tankR, 48).translate([cx, cy, zTank]),
    m.Manifold.cylinder(capH, tankR, tankR * 0.12, 48).translate([cx, cy, zTank + tankH]),
  );
  return out;
}

/**
 * Rows of solar panels, each a solid wedge tilted 25 degrees toward the front.
 * A wedge rather than a tilted plate on stilts: it prints with no overhang at
 * all, and from above it reads exactly the same.
 */
function solar(m: ManifoldToplevel, d: Derived, r: Rect, z: number): Manifold[] {
  const rowD = d.perFt * 5;
  const rise = rowD * Math.tan((25 * Math.PI) / 180);
  const lift = Math.max(d.perFt * 0.75, 2 * d.layer);
  const pitch = d.perFt * 9;
  const n = Math.floor((depth(r) - rowD) / pitch) + 1;
  const len = width(r) - 2 * d.perFt;
  if (n < 1 || len <= d.perFt * 4) return [];
  // Profile in (y, z), extruded along X: the low edge at the front.
  const profile: Vec2[] = [
    [0, -0.3],
    [rowD, -0.3],
    [rowD, lift + rise],
    [0, lift],
  ];
  const wedge = m.CrossSection.ofPolygons([profile], 'NonZero').extrude(len);
  const out: Manifold[] = [];
  const used = (n - 1) * pitch + rowD;
  const y0 = (r.y0 + r.y1) / 2 - used / 2;
  for (let k = 0; k < n; k++) {
    // u along the profile's x becomes world y, its y world z, and the
    // extrusion world x -- see placeOnFace in cladding.ts for the same turn.
    out.push(wedge.rotate([90, 0, 90]).translate([r.x0 + d.perFt, y0 + k * pitch, z]));
  }
  return out;
}

/** Whatever is on the roof, as one solid, or null for a bare deck. */
export function buildRooftop(m: ManifoldToplevel, d: Derived, core: Rect | null): Manifold | null {
  if (!flatDeck(d) || d.rooftop === 'empty' || !rooftopFits(d, core)) return null;
  const r = deckSpan(d, core)!;
  const z = d.roofZ + d.roofT;
  const pieces =
    d.rooftop === 'helipad'
      ? helipad(m, d, r, z)
      : d.rooftop === 'garden'
        ? garden(m, d, r, z)
        : d.rooftop === 'plant'
          ? plant(m, d, r, z)
          : d.rooftop === 'watertank'
            ? waterTank(m, d, r, z)
            : solar(m, d, r, z);
  return pieces.length > 0 ? m.Manifold.union(pieces) : null;
}
