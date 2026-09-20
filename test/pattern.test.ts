import { describe, expect, it } from 'vitest';
import type { ManifoldToplevel } from 'manifold-3d';
import { cleanup, kernel, loadFont } from './kernel';
import { writeDxf } from '../src/core/export/dxf';
import {
  MAX_FEATURES,
  buildPattern,
  estimateFeatures,
  type PatternOptions,
  type TilingKind,
} from '../src/core/pattern';
import { signedArea } from '../src/core/pattern/geom';
import { patternGenerator } from '../src/generators/pattern/build';
import { coerceAll, defaultsOf } from '../src/core/params/validate';
import type { BuildCtx, BuildResult, Params } from '../src/core/params/types';
import type { Vec2 } from '../src/core/text/flatten';

function ctxFor(m: ManifoldToplevel): BuildCtx {
  return {
    m,
    font: (id) => loadFont(id),
    image: () => undefined,
    tolerance: 0.02,
    issue: () => {},
  };
}

function paramsWith(patch: Params = {}): Params {
  return coerceAll(patternGenerator, { ...defaultsOf(patternGenerator), ...patch });
}

const messagesOf = (r: BuildResult, level: 'error' | 'warn'): string[] =>
  r.issues.filter((i) => i.level === level).map((i) => i.message);

function opts(patch: Partial<PatternOptions> = {}): PatternOptions {
  return {
    family: 'tiling',
    tiling: 'hex',
    hole: 'round',
    grid: 'staggered',
    line: 'ribs',
    cell: 8,
    gap: 2,
    aspect: 0.5,
    seeds: 40,
    relax: 2,
    seed: 1,
    radius: 40,
    angle: 0,
    tolerance: 0.02,
    ...patch,
  };
}

const sumAreas = (rings: readonly Vec2[][]): number =>
  rings.reduce((a, r) => a + Math.abs(signedArea(r)), 0);

// ------------------------------------------------------------------ tilings

const TILINGS: TilingKind[] = [
  'hex',
  'triangle',
  'square',
  'diamond',
  'brick',
  'basketweave',
  'herringbone',
];

describe('tilings', () => {
  // The claim every tiling makes is that it TILES: no overlaps, no gaps. Both
  // halves are checked by area rather than by eye, because a herringbone that
  // is subtly wrong still looks like a herringbone in a screenshot.
  it.each(TILINGS)('%s covers the plane with no overlaps', async (kind) => {
    const m = await kernel();
    try {
      const rings = buildPattern(opts({ tiling: kind, gap: 0, radius: 40, cell: 8 }));
      expect(rings.length).toBeGreaterThan(10);

      const union = m.CrossSection.ofPolygons(rings, 'NonZero');
      // Overlapping tiles would make the union smaller than the tiles add up to.
      expect(union.area()).toBeCloseTo(sumAreas(rings), 1);

      // And a window well inside the field has to be completely covered.
      const window = m.CrossSection.square([30, 30], true);
      expect(union.intersect(window).area()).toBeCloseTo(900, 1);
    } finally {
      cleanup();
    }
  });

  it.each(TILINGS)('%s leaves every tile free-standing once there is a web', async (kind) => {
    const m = await kernel();
    try {
      const rings = buildPattern(opts({ tiling: kind, gap: 2, radius: 24, cell: 10 }));
      const union = m.CrossSection.ofPolygons(rings, 'NonZero');
      // A gap that actually separates them means one piece per tile.
      expect(union.decompose()).toHaveLength(rings.length);
    } finally {
      cleanup();
    }
  });

  it('takes the web off the tile, not out of the pitch', async () => {
    const m = await kernel();
    try {
      // Squares on an 10mm pitch with a 2mm web are 8mm squares, whatever else
      // changes. Scaling about the centre instead of insetting would give the
      // right answer here and the wrong one for a brick, which is why the
      // implementation insets.
      const rings = buildPattern(opts({ tiling: 'square', cell: 10, gap: 2, radius: 12 }));
      const union = m.CrossSection.ofPolygons(rings, 'NonZero');
      const each = union.decompose();
      expect(each.length).toBeGreaterThan(3);
      for (const tile of each) expect(tile.area()).toBeCloseTo(64, 3);
    } finally {
      cleanup();
    }
  });

  it('gives a brick its own aspect without touching the web', async () => {
    const m = await kernel();
    try {
      const rings = buildPattern(
        opts({ tiling: 'brick', cell: 20, aspect: 0.5, gap: 2, radius: 24 }),
      );
      const union = m.CrossSection.ofPolygons(rings, 'NonZero');
      const tile = union.decompose()[0]!;
      const b = tile.bounds();
      // 20 x 10 nominal, less 1mm of web on every side.
      expect(b.max[0] - b.min[0]).toBeCloseTo(18, 3);
      expect(b.max[1] - b.min[1]).toBeCloseTo(8, 3);
    } finally {
      cleanup();
    }
  });
});

