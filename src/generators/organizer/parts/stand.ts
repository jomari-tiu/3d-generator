import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import { filletProfile, roundedRect, softPrism } from '../../../core/kernel/primitives';
import { moduleFoot } from '../dock';
import {
  backX,
  cableDropY,
  bodyD,
  bodyW,
  bodyY0,
  cableGrooveH,
  clipSpec,
  faceX,
  leadBore,
  passDropY,
  puckRing,
  standSoftR,
  type Bay,
  type Derived,
} from '../geometry';

/**
 * The phone stand: a plate, a leaning back rest and a lip, and it lifts off.
 *
 * The whole side elevation is ONE 2D profile extruded across the width, which
 * is the cheapest way to get a shape this fussy exactly right -- the lean, the
 * lip, the well the phone sits in and the plate are four dimensions of the same
 * polygon rather than four solids hoping to meet.
 *
 * Printed lying on its BACK. Stood up the way it is used, the leaning face is a
 * 75-degree overhang and the lip is a bridge; on its back the whole thing is
 * flat faces and the puck pocket opens upward.
 */

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * The same point in the ASSEMBLED frame: [Y, Z].
 *
 * Kept separate from the local one on purpose. The profile is drawn with the
 * front at zero and the cutters have to land on a part that has since been
 * moved; doing that conversion at each call site is how a pocket ends up
 * half a plate thickness out.
 */
function faceWorld(d: Derived, bay: Bay, h: number): [number, number] {
  return [faceX(d, h) + bodyY0(d, bay), bay.cz + d.plateT + h];
}

/**
 * The side elevation, in local (depth from the front, height).
 *
 * Wound counter-clockwise: along the bottom to the back, up and over the rest,
 * forward along the plate, then up and over the lip.
 */
/** The lip's own corner of the profile, or a flat front when it is tabs. */
function lipPoly(d: Derived, style: string): [number, number][] {
  return style === 'tabs'
    ? [[0, d.plateT]]
    : [
        [d.lipT, d.plateT],
        [d.lipT, d.lipH],
        [0, d.lipH],
      ];
}

function profile(m: ManifoldToplevel, d: Derived, bay: Bay, style = d.lipStyle): CrossSection {
  const t = d.plateT;
  const restH = Math.max(d.standH - t, 5);
  const lean = Math.tan(rad(d.lean));
  const D = bodyD(d, bay);
  const xf = faceX(d, 0);
  const xb = xf + d.restT;

  // On a wall the stand hangs by its BACK, and the back of a phone stand is
  // ninety millimetres of thin air: the rest is at the front and everything
  // behind it is plate. So the wall form grows an upstand at the rear for the
  // dovetail to live in -- without one the rail was modelled hanging off
  // nothing, and the part came out as two bodies.
  const up: [number, number][] =
    d.form === 'wall'
      ? [
          [D, t + d.standBackH],
          [D - 2 * d.wall, t + d.standBackH],
          [D - 2 * d.wall, t],
        ]
      : [];

  const poly: [number, number][] = [
    [0, 0],
    [D, 0],
    [D, t],
    ...up,
    [xb, t],
    [xb + restH * lean, t + restH],
    [xf + restH * lean, t + restH],
    [xf, t],
    // The lip -- unless the phone is standing on tabs, in which case the front
    // of the stand is flat all the way across and the ledges it stands on are
    // built separately, at whatever height they have been put.
    ...lipPoly(d, style),
  ];
  // Softened only on the inside corners: a minimalist object still wants the
  // crease the phone lands in to be a radius rather than a stress riser.
  return filletProfile(m.CrossSection.ofPolygons([poly], 'NonZero'), Math.min(1.5, t / 2));
}

/**
 * Stand the elevation up, run it across the width, soften it, and put it where
 * it goes.
 *
 * Manifold extrudes along Z and nowhere else, so the profile comes out lying
 * down. Two rotations send local (depth, height, width) to world (X, Y, Z) --
 * as one call they would be applied in XYZ order and the part would end up on
 * its side.
 *
 * The softening is a ball rolled over the whole outside (`softPrism`), not a
 * fillet on the profile: the edges that make a phone stand look like a milled
 * block rather than a moulded object are the ones running across the width and
 * round the ends, and a 2D fillet cannot reach any of them.
 *
 * Everything but the BOTTOM. The part is printed standing on that face, and an
 * edge rounded there curves out from the bed -- a zero-degree overhang running
 * right round the footprint. So the profile is given a skirt below its bottom
 * line first, the ball rounds the skirt's edges instead, and the skirt is then
 * sliced off flush. What is left is square where it meets the bed and soft
 * everywhere you can see.
 */
