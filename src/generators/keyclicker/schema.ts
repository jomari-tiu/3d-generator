import { bool, choice, color, font, num, text } from '../../core/params/dsl';
import type { ParamGroup, ParamSpec } from '../../core/params/types';

export const keyClickerGroups: readonly ParamGroup[] = [
  { id: 'keys', label: 'Keys & legends', tab: 'Keys' },
  { id: 'switch', label: 'Switches', tab: 'Keys' },
  { id: 'cap', label: 'Keycaps', tab: 'Shape' },
  { id: 'body', label: 'Body', tab: 'Shape' },
  { id: 'look', label: 'Colours', tab: 'Output' },
  { id: 'tol', label: 'Tolerances', tab: 'Output', collapsed: true },
  { id: 'printer', label: 'Printer', tab: 'Output', collapsed: true },
];

const isPrinted = (v: Record<string, unknown>) => v.switchType === 'printed';

export const keyClickerParams: readonly ParamSpec[] = [
  // ------------------------------------------------------------------- keys
  text('text', 'Letters', {
    group: 'keys',
    default: 'KONG',
    maxLength: 12,
    placeholder: 'One key per character',
    help: 'One key per character, up to twelve. Spaces are ignored.',
    debounceMs: 250,
  }),
  font('legendFont', 'Legend font', { group: 'keys', default: 'nunito-extrabold', debounceMs: 250 }),
  num('legendSize', 'Legend size', {
    group: 'keys',
    unit: 'mm',
    min: 2,
    max: 14,
    step: 0.5,
    default: 6,
    help: 'Cap height. Legends are small, so this is where a thin font gives up first.',
  }),
  num('legendDepth', 'Legend depth', {
    group: 'keys',
    unit: 'mm',
    min: 0.2,
    max: 1.5,
    step: 0.1,
    default: 0.6,
    help: 'How far the letter stands proud, or how deep it is cut in.',
  }),
  choice('legendStyle', 'Legend', {
    group: 'keys',
    default: 'raised',
    options: [
      { value: 'raised', label: 'Raised' },
      { value: 'inlay', label: 'Two-colour inlay' },
      { value: 'engraved', label: 'Engraved only' },
      { value: 'none', label: 'Blank keys' },
    ],
    help: 'Raised letters you can feel, printed legend-up - which means supports under the cap. The inlay prints upside down with none: swap filament at the right layer and the letters come out in a second colour.',
  }),

  // --------------------------------------------------------------- switches
  choice('switchType', 'Switch', {
    group: 'switch',
    default: 'mx',
    options: [
      { value: 'mx', label: 'Cherry MX or clone' },
      { value: 'choc', label: 'Kailh Choc v1 (low profile)' },
      { value: 'printed', label: 'Printed snap dome (no hardware)' },
    ],
    help: 'A real switch is what makes it click properly. The printed dome needs no parts but is a softer tick.',
  }),
  num('travel', 'Key travel', {
    group: 'switch',
    unit: 'mm',
    min: 0.6,
    max: 4,
    step: 0.1,
    default: 1.6,
    visibleIf: isPrinted,
  }),
  num('domeDiameter', 'Dome diameter', {
    group: 'switch',
    unit: 'mm',
    min: 5,
    max: 16,
    step: 0.5,
    default: 9,
    visibleIf: isPrinted,
  }),
  num('domeHeight', 'Dome height', {
    group: 'switch',
    unit: 'mm',
    min: 0.6,
    max: 3,
    step: 0.1,
    default: 1.4,
    visibleIf: isPrinted,
    help: 'Against the dome wall thickness, this is what decides whether it snaps or just squashes.',
  }),

  // ---------------------------------------------------------------- keycaps
  num('keyPitch', 'Key pitch', {
    group: 'cap',
    unit: 'mm',
    min: 14,
    max: 24,
    step: 0.05,
    default: 19.05,
    help: 'Centre to centre. 19.05 is standard keyboard spacing.',
  }),
  num('keySize', 'Keycap size', {
    group: 'cap',
    unit: 'mm',
    min: 10,
    max: 22,
    step: 0.1,
    default: 17.4,
  }),
  num('capHeight', 'Keycap height', {
    group: 'cap',
    unit: 'mm',
    min: 3,
    max: 14,
    step: 0.5,
    default: 7,
  }),
  num('capTaper', 'Side taper', {
    group: 'cap',
    unit: 'deg',
    min: 0,
    max: 20,
    step: 1,
    default: 6,
  }),
  num('capCorner', 'Corner radius', {
    group: 'cap',
    unit: 'mm',
    min: 0,
    max: 5,
    step: 0.1,
    default: 1.6,
  }),
  bool('capDish', 'Dished top', { group: 'cap', default: true }),

  // ------------------------------------------------------------------- body
  num('wall', 'Wall thickness', {
    group: 'body',
    unit: 'mm',
    min: 1,
    max: 5,
    step: 0.1,
    default: 2,
  }),
  num('endWall', 'End wall', {
    group: 'body',
    unit: 'mm',
    min: 1,
    max: 12,
    step: 0.5,
    default: 3,
  }),
  num('baseCorner', 'Body corner radius', {
    group: 'body',
    unit: 'mm',
    min: 0,
    max: 10,
    step: 0.5,
    default: 3,
  }),
  bool('keyring', 'Keyring loop', { group: 'body', default: true }),
  num('loopDiameter', 'Loop hole', {
    group: 'body',
    unit: 'mm',
    min: 2,
    max: 10,
    step: 0.5,
    default: 5,
    visibleIf: (v) => v.keyring === true,
  }),
  choice('loopPosition', 'Loop position', {
    group: 'body',
    default: 'end',
    options: [
      { value: 'end', label: 'On the end' },
      { value: 'side', label: 'On the side' },
    ],
    visibleIf: (v) => v.keyring === true,
  }),

  // ---------------------------------------------------------------- colours
  choice('material', 'Material', {
    group: 'look',
    default: 'PETG',
    options: [
      { value: 'PLA', label: 'PLA' },
      { value: 'PETG', label: 'PETG' },
      { value: 'ABS', label: 'ABS' },
      { value: 'ASA', label: 'ASA' },
    ],
  }),
  color('bodyColor', 'Body', { group: 'look', default: '#c8a37a' }),
  color('capColor', 'Keycaps', { group: 'look', default: '#e7cfae' }),
  color('legendColor', 'Legends', { group: 'look', default: '#5b3a22' }),
  color('coverColor', 'Bottom cover', { group: 'look', default: '#8b93a1' }),

  // -------------------------------------------------------------- tolerances
  num('partClearance', 'Fit clearance', {
    group: 'tol',
    unit: 'mm',
    min: 0.02,
    max: 0.4,
    step: 0.01,
    default: 0.1,
    help: 'Applied to the switch cutouts and the stems. Switch fits want this TIGHT - 0.1 mm, not 0.25.',
  }),
  num('fitOffset', 'Fit offset', {
    group: 'tol',
    unit: 'mm',
    min: -0.15,
    max: 0.25,
    step: 0.01,
    default: 0,
    help: 'Global correction for your printer. Add to loosen everything at once.',
  }),

  // ----------------------------------------------------------------- printer
  num('nozzle', 'Nozzle diameter', {
    group: 'printer',
    unit: 'mm',
    min: 0.2,
    max: 1,
    step: 0.05,
    default: 0.4,
  }),
  num('layer', 'Layer height', {
    group: 'printer',
    unit: 'mm',
    min: 0.08,
    max: 0.32,
    step: 0.02,
    default: 0.2,
  }),
  num('bedX', 'Bed width', {
    group: 'printer',
    unit: 'mm',
    min: 100,
    max: 500,
    step: 1,
    default: 256,
    advanced: true,
  }),
  num('bedY', 'Bed depth', {
    group: 'printer',
    unit: 'mm',
    min: 100,
    max: 500,
    step: 1,
    default: 256,
    advanced: true,
  }),
];
