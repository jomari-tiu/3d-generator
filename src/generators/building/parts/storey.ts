import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import { roofAccess, type Derived } from '../geometry';
import type { Door, Plan, Wall } from '../plan';
import { faceOut, storeyFacade } from './facade';
import { claddingCutter } from './cladding';
import {
  cornerPiers,
  cutAway,
  faceLen,
  faceMid,
  faces,
  footprintSection,
  frontBand,
  frontFace,
  innerCorner,
  insideOutline,
  isCorner,
  shelfClip,
  shellSection,
  windowCentres,
  type Face,
} from './shape';
import { buildStairs } from './stairs';

/**
 * One storey: slab, exterior walls, partitions, openings, the facade the style
 * calls for, and the stair that climbs out of it.
 *
 * The order the booleans happen in is the whole design of this file, and none
 * of it is arbitrary:
 *
 *   1. slab and exterior walls
 *   2. the stairwell void through the slab
 *   3. windows, the entrance and the style's shell cuts, from that shell ALONE
 *   4. clipped to the footprint, if the corners are chamfered
 *   5. partitions unioned on
 *   6. doors cut
 *   7. the style's deep cuts -- a balcony recess reaches into the rooms
 *   8. everything that stands proud of the wall
 *   9. the stair unioned on
 *
 * Windows go in at step 3 rather than step 6 for a reason worth stating. A
 * partition that happens to land on a window would otherwise be cut by it: the
 * opening is as deep as the exterior wall, the partition reaches into that wall
 * to tie itself on, and the window cut would take that tie away and leave the
 * partition standing loose. Cutting the shell first leaves the partition
 * bridging the back of the opening instead -- which is exactly what you would
 * see through the glass of a real building.
 *
 * The balcony recess goes at step 7 for the opposite reason. It is 6 ft deep,
 * well inside the rooms, so cutting it before the partitions exist would let
 * them fill the balcony straight back in. Cutting it after cannot strand
 * anything: every partition is welded to the slab along its whole length, so a
 * cut across one leaves two pieces still standing on the floor.
 *
 * The stair goes on last because a doorway cut into a shaft wall reaches past
 * that wall into the shaft, and would take a bite out of whatever tread was
 * behind it.
 */

/** Inward overshoot, into open interior air, where nothing is at risk. */
const IN = 0.5;

export { windowCentres };

/**
 * A box spanning an exterior wall, given its centre and extent along the face
 * and its z band. The one place the faces are unified.
 *
 * `outM` and `inM` are how far past the outer and inner faces it reaches: a
 * cutter wants both, so it breaks cleanly through; a mullion wants neither, so
 * it sits flush in the wall it is filling.
 */
function faceBox(
  m: ManifoldToplevel,
  d: Derived,
  face: Face,
  centre: number,
  along: number,
  z0: number,
  z1: number,
  outM: number,
  inM: number,
): Manifold {
  const near = face.at + face.side * outM;
  const far = face.at - face.side * (d.extT + inM);
  const thick = Math.abs(near - far);
  const mid = (near + far) / 2;
  const h = z1 - z0;
  return m.Manifold.cube(
    face.alongX ? [along, thick, h] : [thick, along, h],
    true,
  ).translate(face.alongX ? [centre, mid, z0 + h / 2] : [mid, centre, z0 + h / 2]);
}

/**
 * How deep into the wall an opening is cut, measured from the outer face.
 *
 * Everything hangs off this one number. Past the inner face (`extT + IN`) the
 * opening is a hole; stopped short of it, the same cut is a reveal with a pane
 * of wall standing at the back -- which is a closed window, is monolithic with
 * the wall so nothing can come loose, and braces an opening that would
 * otherwise be a gap the storey above has to bridge.
 */
function glazedDepth(d: Derived): number {
  return d.glazing ? d.extT - d.paneT : d.extT + IN;
}

