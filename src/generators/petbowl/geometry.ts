import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type { Params } from '../../core/params/types';
import { roundedRect, segmentsForRadius } from '../../core/kernel/primitives';

const DEG = Math.PI / 180;

/**
 * Chord length the wrap refines to, in mm.
 *
 * Not chosen for accuracy -- at bowl radii even a 4 mm chord is 30 microns off
 * the true arc. It is chosen to MATCH the revolve's own facet size, because the
 * preview shades flat on purpose: a wrapped decal with coarser facets than the
 * wall it sits on reads as crazed ceramic next to a surface that looks smooth.
 */
export const WRAP_FIDELITY = 1.6;

/**
 * The front of the bowl is -Y. Decals are placed by an angle measured from
 * there, positive to the right, which is the only convention in this file:
 *
 *   x = r * sin(theta),  y = -r * cos(theta)
 */
export function frontward(r: number, thetaRad: number): [number, number] {
  return [r * Math.sin(thetaRad), -r * Math.cos(thetaRad)];
}

export interface Derived {
  readonly species: string;
  readonly nozzle: number;
  readonly layer: number;

  // --- body of revolution
  readonly rTop: number;
  readonly rBase: number;
  readonly height: number;
  readonly dishDepth: number;
  readonly wall: number;
  readonly floorT: number;
  readonly rimW: number;
  readonly rimR: number;
  readonly rimIn: number;
  readonly floorR: number;
  readonly zRimStart: number;
  readonly zFloor: number;
  /** Underside of the interior floor: nothing decorative may reach above it. */
  readonly zFloorUnder: number;
  readonly rTopIn: number;
  readonly rInnerBot: number;
  /** Dish radius where the floor fillet begins. */
  readonly rDishBot: number;
  readonly dishTopZ: number;
  readonly dishRun: number;
  /** dr/dz of the outer wall. NEGATIVE: it narrows as it rises. */
  readonly slope: number;
  /** Downward-narrowing slope of the dish wall, always positive. */
  readonly dishSlope: number;
  readonly baseRimW: number;
  readonly baseRimH: number;

  // --- wavy colour split
  readonly waveZ: number;
  readonly waveAmp: number;
  readonly waveLobes: number;
  readonly waveClamped: boolean;

  // --- name plate
  readonly nameText: string;
  readonly nameSize: number;
  readonly plateW: number;
  readonly plateH: number;
  readonly plateDepth: number;
  readonly plateZ: number;
  readonly letterRelief: number;
  readonly motif: string;

  // --- species features
  readonly ears: boolean;
  readonly earW: number;
  readonly earH: number;
  readonly earSpreadDeg: number;
  readonly earInnerDepth: number;
  /** Ear plate thickness, measured inward from the outer wall. */
  readonly earT: number;
  readonly earEmbed: number;
  readonly earBaseZ: number;
  readonly earFree: number;
  /** Gap left round the inner-ear filler, so no two faces coincide. */
  readonly earInset: number;
  readonly legs: number;
  readonly archW: number;
  readonly archH: number;
  readonly handles: boolean;
  readonly handleW: number;
  readonly handleH: number;
  readonly handleZ: number;

  // --- branding
  readonly logo: boolean;
  readonly logoText: string;
  readonly logoSub: string;
  readonly logoSize: number;
  readonly logoSubCap: number;
  readonly logoRelief: number;
  readonly logoZ: number;
  readonly logoBand: number;

  readonly foot: boolean;
  readonly footT: number;

  /** Interior volume in millilitres. */
  readonly capacityMl: number;
}

