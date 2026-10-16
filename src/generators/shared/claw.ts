import type { CrossSection, Manifold } from 'manifold-3d';
import { bar, box, cylinder, cylinderY, rect, slabXZ, type M, type P2 } from './solid';

/** Chain: its thickness, and the C-hook's bars. */
const CHAIN_T = 1.6;
const HOOK_BAR = 1.4;
const HOOK_GAP = 0.3;
/** The hub the talons hang from, and the peg the chain pushes into it with. */
const HUB_R = 5;
const HUB_H = 6;
const PEG_L = 4;
/** Talons: their thickness, the lugs either side, the pivot out from the axis. */
const TALON_T = 2;
const LUG_T = 1.2;
const PIVOT_R = 5.6;
const PIVOT_DOWN = 2.6;

/**
 * A claw hanging from a bar on a chain: a C-hook over the bar, a chain down
 * from it, a hub, and three talons each on its own pin, so the claw opens
 * and closes. The bar runs along y; its centre line is at (barX, barZ), and
 * it is barW wide and barH tall. The chain hangs in the plane y = y0.
 */
export interface ClawSpec {
  readonly barX: number;
  readonly barZ: number;
  readonly barW: number;
  readonly barH: number;
  readonly y: number;
  /** Chain length from under the bar to the top of the hub. */
  readonly drop: number;
  readonly c: number;
  readonly pinD: number;
}

/** Where the hub sits, the talons' azimuths, and each talon's pivot. */
export function clawLayout(s: ClawSpec) {
  const hookBottom = s.barZ - s.barH / 2 - HOOK_GAP - HOOK_BAR;
  const hubTop = hookBottom - s.drop;
  const hubBottom = hubTop - HUB_H;
  const azimuths = [90, 210, 330];
  const pivots = azimuths.map((a) => {
    const r = (a * Math.PI) / 180;
    return { azimuth: a, x: s.barX + PIVOT_R * Math.cos(r), y: s.y + PIVOT_R * Math.sin(r), z: hubBottom - PIVOT_DOWN };
  });
  return { hookBottom, hubTop, hubBottom, pivots, x: s.barX, y: s.y };
}

/**
 * The C-hook and chain, as one flat piece in the (x, z) plane: the hook
 * slides onto its bar from the side and hangs there; the chain's links show
 * edge-on and face-on by turns; a peg at the bottom pushes into the hub.
 * Prints flat.
 */
export function buildClawChain(m: M, s: ClawSpec): Manifold {
  const L = clawLayout(s);
  const x0 = s.barX - s.barW / 2 - HOOK_GAP;
  const x1 = s.barX + s.barW / 2 + HOOK_GAP;
  const z0 = s.barZ - s.barH / 2 - HOOK_GAP;
  const z1 = s.barZ + s.barH / 2 + HOOK_GAP;
  const B = HOOK_BAR;
  // A C open on the +x side: top, back and bottom.
  const parts: CrossSection[] = [
    rect(m, x0 - B, x1 + B * 0.6, z1, z1 + B),
    rect(m, x0 - B, x0, z0 - B, z1 + B),
    rect(m, x0 - B, x1 + B * 0.6, z0 - B, z0),
  ];
  // Links down to the hub.
  const top = z0 - B;
  const link = 3.2;
  const n = Math.max(1, Math.floor(s.drop / link));
  const pitch = s.drop / n;
  for (let i = 0; i < n; i++) {
    const a = top - i * pitch;
    if (i % 2 === 0) {
      parts.push(rect(m, s.barX - 1.2, s.barX + 1.2, a - pitch - 0.2, a + 0.2).subtract(rect(m, s.barX - 0.5, s.barX + 0.5, a - pitch + 0.8, a - 0.8)));
    } else {
      parts.push(rect(m, s.barX - 0.5, s.barX + 0.5, a - pitch - 0.2, a + 0.2));
    }
  }
  // The links stop just above the hub; only the peg goes into it.
  const chain = m.CrossSection.union(parts).intersect(rect(m, x0 - 10, x1 + 10, L.hubTop + 0.1, z1 + 10));
  const peg = rect(m, s.barX - CHAIN_T / 2, s.barX + CHAIN_T / 2, L.hubTop - PEG_L, L.hubTop + 0.3);
  return slabXZ(m, m.CrossSection.union([chain, peg]), s.y - CHAIN_T / 2, s.y + CHAIN_T / 2);
}

