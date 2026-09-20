import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { roundedRect } from '../../../core/kernel/primitives';
import { camCutter, camGroove } from '../cam';
import type { Derived } from '../geometry';
import { stopY } from './carcass';
import { camOriginY, ejectFaceY, frontY, funnelY, pinY, trayBackY } from './layout';

/**
 * The tray: the part that moves.
 *
 * Floor, four walls, a tongue down each outer side, a front, optional dividers,
 * and -- underneath -- the two things the latch needs from it: the cam groove
 * the follower's pin rides, and the tunnel the ejector shoves on.
 *
 * Both are RECESSES, and that is not a detail. The tray is printed floor-down,
 * so its underside is the bed: anything the tray contributes to the latch has
 * to be cut INTO that face, never hung below it. A pusher lug under the floor
 * would be the lowest thing on the part, and the tray would print standing on
 * the lug with its whole floor in mid-air.
 *
 * Modelled with z = 0 at the tray's own underside and lifted onto the bay by
 * `trayZ` on the way out, so everything here reads in the tray's own frame.
 */

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

/** The open box: a solid tray with the inside taken out of it. */
function shell(m: ManifoldToplevel, d: Derived): Manifold {
  const y0 = frontY(d);
  const y1 = y0 + d.trayD;
  const outer = m.Manifold.extrude(roundedRect(m, d.trayW, d.trayD, 1.5), d.trayH).translate([
    0,
    (y0 + y1) / 2,
    0,
  ]);
  const inner = m.Manifold.extrude(
    roundedRect(m, d.trayW - 2 * d.trayWall, d.trayD - 2 * d.trayWall, 1),
    d.trayH,
  ).translate([0, (y0 + y1) / 2, d.trayFloor]);
  return outer.subtract(inner);
}

/** Tongues down both outer faces, running the full length of the tray. */
function tongues(m: ManifoldToplevel, d: Derived): Manifold {
  const y0 = frontY(d);
  const x = d.trayW / 2;
  return m.Manifold.union(
    [-1, 1].map((s) =>
      m.Manifold.cube([d.slideP * 2, d.trayD - 2, d.slideT], true).translate([
        s * x,
        y0 + d.trayD / 2,
        d.slideZ,
      ]),
    ),
  );
}

/**
 * The channel the carcass's stop peg runs in, and the wall at the end of it
 * that catches the peg at full travel.
 *
 * Open at the front, so the tray drops straight in. It is only on the way OUT
 * that the peg runs out of channel, and only past that point that it has to be
 * forced over full-depth tongue -- which is what makes the tray removable
 * without making it fall out.
 */
function stopChannel(m: ManifoldToplevel, d: Derived): Manifold {
  const y0 = frontY(d) - 2;
  const y1 = stopY(d) + d.travel;
  const x = d.trayW / 2 + d.slideP;
  const deep = d.stopH + d.clear;
  return m.Manifold.union(
    [-1, 1].map((s) =>
      box(
        m,
        s > 0 ? x - deep : -x,
        s > 0 ? x : -x + deep,
        y0,
        y1,
        d.slideZ - d.slideT / 2 - 0.1,
        d.slideZ + d.slideT / 2 + 0.1,
      ),
    ),
  );
}

/** Dividers, dropped in on a grid. Short of the rim so the tray still cleans out. */
function dividers(m: ManifoldToplevel, d: Derived): Manifold | null {
  if (d.divX < 1 && d.divY < 1) return null;
  const y0 = frontY(d) + d.trayWall;
  const y1 = frontY(d) + d.trayD - d.trayWall;
  const x0 = -d.trayW / 2 + d.trayWall;
  const x1 = d.trayW / 2 - d.trayWall;
  const top = d.trayFloor + (d.trayH - d.trayFloor) * d.divH;
  const walls: Manifold[] = [];

  for (let i = 1; i <= d.divX; i++) {
    const x = x0 + ((x1 - x0) * i) / (d.divX + 1);
    walls.push(box(m, x - d.divT / 2, x + d.divT / 2, y0, y1, d.trayFloor - 0.2, top));
  }
  for (let i = 1; i <= d.divY; i++) {
    const y = y0 + ((y1 - y0) * i) / (d.divY + 1);
    walls.push(box(m, x0, x1, y - d.divT / 2, y + d.divT / 2, d.trayFloor - 0.2, top));
  }
  return walls.length > 0 ? m.Manifold.union(walls) : null;
}

