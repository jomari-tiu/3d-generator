import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type { Derived } from '../geometry';
import {
  bandSection,
  cornerPiers,
  faceLen,
  faceMid,
  faces,
  footprintSection,
  frontFace,
  insideOutline,
  isCorner,
  shelfWalls,
  windowCentres,
} from './shape';

/**
 * Everything on the outside of the wall that is not a window.
 *
 * Balconies, floor bands, spandrels, glazed stripes, open ground floors and
 * their columns, base courses, sign panels, entrance canopies. Which of them
 * exist is decided by the style traits (see styles.ts) and nothing here decides
 * anything -- this file only knows how to build each element.
 *
 * The work comes back in three buckets, because WHEN a piece happens decides
 * whether the building survives it:
 *
 *   shellCut  before partitions exist, so a cut cannot take a partition's tie
 *             into the exterior wall away and leave it standing loose
 *   lateCut   after partitions, for anything that reaches into the interior --
 *             a balcony recess is 6 ft deep and would be filled straight back
 *             in by a partition unioned on afterwards
 *   add       last, for anything standing proud of the wall, so no cutter that
 *             was aimed at the wall behind it can reach it
 */
export interface FacadeWork {
  readonly shellCut: Manifold[];
  readonly lateCut: Manifold[];
  readonly add: Manifold[];
}

/** Outward overshoot for a cutter that has to clear whatever projects. */
export function faceOut(d: Derived): number {
  return 1 + Math.max(0, d.t.bands === 'none' && d.t.ground !== 'course' ? 0 : d.bandProj);
}

const IN = 0.5;

/** A box given as bounds, which is how every element here is actually specified. */
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
 * A strip of plan along the front face, `h` deep from `y0`, for keeping just
 * the front run of something cut right round the building.
 *
 * On a rectangle it overshoots both ends, past any chamfer. On a corner
 * building it starts dead at the courtyard corner: overshoot there and it is
 * the side wing's courtyard wall it picks up.
 */
function frontStrip(m: ManifoldToplevel, d: Derived, y0: number, h: number): CrossSection {
  const f = frontFace(d);
  const x0 = isCorner(d) ? f.c0 : f.c0 - d.chamfer - 2;
  const x1 = f.c1 + d.chamfer + 2;
  return m.CrossSection.square([x1 - x0, h]).translate([x0, y0]);
}

/** A ring standing proud of the wall: a floor band, a spandrel, a base course. */
function bandSolid(m: ManifoldToplevel, d: Derived, z: number, h: number): Manifold {
  return m.Manifold.extrude(bandSection(m, d, d.bandProj), h).translate([0, 0, z]);
}

/**
 * The balcony: a slot recessed into the front, with a solid balustrade standing
 * at the outer edge, flush with the facade. The slab is the balcony floor, so
 * the recess stops at floor level and never touches it.
 */
function balcony(m: ManifoldToplevel, d: Derived, z0: number, h: number, work: FacadeWork): void {
  const floor = z0 + d.slabT;
  const top = z0 + h;
  // Held off the middle of the plan so the recess cannot reach the core and
  // eat the shaft wall the stair needs. It is clamped rather than refused:
  // validate() says what happened, the model stays buildable.
  const deep = Math.min(d.balconyD, balconyLimit(d));
  const f = frontFace(d);
  const x0 = f.c0 + d.extT;
  const x1 = x0 + d.balconyW;

  work.lateCut.push(box(m, x0, x1, f.at - faceOut(d), f.at + deep, floor, top + 0.1));

  // Wider than the recess at each end, and reaching down into the slab: a
  // balustrade that merely meets the recess it stands in is a loose shell.
  work.add.push(
    box(
      m,
      x0 - d.tie,
      x1 + d.tie,
      f.at,
      f.at + d.railT,
      floor - 0.2,
      Math.min(floor + d.railH, top),
    ),
  );
}

/**
 * How deep a balcony may be recessed: 40% of the depth of whatever it is cut
 * into, so it cannot reach the stair core -- the whole building, or one wing.
 */
export function balconyLimit(d: Derived): number {
  return (isCorner(d) ? d.wing : d.D) * 0.4;
}

