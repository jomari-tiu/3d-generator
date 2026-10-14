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

/**
 * Where the glazed stripes run across the front, as [x0, x1] pairs, or none.
 *
 * One answer for the stripes and for the windows: a punched window cut into
 * the same stretch of wall as a stripe leaves a stepped notch in the glass, so
 * the windows ask this and keep out of it -- see windowCutters in storey.ts.
 */
export function stripeSpans(d: Derived): [number, number][] {
  if (!d.t.stripes || d.openFront) return [];
  const f = frontFace(d);
  const avail = faceLen(f) - 2 * d.pier;
  const n = d.stripeCount;
  const w = Math.min(d.stripeW, avail / n - d.pier);
  if (w <= d.minWall) return [];
  return Array.from({ length: n }, (_, k) => {
    const cx = faceMid(f) - avail / 2 + (avail * (k + 0.5)) / n;
    return [cx - w / 2, cx + w / 2] as [number, number];
  });
}

/**
 * A strip of curtain wall running up the front, storey by storey.
 *
 * Curtain walling is a frame holding glass, so that is what it is cut as: the
 * glass is ALWAYS there -- a pane of wall left at the back of the opening,
 * whatever the window glazing is set to, because a curtain wall without its
 * glass is a hole down the front of the building showing every floor and
 * partition behind it -- and the frame is a grid of mullions and a transom
 * left standing in front of it. The slab edge at the foot of each storey runs
 * across it as the floor line, the way a real one reads.
 */
