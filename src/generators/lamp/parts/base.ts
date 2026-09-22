import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import { segmentsForRadius } from '../../../core/kernel/primitives';
import { baseInnerRadius, baseRadius, type Derived } from '../geometry';

/**
 * The base as a closed 2D section, ready to revolve: x is radius, y is height.
 *
 * Walked counter-clockwise -- out across the foot, up the outside, over the
 * deck and in to the socket hole, then back down the inside. A shell, open
 * underneath: the cord, the holder and your fingers all have to get in there.
 *
 * Three things in here are load-bearing rather than decorative:
 *
 *  - The deck's underside is a 45-degree cone. The deck is a plate with a hole
 *    in it, printed over thin air; growing it inward off the wall at 45 degrees
 *    means every layer lands on the one below and none of it is a bridge.
 *  - The wall is offset along its own NORMAL, not radially. On a cone leaning
 *    20 degrees a radial 2.4 mm is 2.25 mm of actual material, and the error
 *    grows with the taper -- which is the one control this shape is all about.
 *  - In the base mount the neck is not a number, it is the shade's hem. The
 *    collar takes the shade's outer radius so the two surfaces run flush, and
 *    the spigot takes its inner radius so the hem drops over it.
 */
export function baseProfile(m: ManifoldToplevel, d: Derived): CrossSection {
  const pts: [number, number][] = [];
  const rFootIn = Math.min(d.rFootIn, baseInnerRadius(d, d.footH) - 0.4);

  pts.push([rFootIn, 0], [d.rBase, 0]);

  // A straight cone needs two points, not fifty. Sampled only when there is a
  // waist to sample, which takes the base from 56,000 triangles to about 2,000
  // -- worth having in a model whose other part is already six figures.
  const steps = d.baseBelly === 0 ? 1 : 48;
  for (let i = 1; i <= steps; i++) {
    const z = (i / steps) * d.neckZ;
    pts.push([baseRadius(d, z), z]);
  }

  if (d.mount === 'base') {
    // The shoulder the shade's hem lands on, then the spigot it locates against.
    pts.push([d.rSpigot, d.neckZ], [d.rSpigot, d.deckZ]);
  }

  // Across the deck, down the hole, and back out underneath.
  //
  // The chamfer has to land ON the inner wall, at the radius that wall actually
  // has where the chamfer reaches it. Taking the radius at the DECK instead is
  // wrong by the taper over the chamfer's own height -- a few millimetres on a
  // raked cone -- and the inner wall then has to double back up to meet itself,
  // which is a profile that crosses its own edge and revolves into a solid with
  // a wedge of extra material buried in the neck. It still looks like a lamp.
  const zUnder = d.deckZ - d.deckT - d.chamfer;
  const rWallUnder = d.mount === 'base' ? d.rDeckIn : baseInnerRadius(d, zUnder);
  pts.push([d.rHole, d.deckZ], [d.rHole, d.deckZ - d.deckT]);
  pts.push([rWallUnder - d.chamfer, d.deckZ - d.deckT], [rWallUnder, zUnder]);

  if (d.mount === 'base') {
    // Down the inside of the spigot, then a 45-degree run back out to the
    // cone's own cavity. Stepping straight out would leave a ledge printed over
    // nothing, and with deep flutes at the hem that ledge is several mm wide.
    const rInNeck = baseInnerRadius(d, d.neckZ);
    const run = Math.max(0, Math.min(rInNeck - d.rDeckIn, zUnder - d.neckZ - 0.2));
    if (run > 0.05) pts.push([d.rDeckIn, d.neckZ + run]);
    pts.push([rInNeck, d.neckZ]);
  }

  // Down the inside, from wherever the top of the wall turned out to be: the
  // shoulder in the base mount, the foot of the deck chamfer in the ring mount.
  const zInnerTop = d.mount === 'base' ? d.neckZ : zUnder;
  for (let i = steps - 1; i >= 0; i--) {
    const z = d.footH + (i / steps) * (zInnerTop - d.footH);
    if (z >= zInnerTop - 0.001) continue;
    pts.push([baseInnerRadius(d, z), z]);
  }
  pts.push([rFootIn, d.footH]);

  return m.CrossSection.ofPolygons([pts], 'NonZero');
}

/**
 * The way out for the cord: an arch through the back of the foot.
 *
 * An arch rather than a rectangle because its top is the only unsupported thing
 * on the whole base. A flat-topped slot 8 mm wide is an 8 mm bridge printed
 * across a curved wall at the third layer, which droops into the hole it is
 * spanning; a semicircle never overhangs more than the layer below it.
 */
export function cordNotch(m: ManifoldToplevel, d: Derived): Manifold {
  const w = d.socket.cord + 1.6;
  const h = d.socket.cord + 2.6;
  const straight = Math.max(0.2, h - w / 2);
  const section = m.CrossSection.union([
    m.CrossSection.square([w, straight], true).translate([0, straight / 2]),
    m.CrossSection.circle(w / 2, 32).translate([0, straight]),
  ]);
  // Rotating +90 about X sends the section's own y to world z and the extrusion
  // to world -y, so the reach has to be given back afterwards. Aimed at +Y,
  // which is the back of the lamp -- the side the switch trails off.
  const reach = d.rBase * 2 + 20;
  return m.Manifold.extrude(section, reach)
    .rotate([90, 0, 0])
    .translate([0, reach, 0]);
}

export function baseSolid(m: ManifoldToplevel, d: Derived): Manifold {
  const body = m.Manifold.revolve(baseProfile(m, d), segmentsForRadius(d.rBase, 0.12));
  return body.subtract(cordNotch(m, d));
}