/** Glazed slots running the full height of a storey, up the front. */
function stripes(m: ManifoldToplevel, d: Derived, z0: number, h: number, work: FacadeWork): void {
  const f = frontFace(d);
  const avail = faceLen(f) - 2 * d.pier;
  const n = d.stripeCount;
  const w = Math.min(d.stripeW, avail / n - d.pier);
  if (w <= d.minWall) return;
  // A stripe IS glazing, so it closes with the windows: cut to the pane rather
  // than through, and the slot reads as glass instead of a slot.
  const back = f.at + (d.glazing ? d.extT - d.paneT : d.extT + IN);
  for (let k = 0; k < n; k++) {
    const cx = faceMid(f) - avail / 2 + (avail * (k + 0.5)) / n;
    work.shellCut.push(
      box(m, cx - w / 2, cx + w / 2, f.at - faceOut(d), back, z0 + d.slabT, z0 + h + 0.1),
    );
  }
}

/**
 * The glazed shopfront behind the columns.
 *
 * Structure as much as elevation. A column under an open ground floor is a
 * cantilever off the slab -- at 1:144 a 2.8 mm post 28 mm tall, which is ten to
 * one, and the whole model stands on eighteen of them. A wall set back behind
 * the line ties them into a braced frame: the same plastic that makes it look
 * like a shop makes it survive being picked up.
 *
 * Set BACK by most of a column width rather than run between the columns: the
 * columns have to stand clear in front of it or the two read as one thick wall
 * and the ground floor is no longer open.
 */
function shopfront(
  m: ManifoldToplevel,
  d: Derived,
  floor: number,
  top: number,
  frontOnly: boolean,
): Manifold[] {
  const set = d.shopSet;
  const f = frontFace(d);
  let ring = footprintSection(m, d, set).subtract(footprintSection(m, d, set + d.shopT));
  // Nothing behind a shelf wall: it is solid, and a second wall inside it is
  // a partition across the rooms that no plan asked for.
  if (isCorner(d)) ring = ring.subtract(shelfWalls(m, d, set + d.shopT + 1));
  if (frontOnly) {
    // Just the front run of the ring, with half a millimetre of slack each
    // side so the intersection cannot leave a hairline of wall behind.
    const band = set + d.shopT + 1;
    ring = ring.intersect(frontStrip(m, d, f.at - 0.5, band));
  }
  if (ring.area() <= 0) return [];
  // Rooted into the slab below, stopping flush with the top of the storey --
  // the same discipline as the columns beside it.
  const wall = m.Manifold.extrude(ring, top - floor + 0.2).translate([0, 0, floor - 0.2]);

  // The way in. The entrance was cut through an exterior wall that the pilotis
  // opening has already taken away, so without this the door is behind glass.
  if (!d.entrance || d.openFront) return [wall];
  const head = Math.min(floor + d.entranceH, top - Math.max(d.minWall, d.perFt * 0.5));
  if (head - floor < d.minWall) return [wall];
  const doorway = box(
    m,
    faceMid(f) - d.entranceW / 2,
    faceMid(f) + d.entranceW / 2,
    f.at - 1,
    f.at + set + d.shopT + 1,
    floor - 0.3,
    head,
  );
  return [wall.subtract(doorway)];
}

/**
 * An open ground floor on columns.
 *
 * The wall is taken out in a band and columns put back on the WINDOW rhythm, so
 * the structure below lines up with the structure above -- which is both what a
 * real frame does and the thing the eye checks first.
 */
