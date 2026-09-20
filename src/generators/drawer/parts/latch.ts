import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { roundedRect, slot } from '../../../core/kernel/primitives';
import type { Derived } from '../geometry';
import { beamFree } from './deck';
import { backY } from './layout';

/**
 * The ejector, and -- for anyone who still wants the paperclip -- the gauge for
 * bending it.
 *
 * The ejector is the one place a printed part is doing a spring's job, which is
 * why there is a choice: a printed serpentine for people who want nothing but
 * plastic, and a pair of posts for an elastic band for people who want it to
 * still work next year.
 */

/**
 * A serpentine compression spring: a folded ribbon, printed on its side so it
 * flexes about the strong axis of the layers rather than trying to peel them.
 *
 * Printed flat and used on edge. This is the part most likely to want a second
 * go at a different thickness, which is why thickness is a control and not a
 * constant.
 */
export function buildSpring(m: ManifoldToplevel, d: Derived): Manifold | null {
  if (!d.latch || d.eject !== 'spring') return null;

  const n = Math.max(2, d.springTurns);
  const amp = d.springFree / (2 * n); // half-height of one fold
  const t = d.springT;
  const w = d.springW;

  const ribbons: Manifold[] = [];
  for (let i = 0; i < n; i++) {
    const y = i * 2 * amp;
    // Two legs and a turn: a squared-off S, repeated. Straight segments keep
    // the whole thing printable without a single unsupported span.
    ribbons.push(
      m.Manifold.cube([w, t, 1], true).translate([0, y + t / 2, 0]),
      m.Manifold.cube([t, 2 * amp, 1], true).translate([
        (i % 2 === 0 ? 1 : -1) * (w / 2 - t / 2),
        y + amp,
        0,
      ]),
    );
  }
  ribbons.push(m.Manifold.cube([w, t, 1], true).translate([0, n * 2 * amp + t / 2, 0]));

  // Built as a 1 mm-tall footprint and then given its real width, so the fold
  // pattern is worked out in 2D where it is easy to reason about.
  const flat = m.Manifold.union(ribbons);
  const section = flat.project();
  return m.Manifold.extrude(section, d.springSeatH - 1);
}

/**
 * Where the spring is modelled versus where the fold pattern is laid out.
 *
 * The pattern is worked out from the origin along +y, because that is the sane
 * frame for it; this is the shift that puts the finished part where it works --
 * inside the tunnel through the tray's floor, its back end on the seat against
 * the carcass wall. Shown at FREE length, so in the assembled view it laps into
 * the shut tray by exactly the amount it is compressed, which is the throw it
 * has stored.
 */
export function springSeat(d: Derived): readonly [number, number, number] {
  return [0, backY(d) - d.springFree, d.trayZ + d.tunnelFloor + d.clear + 0.5] as const;
}

/**
 * How far the wire's tip has to stand up off its arm.
 *
 * Straight out of the geometry: from the pivot in the boss up to the deepest
 * floor of the groove overhead. Guessed instead, it is either short of the
 * groove or bottomed out in it, and both of those feel like a latch that works
 * sometimes.
 */
function wireTip(d: Derived): number {
  return d.bayH + d.camDeep - d.wireZ;
}

/**
 * A gauge for bending the wire, for the paperclip follower only.
 *
 * A paperclip bent by eye is a latch that catches sometimes. This is a flat
 * plate with the wire's own path sunk into it: lay the wire in the channel,
 * bend it where the channel turns, and the arm comes out the right length for
 * the reach between the boss and the notch.
 */
export function buildTemplate(m: ManifoldToplevel, d: Derived): Manifold | null {
  if (!d.latch || d.follower !== 'wire') return null;

  const arm = d.reach;
  const leg = d.wireD * 8;
  const tip = wireTip(d);
  const pad = 6;
  const w = arm + 2 * pad;
  const h = leg + tip + 2 * pad;
  const t = 3;

  const plate = m.Manifold.extrude(roundedRect(m, w, h, 2), t);

  const chan = (len: number, deg: number, cx: number, cy: number) =>
    m.Manifold.extrude(slot(m, len, d.wireD + 0.3), d.wireD * 0.7)
      .rotate([0, 0, deg])
      .translate([cx, cy, t - d.wireD * 0.7]);

  // The developed wire, laid out flat: leg, arm, tip. Bend at each corner.
  const x0 = -w / 2 + pad;
  const y0 = -h / 2 + pad;
  const channels = m.Manifold.union([
    chan(leg, 90, x0, y0 + leg / 2),
    chan(arm, 0, x0 + arm / 2, y0 + leg),
    chan(tip, 90, x0 + arm, y0 + leg + tip / 2),
  ]);

  // Corner posts to bend around, sized so the wire takes a real radius rather
  // than being kinked and snapped.
  const post = (cx: number, cy: number) =>
    m.Manifold.cylinder(t + d.wireD * 2, d.wireD, d.wireD, 24).translate([cx, cy, 0]);

  return plate
    .subtract(channels)
    .add(post(x0 + d.wireD * 1.6, y0 + leg))
    .add(post(x0 + arm, y0 + leg + d.wireD * 1.6));
}

/** The wire, described for the readout, since it is the one part nobody prints. */
export function wireSpec(d: Derived): string {
  const arm = d.reach;
  const leg = d.wireD * 8;
  const tip = wireTip(d);
  return (
    `${d.wireD} mm spring steel or a straightened paperclip, ` +
    `${(leg + arm + tip).toFixed(0)} mm long: ` +
    `${leg.toFixed(0)} mm leg, bend 90, ${arm.toFixed(0)} mm arm, bend 90, ${tip.toFixed(0)} mm tip. ` +
    `Print the bending gauge and lay the wire in its channel.`
  );
}

/** The printed follower, described the same way -- nothing to buy. */
export function followerSpec(d: Derived): string {
  const free = beamFree(d);
  const strain = (3 * d.beamRoot * d.beamThrow) / (2 * free * free);
  return (
    `Printed leaf spring: ${free.toFixed(0)} mm of beam, ` +
    `${d.beamRoot.toFixed(1)} mm at the root tapering to ${d.beamTip.toFixed(1)} mm, ` +
    `in a ${d.deckT.toFixed(1)} mm plate. ` +
    `${(strain * 100).toFixed(1)}% strain at full throw. PETG.`
  );
}
