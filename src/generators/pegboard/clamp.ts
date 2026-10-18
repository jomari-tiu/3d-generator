import type { CrossSection, Manifold } from 'manifold-3d';
import { filletProfile } from '../../core/kernel/primitives';
import { box, cylinder, polygon, rect, slabYZ, type M } from '../shared/solid';
import { teardrop } from './accessories';
import { PEG, PRINTED_SCREW, type Derived } from './geometry';
import { grooveProfile } from './panel';

/*
 * The clamp is a C in (y, z), extruded across its width and printed on its
 * side, so every layer is a whole C and the jaws bend along the layers rather
 * than across them. It is modelled centred on x = 0; the build moves each copy
 * to its place along the board.
 *
 * In print orientation x points down, so anything cut ACROSS the C -- the
 * screw hole, the nut pocket, the tray pegs -- has its overhang toward -x and
 * gets a teardrop or a point there.
 */

/** Print on its side: x becomes the vertical. */
export const CLAMP_PRINT: [number, number, number] = [0, 90, 0];

/** The C, its corners eased outside and filleted inside. */
function clampProfile(m: M, d: Derived): CrossSection {
  const lowReach = Math.max(d.jawDepth, d.screwY + d.bossHalf);
  const bossBottom = d.zLowJaw - d.bossH;
  const y0 = d.screwY - d.bossHalf;
  const y1 = d.screwY + d.bossHalf;
  const c = Math.min(5, d.bossHalf / 3);
  const shape = m.CrossSection.union([
    rect(m, d.yBack, 0, d.zSpineBottom, d.zJawTop),
    rect(m, d.yBack, d.jawDepth, d.zJawU, d.zJawTop),
    rect(m, d.yBack, lowReach, d.zSpineBottom, d.zLowJaw),
    // The screw boss, its lower corners chamfered.
    polygon(m, [[y0, d.zLowJaw + 0.01], [y0, bossBottom + c], [y0 + c, bossBottom], [y1 - c, bossBottom], [y1, bossBottom + c], [y1, d.zLowJaw + 0.01]]),
  ]);
  const eased = shape.offset(-1.5, 'Round', 2, 16).offset(1.5, 'Round', 2, 16);
  return filletProfile(eased, 2);
}

/** One clamp body, centred on x = 0. */
export function buildClampBody(m: M, d: Derived): Manifold {
  const half = d.clampW / 2;
  let body = slabYZ(m, clampProfile(m, d), -half, half);

  const cuts: Manifold[] = [slabYZ(m, grooveProfile(m, d), -half - 1, half + 1)];

  // Nut pocket, open toward the desk so the nut drops in from inside the C.
  // A point toward -x keeps its roof printable on the side.
  const pocketR = (d.nutAF + 2 * d.clear) / Math.sqrt(3);
  const hex = m.CrossSection.circle(pocketR, 6).translate([0, d.screwY]);
  cuts.push(m.Manifold.extrude(hex, d.nutH + d.clear + 1).translate([0, 0, d.zLowJaw - d.nutH - d.clear]));
  const hole = teardrop(m, d.boltHole / 2 + d.clear, [-1, 0]).translate([0, d.screwY]);
  cuts.push(m.Manifold.extrude(hole, d.bossH + 2).translate([0, 0, d.zLowJaw - d.bossH - 1]));

  if (d.lock) {
    // Down to the rail from whichever end of the spine is nearer it.
    const y = d.yBack + 2;
    const z0 = d.mount === 'below' ? d.header.railZ : d.zSpineBottom - 1;
    const z1 = d.mount === 'below' ? d.zJawTop + 1 : d.header.railZ;
    cuts.push(cylinder(m, 1.35, 0, y, z0, z1));
  }
  body = body.subtract(m.Manifold.union(cuts));

  if (d.tray) {
    const pegsUp = [-d.clampW / 4, d.clampW / 4].map((x) =>
      m.Manifold.extrude(teardrop(m, PEG.r, [1, 0]).translate([x, d.pegY]), PEG.h).translate([0, 0, d.zJawTop - 0.01]),
    );
    body = body.add(m.Manifold.union(pegsUp));
  }
  return body;
}

/** Pad under the top jaw. Glue it on; TPU grips best. */
export function buildJawPad(m: M, d: Derived): Manifold {
  const half = d.clampW / 2 - 2;
  return box(m, -half, half, 2, d.jawDepth - 2, 0, d.padT);
}

