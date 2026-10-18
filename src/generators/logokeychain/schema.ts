import { backgroundMask } from '../../core/image/trace';
import type { Background, MaskSource } from '../../core/image/types';
import { bool, choice, color, num } from '../../core/params/dsl';
import type { ParamGroup, ParamSpec } from '../../core/params/types';
import { imageTraceParams } from '../imagetrace/schema';

export const logoKeychainGroups: readonly ParamGroup[] = [
  { id: 'picture', label: 'Logo', tab: 'Logo' },
  { id: 'trace', label: 'Tracing', tab: 'Logo', collapsed: true },
  { id: 'place', label: 'Placement', tab: 'Logo' },
  { id: 'frame', label: 'Frame', tab: 'Frame' },
  { id: 'hanger', label: 'Hanger', tab: 'Frame' },
  { id: 'look', label: 'Colours', tab: 'Output' },
  { id: 'printer', label: 'Printer', tab: 'Output', collapsed: true },
];

type V = Record<string, unknown>;
const isBacked = (v: V) => v.style === 'backed';
const isRectangle = (v: V) => v.shape === 'rectangle';
const canBridge = (v: V) => v.style !== 'backed';
const hasBridges = (v: V) => v.style !== 'backed' && v.bridges === true;
const hasHanger = (v: V) => v.hanger !== 'none';
const logoColoured = (v: V) => v.style !== 'cutout';

/**
 * The picture and tracing controls are the image tracer's own, taken by id so
 * the two generators read a picture identically. Only the upload's wording
 * changes: here the thing being dropped in is a logo.
 */
const TRACE_IDS = ['image', 'source', 'threshold', 'invert', 'despeckle', 'detail', 'smooth', 'cornerAngle', 'diagonal'];
const traceParams: ParamSpec[] = TRACE_IDS.map((id) => {
  const spec = imageTraceParams.find((s) => s.id === id);
  if (!spec) throw new Error(`Image tracer has no "${id}" control`);
  return spec.type === 'image'
    ? {
        ...spec,
        label: 'Logo',
        help: 'SVG works best; PNG and JPG trace too. A dark logo, or a light one on a dark tile.',
        // The preview has to show the tile taken away when it will be, or it
        // shows a black square while the model shows the logo.
        preview: (v, bmp) =>
          backgroundMask(bmp, {
            source: String(v.source) as MaskSource,
            threshold: Number(v.threshold),
            invert: v.invert === true,
            despeckle: Number(v.despeckle),
            background: String(v.background) as Background,
          }).mask,
      }
    : spec;
});

const background = choice('background', 'Logo is', {
  group: 'picture',
  default: 'auto',
  options: [
    { value: 'auto', label: 'Work it out' },
    { value: 'keep', label: 'The dark shape' },
    { value: 'tile', label: 'Light, on a dark tile' },
  ],
  help: 'For a white logo on a black square or disc, the tile is thrown away and the white is the logo. Invert cannot do this: it would flip the page around the tile too.',
});
traceParams.splice(traceParams.findIndex((s) => s.id === 'invert') + 1, 0, background);