/** The z band a storey's windows occupy, or null when none fits. */
function windowBand(d: Derived, level: number): { sill: number; head: number } | null {
  const z0 = d.levelZ[level]!;
  const h = d.levelH[level]!;
  const sill = z0 + d.slabT + d.sill;
  // The head has to stay under the slab above with a course of wall left over,
  // or the "window" is an open-topped notch and the storey above sits on air.
  const head = Math.min(sill + d.winH, z0 + h - Math.max(d.minWall, d.perFt * 0.5));
  return head - sill < d.minWall ? null : { sill, head };
}

/**
 * The mullion piers, as PLAN footprints to be left out of the ribbon opening.
 *
 * Holes in the cutter, not bars added back afterwards. The difference is not
 * cosmetic: a bar unioned on after the fact is held only by the wall above and
 * below it, and where something else has already taken that wall away -- the
 * entrance, most obviously, which is cut in the same breath as the ribbon --
 * the bar is left standing in mid-air, welded to nothing. As part of the
 * cutter, a mullion is simply wall that was never cut, and it cannot come away
 * from a wall it has always been.
 */
function mullionFootprints(m: ManifoldToplevel, d: Derived): CrossSection | null {
  if (!d.t.mullions || d.mullionPitch <= 0) return null;
  const thick = d.extT + 4;
  const bars: CrossSection[] = [];
  for (const face of faces(d)) {
    if (face.blank) continue;
    const across = face.at - (face.side * d.extT) / 2;
    const avail = faceLen(face) - 2 * d.pier;
    const n = Math.floor(avail / d.mullionPitch) - 1;
    for (let k = 1; k <= n; k++) {
      const c = faceMid(face) - avail / 2 + (avail * k) / (n + 1);
      bars.push(
        m.CrossSection.square(
          face.alongX ? [d.mullionT, thick] : [thick, d.mullionT],
          true,
        ).translate(face.alongX ? [c, across] : [across, c]),
      );
    }
  }
  return bars.length > 0 ? m.CrossSection.union(bars) : null;
}

/**
 * A ribbon window as a band cut through the whole wall RING, rather than four
 * separate face cuts.
 *
 * Which is not a tidiness point. A chamfered corner has a fifth and sixth face
 * that no per-face loop knows about, and the ribbon wrapping round that chamfer
 * is the entire look of the commercial style. Cut the ring and the chamfer is
 * included for free, for whatever outline the footprint ever grows.
 */
function ribbonCutter(m: ManifoldToplevel, d: Derived, sill: number, head: number): Manifold | null {
  let band = footprintSection(m, d, -faceOut(d))
    .subtract(footprintSection(m, d, glazedDepth(d)))
    .subtract(cornerPiers(m, d));
  const bars = mullionFootprints(m, d);
  if (bars) band = band.subtract(bars);
  if (band.area() <= 0) return null;
  return m.Manifold.extrude(band, head - sill).translate([0, 0, sill]);
}

/** Every window opening on one storey. */
function windowCutters(m: ManifoldToplevel, d: Derived, level: number): Manifold[] {
  if (d.windows === 'none') return [];
  const band = windowBand(d, level);
  if (!band) return [];

  if (d.windows === 'ribbon') {
    const ring = ribbonCutter(m, d, band.sill, band.head);
    return ring ? [ring] : [];
  }

  const out: Manifold[] = [];
  const inM = glazedDepth(d) - d.extT;
  const shop = level === 0 && d.t.ground === 'shop';
  for (const face of faces(d)) {
    // No wall means no windows -- there is nothing left to punch. A shelf
    // wall has a wall, but the only thing on the other side of it is the wall
    // of the room the shelf is in.
    if (face.blank || cutAway(d, face)) continue;
    // A shop front has shop bays in place of windows -- see shopBays().
    if (shop && face.front) continue;
    for (const c of windowCentres(d, faceLen(face))) {
      out.push(
        paned(m, d, face, faceMid(face) + c, d.winW, band.sill, band.head, faceOut(d), inM),
      );
    }
  }
  return out;
}

/**
 * A raised surround round every punched window, and a sill under it.
 *
 * Standing proud of the face, so they are added after every cut and nothing
 * aimed at the wall can reach them; rooted a little into the wall so they are
 * welded on. The sill stands out further than the surround -- the ledge that
 * makes a window read as a window in a facade of a hundred of them -- and is
 * shallow enough, at a millimetre, to print without support under it.
 */
