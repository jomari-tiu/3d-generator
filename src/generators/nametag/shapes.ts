import type { CrossSection, ManifoldToplevel } from 'manifold-3d';
import { ellipse, filletProfile, ngon, pill, roundedRect } from '../../core/kernel/primitives';

/**
 * Plate silhouettes.
 *
 * The blob shapes (cloud, bubble, scallop) are built at whatever size falls out
 * of their own construction and then fitted to the requested box, rather than
 * having every lobe solve for the bounding box. Everything downstream -- auto
 * sizing, hole placement, the frame offset -- assumes the plate spans exactly
 * w x h centred on the origin, so that normalisation is load-bearing, not
 * cosmetic.
 */

/** Translate and scale a section so it spans exactly w x h about the origin. */
function fitTo(section: CrossSection, w: number, h: number): CrossSection {
  const b = section.bounds();
  const bw = b.max[0] - b.min[0];
  const bh = b.max[1] - b.min[1];
  if (!(bw > 1e-6) || !(bh > 1e-6)) return section;
  return section
    .translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2])
    .scale([w / bw, h / bh]);
}

/**
 * Cartoon cloud, traced off the shape everyone draws: a tall dome over the
 * middle, a smaller puff on its left shoulder, fat round ends, and a row of
 * scallops hanging off the bottom.
 *
 * The circles are MEASURED off that drawing rather than generated, because
 * every attempt to generate one lands somewhere between a caterpillar and a
 * wavy slab. What makes it read as a cloud is the things a formula smooths
 * away: the ends are different sizes, the dome is off centre, and the
 * scallops along the bottom are nearly tangent, so the notches between them
 * are deep. Positions are in plate heights with the origin at the plate
 * centre, and they lay the drawing out at exactly NATIVE_ASPECT x 1.
 *
 * A tag is usually wider than the drawing, so the middle -- the dome and the
 * scallop row -- repeats to fill whatever is asked for while the two ends stay
 * exactly as measured. Stretching instead would turn every circle in it into
 * an oval, which is the one thing a cloud cannot survive.
 */
type Circle = readonly [x: number, y: number, r: number];

const NATIVE_ASPECT = 1.675;
const CLOUD_STRETCH = 1.3; // how wide the drawing may be pulled before it repeats
const CLOUD_ENDS: readonly Circle[] = [
  [-0.603, -0.069, 0.234], // left end
  [-0.344, 0.15, 0.172], // the small puff on its shoulder
];
const CLOUD_RIGHT_END: Circle = [0.494, -0.069, 0.344];
const CLOUD_DOME: Circle = [0.084, 0.203, 0.297];
const DOME_PITCH = 0.43;
const SCALLOP: Circle = [-0.406, -0.328, 0.172];
const SCALLOP_LAST_X = 0.25;
const SCALLOP_PITCH = 0.328;
/**
 * The middle of the drawing is a hole -- the circles only make its outline --
 * so this fills it. Its edges sit inside every one of them: below the notches
 * between the domes, above the notches between the scallops, and clear of both
 * ends. Push any of them past that and it fills in the feature it is passing.
 */
const BODY = { left: -0.48, right: 0.4, bottom: -0.27, top: 0.2 };

