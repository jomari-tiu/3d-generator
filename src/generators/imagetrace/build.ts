import type { CrossSection, Manifold } from 'manifold-3d';
import { dropSlivers, roundedRect, segmentsForRadius } from '../../core/kernel/primitives';
import { serialize } from '../../core/kernel/serialize';
import { EmptyTraceError, sectionFromRings } from '../../core/image/section';
import { transformCommands } from '../../core/image/simplify';
import { ringsToSvg } from '../../core/image/svg';
import { traceBitmap } from '../../core/image/trace';
import type { MaskSource, DiagonalPolicy } from '../../core/image/types';
import type { BuildCtx, BuildResult, Generator, Issue, Params, Part } from '../../core/params/types';
import { hasThinStrokes } from '../../core/text/textSolid';
import { imageTraceGroups, imageTraceParams } from './schema';

/** Plate left around a hole, and the floor on a hanging lug's wall. */
const MIN_WALL = 1.2;
/** Volume below which a leftover shell is debris rather than a feature. */
const SLIVER_MM3 = 0.02;

/**
 * Pixels the tracer is allowed to work on.
 *
 * The decoder downscales to this on the way in, so the cost of a build is
 * bounded by the setting and not by whatever a phone camera produced. It is
 * declared here rather than in the UI because it is a TRACING decision: past
 * roughly this, extra pixels stop adding shape and start adding JPEG noise for
 * the despeckle filter to take straight back out.
 */
export const MAX_TRACE_PIXELS = 768;

/**
 * The plate behind the artwork, grown on one side when a hole needs somewhere
 * to live.
 *
 * The band is added to the PLATE rather than taken out of the margin, and the
 * plate is what moves: the artwork stays centred on the origin throughout, so
 * everything downstream -- the relief, the cutter, the SVG -- can go on
 * assuming the traced shape is where it was built.
 */
function plateAndHole(
  ctx: BuildCtx,
  p: Params,
  artW: number,
  artH: number,
): { plate: CrossSection; hole: CrossSection | null; width: number; height: number } {
  const { m } = ctx;
  const margin = Number(p.margin);
  const wantHole = p.hole === true;
  const holeD = Number(p.holeDiameter);
  const inset = Number(p.holeEdgeOffset);
  const position = String(p.holePosition);

  let width = artW + 2 * margin;
  let height = artH + 2 * margin;
  let cx = 0;
  let cy = 0;

  if (wantHole) {
    // Enough for the hole itself plus its inset on the outside and a wall on
    // the inside, so the hole never has to eat into the artwork's margin.
    const band = holeD + inset + MIN_WALL;
    if (position === 'top') {
      height += band;
      cy = band / 2;
    } else {
      width += band;
      cx = position === 'left' ? -band / 2 : band / 2;
    }
  }

  const plate = roundedRect(m, width, height, Number(p.corner)).translate([cx, cy]);
  if (!wantHole) return { plate, hole: null, width, height };

  const r = holeD / 2;
  const centre: [number, number] =
    position === 'top'
      ? [0, cy + height / 2 - inset - r]
      : position === 'left'
        ? [cx - width / 2 + inset + r, 0]
        : [cx + width / 2 - inset - r, 0];

  return {
    plate,
    hole: m.CrossSection.circle(r, segmentsForRadius(r)).translate(centre),
    width,
    height,
  };
}

/**
 * A hanging lug for the silhouette style, which has no plate to put a hole in.
 *
 * Pushed OUTWARD from the artwork's edge by slightly less than its own radius,
 * so it overlaps the silhouette solidly instead of touching it. A tangent lug
 * would render perfectly, pass every manifoldness check and print as a loose
 * ring -- the coplanar-contact trap this project has hit repeatedly.
 */
function hangingLug(
  ctx: BuildCtx,
  p: Params,
  art: CrossSection,
): { lug: CrossSection; hole: CrossSection } {
  const { m } = ctx;
  const holeD = Number(p.holeDiameter);
  const r = holeD / 2;
  const wall = Math.max(MIN_WALL, Number(p.holeEdgeOffset));
  const lugR = r + wall;
  const overlap = Math.min(lugR * 0.7, 1.5);
  const b = art.bounds();
  const position = String(p.holePosition);

  const centre: [number, number] =
    position === 'top'
      ? [0, b.max[1] + lugR - overlap]
      : position === 'left'
        ? [b.min[0] - lugR + overlap, 0]
        : [b.max[0] + lugR - overlap, 0];

  return {
    lug: m.CrossSection.circle(lugR, segmentsForRadius(lugR)).translate(centre),
    hole: m.CrossSection.circle(r, segmentsForRadius(r)).translate(centre),
  };
}

