import type { Vec2 } from '../text/flatten';

export type PatternFamily = 'tiling' | 'perforation' | 'lines' | 'voronoi';

export type TilingKind =
  | 'hex'
  | 'triangle'
  | 'square'
  | 'diamond'
  | 'brick'
  | 'basketweave'
  | 'herringbone';

export type HoleKind = 'round' | 'slot' | 'square' | 'hex';
export type GridKind = 'straight' | 'staggered';
export type LineKind = 'chevron' | 'wave' | 'crosshatch' | 'knurl' | 'ribs';

/**
 * The area a family has to fill.
 *
 * `radius` is a DISC, not a rectangle, and every family fills it whole. That is
 * what makes the rotation free: a disc is the same shape at every angle, so the
 * pattern can be generated square-on and turned afterwards with no risk of an
 * unfilled corner swinging into view. Over-generating a little is far cheaper
 * than getting that wrong.
 */
export interface Field {
  readonly radius: number;
  /** Rotation of the whole pattern about the origin, degrees. */
  readonly angle: number;
  /** Chord tolerance in mm for anything curved. */
  readonly tolerance: number;
}

/** Shared sizing. What `cell` and `gap` MEAN is each family's own business. */
export interface PatternOptions extends Field {
  readonly family: PatternFamily;
  readonly tiling: TilingKind;
  readonly hole: HoleKind;
  readonly grid: GridKind;
  readonly line: LineKind;
  /** Pitch: hex across-flats, tile side, hole spacing, line period. */
  readonly cell: number;
  /** Web between ink shapes: tile gap, hole wall, line gap, cell wall. */
  readonly gap: number;
  /** Second axis for the families that have one (brick height, slot length). */
  readonly aspect: number;
  /** Voronoi only. */
  readonly seeds: number;
  readonly relax: number;
  readonly seed: number;
}

/** Closed rings in millimetres, centred on the origin. */
export type Rings = Vec2[][];