/** The face, and whatever you get hold of it by. */
function front(m: ManifoldToplevel, d: Derived): { add: Manifold; cut: Manifold | null } {
  const y1 = frontY(d);
  const w = d.trayW + 2 * d.frontOver;
  // How far the face laps past the tray top and bottom.
  //
  // Positive for a lone drawer: there is nothing above or below to run into,
  // and lapping the opening is the whole job of a drawer front. NEGATIVE in a
  // stack, because the gap between one tray and the next is the running
  // clearance and nothing else -- lap both fronts into that and the two faces
  // grind on each other every time either drawer moves, which is exactly what
  // they did, by 516 cubic millimetres. Short of the tray on both edges leaves
  // an even reveal instead.
  const lap = d.tiers.length > 1 ? -(d.frontReveal - d.clear) / 2 : d.frontOver / 2;
  // Down past the tray's own underside, because the latch bay is under there
  // and an uncovered bay is a slot straight into the mechanism. It is the one
  // asymmetry in the face: it laps the TRAY at the top and the OPENING at the
  // bottom.
  const zBot = -d.bayH - lap;
  const zTop = d.trayH + lap;
  const y0 = y1 - d.frontT;
  // Sunk 0.6 mm INTO the tray's front wall rather than butted against it. Face
  // to face, the union has no volume to work with and Manifold hands back two
  // bodies that merely touch -- a face plate that slices off in the slicer.
  const plate = m.Manifold.extrude(roundedRect(m, w, zTop - zBot, 2), d.frontT + d.frontBite)
    .rotate([90, 0, 0])
    .translate([0, y1 + d.frontBite, (zBot + zTop) / 2]);

  if (d.front === 'bar') {
    const bar = m.Manifold.cylinder(w * 0.5, d.pullD / 2, d.pullD / 2, 32, true)
      .rotate([0, 90, 0])
      .translate([0, y0 - d.pullD / 2, d.trayH * 0.55]);
    const legs = m.Manifold.union(
      [-1, 1].map((s) =>
        m.Manifold.cube([d.pullD, d.pullD, d.pullD], true).translate([
          s * w * 0.22,
          y0 - d.pullD / 2,
          d.trayH * 0.55,
        ]),
      ),
    );
    return { add: plate.add(bar).add(legs), cut: null };
  }
  if (d.front === 'scoop') {
    // A cylinder laid along the face and sunk into its top edge: you hook a
    // finger over the rim rather than pinching the plate.
    const r = d.pullH;
    const scoop = m.Manifold.cylinder(w * 0.45, r, r, 48, true)
      .rotate([0, 90, 0])
      .translate([0, y0 + d.pullD * 0.35, zTop + r * 0.45]);
    return { add: plate, cut: scoop };
  }
  return { add: plate, cut: null };
}

/**
 * The island the cam is cut into, standing on the tray's floor.
 *
 * A 2.2 mm groove does not fit in a 2 mm floor, so the floor is locally
 * thickened over the cam's footprint and over the strip of relief that runs
 * back from the funnel to the tray's back edge. Inside the tray it reads as a
 * low, rounded plinth at the back -- which is all that is left of the cam plate
 * that used to hang off the tray's back face and eat the depth of the drawer.
 */
function camPad(m: ManifoldToplevel, d: Derived): Manifold {
  const top = Math.max(d.trayFloor, d.camPadT);
  const y0 = pinY(d) - d.over - d.grooveW - 2;
  const y1 = trayBackY(d);
  return m.Manifold.extrude(roundedRect(m, d.camPadW, y1 - y0, 3), top).translate([
    0,
    (y0 + y1) / 2,
    0,
  ]);
}