/** Holes in a section: total contours minus connected pieces. */
function counterCount(section: CrossSection): number {
  return Math.max(0, section.numContour() - section.decompose().length);
}

function build(p: Params, ctx: BuildCtx): BuildResult {
  const { m } = ctx;
  const issues: Issue[] = [];

  const id = String(p.image ?? '');
  const bmp = ctx.image(id);
  if (!bmp) {
    return {
      parts: [],
      issues: [
        {
          level: 'error',
          message:
            id.length > 0
              ? 'That picture is not on this device. Images stay on the machine they were dropped into, so a shared link brings the settings but not the artwork - drop the file in again.'
              : 'Drop a picture in to trace.',
          paramIds: ['image'],
        },
      ],
    };
  }

  // ------------------------------------------------------------------ trace
  const trace = traceBitmap(bmp, {
    source: String(p.source) as MaskSource,
    threshold: Number(p.threshold),
    invert: p.invert === true,
    despeckle: Number(p.despeckle),
    diagonal: String(p.diagonal) as DiagonalPolicy,
    detail: Number(p.detail),
    smooth: Number(p.smooth) / 100,
    cornerAngle: Number(p.cornerAngle),
  });

  if (!trace.bounds) {
    return {
      parts: [],
      issues: [
        {
          level: 'error',
          message:
            'Nothing came through at this threshold - the whole picture read as blank paper. Move the threshold, or turn Invert on if the artwork is light on a dark background.',
          paramIds: ['threshold', 'invert', 'source'],
        },
      ],
    };
  }

  const pxW = trace.bounds.max[0] - trace.bounds.min[0];
  const pxH = trace.bounds.max[1] - trace.bounds.min[1];
  if (!(pxW > 0) || !(pxH > 0)) {
    return {
      parts: [],
      issues: [
        { level: 'error', message: 'That traced to a single line with no area.', paramIds: ['threshold'] },
      ],
    };
  }

  const width = Number(p.width);
  const mmPerPixel =
    String(p.fitMode) === 'box' ? Math.min(width / pxW, Number(p.height) / pxH) : width / pxW;

  let art: CrossSection;
  try {
    art = sectionFromRings(m, trace.rings, { mmPerPixel, tolerance: ctx.tolerance });
  } catch (err) {
    // Rings with area in pixels can still flatten to nothing once they are
    // scaled into millimetres and cleaned at the build tolerance. That is a
    // thing to explain, not a crash to hand to the runner.
    if (!(err instanceof EmptyTraceError)) throw err;
    return {
      parts: [],
      issues: [
        {
          level: 'error',
          message:
            'What came through is too fine to survive at this size. Make the artwork bigger, or raise Despeckle to drop the specks.',
          paramIds: ['width', 'despeckle', 'threshold'],
        },
      ],
    };
  }
  const ab = art.bounds();
  const artW = ab.max[0] - ab.min[0];
  const artH = ab.max[1] - ab.min[1];

  // -------------------------------------------------------------------- svg
  // The same rings the kernel is about to extrude, moved so the artwork's own
  // top-left corner is the origin -- an SVG whose page is the drawing, not the
  // source photograph with the subject somewhere in it.
  const svg = ringsToSvg(
    trace.rings.map((r) =>
      transformCommands(r, mmPerPixel, -trace.bounds!.min[0] * mmPerPixel, -trace.bounds!.min[1] * mmPerPixel),
    ),
    {
      widthMm: pxW * mmPerPixel,
      heightMm: pxH * mmPerPixel,
      fill: String(p.imageColor),
      title: bmp.name ?? 'Traced image',
    },
  );

  // ------------------------------------------------------------- advisories
  const style = String(p.style);
  const nozzle = Number(p.nozzle);
  const pieces = art.decompose().length;
  const counters = counterCount(art);

  if (hasThinStrokes(art, nozzle)) {
    issues.push({
      level: 'warn',
      message:
        style === 'cutout'
          ? `Parts of the cut-out are narrower than the ${nozzle} mm nozzle and will close up. Make it bigger, or raise Detail to simplify the outline.`
          : `Parts of the artwork are thinner than the ${nozzle} mm nozzle and may not print. Make it bigger, raise Detail, or raise Despeckle.`,
      paramIds: ['width', 'detail', 'despeckle'],
    });
  }

  if (style === 'silhouette' && pieces > 1) {
    issues.push({
      level: 'warn',
      message: `The artwork is ${pieces} separate pieces, which print as ${pieces} loose parts. Back it with a plate, or raise Despeckle to drop the small ones.`,
      paramIds: ['style', 'despeckle'],
    });
  }
  if (style === 'cutout' && counters > 0) {
    issues.push({
      level: 'warn',
      message: `Cutting this through leaves ${counters} island${counters === 1 ? '' : 's'} with nothing holding ${counters === 1 ? 'it' : 'them'} - the middle of an O, for instance. They print as loose pieces.`,
      paramIds: ['style'],
    });
  }
  if (trace.inkFraction > 0.92) {
    issues.push({
      level: 'warn',
      message:
        'Almost the whole picture is reading as ink, so this is tracing as little more than a rectangle. Move the threshold down, or turn Invert off.',
      paramIds: ['threshold', 'invert', 'source'],
    });
  }
  if (trace.ringCount > 250) {
    issues.push({
      level: 'warn',
      message: `${trace.ringCount} separate outlines came out of this image. That is usually noise rather than artwork - raise Despeckle or Detail, or move the threshold.`,
      paramIds: ['despeckle', 'detail', 'threshold'],
    });
  }

  const thickness = Number(p.thickness);
  const relief = Number(p.relief);
  if (style === 'engraved' && relief >= thickness) {
    issues.push({
      level: 'error',
      message: 'The engraving is as deep as the plate is thick - it would cut straight through.',
      paramIds: ['relief', 'thickness'],
    });
  }

  // ------------------------------------------------------------------- 3D
  const parts: Part[] = [];
  const artColor = String(p.imageColor);
  const plateColor = String(p.plateColor);
  const readouts: Record<string, string> = {};

  if (style === 'silhouette') {
    let section = art;
    let hole: CrossSection | null = null;
    if (p.hole === true) {
      const lug = hangingLug(ctx, p, art);
      if (lug.lug.intersect(art).area() < 0.5) {
        issues.push({
          level: 'warn',
          message:
            'The hanging lug barely meets the artwork and may snap off or print loose. Try another hole position, or back the artwork with a plate.',
          paramIds: ['holePosition', 'style'],
        });
      }
      section = art.add(lug.lug);
      hole = lug.hole;
    }
    let solid: Manifold = section.extrude(thickness);
    if (hole) solid = solid.subtract(hole.extrude(thickness + 2).translate([0, 0, -1]));
    parts.push({ id: 'artwork', name: 'Artwork', mesh: serialize(solid), color: artColor });

    const sb = section.bounds();
    readouts.Size = `${(sb.max[0] - sb.min[0]).toFixed(1)} x ${(sb.max[1] - sb.min[1]).toFixed(1)} x ${thickness.toFixed(1)} mm`;
  } else {
    const { plate: plate2d, hole, width: plateW, height: plateH } = plateAndHole(ctx, p, artW, artH);

    if (hole) {
      const guard = hole.offset(MIN_WALL, 'Round', 2, 24);
      if (guard.intersect(art).area() > 0.05) {
        issues.push({
          level: 'warn',
          message: `The hole comes within ${MIN_WALL} mm of the artwork. Raise the plate margin or move the hole.`,
          paramIds: ['margin', 'holePosition', 'holeEdgeOffset'],
        });
      }
    }

    let plate: Manifold = plate2d.extrude(thickness);
    if (hole) plate = plate.subtract(hole.extrude(thickness + 2).translate([0, 0, -1]));

    if (style === 'engraved') {
      // Overshoot upward so the cutter's top face is never coplanar with the
      // plate's.
      const cutter = art.extrude(relief + 1).translate([0, 0, thickness - relief]);
      parts.push({ id: 'plate', name: 'Plaque', mesh: serialize(plate.subtract(cutter)), color: plateColor });
    } else if (style === 'cutout') {
      const cutter = art.extrude(thickness + 2).translate([0, 0, -1]);
      parts.push({ id: 'plate', name: 'Stencil', mesh: serialize(plate.subtract(cutter)), color: plateColor });
    } else {
      // Raised: extruded from z = 0 through the plate so the two solids have a
      // real overlap, then trimmed back against it. dropSlivers clears the
      // numerically-flat shells that trimming leaves where the two surfaces
      // very nearly coincide.
      const raised = dropSlivers(m, art.extrude(thickness + relief).subtract(plate), SLIVER_MM3);
      parts.push({ id: 'plate', name: 'Plate', mesh: serialize(plate), color: plateColor, group: 'plaque' });
      parts.push({ id: 'artwork', name: 'Artwork', mesh: serialize(raised), color: artColor, group: 'plaque' });
    }

    const tall = thickness + (style === 'plaque' ? relief : 0);
    readouts.Size = `${plateW.toFixed(1)} x ${plateH.toFixed(1)} x ${tall.toFixed(1)} mm`;
  }

  readouts.Artwork = `${artW.toFixed(1)} x ${artH.toFixed(1)} mm`;
  readouts.Traced = `${bmp.width} x ${bmp.height} px`;
  readouts.Outlines =
    counters > 0
      ? `${pieces} piece${pieces === 1 ? '' : 's'}, ${counters} hole${counters === 1 ? '' : 's'}, ${trace.pointCount} points`
      : `${pieces} piece${pieces === 1 ? '' : 's'}, ${trace.pointCount} points`;

  return {
    parts,
    issues,
    readouts,
    vectors: [
      {
        id: 'svg',
        label: 'SVG',
        extension: 'svg',
        mime: 'image/svg+xml',
        title: 'The traced outline as a vector file, in millimetres',
        data: svg,
      },
    ],
  };
}