export function derive(p: Params): Derived {
  const species = String(p.species);
  const nozzle = Number(p.nozzle);
  const layer = Number(p.layer);

  const rTop = Number(p.topDiameter) / 2;
  const height = Number(p.height);
  const dishDepth = Number(p.dishDepth);
  const wall = Number(p.wall);
  // The base is the WIDEST part and the rim the narrowest: the walls slope up
  // and in. That is a pet bowl -- low centre of gravity, hard to tip, and a
  // wall that is an underhang the whole way when printed base-down, so it needs
  // no support at all. The other way round is a flower pot.
  const rBase = rTop + Number(p.baseFlare);

  const rimR = Math.min(Number(p.rimRound), wall * 1.5);
  // Inner round-over, kept inside the rim's flat so the two arcs cannot meet
  // and fold the profile back on itself.
  const rimIn = Math.min(rimR * 0.85, Math.max(0, wall + Number(p.rimWidth) - rimR) * 0.8);
  const rimW = wall + Number(p.rimWidth);
  const floorT = Math.max(wall, 4 * layer);

  const zRimStart = Math.max(1, height - rimR);
  const zFloor = height - dishDepth;
  const zFloorUnder = zFloor - floorT;
  const slope = (rTop - rBase) / zRimStart;

  const rTopIn = rTop - rimW;
  // The dish wall runs parallel to the outer wall, from under the rim's inner
  // round-over down to the top of the floor fillet. Solving for it at those two
  // heights -- rather than over the nominal depth -- is what keeps the wall an
  // even thickness instead of wedging thicker toward the floor.
  const dishTopZ = height - rimIn;
  const dishRun = Math.max(1, dishTopZ - zFloor);
  const floorR = Math.max(0, Math.min(Number(p.floorRound), dishRun * 0.35));
  // The inside narrows going DOWN, on its own angle, independently of the
  // outside flaring out. Tying it to the outer wall would give a dish that
  // widens toward its floor: an undercut you cannot print rim-up and cannot
  // get a cloth into.
  const dishSlope = Math.tan(Number(p.dishAngle) * DEG);
  const rDishBot = rTopIn - dishSlope * Math.max(0, dishRun - floorR);
  /** Outer radius of the flat part of the interior floor. */
  const rInnerBot = Math.max(wall, rDishBot - floorR);

  const baseRimW = Math.max(wall + 1.5, Number(p.baseRim));
  const baseRimH = Math.max(2, baseRimW);

  // --- wave
  //
  // The split has to stay BELOW the interior floor. Above it, the cut surface
  // surfaces inside the dish and the bowl you eat out of comes out two-tone.
  // Clamping and saying so beats erroring on a purely decorative slider.
  const waveAmp = Number(p.waveAmplitude);
  // Stored as a percentage, because that is what the slider shows.
  const wanted = height * (Number(p.waveHeight) / 100);
  const ceiling = zFloorUnder - waveAmp - 1.5;
  const waveZ = Math.min(wanted, ceiling);
  const waveClamped = wanted > ceiling + 1e-6;
  const waveLobes = Math.round(Number(p.waveLobes));

  // --- name plate, sized around the text it has to hold
  const nameText = String(p.name).trim();
  const nameSize = Number(p.nameSize);
  const plateH = nameSize + 2 * Number(p.platePadY);
  const plateDepth = Number(p.plateDepth);
  const letterRelief = Math.max(2 * layer, plateDepth * 0.55);
  // Centred between the wave's front TROUGH and the rim. The trough is as low
  // as the upper colour gets at the front, so a plaque above it sits on one
  // colour however the wave is set.
  const plateZ = (waveZ - waveAmp + zRimStart) / 2;
  const motif = String(p.sideMotif);

  // --- species features
  const ears = species === 'cat' && p.ears === true;
  const earW = Number(p.earWidth);
  const earH = Number(p.earHeight);
  const earSpreadDeg = Number(p.earSpread);
  const earInnerDepth = Math.max(2 * layer, wall * 0.45);
  // Exactly the wall thickness, no more. A thicker ear reaches PAST the wall's
  // inner face and leaves a ledge standing proud inside the dish -- a shelf
  // that traps food, and one the inner-ear pocket then cuts into, which is
  // where the shell came apart into fragments.
  const earT = wall;
  // How far the ear reaches down into the rim. This is the joint, so it wants
  // real depth of engagement rather than a tangent kiss at the rim.
  const earEmbed = Math.min(Math.max(rimW + 4, 6), earH * 0.45);
  const earBaseZ = height - earEmbed;
  /** The ear's free height, above the rim. */
  const earFree = Math.max(1, earH - earEmbed);
  // The filler is built a hair SMALLER than the pocket it drops into. Filling
  // it exactly makes the two solids share their side walls, and coincident
  // faces are both a z-fighting mess in the preview and a coin-toss for a
  // slicer deciding which body owns the boundary. One extrusion of gap closes
  // on the plate and is invisible.
  const earInset = Math.max(0.1, nozzle * 0.3);

  const legs = species === 'dog' ? Math.round(Number(p.legs)) : 0;
  const archH = Math.min(waveZ + waveAmp, Number(p.legHeight));
  // Arches share the skirt with the legs between them, so their width comes
  // from the leg count and the circumference they have to divide up.
  const archW = legs > 0 ? ((2 * Math.PI * rBase) / legs) * (Number(p.archShare) / 100) : 0;

  const handles = species === 'dog' && p.handles === true;
  const handleW = Number(p.handleWidth);
  const handleH = Number(p.handleHeight);
  const handleZ = (plateZ + zRimStart) / 2;

  // --- branding
  const logoSize = Number(p.logoSize);
  // The strapline is the smallest text on the bowl by a wide margin. Below
  // about six nozzle widths it stops being legible and starts being a smudge,
  // so it gets a floor rather than scaling all the way down with the mark.
  const logoSubCap = Math.max(6 * nozzle, logoSize * 0.22);
  const logo = p.logo === true;
  const logoRelief = Math.max(2 * layer, Number(p.logoRelief));
  // The band the mark has to live in: between the foot and the wave's front
  // crest. Centring in it beats a fixed height, which drifts off the colour it
  // is supposed to sit on the moment the bowl changes shape.
  const logoBandBottom = baseRimH + 1.5;
  const logoBandTop = waveZ - waveAmp - 1.5;
  const logoZ = (logoBandBottom + logoBandTop) / 2;

  // Truncated cone over the dish's real run: V = pi h (R^2 + Rr + r^2) / 3.
  // Ignores the floor fillet, which takes a percent or two back out.
  const capacityMl =
    (Math.PI * dishRun * (rTopIn ** 2 + rTopIn * rDishBot + rDishBot ** 2)) / 3 / 1000;

  return {
    species, nozzle, layer,
    rTop, rBase, height, dishDepth, wall, floorT, rimW, rimR, rimIn, floorR,
    zRimStart, zFloor, zFloorUnder, rTopIn, rInnerBot, rDishBot, dishTopZ, dishRun, slope, dishSlope, baseRimW, baseRimH,
    waveZ, waveAmp, waveLobes, waveClamped,
    nameText, nameSize,
    plateW: Number(p.plateWidth),
    plateH, plateDepth, plateZ, letterRelief, motif,
    ears, earW, earH, earSpreadDeg, earInnerDepth, earT, earInset, earEmbed, earBaseZ, earFree,
    legs, archW, archH,
    handles, handleW, handleH, handleZ,
    logo,
    logoText: String(p.logoText).trim(),
    logoSub: String(p.logoSub).trim(),
    logoSize, logoSubCap, logoRelief, logoZ,
    logoBand: Math.max(0, logoBandTop - logoBandBottom),
    foot: p.foot === true,
    footT: Number(p.footThickness),
    capacityMl,
  };
}

