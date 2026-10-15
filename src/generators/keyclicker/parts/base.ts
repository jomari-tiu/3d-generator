import type { CrossSection, Manifold } from 'manifold-3d';
import type { BuildCtx } from '../../../core/params/types';
import { roundedRect, segmentsForRadius, taperedExtrude } from '../../../core/kernel/primitives';
import { keyX, type Derived } from '../geometry';

/**
 * The body seen from above. A tray is one rounded bar; cells are a rounded
 * square per key, overlapping by one wall so neighbours share it.
 *
 * The cavity under the plate is this outline offset inward, so the two styles
 * need no separate plumbing underneath.
 */
export function bodyFootprint(ctx: BuildCtx, d: Derived): CrossSection {
  const { m } = ctx;
  if (d.baseStyle !== 'cells') return roundedRect(m, d.baseW, d.baseD, d.baseCorner);
  const cells: CrossSection[] = [];
  for (let i = 0; i < d.keys; i++) {
    cells.push(roundedRect(m, d.cell, d.cell, d.cellCorner).translate([keyX(d, i), 0]));
  }
  return m.CrossSection.union(cells);
}

/**
 * A rounded box with its top edge chamfered: the full box short of the
 * chamfer, and a tapered copy of the outline on top.
 *
 * A scaled taper is only an even inset for a convex outline, which is why the
 * cells body is built from one of these per cell rather than from the merged
 * outline. Unioned, the chamfers of neighbouring cells meet in a V, and that
 * groove is what makes a row of cells read as separate blocks.
 */
function chamferedBox(
  ctx: BuildCtx,
  outline: CrossSection,
  w: number,
  h: number,
  height: number,
  chamfer: number,
): Manifold {
  const { m } = ctx;
  if (chamfer <= 0.05) return m.Manifold.extrude(outline, height);
  return m.Manifold.union([
    m.Manifold.extrude(outline, height - chamfer),
    taperedExtrude(m, outline, chamfer + 0.001, (w - 2 * chamfer) / w, (h - 2 * chamfer) / h).translate([
      0,
      0,
      height - chamfer - 0.001,
    ]),
  ]);
}

/**
 * The body the keys live in: a plate with a cutout per key, a rim standing
 * above it that the keycaps sit down into, walls, and a closed floor.
 *
 * A switch pushes down through its cutout from ABOVE until its clips snap
 * under the plate, so nothing has to go in from below and the bottom stays
 * shut: one solid part, no cover to lose, and the pins end up sealed inside
 * the body instead of against your leg. The cavity under the plate is only
 * the room the switch housing and its pins need.
 *
 * Prints floor-down, as laid out. The plate bridges the cavity once.
 */
