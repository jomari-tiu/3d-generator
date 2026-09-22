import type { Params } from '../../core/params/types';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** PLA, near enough for a filament estimate. */
export const DENSITY_G_PER_CM3 = 1.24;

/**
 * The hardware this generator is built around: a cord-and-switch lamp holder
 * with a THREADED skirt and a separate shade ring -- the kind sold with an
 * inline switch and a moulded plug.
 *
 * It mounts THROUGH a plate rather than into one. The threaded skirt passes up
 * through a hole, the holder's own flange stops it underneath, and the shade
 * ring screws down from above and clamps the plate between the two. That is why
 * `thread` -- not the body -- sizes the hole in the base's deck, and why `ring`
 * has to be comfortably wider than that hole or there is nothing for the ring
 * to bear on.
 *
 * Every number here is nominal for the commodity part. They vary by a
 * millimetre or two between suppliers, which is exactly what the Custom option
 * is for: measure yours with calipers rather than trusting this table.
 */
export interface SocketSpec {
  /** Outside diameter of the threaded skirt. Sizes the hole in the deck. */
  readonly thread: number;
  /** Outside diameter of the shade ring, which clamps down on the deck. */
  readonly ring: number;
  /** Height of the ring's top face above the deck -- where a hung shade sits. */
  readonly ringRise: number;
  readonly cord: number;
  /** Bulb cap diameter and length, for the clearance check. */
  readonly capDia: number;
  readonly capLen: number;
  /** Height of the bulb cap's shoulder above the deck, once screwed home. */
  readonly bulbRise: number;
}

export const SOCKETS: Readonly<Record<string, SocketSpec>> = {
  e27: { thread: 40, ring: 55, ringRise: 8, cord: 6.5, capDia: 27, capLen: 27, bulbRise: 4 },
  e14: { thread: 27, ring: 37, ringRise: 6, cord: 5.5, capDia: 14, capLen: 20, bulbRise: 3 },
};

/** Envelope sizes for the common bulb shapes, in mm. */
export const BULBS: Readonly<Record<string, { readonly dia: number; readonly len: number }>> = {
  a60: { dia: 60, len: 110 },
  g45: { dia: 45, len: 78 },
  g80: { dia: 80, len: 114 },
  g95: { dia: 95, len: 137 },
  st64: { dia: 64, len: 143 },
  c35: { dia: 35, len: 100 },
};

export type Mount = 'base' | 'ring';
export type Style = 'swirl' | 'pleat';

/**
 * How the shade is carried, resolved from a choice that may say "auto".
 *
 * A mushroom sits ON the base: its hem is the widest thing about it and there
 * is nothing above to hang from. An empire shade is the other way round -- it
 * narrows to a small top which drops straight onto the socket's shade ring,
 * which is what that ring is for. Auto picks the one the style was drawn for,
 * and the control stays for anyone who wants the other.
 *
 * Exported because `visibleIf` needs the same answer the geometry gets: the
 * base's top diameter is a control in one mount and derived from the shade in
 * the other, and a sidebar offering a number that is being ignored is worse
 * than no number at all.
 */