// -------------------------------------------------------------- perforation

describe('perforation', () => {
  it('leaves the asked-for wall on both grids', async () => {
    const m = await kernel();
    try {
      for (const grid of ['straight', 'staggered'] as const) {
        const rings = buildPattern(
          opts({ family: 'perforation', hole: 'round', grid, cell: 6, gap: 2, radius: 20 }),
        );
        const union = m.CrossSection.ofPolygons(rings, 'NonZero');
        const holes = union.decompose().length;
        expect(holes, grid).toBe(rings.length);

        // Grow every hole by just under half the wall and they still do not
        // touch; by just over, and they all merge. That brackets the wall at
        // the number the control claims, on whichever grid.
        expect(union.offset(0.94, 'Round', 2, 16).decompose().length, grid).toBe(holes);
        expect(
          union.offset(1.06, 'Round', 2, 16).decompose().length,
          grid,
        ).toBeLessThan(holes);
      }
    } finally {
      cleanup();
    }
  });

  it('packs more open area into a staggered grid than a straight one', async () => {
    const m = await kernel();
    try {
      // Measured over a window twenty pitches wide. At the handful of rows a
      // small window holds, where the grid happens to land relative to the edge
      // swamps the difference being measured -- the same trap as reading a
      // perforation spec off a sample coupon.
      const window = m.CrossSection.square([120, 120], true);
      const openFraction = (grid: 'straight' | 'staggered'): number => {
        const rings = buildPattern(
          opts({ family: 'perforation', hole: 'round', grid, cell: 6, gap: 2, radius: 96 }),
        );
        return (
          m.CrossSection.ofPolygons(rings, 'NonZero').intersect(window).area() / (120 * 120)
        );
      };
      const straight = openFraction('straight');
      const staggered = openFraction('staggered');
      // A triangular lattice fits 2/sqrt(3) as many holes into the same area at
      // the same nearest-neighbour distance, so the ratio is not a preference,
      // it is the packing.
      expect(staggered / straight).toBeCloseTo(2 / Math.sqrt(3), 1);
    } finally {
      cleanup();
    }
  });

  it('makes a slot as long as its aspect asks', async () => {
    const m = await kernel();
    try {
      const rings = buildPattern(
        opts({ family: 'perforation', hole: 'slot', grid: 'straight', cell: 6, gap: 2, aspect: 4, radius: 20 }),
      );
      const slot = m.CrossSection.ofPolygons(rings, 'NonZero').decompose()[0]!;
      const b = slot.bounds();
      expect(b.max[0] - b.min[0]).toBeCloseTo(24, 1);
      expect(b.max[1] - b.min[1]).toBeCloseTo(4, 1);
    } finally {
      cleanup();
    }
  });
});

// ------------------------------------------------------------------- lines

describe('line patterns', () => {
  it('measures the gap across the strokes, not down the page', async () => {
    const m = await kernel();
    try {
      // The whole point of the sloped families computing their row pitch. A
      // chevron stacked by the nominal pitch would be sqrt(2) too close and
      // its strokes would have merged into one body here.
      for (const line of ['ribs', 'chevron', 'wave'] as const) {
        const rings = buildPattern(
          opts({ family: 'lines', line, cell: 6, gap: 3, radius: 20 }),
        );
        const union = m.CrossSection.ofPolygons(rings, 'NonZero');
        expect(union.decompose().length, line).toBe(rings.length);
      }
    } finally {
      cleanup();
    }
  });

  it('crosses two stroke sets without punching a hole at every junction', async () => {
    const m = await kernel();
    try {
      // Opposite winding under NonZero would cancel at each crossing, which
      // reads as a deliberate diamond pattern rather than as a bug.
      for (const line of ['crosshatch', 'knurl'] as const) {
        const rings = buildPattern(opts({ family: 'lines', line, cell: 4, gap: 2, radius: 15 }));
        const union = m.CrossSection.ofPolygons(rings, 'NonZero');
        const window = m.CrossSection.square([10, 10], true);
        const solid = union.intersect(window);
        // One connected web. The openings between the strokes are real holes,
        // so the contour count is NOT 1 and must not be asserted as such.
        expect(solid.decompose().length, line).toBe(1);
        // The origin is where a stroke from each set crosses. If the two sets
        // were wound against each other, NonZero would cancel here and leave a
        // diamond hole at every junction -- which reads as a deliberate pattern
        // rather than as the bug it is. A square well inside the stroke width
        // has to come back completely solid.
        const junction = m.CrossSection.square([1, 1], true);
        expect(solid.intersect(junction).area(), line).toBeCloseTo(1, 6);
      }
    } finally {
      cleanup();
    }
  });

  it('turns knurl and cross-hatch to different angles', () => {
    const hatch = buildPattern(opts({ family: 'lines', line: 'crosshatch', radius: 10 }));
    const knurl = buildPattern(opts({ family: 'lines', line: 'knurl', radius: 10 }));
    expect(JSON.stringify(hatch)).not.toBe(JSON.stringify(knurl));
  });
});