function place(m: ManifoldToplevel, cs: CrossSection, d: Derived, bay: Bay): Manifold {
  const w = bodyW(bay) - 2 * d.clear;
  const D = bodyD(d, bay);
  const r = standSoftR(d);
  let solid: Manifold;
  if (r > 0.05 && w > 2 * r) {
    // Flush with the profile's own bottom line, front and back. Run wider it
    // would put a step in the side just above the bed, and the ball would
    // dutifully round that instead of leaving the wall straight.
    const skirt = m.CrossSection.square([D, r + 0.01], false).translate([0, -r]);
    // In this frame the profile's depth is X, its height is Y, and the width
    // runs along Z -- the rotations have not happened yet. So the skirt comes
    // off by cutting everything below Y = 0.
    solid = softPrism(m, cs.add(skirt), w, r).subtract(
      m.Manifold.cube([D + 8, 2 * r + 2, w + 4], true).translate([D / 2, -r - 1, w / 2]),
    );
  } else {
    solid = m.Manifold.extrude(cs, w);
  }
  return solid
    .rotate([90, 0, 0])
    .rotate([0, 0, 90])
    .translate([bay.cx - w / 2, bodyY0(d, bay), bay.cz]);
}

/**
 * The cross-section of a closed run that a lead has to be threaded along.
 *
 * Never smaller than the plug on the end of it. See `leadBore` -- these runs
 * have material on all four sides, so the moulding is what has to fit, and
 * sizing them from the cable channel made every one of them impassable.
 */
function leadRun(d: Derived): { w: number; t: number } {
  const lead = leadBore(d);
  return { w: Math.max(d.cableW, lead.w), t: Math.max(d.cableD * 2, lead.t) };
}

/**
 * A gap in the dovetail foot where a lead comes up through it.
 *
 * The plate offers a hole and the module offers a channel, both on the bay's
 * centreline -- and the dovetail foot runs straight down that same centreline
 * between them. The channel was cut two millimetres into a four-millimetre
 * foot, so the last two millimetres of the route were solid dovetail and the
 * plug fetched up against it.
 *
 * Taken out full width rather than plug-width: dtW is 14 and a 12.5 mm channel
 * through it would leave the foot standing on two 0.75 mm slivers. The foot is
 * ninety millimetres long and loses seven of them, which it does not miss, and
 * it slides on exactly as before -- one rail, two segments.
 */
function footGap(m: ManifoldToplevel, d: Derived, bay: Bay, y: number): Manifold | null {
  if (d.form !== 'desk') return null;
  const t = leadRun(d).t;
  return m.Manifold.cube([bay.w, t, d.dtH + 2], true).translate([bay.cx, y, bay.cz - d.dtH / 2]);
}

/**
 * The wireless charger pocket, and the way its cable gets out BEHIND the rest.
 *
 * Nothing at all on the leaning face except the pocket. The cable used to be
 * grooved down that face, which put it between the phone and the thing holding
 * the phone: a ridge under the screen, and a lead pinched flat every time the
 * phone went on. It bores straight out the back of the pocket instead, runs
 * down the rear of the rest where nothing ever touches it, and drops through
 * the plate behind the rest.
 */