export function cloudSection(m: ManifoldToplevel, w: number, h: number): CrossSection {
  // How much wider than the drawing this tag is, in plate heights, after
  // letting fitTo stretch by up to CLOUD_STRETCH first.
  //
  // A cloud drawing has no 3:1 version: repeat its middle far enough and the
  // row of domes and scallops reads as a caterpillar. A modest stretch is the
  // gentler of the two distortions, so wide tags spend that before repeating
  // anything. Narrower than the drawing is left to fitTo to squeeze -- a
  // slightly chubby cloud is still a cloud, and auto sizing never asks for one.
  //
  // Half of it goes to each side, so the drawing's tallest dome stays over the
  // middle of the plate. Growing only to the right walks it off centre, and
  // the hanging hole -- which goes at top centre -- ends up over a notch
  // between two domes with nothing to be cut out of.
  const half = Math.max(0, w / h / CLOUD_STRETCH - NATIVE_ASPECT) / 2;

  const circles: Circle[] = [
    ...CLOUD_ENDS.map(([x, y, r]): Circle => [x - half, y, r]),
    [CLOUD_RIGHT_END[0] + half, CLOUD_RIGHT_END[1], CLOUD_RIGHT_END[2]],
  ];

  // Domes across the top, spread either side of the drawing's one. The middle
  // of the run keeps its full height, and they shrink going outward, so a long
  // cloud comes out as a run of domes rather than a row of identical humps.
  const domes = 1 + 2 * Math.round(half / DOME_PITCH);
  const middle = (domes - 1) / 2;
  for (let i = 0; i < domes; i++) {
    const off = Math.abs(i - middle);
    circles.push([
      CLOUD_DOME[0] + (domes === 1 ? 0 : (i / (domes - 1) - 0.5) * 2 * half),
      CLOUD_DOME[1] - 0.02 * off,
      CLOUD_DOME[2] * Math.max(0.8, 1 - 0.09 * off),
    ]);
  }

  // Scallops along the bottom, at the drawing's spacing, evened out over
  // however far they have to reach.
  const span = SCALLOP_LAST_X + half - (SCALLOP[0] - half);
  const scallops = Math.max(2, Math.round(span / SCALLOP_PITCH) + 1);
  for (let i = 0; i < scallops; i++) {
    circles.push([SCALLOP[0] - half + (span * i) / (scallops - 1), SCALLOP[1], SCALLOP[2]]);
  }

  const pieces = circles.map(([x, y, r]) =>
    m.CrossSection.circle(r * h, 64).translate([x * h, y * h]),
  );
  pieces.push(
    m.CrossSection.square(
      [(BODY.right - BODY.left + 2 * half) * h, (BODY.top - BODY.bottom) * h],
      true,
    ).translate([((BODY.left + BODY.right) / 2) * h, ((BODY.bottom + BODY.top) / 2) * h]),
  );

  // The scallops are nearly tangent, so the notches between them come to a
  // point: a stress riser, and a place the slicer leaves a void. Knocking them
  // off wants a CLOSING (dilate then erode) -- an opening would erode the
  // whole blob and quietly shrink the plate out from under the lettering. Kept
  // small, because those notches are most of what says "cloud".
  return fitTo(filletProfile(m.CrossSection.union(pieces), h * 0.022, 24), w, h);
}

/**
 * Speech-bubble blob: fewer, fatter lobes than the cloud, nudged off the
 * centreline so the outline is deliberately not symmetric.
 */
export function bubbleSection(m: ManifoldToplevel, w: number, h: number): CrossSection {
  const r = h * 0.44;
  const span = Math.max(r, w - 2.1 * r);
  // Symmetric and odd, for the same reason as the cloud, and spaced well
  // inside the lobe diameter so the valleys stay shallow enough to write across.
  const k = Math.max(1, Math.ceil(span / 2 / (r * 0.85)));
  const step = span / 2 / k;

  // Enough wobble to read as hand-drawn, not enough to bite into the middle.
  const wobbleY = [0.03, -0.025, 0.02, -0.03, 0.015, -0.02];
  const wobbleR = [1, 0.93, 1.04, 0.95, 0.99, 0.96];
  const pick = <T,>(a: readonly T[], i: number): T => a[((i % a.length) + a.length) % a.length]!;

  const pieces: CrossSection[] = [];
  for (let i = -k; i <= k; i++) {
    pieces.push(
      m.CrossSection.circle(r * pick(wobbleR, i), 48).translate([
        i * step,
        // The centre lobe stays on the axis so the hanging hole has full meat.
        i === 0 ? h * 0.02 : h * pick(wobbleY, i),
      ]),
    );
  }
  pieces.push(m.CrossSection.square([span, h - 1.1 * r], true));

  return fitTo(filletProfile(m.CrossSection.union(pieces), r * 0.14, 24), w, h);
}

/**
 * Walk a section's outer ring and return points spaced evenly along it.
 *
 * Spacing is recomputed from the true perimeter so the last point never lands
 * on top of the first -- an uneven seam is the one thing that gives a
 * decorative edge away.
 */