function windowTrims(m: ManifoldToplevel, d: Derived, level: number): Manifold[] {
  if (!d.t.trim || d.windows !== 'punched') return [];
  const band = windowBand(d, level);
  if (!band) return [];
  const z0 = d.levelZ[level]!;
  const top = z0 + d.levelH[level]!;
  const floor = z0 + d.slabT;
  const shop = level === 0 && d.t.ground === 'shop';
  const tw = Math.max(d.minWall, d.perFt * 0.45);
  const proud = Math.max(d.minWall * 0.75, d.perFt * 0.25);
  const sillP = Math.min(proud * 1.8, proud + 0.6);
  const root = 0.3 - d.extT;
  const out: Manifold[] = [];
  for (const face of faces(d)) {
    if (face.blank || cutAway(d, face)) continue;
    if (shop && face.front) continue;
    for (const c of windowCentres(d, faceLen(face))) {
      const x = faceMid(face) + c;
      const lo = Math.max(floor, band.sill - tw);
      const hi = Math.min(top, band.head + tw);
      const surround = faceBox(m, d, face, x, d.winW + 2 * tw, lo, hi, proud, root).subtract(
        faceBox(m, d, face, x, d.winW, band.sill, band.head, proud + 1, root + 0.2),
      );
      out.push(surround);
      const sillLo = Math.max(floor, lo - tw * 0.6);
      out.push(faceBox(m, d, face, x, d.winW + 3 * tw, sillLo, lo + tw * 0.5, sillP, root));
    }
  }
  return out;
}

/**
 * Blank blade signs standing out square from the front, one near each end,
 * up the upper floors -- the hanging "APARTMENTS" and "PAWN" boards of an old
 * commercial street. Blank, like every sign here, for a decal or paint.
 *
 * Built whole and cut storey by storey, as the screen is, so the pieces stack.
 * The bottom edge is cut back at 45 degrees toward the wall: a blade is a
 * plate standing out from the facade, and a square bottom edge would be an
 * overhang the full depth of it.
 */
function bladeSigns(m: ManifoldToplevel, d: Derived, z0: number, h: number): Manifold[] {
  if (!d.t.blades || d.floors < 2 || d.openFront) return [];
  const f = frontFace(d);
  const len = faceLen(f);
  const cs = windowCentres(d, len);
  const xs =
    cs.length >= 2
      ? [faceMid(f) + (cs[0]! + cs[1]!) / 2, faceMid(f) + (cs[cs.length - 2]! + cs[cs.length - 1]!) / 2]
      : [f.c0 + d.pier / 2, f.c1 - d.pier / 2];
  const t = Math.max(1.5 * d.minWall, d.perFt * 0.7);
  const reach = Math.max(d.perFt * 3, 4 * d.minWall);
  const zs = d.levelZ[1]! + d.perFt * 1.5;
  const ze = Math.min(zs + d.perFt * 14, d.roofZ - d.perFt);
  if (ze - zs < reach + d.perFt) return [];
  const s0 = Math.max(z0, zs);
  const s1 = Math.min(z0 + h, ze);
  if (s1 - s0 < 1e-3) return [];
  // Profile in (out from the face, height); its sign follows the face, so the
  // blade stands outward whichever way the front faces.
  const a = (o: number) => f.side * o;
  const profile: [number, number][] = [
    [a(-0.3), zs],
    [a(reach), zs + reach],
    [a(reach), ze],
    [a(-0.3), ze],
  ];
  const section = m.CrossSection.ofPolygons([profile], 'NonZero');
  return [...new Set(xs.map((x) => Math.round(x * 1000) / 1000))].map((x) =>
    // u -> y, v -> z, extrusion -> x: the same turn as everywhere else here.
    section
      .extrude(t)
      .rotate([90, 0, 90])
      .translate([x - t / 2, f.at, 0])
      .intersect(m.Manifold.cube([t + 2, 2 * reach + 4, s1 - s0], true).translate([x, f.at, (s0 + s1) / 2])),
  );
}