function charger(m: ManifoldToplevel, d: Derived, bay: Bay): Manifold | null {
  if (!d.wireless) return null;
  const [fy, fz] = faceWorld(d, bay, d.puckH);

  // +Z turned to point INTO the face. The face's normal leans out and up, so
  // the cutter has to lean in and down, which is that normal through 180.
  const axis: [number, number, number] = [270 - d.lean, 0, 0];
  // As deep as the puck is THICK, and no deeper. Cut `puckT + 2` it sat two
  // millimetres below the face, so the phone rested on the plastic rim and the
  // magnets worked across a 2 mm air gap they did not need to. The cutter
  // starts a millimetre proud of the face instead, which is where the overshoot
  // belongs -- outside the part, not buried in it.
  const pocket = m.Manifold.cylinder(
    d.puckT + d.clear + 1,
    d.puckD / 2 + d.clear,
    d.puckD / 2 + d.clear,
    64,
  )
    .translate([0, 0, -1])
    .rotate(axis)
    .translate([bay.cx, fy, fz]);

  // Straight on through the rest, along the pocket's own axis, so the bore is
  // the pocket's floor carried out the other side. Long enough to be through
  // whatever thickness the rest has been given -- and wide enough to pass the
  // plug on the far end of the puck's lead, which is the only way that lead
  // ever gets threaded.
  const run = leadRun(d);
  const bore = m.Manifold.extrude(
    roundedRect(m, run.w, Math.max(d.cableD + 2 * d.clear, leadBore(d).t), 0.5),
    d.restT + d.puckT + 6,
  )
    .rotate(axis)
    .translate([bay.cx, fy, fz]);

  // Down the back, to the plate: a box twice as deep as the channel, centred
  // ON the back face, so half of it bites and half cuts air. The back of the
  // slab is a real surface, so this is an open GROOVE -- the lead is laid into
  // it from outside and the plug never passes through anything, which is why
  // the cable is what has to fit here and the moulding is what has to fit
  // everywhere else. (The wedge this generator used to offer was solid all the
  // way back, so the identical box came out as a closed tunnel that had to be
  // threaded, and at cable width nothing could be.)
  const down = d.puckH + d.plateT + 20;
  const gy = backX(d, d.puckH / 2 - 5) + bodyY0(d, bay);
  const gz = bay.cz + d.plateT + d.puckH / 2 - 5;
  const groove = m.Manifold.cube([d.cableW, 2 * d.cableD, down], true)
    .rotate([-d.lean, 0, 0])
    .translate([bay.cx, gy, gz]);

  // And then away. On a desk that is straight down through the plate, to the
  // hole waiting in the base; on a wall there is no base under it, so the same
  // cable runs back along the underside of the shelf and through the panel.
  // Same drop point either way -- it is the one the rest brings the lead down
  // to, and the part it hands off to is the one that has to meet it.
  const tail =
    d.form === 'wall'
      ? m.Manifold.cube([d.cableW, d.D / 2 - cableDropY(d) + 2, cableGrooveH(d)], true).translate([
          bay.cx,
          (cableDropY(d) + d.D / 2 + 2) / 2,
          bay.cz + cableGrooveH(d) / 2,
        ])
      : m.Manifold.cube([run.w, run.t, d.plateT + 6], true).translate([
          bay.cx,
          cableDropY(d),
          bay.cz + d.plateT / 2,
        ]);
  const gap = footGap(m, d, bay, cableDropY(d));
  return m.Manifold.union(gap ? [pocket, bore, groove, tail, gap] : [pocket, bore, groove, tail]);
}

/**
 * The two ledges the phone stands on, when it is not standing on a lip.
 *
 * One at each end with the middle left open, so the charging port -- which is
 * in the centre of the phone's bottom edge -- has nothing in front of it. That
 * is the whole point of the shape: the plug goes straight in from the front
 * instead of being threaded under a lip and bent back up into the socket.
 *
 * Each is a shelf with a small upstand at its outer edge. The phone leans
 * back, so gravity already holds it against the face and the upstand is only
 * there to stop it walking forward off the shelf.
 *
 * They hang off the face with open air beneath, which is how the reference
 * object does it and is also free: the stand prints lying on its back, so a
 * ledge projecting from the face is a block projecting at the sky.
 */