function pilotis(
  m: ManifoldToplevel,
  d: Derived,
  z0: number,
  h: number,
  frontOnly: boolean,
  work: FacadeWork,
): void {
  const floor = z0 + d.slabT;
  const top = z0 + h;
  const out = faceOut(d);

  let open = footprintSection(m, d, -out)
    .subtract(footprintSection(m, d, d.extT + IN))
    .subtract(cornerPiers(m, d));
  const f = frontFace(d);
  if (frontOnly) open = open.intersect(frontStrip(m, d, f.at - out, d.extT + IN + out));
  if (open.area() <= 0) return;
  work.shellCut.push(m.Manifold.extrude(open, top - floor + 0.1).translate([0, 0, floor]));

  if (d.shopfront) work.add.push(...shopfront(m, d, floor, top, frontOnly));

  const post = (cx: number, cy: number) => {
    // A column outside the outline has no slab under it and no beam over it.
    // On a chamfered plan the bays nearest each corner are exactly that -- the
    // corner they were set out from is not on the building any more -- and the
    // result is a handful of loose sticks standing in mid-air beside it.
    if (!insideOutline(d, cx, cy, d.colSize / 2)) return;
    work.add.push(
      box(
        m,
        cx - d.colSize / 2,
        cx + d.colSize / 2,
        cy - d.colSize / 2,
        cy + d.colSize / 2,
        floor - 0.2,
        top,
      ),
    );
  };

  // Set out from the column's own face, not from the wall's centreline. A
  // column is thicker than the wall it replaces -- colSize is at least 1 ft 3
  // -- so one centred on the wall hangs half its width outside the building,
  // and insideOutline then, correctly, refuses to build it. Every column on
  // every face failed that test: the open ground floor came out as a bare slab
  // with the floors above it standing on nothing.
  const inset = d.colSize / 2;
  for (const face of faces(d)) {
    if (face.blank || (frontOnly && !face.front)) continue;
    const line = face.at - face.side * inset;
    for (const c of windowCentres(d, faceLen(face))) {
      if (face.alongX) post(faceMid(face) + c, line);
      else post(line, faceMid(face) + c);
    }
  }
  if (!frontOnly) {
    // A chamfer eats the corner piers that would otherwise have held the corner
    // up, so the chamfer face gets a column of its own -- which is what the
    // buildings this is modelled on actually do. Set back along the diagonal
    // by the same margin insideOutline measures, or the one column the corner
    // actually needs is the one that gets refused.
    if (d.chamfer > 0) {
      const back = d.chamfer / 2 + (inset * Math.SQRT2) / 2 + d.minWall;
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          post(sx * (d.W / 2 - back), sy * (d.D / 2 - back));
        }
      }
    }
  }
}

/** Where the billboard sits on the front, and how wide its border is. */
interface Board {
  readonly x0: number;
  readonly x1: number;
  /** Width of the raised border, already clamped to the board it goes round. */
  readonly frame: number;
}

/**
 * The billboard's extent across the front.
 *
 * Set out from the end of the FRONT FACE, not from the bounding corner. On a
 * chamfered plan those are not the same place: the corner the panel used to
 * start at is not on the building any more, so a board set out from it hung
 * out over the chamfer void -- a slab of plastic floating beside the wall,
 * perfectly manifold and attached to nothing.
 */
function signBoard(d: Derived): Board | null {
  // Both ends, not just the near one: a deep chamfer on a narrow building
  // leaves a front face a few feet wide, and a board clamped only at the left
  // runs straight off the right-hand chamfer instead.
  const edge = Math.max(d.pier, d.chamfer + d.minWall);
  const f = frontFace(d);
  const x0 = f.c0 + edge;
  const w = Math.min(d.signW, faceLen(f) - 2 * edge);
  // Four border widths is the floor: below it the frame has eaten the face it
  // was supposed to be framing, and the board reads as a solid lump.
  const frame = Math.min(d.signFrame, w / 5);
  if (w <= 4 * frame || frame < d.minWall) return null;
  return { x0, x1: x0 + w, frame };
}

/**
 * A blank billboard in a raised frame, up one end of the front.
 *
 * Built one storey at a time, because a storey is what prints: a board spanning
 * four floors as a single solid could not be split with them. The two stiles
 * run the full height of every segment, so stacked storeys butt into one
 * continuous frame, and the rails close it only where the run actually ends.
 *
 * The face is left BLANK on purpose. Anything modelled on it -- lettering, a
 * poster, a logo -- is a quarter of a millimetre of relief at 1:144, which is
 * mush off the printer and the wrong thing to commit to anyway: a blank board
 * takes a decal, a paper print or paint, and a modelled one takes nothing.
 */
