import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { roundedRect, slot } from '../../../core/kernel/primitives';
import type { Derived } from '../geometry';
import { railBounds } from './deck';
import { backY, deckSpan, ejectFaceY } from './layout';

/**
 * The carcass: the part that stays on the desk.
 *
 * A top plate, two sides and a back. No bottom, no front and -- worth saying,
 * because the reference photo looks like it has one -- no shelf between the
 * drawers either. Each tray hangs from tongues running in grooves in its own
 * pair of side-wall slots, and the tray above is the only ceiling the one below
 * needs. A real shelf would be a 110 mm horizontal bridge in mid-air the moment
 * you turn the carcass over to print it, which is the orientation the top plate
 * insists on.
 *
 * Everything a tier owns -- grooves, stop, latch rails, ejector seat -- is
 * modelled tier-local by the functions below and lifted to its tier by
 * `buildCarcass`. That is the whole trick to more than one drawer.
 *
 * Printed top-plate-down. Everything that overhangs then faces up.
 */

/**
 * Groove the tray's tongue runs in. Tier-local.
 *
 * `slideZ` is measured from the tray's own underside, and the tray sits on top
 * of the latch bay -- so everything the carcass cuts for it is lifted by
 * `trayZ`. Miss that and the grooves are cut a bay's height too low and the
 * tray hangs from nothing.
 */
export function slideGroove(m: ManifoldToplevel, d: Derived): Manifold {
  // Longer than the carcass at the front so the groove opens to let the tray
  // in, and stopped short of the back wall so the tray has something to shut
  // against.
  const len = d.D - d.wall + 2;
  const h = d.slideT + 2 * d.clear;
  const deep = d.slideP + d.clear;
  const x = d.W / 2 - d.sideT;
  return m.Manifold.union(
    [-1, 1].map((s) =>
      m.Manifold.cube([2 * deep, len, h], true).translate([
        s * x,
        -d.D / 2 + len / 2 - 1,
        d.trayZ + d.slideZ,
      ]),
    ),
  );
}

/**
 * The stop that keeps the tray out of your lap.
 *
 * A peg at the FRONT of the groove that rides in a relief channel milled along
 * the tongue, and fetches up against the end of that channel at full travel.
 *
 * The obvious design -- a bump partway down the groove for the tongue's back
 * end to hit -- cannot work, and it is worth saying why, because it looks
 * right. The tongue runs the whole length of the tray, so wherever you put the
 * bump, the tongue is sitting on it already: at every position from shut to
 * fully open, the tongue spans that point. A bump in the groove is not a stop,
 * it is a permanent interference, and it measured as one.
 *
 * Put the peg at the front and relieve the tongue instead and the two only ever
 * meet at the one place you want them to.
 */
export function stopY(d: Derived): number {
  return -d.D / 2 + 2;
}

function slideStop(m: ManifoldToplevel, d: Derived): Manifold {
  const x = d.W / 2 - d.sideT + d.slideP + d.clear;
  const r = d.stopH;
  return m.Manifold.union(
    [-1, 1].map((s) =>
      m.Manifold.cylinder(d.slideT, r, r, 24).translate([
        s * x,
        stopY(d),
        d.trayZ + d.slideZ - d.slideT / 2,
      ]),
    ),
  );
}

/**
 * The rails the latch deck slides in on, cut into the same side walls as the
 * slide grooves but down at the FLOOR of the opening, under the tray.
 *
 * Full length, like the slide grooves, for the same reason: the deck has to go
 * in from the open front. A groove only where the deck ends up is a groove the
 * deck cannot reach.
 */
function railGroove(m: ManifoldToplevel, d: Derived): Manifold {
  const rail = railBounds(d);
  const len = d.D - d.wall + 2;
  return m.Manifold.union(
    [-1, 1].map((s) =>
      m.Manifold.cube([2 * d.railD, len, d.railH], true).translate([
        s * rail.halfW,
        -d.D / 2 + len / 2 - 1,
        (rail.z0 + rail.z1) / 2,
      ]),
    ),
  );
}

/**
 * The bump in each rail the deck snaps past on the way in.
 *
 * It stands where the deck's front edge ends up, so once the deck is home it is
 * trapped between the bump and the back wall. Pressing it past means spreading
 * the two side walls by three tenths of a millimetre over the width of the
 * carcass, which they will do and a stiff plate will not.
 */