function samplePerimeter(
  section: CrossSection,
  spacing: number,
  anchor?: readonly [number, number],
): [number, number][] {
  const rings = section.toPolygons();
  if (rings.length === 0) return [];

  // Largest ring by |area| is the outline; the rest are holes.
  let ring = rings[0]!;
  let best = -Infinity;
  for (const r of rings) {
    let a = 0;
    for (let i = 0; i < r.length; i++) {
      const p = r[i]!;
      const q = r[(i + 1) % r.length]!;
      a += p[0] * q[1] - q[0] * p[1];
    }
    if (Math.abs(a) > best) {
      best = Math.abs(a);
      ring = r;
    }
  }
  if (ring.length < 3) return [];

  const segs: number[] = [];
  let perimeter = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    segs.push(d);
    perimeter += d;
  }
  if (!(perimeter > 0)) return [];

  const count = Math.max(6, Math.round(perimeter / Math.max(spacing, 1e-3)));
  const step = perimeter / count;

  // Start the run at the point on the outline nearest the anchor, so a caller
  // can guarantee a bump lands somewhere specific -- top centre, where the
  // hanging hole goes. Without this the phase falls wherever Clipper2 happened
  // to start the ring, and at some widths that is a gap.
  //
  // The nearest POINT, projected onto each segment, not the nearest vertex: a
  // rounded rectangle's top edge is one straight segment between two corner
  // arcs, with no vertex anywhere near its middle.
  let phase = 0;
  if (anchor) {
    let bestD = Infinity;
    let run = 0;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]!;
      const q = ring[(i + 1) % ring.length]!;
      const len = segs[i]!;
      let t = 0;
      if (len > 1e-9) {
        t = ((anchor[0] - p[0]) * (q[0] - p[0]) + (anchor[1] - p[1]) * (q[1] - p[1])) / (len * len);
        t = Math.min(1, Math.max(0, t));
      }
      const d = Math.hypot(p[0] + (q[0] - p[0]) * t - anchor[0], p[1] + (q[1] - p[1]) * t - anchor[1]);
      if (d < bestD) {
        bestD = d;
        phase = run + t * len;
      }
      run += len;
    }
  }

  const out: [number, number][] = [];
  let seg = 0;
  let along = 0;
  for (let k = 0; k < count; k++) {
    const target = (phase + k * step) % perimeter;
    if (target < along) {
      // Wrapped past the seam: restart the walk rather than scan backwards.
      seg = 0;
      along = 0;
    }
    while (seg < segs.length - 1 && along + segs[seg]! < target) {
      along += segs[seg]!;
      seg++;
    }
    const len = segs[seg]!;
    const t = len > 1e-9 ? (target - along) / len : 0;
    const p = ring[seg]!;
    const q = ring[(seg + 1) % ring.length]!;
    out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
  }
  return out;
}

/**
 * Scalloped edge: a core shape with overlapping bumps all the way round.
 *
 * The bumps are placed on the outline of a core inset by one bump radius, so
 * they reach the requested box rather than growing past it. Spacing is under
 * two radii on purpose -- adjacent bumps have to overlap, or the edge comes out
 * as a string of beads joined by pinch points.
 */
export function scallopSection(
  m: ManifoldToplevel,
  w: number,
  h: number,
  corner: number,
): CrossSection {
  const bumpR = Math.max(0.8, Math.min(h, w) * 0.15);
  const core = roundedRect(
    m,
    Math.max(1, w - 2 * bumpR),
    Math.max(1, h - 2 * bumpR),
    Math.max(0, corner - bumpR),
  );
  // Anchored at top centre: that is where a hanging hole goes, and a gap there
  // would leave it with no plate to be cut out of.
  const points = samplePerimeter(core, bumpR * 1.6, [0, h / 2]);
  if (points.length === 0) return fitTo(core, w, h);

  const bumps = points.map(([x, y]) =>
    m.CrossSection.circle(bumpR, 20).translate([x, y]),
  );
  return fitTo(m.CrossSection.union([core, ...bumps]), w, h);
}