/**
 * An opening's cutter with its glazing bars left out of it.
 *
 * Bars are wall that was never cut, the same as a ribbon's mullions, so they
 * cannot come away from the wall they have always been: a mullion every couple
 * of feet, and a transom across the upper third once the opening is tall
 * enough to have one. Glazed, they stand in front of the pane; unglazed, each
 * still runs jamb to jamb or sill to head. Without panes, the plain cutter.
 */
function paned(
  m: ManifoldToplevel,
  d: Derived,
  face: Face,
  centre: number,
  w: number,
  z0: number,
  z1: number,
  outM: number,
  inM: number,
  arch = false,
): Manifold {
  // An arched head is a half-round on top of the opening, springing from the
  // point one half-width below the head. It needs no bridge: every course of
  // it is held by the course below.
  const spring = arch ? z1 - w / 2 : z1;
  let cut = faceBox(m, d, face, centre, w, z0, spring + (arch ? 0.01 : 0), outM, inM);
  if (arch && spring > z0) cut = cut.add(archHead(m, d, face, centre, w, spring, outM, inM));
  if (!d.t.panes) return cut;
  const bar = d.paneBar;
  const lights = Math.max(1, Math.round(w / (d.perFt * 2.5)));
  const bars: Manifold[] = [];
  if (w / lights >= 3 * bar) {
    for (let i = 1; i < lights; i++) {
      const c = centre - w / 2 + (i * w) / lights;
      bars.push(faceBox(m, d, face, c, bar, z0 - 0.1, z1 + 0.1, outM + 1, inM + 1));
    }
  }
  // The transom: across the spring line of an arch, which makes its head a
  // fanlight, or across the top third of a square opening tall enough for one.
  const t = arch ? spring : z0 + (z1 - z0) * 0.7;
  if ((arch && spring - z0 >= 3 * bar) || (!arch && z1 - z0 >= d.perFt * 4 && (z1 - z0) * 0.3 >= 3 * bar)) {
    bars.push(faceBox(m, d, face, centre, w + 0.2, t - bar / 2, t + bar / 2, outM + 1, inM + 1));
  }
  return bars.length > 0 ? cut.subtract(m.Manifold.union(bars)) : cut;
}

/** The half-round head of an arched opening, as a cylinder through the wall. */
function archHead(
  m: ManifoldToplevel,
  d: Derived,
  face: Face,
  centre: number,
  w: number,
  spring: number,
  outM: number,
  inM: number,
): Manifold {
  const near = face.at + face.side * outM;
  const far = face.at - face.side * (d.extT + inM);
  const thick = Math.abs(near - far);
  const mid = (near + far) / 2;
  // A cylinder stands along Z; laid on its side it runs through the wall.
  const drum = m.Manifold.cylinder(thick, w / 2, w / 2, 48, true);
  const turned = face.alongX ? drum.rotate([90, 0, 0]) : drum.rotate([0, 90, 0]);
  return turned.translate(face.alongX ? [centre, mid, spring] : [mid, centre, spring]);
}

/**
 * Glazed shop bays across the front of the ground floor: one per structural
 * bay, from a low kick plate to the entrance head, with a pier between each.
 * The bay the front door is in is left to the door.
 */