function railStop(m: ManifoldToplevel, d: Derived): Manifold {
  const rail = railBounds(d);
  return m.Manifold.union(
    [-1, 1].map((s) =>
      m.Manifold.cylinder(d.railH, d.snapH, d.snapH, 24).translate([
        s * rail.halfW,
        rail.frontY - d.snapH,
        rail.z0,
      ]),
    ),
  );
}

/** Screw holes up into the desk, or shallow pads for tape. Not tier-local. */
function mounting(m: ManifoldToplevel, d: Derived): Manifold | null {
  if (d.mount !== 'screws') return null;
  const holes: Manifold[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const x = sx * (d.W / 2 - d.screwInset);
      const y = sy * (d.D / 2 - d.screwInset);
      holes.push(
        m.Manifold.cylinder(d.topT + 2, d.screwD / 2, d.screwD / 2, 32).translate([x, y, d.H - 1]),
        // Counterbored from BELOW: the head has to sit inside the plate, or it
        // fouls the tray sliding under it.
        m.Manifold.cylinder(d.topT * 0.6, d.screwHeadD / 2, d.screwHeadD / 2, 32).translate([
          x,
          y,
          d.H - 0.01,
        ]),
      );
    }
  }
  return m.Manifold.union(holes);
}

/**
 * The boss the latch wire pivots in, for the paperclip follower only.
 *
 * A block on the back wall with a cross hole, standing in the bay under the
 * tray. The wire's short leg drops through it and the long arm reaches forward
 * beneath the tray with its tip bent UP; the hole is a pivot, not a clamp,
 * because the arm has to rotate in it to press the pin up into the groove and
 * flex sideways as the cam throws it about.
 */
function wireBoss(m: ManifoldToplevel, d: Derived): { add: Manifold; cut: Manifold } {
  const z = d.wireZ;
  const y = backY(d);
  const w = d.wireD * 6;
  const deep = d.wireD * 4;

  // Floor of the bay up to the tray's underside: the whole of the room there
  // is. Anything taller fouls the tray it is supposed to run under.
  const z0 = 0;
  const z1 = d.bayH;
  const block = m.Manifold.cube([w, deep, z1 - z0], true).translate([
    0,
    y - deep / 2,
    (z0 + z1) / 2,
  ]);
  // Cross hole along X, and a slot DOWN to it so the wire can be pressed in
  // rather than threaded -- you cannot thread a bent wire through a blind box.
  // Down rather than up, because up is the tray and the open face of the bay is
  // its underside.
  const hole = m.Manifold.cylinder(w + 2, (d.wireD + d.clear) / 2, (d.wireD + d.clear) / 2, 32, true)
    .rotate([0, 90, 0])
    .translate([0, y - deep / 2, z]);
  const entry = m.Manifold.cube([w + 2, d.wireD * 0.8, 2 * z], true).translate([
    0,
    y - deep / 2,
    0,
  ]);
  return { add: block, cut: m.Manifold.union([hole, entry]) };
}

/**
 * Posts for an elastic band, or a seat the printed spring sits against.
 *
 * Both stand on the back wall inside the tray's ejector tunnel, which is the
 * only place down here the tray offers a face to push on. That sets their
 * height: they have to pass through the mouth of the tunnel as the drawer
 * closes, so they live in exactly the band of z the bore does.
 *
 * The printed spring gets cheeks as well as a back. Free-standing, a serpentine
 * longer than the gap it works in does not compress, it buckles sideways -- the
 * cheeks are what make compression the only thing it can do.
 */
