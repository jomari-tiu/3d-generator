import { bool, choice, color, int, num } from '../../core/params/dsl';
import type { ParamGroup, ParamSpec } from '../../core/params/types';

export const shelfGroups: readonly ParamGroup[] = [
  { id: 'module', label: 'Module & shape', tab: 'Layout' },
  { id: 'size', label: 'Dimensions', tab: 'Layout' },
  { id: 'shelf', label: 'Shelf details', tab: 'Details' },
  { id: 'frame', label: 'Display frame', tab: 'Details' },
  { id: 'joins', label: 'Connectors', tab: 'Details' },
  { id: 'look', label: 'Colours', tab: 'Output' },
  { id: 'printer', label: 'Printer', tab: 'Output', collapsed: true },
];

type V = Record<string, unknown>;
const isFrame = (v: V) => v.moduleType === 'frame';
const isShelf = (v: V) => v.moduleType === 'shelf';
const isWall = (v: V) => v.moduleType === 'wall';
const hasBack = (v: V) => isWall(v) || (isShelf(v) && v.backPanel === true);
const isModular = (v: V) => v.joinMode === 'modules';
const pinned = (v: V) => isModular(v) && v.connector !== 'none';

export const shelfParams: readonly ParamSpec[] = [
  // ----------------------------------------------------------------- module
  choice('moduleType', 'Module', {
    group: 'module',
    default: 'wall',
    options: [
      { value: 'wall', label: 'Wall-mounted shelf' },
      { value: 'shelf', label: 'Freestanding shelf' },
      { value: 'frame', label: 'Display frame' },
    ],
    help: 'Wall shelves have a back panel with mounting holes. Freestanding shelves stack on a desk. Display frames hold a picture or a print behind a border.',
  }),
  choice('shape', 'Shape', {
    group: 'module',
    default: 'hexagon',
    options: [
      { value: 'hexagon', label: 'Hexagon (honeycomb)' },
      { value: 'square', label: 'Square' },
      { value: 'diamond', label: 'Diamond' },
      { value: 'triangle', label: 'Triangle' },
      { value: 'octagon', label: 'Octagon' },
    ],
    help: 'Every shape tiles edge to edge, so neighbouring modules share a flat face to join on.',
  }),
  int('columns', 'Columns', { group: 'module', min: 1, max: 8, default: 3 }),
  int('rows', 'Rows', {
    group: 'module',
    min: 1,
    max: 6,
    default: 2,
    help: 'Hexagons stagger every other column; triangles alternate point-up and point-down.',
  }),
  choice('joinMode', 'Print as', {
    group: 'module',
    default: 'modules',
    options: [
      { value: 'modules', label: 'Separate modules, joined after' },
      { value: 'single', label: 'One piece' },
    ],
    help: 'Separate modules fit any bed and rearrange later. One piece needs no joining, but the whole cluster has to fit your bed.',
  }),

  // ------------------------------------------------------------- dimensions
  num('cellHeight', 'Cell height', {
    group: 'size',
    unit: 'mm',
    min: 30,
    max: 300,
    step: 1,
    default: 120,
    help: 'Outside height of one module, bottom to top. Width follows from the shape.',
  }),
  num('depth', 'Depth', {
    group: 'size',
    unit: 'mm',
    min: 8,
    max: 250,
    step: 1,
    default: 90,
    help: 'Front to back - how far it stands off the wall.',
  }),
  num('wall', 'Wall thickness', {
    group: 'size',
    unit: 'mm',
    min: 1,
    max: 8,
    step: 0.1,
    default: 3,
  }),
  num('cornerRadius', 'Corner radius', {
    group: 'size',
    unit: 'mm',
    min: 0,
    max: 20,
    step: 0.5,
    default: 2,
    help: 'Rounds the outside corners. Faces stay flat, so modules still sit flush.',
  }),
  num('backThickness', 'Back panel', {
    group: 'size',
    unit: 'mm',
    min: 1,
    max: 8,
    step: 0.1,
    default: 2.4,
    visibleIf: hasBack,
  }),

  // ---------------------------------------------------------- shelf details
  bool('backPanel', 'Closed back', {
    group: 'shelf',
    default: true,
    visibleIf: isShelf,
    help: 'Off leaves an open ring - lighter, and the wall shows through.',
  }),
  num('frontRim', 'Front rim', {
    group: 'shelf',
    unit: 'mm',
    min: 0,
    max: 20,
    step: 0.5,
    default: 0,
    visibleIf: (v) => !isFrame(v),
    help: 'A lip around the opening that stops things rolling off. Chamfered at 45 degrees so it prints without support. 0 for none.',
  }),
  choice('mount', 'Mounting', {
    group: 'shelf',
    default: 'keyhole',
    options: [
      { value: 'keyhole', label: 'Keyhole slot - hangs on a screw' },
      { value: 'screw', label: 'Countersunk screw holes' },
      { value: 'none', label: 'None' },
    ],
    visibleIf: (v) => isWall(v) || (isFrame(v) && v.backer === true),
    help: 'Frames carry their keyhole in the backer board.',
  }),

  // ------------------------------------------------------------------ frame
  num('border', 'Border width', {
    group: 'frame',
    unit: 'mm',
    min: 1,
    max: 40,
    step: 0.5,
    default: 8,
    visibleIf: isFrame,
    help: 'How far the front face reaches in past the wall, covering the edge of the picture.',
  }),
  num('rebate', 'Rebate depth', {
    group: 'frame',
    unit: 'mm',
    min: 1,
    max: 40,
    step: 0.5,
    default: 6,
    visibleIf: isFrame,
    help: 'The recess behind the border for the picture, any glazing and the backer.',
  }),
  bool('backer', 'Backer board', {
    group: 'frame',
    default: true,
    visibleIf: isFrame,
    help: 'A separate plate that presses into the rebate behind the picture.',
  }),
  num('backerThickness', 'Backer thickness', {
    group: 'frame',
    unit: 'mm',
    min: 0.8,
    max: 6,
    step: 0.1,
    default: 2,
    visibleIf: (v) => isFrame(v) && v.backer === true,
  }),

  // ------------------------------------------------------------- connectors
  choice('connector', 'Join modules with', {
    group: 'joins',
    default: 'pins',
    options: [
      { value: 'pins', label: 'Printed pins' },
      { value: 'bolts', label: 'M3 bolts and nuts' },
      { value: 'none', label: 'Nothing (glue or tape)' },
    ],
    visibleIf: isModular,
    help: 'Every face gets the same holes, so any module joins to any other.',
  }),
  num('pinDiameter', 'Pin diameter', {
    group: 'joins',
    unit: 'mm',
    min: 3,
    max: 8,
    step: 0.5,
    default: 5,
    visibleIf: (v) => pinned(v) && v.connector === 'pins',
  }),
  num('clearance', 'Fit clearance', {
    group: 'joins',
    unit: 'mm',
    min: 0,
    max: 0.6,
    step: 0.05,
    default: 0.2,
    visibleIf: (v) => pinned(v) || (isFrame(v) && v.backer === true),
    help: 'Added to every hole, and taken off the backer so it drops into the rebate.',
  }),

  // ---------------------------------------------------------------- colours
  color('bodyColor', 'Modules', { group: 'look', default: '#d9b48a' }),
  color('accentColor', 'Pins & backers', { group: 'look', default: '#6f5a46' }),

  // ---------------------------------------------------------------- printer
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