function shopBays(m: ManifoldToplevel, d: Derived): Manifold[] {
  if (d.t.ground !== 'shop' || d.openFront) return [];
  const f = frontFace(d);
  const floor = d.levelZ[0]! + d.slabT;
  const top = Math.min(
    floor + d.entranceH,
    d.levelZ[0]! + d.levelH[0]! - Math.max(d.minWall, d.perFt * 0.5),
  );
  const sill = floor + Math.max(d.perFt, d.minWall);
  if (top - sill < d.minWall) return [];
  const inM = glazedDepth(d) - d.extT;
  const pier = Math.max(d.perFt * 1.5, 2 * d.extT);
  const half = faceLen(f) / 2;

  // A shop window is a display window, not an upstairs window at street level:
  // a run of them either side of the door, each as near 10 ft as divides its
  // run evenly, with a pier between each -- the way a row of shops is set out,
  // and why the door never has to be dodged.
  const runs: [number, number][] = d.entrance
    ? [
        [-half + d.pier, -d.entranceW / 2 - pier],
        [d.entranceW / 2 + pier, half - d.pier],
      ]
    : [[-half + d.pier, half - d.pier]];
  const out: Manifold[] = [];
  for (const [a, b] of runs) {
    const run = b - a;
    if (run < d.perFt * 2) continue;
    const n = Math.max(1, Math.round(run / (d.perFt * 10)));
    const w = (run - (n - 1) * pier) / n;
    if (w < d.minWall) continue;
    for (let k = 0; k < n; k++) {
      const c = a + w / 2 + k * (w + pier);
      out.push(paned(m, d, f, faceMid(f) + c, w, sill, top, faceOut(d), inM, d.archedShops));
    }
  }
  return out;
}


/** The front door, on the ground floor only. */
function entranceCutter(m: ManifoldToplevel, d: Derived): Manifold | null {
  if (!d.entrance || d.openFront) return null;
  const floor = d.levelZ[0]! + d.slabT;
  const top = Math.min(
    floor + d.entranceH,
    d.levelZ[0]! + d.levelH[0]! - Math.max(d.minWall, d.perFt * 0.5),
  );
  if (top - floor < d.minWall) return null;
  // Down a touch into the slab: a cut that stops exactly on the floor plane is
  // the coplanar contact this project keeps getting bitten by, and 0.1 mm of
  // threshold is three real inches at 1:144 -- which is a threshold.
  //
  // A hung door is the same cut stopped short of the inner face, so the leaf
  // is the wall it was cut from. It is worth saying why the leaf is left at
  // the BACK: a door reads by its reveal, and a leaf flush with the facade has
  // none.
  const inM = d.doorLeaves ? -d.paneT : IN;
  const front = frontFace(d);
  return faceBox(m, d, front, faceMid(front), d.entranceW, floor - 0.1, top, faceOut(d), inM);
}

function partitionSolid(m: ManifoldToplevel, d: Derived, w: Wall, z0: number, h: number): Manifold {
  const len = w.to - w.from + 2 * d.tie;
  const mid = (w.from + w.to) / 2;
  // Rooted INTO the slab, not stood on it. Normally a partition is welded to
  // the exterior wall at both ends and the plane it shares with the floor
  // never matters -- but an open ground floor has no exterior wall to tie to,
  // so the core enclosure was held to the model by that plane alone and came
  // away as a loose box with the stair inside it.
  const root = Math.min(d.slabT / 2, 0.3);
  const zBase = z0 - root;
  const height = h + root;
  return m.Manifold.cube(
    w.horizontal ? [len, d.partT, height] : [d.partT, len, height],
    true,
  ).translate(
    w.horizontal ? [mid, w.at, zBase + height / 2] : [w.at, mid, zBase + height / 2],
  );
}

function doorCutters(m: ManifoldToplevel, d: Derived, dr: Door, floor: number, wallH: number): Manifold[] {
  // Full height unless a lintel was asked for. A lintel at this scale is a
  // bridge a few millimetres long, which prints; the option exists because a
  // doorway you can see all the way through reads better in a cutaway.
  const h = (d.lintel ? Math.min(d.doorH, wallH) : wallH + 1) + 0.1;
  const z = floor - 0.1 + h / 2;
  const at = (thick: number, offset: number): Manifold =>
    m.Manifold.cube(
      dr.horizontal ? [dr.width, thick, h] : [thick, dr.width, h],
      true,
    ).translate(
      dr.horizontal ? [dr.pos, dr.at + offset, z] : [dr.at + offset, dr.pos, z],
    );

  if (!d.doorLeaves) return [at(3 * d.partT, 0)];

  // Hung: a recess instead of a cut through, leaving the leaf standing in the
  // partition. Each recess reaches a hair past its own face so it breaks the
  // surface cleanly, and stops dead in the material at the leaf.
  const recess = (sides: number): Manifold[] => {
    const deep = (d.partT - d.leafT) / sides;
    const cut = deep + 0.2;
    const centre = d.partT / 2 - deep + cut / 2;
    return sides === 2 ? [at(cut, centre), at(cut, -centre)] : [at(cut, centre)];
  };

  // A reveal either side when the partition can spare it. When it cannot --
  // a 5 in partition at 1:144 is 0.88 mm, and half of that split two ways is
  // not a reveal, it is a tool mark -- the whole reveal goes on one face
  // instead. A door you can only see from one side is a compromise; a door
  // nobody can see from either is not a door.
  return recess((d.partT - d.leafT) / 2 >= d.revealMin ? 2 : 1);
}