export function resolveMount(p: Params): Mount {
  const m = String(p.mount);
  if (m === 'base' || m === 'ring') return m;
  return String(p.shadeStyle) === 'pleat' ? 'ring' : 'base';
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * A smooth 0 -> 1 -> 0 bump peaking at `at`, over u in [0, 1].
 *
 * Two cosine half-waves rather than one bell, so the peak can be moved off
 * centre without the curve kinking: both halves have zero slope at the peak and
 * at their far end, which is what keeps a bulge from showing a crease where it
 * meets the straight taper it is riding on.
 */
export function hump(u: number, at: number): number {
  if (u <= 0 || u >= 1) return 0;
  const p = Math.min(0.95, Math.max(0.05, at));
  return u < p
    ? 0.5 * (1 - Math.cos((Math.PI * u) / p))
    : 0.5 * (1 + Math.cos((Math.PI * (u - p)) / (1 - p)));
}

export interface Derived {
  readonly style: Style;
  readonly mount: Mount;
  readonly nozzle: number;
  readonly layer: number;
  /** Clearance on every part-to-part fit. */
  readonly fit: number;

  readonly socket: SocketSpec;
  /** null when the user has said there is no bulb to check against. */
  readonly bulb: { readonly dia: number; readonly len: number } | null;

  // --- shade
  readonly shadeH: number;
  readonly rShadeBot: number;
  readonly rShadeTop: number;
  readonly bulge: number;
  readonly bulgeAt: number;
  readonly shadeWall: number;
  readonly flutes: number;
  readonly fluteDepth: number;
  readonly crease: number;
  readonly lobes: number;
  readonly lobeDepth: number;
  /** Total twist over the shade's height, in radians. */
  readonly twistRad: number;
  readonly thetaSteps: number;
  readonly zSteps: number;
  /** How deep the two ripple layers cut in from the silhouette, together. */
  readonly rippleDepth: number;
  readonly rShadeMax: number;
  readonly zShadeMax: number;
  /** Narrowest inner radius round the hem, and round the top aperture. */
  readonly rHemIn: number;
  readonly rTopIn: number;
  /**
   * Height of the fitter flange above the hem, in the ring mount.
   *
   * NOT the top of the shade, which is the mistake this generator was built
   * wrong once already: hang an empire shade by its top rim and the shade is
   * entirely below the shade ring while the bulb is entirely above it, which is
   * a pendant hung upside down rather than a table lamp. The flange sits partway
   * up the inside, low enough to reach the ring and high enough that the rest of
   * the shade goes on up round the bulb.
   */
  readonly seatH: number;
  /**
   * Spokes in the fitter, and the hub they run out from.
   *
   * A fitter that reached the wall all the way round would be a disc: on a
   * shade whose hem is 120 mm and whose fitter sits low in it, that is a
   * 50 mm-wide annulus of solid plastic across the bottom of the lamp -- twenty
   * grams of it, and it blanks off most of the light the shade is open at the
   * bottom to let out. Real lampshades use a spider for the same reason. Zero
   * spokes asks for the disc anyway.
   */
  readonly spokes: number;
  /** Outer radius of the fitter's hub: what actually bears on the shade ring. */
  readonly hubR: number;
  /** Half-width of a spoke, in radians at the wall. */
  readonly spokeHalf: number;
  /** Steepest outward lean of the silhouette, in degrees from vertical. */
  readonly flareDeg: number;
  /**
   * How far the wall moves sideways from one printed layer to the next, the
   * flare and the twist taken together.
   *
   * This, not an overhang angle, is what decides whether a shade prints. The 45
   * degree rule is about solid overhangs, where a layer has to span outward
   * over air; a shade is a continuous thin wall, and every layer lands on the
   * one below it as long as it has not stepped further sideways than the wall
   * is thick. Judged by angle, a 64-rib shade with 160 degrees of twist reports
   * flanks at 71 degrees and gets refused -- and it prints perfectly, because
   * those flanks are moving a third of a millimetre a layer inside a wall three
   * times that thick.
   */
  readonly lateralStep: number;

  // --- base
  readonly rBase: number;
  readonly baseH: number;
  readonly baseWall: number;
  readonly baseBelly: number;
  readonly footH: number;
  readonly footW: number;
  readonly rFootIn: number;
  /** Top face of the base: the deck the socket clamps to. */
  readonly deckZ: number;
  readonly deckT: number;
  readonly chamfer: number;
  readonly rHole: number;
  /** Radius and height of the top of the cone proper. */
  readonly rNeck: number;
  readonly neckZ: number;
  /** Spigot the shade drops over. Zero in the ring mount, which has none. */
  readonly rSpigot: number;
  readonly engage: number;
  /** Inner radius of whatever wall the deck springs from. */
  readonly rDeckIn: number;

  // --- assembly
  /** Height of the shade's hem in the assembled lamp. */
  readonly shadeZ: number;
  readonly totalH: number;
}

export function derive(p: Params): Derived {
  const style: Style = String(p.shadeStyle) === 'pleat' ? 'pleat' : 'swirl';
  const mount = resolveMount(p);
  const nozzle = Number(p.nozzle);
  const layer = Number(p.layer);
  const fit = Number(p.fit);

  const preset = SOCKETS[String(p.socketFamily)];
  const socket: SocketSpec = preset ?? {
    thread: Number(p.threadDia),
    ring: Number(p.ringDia),
    ringRise: Number(p.ringRise),
    cord: Number(p.cordDia),
    // A custom holder still takes a standard cap, and the cap is the narrow
    // part of the bulb that no shade has ever fouled. Guessing it from the
    // thread beats asking for a measurement nobody is going to take.
    capDia: Math.min(27, Number(p.threadDia) * 0.7),
    capLen: Math.min(27, Number(p.threadDia) * 0.7),
    bulbRise: 4,
  };

  const bulbKind = String(p.bulbType);
  const bulb =
    bulbKind === 'none'
      ? null
      : (BULBS[bulbKind] ?? { dia: Number(p.bulbDia), len: Number(p.bulbLength) });

  // --- shade
  const shadeH = Number(p.shadeHeight);
  const rShadeBot = Number(p.shadeBottomDia) / 2;
  const rShadeTop = Number(p.shadeTopDia) / 2;
  const bulge = Number(p.bulge);
  const bulgeAt = Number(p.bulgeAt) / 100;
  const shadeWall = Number(p.shadeWall);

  // The two ripple layers are what separate the styles. A swirl is fine round
  // ribs over a few big lobes, all of it winding as it rises; a pleat is folded
  // fabric -- one layer, creased, usually not wound at all. Reading the same
  // controls through the style rather than showing both sets at once is what
  // lets "flutes" be ribs on one shade and pleats on the other and still mean
  // the same thing: how many are there, and how deep do they cut.
  const flutes = Math.round(Number(p.flutes));
  const fluteDepth = Number(p.fluteDepth);
  const crease = style === 'pleat' ? Number(p.crease) / 100 : 0;
  const lobes = style === 'swirl' ? Math.round(Number(p.lobes)) : 0;
  const lobeDepth = style === 'swirl' ? Number(p.lobeDepth) : 0;
  const twistRad = Number(p.twist) * DEG;
  const rippleDepth = (flutes > 0 ? fluteDepth : 0) + (lobes > 0 ? lobeDepth : 0);

  const detail = String(p.meshDetail);
  const perFlute = detail === 'coarse' ? 5 : detail === 'fine' ? 9 : 6;
  const zChord = detail === 'coarse' ? 2.2 : detail === 'fine' ? 0.9 : 1.4;

  // --- base
  const rBase = Number(p.baseDia) / 2;
  const baseH = Number(p.baseHeight);
  const baseWall = Number(p.baseWall);
  const baseBelly = Number(p.baseBelly);
  const footH = Number(p.footHeight);
  // The foot is a solid ring at the bottom edge, so it has to be wider than the
  // wall standing on it. Narrower and the profile doubles back through itself,
  // which revolves into a solid that still looks like a lamp base.
  const footW = Math.max(Number(p.footWidth), baseWall * 1.25 + 0.4);
  const deckZ = baseH;
  const deckT = Number(p.deckThickness);
  const engage = Number(p.seatEngage);

  // A provisional record, enough for the surface functions to run. The shade's
  // numbers do not depend on the base, so the shade can be measured first and
  // the base's neck fitted to what was measured.
  const partial = {
    style, mount, nozzle, layer, fit, socket, bulb,
    shadeH, rShadeBot, rShadeTop, bulge, bulgeAt, shadeWall,
    flutes, fluteDepth, crease, lobes, lobeDepth, twistRad,
    thetaSteps: 96, zSteps: 32, rippleDepth,
  } as Derived;

  const thetaSteps = thetaStepsFor(partial, perFlute);
  const zSteps = Math.min(260, Math.max(28, Math.round(shadeH / zChord)));
  const sized = { ...partial, thetaSteps, zSteps } as Derived;

  // Widest point of the silhouette, and the steepest outward lean on the way up
  // to it -- the only overhang there is on a shade printed hem-down.
  let rShadeMax = 0;
  let zShadeMax = 0;
  let flareTan = 0;
  let lateralStep = 0;
  const probe = 160;
  for (let i = 0; i <= probe; i++) {
    const z = (i / probe) * shadeH;
    const r = shadeRadius(sized, z);
    if (r > rShadeMax) {
      rShadeMax = r;
      zShadeMax = z;
    }
    if (i > 0) {
      const dz = shadeH / probe;
      const slope = (r - shadeRadius(sized, z - dz)) / dz;
      if (slope > flareTan) flareTan = slope;
      // Outward lean and twist, combined at this height, as one sideways step
      // per layer. Only the OUTWARD lean counts: a wall leaning inward is
      // landing each layer on top of a wider one below, which is supported
      // however steep it gets.
      const out = Math.max(0, slope) * layer;
      const round = (r * Math.abs(twistRad) * layer) / Math.max(shadeH, 1);
      lateralStep = Math.max(lateralStep, Math.hypot(out, round));
    }
  }

  let rHemIn = Infinity;
  let rTopIn = Infinity;
  for (let i = 0; i < thetaSteps; i++) {
    const t = (i / thetaSteps) * TAU;
    rHemIn = Math.min(rHemIn, shadeInner(sized, 0, t));
    rTopIn = Math.min(rTopIn, shadeInner(sized, shadeH, t));
  }

  // --- the neck, and the spigot the shade locates on
  //
  // In the base mount the two parts meet, so the joint is derived rather than
  // typed: the collar takes the shade's own hem radius, which puts the two
  // outer surfaces flush, and the spigot is sized off the shade's INNER surface
  // so the hem drops over it whatever the flutes happen to be doing.
  const rNeck = mount === 'base' ? rShadeBot : Number(p.baseTopDia) / 2;
  const neckZ = mount === 'base' ? deckZ - engage : deckZ;
  const rSpigot = mount === 'base' ? rHemIn - fit : 0;

  const rHole = socket.thread / 2 + fit;
  const shaped = { ...sized, rBase, baseH, baseWall, baseBelly, rNeck, neckZ } as Derived;
  const rDeckIn = mount === 'base' ? rSpigot - baseWall : baseInnerRadius(shaped, deckZ);
  // All of it at 45 degrees, so the deck grows inward off the wall without ever
  // overhanging. Capped three ways: by the control, by how far there is to go
  // before the hole, and by the height underneath it -- a chamfer taller than
  // the spigot it hangs from would run out through the shoulder and fold the
  // profile back over itself.
  const headroom = mount === 'base' ? engage - deckT - 0.8 : deckZ - footH - deckT - 1;
  const chamfer = Math.max(
    0,
    Math.min(Number(p.bridgeChamfer), rDeckIn - rHole, headroom),
  );

  const seatH =
    mount === 'ring' ? Math.max(1, Math.min(Number(p.seatHeight), shadeH - 4)) : 0;
  const spokes = Math.round(Number(p.fitterSpokes));
  // The hub has to overhang the shade ring it lands on, or the fitter is
  // balancing on the ring's inside edge rather than bearing on its face.
  const hubR = Math.max(rHole + 5, socket.ring / 2 + 2.5);
  const spokeHalf = Number(p.fitterSpokeWidth) / 2 / Math.max(shadeRadius(sized, seatH), 1);
  // The base mount lands the hem on the collar; the ring mount hangs the whole
  // shade off its fitter, so the hem ends up wherever that puts it -- which may
  // be below the deck, skirting down past the neck, and on a short base may be
  // below the table. That last one is a real error, and it is checked for.
  const shadeZ = mount === 'base' ? neckZ : deckZ + socket.ringRise - seatH;

  return {
    style, mount, nozzle, layer, fit, socket, bulb,
    shadeH, rShadeBot, rShadeTop, bulge, bulgeAt, shadeWall,
    flutes, fluteDepth, crease, lobes, lobeDepth, twistRad,
    thetaSteps, zSteps, rippleDepth,
    rShadeMax, zShadeMax, rHemIn, rTopIn, seatH, spokes, hubR, spokeHalf,
    flareDeg: (Math.atan(flareTan) * 180) / Math.PI,
    lateralStep,
    rBase, baseH, baseWall, baseBelly, footH, footW,
    rFootIn: rBase - footW,
    deckZ, deckT, chamfer, rHole, rNeck, neckZ, rSpigot, engage, rDeckIn,
    shadeZ,
    totalH: shadeZ + shadeH,
  };
}

/**
 * How many samples to take round the shade.
 *
 * An exact multiple of the flute count, which starts to matter the moment
 * `crease` is up: a creased flute has a cusp in its valley, and a cusp that
 * falls between two samples is not a cusp, it is a chamfer. Landing samples on
 * the crests and the valleys is the difference between a folded shade and a
 * wobbly one.
 */
function thetaStepsFor(d: Derived, perFlute: number): number {
  if (d.flutes > 0) {
    const n = Math.min(960, Math.max(96, d.flutes * perFlute));
    return Math.max(d.flutes, Math.round(n / d.flutes) * d.flutes);
  }
  if (d.lobes > 0) return Math.min(960, Math.max(96, d.lobes * 24));
  const r = Math.max(d.rShadeBot, d.rShadeTop) + d.bulge;
  return Math.min(480, Math.max(96, Math.round((TAU * r) / 0.4)));
}

// ----------------------------------------------------------------- the shade

/** The silhouette: mean radius at height z, before any fluting. */
export function shadeRadius(d: Derived, z: number): number {
  const u = clamp01(z / d.shadeH);
  return d.rShadeBot + (d.rShadeTop - d.rShadeBot) * u + d.bulge * hump(u, d.bulgeAt);
}

/**
 * One flute, as a wave in [-1, 1] with its crest at phi = 0.
 *
 * `crease` morphs a cosine into a scallop -- rounded crests, cusped valleys --
 * which is the whole difference between a ribbed surface and a folded one. Both
 * have period 2pi and the same crest position, so turning the control up
 * changes the section of the fold and never its count or its phase.
 */
function wave(phi: number, crease: number): number {
  const soft = Math.cos(phi);
  if (crease <= 0) return soft;
  const scallop = 2 * Math.abs(Math.cos(phi / 2)) - 1;
  return soft + (scallop - soft) * crease;
}

/**
 * Outer radius of the shade at (z, theta).
 *
 * Both ripple layers only ever cut INWARD from the silhouette, so the diameter
 * typed into the sidebar is the diameter a caliper reads across the finished
 * shade. Rippling symmetrically about the silhouette instead would make every
 * diameter control a polite suggestion that the flute depth then argues with.
 *
 * Because this is a single-valued r(theta), every cross-section is a simple
 * closed curve by construction: there is no flute depth or lobe count that can
 * make the surface pass through itself. That is not a promise a swept or
 * CSG-unioned flute can make, and it is why the shade is lofted rather than
 * built out of booleans.
 */
export function shadeSurface(d: Derived, z: number, theta: number): number {
  const u = clamp01(z / d.shadeH);
  const spin = d.twistRad * u;
  let r = shadeRadius(d, z);
  if (d.flutes > 0 && d.fluteDepth > 0) {
    r += 0.5 * d.fluteDepth * (wave(d.flutes * (theta + spin), d.crease) - 1);
  }
  if (d.lobes > 0 && d.lobeDepth > 0) {
    r += 0.5 * d.lobeDepth * (Math.cos(d.lobes * (theta + spin)) - 1);
  }
  return r;
}

/**
 * Inner radius under the surface at (z, theta), for a wall of the thickness
 * that was actually asked for.
 *
 * Offsetting straight inward by the wall is the obvious thing, and it is wrong
 * wherever the surface is not vertical: on a flank leaning 45 degrees, a 1.2 mm
 * radial offset is 0.85 mm of material measured THROUGH the wall -- the
 * difference between three perimeters and two. On a lamp shade the perimeter
 * count is the design, because it is what the light has to come through. So the
 * offset is divided by the surface's own foreshortening, taken from the local
 * slopes in both directions.
 *
 * Clamped, because at a creased valley that factor runs away: the true offset
 * surface has a cusp there and wants infinite thickness. A slicer rounds that
 * corner off regardless.
 */
export function shadeInner(d: Derived, z: number, theta: number): number {
  const r = shadeSurface(d, z, theta);
  const hz = Math.min(0.3, d.shadeH / 200);
  const z0 = Math.max(hz, Math.min(d.shadeH - hz, z));
  const ht = TAU / Math.max(d.thetaSteps, 32) / 4;
  const fz = (shadeSurface(d, z0 + hz, theta) - shadeSurface(d, z0 - hz, theta)) / (2 * hz);
  const ft = (shadeSurface(d, z, theta + ht) - shadeSurface(d, z, theta - ht)) / (2 * ht);
  const factor = Math.min(2.5, Math.sqrt(1 + fz * fz + (ft / Math.max(r, 1)) ** 2));
  // The two surfaces must never meet or cross: a wall of zero thickness is a
  // strip of degenerate triangles, and the kernel is entitled to refuse it.
  return Math.max(0.4, Math.min(r - 0.3, r - d.shadeWall * factor));
}

// ------------------------------------------------------------------ the base

/** Outer radius of the base's cone at height z. */
export function baseRadius(d: Derived, z: number): number {
  const u = clamp01(z / Math.max(d.neckZ, 0.001));
  return d.rBase + (d.rNeck - d.rBase) * u + d.baseBelly * hump(u, 0.5);
}

/** Inner radius of the base's cone at height z, for a true wall thickness. */
export function baseInnerRadius(d: Derived, z: number): number {
  const h = 0.4;
  const a = Math.max(0, z - h);
  const b = Math.min(d.neckZ, z + h);
  const slope = b > a ? (baseRadius(d, b) - baseRadius(d, a)) / (b - a) : 0;
  return baseRadius(d, z) - d.baseWall * Math.sqrt(1 + slope * slope);
}

// ------------------------------------------------------- what is in the way

/**
 * Radius of the bulb's silhouette at height z ABOVE THE DECK.
 *
 * The convex hull of the cap and the envelope, which is cheaper than modelling
 * a real bulb and is the right answer anyway: a shade fouls the widest
 * silhouette, not the glass.
 *
 * Deliberately only the bulb. The shade ring is in the way too, but it is a
 * different question with a different answer -- the ring is an ASSEMBLY
 * clearance, a few millimetres of which is plenty, while the bulb is a THERMAL
 * one that wants centimetres. Folding both into one number meant the readout
 * said "bulb clearance: 2.7 mm" about a shade that in fact cleared its bulb by
 * eight, and sent anyone reading it off to change the wrong control.
 */
export function bulbRadius(d: Derived, z: number): number {
  const r = 0;
  const b = d.bulb;
  if (!b) return r;

  const capR = d.socket.capDia / 2;
  const z0 = d.socket.bulbRise;
  const capTop = z0 + d.socket.capLen;
  if (z < z0) return r;
  if (z <= capTop) return Math.max(r, capR);

  const rb = b.dia / 2;
  const zc = z0 + b.len - rb;
  const sphere = (zz: number): number => {
    const dz = zz - zc;
    return dz * dz >= rb * rb ? 0 : Math.sqrt(rb * rb - dz * dz);
  };
  if (z > zc + rb) return r;
  if (z >= zc) return Math.max(r, sphere(z));

  // The tangent from the rim of the cap to the envelope: the shoulder of the
  // bulb. Without it a narrow shade is told it clears a bulb it would actually
  // rest against, because the widest part of the glass is not the only part of
  // it that can touch.
  const vr = capR;
  const vz = capTop - zc;
  const dd = Math.hypot(vr, vz);
  if (dd <= rb) return Math.max(r, sphere(z), capR);
  const k = (rb * Math.sqrt(dd * dd - rb * rb)) / (dd * dd);
  const tr = (rb * rb * vr) / (dd * dd) + k * -vz;
  const tz = zc + (rb * rb * vz) / (dd * dd) + k * vr;
  if (tz <= capTop || tz <= z) return Math.max(r, sphere(z), capR);
  const t = (z - capTop) / (tz - capTop);
  return Math.max(r, sphere(z), capR + (tr - capR) * t);
}

export interface Clearance {
  /** Smallest gap between the shade's inside and the hardware, in mm. */
  readonly gap: number;
  /** Height above the deck where that happens. */
  readonly atZ: number;
  /** Bulb tip against the shade's top rim: positive means it pokes out. */
  readonly bulbAbove: number;
}

/** Narrowest inner radius anywhere round the shade at one height above the hem. */
export function innerAt(d: Derived, local: number): number {
  let r = Infinity;
  const n = Math.min(d.thetaSteps, 180);
  for (let i = 0; i < n; i++) r = Math.min(r, shadeInner(d, local, (i / n) * TAU));
  return r;
}

/**
 * The one measurement that decides whether the lamp is worth printing.
 *
 * Walked over the shade's own span in the deck's frame, taking the NARROWEST
 * inner radius at each height: a flute valley is where a shade touches a bulb,
 * and averaging round the shade would hide exactly the contact that matters.
 */
export function clearance(d: Derived): Clearance {
  const hem = d.shadeZ - d.deckZ;
  let gap = Infinity;
  let atZ = hem;
  const steps = 120;
  for (let i = 0; i <= steps; i++) {
    const local = (i / steps) * d.shadeH;
    const z = hem + local;
    if (z < -0.5) continue;
    const g = innerAt(d, local) - bulbRadius(d, z);
    if (g < gap) {
      gap = g;
      atZ = z;
    }
  }
  const bulbTop = d.bulb ? d.socket.bulbRise + d.bulb.len : 0;
  return {
    gap: d.bulb && Number.isFinite(gap) ? gap : 0,
    atZ,
    bulbAbove: d.bulb ? bulbTop - (hem + d.shadeH) : 0,
  };
}

/**
 * How much room the shade has as it goes down over the shade ring.
 *
 * Not a single cross-section but the whole run of them: the ring travels up
 * through the shade's inside during assembly, from the hem to wherever it ends
 * up, and the shade has to clear it the whole way. Checking only the hem passes
 * a shade that is widest at its hem and closes in above it -- which then jams
 * halfway on, with the two surfaces bearing on each other somewhere nobody can
 * see.
 */
export function ringClearance(d: Derived): number {
  const top = Math.min(d.shadeH, d.deckZ + d.socket.ringRise - d.shadeZ);
  if (top <= 0) return Infinity;
  let gap = Infinity;
  const steps = 32;
  for (let i = 0; i <= steps; i++) {
    gap = Math.min(gap, innerAt(d, (i / steps) * top) - d.socket.ring / 2);
  }
  return gap;
}
