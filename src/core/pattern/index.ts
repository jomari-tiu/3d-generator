import { ccw, rotateRings } from './geom';
import { perforation } from './holes';
import { lines } from './lines';
import { tiling } from './tilings';
import { voronoi } from './voronoi';
import type { PatternOptions, Rings } from './types';

export * from './types';
export { circleSegments, mulberry32, thickPolyline } from './geom';

/**
 * One pattern, as closed rings in millimetres, centred on the origin.
 *
 * Every family fills a DISC and the whole thing is turned at the end, so the
 * angle costs nothing and can never swing an unfilled corner into the region.
 * Trimming to the actual panel shape is the caller's job, and belongs to the
 * kernel: these are raw rings that may overlap each other, and only Clipper2
 * can be trusted to resolve that into a single sane outline.
 */
export function buildPattern(o: PatternOptions): Rings {
  // Normalised to counter-clockwise before anything else sees them. Under the
  // NonZero rule two overlapping rings of OPPOSITE winding cancel to a hole, so
  // a cross-hatch whose two stroke sets happened to be built in different
  // directions would punch a diamond out at every crossing -- a bug that looks
  // like a deliberate pattern and would survive review.
  const rings = generate(o).map((r) => ccw(r));
  return rotateRings(rings, o.angle);
}

/** Ceiling on how many shapes a pattern may produce before it is refused. */
export const MAX_FEATURES = 8000;

/**
 * Roughly how many shapes this pattern would come to, WITHOUT building them.
 *
 * Cheap on purpose: a 1mm pitch across a 300mm panel is a hundred and eighty
 * thousand tiles, and finding that out by generating them means allocating them
 * all first. The estimate only has to be close enough to refuse before that.
 */
export function estimateFeatures(o: PatternOptions): number {
  const area = Math.PI * o.radius * o.radius;
  const cell = Math.max(o.cell, 0.1);
  switch (o.family) {
    case 'voronoi':
      return Math.max(3, Math.round(o.seeds));
    case 'lines': {
      const sets = o.line === 'crosshatch' || o.line === 'knurl' ? 2 : 1;
      return Math.ceil((2 * o.radius * 1.6 * sets) / cell) + sets;
    }
    case 'perforation':
      return Math.ceil(area / (cell * cell));
    case 'tiling': {
      // Triangles come two to a lattice cell, and herringbone and basketweave
      // two to theirs; a factor of two either way does not change the answer to
      // "is this about to allocate a hundred thousand polygons".
      const perCell = o.tiling === 'triangle' ? 2 : 1;
      return Math.ceil((area / (cell * cell)) * perCell);
    }
  }
}

function generate(o: PatternOptions): Rings {
  switch (o.family) {
    case 'tiling':
      return tiling({
        kind: o.tiling,
        cell: o.cell,
        gap: o.gap,
        aspect: o.aspect,
        radius: o.radius,
      });
    case 'perforation':
      return perforation({
        kind: o.hole,
        grid: o.grid,
        cell: o.cell,
        gap: o.gap,
        aspect: o.aspect,
        radius: o.radius,
        tolerance: o.tolerance,
      });
    case 'lines':
      return lines({
        kind: o.line,
        cell: o.cell,
        gap: o.gap,
        radius: o.radius,
        tolerance: o.tolerance,
      });
    case 'voronoi':
      return voronoi({
        seeds: o.seeds,
        relax: o.relax,
        gap: o.gap,
        radius: o.radius,
        seed: o.seed,
      });
  }
}

/** What the pattern is called in the UI and in an exported file's layer name. */
export function patternLabel(o: PatternOptions): string {
  switch (o.family) {
    case 'tiling':
      return o.tiling;
    case 'perforation':
      return `${o.hole}-${o.grid}`;
    case 'lines':
      return o.line;
    case 'voronoi':
      return 'voronoi';
  }
}