/**
 * The four stacking pins, on the TOP of storey `level`.
 *
 * Level-dependent because what is standing at the top of a storey is not the
 * same on every floor. A pin has to sit on material, and there are two ways it
 * quietly does not:
 *
 *   - a chamfer takes the bounding corner off the building, so the pin is
 *     pulled back along the side wall to somewhere the wall still exists;
 *   - an open ground floor has no wall at all, only columns, so on that storey
 *     the pins move onto the outermost column instead.
 *
 * Both were found the same way -- four 1.7 mm cylinders floating beside the
 * model, perfectly manifold, attached to nothing.
 */
export function pinPositions(d: Derived, level: number): [number, number][] {
  if (isCorner(d)) {
    // One at every vertex of the L, on the wall centreline: six walls meet in
    // six corners, and every one of them is backed by a corner pier even on an
    // open ground floor.
    const e = d.extT / 2;
    const x = d.W / 2;
    const y = d.D / 2;
    const { ix, iy } = innerCorner(d);
    const all: [number, number][] = [
      [-x + e, -y + e],
      [ix - e, -y + e],
      [ix - e, iy + e],
      [x - e, iy + e],
      [x - e, y - e],
      [-x + e, y - e],
    ];
    // A cutaway leaves only the shelf walls standing.
    return d.openFront
      ? all.filter(([px, py]) => px < -x + d.extT || py > y - d.extT)
      : all;
  }
  const onColumns = level === 0 && d.t.ground === 'pilotis' && d.chamfer > 0;
  // On the wall centreline normally, on the COLUMN centreline where the pin
  // has moved onto one -- a column is thicker than the wall it stands in for,
  // so the two lines are not the same place, and a pin set out from the wall
  // is a pin insideOutline will refuse to place at all.
  const x = onColumns ? d.W / 2 - d.colSize / 2 : d.W / 2 - d.extT / 2;
  let y = d.D / 2 - d.extT / 2 - d.chamfer;

  if (onColumns) {
    const cols = windowCentres(d, d.D).filter((cy) => insideOutline(d, x, cy, d.colSize / 2));
    if (cols.length === 0) return [];
    y = Math.max(...cols.map(Math.abs));
  }

  const all: [number, number][] = [
    [-x, -y],
    [x, -y],
    [-x, y],
    [x, y],
  ];
  // With the front wall gone there is nothing at the front corners to stand a
  // pin on, so the back pair does the locating on its own.
  return d.openFront ? all.filter(([, py]) => py > 0) : all;
}

/**
 * What the TOP of storey `level` offers the piece above it.
 *
 * A tongue needs a continuous wall head to stand on, and an open ground floor
 * has none: the pilotis cut takes the wall out for the whole height of the
 * storey, so a rib run round the wall line up there would be welded to nothing
 * between the columns -- a ring of loose plastic, perfectly manifold. That
 * storey keys with pins instead, which already know how to find a column.
 */
export function jointAt(d: Derived, level: number): Derived['joint'] {
  if (d.joint !== 'tongue') return d.joint;
  const openTop = level === 0 && (d.t.ground === 'pilotis' || d.t.ground === 'frontPilotis');
  // The other place there is nothing to cut a groove into: what sits on the
  // top storey of a pitched-roof building is a wedge, and over the wall line
  // -- a couple of millimetres inside the eave -- there may be less material
  // above the groove than the groove is deep. Four pins near the corners ask
  // far less of it.
  const pitchedAbove =
    level === d.floors - 1 && (d.roof === 'gable' || d.roof === 'hip');
  // With no roof the top storey is the top of the model, and a rib round its
  // wall head would be keying into nothing.
  if (level === d.floors - 1 && d.roof === 'none') return 'none';
  return openTop || pitchedAbove ? 'pins' : 'tongue';
}

