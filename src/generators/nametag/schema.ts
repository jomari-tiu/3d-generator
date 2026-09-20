import { bool, choice, color, font, num, text } from '../../core/params/dsl';
import type { ParamGroup, ParamSpec } from '../../core/params/types';

export const nameTagGroups: readonly ParamGroup[] = [
  { id: 'style', label: 'Style', tab: 'Design' },
  { id: 'text', label: 'Text', tab: 'Design' },
  { id: 'student', label: 'Second line', tab: 'Design' },
  { id: 'plate', label: 'Plate', tab: 'Shape' },
  { id: 'border', label: 'Border', tab: 'Shape' },
  { id: 'hole', label: 'Hanging hole', tab: 'Shape' },
  { id: 'look', label: 'Colours', tab: 'Output' },
  { id: 'printer', label: 'Printer', tab: 'Output', collapsed: true },
];

const isFixed = (v: Record<string, unknown>) => v.sizeMode === 'fixed';
const isAuto = (v: Record<string, unknown>) => v.sizeMode === 'auto';
/** A named template owns the shape, frame and hole, so those controls hide. */
const isCustom = (v: Record<string, unknown>) => v.template === 'custom';
const hasSecondLine = (v: Record<string, unknown>) => v.secondLine !== 'none';

export const nameTagParams: readonly ParamSpec[] = [
  // ------------------------------------------------------------------ style
  choice('template', 'Template', {
    group: 'style',
    default: 'custom',
    options: [
      { value: 'custom', label: 'Custom - set everything myself' },
      { value: 'classic', label: 'Classic - rounded plate' },
      { value: 'cloud', label: 'Cloud' },
      { value: 'scallop', label: 'Scallop' },
      { value: 'bubble', label: 'Bubble' },
      { value: 'capsule', label: 'Capsule' },
    ],
    help: 'A template sets the shape, the raised frame and the hanging hole. Sizes, colours and fonts stay yours.',
  }),

  // ------------------------------------------------------------------- text
  text('text', 'Text', {
    group: 'text',
    default: 'Hello',
    maxLength: 48,
    multiline: true,
    placeholder: 'One or two lines',
    help: 'Up to two lines - press Enter for a second line.',
    debounceMs: 250,
  }),
  font('font', 'Font', { group: 'text', default: 'inter-bold', debounceMs: 250 }),
  num('fontSize', 'Text size', {
    group: 'text',
    unit: 'mm',
    min: 4,
    max: 40,
    step: 0.5,
    default: 12,
    help: 'Cap height - the height of a capital letter.',
  }),
  num('letterSpacing', 'Letter spacing', {
    group: 'text',
    unit: 'mm',
    min: -1,
    max: 5,
    step: 0.1,
    default: 0,
  }),
  choice('textDirection', 'Direction', {
    group: 'text',
    default: 'horizontal',
    options: [
      { value: 'horizontal', label: 'Horizontal' },
      { value: 'vertical', label: 'Stacked - one letter per line' },
    ],
    help: 'Stacked reads downward, for a tag that hangs on a door or a strap.',
  }),
  num('lineGap', 'Line gap', {
    group: 'text',
    unit: 'mm',
    min: 0,
    max: 15,
    step: 0.5,
    default: 3,
    visibleIf: (v) => String(v.text ?? '').includes('\n') || v.textDirection === 'vertical',
  }),
  choice('align', 'Align', {
    group: 'text',
    default: 'center',
    options: [
      { value: 'left', label: 'Left' },
      { value: 'center', label: 'Centre' },
      { value: 'right', label: 'Right' },
    ],
    // Stacked letters are centred on the column; there is nothing to align.
    visibleIf: (v) => String(v.text ?? '').includes('\n') && v.textDirection !== 'vertical',
  }),
  choice('textMode', 'Style', {
    group: 'text',
    default: 'raised',
    options: [
      { value: 'raised', label: 'Raised' },
      { value: 'engraved', label: 'Engraved' },
      { value: 'cutout', label: 'Cut through' },
    ],
  }),
  num('textDepth', 'Text depth', {
    group: 'text',
    unit: 'mm',
    min: 0.4,
    max: 4,
    step: 0.2,
    default: 1.2,
    visibleIf: (v) => v.textMode !== 'cutout',
    help: 'How far the lettering stands up, or how deep it is cut.',
  }),

  // ------------------------------------------------------------ second line
  choice('secondLine', 'Second line', {
    group: 'student',
    default: 'none',
    options: [
      { value: 'none', label: 'None' },
      { value: 'gradeSection', label: 'Grade and section' },
      { value: 'custom', label: 'Custom line' },
    ],
    help: 'A smaller line under the name - "Grade 2 Jade", a room number, a phone number.',
  }),
  text('grade', 'Grade', {
    group: 'student',
    default: 'Grade 1',
    maxLength: 24,
    placeholder: 'Grade 1, Prep, Kindergarten',
    visibleIf: (v) => v.secondLine === 'gradeSection',
    debounceMs: 250,
  }),
  text('section', 'Section', {
    group: 'student',
    default: 'Rose',
    maxLength: 24,
    placeholder: 'Rose, Jade, Sun',
    visibleIf: (v) => v.secondLine === 'gradeSection',
    debounceMs: 250,
  }),
  text('secondLineText', 'Line', {
    group: 'student',
    default: 'Room 12',
    maxLength: 40,
    visibleIf: (v) => v.secondLine === 'custom',
    debounceMs: 250,
  }),
  font('secondLineFont', 'Font', {
    group: 'student',
    default: 'inter-bold',
    visibleIf: hasSecondLine,
    debounceMs: 250,
    help: 'Usually worth keeping plain even when the name is a script face.',
  }),
  num('secondLineSize', 'Size', {
    group: 'student',
    unit: 'mm',
    min: 2,
    max: 20,
    step: 0.5,
    default: 5,
    visibleIf: hasSecondLine,
    help: 'Cap height. This line is small, so it is the first thing to fall under the nozzle width.',
  }),
  num('secondLineGap', 'Gap under the name', {
    group: 'student',
    unit: 'mm',
    min: 0,
    max: 15,
    step: 0.5,
    default: 2.5,
    visibleIf: hasSecondLine,
  }),

  // ------------------------------------------------------------------ plate
  choice('shape', 'Shape', {
    group: 'plate',
    default: 'rounded',
    options: [
      { value: 'rounded', label: 'Rounded rectangle' },
      { value: 'pill', label: 'Pill' },
      { value: 'ellipse', label: 'Ellipse' },
      { value: 'hex', label: 'Hexagon' },
      { value: 'cloud', label: 'Cloud' },
      { value: 'bubble', label: 'Bubble' },
      { value: 'scallop', label: 'Scallop' },
    ],
    visibleIf: isCustom,
  }),
  choice('sizeMode', 'Size', {
    group: 'plate',
    default: 'auto',
    options: [
      { value: 'auto', label: 'Fit to text' },
      { value: 'fixed', label: 'Fixed size' },
    ],
  }),
  num('padX', 'Side padding', {
    group: 'plate',
    unit: 'mm',
    min: 1,
    max: 20,
    step: 0.5,
    default: 6,
    visibleIf: isAuto,
  }),
  num('padY', 'Top/bottom padding', {
    group: 'plate',
    unit: 'mm',
    min: 1,
    max: 20,
    step: 0.5,
    default: 4,
    visibleIf: isAuto,
  }),
  num('width', 'Width', {
    group: 'plate',
    unit: 'mm',
    min: 15,
    max: 240,
    step: 0.5,
    default: 70,
    visibleIf: isFixed,
  }),
  num('height', 'Height', {
    group: 'plate',
    unit: 'mm',
    min: 10,
    max: 240,
    step: 0.5,
    default: 25,
    visibleIf: isFixed,
  }),
  num('cornerRadius', 'Corner radius', {
    group: 'plate',
    unit: 'mm',
    min: 0,
    max: 15,
    step: 0.5,
    default: 3,
    visibleIf: (v) => v.template === 'custom' && (v.shape === 'rounded' || v.shape === 'scallop'),
  }),
  num('thickness', 'Plate thickness', {
    group: 'plate',
    unit: 'mm',
    min: 1,
    max: 6,
    step: 0.2,
    default: 2.4,
  }),

  // ----------------------------------------------------------------- border
  bool('border', 'Raised border', { group: 'border', default: false, visibleIf: isCustom }),
  num('borderWidth', 'Border width', {
    group: 'border',
    unit: 'mm',
    min: 0.8,
    max: 4,
    step: 0.2,
    default: 1.6,
    visibleIf: (v) => v.template === 'custom' && v.border === true,
  }),
  num('borderGap', 'Border gap', {
    group: 'border',
    unit: 'mm',
    min: 0.4,
    max: 6,
    step: 0.2,
    default: 1.2,
    visibleIf: (v) => v.template === 'custom' && v.border === true,
    help: 'Clear space between the border and the plate edge.',
  }),

  // ------------------------------------------------------------------- hole
  choice('hole', 'Hole', {
    group: 'hole',
    default: 'none',
    options: [
      { value: 'none', label: 'None' },
      { value: 'round', label: 'Round' },
      { value: 'slot', label: 'Slot' },
      { value: 'tab', label: 'Tab loop above the plate' },
    ],
    visibleIf: isCustom,
  }),
  num('holeDiameter', 'Hole size', {
    group: 'hole',
    unit: 'mm',
    min: 2,
    max: 8,
    step: 0.5,
    default: 4,
    visibleIf: (v) => v.hole !== 'none',
  }),
  num('holeEdgeOffset', 'Distance from edge', {
    group: 'hole',
    unit: 'mm',
    min: 1.5,
    max: 10,
    step: 0.5,
    default: 3.5,
    visibleIf: (v) => v.hole !== 'none',
  }),
  choice('holePosition', 'Position', {
    group: 'hole',
    default: 'left',
    options: [
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
      { value: 'top', label: 'Top centre' },
    ],
    visibleIf: (v) => v.template === 'custom' && v.hole !== 'none' && v.hole !== 'tab',
  }),

  // ---------------------------------------------------------------- colours
  color('plateColor', 'Plate', { group: 'look', default: '#2f6fb3' }),
  color('textColor', 'Lettering', {
    group: 'look',
    default: '#f2f4f8',
    visibleIf: (v) => v.textMode === 'raised',
    help: 'Raised lettering exports as its own object, so a filament swap gives two colours.',
  }),

  // ---------------------------------------------------------------- printer
  num('nozzle', 'Nozzle diameter', {
    group: 'printer',
    unit: 'mm',
    min: 0.2,
    max: 1,
    step: 0.05,
    default: 0.4,
    advanced: true,
    help: 'Used to warn about strokes too thin to print.',
  }),
];
