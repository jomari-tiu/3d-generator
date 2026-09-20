import type { CrossSection, Manifold } from 'manifold-3d';
import type { Vec2 } from '../../core/text/flatten';
import { writeDxf } from '../../core/export/dxf';
import { xsec } from '../../core/kernel/manifold';
import { dropSlivers, roundedRect, segmentsForRadius } from '../../core/kernel/primitives';
import { serialize } from '../../core/kernel/serialize';
import {
  MAX_FEATURES,
  buildPattern,
  estimateFeatures,
  patternLabel,
  type PatternOptions,
} from '../../core/pattern';
import { ringsToSvg } from '../../core/image/svg';
import type { PathCommand } from '../../core/text/flatten';
import type {
  BuildCtx,
  BuildResult,
  Generator,
  Issue,
  Params,
  Part,
} from '../../core/params/types';
import { patternGroups, patternParams } from './schema';

/** Volume below which a leftover shell is debris rather than a feature. */
const SLIVER_MM3 = 0.02;
/** A wall needs two perimeters to be worth printing at all. */
const PERIMETERS = 2;

function optionsFrom(
  p: Params,
  radius: number,
  tolerance: number,
  seeds: number,
): PatternOptions {
  return {
    family: String(p.family) as PatternOptions['family'],
    tiling: String(p.tiling) as PatternOptions['tiling'],
    hole: String(p.hole) as PatternOptions['hole'],
    grid: String(p.grid) as PatternOptions['grid'],
    line: String(p.line) as PatternOptions['line'],
    cell: Number(p.cell),
    gap: Number(p.gap),
    aspect: Number(p.aspect),
    seeds,
    relax: Number(p.relax),
    seed: Number(p.seed),
    radius,
    angle: Number(p.angle),
    tolerance,
  };
}

/** The panel outline, centred on the origin. */
function panelSection(ctx: BuildCtx, p: Params): { section: CrossSection; radius: number } {
  const { m } = ctx;
  const shape = String(p.shape);
  if (shape === 'circle') {
    const r = Number(p.diameter) / 2;
    return { section: m.CrossSection.circle(r, segmentsForRadius(r)), radius: r };
  }
  const w = Number(p.width);
  const h = Number(p.height);
  const corner = shape === 'rounded' ? Number(p.corner) : 0;
  return { section: roundedRect(m, w, h, corner), radius: Math.hypot(w, h) / 2 };
}

/** Rings straight out of the kernel, as path commands for the SVG writer. */
function ringsToCommands(rings: readonly (readonly Vec2[])[]): PathCommand[][] {
  return rings.map((ring) => {
    const cmds: PathCommand[] = [{ type: 'M', x: ring[0]![0], y: ring[0]![1] }];
    for (let i = 1; i < ring.length; i++) cmds.push({ type: 'L', x: ring[i]![0], y: ring[i]![1] });
    cmds.push({ type: 'Z' });
    return cmds;
  });
}