// ------------------------------------------------------------------ voronoi

describe('voronoi', () => {
  it('rebuilds the same pattern from the same seed, and a different one otherwise', () => {
    const a = buildPattern(opts({ family: 'voronoi', seed: 7 }));
    const b = buildPattern(opts({ family: 'voronoi', seed: 7 }));
    const c = buildPattern(opts({ family: 'voronoi', seed: 8 }));
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it('produces cells that do not overlap', async () => {
    const m = await kernel();
    try {
      const rings = buildPattern(opts({ family: 'voronoi', seeds: 40, relax: 2, gap: 1.5 }));
      expect(rings.length).toBeGreaterThan(30);
      const union = m.CrossSection.ofPolygons(rings, 'NonZero');
      expect(union.area()).toBeCloseTo(sumAreas(rings), 1);
      expect(union.decompose()).toHaveLength(rings.length);
    } finally {
      cleanup();
    }
  });

  it('evens the cells out as relaxation goes up', async () => {
    const m = await kernel();
    try {
      const spread = (relax: number): number => {
        const rings = buildPattern(opts({ family: 'voronoi', seeds: 60, relax, gap: 0, seed: 3 }));
        const window = m.CrossSection.circle(30, 64);
        const areas = rings
          .map((r) => m.CrossSection.ofPolygons([r], 'NonZero').intersect(window).area())
          .filter((a) => a > 1);
        const mean = areas.reduce((x, y) => x + y, 0) / areas.length;
        const variance = areas.reduce((x, y) => x + (y - mean) ** 2, 0) / areas.length;
        return Math.sqrt(variance) / mean;
      };
      // Lloyd relaxation is exactly a variance-reduction step, so this is the
      // property the control is named for.
      expect(spread(6)).toBeLessThan(spread(0));
    } finally {
      cleanup();
    }
  });
});

// --------------------------------------------------------------------- DXF

/** Minimal DXF reader: enough to prove what the writer emitted. */
function readDxf(text: string): { layers: string[]; polylines: { layer: string; points: Vec2[]; closed: boolean }[] } {
  const lines = text.split('\n');
  const layers: string[] = [];
  const polylines: { layer: string; points: Vec2[]; closed: boolean }[] = [];
  let current: { layer: string; points: Vec2[]; closed: boolean } | null = null;
  let pending: Vec2 | null = null;
  let inTable = false;

  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]!.trim());
    const value = lines[i + 1]!.trim();
    if (code === 0) {
      if (value === 'TABLE') inTable = true;
      if (value === 'ENDTAB') inTable = false;
      if (value === 'POLYLINE') current = { layer: '', points: [], closed: false };
      if (value === 'SEQEND' && current) {
        polylines.push(current);
        current = null;
      }
      if (value === 'VERTEX') pending = [0, 0];
      continue;
    }
    if (inTable && code === 2 && value !== 'LAYER') layers.push(value);
    if (current && code === 8 && current.layer === '') current.layer = value;
    if (current && code === 70) current.closed = (Number(value) & 1) === 1;
    if (pending && code === 10) pending[0] = Number(value);
    if (pending && code === 20) {
      pending[1] = Number(value);
      current?.points.push(pending);
      pending = null;
    }
  }
  return { layers, polylines };
}