export function buildBase(ctx: BuildCtx, d: Derived): Manifold {
  const { m } = ctx;

  let base: Manifold;
  if (d.baseStyle === 'cells') {
    const cells: Manifold[] = [];
    for (let i = 0; i < d.keys; i++) {
      cells.push(
        chamferedBox(
          ctx,
          roundedRect(m, d.cell, d.cell, d.cellCorner),
          d.cell,
          d.cell,
          d.baseH,
          d.chamfer,
        ).translate([keyX(d, i), 0, 0]),
      );
    }
    base = m.Manifold.union(cells);
  } else {
    base = chamferedBox(
      ctx,
      roundedRect(m, d.baseW, d.baseD, d.baseCorner),
      d.baseW,
      d.baseD,
      d.baseH,
      d.chamfer,
    );
  }

  const footprint = bodyFootprint(ctx, d);

  // --- room under the plate for the switch housings, sealed by the floor
  if (d.sw.hollow) {
    base = base.subtract(
      m.Manifold.extrude(footprint.offset(-d.wallT, 'Round'), d.cavityD).translate([0, 0, d.floorT]),
    );
  }

  // --- walls under the plate between neighbouring switches. A long tray
  // prints its plate as one bridge the length of the bar, and that bridge
  // flexes under a keypress; a rib between each pair of switches carries it
  // down to the floor. The rib stays clear of the cutout AND of the clip
  // notches beside it, or the switch would catch on it going in.
  if (d.sw.hollow && d.supportWalls && d.keys > 1) {
    const margin = MX_CLIP_REACH + 0.3;
    const ribW = d.pitch - d.sw.cutout - d.clear - 2 * margin;
    if (ribW >= 2 * d.nozzle) {
      const inner = footprint.offset(-d.wallT + 0.01, 'Round');
      const ribs: CrossSection[] = [];
      for (let i = 0; i < d.keys - 1; i++) {
        const x = (keyX(d, i) + keyX(d, i + 1)) / 2;
        ribs.push(m.CrossSection.square([ribW, d.baseD + 2], true).translate([x, 0]));
      }
      // Overlap floor and plate a hair each way so the rib fuses into both
      // instead of touching them on a plane.
      const rib = m.CrossSection.union(ribs).intersect(inner);
      base = base.add(m.Manifold.extrude(rib, d.cavityD + 0.02).translate([0, 0, d.floorT - 0.01]));
    }
  }

  // --- the pocket the keycaps sit down into
  if (d.rimH > 0.05) {
    const r = d.capCorner + d.keyGap;
    let pocket: CrossSection;
    if (d.baseStyle === 'cells') {
      const ps: CrossSection[] = [];
      for (let i = 0; i < d.keys; i++) {
        ps.push(roundedRect(m, d.pocket, d.pocket, r).translate([keyX(d, i), 0]));
      }
      pocket = m.CrossSection.union(ps);
    } else {
      pocket = roundedRect(m, (d.keys - 1) * d.pitch + d.pocket, d.pocket, r);
    }
    base = base.subtract(
      m.Manifold.extrude(pocket, d.rimH + 1).translate([0, 0, d.plateTop]),
    );
  }

  // --- one opening per key
  const openings: Manifold[] = [];
  for (let i = 0; i < d.keys; i++) {
    openings.push(keyOpening(ctx, d).translate([keyX(d, i), 0, 0]));
  }
  base = base.subtract(m.Manifold.union(openings));

  // --- posts and dome seats, only for the printed variant
  if (d.sw.stem === 'post') {
    const towers: Manifold[] = [];
    for (let i = 0; i < d.keys; i++) {
      towers.push(buildPost(ctx, d).translate([keyX(d, i), 0, 0]));
    }
    base = base.add(m.Manifold.union(towers));
  }

  return d.loop ? addLoop(ctx, d, base) : base;
}

/**
 * The MX clips sit mid-way along two opposite edges of the cutout. Nothing in a
 * clicker fixes which way round a switch goes in, so all four edges are
 * notched, each a little wider and further out than the clip itself.
 */
const MX_CLIP_W = 5.5;
const MX_CLIP_REACH = 1.0;
/** Plate left where the clips catch: under 1.5 so a sagging bridge still clicks. */
const MX_CLIP_PLATE = 1.3;

/**
 * What gets taken out of the plate for one key.
 *
 * A bought switch wants its exact square cutout and nothing else. The printed
 * variant has no switch, so it gets a well for the keycap skirt to travel in
 * plus a seat for the dome.
 */
function keyOpening(ctx: BuildCtx, d: Derived): Manifold {
  const { m } = ctx;
  const top = d.plateTop;

  if (d.sw.cutout > 0) {
    const cut = d.sw.cutout + d.clear;
    // Through the plate only, into the cavity below.
    const hole = m.Manifold.extrude(roundedRect(m, cut, cut, 0.4), d.plateT + 2).translate([
      0,
      0,
      top - d.plateT - 1,
    ]);
    if (d.sw.stem !== 'mx') return hole;

    // Snap notches under the MX clips. The plate prints as a bridge over
    // the cavity, and a bridge sags: its underside comes out a few tenths low,
    // the plate ends up thicker than the 1.5 mm the clips are moulded for, and
    // the switch sits in by friction instead of clicking home. Thinning the
    // plate to MX_CLIP_PLATE just where the clips catch makes them snap
    // whatever the bridge does, without loosening the hole itself.
    const relief = d.plateT - MX_CLIP_PLATE;
    if (relief <= 0.01) return hole;
    const notch = m.Manifold.cube([MX_CLIP_W, cut + 2 * MX_CLIP_REACH, relief + 1], true).translate([
      0,
      0,
      top - d.plateT + (relief - 1) / 2,
    ]);
    return m.Manifold.union([hole, notch, notch.rotate([0, 0, 90])]);
  }

  const wellSize = d.keySize + 2 * d.clear + 0.4;
  const well = m.Manifold.extrude(
    roundedRect(m, wellSize, wellSize, d.capCorner + d.clear),
    d.wellDepth + 1,
  ).translate([0, 0, top - d.wellDepth]);

  // Seat for the dome to sit flat in, and a clear path for the post.
  const seat = m.Manifold.cylinder(
    d.domeH + 0.4,
    d.domeR + d.clear,
    d.domeR + d.clear,
    segmentsForRadius(d.domeR, 0.1),
  ).translate([0, 0, top - d.wellDepth - d.domeH - 0.4 + 0.001]);

  return m.Manifold.union([well, seat]);
}

