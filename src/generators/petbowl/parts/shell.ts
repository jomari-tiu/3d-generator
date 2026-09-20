import type { CrossSection, Manifold } from 'manifold-3d';
import type { BuildCtx } from '../../../core/params/types';
import { roundedRect, segmentsForRadius } from '../../../core/kernel/primitives';
import { bowlSolid, WRAP_FIDELITY, wrapToWall, type Derived } from '../geometry';

/** A rounded triangle, flat-bottomed: one cat ear, laid out flat. */
function earSection(ctx: BuildCtx, d: Derived): CrossSection {
  const { m } = ctx;
  const w = d.earW;
  const h = d.earH;
  // Small. Offsetting a triangle by a third of its height rounds it into a
  // diamond -- the apex and both base corners all merge and nothing about it
  // reads as an ear any more.
  const r = Math.min(w, h) * 0.11;
  // Inset by the corner radius, then offset back out, so all three corners come
  // out rounded rather than only the two that a rounded rect would give.
  return m.CrossSection.ofPolygons(
    [
      [
        [-w / 2 + r, r],
        [w / 2 - r, r],
        [0, h - r],
      ],
    ],
    'NonZero',
  ).offset(r, 'Round', 2, 32);
}

/** An arch: a rectangle with a semicircular top, centred on z = 0. */
function archSection(ctx: BuildCtx, d: Derived): CrossSection {
  return roundedRect(ctx.m, d.archW, d.archH * 2, d.archW / 2);
}

/**
 * The bowl shell, with everything that changes its silhouette: cat ears added,
 * dog leg arches and carry handles taken away.
 *
 * Every one of those is a decal wrapped onto the cone, which is what lets them
 * follow a tapered wall. Ears reach INTO the wall as well as above the rim, so
 * the union has real depth of engagement instead of a tangent kiss.
 */
export function buildShell(ctx: BuildCtx, d: Derived): Manifold {
  const { m } = ctx;
  let shell = bowlSolid(m, d);

  if (d.ears) {
    const section = earSection(ctx, d);
    for (const sign of [-1, 1]) {
      shell = shell.add(
        wrapToWall(m, d, section.translate([0, d.earBaseZ]), {
          // Reaches from the outer surface inward past the wall, so it joins the
          // rim through solid material.
          from: -d.earT,
          to: 0,
          atDeg: 180 + sign * d.earSpreadDeg,
          fidelity: WRAP_FIDELITY,
        }),
      );
    }
  }

  if (d.legs > 0 && d.archW > 0.5 && d.archH > 0.5) {
    const section = archSection(ctx, d);
    const cutters: Manifold[] = [];
    for (let i = 0; i < d.legs; i++) {
      // Arches sit BETWEEN the legs: offset by half a step so a leg lands at
      // the front, which is what carries the weight when a dog pushes the bowl.
      const at = ((i + 0.5) * 360) / d.legs;
      cutters.push(
        wrapToWall(m, d, section, {
          from: -d.wall * 3 - 4,
          to: 4,
          atDeg: at,
          fidelity: WRAP_FIDELITY,
        }),
      );
    }
    shell = shell.subtract(m.Manifold.union(cutters));
  }

  if (d.handles && d.handleW > 1 && d.handleH > 1) {
    const slot = roundedRect(m, d.handleW, d.handleH, d.handleH / 2).translate([0, d.handleZ]);
    const cutters: Manifold[] = [];
    for (const at of [90, 270]) {
      cutters.push(
        wrapToWall(m, d, slot, { from: -d.wall * 3 - 4, to: 4, atDeg: at, fidelity: WRAP_FIDELITY }),
      );
    }
    shell = shell.subtract(m.Manifold.union(cutters));
  }

  return shell;
}

/**
 * The non-slip foot: a ring that sits in a recess turned into the bottom face.
 *
 * Its own part and its own material -- this is the one piece that wants to be
 * TPU, and a rigid bowl on a hard floor is a bowl that travels across the room.
 */
export function buildFoot(ctx: BuildCtx, d: Derived): Manifold {
  const { m } = ctx;
  const outerR = d.rBase - 0.4;
  const innerR = d.rBase - d.baseRimW + 0.4;
  const segs = segmentsForRadius(outerR, 0.12);
  return m.Manifold.cylinder(d.footT, outerR, outerR, segs).subtract(
    m.Manifold.cylinder(d.footT + 2, innerR, innerR, segs).translate([0, 0, -1]),
  );
}

/** The matching recess, so the foot sits flush instead of proud. */
export function footRecess(ctx: BuildCtx, d: Derived): Manifold {
  const { m } = ctx;
  const outerR = d.rBase + 1;
  const innerR = d.rBase - d.baseRimW;
  const segs = segmentsForRadius(outerR, 0.12);
  return m.Manifold.cylinder(d.footT, outerR, outerR, segs)
    .subtract(
      m.Manifold.cylinder(d.footT + 2, innerR, innerR, segs).translate([0, 0, -1]),
    )
    .translate([0, 0, -0.001]);
}