function lipTabs(m: ManifoldToplevel, d: Derived, bay: Bay): Manifold | null {
  if (d.lipStyle !== 'tabs') return null;
  // The BODY's width, the same number `place` builds the rest on -- not the
  // bay's. A margin widens the bay and leaves the body where it was, so tabs
  // set out from the bay walk outward by the margin on each side and end up
  // standing on bare plate with daylight between them and the face they are
  // supposed to be part of.
  const w = bodyW(bay) - 2 * d.clear;
  // Never so wide that the two of them close the gap they exist to leave.
  const tabW = Math.max(4, Math.min(d.tabW, (w - 2 * d.wall - 8) / 2));
  const zTop = bay.cz + d.plateT + d.ledgeZ;
  const yFace = faceX(d, d.ledgeZ) + bodyY0(d, bay);
  // Forward far enough to take the phone leaning back on it.
  const proj = d.phoneT + 2 * d.clear;
  const upH = Math.max(3, Math.min(8, d.lipH / 2));
  // Sunk into the face rather than butted on it: face to face the union has no
  // volume to work with and a ledge comes back as a loose block.
  const bite = 0.8;

  const parts: Manifold[] = [];
  for (const side of [-1, 1]) {
    const cx = bay.cx + side * (w / 2 - d.wall - tabW / 2);
    parts.push(
      m.Manifold.cube([tabW, proj + bite, d.lipT], true).translate([
        cx,
        yFace + bite / 2 - proj / 2,
        zTop - d.lipT / 2,
      ]),
    );
    parts.push(
      m.Manifold.cube([tabW, d.lipT, upH + d.lipT], true).translate([
        cx,
        yFace - proj + d.lipT / 2,
        zTop + upH / 2 - d.lipT / 2,
      ]),
    );
  }
  return m.Manifold.union(parts);
}

/** A notch under the lip, so a plug-in cable can reach the phone from below. */
function passthrough(m: ManifoldToplevel, d: Derived, bay: Bay): Manifold | null {
  if (!d.passthrough) return null;
  const w = Math.max(d.cableW, leadBore(d).w);
  const y0 = bodyY0(d, bay) - 1;
  const y1 = bodyY0(d, bay) + faceX(d, 0);
  const notch = m.Manifold.cube([w, y1 - y0, d.lipH + 4], true).translate([
    bay.cx,
    (y0 + y1) / 2,
    bay.cz + d.plateT + (d.lipH - d.plateT) / 2,
  ]);
  // The drop lands within a millimetre or two of where the foot stops, so
  // whether it fouls depends on the dovetail stop. Cheaper to clear it always.
  const gap = footGap(m, d, bay, passDropY(d));
  return gap ? notch.add(gap) : notch;
}


/**
 * The phone stand: a leaning slab on a plate, with two tabs to stand on.
 *
 * There was a time when this was three stands -- a slot cradle the phone
 * dropped into, a ribbed wedge, and this. They were genuinely different
 * objects rather than three settings of one, which is why they cost three
 * profiles, three charging routes and about half the controls on the panel.
 * One stand, done properly, is the better trade.
 */
// --------------------------------------------------------------- the ring
//
// The plain one: a rounded panel standing on a foot, with a round window
// through it. The charger drops into the window from BEHIND and is held by a
// thin lip left round the front, so its face ends up all but flush with the
// panel and the magnets have nothing but that lip between them and the phone.
// The phone leans on the panel and stands on a small lip at the bottom.
//
// It is the same idea as the rest, stripped: no well, no blind pocket, no bore
// threaded out of the back. The lead comes out of the window through a slot
// straight down the panel, which is the one feature of the reference object
// that looks like decoration and is not.

/**
 * The panel's front elevation: square sides, a round top.
 *
 * The side profile is extruded across the width, so on its own the panel comes
 * out a plain rectangle with four square corners. This is the silhouette,
 * swept through the part along the depth: everything below the arc keeps the
 * full width, so the plate and the lip pass through it untouched.
 */
function ringMask(m: ManifoldToplevel, d: Derived, bay: Bay): Manifold {
  const w = bodyW(bay) - 2 * d.clear;
  const top = bay.cz + d.plateT + Math.max(d.standH - d.plateT, 10);
  const r = w / 2;
  const straight = Math.max(1, top - bay.cz - r);
  const cs = m.CrossSection.union([
    m.CrossSection.square([w, straight], true).translate([bay.cx, bay.cz + straight / 2]),
    m.CrossSection.circle(r, 96).translate([bay.cx, bay.cz + straight]),
  ]);
  // Along the depth, far enough either side to be a silhouette and not a cut.
  return m.Manifold.extrude(cs, bodyD(d, bay) + 40)
    .rotate([90, 0, 0])
    .translate([0, bodyY0(d, bay) + bodyD(d, bay) + 20, 0]);
}

/**
 * The window through the panel, the shelf the charger sits on, and the slot
 * its lead comes out of.
 *
 * Bored along the panel's own NORMAL rather than horizontally: a puck is a
 * flat disc and it has to seat flat, and a horizontal bore through a panel
 * leaning fifteen degrees gives it an ellipse to sit in.
 */
