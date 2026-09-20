import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { roundedRect, taperedExtrude } from '../../../core/kernel/primitives';
import { moduleFoot } from '../dock';
import { bodyD, bodyW, type Bay, type Derived } from '../geometry';

/**
 * The modules that are not the phone stand: a pen cup, an open tray, a shallow
 * pen tray and a card rack.
 *
 * All four are the same object with different insides -- a rounded box, the
 * full depth of the plate, with a dovetail foot under it and a chamfer round
 * the bottom that matches the plate's. That sameness IS the design: what makes
 * a set of parts look like a set is that the radius, the chamfer and the wall
 * are the same number everywhere, not that they are shaped alike.
 *
 * All print open-side-up with no support.
 */

/**
 * Points evenly round a rounded rectangle, with the outward normal at each.
 *
 * Walked as the four straights and four quarter-arcs it actually is, and the
 * step is the perimeter divided by a WHOLE number of flutes -- so they close
 * on themselves instead of leaving one odd wide gap where the walk started.
 */
function roundRectWalk(
  w: number,
  dp: number,
  r: number,
  pitch: number,
): { x: number; y: number; nx: number; ny: number }[] {
  const a = Math.max(0, w / 2 - r);
  const b = Math.max(0, dp / 2 - r);
  const per = 4 * a + 4 * b + 2 * Math.PI * r;
  const n = Math.max(8, Math.round(per / pitch));
  const step = per / n;
  const out: { x: number; y: number; nx: number; ny: number }[] = [];
  for (let i = 0; i < n; i++) {
    let s = i * step;
    // Right side up, top-right arc, top side, ... anticlockwise from (a+r, -b).
    const runs = [2 * b, (Math.PI * r) / 2, 2 * a, (Math.PI * r) / 2, 2 * b, (Math.PI * r) / 2, 2 * a, (Math.PI * r) / 2];
    let k = 0;
    while (k < runs.length && s > runs[k]!) { s -= runs[k]!; k++; }
    const t = s;
    const corner: [number, number][] = [[a, b], [-a, b], [-a, -b], [a, -b]];
    if (k % 2 === 0) {
      const side = k / 2;
      const [sx, sy] = [
        [a + r, -b + t] as [number, number],
        [a - t, b + r] as [number, number],
        [-a - r, b - t] as [number, number],
        [-a + t, -b - r] as [number, number],
      ][side]!;
      const nrm = [[1, 0], [0, 1], [-1, 0], [0, -1]][side]!;
      out.push({ x: sx, y: sy, nx: nrm[0]!, ny: nrm[1]! });
    } else {
      const arc = (k - 1) / 2;
      const [cx, cy] = corner[arc]!;
      const a0 = (-Math.PI / 2 + (Math.PI / 2) * arc) + t / Math.max(r, 1e-6);
      out.push({ x: cx + r * Math.cos(a0), y: cy + r * Math.sin(a0), nx: Math.cos(a0), ny: Math.sin(a0) });
    }
  }
  return out;
}

/**
 * Fine vertical grooves right round the outside, as one solid to subtract.
 *
 * A row of circles centred just OUTSIDE the outline, each standing off by its
 * own radius less the depth so it bites exactly that far in, extruded up the
 * side. Worked in 2D and extruded rather than cut as 3D rods: the section is
 * the same at every height, so one boolean does the whole wall.
 *
 * It starts above the bottom chamfer. Run down through it, the flutes would
 * turn the one face that has to meet the plate cleanly into a row of scallops.
 */
export function flutes(
  m: ManifoldToplevel,
  d: Derived,
  box: { cx: number; cy: number; cz: number; w: number; dp: number; h: number },
): Manifold | null {
  if (!d.fluted || d.fluteD <= 0.05) return null;
  const { w, dp, h } = box;
  const c = Math.min(d.chamfer, h / 3);
  const r = Math.max(0.5, d.corner);
  const top = h - c;
  if (top <= 0.5) return null;

  const fr = Math.max(d.fluteW / 2, d.fluteD + 0.2);
  const stand = fr - d.fluteD;
  const cs = m.CrossSection.union(
    roundRectWalk(w, dp, r, d.fluteW).map((p) =>
      m.CrossSection.circle(fr, 24).translate([p.x + p.nx * stand, p.y + p.ny * stand]),
    ),
  );
  return m.Manifold.extrude(cs, top + 1).translate([box.cx, box.cy, box.cz + c]);
}