function build(p: Params, ctx: BuildCtx): BuildResult {
  const { m } = ctx;
  const issues: Issue[] = [];

  const cell = Number(p.cell);
  const gap = Number(p.gap);
  if (gap >= cell) {
    return {
      parts: [],
      issues: [
        {
          level: 'error',
          message: `The web is as wide as the pitch, so there is nothing left to make a pattern out of. Reduce the web below ${cell} mm, or open the pitch up.`,
          paramIds: ['gap', 'cell'],
        },
      ],
    };
  }

  const { section: panel2d, radius } = panelSection(ctx, p);
  const border = Number(p.border);
  const family = String(p.family);

  // The field is a disc that must cover the panel whatever the rotation, so it
  // is sized off the half-diagonal. The lattice families get a couple of cells
  // of slack so a tile straddling the edge is still generated; voronoi has no
  // lattice to straddle and only needs to clear the corners.
  const field = family === 'voronoi' ? radius * 1.02 : radius + cell * 2;

  // "Cells" has to mean cells ON THE PANEL. The seeds are scattered over the
  // whole field disc, which is half again the area of a rectangular panel, so
  // asking for 70 and counting 42 is what the user would otherwise get -- and
  // they would reasonably read that as the control being broken.
  const panelArea = Math.max(panel2d.area(), 1e-6);
  const seeds =
    family === 'voronoi'
      ? Math.max(3, Math.round((Number(p.seeds) * Math.PI * field * field) / panelArea))
      : Number(p.seeds);
  const opts = optionsFrom(p, field, ctx.tolerance, seeds);

  const estimate = estimateFeatures(opts);
  if (estimate > MAX_FEATURES) {
    return {
      parts: [],
      issues: [
        {
          level: 'error',
          message: `That is about ${estimate.toLocaleString()} shapes across this panel, which is past what the app will build (${MAX_FEATURES.toLocaleString()}). Open the pitch up, or make the panel smaller.`,
          paramIds: ['cell', 'width', 'height', 'diameter', 'seeds'],
        },
      ],
    };
  }

  // The area the pattern is allowed into. The border is taken off the panel
  // rather than added around it, so the panel stays the size that was asked for.
  const inner = border > 0 ? panel2d.offset(-border, 'Round', 2, 32) : panel2d;
  if (!(inner.area() > 0.01)) {
    return {
      parts: [],
      issues: [
        {
          level: 'error',
          message: 'The border leaves no room for the pattern. Reduce it, or make the panel bigger.',
          paramIds: ['border'],
        },
      ],
    };
  }

  const rawRings = buildPattern(opts);
  if (rawRings.length === 0) {
    return {
      parts: [],
      issues: [
        { level: 'error', message: 'That combination produced no pattern.', paramIds: ['cell', 'gap'] },
      ],
    };
  }

  // NonZero, and a union rather than one section per ring: the stroke families
  // deliberately overlap themselves at every crossing, and only the fill rule
  // turns that into one solid instead of a stack of cancelling shapes.
  let pattern = xsec(m, rawRings, 'NonZero').simplify(ctx.tolerance * 0.25);
  pattern = pattern.intersect(inner);
  if (p.invert === true) pattern = inner.subtract(pattern);

  if (!(pattern.area() > 0.01)) {
    return {
      parts: [],
      issues: [
        {
          level: 'error',
          message: 'The pattern falls entirely outside the panel. Check the rotation and the border.',
          paramIds: ['angle', 'border'],
        },
      ],
    };
  }

  const mode = String(p.mode);
  const thickness = Number(p.thickness);
  const relief = Number(p.relief);
  const nozzle = Number(p.nozzle);

  // ------------------------------------------------------------- advisories
  const minWall = nozzle * PERIMETERS;
  if (gap < minWall) {
    issues.push({
      level: 'warn',
      message: `A ${gap} mm web is under ${minWall} mm, so it cannot hold ${PERIMETERS} perimeters at a ${nozzle} mm nozzle and will print as a gap or a smear.`,
      paramIds: ['gap', 'nozzle'],
    });
  }
  if (mode === 'engrave' && relief >= thickness) {
    issues.push({
      level: 'error',
      message: 'The engraving is as deep as the panel is thick - it would cut straight through.',
      paramIds: ['relief', 'thickness'],
    });
  }

  // What is LEFT of the panel once the pattern is taken out. For a grille that
  // has to be one piece; anything else is loose parts on the bed.
  const remainder = panel2d.subtract(pattern);
  if (mode === 'cut') {
    const pieces = remainder.decompose().length;
    if (pieces > 1) {
      issues.push({
        level: 'warn',
        message: `Cutting this through leaves ${pieces} separate pieces - the web does not all join up. Reduce the pitch, raise the web, or turn Invert off.`,
        paramIds: ['invert', 'gap', 'cell'],
      });
    }
    if (!(remainder.area() > 0.01)) {
      issues.push({
        level: 'error',
        message: 'Cutting this through removes the whole panel.',
        paramIds: ['invert', 'gap'],
      });
    }
  }

  // ------------------------------------------------------------------- 3D
  const parts: Part[] = [];
  const panelColor = String(p.panelColor);
  const patternColor = String(p.patternColor);
  const blocked = issues.some((i) => i.level === 'error');

  if (!blocked) {
    if (mode === 'cut') {
      const cutter = pattern.extrude(thickness + 2).translate([0, 0, -1]);
      parts.push({
        id: 'panel',
        name: 'Panel',
        mesh: serialize(panel2d.extrude(thickness).subtract(cutter)),
        color: panelColor,
      });
    } else if (mode === 'engrave') {
      const cutter = pattern.extrude(relief + 1).translate([0, 0, thickness - relief]);
      parts.push({
        id: 'panel',
        name: 'Panel',
        mesh: serialize(panel2d.extrude(thickness).subtract(cutter)),
        color: panelColor,
      });
    } else {
      // Raised: extruded from z = 0 through the panel so the two solids really
      // overlap, then trimmed back against it. dropSlivers clears the flat
      // shells trimming leaves where the surfaces very nearly coincide.
      const panel: Manifold = panel2d.extrude(thickness);
      const raised = dropSlivers(m, pattern.extrude(thickness + relief).subtract(panel), SLIVER_MM3);
      parts.push({ id: 'panel', name: 'Panel', mesh: serialize(panel), color: panelColor, group: 'panel' });
      parts.push({
        id: 'pattern',
        name: 'Pattern',
        mesh: serialize(raised),
        color: patternColor,
        group: 'panel',
      });
    }
  }

  // ------------------------------------------------------------- vector out
  // Straight off the SAME sections the solids came from, so the sketch you
  // extrude in Fusion and the part that comes off the printer cannot disagree.
  const patternRings = pattern.toPolygons();
  const outlineRings = panel2d.toPolygons();
  const dxf = writeDxf([
    { name: `PATTERN_${patternLabel(opts)}`, rings: patternRings },
    { name: 'PANEL_OUTLINE', rings: outlineRings },
  ]);

  const pb = panel2d.bounds();
  const svg = ringsToSvg(
    // SVG is Y-DOWN and the kernel is Y-up, so the rings are flipped on the way
    // out. Without it the pattern arrives in Inkscape mirrored, which on a
    // symmetric tiling is invisible until the one asymmetric case ships.
    ringsToCommands(
      [...patternRings, ...outlineRings].map((ring) =>
        ring.map(([x, y]): Vec2 => [x - pb.min[0], pb.max[1] - y]),
      ),
    ),
    {
      widthMm: pb.max[0] - pb.min[0],
      heightMm: pb.max[1] - pb.min[1],
      fill: patternColor,
      title: `${patternLabel(opts)} pattern`,
    },
  );

  const openArea = (pattern.area() / Math.max(panel2d.area(), 1e-9)) * 100;
  const readouts: Record<string, string> = {
    Panel:
      String(p.shape) === 'circle'
        ? `${Number(p.diameter).toFixed(1)} mm round x ${thickness.toFixed(1)} mm`
        : `${Number(p.width).toFixed(1)} x ${Number(p.height).toFixed(1)} x ${thickness.toFixed(1)} mm`,
    [mode === 'cut' ? 'Open area' : 'Pattern area']: `${openArea.toFixed(1)} %`,
    Shapes: `${patternRings.length} profiles`,
    Sketch: 'DXF is 1 unit = 1 mm',
  };

  return {
    parts,
    issues,
    readouts,
    vectors: [
      {
        id: 'dxf',
        label: 'DXF',
        extension: 'dxf',
        mime: 'application/dxf',
        title: 'Fusion 360: Insert > DXF. Closed profiles on two layers, 1 unit = 1 mm',
        data: dxf,
      },
      {
        id: 'svg',
        label: 'SVG',
        extension: 'svg',
        mime: 'image/svg+xml',
        title: 'The same profiles as SVG, in millimetres, for laser cutters and drawing tools',
        data: svg,
      },
    ],
  };
}