export const imageTraceGenerator: Generator = {
  id: 'image',
  name: 'Image to SVG',
  description:
    'Trace a picture into clean vector outlines, download it as an SVG, and print it as a plaque, a silhouette or a stencil.',
  tagline: 'Drop in a logo, get an SVG and a printable part',
  highlights: [
    'Silhouette tracing with threshold, invert and despeckle',
    'Douglas-Peucker simplification and corner-preserving smoothing',
    'SVG download in true millimetres, holes and all',
    'Raised, engraved, cut-through or bare silhouette',
    'Warns about strokes too fine for your nozzle',
  ],
  art: `<svg viewBox="0 0 120 96" role="img" aria-hidden="true">
    <defs><linearGradient id="iv-p" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8a7bf0"/><stop offset="1" stop-color="#4c9ffe"/>
    </linearGradient></defs>
    <rect x="10" y="20" width="44" height="56" rx="5" fill="#14161a" fill-opacity="0.35"/>
    <g fill="#f2f4f8" fill-opacity="0.75">
      <rect x="16" y="30" width="8" height="8"/><rect x="24" y="26" width="8" height="8"/>
      <rect x="32" y="34" width="8" height="8"/><rect x="20" y="42" width="8" height="8"/>
      <rect x="28" y="46" width="8" height="8"/><rect x="36" y="54" width="8" height="8"/>
      <rect x="22" y="58" width="8" height="8"/><rect x="30" y="62" width="8" height="8"/>
    </g>
    <path d="M60 48 h14" stroke="#7d8698" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M70 43 l6 5 -6 5" fill="none" stroke="#7d8698" stroke-width="2.4"
      stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M86 32 C92 26 108 30 110 42 C112 54 100 58 102 66 C104 74 92 78 86 72
             C80 66 88 60 86 52 C84 44 80 38 86 32 Z"
      fill="url(#iv-p)" stroke="#f2f4f8" stroke-opacity="0.9" stroke-width="2"/>
    <g fill="#f2f4f8">
      <circle cx="86" cy="32" r="2.6"/><circle cx="110" cy="42" r="2.6"/>
      <circle cx="102" cy="66" r="2.6"/><circle cx="86" cy="72" r="2.6"/>
    </g>
  </svg>`,
  params: imageTraceParams,
  groups: imageTraceGroups,
  imagesNeeded: (p) => [String(p.image ?? '')].filter((s) => s.length > 0),
  validate: (p) => {
    const out: Issue[] = [];
    if (String(p.image ?? '').length === 0) {
      out.push({ level: 'error', message: 'Drop a picture in to trace.', paramIds: ['image'] });
    }
    if (String(p.fitMode) === 'box' && p.hole === true && Number(p.margin) < 1) {
      out.push({
        level: 'warn',
        message: 'A hanging hole wants a millimetre or two of plate margin to sit in.',
        paramIds: ['margin'],
      });
    }
    return out;
  },
  build,
  presets: [
    {
      label: 'Logo plaque',
      values: { style: 'plaque', width: 70, margin: 6, corner: 5, thickness: 3, relief: 1.2 },
    },
    {
      label: 'Fridge magnet silhouette',
      values: { style: 'silhouette', width: 45, thickness: 2.4, smooth: 80, despeckle: 40 },
    },
    {
      label: 'Signature keychain',
      values: {
        style: 'plaque', width: 42, margin: 4, corner: 6, thickness: 2.4, relief: 0.8,
        hole: true, holeDiameter: 4, holePosition: 'left', detail: 0.8,
      },
    },
    {
      label: 'Spray stencil',
      values: {
        style: 'cutout', width: 90, margin: 8, corner: 3, thickness: 1.2,
        detail: 1.8, smooth: 40, despeckle: 60,
      },
    },
    {
      label: 'Engraved coaster',
      values: {
        style: 'engraved', fitMode: 'box', width: 70, height: 70, margin: 8,
        corner: 20, thickness: 4, relief: 0.8,
      },
    },
  ],
};
