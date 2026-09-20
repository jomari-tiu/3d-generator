import { toMask } from '../../core/image/mask';
import type { MaskSource } from '../../core/image/types';
import { bool, choice, color, image, num } from '../../core/params/dsl';
import type { ParamGroup, ParamSpec } from '../../core/params/types';

export const imageTraceGroups: readonly ParamGroup[] = [
  { id: 'picture', label: 'Picture', tab: 'Picture' },
  { id: 'trace', label: 'Tracing', tab: 'Picture' },
  { id: 'model', label: 'Model', tab: 'Shape' },
  { id: 'size', label: 'Size', tab: 'Shape' },
  { id: 'hole', label: 'Hanging hole', tab: 'Shape' },
  { id: 'look', label: 'Colours', tab: 'Output' },
  { id: 'printer', label: 'Printer', tab: 'Output', collapsed: true },
];

const onPlate = (v: Record<string, unknown>) => v.style !== 'silhouette';
const hasRelief = (v: Record<string, unknown>) => v.style === 'plaque' || v.style === 'engraved';
const isBox = (v: Record<string, unknown>) => v.fitMode === 'box';
const hasHole = (v: Record<string, unknown>) => v.hole === true;

export const imageTraceParams: readonly ParamSpec[] = [
  // ---------------------------------------------------------------- picture
  image('image', 'Picture', {
    group: 'picture',
    default: '',
    accept: 'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml',
    // The picture is the thing being made, so a saved template deliberately
    // leaves it out and applying one to a new logo keeps the new logo.
    content: true,
    help: 'PNG, JPG, WebP, GIF or SVG. High contrast traces best: logos, icons, signatures, stencils.',
    // The preview shows the MASK, not the photograph. What the threshold, the
    // invert and the despeckle actually did is the only thing worth looking at
    // here, and it is the one thing a thumbnail of the original cannot show.
    preview: (v, bmp) =>
      toMask(bmp, {
        source: String(v.source) as MaskSource,
        threshold: Number(v.threshold),
        invert: v.invert === true,
        despeckle: Number(v.despeckle),
      }),
  }),
  choice('source', 'Read ink from', {
    group: 'picture',
    default: 'auto',
    options: [
      { value: 'auto', label: 'Automatic' },
      { value: 'luminance', label: 'Brightness' },
      { value: 'alpha', label: 'Transparency' },
    ],
    help: 'Automatic keys on transparency when the image has any, and on brightness otherwise.',
  }),
  num('threshold', 'Threshold', {
    group: 'picture',
    unit: '%',
    min: 5,
    max: 95,
    step: 1,
    default: 50,
    help: 'Higher takes more of the image as ink.',
  }),
  bool('invert', 'Invert', {
    group: 'picture',
    default: false,
    help: 'For light artwork on a dark background.',
  }),
  num('despeckle', 'Despeckle', {
    group: 'picture',
    unit: 'count',
    min: 0,
    max: 400,
    step: 1,
    integer: true,
    default: 16,
    help: 'Drop ink blobs and pinholes smaller than this many pixels. JPEG noise and scanner dust land here.',
  }),

  // ------------------------------------------------------------------ trace
  num('detail', 'Detail', {
    group: 'trace',
    min: 0.2,
    max: 6,
    step: 0.1,
    default: 1.2,
    help: 'Pixels of error allowed while straightening the outline. Lower follows the pixels, higher gives cleaner curves.',
  }),
  num('smooth', 'Smoothing', {
    group: 'trace',
    unit: '%',
    min: 0,
    max: 100,
    step: 1,
    default: 65,
    help: 'Rounds the gentle turns. Sharp corners are kept regardless.',
  }),
  num('cornerAngle', 'Keep corners above', {
    group: 'trace',
    unit: 'deg',
    min: 20,
    max: 170,
    step: 1,
    default: 72,
    advanced: true,
    help: 'Turns sharper than this stay sharp through smoothing. Lower keeps more corners crisp.',
  }),
  choice('diagonal', 'Corner touches', {
    group: 'trace',
    default: 'connect',
    advanced: true,
    options: [
      { value: 'connect', label: 'Join them (printable)' },
      { value: 'separate', label: 'Leave them apart' },
    ],
    help: 'Where two ink pixels meet only at a corner. Joining keeps them one body; leaving them apart prints as two loose pieces.',
  }),

  // ------------------------------------------------------------------ model
  choice('style', 'Model', {
    group: 'model',
    default: 'plaque',
    options: [
      { value: 'plaque', label: 'Raised on a plate' },
      { value: 'silhouette', label: 'Silhouette only' },
      { value: 'engraved', label: 'Engraved into a plate' },
      { value: 'cutout', label: 'Cut through a plate (stencil)' },
    ],
  }),
  num('thickness', 'Thickness', {
    group: 'model',
    unit: 'mm',
    min: 0.6,
    max: 20,
    step: 0.2,
    default: 3,
  }),
  num('relief', 'Relief', {
    group: 'model',
    unit: 'mm',
    min: 0.2,
    max: 10,
    step: 0.1,
    default: 1.2,
    visibleIf: hasRelief,
    help: 'How far the artwork stands off the plate, or how deep it is cut into it.',
  }),
  num('margin', 'Plate margin', {
    group: 'model',
    unit: 'mm',
    min: 0,
    max: 40,
    step: 0.5,
    default: 5,
    visibleIf: onPlate,
  }),
  num('corner', 'Plate corner', {
    group: 'model',
    unit: 'mm',
    min: 0,
    max: 40,
    step: 0.5,
    default: 4,
    visibleIf: onPlate,
  }),

  // ------------------------------------------------------------------- size
  choice('fitMode', 'Size by', {
    group: 'size',
    default: 'width',
    options: [
      { value: 'width', label: 'Width, height follows' },
      { value: 'box', label: 'Fit inside a box' },
    ],
  }),
  num('width', 'Artwork width', {
    group: 'size',
    unit: 'mm',
    min: 5,
    max: 250,
    step: 1,
    default: 60,
    help: 'The traced artwork, not the plate around it.',
  }),
  num('height', 'Artwork height', {
    group: 'size',
    unit: 'mm',
    min: 5,
    max: 250,
    step: 1,
    default: 60,
    visibleIf: isBox,
    help: 'The artwork is scaled to fit inside width x height, keeping its proportions.',
  }),

  // ------------------------------------------------------------------- hole
  bool('hole', 'Hanging hole', { group: 'hole', default: false }),
  num('holeDiameter', 'Hole diameter', {
    group: 'hole',
    unit: 'mm',
    min: 1.5,
    max: 12,
    step: 0.5,
    default: 4,
    visibleIf: hasHole,
  }),
  num('holeEdgeOffset', 'Hole inset', {
    group: 'hole',
    unit: 'mm',
    min: 1,
    max: 15,
    step: 0.5,
    default: 2.5,
    visibleIf: hasHole,
    help: 'Material left between the hole and the edge.',
  }),
  choice('holePosition', 'Hole position', {
    group: 'hole',
    default: 'top',
    visibleIf: hasHole,
    options: [
      { value: 'top', label: 'Top' },
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
    ],
  }),

  // ---------------------------------------------------------------- colours
  color('plateColor', 'Plate', { group: 'look', default: '#2f3440', visibleIf: onPlate }),
  color('imageColor', 'Artwork', { group: 'look', default: '#f2f4f8' }),

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