function ringWindow(m: ManifoldToplevel, d: Derived, bay: Bay): Manifold {
  const [fy, fz] = faceWorld(d, bay, d.puckH);
  // +Z turned to point along the face's outward normal, so cutting INTO the
  // panel is the negative direction along it.
  const axis: [number, number, number] = [90 - d.lean, 0, 0];
  const deep = d.restT + 12;
  // The seat, and the shoulder the charger sits down on behind it. See
  // `puckRing`: the recess opens on the FRONT, which is the whole point.
  // Seated from behind, the puck is held by nothing but friction and drops
  // out of the back of the panel the first time the stand is picked up. From
  // the front it cannot go anywhere -- the shoulder is behind it and the
  // phone is in front.
  const { outer: rOuter, inner: rInner } = puckRing(d);

  // The window through the back, at the shoulder's diameter: it saves the
  // material, it lets the charger be pushed back out with a thumb, and it is
  // what makes the panel read as a ring rather than a dish.
  const through = m.Manifold.cylinder(2 * deep, rInner, rInner, 96, true)
    .rotate(axis)
    .translate([bay.cx, fy, fz]);

  // The charger's seat, sunk into the FRONT face to its own thickness and
  // stopped short of the back by the shoulder.
  const seatDeep = Math.min(d.puckT + d.clear, Math.max(1, d.restT - Math.max(0.8, d.minPlate)));
  const seat = d.wireless
    ? m.Manifold.cylinder(seatDeep + 1, rOuter, rOuter, 96)
        .translate([0, 0, -seatDeep])
        .rotate(axis)
        .translate([bay.cx, fy, fz])
    : null;

  // The lead's way out, which no longer shows on the front at all.
  //
  // It used to run from the seat DOWN the panel and stick out below the circle
  // as a little tab, which is the first thing you saw. It never needed to. The
  // lead comes off the charger's rim and has to reach the back of the panel,
  // and the back of the panel is right there -- the window is only a shoulder's
  // width away. So this is a radial notch across the SHOULDER: from inside the
  // window out to the seat's wall, no further. The lead lies in it under the
  // puck's own rim, drops into the window and hangs down the back.
  //
  // It starts inside the window rather than at its edge because the seat is a
  // recess and the window is a hole. A notch that only reached the seat would
  // be a second hole through the panel with the lead's way out inside it, and
  // a wider shoulder is exactly what turns one into the other: it moves the
  // window in from under the notch while the seat stays where it is.
  const cut: Manifold[] = seat ? [through, seat] : [through];
  if (seat && rOuter > rInner + 0.5) {
    const top = rInner - 2;
    const mid = (top + rOuter) / 2;
    const [sy, sz] = faceWorld(d, bay, d.puckH - mid * Math.cos(rad(d.lean)));
    cut.push(
      m.Manifold.cube([Math.max(d.cableW, 4), 2 * deep, rOuter - top], true)
        .rotate([-d.lean, 0, 0])
        .translate([bay.cx, sy, sz]),
    );
  }

  return m.Manifold.union(cut);
}

/**
 * The clip on the back of the panel, which is where the lead actually goes.
 *
 * A ring hands the charger's lead out of a short slot below the window and
 * lets it hang down the back. That is a route on paper and a loose cable in
 * practice, so it gets caught once on the way down.
 *
 * **It opens BACKWARD.** Two arms with a return lip on each and a mouth
 * between them narrower than the lead: press the cable in from behind and the
 * lips let it past and close behind it. Nothing is threaded, which is the
 * whole reason to build a clip rather than a hole -- the far end of that lead
 * has a plug on it, and every closed aperture in this generator has to be
 * sized for the plug rather than the cable, which makes all of them far bigger
 * than a cable ever needed.
 *
 * **It stands upright, not square to the panel.** Everything else on this
 * stand is built in the panel's own leaning frame and the clip is the one
 * thing that must not be: a cable hanging off the back hangs straight down,
 * and a channel square to a leaning face does not. Upright, the section is
 * constant in Z, so there is not one overhanging face on it -- bar its
 * underside, which `clipSpec` sizes the whole bracket around.
 *
 * **Two planes finish it.** The panel runs away rearward as it rises, so the
 * clip is trimmed at the front by the back face itself, offset inward by the
 * bite so the two solids overlap rather than share a plane. Without that trim
 * a steep lean sends the clip's front out through the FRONT of the panel. And
 * the underside is cut back to 45 degrees off the face at the clip's foot,
 * which is the steepest cantilever a printer can start in mid-air.
 */
