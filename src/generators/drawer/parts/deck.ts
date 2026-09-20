import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import { roundedRect } from '../../../core/kernel/primitives';
import type { Derived } from '../geometry';
import { backY, deckSpan, pinY } from './layout';

/**
 * The latch deck: a flat plate that fills the bay behind the tray, with the
 * cam follower cut out of it as a leaf spring.
 *
 * This is the part that replaces the bent paperclip, and the reason it can is
 * that it lies FLAT. The follower has to be two springs at once -- soft
 * sideways, so the cam can throw the pin from one apex to the other, and stiff
 * downward, so the pin stays in the groove while it climbs the one-way steps --
 * and a beam cut out of a plate is exactly that. Its cross-section is `beamRoot`
 * across (1.4 mm) by `deckT` tall (3 mm), and a beam's stiffness goes as the
 * square of the dimension you are bending: sideways it is about five times the
 * softer axis. One arm, two stiffnesses, no wire.
 *
 * It also settles the print. Lying flat, the beam bends IN THE LAYER PLANE --
 * every fibre is loaded along its own length, never peeled off the layer below.
 * Stand the same beam up and it is a stack of discs asked to bend, which is the
 * one thing FDM will not do twice.
 *
 * The plan is a straight taper, not a rectangle, for two reasons that happen to
 * agree. A cantilever narrowing toward its tip spreads the strain along its
 * whole length instead of piling it at the root; and the relief it needs to
 * swing in is proportional to how far it has already swung, so the gap either
 * side can start at a slit and open out. What you get is a diagonal cut ending
 * in a round hole -- the hole is not decoration, it is the only thing standing
 * between a sharp inside corner and a crack.
 */

/** A trapezoid: the hull of two thin rectangles, so no winding to get wrong. */
function taper(
  m: ManifoldToplevel,
  wBack: number,
  yBack: number,
  wFront: number,
  yFront: number,
): CrossSection {
  return m.CrossSection.hull([
    m.CrossSection.square([wBack, 0.01], true).translate([0, yBack]),
    m.CrossSection.square([wFront, 0.01], true).translate([0, yFront]),
  ]);
}

/**
 * The window the beam swings in, as a 2D region.
 *
 * Opens out along the beam because the beam's deflection does: at the root it
 * is a slit, at the tip it is the full throw and then some. Terminated at the
 * root by two relief holes rather than by the corners of a slot.
 */
function window2d(m: ManifoldToplevel, d: Derived): CrossSection {
  const [y0, y1] = deckSpan(d);
  const yRoot = y1 - d.beamRootSet;
  const yPin = pinY(d);
  const half = d.padW / 2 + d.beamThrow + 1;

  return m.CrossSection.union([
    // Root to pin: a slit that opens into the swing.
    taper(m, d.beamRoot + 2 * d.slitW, yRoot, 2 * half, yPin),
    // Pin to the front edge, at full width, running off the end of the plate.
    m.CrossSection.square([2 * half, yPin - y0 + 2], true).translate([0, (yPin + y0 - 2) / 2]),
    // The relief holes, tangent to the beam's own edges.
    ...[-1, 1].map((s) =>
      m.CrossSection.circle(d.reliefD / 2, 32).translate([
        s * (d.beamRoot / 2 + d.reliefD / 2),
        yRoot,
      ]),
    ),
  ]);
}

/**
 * Lightening holes in the two arms.
 *
 * The arms are only there to reach the rails, and at full width that is most of
 * the plate: solid, the deck came out heavier than the tray's front. Left as a
 * border, they still tie the beam's root to both walls, which is the one
 * structural job they have.
 */
function lightening(m: ManifoldToplevel, d: Derived): CrossSection | null {
  const [y0, y1] = deckSpan(d);
  const border = 4;
  const inner = d.padW / 2 + d.beamThrow + 1 + border;
  const outer = d.deckW / 2 - border;
  const w = outer - inner;
  const h = d.deckD - 2 * border;
  if (w < 12 || h < 8) return null;
  return m.CrossSection.union(
    [-1, 1].map((s) =>
      roundedRect(m, w, h, 3).translate([s * (inner + w / 2), (y0 + y1) / 2]),
    ),
  );
}

/** The beam itself: a taper onto a paddle that carries the pin. */
function beam2d(m: ManifoldToplevel, d: Derived): CrossSection {
  const [y0, y1] = deckSpan(d);
  const yPad = y0 + d.padL;
  return m.CrossSection.union([
    taper(m, d.beamRoot, y1, d.beamTip, yPad),
    roundedRect(m, d.padW, d.padL + 0.4, d.padW * 0.35).translate([0, y0 + d.padL / 2]),
  ]);
}

/**
 * The pin: a stub standing off the paddle, up into the cam groove.
 *
 * It points UP because the cam is above it -- the groove is cut into the tray's
 * underside and the deck lies in the bay below. Long enough that with the beam
 * unstressed it would reach ABOVE the deepest floor of the groove, so assembled
 * it is always bowed a little downward and always pressing up. A pin that
 * merely touches is a pin that drops out the first time it meets a step.
 */
function pin(m: ManifoldToplevel, d: Derived): Manifold {
  const r = d.pinD / 2;
  const tip = 0.6;
  // Sunk into the paddle rather than stood on it. Butted, the two have no
  // shared volume for Manifold to weld and the deck comes back as two bodies
  // that merely touch -- a pin that falls off in the slicer.
  const sink = 0.6;
  const base = d.deckZ + d.deckT - sink;
  const h = d.pinLen + sink;
  return m.Manifold.union([
    // Overlapping, not stacked: two cylinders that merely share a face are two
    // bodies, and the cone is small enough to vanish in the slicer as one.
    m.Manifold.cylinder(h - tip + 0.2, r, r, 32).translate([0, 0, base]),
    // Tapered at the very top, so the pin finds the funnel rather than catching
    // its shoulder on the lip of it.
    m.Manifold.cylinder(tip, r, r * 0.6, 32).translate([0, 0, base + h - tip]),
  ]).translate([0, pinY(d), 0]);
}

/**
 * One tier's latch deck, modelled tier-local with the pin standing UP.
 *
 * Slides into a rail groove in each side wall from the open front of the
 * carcass, back until it butts the back wall, and snaps past a bump in the
 * rails that keeps it there. It lies in the bay under the tray, so the rails
 * are at the bottom of the opening rather than just under the slides.
 */
export function buildDeck(m: ManifoldToplevel, d: Derived): Manifold | null {
  if (!d.latch || d.follower !== 'printed') return null;

  const [y0, y1] = deckSpan(d);
  const plate = roundedRect(m, d.deckW, d.deckD, 1.5).translate([0, (y0 + y1) / 2]);
  const holes = lightening(m, d);
  let section = plate.subtract(window2d(m, d));
  if (holes) section = section.subtract(holes);
  section = section.add(beam2d(m, d).intersect(plate));

  return m.Manifold.extrude(section, d.deckT).translate([0, 0, d.deckZ]).add(pin(m, d));
}

/** Free length of the beam, for the readouts and the strain check. */
export function beamFree(d: Derived): number {
  return d.reach - d.padL - d.beamRootSet;
}

/** Where the deck's rails have to be cut, so the carcass and the deck agree. */
export function railBounds(d: Derived): {
  readonly halfW: number;
  readonly z0: number;
  readonly z1: number;
  readonly frontY: number;
} {
  return {
    halfW: d.W / 2 - d.sideT + d.railD,
    z0: d.deckZ - d.clear,
    z1: d.deckZ + d.deckT + d.clear,
    frontY: backY(d) - d.deckD,
  };
}