/** The tongue's footprint: a ring inside the wall, with a lip left each side. */
function tongueSection(m: ManifoldToplevel, d: Derived, grow = 0): CrossSection {
  const inset = (d.extT - d.tongueW) / 2;
  const ring = footprintSection(m, d, inset - grow).subtract(
    footprintSection(m, d, inset + d.tongueW + grow),
  );
  // A cutaway has no front wall, so it has no front tongue either.
  return d.openFront ? ring.subtract(frontBand(m, d, d.extT)) : ring;
}

/** The rib on the wall head of storey `level`, standing above it. */
export function tongue(m: ManifoldToplevel, d: Derived, zTop: number): Manifold | null {
  const section = tongueSection(m, d);
  if (section.area() <= 0) return null;
  // Rooted into the wall below rather than balanced on its top face -- the
  // same discipline as every other thing standing on something here.
  return m.Manifold.extrude(section, d.tongueH + 0.3).translate([0, 0, zTop - 0.3]);
}

/** The groove in the underside of a slab, to receive the tongue below it. */
export function groove(m: ManifoldToplevel, d: Derived, zBottom: number): Manifold | null {
  const section = tongueSection(m, d, d.pinClear);
  if (section.area() <= 0) return null;
  return m.Manifold.extrude(section, d.grooveD + 0.5).translate([0, 0, zBottom - 0.5]);
}

/**
 * Sockets in the underside of a slab, to receive the pins of the storey below.
 *
 * `levelBelow` is which storey's pins these have to meet -- not this one's.
 * Asking for the wrong storey's positions gives a stack that looks right and
 * will not go together.
 */
export function pinSockets(
  m: ManifoldToplevel,
  d: Derived,
  zBottom: number,
  levelBelow: number,
): Manifold[] {
  const depth = Math.min(d.pinH + 0.2, d.slabT - d.layer);
  if (depth <= 0.2) return [];
  return pinPositions(d, levelBelow).map(([x, y]) =>
    m.Manifold.cylinder(depth + 0.5, d.pinR + d.pinClear, d.pinR + d.pinClear, 24).translate([
      x,
      y,
      zBottom - 0.5,
    ]),
  );
}

export interface StoreyResult {
  readonly solid: Manifold;
  /** True when a stair was actually built into this storey. */
  readonly hasStair: boolean;
}