function sign(
  m: ManifoldToplevel,
  d: Derived,
  level: number,
  z0: number,
  h: number,
  work: FacadeWork,
): void {
  const b = signBoard(d);
  if (!b) return;
  const f = Math.min(b.frame, h * 0.3);

  // The blank face has to stand clear of the spandrel band, or the band runs
  // straight across the billboard at every floor line; the frame then has to
  // stand clear of the face, or there is no frame, only a thicker panel.
  const face = Math.max(d.bandProj + d.minWall * 0.5, d.signProj * 0.5);
  const proj = Math.max(d.signProj, face + Math.max(d.minWall * 0.75, d.perFt * 0.4));
  // Through the wall, not onto it. The ribbon window runs behind the board for
  // most of its height, so a panel that merely bit into the face would be
  // hanging off the two spandrels it happened to cross. Filling the opening
  // also makes the bay read blind, which is what a wall behind a hoarding is.
  const front = frontFace(d).at;
  const back = front + d.extT;

  // Where the run ends. A tall building carries two boards -- a big one over
  // the middle floors and a smaller one above it -- which is what a corner
  // site with two lettings actually looks like.
  const railBottom = level === 1;
  const railTop = level === d.floors - 1 || (d.floors >= 4 && level === d.floors - 2);

  work.add.push(
    // Stiles, full storey height, so segment meets segment with no seam.
    box(m, b.x0, b.x0 + f, front - proj, back, z0, z0 + h),
    box(m, b.x1 - f, b.x1, front - proj, back, z0, z0 + h),
    box(
      m,
      b.x0 + f,
      b.x1 - f,
      front - face,
      back,
      railBottom ? z0 + f : z0,
      railTop ? z0 + h - f : z0 + h,
    ),
  );
  if (railBottom) work.add.push(box(m, b.x0, b.x1, front - proj, back, z0, z0 + f));
  if (railTop) work.add.push(box(m, b.x0, b.x1, front - proj, back, z0 + h - f, z0 + h));
}

/**
 * A flat canopy over the entrance, on two posts, standing on its own apron.
 *
 * The apron is not decoration. The posts land outside the building footprint,
 * where there is no slab under them, and a post standing on nothing is a
 * separate body that prints as two loose sticks and a floating slab.
 */
function canopy(m: ManifoldToplevel, d: Derived, work: FacadeWork): void {
  const z0 = d.levelZ[0]!;
  const floor = z0 + d.slabT;
  const f = frontFace(d);
  const w = Math.min(d.canopyW, faceLen(f) - 2 * d.pier);
  const deep = d.canopyD;
  if (w <= d.minWall || deep <= d.minWall) return;

  const mid = faceMid(f);
  const yOuter = f.at - deep;
  const zTop = Math.min(floor + d.entranceH + d.perFt, z0 + d.levelH[0]! - d.canopyT);

  work.add.push(
    // Apron, overlapping the building slab so the two are one body.
    box(m, mid - w / 2, mid + w / 2, yOuter, f.at + d.extT, z0, z0 + d.slabT),
    // The canopy itself, biting into the wall.
    box(m, mid - w / 2, mid + w / 2, yOuter, f.at + d.extT * 0.5, zTop, zTop + d.canopyT),
  );

  const post = d.colSize * 0.7;
  for (const sx of [-1, 1]) {
    const cx = mid + sx * (w / 2 - post);
    work.add.push(
      box(
        m,
        cx - post / 2,
        cx + post / 2,
        yOuter + post * 0.2,
        yOuter + post * 1.2,
        z0 + d.slabT - 0.2,
        zTop + d.canopyT * 0.5,
      ),
    );
  }
}

/** Everything this style puts on the outside of one storey. */
export function storeyFacade(m: ManifoldToplevel, d: Derived, level: number): FacadeWork {
  const work: FacadeWork = { shellCut: [], lateCut: [], add: [] };
  const z0 = d.levelZ[level]!;
  const h = d.levelH[level]!;
  const ground = level === 0;
  const t = d.t;

  if (t.bands !== 'none' && !(ground && t.ground === 'course')) {
    work.add.push(bandSolid(m, d, z0, Math.min(d.bandH, h)));
  }
  if (ground && t.ground === 'course') work.add.push(bandSolid(m, d, z0, h));

  // Everything below is on the front face, so a cutaway has nothing to put it
  // on. Skipping it is the honest answer: a balustrade in mid-air is not.
  if (!d.openFront) {
    if (t.balconies && !ground) balcony(m, d, z0, h, work);
    if (t.stripes && !ground) stripes(m, d, z0, h, work);
    if (t.sign && !ground) sign(m, d, level, z0, h, work);
    if (t.canopy && ground) canopy(m, d, work);
  }
  // A cutaway has already taken the front wall off, so a front-only open ground
  // floor has nothing left to open.
  if (ground && t.ground === 'pilotis') pilotis(m, d, z0, h, false, work);
  if (ground && t.ground === 'frontPilotis' && !d.openFront) pilotis(m, d, z0, h, true, work);

  return work;
}