/** The shared outer shell: a rounded, bottom-chamfered box on a dovetail foot. */
function shell(m: ManifoldToplevel, d: Derived, bay: Bay, h: number): Manifold {
  const w = bodyW(bay) - 2 * d.clear;
  const dp = bodyD(d, bay) - 2 * d.clear;
  const c = Math.min(d.chamfer, h / 3);
  const r = Math.max(0.5, d.corner);

  const full = roundedRect(m, w, dp, r);
  const small = roundedRect(m, w - 2 * c, dp - 2 * c, Math.max(0.5, r - c));
  const lower = taperedExtrude(m, small, c, w / (w - 2 * c), dp / (dp - 2 * c));
  const upper = m.Manifold.extrude(full, h - c).translate([0, 0, c]);

  const body = lower.add(upper).translate([bay.cx, 0, bay.cz]);
  const fl = flutes(m, d, { cx: bay.cx, cy: 0, cz: bay.cz, w, dp, h });
  return (fl ? body.subtract(fl) : body).add(moduleFoot(m, d, bay));
}

/** Hollow it out, leaving `wall` all round and a floor. */
function hollow(m: ManifoldToplevel, d: Derived, bay: Bay, h: number, floor: number): Manifold {
  const w = bodyW(bay) - 2 * d.clear - 2 * d.wall;
  const dp = bodyD(d, bay) - 2 * d.clear - 2 * d.wall;
  return m.Manifold.extrude(
    roundedRect(m, w, dp, Math.max(0.5, d.corner - d.wall)),
    h,
  ).translate([bay.cx, 0, bay.cz + floor]);
}

/**
 * Pen cup. Deliberately a rounded rectangle rather than a cylinder: round it
 * would leave a crescent of dead plate either side, and the whole layout is
 * built on modules being exactly as wide as they need to be.
 */
export function buildCup(m: ManifoldToplevel, d: Derived, bay: Bay): Manifold {
  return shell(m, d, bay, d.cupH).subtract(hollow(m, d, bay, d.cupH, d.wall));
}

/**
 * Partitions dropped into a tray on a grid.
 *
 * Short of the rim, so the tray still sweeps out in one go: a partition as
 * tall as the wall does not divide a tray, it replaces it with several deep
 * slots you have to fish in. Biting a little into the floor and into both side
 * walls as well, because a partition that merely touches them shares a face
 * with no volume behind it and prints as a loose fin.
 *
 * Shared with the front tray, which is a different part in a different file
 * and wants exactly the same thing.
 */
export function partitions(
  m: ManifoldToplevel,
  d: Derived,
  at: { cx: number; cy: number; floor: number; w: number; dp: number; h: number },
  nx: number,
  ny: number,
): Manifold | null {
  const t = d.wall;
  // A compartment narrower than a thumb is not a compartment. Stop dividing
  // rather than hand back a comb, the same bargain the pen tray's lanes make.
  const cols = (at.w - nx * t) / (nx + 1);
  const rows = (at.dp - ny * t) / (ny + 1);
  const useX = nx > 0 && cols >= 10 ? nx : 0;
  const useY = ny > 0 && rows >= 10 ? ny : 0;
  if (useX < 1 && useY < 1) return null;

  const top = Math.max(t, (at.h - t) * 0.72);
  const bite = 0.2;
  const z = at.floor + top / 2 - bite / 2;
  const walls: Manifold[] = [];

  for (let i = 1; i <= useX; i++) {
    walls.push(
      m.Manifold.cube([t, at.dp + t, top + bite], true).translate([
        at.cx - at.w / 2 + (at.w * i) / (useX + 1),
        at.cy,
        z,
      ]),
    );
  }
  for (let j = 1; j <= useY; j++) {
    walls.push(
      m.Manifold.cube([at.w + t, t, top + bite], true).translate([
        at.cx,
        at.cy - at.dp / 2 + (at.dp * j) / (useY + 1),
        z,
      ]),
    );
  }
  return walls.length > 0 ? m.Manifold.union(walls) : null;
}

/** Open tray for clips, keys, the things with no other home. */
export function buildTray(m: ManifoldToplevel, d: Derived, bay: Bay): Manifold {
  const body = shell(m, d, bay, d.trayH).subtract(hollow(m, d, bay, d.trayH, d.wall));
  const p = partitions(
    m,
    d,
    {
      cx: bay.cx,
      cy: 0,
      floor: bay.cz + d.wall,
      w: bodyW(bay) - 2 * d.clear - 2 * d.wall,
      dp: bodyD(d, bay) - 2 * d.clear - 2 * d.wall,
      h: d.trayH,
    },
    d.trayDivX,
    d.trayDivY,
  );
  return p ? body.add(p) : body;
}