export const patternGenerator: Generator = {
  id: 'pattern',
  name: 'Pattern',
  description:
    'Perforations, tilings, hatching and Voronoi cells, as a DXF sketch for Fusion 360 and as a printable panel.',
  tagline: 'Patterns you can drop straight into a Fusion 360 sketch',
  highlights: [
    'Perforation grids sized by the wall between holes, with the open area read back',
    'Hex, triangle, brick, basketweave and herringbone tilings',
    'Chevron, wave, cross-hatch, knurl and ribs',
    'Voronoi cells with a seed you can dial, so a link always rebuilds the same one',
    'DXF at 1 unit = 1 mm, closed profiles, panel outline on its own layer',
  ],
  art: `<svg viewBox="0 0 120 96" role="img" aria-hidden="true">
    <defs>
      <linearGradient id="pt-p" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#4c9ffe"/><stop offset="1" stop-color="#8a7bf0"/>
      </linearGradient>
      <clipPath id="pt-clip"><rect x="12" y="18" width="96" height="60" rx="8"/></clipPath>
    </defs>
    <rect x="12" y="18" width="96" height="60" rx="8" fill="url(#pt-p)"/>
    <g clip-path="url(#pt-clip)" fill="#14161a" fill-opacity="0.55">
      <g>
        <circle cx="26" cy="32" r="5"/><circle cx="44" cy="32" r="5"/><circle cx="62" cy="32" r="5"/>
        <circle cx="80" cy="32" r="5"/><circle cx="98" cy="32" r="5"/>
        <circle cx="35" cy="48" r="5"/><circle cx="53" cy="48" r="5"/><circle cx="71" cy="48" r="5"/>
        <circle cx="89" cy="48" r="5"/><circle cx="17" cy="48" r="5"/>
        <circle cx="26" cy="64" r="5"/><circle cx="44" cy="64" r="5"/><circle cx="62" cy="64" r="5"/>
        <circle cx="80" cy="64" r="5"/><circle cx="98" cy="64" r="5"/>
      </g>
    </g>
    <rect x="12" y="18" width="96" height="60" rx="8" fill="none"
      stroke="#f2f4f8" stroke-opacity="0.75" stroke-width="2"/>
    <text x="60" y="90" text-anchor="middle" font-size="9" letter-spacing="1.5"
      font-family="ui-monospace, monospace" fill="#7d8698">DXF · 1 = 1mm</text>
  </svg>`,
  params: patternParams,
  groups: patternGroups,
  validate: (p) => {
    const out: Issue[] = [];
    if (Number(p.gap) >= Number(p.cell)) {
      out.push({
        level: 'error',
        message: 'The web has to be narrower than the pitch, or there is no pattern left.',
        paramIds: ['gap', 'cell'],
      });
    }
    return out;
  },
  build,
  presets: [
    {
      label: 'Speaker grille',
      values: {
        family: 'perforation', hole: 'round', grid: 'staggered', cell: 5, gap: 1.6,
        shape: 'circle', diameter: 90, border: 6, mode: 'cut', thickness: 2,
      },
    },
    {
      label: 'Hex vent panel',
      values: {
        family: 'tiling', tiling: 'hex', cell: 12, gap: 2.4, shape: 'rounded',
        width: 100, height: 70, corner: 6, border: 6, mode: 'cut', thickness: 2.4,
      },
    },
    {
      label: 'Knurled grip plate',
      values: {
        family: 'lines', line: 'knurl', cell: 2.4, gap: 1.2, shape: 'rounded',
        width: 60, height: 40, corner: 4, border: 2, mode: 'emboss',
        thickness: 2, relief: 0.8,
      },
    },
    {
      label: 'Herringbone coaster',
      values: {
        family: 'tiling', tiling: 'herringbone', cell: 14, gap: 1.6, shape: 'circle',
        diameter: 90, border: 5, mode: 'engrave', thickness: 4, relief: 0.8,
      },
    },
    {
      label: 'Voronoi lightweight panel',
      values: {
        // NOT inverted: cutting the cells out leaves the web, which is the
        // lightweight panel. Inverting cuts the web out and leaves the cells,
        // which is a bag of loose tiles.
        family: 'voronoi', seeds: 70, relax: 4, seed: 7, gap: 2.5, cell: 10,
        shape: 'rounded', width: 110, height: 80, corner: 8, border: 6,
        mode: 'cut', thickness: 2.4,
      },
    },
    {
      label: 'Chevron texture tile',
      values: {
        family: 'lines', line: 'chevron', cell: 4, gap: 2, angle: 0,
        shape: 'rounded', width: 60, height: 60, corner: 4, border: 3,
        mode: 'emboss', thickness: 2, relief: 0.6,
      },
    },
    {
      label: 'Slotted vent',
      values: {
        family: 'perforation', hole: 'slot', grid: 'straight', cell: 6, gap: 2,
        aspect: 4, shape: 'rounded', width: 120, height: 50, corner: 5,
        border: 6, mode: 'cut', thickness: 2.4,
      },
    },
  ],
};