export function buildStorey(
  m: ManifoldToplevel,
  d: Derived,
  plan: Plan,
  level: number,
): StoreyResult {
  const z0 = d.levelZ[level]!;
  const h = d.levelH[level]!;
  const floor = z0 + d.slabT;
  const wallH = h - d.slabT;
  const facade = storeyFacade(m, d, level);

  // ---------------------------------------------------------------- 1. shell
  const slab = m.Manifold.extrude(footprintSection(m, d), d.slabT).translate([0, 0, z0]);
  const walls = m.Manifold.extrude(shellSection(m, d), wallH).translate([0, 0, floor]);
  let solid = slab.add(walls);

  // The wall finish goes on before anything is cut through the wall, so every
  // opening, band and column after this cuts or covers the texture the same way
  // it would cut or cover a real facade.
  const clad = claddingCutter(m, d, level);
  if (clad) solid = solid.subtract(clad);

  // ----------------------------------------------- 2. the stairwell void
  // Only from the first floor up: the ground slab is the ground, and a hole in
  // it is a hole in the bottom of the model.
  if (plan.core && level > 0) {
    const c = plan.core;
    solid = solid.subtract(
      m.Manifold.cube([c.x1 - c.x0, c.y1 - c.y0, d.slabT + 2], true).translate([
        (c.x0 + c.x1) / 2,
        (c.y0 + c.y1) / 2,
        z0 + d.slabT / 2,
      ]),
    );
  }

  // ------------------------------------------- 3. exterior openings, shell only
  const openings = [...windowCutters(m, d, level), ...facade.shellCut];
  const entrance = level === 0 ? entranceCutter(m, d) : null;
  if (entrance) openings.push(entrance);
  if (level === 0) openings.push(...shopBays(m, d));
  if (openings.length > 0) solid = solid.subtract(m.Manifold.union(openings));


  // ------------------------------------------------------ 5. clip to plan
  // Partitions reach past the rooms they divide to tie into whatever they meet,
  // and on a chamfered plan whatever they meet at a corner is fresh air. One
  // intersection with the footprint settles it for every feature at once.
  if (d.chamfer > 0 || isCorner(d)) {
    solid = solid.intersect(
      m.Manifold.extrude(footprintSection(m, d), h + 2).translate([0, 0, z0 - 1]),
    );
  }

  // ------------------------------------------------------- 6. partitions
  if (wallH > 0 && plan.walls.length > 0) {
    solid = solid.add(
      m.Manifold.union(plan.walls.map((w) => partitionSolid(m, d, w, floor, wallH))),
    );
  }

  // ------------------------------------------------------------ 7. doors
  if (plan.doors.length > 0) {
    solid = solid.subtract(
      m.Manifold.union(plan.doors.flatMap((dr) => doorCutters(m, d, dr, floor, wallH))),
    );
  }

  // ------------------------------------------- 8, 9. the rest of the facade
  if (facade.lateCut.length > 0) solid = solid.subtract(m.Manifold.union(facade.lateCut));
  if (facade.add.length > 0) solid = solid.add(m.Manifold.union(facade.add));
  const trims = [...windowTrims(m, d, level), ...bladeSigns(m, d, z0, h)];
  if (trims.length > 0) solid = solid.add(m.Manifold.union(trims));

  // -------------------------------------------- 9. the stacking joint
  //
  // Last, and the two halves of it in this order, because both are shaping
  // operations on material that has to exist first. The groove in particular
  // has to be cut AFTER the facade: a spandrel band bites half the wall
  // thickness and is unioned on at step 8, which fills the outer half of a
  // groove cut any earlier -- a joint that reads perfectly in the viewport and
  // will not go together in the hand.
  //
  // Which joint is asked of the level BELOW, not of this one: the groove
  // receives that storey's tongue, and on an open ground floor that storey
  // offers pins instead.
  const mine = jointAt(d, level);
  if (mine === 'pins') {
    const pins = pinPositions(d, level).map(([x, y]) =>
      // Rooted a layer INSIDE the wall top rather than balanced on it: a pin
      // that only meets its wall on one plane is a separate body in the STL.
      m.Manifold.cylinder(d.pinH + 2 * d.layer, d.pinR, d.pinR, 24).translate([
        x,
        y,
        z0 + h - 2 * d.layer,
      ]),
    );
    if (pins.length > 0) solid = solid.add(m.Manifold.union(pins));
  } else if (mine === 'tongue') {
    const rib = tongue(m, d, z0 + h);
    if (rib) solid = solid.add(rib);
  }

  const below = level > 0 ? jointAt(d, level - 1) : 'none';
  if (below === 'pins') {
    const sockets = pinSockets(m, d, z0, level - 1);
    if (sockets.length > 0) solid = solid.subtract(m.Manifold.union(sockets));
  } else if (below === 'tongue') {
    const slot = groove(m, d, z0);
    if (slot) solid = solid.subtract(slot);
  }

  // ------------------------------------------------------------ 10. stair
  let hasStair = false;
  // Every storey climbs to the one above it, and the top one climbs to the
  // roof when there is a stair head up there to arrive in.
  if (plan.core && (level < d.floors - 1 || roofAccess(d))) {
    const stair = buildStairs(m, d, plan.core, floor, h, d.levelFt[level]!);
    if (stair) {
      solid = solid.add(stair);
      hasStair = true;
    }
  }

  return { solid: shelfClip(m, d, solid), hasStair };
}