describe('dxf', () => {
  const square: Vec2[] = [
    [0, 0],
    [10, 0],
    [10, 5],
    [0, 5],
  ];

  it('writes R12 closed polylines on the layers it was given', () => {
    const dxf = writeDxf([
      { name: 'PATTERN', rings: [square] },
      { name: 'PANEL OUTLINE', rings: [square.map(([x, y]): Vec2 => [x - 1, y - 1])] },
    ]);
    expect(dxf).toContain('$ACADVER');
    expect(dxf).toContain('AC1009');
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true);

    const parsed = readDxf(dxf);
    // A space is not legal in a layer name and would make the file unreadable.
    expect(parsed.layers).toEqual(['PATTERN', 'PANEL_OUTLINE']);
    expect(parsed.polylines).toHaveLength(2);
    for (const poly of parsed.polylines) {
      // Without the closed flag every profile arrives open and Fusion will not
      // extrude any of it.
      expect(poly.closed).toBe(true);
      expect(poly.points).toHaveLength(4);
    }
    expect(parsed.polylines[0]!.points[1]).toEqual([10, 0]);
    expect(parsed.polylines[0]!.layer).toBe('PATTERN');
  });

  it('keeps millimetres one for one', () => {
    const parsed = readDxf(writeDxf([{ name: 'P', rings: [square] }]));
    const xs = parsed.polylines[0]!.points.map((p) => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(10);
  });

  it('drops degenerate rings instead of writing two-point profiles', () => {
    const parsed = readDxf(
      writeDxf([{ name: 'P', rings: [square, [[0, 0], [1, 1]] as Vec2[]] }]),
    );
    expect(parsed.polylines).toHaveLength(1);
  });

  it('survives having nothing to write', () => {
    expect(writeDxf([]).trimEnd().endsWith('EOF')).toBe(true);
  });
});

// --------------------------------------------------------------- generator

