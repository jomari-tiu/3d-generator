import { bool, choice, color, int, num } from '../../core/params/dsl';
import type { ParamGroup, ParamSpec } from '../../core/params/types';

export const patternGroups: readonly ParamGroup[] = [
  { id: 'pattern', label: 'Pattern', tab: 'Pattern' },
  { id: 'size', label: 'Spacing', tab: 'Pattern' },
  { id: 'panel', label: 'Panel', tab: 'Shape' },
  { id: 'model', label: 'Model', tab: 'Shape' },
  { id: 'look', label: 'Colours', tab: 'Output' },
  { id: 'printer', label: 'Printer', tab: 'Output', collapsed: true },
];

const isTiling = (v: Record<string, unknown>) => v.family === 'tiling';
const isHoles = (v: Record<string, unknown>) => v.family === 'perforation';
const isLines = (v: Record<string, unknown>) => v.family === 'lines';
const isVoronoi = (v: Record<string, unknown>) => v.family === 'voronoi';
const isRound = (v: Record<string, unknown>) => v.shape === 'circle';
const isRect = (v: Record<string, unknown>) => v.shape !== 'circle';
const hasRelief = (v: Record<string, unknown>) => v.mode !== 'cut';
/** Brick height and slot length are the same control wearing two hats. */
const hasAspect = (v: Record<string, unknown>) =>
  (v.family === 'tiling' && v.tiling === 'brick') ||
  (v.family === 'perforation' && v.hole === 'slot');