/**
 * The block the ejector tunnel is bored through, and the bore itself.
 *
 * The tunnel is a blind hole running forward from the tray's back face: the
 * ejector sits in it, seated on the carcass back wall, and shoves on the blind
 * end. Its floor is deliberately thicker than the cam is deep, because the
 * follower's pin runs in its relief directly underneath and the two must pass.
 */
function tunnel(m: ManifoldToplevel, d: Derived): { add: Manifold; cut: Manifold } {
  const yEnd = ejectFaceY(d);
  const yBack = trayBackY(d);
  const top = d.tunnelFloor + d.tunnelH + d.trayFloor;
  const blockW = d.tunnelW + 2 * d.trayWall;

  const add = m.Manifold.extrude(
    roundedRect(m, blockW, yBack - (yEnd - 2 * d.trayWall), 3),
    Math.max(top, d.trayFloor),
  ).translate([0, (yBack + yEnd - 2 * d.trayWall) / 2, 0]);

  const cut = box(
    m,
    -d.tunnelW / 2,
    d.tunnelW / 2,
    yEnd,
    yBack + 2,
    d.tunnelFloor,
    d.tunnelFloor + d.tunnelH,
  );
  return { add, cut };
}

/**
 * The peg the elastic band hooks over, standing up off the tunnel floor.
 *
 * Up, not down: inside the tunnel the floor is the one surface that faces the
 * sky, so a post grown off it prints the right way round even though the whole
 * feature is buried in the tray's floor.
 */
function bandHook(m: ManifoldToplevel, d: Derived): Manifold {
  const h = Math.max(2.5, d.tunnelH - 2 * d.clear - 1);
  const y = ejectFaceY(d) + 3.2;
  return m.Manifold.union([
    m.Manifold.cylinder(h, 1.6, 1.6, 24).translate([0, y, d.tunnelFloor]),
    m.Manifold.cylinder(Math.min(1, d.tunnelH * 0.2), 2.4, 1.6, 24).translate([
      0,
      y,
      d.tunnelFloor + h - 1,
    ]),
  ]);
}

/**
 * The heart groove, cut UP into the tray's underside, and the plain relief that
 * carries the pin off the back of it.
 *
 * `camCutter` builds the groove downward from a top face at z = 0, which is the
 * right way round for a plate you look down on; here the plate is the tray's
 * FLOOR seen from below, so the whole cutter is mirrored in z. The relief is
 * the funnel carried on to the tray's back edge at full depth: without it the
 * pin rides on the flat of the underside for the rest of the travel, bowing the
 * beam two millimetres the wrong way every time the drawer is open.
 */
function camCut(m: ManifoldToplevel, d: Derived): Manifold {
  const groove = camCutter(m, d).mirror([0, 0, 1]).translate([0, camOriginY(d), 0]);
  const relief = box(
    m,
    -d.camBias - d.reliefW / 2,
    -d.camBias + d.reliefW / 2,
    funnelY(d) - 1,
    trayBackY(d) + 2,
    0,
    d.camDeep,
  );
  return groove.add(relief);
}

export function buildTray(m: ManifoldToplevel, d: Derived): Manifold {
  let solid = shell(m, d).add(tongues(m, d)).subtract(stopChannel(m, d));

  const div = dividers(m, d);
  if (div) solid = solid.add(div);

  if (d.latch) {
    const bore = tunnel(m, d);
    solid = solid.add(camPad(m, d)).add(bore.add).subtract(bore.cut).subtract(camCut(m, d));
    // The hook stands INSIDE the bore, so it goes back after the bore is cut.
    // Added first, the cut takes it away again.
    if (d.eject === 'band') solid = solid.add(bandHook(m, d));
  }

  const f = front(m, d);
  solid = solid.add(f.add);
  // Cut the grip LAST: the scoop has to bite through the face plate that was
  // only just added, and a union after a cut fills the cut straight back in.
  if (f.cut) solid = solid.subtract(f.cut);

  return solid.translate([0, 0, d.trayZ]);
}

/** The groove in plan, for tests and for anything that needs to see the path. */
export function trayCamGroove(m: ManifoldToplevel, d: Derived) {
  return camGroove(m, d).translate([0, camOriginY(d)]);
}