/** Outer radius of the wall at a given height, flat above the rim. */
export function wallRadiusAt(d: Derived, z: number): number {
  const clamped = Math.min(Math.max(z, 0), d.zRimStart);
  return d.rBase + d.slope * clamped;
}

// --------------------------------------------------------------- the profile

/**
 * The bowl as a 2D cross-section, ready to revolve: x is radius, y is height.
 *
 * Walked counter-clockwise -- out along the foot, up the flared outer wall, over
 * the rim, down the dish, in across the floor, then back along the hollow
 * underside. A shell, not a solid: a solid bowl this size is most of a kilo of
 * filament.
 *
 * Three things here are what stop it reading as a plastic bucket:
 *
 *  - The outer wall FLARES hard. A pet bowl is wide at the rim and narrow at the
 *    foot, and a few degrees of draft is not a flare -- it just looks like a
 *    cylinder that failed to be straight. The default leans about 25 degrees.
 *  - The rim is rounded on BOTH edges with a narrow flat between them, so it
 *    reads as a lip rather than a cut-off tube wall.
 *  - The dish floor meets the dish wall on a radius. A sharp inside corner is
 *    where food packs in and where a bowl cracks, and it looks moulded rather
 *    than thrown.
 */
export function bowlProfile(m: ManifoldToplevel, d: Derived): CrossSection {
  const pts: [number, number][] = [];
  const rFootIn = d.rBase - d.baseRimW;
  const arc = (
    steps: number,
    f: (t: number) => [number, number],
  ): void => {
    for (let i = 0; i <= steps; i++) pts.push(f(i / steps));
  };

  // foot, then the flared outer wall
  pts.push([rFootIn, 0], [d.rBase, 0], [d.rTop, d.zRimStart]);

  // rim: round over the outside, cross the flat, round down the inside
  arc(8, (t) => {
    const a = t * (Math.PI / 2);
    return [d.rTop - d.rimR * (1 - Math.cos(a)), d.zRimStart + d.rimR * Math.sin(a)];
  });
  arc(8, (t) => {
    const a = (1 - t) * (Math.PI / 2);
    return [
      d.rTopIn + d.rimIn * (1 - Math.cos(a)),
      d.height - d.rimIn * (1 - Math.sin(a)),
    ];
  });

  // Dish wall down to where the floor fillet starts, then the fillet itself.
  //
  // Wound from the WALL tangent to the FLOOR tangent, in that order. Reversed,
  // the arc doubles back across the corner it is meant to round and the profile
  // self-intersects -- which revolves into three separate solids that still
  // look like a bowl in a preview and pass every volume and status check.
  pts.push([d.rDishBot, d.zFloor + d.floorR]);
  if (d.floorR > 0.05) {
    arc(8, (t) => {
      const a = t * (Math.PI / 2);
      return [
        d.rDishBot - d.floorR * (1 - Math.cos(a)),
        d.zFloor + d.floorR * (1 - Math.sin(a)),
      ];
    });
  }

  // floor, then back out along the hollow underside
  pts.push([0, d.zFloor], [0, d.zFloorUnder]);
  pts.push([wallRadiusAt(d, d.zFloorUnder) - d.wall, d.zFloorUnder]);
  pts.push([wallRadiusAt(d, d.baseRimH) - d.wall, d.baseRimH], [rFootIn, d.baseRimH]);

  return m.CrossSection.ofPolygons([pts], 'NonZero');
}