export const patternParams: readonly ParamSpec[] = [
  // ---------------------------------------------------------------- pattern
  choice('family', 'Family', {
    group: 'pattern',
    default: 'perforation',
    // The pattern IS the thing being made here, so a saved template carries
    // the panel and the sizing and deliberately leaves the pattern alone.
    content: true,
    options: [
      { value: 'perforation', label: 'Perforation - holes on a grid' },
      { value: 'tiling', label: 'Tiling - tiles with a web between' },
      { value: 'lines', label: 'Lines - strokes and hatching' },
      { value: 'voronoi', label: 'Voronoi - organic cells' },
    ],
  }),
  choice('tiling', 'Tiling', {
    group: 'pattern',
    default: 'hex',
    visibleIf: isTiling,
    content: true,
    options: [
      { value: 'hex', label: 'Hexagon' },
      { value: 'triangle', label: 'Triangle' },
      { value: 'square', label: 'Square' },
      { value: 'diamond', label: 'Diamond' },
      { value: 'brick', label: 'Brick - running bond' },
      { value: 'basketweave', label: 'Basketweave' },
      { value: 'herringbone', label: 'Herringbone' },
    ],
  }),
  choice('hole', 'Hole shape', {
    group: 'pattern',
    default: 'round',
    visibleIf: isHoles,
    content: true,
    options: [
      { value: 'round', label: 'Round' },
      { value: 'slot', label: 'Slot' },
      { value: 'square', label: 'Square' },
      { value: 'hex', label: 'Hexagon' },
    ],
  }),
  choice('grid', 'Grid', {
    group: 'pattern',
    default: 'staggered',
    visibleIf: isHoles,
    options: [
      { value: 'staggered', label: 'Staggered' },
      { value: 'straight', label: 'Straight rows' },
    ],
    help: 'Staggered packs more open area into the same wall thickness.',
  }),
  choice('line', 'Stroke', {
    group: 'pattern',
    default: 'chevron',
    visibleIf: isLines,
    content: true,
    options: [
      { value: 'chevron', label: 'Chevron' },
      { value: 'wave', label: 'Wave' },
      { value: 'crosshatch', label: 'Cross-hatch' },
      { value: 'knurl', label: 'Knurl' },
      { value: 'ribs', label: 'Ribs' },
    ],
    help: 'Fluting is Ribs with the Raised model - a sketch cannot carry a round groove profile.',
  }),
  int('seeds', 'Cells', {
    group: 'pattern',
    unit: 'count',
    min: 3,
    max: 400,
    default: 60,
    visibleIf: isVoronoi,
    debounceMs: 120,
  }),
  int('relax', 'Evenness', {
    group: 'pattern',
    unit: 'count',
    min: 0,
    max: 12,
    default: 3,
    visibleIf: isVoronoi,
    help: 'Lloyd relaxation passes. 0 is raw scatter, higher settles the cells toward equal size.',
    debounceMs: 120,
  }),
  int('seed', 'Variation', {
    group: 'pattern',
    unit: 'count',
    min: 1,
    max: 9999,
    default: 1,
    visibleIf: isVoronoi,
    content: true,
    help: 'Change for a different arrangement. The same number always gives the same pattern.',
  }),
  bool('invert', 'Invert', {
    group: 'pattern',
    default: false,
    help: 'Swap the pattern and the web, so what was solid becomes the gap.',
  }),

  // ------------------------------------------------------------------- size
  num('cell', 'Pitch', {
    group: 'size',
    unit: 'mm',
    min: 1,
    max: 60,
    step: 0.5,
    default: 8,
    help: 'Centre to centre. Hexagons measure across the flats, lines measure across the strokes.',
  }),
  num('gap', 'Web', {
    group: 'size',
    unit: 'mm',
    min: 0.2,
    max: 30,
    step: 0.1,
    default: 2,
    help: 'Material left between neighbours, measured at their closest approach.',
  }),
  num('aspect', 'Long axis', {
    group: 'size',
    min: 0.2,
    max: 6,
    step: 0.1,
    default: 0.5,
    visibleIf: hasAspect,
    help: 'Brick height as a fraction of its length, or slot length as a multiple of the pitch.',
  }),
  num('angle', 'Rotation', {
    group: 'size',
    unit: 'deg',
    min: 0,
    max: 180,
    step: 1,
    default: 0,
  }),

  // ------------------------------------------------------------------ panel
  choice('shape', 'Panel shape', {
    group: 'panel',
    default: 'rounded',
    options: [
      { value: 'rounded', label: 'Rounded rectangle' },
      { value: 'rect', label: 'Rectangle' },
      { value: 'circle', label: 'Circle' },
    ],
  }),
  num('width', 'Width', {
    group: 'panel',
    unit: 'mm',
    min: 10,
    max: 300,
    step: 1,
    default: 80,
    visibleIf: isRect,
  }),
  num('height', 'Height', {
    group: 'panel',
    unit: 'mm',
    min: 10,
    max: 300,
    step: 1,
    default: 80,
    visibleIf: isRect,
  }),
  num('diameter', 'Diameter', {
    group: 'panel',
    unit: 'mm',
    min: 10,
    max: 300,
    step: 1,
    default: 80,
    visibleIf: isRound,
  }),
  num('corner', 'Corner radius', {
    group: 'panel',
    unit: 'mm',
    min: 0,
    max: 60,
    step: 0.5,
    default: 6,
    visibleIf: (v) => v.shape === 'rounded',
  }),
  num('border', 'Border', {
    group: 'panel',
    unit: 'mm',
    min: 0,
    max: 40,
    step: 0.5,
    default: 5,
    help: 'Clear margin inside the edge that the pattern does not enter.',
  }),

  // ------------------------------------------------------------------ model
  choice('mode', 'Model', {
    group: 'model',
    default: 'cut',
    options: [
      { value: 'cut', label: 'Cut through - grille or stencil' },
      { value: 'emboss', label: 'Raised on the panel' },
      { value: 'engrave', label: 'Engraved into the panel' },
    ],
  }),
  num('thickness', 'Thickness', {
    group: 'model',
    unit: 'mm',
    min: 0.6,
    max: 20,
    step: 0.2,
    default: 2.4,
  }),
  num('relief', 'Relief', {
    group: 'model',
    unit: 'mm',
    min: 0.2,
    max: 10,
    step: 0.1,
    default: 1,
    visibleIf: hasRelief,
  }),

  // ---------------------------------------------------------------- colours
  color('panelColor', 'Panel', { group: 'look', default: '#2f3440' }),
  color('patternColor', 'Pattern', { group: 'look', default: '#4c9ffe', visibleIf: hasRelief }),

  // ---------------------------------------------------------------- printer
  num('nozzle', 'Nozzle', {
    group: 'printer',
    unit: 'mm',
    min: 0.2,
    max: 1,
    step: 0.05,
    default: 0.4,
    help: 'Used to warn about a web too thin to print.',
  }),
];