/**
 * Shallow pen tray. Not a shorter open tray -- the difference is which way the
 * pen goes. You drop things INTO a tray; a pen LIES ACROSS this one, so the
 * width is set by pen length and the walls are low enough to roll one up and
 * off the rim rather than reach down after it.
 *
 * Lanes are ribs running the full width, stacking front to back, so pens sit in
 * rows instead of rolling into one heap against the front wall.
 */
export function buildPenTray(m: ManifoldToplevel, d: Derived, bay: Bay): Manifold {
  const body = shell(m, d, bay, d.penH).subtract(hollow(m, d, bay, d.penH, d.wall));
  const n = Math.max(1, d.penLanes);
  if (n < 2) return body;

  const w = bodyW(bay) - 2 * d.clear - 2 * d.wall;
  const dp = bodyD(d, bay) - 2 * d.clear - 2 * d.wall;
  // n lanes need n-1 ribs between them. A lane narrower than a fat marker is
  // not a lane, so stop dividing rather than hand back a comb.
  const laneD = (dp - (n - 1) * d.wall) / n;
  if (laneD < 12) return body;

  // Short of the rim, so the whole tray still sweeps out in one go. Ribs as
  // tall as the wall would turn the rows into slots you have to fish in.
  const top = Math.max(d.wall, (d.penH - d.wall) * 0.55);
  // Biting 0.2 below the floor and into both side walls: flush, the union has
  // no volume to work with and Manifold hands back bodies that merely touch.
  const bite = 0.2;

  const ribs: Manifold[] = [];
  for (let i = 1; i < n; i++) {
    const y = -dp / 2 + i * laneD + (i - 0.5) * d.wall;
    ribs.push(
      m.Manifold.cube([w + d.wall, d.wall, top + bite], true).translate([
        bay.cx,
        y,
        bay.cz + d.wall + top / 2 - bite / 2,
      ]),
    );
  }
  return body.add(m.Manifold.union(ribs));
}

/**
 * Card rack: slots across the depth, for cards, notes and a phone on its side.
 *
 * Cut right through the top rather than into a pocket, so each slot is open at
 * both ends and a card can be pushed out from underneath rather than fished at
 * with a fingernail.
 */
export function buildCards(m: ManifoldToplevel, d: Derived, bay: Bay): Manifold {
  const body = shell(m, d, bay, d.cardsH);
  const n = Math.max(1, d.cardSlots);
  const w = bodyW(bay) - 2 * d.clear;

  // Slots and the walls between them share the width: n slots need n+1 walls.
  const wallN = n + 1;
  const slotW = (w - wallN * d.wall) / n;
  if (slotW < 1) return body;

  // Right through, front to back, so a card can be pushed out from underneath
  // rather than fished at with a fingernail -- except on a wall, where there is
  // nothing behind to push it out to, and where cutting through would slice the
  // dovetail rail off the back into as many pieces as there are slots.
  const wall = d.form === 'wall';
  const deep = wall ? bodyD(d, bay) - 2 * d.clear - 2 * d.wall : bodyD(d, bay) + 2;
  const at = wall ? -d.wall : 0;

  const cuts: Manifold[] = [];
  for (let i = 0; i < n; i++) {
    const cx = -w / 2 + d.wall + i * (slotW + d.wall) + slotW / 2;
    cuts.push(
      m.Manifold.cube([slotW, deep, d.cardsH], true).translate([
        bay.cx + cx,
        at,
        bay.cz + d.wall + d.cardsH / 2,
      ]),
    );
  }
  return body.subtract(m.Manifold.union(cuts));
}

/** Total height of a module, for readouts and for checking the bed. */
export function moduleHeight(d: Derived, bay: Bay): number {
  switch (bay.kind) {
    case 'stand':
      // A slab standing off its own plate, so the plate counts. This is what
      // the wall form stacks shelves by and what the readout quotes as the
      // overall height.
      return d.standH + d.plateT;
    case 'cup':
      return d.cupH;
    case 'tray':
      return d.trayH;
    case 'pentray':
      return d.penH;
    case 'cards':
      return d.cardsH;
    default:
      return 0;
  }
}

/**
 * A module by its kind -- everything except the phone stand, which is a
 * different enough object to have its own file.
 *
 * Here rather than spelled out at each call site so that the set of kinds is
 * stated once: the builder, the readouts and the tests all come through this.
 */
export function buildModule(m: ManifoldToplevel, d: Derived, bay: Bay): Manifold | null {
  switch (bay.kind) {
    case 'cup':
      return buildCup(m, d, bay);
    case 'tray':
      return buildTray(m, d, bay);
    case 'pentray':
      return buildPenTray(m, d, bay);
    case 'cards':
      return buildCards(m, d, bay);
    default:
      return null;
  }
}