export function bowlSolid(m: ManifoldToplevel, d: Derived): Manifold {
  return m.Manifold.revolve(bowlProfile(m, d), segmentsForRadius(d.rTop, 0.12));
}

// ------------------------------------------------------------- the wave split

/**
 * A solid filling everything below the wavy split surface, `z = waveZ - amp *
 * cos(lobes * theta)` -- a TROUGH at the front, which is what the colour break
 * on a real bowl does: the band dips under the name and rides up at the sides.
 *
 * Hand-built rather than CSG'd, because the surface is neither prismatic nor
 * axisymmetric and the kernel has no primitive for it. The alternatives were
 * both worse: `levelSet` costs a second and hundreds of thousands of triangles
 * for a surface described by one sine, and unioning angular wedges leaves the
 * wave visibly stepped unless there are hundreds of them.
 *
 * The centre vertex sits at the wave's LOWEST point, so the fan filling the
 * middle can only ever be below the wave itself -- which, with `derive` keeping
 * the whole wave under the interior floor, leaves the cut entirely on the outer
 * skirt where it is meant to show.
 */
export function belowWaveSolid(
  m: ManifoldToplevel,
  d: Derived,
  outerR: number,
  zBottom: number,
): Manifold {
  const N = 256;
  // An inner ring carrying the SAME wave height as the outer one.
  //
  // Without it the top is a single fan from the centre out to the rim, and that
  // fan is LINEAR in radius: at the bowl's wall, partway out, the cut lands at
  // a height interpolated between the wave and the centre vertex. Put the rim
  // well outside the bowl and the wave arrives at the wall shrunk by the ratio
  // of the radii -- a 6 mm wave showing up as 4 mm, sitting lower than asked.
  // Two rings at the same height make the surface flat in r and exact at the
  // wall, whatever radius the cutter is given.
  const innerR = Math.max(1, outerR * 0.2);
  const waveAt = (a: number): number => d.waveZ - d.waveAmp * Math.cos(d.waveLobes * a);

  const verts: number[] = [0, 0, zBottom, 0, 0, d.waveZ - d.waveAmp];
  const tris: number[] = [];
  const ring = (r: number, z: (a: number) => number): void => {
    for (let i = 0; i < N; i++) {
      const a = (i / N) * 2 * Math.PI;
      const [x, y] = frontward(r, a);
      verts.push(x, y, z(a));
    }
  };

  ring(outerR, () => zBottom); // B
  ring(innerR, waveAt); // M
  ring(outerR, waveAt); // T

  const B = 2;
  const M = 2 + N;
  const T = 2 + 2 * N;
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    tris.push(0, B + j, B + i); // bottom cap, normal -z
    tris.push(B + i, B + j, T + j); // side, normal outward
    tris.push(B + i, T + j, T + i);
    tris.push(1, M + i, M + j); // inner fan, normal +z, buried under the floor
    tris.push(M + i, T + i, T + j); // top annulus, normal +z
    tris.push(M + i, T + j, M + j);
  }

  return m.Manifold.ofMesh(
    new m.Mesh({
      numProp: 3,
      vertProperties: new Float32Array(verts),
      triVerts: new Uint32Array(tris),
    }),
  );
}

// ------------------------------------------------------------------- decals