/**
 * The guide post for the printed variant: the keycap slides on it, and the barb
 * at the top is what stops the cap leaving when the dome pushes it back.
 *
 * A post rather than a bore, because a post prints as a clean vertical column
 * while a bore of the same size puts the retaining lip on an internal overhang
 * you cannot see, let alone deburr.
 */
function buildPost(ctx: BuildCtx, d: Derived): Manifold {
  const { m } = ctx;
  const segs = segmentsForRadius(d.postR, 0.08);
  const floor = d.plateTop - d.wellDepth - d.domeH - 0.4;

  // Reach DOWN into the floor as well as up out of it. A post that merely
  // stands on the seat meets it on one plane, and a plane of contact is not a
  // join: it serialises as a separate shell and prints as a loose pin.
  const root = Math.min(d.floorT * 0.7, 1.5);
  const shaft = m.Manifold.cylinder(d.postH + root, d.postR, d.postR, segs)
    .translate([0, 0, -root]);
  // 30 degrees on, 45 degrees off: pushes together by hand, comes apart with a
  // deliberate pull rather than never.
  const barbR = d.postR + Math.max(0.35, d.clear + 0.25);
  const barb = m.Manifold.union([
    m.Manifold.cylinder(0.9, d.postR, barbR, segs),
    m.Manifold.cylinder(0.7, barbR, d.postR, segs).translate([0, 0, 0.9]),
  ]).translate([0, 0, d.postH - 1.6]);

  return m.Manifold.union([shaft, barb]).translate([0, 0, floor]);
}

/** Keyring loop, on the end of the bar or on its long side. */
function addLoop(ctx: BuildCtx, d: Derived, base: Manifold): Manifold {
  const { m } = ctx;
  const lugR = d.loopD / 2 + Math.max(1.8, d.wallT);
  const thickness = Math.min(d.baseH * 0.6, lugR * 1.6);
  const z = d.baseH / 2;

  // The tab is the hull of the ring and a strip buried in the body, so its
  // sides run straight from the wall to the ring. A rounded web joined to a
  // circle instead pinches in where the two meet, and that waist reads as a
  // dent halfway along the tab.
  // Only half a wall deep, so the strip never reaches into the switch cavity.
  const sink = d.wallT / 2;
  let centre: [number, number];
  let root: CrossSection;
  if (d.loopSide === 'side') {
    const cy = d.baseD / 2 + lugR - 1.4;
    centre = [0, cy];
    root = m.CrossSection.square([lugR * 2, sink], true).translate([0, d.baseD / 2 - sink / 2]);
  } else {
    const cx = d.baseW / 2 + lugR - 1.4;
    centre = [cx, 0];
    root = m.CrossSection.square([sink, lugR * 2], true).translate([d.baseW / 2 - sink / 2, 0]);
  }

  const tab = m.CrossSection.hull([m.CrossSection.circle(lugR, 48).translate(centre), root]);
  const lug = m.Manifold.extrude(tab, thickness).translate([0, 0, z - thickness / 2]);
  const hole = m.Manifold.cylinder(thickness + 4, d.loopD / 2, d.loopD / 2, 32)
    .translate([centre[0], centre[1], z - thickness / 2 - 2]);

  return base.add(lug).subtract(hole);
}