export const logoKeychainParams: readonly ParamSpec[] = [
  ...traceParams,

  // -------------------------------------------------------------- placement
  num('logoSize', 'Logo size', {
    group: 'place',
    unit: '%',
    min: 20,
    max: 180,
    step: 1,
    default: 100,
    help: 'The logo\'s longer side, against the opening inside the rim. At 100 it spans the opening and welds to the rim; over 100 it runs into or past it.',
  }),
  choice('overflow', 'Past the rim', {
    group: 'place',
    default: 'clip',
    options: [
      { value: 'clip', label: 'Trim at the rim' },
      { value: 'extend', label: 'Let it stick out' },
    ],
    help: 'Whether a logo bigger than the opening is trimmed to the frame, or carries on past it - bat wings, a wordmark.',
  }),
  num('logoX', 'Move across', { group: 'place', unit: 'mm', min: -30, max: 30, step: 0.5, default: 0 }),
  num('logoY', 'Move up', { group: 'place', unit: 'mm', min: -30, max: 30, step: 0.5, default: 0 }),
  num('logoAngle', 'Turn', { group: 'place', unit: 'deg', min: -180, max: 180, step: 1, default: 0, advanced: true }),
  bool('bridges', 'Tie loose pieces in', {
    group: 'place',
    default: true,
    visibleIf: canBridge,
    help: 'Any part of the logo that touches neither the rim nor the rest of it - a star floating in a ring, the middle of an O - gets a bar to the nearest material, so nothing falls out.',
  }),
  num('bridgeWidth', 'Tie width', {
    group: 'place',
    unit: 'mm',
    min: 0.8,
    max: 4,
    step: 0.1,
    default: 1.6,
    visibleIf: hasBridges,
  }),

  // ------------------------------------------------------------------ frame
  choice('style', 'Style', {
    group: 'frame',
    default: 'open',
    options: [
      { value: 'open', label: 'Logo in an open ring' },
      { value: 'backed', label: 'Logo on a backing disc' },
      { value: 'cutout', label: 'Logo cut out of a disc' },
    ],
    help: 'Open is the ornament look: the logo itself is the solid. Backed sits it on a thin disc, ready for a second colour. Cut out punches it through a solid disc.',
  }),
  choice('shape', 'Shape', {
    group: 'frame',
    default: 'circle',
    options: [
      { value: 'circle', label: 'Circle' },
      { value: 'hexagon', label: 'Hexagon' },
      { value: 'square', label: 'Rounded square' },
      { value: 'rectangle', label: 'Rounded rectangle' },
    ],
  }),
  num('size', 'Size', {
    group: 'frame',
    unit: 'mm',
    min: 20,
    max: 120,
    step: 1,
    default: 50,
    help: 'Across the frame, not counting the hanger. For a rectangle, its long side.',
  }),
  choice('orientation', 'Orientation', {
    group: 'frame',
    default: 'horizontal',
    visibleIf: isRectangle,
    options: [
      { value: 'horizontal', label: 'Horizontal' },
      { value: 'vertical', label: 'Vertical' },
    ],
    help: 'Which way the long side runs. The hanger stays on top: a vertical tag hangs from its short end.',
  }),
  num('height', 'Short side', {
    group: 'frame',
    unit: 'mm',
    min: 20,
    max: 120,
    step: 1,
    default: 30,
    visibleIf: isRectangle,
  }),
  num('rim', 'Rim width', { group: 'frame', unit: 'mm', min: 0.8, max: 12, step: 0.1, default: 3 }),
  num('thickness', 'Thickness', { group: 'frame', unit: 'mm', min: 1.2, max: 10, step: 0.1, default: 3 }),
  num('backThickness', 'Backing thickness', {
    group: 'frame',
    unit: 'mm',
    min: 0.6,
    max: 6,
    step: 0.1,
    default: 1.2,
    visibleIf: isBacked,
    help: 'The disc the logo stands on. The logo and rim rise to the full thickness above it.',
  }),

  // ----------------------------------------------------------------- hanger
  choice('hanger', 'Hanger', {
    group: 'hanger',
    default: 'cap',
    options: [
      { value: 'cap', label: 'Ornament cap and loop' },
      { value: 'loop', label: 'Plain loop' },
      { value: 'none', label: 'None' },
    ],
  }),
  num('holeDiameter', 'Hole', {
    group: 'hanger',
    unit: 'mm',
    min: 2,
    max: 10,
    step: 0.5,
    default: 4,
    visibleIf: hasHanger,
    help: 'Big enough for the split ring or chain it hangs from.',
  }),
  num('loopWall', 'Loop wall', {
    group: 'hanger',
    unit: 'mm',
    min: 1,
    max: 5,
    step: 0.1,
    default: 1.8,
    visibleIf: hasHanger,
    help: 'Material around the hole. The loop carries the keys, so thinner than about 1.5 mm wears through.',
  }),

  // ---------------------------------------------------------------- colours
  color('frameColor', 'Frame', { group: 'look', default: '#1d1f24' }),
  color('logoColor', 'Logo', {
    group: 'look',
    default: '#1d1f24',
    visibleIf: logoColoured,
    help: 'The same colour as the frame prints as one solid part. A different one splits the logo out for a filament swap.',
  }),
  color('backColor', 'Backing', { group: 'look', default: '#f2f4f8', visibleIf: isBacked }),

  // ---------------------------------------------------------------- printer
  num('nozzle', 'Nozzle', {
    group: 'printer',
    unit: 'mm',
    min: 0.2,
    max: 1,
    step: 0.05,
    default: 0.4,
    help: 'Used to warn about detail too fine to print.',
  }),
];