/** A talon's lugs in its own frame: the plane y = 0, r out along +x from the axis, z up. */
function talonLugs(m: M, s: ClawSpec, hubBottom: number): Manifold {
  const plate = m.CrossSection.hull([
    m.CrossSection.circle(2.2, 24).translate([PIVOT_R, hubBottom - PIVOT_DOWN]),
    rect(m, 2.5, PIVOT_R + 1.5, hubBottom - 0.5, hubBottom + 0.5),
  ]);
  const g = TALON_T / 2 + s.c;
  return m.Manifold.union([slabXZ(m, plate, g, g + LUG_T), slabXZ(m, plate, -g - LUG_T, -g)]);
}

/** Place a solid built in a talon's own frame at the claw, turned to its azimuth. */
function place(solid: Manifold, x: number, y: number, azimuth: number): Manifold {
  return solid.rotate([0, 0, azimuth]).translate([x, y, 0]);
}

/**
 * The hub: a drum with the chain's socket in its top and a pair of lugs
 * under it for each talon. Prints upside down, lugs up.
 */
export function buildClawHub(m: M, s: ClawSpec): Manifold {
  const L = clawLayout(s);
  const parts: Manifold[] = [cylinder(m, HUB_R, L.x, L.y, L.hubBottom, L.hubTop)];
  // A collar round the top, flush with it: upside down on the bed it is the first layers.
  parts.push(cylinder(m, HUB_R + 0.8, L.x, L.y, L.hubTop - 1.6, L.hubTop));
  for (const p of L.pivots) parts.push(place(talonLugs(m, s, L.hubBottom), L.x, L.y, p.azimuth));
  let hub = m.Manifold.union(parts);
  const holes: Manifold[] = [box(m, L.x - CHAIN_T / 2 - s.c / 2, L.x + CHAIN_T / 2 + s.c / 2, L.y - CHAIN_T / 2 - s.c / 2, L.y + CHAIN_T / 2 + s.c / 2, L.hubTop - PEG_L - 0.5, L.hubTop + 1)];
  for (const p of L.pivots) {
    const r = s.pinD / 2 + s.c;
    holes.push(place(cylinderY(m, r, PIVOT_R, L.hubBottom - PIVOT_DOWN, -5, 5), L.x, L.y, p.azimuth));
  }
  hub = hub.subtract(m.Manifold.union(holes));
  return hub;
}

/**
 * One talon: a knuckle on its pin and a curved claw reaching down and in,
 * built hanging open a little. Prints flat.
 */
export function buildTalon(m: M, s: ClawSpec, i: number): Manifold {
  const L = clawLayout(s);
  const p = L.pivots[i]!;
  const pz = L.hubBottom - PIVOT_DOWN;
  const pts: P2[] = [[PIVOT_R, pz], [PIVOT_R + 3.2, pz - 4.5], [PIVOT_R + 3.4, pz - 9], [PIVOT_R + 1.6, pz - 13], [PIVOT_R - 1.4, pz - 15]];
  const segs: CrossSection[] = [m.CrossSection.circle(2.1, 24).translate([PIVOT_R, pz])];
  for (let k = 0; k + 1 < pts.length; k++) segs.push(bar(m, pts[k]!, pts[k + 1]!, 2.6 - k * 0.35));
  const profile = m.CrossSection.union(segs);
  const talon = slabXZ(m, profile, -TALON_T / 2, TALON_T / 2)
    .subtract(cylinderY(m, s.pinD / 2 + s.c, PIVOT_R, pz, -3, 3));
  return place(talon, L.x, L.y, p.azimuth);
}

/** A talon's pin, across its lugs, head on the outside. */
export function buildTalonPin(m: M, s: ClawSpec, i: number): Manifold {
  const L = clawLayout(s);
  const p = L.pivots[i]!;
  const pz = L.hubBottom - PIVOT_DOWN;
  const reach = TALON_T / 2 + s.c + LUG_T;
  const r = s.pinD / 2;
  const pin = m.Manifold.union([
    cylinderY(m, r, PIVOT_R, pz, -reach, reach + 0.1),
    cylinderY(m, r + 0.9, PIVOT_R, pz, reach, reach + 0.9),
  ]);
  return place(pin, L.x, L.y, p.azimuth);
}

/** The talon's axis, for turning it in tests: a point on it, and its azimuth. */
export function talonAxis(s: ClawSpec, i: number) {
  const L = clawLayout(s);
  const p = L.pivots[i]!;
  return { x: p.x, y: p.y, z: p.z, azimuth: p.azimuth };
}

/**
 * Print orientations, for a talon or pin turned to `azimuth`: a talon's plane
 * laid flat, and a pin standing on its head. A talon's thickness runs along
 * (-sin a, cos a); turning about x by 90 and then about y by a stands that
 * straight up.
 */
export function talonOrientation(azimuth: number): [number, number, number] {
  return [90, azimuth, 0];
}
export function talonPinOrientation(azimuth: number): [number, number, number] {
  return [-90, -azimuth, 0];
}
