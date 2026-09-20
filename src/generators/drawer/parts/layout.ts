import type { Derived } from '../geometry';

/**
 * Where the moving parts meet, in the assembled frame.
 *
 * One module, because the cam groove in the tray's underside and the follower
 * on the deck below it are two parts of two different prints that have to agree
 * to a tenth of a millimetre. Working either of them out twice is how they stop
 * agreeing.
 *
 * Frame: x centred, the carcass front at -D/2 and its back at +D/2, z = 0 at
 * the floor of ONE drawer's opening -- every part here is modelled tier-local
 * and lifted to its tier by the caller. The bay the latch lives in is the
 * bottom `bayH` of that opening; the tray sits on top of it. The tray is drawn
 * in its CLOSED position.
 */

/** Y of the inner face of the carcass back wall. */
export function backY(d: Derived): number {
  return d.D / 2 - d.wall;
}

/**
 * Y of the tray body's front face when the latch is holding it shut.
 *
 * NOT flush with the carcass. A push latch is pressed IN to release, and the
 * face plate laps over the opening by more than it laps the carcass edge -- so
 * flush leaves the overtravel nowhere to go and the whole mechanism is dead
 * against the front of the box before the pin ever reaches the notch. It stands
 * proud by the overtravel plus a clearance, which is also why a push-to-open
 * drawer front in the shops never sits quite flush either.
 */
export function frontY(d: Derived): number {
  return -d.D / 2 - d.standoff;
}

/** Y of the tray's back face when shut. The same overtravel, at the other end. */
export function trayBackY(d: Derived): number {
  return backY(d) - d.backGap;
}

/**
 * Y of the follower's pin. It never moves: the deck is rooted on the back wall
 * and this is how far forward of it the pin reaches.
 */
export function pinY(d: Derived): number {
  return backY(d) - d.reach;
}

/**
 * Y of the cam pattern's origin (u = 0, the rest position) when shut.
 *
 * The notch is `pop` in from the rest position and the pin sits in the notch
 * when the drawer is shut -- that is what "shut" means for a push latch -- so
 * the origin is `pop` behind the pin.
 */
export function camOriginY(d: Derived): number {
  return pinY(d) + d.pop;
}

/** Front and back edges of the latch deck, which is rooted on the back wall. */
export function deckSpan(d: Derived): readonly [number, number] {
  const y1 = backY(d);
  return [y1 - d.deckD, y1] as const;
}

/**
 * Y of the blind end of the ejector tunnel -- the face the ejector actually
 * pushes on, and the only backward-facing surface the tray owns down here.
 */
export function ejectFaceY(d: Derived): number {
  return backY(d) - d.springGap;
}

/**
 * The rearmost point of the cam pattern: the mouth of the lead-in funnel.
 *
 * Pulling the drawer out runs the pin toward the funnel and out of the cam
 * altogether, so everything behind this point is plain relief rather than
 * groove.
 */
export function funnelY(d: Derived): number {
  return camOriginY(d) + d.lead;
}