/** The swivel pad that rides on the screw tip, modelled where it presses the desk. */
export function buildSwivel(m: M, d: Derived): Manifold {
  const z0 = d.zLowJaw + d.screwRise + 1;
  const disc = cylinder(m, d.swivelR, 0, d.screwY, z0, z0 + d.swivelT);
  const socket = cylinder(m, d.tipR + d.clear / 2, 0, d.screwY, z0 - 1, z0 + d.swivelT - 2);
  return disc.subtract(socket);
}

/** Twisted extrusion of an off-centre circle: a round thread `pitch` per turn. */
function thread(m: M, r: number, ecc: number, length: number, pitch: number): Manifold {
  const turns = length / pitch;
  return m.Manifold.extrude(m.CrossSection.circle(r, 48).translate([ecc, 0]), length, Math.ceil(turns * 24), -360 * turns);
}

/**
 * The printed thumb screw, knob down, wound up to the desk. Prints standing on
 * its knob; the round thread's flanks lean under 45 degrees.
 */
export function buildScrew(m: M, d: Derived): Manifold {
  const ecc = PRINTED_SCREW.depth / 2;
  const r = PRINTED_SCREW.major / 2 - ecc;
  const top = d.zLowJaw + d.screwRise;
  const bottom = top - d.shaftLength;
  const shaft = thread(m, r, ecc, d.shaftLength, PRINTED_SCREW.pitch).translate([0, 0, bottom]);
  // Chamfer the lead-in so it finds the nut.
  const lead = m.Manifold.cylinder(2, PRINTED_SCREW.major / 2 - 1.2, PRINTED_SCREW.major / 2 + 1, 48).translate([0, 0, top - 2]);
  const trimmed = shaft.intersect(m.Manifold.union([lead, m.Manifold.cylinder(d.shaftLength - 2 + 0.01, 20, 20, 8).translate([0, 0, bottom])]));
  const tip = cylinder(m, d.tipR, 0, 0, top - 0.01, top + 5);

  const knobH = 11;
  const lobes = Array.from({ length: 6 }, (_, i) => {
    const a = (i * Math.PI) / 3;
    return m.CrossSection.circle(4.5, 32).translate([(d.knobR - 4.5) * Math.cos(a), (d.knobR - 4.5) * Math.sin(a)]);
  });
  const knob = m.Manifold.extrude(m.CrossSection.circle(d.knobR - 3, 64).add(m.CrossSection.union(lobes)), knobH)
    .translate([0, 0, bottom - knobH + 0.01]);
  return m.Manifold.union([trimmed, tip, knob]).translate([0, d.screwY, 0]);
}

/** The printed nut, sat in its pocket. Prints flat. */
export function buildNut(m: M, d: Derived): Manifold {
  const ecc = PRINTED_SCREW.depth / 2;
  const r = PRINTED_SCREW.major / 2 - ecc + d.clear;
  const z0 = d.zLowJaw - d.nutH - d.clear;
  const hex = m.Manifold.extrude(m.CrossSection.circle(d.nutAF / Math.sqrt(3), 6), d.nutH);
  const bore = thread(m, r, ecc, d.nutH + 2, PRINTED_SCREW.pitch).translate([0, 0, -1]);
  return hex.subtract(bore).translate([0, d.screwY, z0]);
}

/** A stand-in for a metal bolt and nut, for the preview only. */
export function buildBoltPreview(m: M, d: Derived): Manifold {
  const r = (d.boltHole - 0.6) / 2;
  const top = d.zLowJaw + d.screwRise + 5;
  // The head rises toward the boss as the bolt winds up.
  const headZ = d.zLowJaw - d.bossH - (d.travel - d.screwRise) - 1;
  const head = m.Manifold.extrude(m.CrossSection.circle(d.nutAF / Math.sqrt(3), 6), r * 1.3).translate([0, 0, headZ - r * 1.3]);
  const nut = m.Manifold.extrude(m.CrossSection.circle(d.nutAF / Math.sqrt(3), 6), d.nutH).translate([0, 0, d.zLowJaw - d.nutH - d.clear]);
  return m.Manifold.union([head, cylinder(m, r, 0, 0, headZ - 0.01, top), nut]).translate([0, d.screwY, 0]);
}