function stripes(m: ManifoldToplevel, d: Derived, z0: number, h: number, work: FacadeWork): void {
  const spans = stripeSpans(d);
  if (spans.length === 0) return;
  const f = frontFace(d);
  // To the pane where the wall can spare one; through, only where it cannot.
  const glass = d.extT - d.paneT >= d.revealMin && d.paneT >= d.nozzle;
  const back = f.at + (glass ? d.extT - d.paneT : d.extT + IN);
  const front = f.at - faceOut(d);
  const z1 = z0 + d.slabT;
  const z2 = z0 + h + 0.1;
  const bar = Math.max(d.minWall, d.perFt * 0.5);
  for (const [x0, x1] of spans) {
    let cut = box(m, x0, x1, front, back, z1, z2);
    // Mullions every 4 ft or so, evenly; a transom at the window head.
    const w = x1 - x0;
    const n = Math.max(1, Math.round(w / (d.perFt * 4)));
    const bars: Manifold[] = [];
    if (w / n >= 3 * bar) {
      for (let i = 1; i < n; i++) {
        const x = x0 + (i * w) / n;
        bars.push(box(m, x - bar / 2, x + bar / 2, front - 1, back + 1, z1 - 0.1, z2 + 0.1));
      }
    }
    const t = Math.min(z1 + d.sill + d.winH, z0 + h - d.perFt * 1.5);
    if (t - z1 >= 3 * bar) bars.push(box(m, x0 - 0.1, x1 + 0.1, front - 1, back + 1, t - bar / 2, t + bar / 2));
    if (bars.length > 0) cut = cut.subtract(m.Manifold.union(bars));
    work.shellCut.push(cut);
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

/** Where the screen sits across its face, and how wide its border is. */
export interface Board {
  readonly x0: number;
  readonly x1: number;
  /** Width of the raised border, already clamped to the board it goes round. */
  readonly frame: number;
}

/**
 * The screen's extent across the front.
 *
 * On the facade it is set out from the end of the FRONT FACE, not from the
 * bounding corner. On a chamfered plan those are not the same place: the corner
 * the panel used to start at is not on the building any more, so a board set
 * out from it hung out over the chamfer void -- a slab of plastic floating
 * beside the wall, perfectly manifold and attached to nothing. On the roof it
 * is centred over the front, which is where a rooftop screen is put to be seen.
 */
export function signBoard(d: Derived): Board | null {
  // Both ends, not just the near one: a deep chamfer on a narrow building
  // leaves a front face a few feet wide, and a board clamped only at the left
  // runs straight off the right-hand chamfer instead.
  const edge = Math.max(d.pier, d.chamfer + d.minWall);
  const f = frontFace(d);
  const w = Math.min(d.signW, faceLen(f) - 2 * edge);
  const x0 = d.signPlace === 'roof' ? faceMid(f) - w / 2 : f.c0 + edge;
  // Four border widths is the floor: below it the border has eaten the face it
  // was supposed to be framing, and the board reads as a solid lump.
  const frame = Math.min(
    d.signStyle === 'framed' ? d.signFrame : Math.max(d.minWall, d.perFt * 0.35),
    w / 5,
    d.signH / 5,
  );
  if (w <= 4 * frame || frame < d.minWall) return null;
  return { x0, x1: x0 + w, frame };
}

/**
 * The screen as one solid, whatever its style: a slab from `yFront` (its face,
 * toward -Y) back to `yBack`, between `z0` and `z1`, with its face worked.
 *
 *   framed  a raised border round a recessed blank face -- the billboard
 *   slim    a thin bezel round a face set a hair back -- a modern LED screen
 *   tiled   the slim screen with its face cut into a grid of LED tiles
 *
 * The face is otherwise left BLANK on purpose. Anything modelled on it --
 * lettering, a poster, a logo -- is a quarter of a millimetre of relief at
 * 1:144, which is mush off the printer and the wrong thing to commit to anyway:
 * a blank board takes a decal, a paper print or paint, and a modelled one
 * takes nothing.
 */
export function screenSolid(
  m: ManifoldToplevel,
  d: Derived,
  b: Board,
  yFront: number,
  yBack: number,
  z0: number,
  z1: number,
  recess: number,
): Manifold {
  const f = b.frame;
  const slab = box(m, b.x0, b.x1, yFront, yBack, z0, z1);
  const face = box(m, b.x0 + f, b.x1 - f, yFront - 1, yFront + recess, z0 + f, z1 - f);
  let solid = slab.subtract(face);
  if (d.signStyle !== 'tiled') return solid;

  // LED tiles: joints a nozzle wide up the face and two layers tall across it,
  // on as close to a 3 ft tile as divides the face evenly.
  const w = b.x1 - b.x0 - 2 * f;
  const h = z1 - z0 - 2 * f;
  const tile = Math.max(d.perFt * 3, 4 * d.nozzle);
  const nx = Math.max(1, Math.round(w / tile));
  const nz = Math.max(1, Math.round(h / tile));
  const deep = yFront + recess + Math.max(2 * d.layer, 0.3);
  const joints: Manifold[] = [];
  for (let i = 1; i < nx; i++) {
    const x = b.x0 + f + (i * w) / nx;
    joints.push(box(m, x - d.nozzle / 2, x + d.nozzle / 2, yFront - 1, deep, z0 + f, z1 - f));
  }
  for (let k = 1; k < nz; k++) {
    const z = z0 + f + (k * h) / nz;
    joints.push(box(m, b.x0 + f, b.x1 - f, yFront - 1, deep, z - d.layer, z + d.layer));
  }
  if (joints.length > 0) solid = solid.subtract(m.Manifold.union(joints));
  return solid;
}

/** How far back the screen's face sits behind its border, by style. */
export function screenRecess(d: Derived, depth: number): number {
  return d.signStyle === 'framed'
    ? Math.min(Math.max(d.minWall * 0.75, d.perFt * 0.4), depth * 0.5)
    : Math.min(Math.max(2 * d.layer, 0.3), depth * 0.3);
}

/**
 * The screen up the front, from the first floor, `signH` tall and stopping at
 * the roof -- the piece of it on storey `level`.
 *
 * Built whole, then cut storey by storey, because a storey is what prints: the
 * border closes under the screen's first storey and over its last wherever
 * those happen to fall, and segment meets segment with no seam when the
 * storeys are stacked.
 */
function sign(
  m: ManifoldToplevel,
  d: Derived,
  z0: number,
  h: number,
  work: FacadeWork,
): void {
  if (d.signPlace !== 'facade' || d.floors < 2) return;
  const b = signBoard(d);
  if (!b) return;
  const zs = d.levelZ[1]!;
  const ze = Math.min(zs + d.signH, d.roofZ);
  const s0 = Math.max(z0, zs);
  const s1 = Math.min(z0 + h, ze);
  if (s1 - s0 < 1e-3) return;

  // The face has to stand clear of the spandrel band, or the band runs
  // straight across the screen at every floor line; the border then has to
  // stand clear of the face, or there is no border, only a thicker panel.
  const faceProj = Math.max(d.bandProj + d.minWall * 0.5, d.signProj * 0.5);
  const proj = Math.max(d.signProj, faceProj + Math.max(d.minWall * 0.75, d.perFt * 0.4));
  // Through the wall, not onto it. The ribbon window runs behind the screen for
  // most of its height, so a panel that merely bit into the face would be
  // hanging off the two spandrels it happened to cross. Filling the opening
  // also makes the bay read blind, which is what a wall behind a hoarding is.
  const front = frontFace(d).at;
  const recess = Math.min(screenRecess(d, proj), proj - faceProj);
  const whole = screenSolid(m, d, b, front - proj, front + d.extT, zs, ze, recess);
  const piece = whole.intersect(box(m, b.x0 - 1, b.x1 + 1, front - proj - 1, front + d.extT + 1, s0, s1));
  if (!piece.isEmpty()) work.add.push(piece);
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

/**
 * The shop canopy: the edge of the first-floor slab running out over the
 * ground floor, all round the faces you can see.
 *
 * Part of the storey it is the floor of, so it is at the BOTTOM of the printed
 * piece: every storey prints slab-down, which puts a canopy of any depth flat
 * on the bed. It bites half the wall thickness, the same as a band, so it is
 * welded on rather than balanced against the facade.
 */
function awning(m: ManifoldToplevel, d: Derived, z0: number): Manifold | null {
  const ring = footprintSection(m, d, -d.awningD).subtract(footprintSection(m, d, d.extT * 0.5));
  if (ring.area() <= 0) return null;
  return m.Manifold.extrude(ring, d.slabT).translate([0, 0, z0]);
}

/**
 * The shop sign board: a raised board across the front between the heads of
 * the shop bays and the first floor, with a recessed blank face for the name.
 *
 * It needs a ground floor tall enough to have the room: under about a foot and
 * a half between the shop heads and the slab above, there is no board to put.
 */
function fascia(m: ManifoldToplevel, d: Derived, z0: number, h: number, work: FacadeWork): void {
  if (d.openFront) return;
  const f = frontFace(d);
  const floor = z0 + d.slabT;
  const shopTop = Math.min(floor + d.entranceH, z0 + h - Math.max(d.minWall, d.perFt * 0.5));
  const zA = shopTop + Math.max(d.perFt * 0.3, d.minWall);
  const zB = Math.min(z0 + h, zA + d.perFt * 2.5);
  if (zB - zA < d.perFt * 1.2) return;
  const proud = Math.max(d.minWall, d.perFt * 0.35);
  const x0 = f.c0 + d.pier;
  const x1 = f.c1 - d.pier;
  if (x1 - x0 < d.perFt * 4) return;
  const rim = Math.max(d.minWall, (zB - zA) * 0.15);
  const board = box(m, x0, x1, f.at - proud, f.at + d.extT * 0.5, zA, zB);
  const face = box(m, x0 + rim, x1 - rim, f.at - proud - 1, f.at - proud * 0.45, zA + rim, zB - rim);
  work.add.push(board.subtract(face));
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

  // Over the shop bays, so on the first floor: the canopy is its slab edge.
  if (t.fascia && ground && t.ground === 'shop') fascia(m, d, z0, h, work);
  if (t.awning && level === 1) {
    const plate = awning(m, d, z0);
    if (plate) work.add.push(plate);
  }

  // Everything below is on the front face, so a cutaway has nothing to put it
  // on. Skipping it is the honest answer: a balustrade in mid-air is not.
  if (!d.openFront) {
    if (t.balconies && !ground) balcony(m, d, z0, h, work);
    if (t.stripes && !ground) stripes(m, d, z0, h, work);
    if (t.sign && !ground) sign(m, d, z0, h, work);
    if (t.canopy && ground) canopy(m, d, work);
  }
  // A cutaway has already taken the front wall off, so a front-only open ground
  // floor has nothing left to open.
  if (ground && t.ground === 'pilotis') pilotis(m, d, z0, h, false, work);
  if (ground && t.ground === 'frontPilotis' && !d.openFront) pilotis(m, d, z0, h, true, work);

  return work;
}