function ejectorSeat(m: ManifoldToplevel, d: Derived): Manifold | null {
  if (!d.latch) return null;
  const y = backY(d);
  const z0 = d.trayZ + d.tunnelFloor + d.clear;

  if (d.eject === 'band') {
    // Two posts with a lip, so the band cannot walk off them. Pulled back onto
    // the wall itself: free-standing in mid-bay they are attached to nothing,
    // and there is no floor under this tier to stand them on.
    const h = d.bandPost;
    return m.Manifold.union(
      [-1, 1].map((s) =>
        m.Manifold.union([
          m.Manifold.cylinder(h, 1.6, 1.6, 24).translate([s * (d.bandSpan / 2), y - 1.6, z0]),
          m.Manifold.cylinder(Math.min(1, h * 0.2), 2.4, 1.6, 24).translate([
            s * (d.bandSpan / 2),
            y - 1.6,
            z0 + h - 1,
          ]),
        ]),
      ),
    );
  }
  const seatH = d.springSeatH;
  // Short enough that the blind end of the tunnel still clears it at the bottom
  // of the press stroke -- the tray comes `over` further in than it sits.
  const cheekLen = Math.min(d.springGap - d.over - d.clear - 1, d.springFree * 0.45);
  const back = m.Manifold.cube([d.springW + 2 * d.wall, d.wall, seatH], true).translate([
    0,
    y - d.wall / 2,
    z0 + seatH / 2,
  ]);
  const cheeks = m.Manifold.union(
    [-1, 1].map((s) =>
      m.Manifold.cube([d.wall, cheekLen, seatH], true).translate([
        s * (d.springW / 2 + d.clear + d.wall / 2),
        y - cheekLen / 2,
        z0 + seatH / 2,
      ]),
    ),
  );
  return cheekLen > 4 ? back.add(cheeks) : back;
}

/** Everything one drawer's slot owns, in tier-local z. */
function tierFeatures(
  m: ManifoldToplevel,
  d: Derived,
): { cuts: Manifold[]; adds: Manifold[] } {
  const cuts: Manifold[] = [slideGroove(m, d)];
  const adds: Manifold[] = [slideStop(m, d)];

  if (d.latch) {
    if (d.follower === 'printed') {
      cuts.push(railGroove(m, d));
      adds.push(railStop(m, d));
    } else {
      const boss = wireBoss(m, d);
      adds.push(boss.add);
      cuts.push(boss.cut);
    }
    const seat = ejectorSeat(m, d);
    if (seat) adds.push(seat);
  }
  return { cuts, adds };
}

export function buildCarcass(m: ManifoldToplevel, d: Derived): Manifold {
  const top = m.Manifold.extrude(roundedRect(m, d.W, d.D, 2), d.topT).translate([0, 0, d.H]);

  const sides = m.Manifold.union(
    [-1, 1].map((s) =>
      m.Manifold.cube([d.sideT, d.D, d.H], true).translate([
        s * (d.W / 2 - d.sideT / 2),
        0,
        d.H / 2,
      ]),
    ),
  );
  const back = m.Manifold.cube([d.W - 2 * d.sideT, d.wall, d.H], true).translate([
    0,
    d.D / 2 - d.wall / 2,
    d.H / 2,
  ]);

  let solid = top.add(sides).add(back);

  // Grooves first for EVERY tier, then the bumps back into them: the other
  // order cuts the bumps away again -- and with two drawers, one tier's groove
  // would cut the tier below's stop as it ran past.
  const cuts: Manifold[] = [];
  const adds: Manifold[] = [];
  for (const tier of d.tiers) {
    const f = tierFeatures(m, d);
    cuts.push(...f.cuts.map((c) => c.translate([0, 0, tier.z0])));
    adds.push(...f.adds.map((a) => a.translate([0, 0, tier.z0])));
  }
  solid = solid.subtract(m.Manifold.union(cuts));
  if (adds.length > 0) solid = solid.add(m.Manifold.union(adds));

  const holes = mounting(m, d);
  if (holes) solid = solid.subtract(holes);

  if (d.mount === 'tape') {
    // Shallow pockets on the top face, so a tape pad sits flush and the plate
    // still beds down on bare plastic all round it.
    const pads = m.Manifold.union(
      [-1, 1].flatMap((sx) =>
        [-1, 1].map((sy) =>
          m.Manifold.extrude(slot(m, d.D * 0.34, 16).rotate(90), 0.6).translate([
            sx * (d.W / 2 - 13),
            sy * (d.D / 4),
            d.H + d.topT - 0.6,
          ]),
        ),
      ),
    );
    solid = solid.subtract(pads);
  }

  return solid;
}

/** The run under the tray that every tier's latch lives along. For tests. */
export function latchBay(d: Derived): readonly [number, number] {
  return deckSpan(d);
}

/** Where the ejector pushes, so the spring and its seat agree. For tests. */
export function ejectorFace(d: Derived): number {
  return ejectFaceY(d);
}