function cableClip(m: ManifoldToplevel, d: Derived, bay: Bay): Manifold | null {
  const spec = clipSpec(d);
  if (!spec) return null;
  const { w, t, mouth, wall, h } = spec;

  const y = (at: number) => backX(d, at) + bodyY0(d, bay);
  const yBot = y(d.clipZ); // the back face at the clip's foot
  const yCh = y(d.clipZ + h); // ...and at its head, which is where the channel goes
  const z0 = bay.cz + d.plateT + d.clipZ;
  const bite = 0.6;
  const wide = w + 2 * wall + 4;

  // Upright boxes, all of them a millimetre proud at each end so the cuts pass
  // clean through; the clip is squared off to its own height afterwards.
  const box = (wx: number, y0: number, y1: number, r: number) =>
    m.Manifold.extrude(roundedRect(m, wx, y1 - y0, r), h + 2).translate([
      bay.cx,
      (y0 + y1) / 2,
      z0 - 1,
    ]);

  let clip = box(w + 2 * wall, yBot - bite, yCh + t + wall, Math.min(1.2, wall))
    .subtract(box(w, yCh, yCh + t, 0.5))
    .subtract(box(mouth, yCh + t - 0.5, yCh + t + wall + 2, 0))
    .intersect(
      m.Manifold.cube([wide, 4 * spec.reach + 40, h], false).translate([
        bay.cx - wide / 2,
        yBot - bite,
        z0,
      ]),
    );

  const S = 8 * (h + spec.reach) + 80;
  // A cube dropped so its top face is the Z = 0 plane and then turned 45
  // degrees about X is the half-space z <= y. Landed on the back face at the
  // clip's foot, that is exactly the material that would print on nothing.
  clip = clip.subtract(
    m.Manifold.cube([wide, S, S], true)
      .translate([0, 0, -S / 2])
      .rotate([45, 0, 0])
      .translate([bay.cx, yBot, z0]),
  );

  // And the back face itself, as a plane: in front of it the clip is inside
  // the panel, which is the panel's business and not the clip's.
  return clip.subtract(
    m.Manifold.cube([wide, S, S], true)
      .translate([0, -bite - S / 2, 0])
      .rotate([-d.lean, 0, 0])
      .translate([bay.cx, y(0), bay.cz + d.plateT]),
  );
}

function buildRing(m: ManifoldToplevel, d: Derived, bay: Bay): Manifold {
  // The same side elevation the rest uses, with a full lip: what makes it a
  // ring is the silhouette it is trimmed to and the hole through it, not a
  // second way of standing a slab on a plate.
  const solid = place(m, profile(m, d, bay, 'full'), d, bay).intersect(ringMask(m, d, bay));
  const clip = cableClip(m, d, bay);
  // The clip goes on BEFORE the window is cut, not after. Put a low charger
  // on a short panel and the lead slot comes down far enough to reach the
  // clip, and a clip added last plugs the slot exactly where the lead was
  // supposed to come out of it -- the slot stops being part of the window and
  // becomes a second closed hole with the cable's way out inside it.
  return (clip ? solid.add(clip) : solid)
    .add(moduleFoot(m, d, bay))
    .subtract(ringWindow(m, d, bay));
}

export function buildStand(m: ManifoldToplevel, d: Derived, bay: Bay): Manifold {
  if (d.standStyle === 'ring') return buildRing(m, d, bay);
  let solid = place(m, profile(m, d, bay), d, bay).add(moduleFoot(m, d, bay));
  const tabs = lipTabs(m, d, bay);
  if (tabs) solid = solid.add(tabs);

  // Cut the charging last. Both cuts reach into the plate the foot is part of,
  // and a foot unioned on afterwards would fill the cable's way out again.
  const charge = charger(m, d, bay);
  if (charge) solid = solid.subtract(charge);
  const pass = passthrough(m, d, bay);
  if (pass) solid = solid.subtract(pass);

  return solid;
}