export interface DecalOpts {
  /** Radial extent, measured from the wall surface. Negative is into the wall. */
  readonly from: number;
  readonly to: number;
  /** Where round the bowl, degrees from the front. */
  readonly atDeg: number;
  /** Chord length the wrap is allowed to leave between vertices. */
  readonly fidelity?: number;
}

/**
 * Wrap a flat 2D shape onto the bowl's outer wall.
 *
 * The shape is authored in (arc length, height): exactly how you would lay a
 * sticker out flat. Extruding it radially and then warping it onto the cone is
 * the only way to get a decal that follows a tapered wall -- a flat plate
 * tangent to a cone touches it along a single line.
 *
 * `refineToLength` first, and this is not optional: warp moves the vertices it
 * is given and nothing else, so a straight edge spanning 40 degrees of arc
 * comes out as a 40-degree CHORD, sunk millimetres into the wall at its middle.
 *
 * It does not need to be FINE, though. A chord of length L across a circle of
 * radius R sits L^2/8R below the arc, so on a 70 mm wall even a 3 mm chord is
 * 16 microns out -- far under a nozzle. Refining to tenths of a millimetre only
 * buys tens of thousands of triangles and a rebuild you can feel.
 */
export function wrapToWall(
  m: ManifoldToplevel,
  d: Derived,
  section: CrossSection,
  opts: DecalOpts,
): Manifold {
  const thickness = opts.to - opts.from;
  // (arc, height) -> (arc, -radial, height): rotate the extrusion into Y, then
  // slide it so that NEGATING y gives the radial span [from, to].
  //
  // The negation is what keeps the map orientation-PRESERVING. Sending the
  // frame straight through -- x to the viewer's right, y outward toward them,
  // z up -- has Jacobian determinant -r/s, because (right, up, forward) is
  // left-handed at a surface you are looking at from outside. Every wrapped
  // solid then comes out inside-out: negative volume, and booleans against it
  // quietly do the opposite of what was asked. Flipping y makes it +r/s.
  const slab = m.Manifold.extrude(section, thickness)
    .rotate([90, 0, 0])
    .translate([0, -opts.from, 0]);

  const centre = opts.atDeg * DEG;
  return slab.refineToLength(opts.fidelity ?? 3).warp((v) => {
    const surface = wallRadiusAt(d, v[2]);
    const theta = v[0] / Math.max(surface, 1) + centre;
    const [x, y] = frontward(surface - v[1], theta);
    v[0] = x;
    v[1] = y;
  });
}

// -------------------------------------------------------------------- icons

/** A paw print: four toes over a pad. */
export function pawSection(m: ManifoldToplevel, size: number): CrossSection {
  const pad = m.CrossSection.circle(0.5, 40)
    .scale([size * 0.62, size * 0.44])
    .translate([0, -size * 0.2]);

  const toes: CrossSection[] = [];
  const spread = [-0.33, -0.12, 0.12, 0.33];
  const lift = [0.16, 0.3, 0.3, 0.16];
  for (let i = 0; i < 4; i++) {
    toes.push(
      m.CrossSection.circle(0.5, 28)
        .scale([size * 0.21, size * 0.26])
        .translate([spread[i]! * size, lift[i]! * size]),
    );
  }
  return m.CrossSection.union([pad, ...toes]);
}

/** A bone, lying flat: a shaft with two knuckles at each end. */
export function boneSection(m: ManifoldToplevel, len: number): CrossSection {
  const w = len * 0.3;
  const shaft = roundedRect(m, len * 0.72, w * 0.62, w * 0.3);
  const knuckle = m.CrossSection.circle(w * 0.31, 24);
  const pieces: CrossSection[] = [shaft];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      pieces.push(knuckle.translate([sx * len * 0.36, sy * w * 0.28]));
    }
  }
  return m.CrossSection.union(pieces);
}

/**
 * Whisker set: three lines fanning out from a common root at the origin.
 *
 * Translated BEFORE rotating, which is the whole trick. Rotating a centred bar
 * and then sliding it out pivots each one about its own middle, so all three
 * pass through the same point and cross in an X instead of fanning.
 */
export function whiskerSection(m: ManifoldToplevel, len: number, w: number): CrossSection {
  const pieces: CrossSection[] = [];
  for (const [i, tilt] of [16, 0, -16].entries()) {
    const bar = len * (i === 1 ? 1 : 0.86);
    pieces.push(roundedRect(m, bar, w, w / 2).translate([bar / 2, 0]).rotate(tilt));
  }
  return m.CrossSection.union(pieces);
}