describe('pattern generator', () => {
  it('refuses a web wider than the pitch before it builds anything', () => {
    const issues = patternGenerator.validate?.(paramsWith({ cell: 4, gap: 5 })) ?? [];
    expect(issues.some((i) => i.level === 'error')).toBe(true);
  });

  it('refuses a pattern too fine to build, rather than trying', async () => {
    const m = await kernel();
    try {
      const out = patternGenerator.build(
        paramsWith({ family: 'perforation', cell: 1, gap: 0.4, width: 300, height: 300, shape: 'rect' }),
        ctxFor(m),
      );
      expect(messagesOf(out, 'error').join(' ')).toMatch(/past what the app will build/);
      expect(out.parts).toHaveLength(0);
      // The estimate has to be the thing that refused it, not a timeout.
      expect(
        estimateFeatures(opts({ family: 'perforation', cell: 1, radius: 215 })),
      ).toBeGreaterThan(MAX_FEATURES);
    } finally {
      cleanup();
    }
  });

  it('builds a grille that is one piece, and reports its open area', async () => {
    const m = await kernel();
    try {
      const out = patternGenerator.build(
        paramsWith({
          family: 'perforation', hole: 'round', grid: 'staggered',
          cell: 6, gap: 2, shape: 'circle', diameter: 80, border: 5,
          mode: 'cut', thickness: 2,
        }),
        ctxFor(m),
      );
      expect(messagesOf(out, 'error')).toEqual([]);
      expect(messagesOf(out, 'warn')).toEqual([]);
      expect(out.parts).toHaveLength(1);

      const panel = out.parts[0]!;
      expect(panel.mesh.stats.volumeMm3).toBeGreaterThan(0);
      // Every hole is a tunnel through the panel, so the genus counts them.
      expect(panel.mesh.stats.genus).toBeGreaterThan(50);

      const open = Number(out.readouts?.['Open area']?.replace(' %', ''));
      expect(open).toBeGreaterThan(20);
      expect(open).toBeLessThan(70);
    } finally {
      cleanup();
    }
  });

  it('warns when cutting through would leave the panel in pieces', async () => {
    const m = await kernel();
    try {
      // Inverted, the web becomes the hole and every tile becomes an island.
      const out = patternGenerator.build(
        paramsWith({
          family: 'tiling', tiling: 'hex', cell: 12, gap: 2,
          shape: 'rect', width: 80, height: 80, border: 4,
          mode: 'cut', invert: true,
        }),
        ctxFor(m),
      );
      expect(messagesOf(out, 'warn').join(' ')).toMatch(/separate pieces/);
    } finally {
      cleanup();
    }
  });

  it('warns about a web too thin for the nozzle', async () => {
    const m = await kernel();
    try {
      const out = patternGenerator.build(
        paramsWith({ cell: 6, gap: 0.5, nozzle: 0.4 }),
        ctxFor(m),
      );
      expect(messagesOf(out, 'warn').join(' ')).toMatch(/perimeters/);
    } finally {
      cleanup();
    }
  });

  it('raises the pattern as its own coloured body', async () => {
    const m = await kernel();
    try {
      const out = patternGenerator.build(
        paramsWith({
          family: 'lines', line: 'knurl', cell: 3, gap: 1.5,
          shape: 'rounded', width: 50, height: 40, corner: 4, border: 2,
          mode: 'emboss', thickness: 2, relief: 0.8,
        }),
        ctxFor(m),
      );
      expect(messagesOf(out, 'error')).toEqual([]);
      expect(out.parts.map((x) => x.id)).toEqual(['panel', 'pattern']);
      for (const part of out.parts) expect(part.mesh.stats.volumeMm3).toBeGreaterThan(0);
      expect(new Set(out.parts.map((x) => x.group)).size).toBe(1);
      // The raised body stands exactly `relief` proud of the panel.
      const pattern = out.parts.find((x) => x.id === 'pattern')!;
      expect(pattern.mesh.bbox.max[2]).toBeCloseTo(2.8, 3);
      expect(pattern.mesh.bbox.min[2]).toBeCloseTo(2, 3);
    } finally {
      cleanup();
    }
  });

  it('hands out a DXF and an SVG cut from the same profiles', async () => {
    const m = await kernel();
    try {
      const out = patternGenerator.build(
        paramsWith({
          family: 'tiling', tiling: 'hex', cell: 12, gap: 2,
          shape: 'rect', width: 60, height: 60, border: 5, mode: 'cut',
        }),
        ctxFor(m),
      );
      const dxf = out.vectors?.find((v) => v.id === 'dxf');
      const svg = out.vectors?.find((v) => v.id === 'svg');
      expect(dxf?.extension).toBe('dxf');
      expect(svg?.extension).toBe('svg');

      const parsed = readDxf(dxf!.data);
      expect(parsed.layers).toEqual(['PATTERN_HEX', 'PANEL_OUTLINE']);

      // Every profile the kernel resolved reaches the sketch, plus the outline.
      const shapes = Number(out.readouts?.Shapes?.replace(' profiles', ''));
      expect(parsed.polylines).toHaveLength(shapes + 1);

      // The outline is the panel at its asked-for size, in millimetres.
      const outline = parsed.polylines.find((x) => x.layer === 'PANEL_OUTLINE')!;
      const xs = outline.points.map((pt) => pt[0]);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(60, 3);
    } finally {
      cleanup();
    }
  });

  it('counts voronoi cells across the PANEL, not across the field it scatters over', async () => {
    const m = await kernel();
    try {
      // The seeds are scattered over a disc that covers the panel corners, and
      // for a rectangle that disc is about 1.6x the panel. Taking the control
      // at face value would put 60 seeds down and land roughly 37 of them on
      // the panel -- a control that reads as simply broken.
      const out = patternGenerator.build(
        paramsWith({
          family: 'voronoi', seeds: 60, relax: 3, seed: 5, gap: 2, cell: 10,
          shape: 'rect', width: 110, height: 80, border: 0, mode: 'cut',
        }),
        ctxFor(m),
      );
      expect(messagesOf(out, 'error')).toEqual([]);
      const shapes = Number(out.readouts?.Shapes?.replace(' profiles', ''));
      expect(shapes).toBeGreaterThan(48);
      expect(shapes).toBeLessThan(72);
    } finally {
      cleanup();
    }
  });

  it('builds every preset without errors', async () => {
    const m = await kernel();
    try {
      for (const preset of patternGenerator.presets ?? []) {
        const out = patternGenerator.build(paramsWith(preset.values), ctxFor(m));
        expect(messagesOf(out, 'error'), preset.label).toEqual([]);
        expect(out.parts.length, preset.label).toBeGreaterThan(0);
        for (const part of out.parts) {
          expect(part.mesh.stats.volumeMm3, `${preset.label}/${part.id}`).toBeGreaterThan(0);
        }
        expect(out.vectors?.length, preset.label).toBe(2);
      }
    } finally {
      cleanup();
    }
  });
});