export function plateSection(
  m: ManifoldToplevel,
  shape: string,
  w: number,
  h: number,
  corner: number,
): CrossSection {
  switch (shape) {
    case 'pill':
      return pill(m, w, h);
    case 'ellipse':
      return ellipse(m, w, h);
    case 'hex':
      // Flat-top hexagon scaled to the requested bounding box.
      return ngon(m, 0.5, 6).rotate(90).scale([w, h]);
    case 'cloud':
      return cloudSection(m, w, h);
    case 'bubble':
      return bubbleSection(m, w, h);
    case 'scallop':
      return scallopSection(m, w, h, corner);
    default:
      return roundedRect(m, w, h, corner);
  }
}

/**
 * The part of the bounding box a shape can actually be written in: how much of
 * each axis, and where the middle of it sits.
 *
 * A rectangle gives you all of it; a bubble's valleys cut into the middle of
 * the top and bottom edges, so auto-sizing has to divide the text box up by
 * these before adding padding, or the lettering ends up sitting in a lobe.
 * `cy` exists for shapes that are not symmetric top to bottom -- the cloud
 * keeps its writing surface low, under the puffs -- and is a fraction of the
 * plate height, negative downward.
 */
export interface SafeArea {
  readonly x: number;
  readonly y: number;
  readonly cy: number;
  /** Least width-to-height the shape still looks like itself at. 0 = any. */
  readonly minAspect: number;
}

export function safeArea(shape: string): SafeArea {
  switch (shape) {
    // These are MEASURED, not estimated: the largest rectangle that fits,
    // taken at the worst aspect ratio each shape is likely to be asked for
    // (roughly 1.2:1 through 4:1), then rounded down. Guessing them from the
    // body rectangle under the lobes is far too pessimistic and makes a cloud
    // come out square; guessing from the lobe peaks is too optimistic and puts
    // the lettering in a valley.
    case 'cloud':
      return { x: 0.66, y: 0.5, cy: -0.11, minAspect: 1.45 };
    case 'bubble':
      return { x: 0.7, y: 0.72, cy: 0, minAspect: 0 };
    case 'scallop':
      return { x: 0.82, y: 0.8, cy: 0, minAspect: 0 };
    case 'pill':
      // Round ends take a bite out of each end of the writable box, and the
      // squarest pill loses the most, so this is measured at 1.5:1.
      return { x: 0.76, y: 0.75, cy: 0, minAspect: 0 };
    case 'ellipse':
      // An inscribed rectangle in an ellipse is 1/sqrt(2) of each axis.
      return { x: 0.7, y: 0.7, cy: 0, minAspect: 0 };
    case 'hex':
      // Point-top, so the height it can offer and the width it can offer are
      // in direct competition -- the widest usable box is a low one.
      return { x: 0.68, y: 0.6, cy: 0, minAspect: 0 };
    default:
      return { x: 1, y: 1, cy: 0, minAspect: 0 };
  }
}

export interface Tab {
  readonly outline: CrossSection;
  readonly hole: CrossSection;
}

/**
 * The hanging tab: a loop added ABOVE the plate rather than a hole taken out
 * of it, for shapes with no square inch to spare.
 *
 * It overlaps back into the plate so the union has real depth of engagement --
 * a tab meeting the silhouette on a tangent is a hairline contact, and on a
 * scalloped edge it would land in a valley and hold on by nothing.
 */
export function tabSection(
  m: ManifoldToplevel,
  plateW: number,
  plateH: number,
  holeDiameter: number,
): Tab {
  const wall = Math.max(1.6, holeDiameter * 0.5);
  const tabW = Math.min(Math.max(plateW * 0.2, holeDiameter * 3), plateW * 0.5);
  const stand = holeDiameter + 2 * wall;
  const overlap = Math.min(plateH * 0.35, stand * 0.8);
  const total = stand + overlap;

  const cy = plateH / 2 + stand / 2 - overlap / 2;
  const outline = roundedRect(m, tabW, total, Math.min(tabW, total) * 0.38).translate([0, cy]);

  const slotLen = Math.min(holeDiameter * 1.9, tabW - 2 * wall);
  const hole = roundedRect(m, slotLen, holeDiameter, holeDiameter / 2).translate([
    0,
    plateH / 2 + stand / 2,
  ]);

  return { outline, hole };
}
