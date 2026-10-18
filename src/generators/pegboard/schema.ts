import { bool, choice, color, int, num } from '../../core/params/dsl';
import type { ParamGroup, ParamSpec } from '../../core/params/types';

export const pegboardGroups: readonly ParamGroup[] = [
  { id: 'panel', label: 'Pegboard panel', tab: 'Board' },
  { id: 'holes', label: 'Hole grid', tab: 'Board' },
  { id: 'desk', label: 'Desk & clamp', tab: 'Clamp' },
  { id: 'tray', label: 'Top tray', tab: 'Clamp' },
  { id: 'hooksA', label: 'Utility hooks', tab: 'Add-ons' },
  { id: 'headphone', label: 'Headphone hook', tab: 'Add-ons', collapsed: true },
  { id: 'cup', label: 'Cup holder', tab: 'Add-ons', collapsed: true },
  { id: 'phone', label: 'Phone stand', tab: 'Add-ons', collapsed: true },
  { id: 'cable', label: 'Cable holder', tab: 'Add-ons', collapsed: true },
  { id: 'pen', label: 'Pen holder', tab: 'Add-ons', collapsed: true },
  { id: 'shelf', label: 'Small shelf', tab: 'Add-ons', collapsed: true },
  { id: 'bottom', label: 'Bottom storage tray', tab: 'Add-ons', collapsed: true },
  { id: 'controller', label: 'Controller holder', tab: 'Add-ons', collapsed: true },
  { id: 'hooksB', label: 'Additional hooks', tab: 'Add-ons', collapsed: true },
  { id: 'look', label: 'Preview', tab: 'Output' },
  { id: 'printer', label: 'Printing', tab: 'Output' },
];

type V = Record<string, unknown>;
const on = (id: string) => (v: V) => v[id] === true;

/** Column and row of an accessory's top-left peg, the same pair for every accessory. */
function placement(group: string, col: number, row: number): ParamSpec[] {
  return [
    int(`${group}Col`, 'Column', {
      group, min: 1, max: 24, default: col, visibleIf: on(group),
      help: 'Hole column of its left-hand peg, counted from the left edge of the board.',
    }),
    int(`${group}Row`, 'Row', {
      group, min: 1, max: 24, default: row, visibleIf: on(group),
      help: 'Hole row of its top peg, counted down from the top of the hole grid.',
    }),
  ];
}

/** A row of hooks: shape, how many, how far apart, and where. */
function hookSet(group: string, label: string, enabled: boolean, col: number, row: number, style: string): ParamSpec[] {
  const shown = on(group);
  return [
    bool(group, label, { group, default: enabled }),
    choice(`${group}Style`, 'Shape', {
      group, default: style, visibleIf: shown,
      options: [
        { value: 'j', label: 'J hook - cables, bags, small tools' },
        { value: 'double', label: 'Double step - keys, two things on one hook' },
        { value: 'u', label: 'Deep U - coiled cables' },
        { value: 'peg', label: 'Straight peg - tape rolls, scissors' },
      ],
    }),
    int(`${group}Count`, 'How many', { group, min: 1, max: 12, default: 2, visibleIf: shown }),
    int(`${group}Spacing`, 'Spacing', {
      group, unit: 'count', min: 1, max: 6, default: 1, visibleIf: (v) => shown(v) && Number(v[`${group}Count`]) > 1,
      help: 'Hole columns from one hook to the next.',
    }),
    ...placement(group, col, row),
    num(`${group}Length`, 'Reach', { group, unit: 'mm', min: 15, max: 90, step: 1, default: 35, visibleIf: shown, help: 'How far the hook stands out from the board.' }),
    num(`${group}Width`, 'Width', { group, unit: 'mm', min: 8, max: 30, step: 0.5, default: 10, visibleIf: shown }),
    num(`${group}Turn`, 'Turn', {
      group, unit: 'deg', min: -45, max: 45, step: 5, default: 0, visibleIf: shown,
      help: 'Swing the arm left or right, so whatever hangs on it clears its neighbour.',
    }),
  ];
}

export const pegboardParams: readonly ParamSpec[] = [
  // ------------------------------------------------------------------ panel
  choice('mount', 'Panel position', {
    group: 'panel',
    default: 'below',
    options: [
      { value: 'below', label: 'Hangs down beside the desk' },
      { value: 'above', label: 'Stands up above the desk' },
    ],
    help: 'The panel slides onto the clamps either way. Hanging keeps the desk top clear; standing puts everything at eye level.',
  }),
  num('panelWidth', 'Width', { group: 'panel', unit: 'mm', min: 100, max: 600, step: 1, default: 240, help: 'Along the desk edge.' }),
  num('panelHeight', 'Height', { group: 'panel', unit: 'mm', min: 120, max: 600, step: 1, default: 240 }),
  num('panelThickness', 'Board thickness', {
    group: 'panel', unit: 'mm', min: 2.4, max: 8, step: 0.1, default: 4,
    help: 'The holed face. A frame and ribs behind it hold it off the clamp, leaving room for the hook tails.',
  }),
  num('panelCorner', 'Corner radius', { group: 'panel', unit: 'mm', min: 0, max: 30, step: 0.5, default: 6 }),
  num('panelChamfer', 'Edge chamfer', { group: 'panel', unit: 'mm', min: 0, max: 3, step: 0.1, default: 0.8, help: 'Bevels the front edge. 0 for a square edge.' }),
  bool('backRibs', 'Reinforcing ribs', {
    group: 'panel', default: true,
    help: 'Upright ribs on the back between hole columns. They run between the columns, so hook tails still drop in anywhere.',
  }),

  // ------------------------------------------------------------------ holes
  num('holeD', 'Hole diameter', {
    group: 'holes', unit: 'mm', min: 4, max: 10, step: 0.1, default: 6.5,
    help: 'Every accessory peg is sized from this, less the fit clearance.',
  }),
  num('pitchX', 'Horizontal spacing', { group: 'holes', unit: 'mm', min: 15, max: 50, step: 0.5, default: 25 }),
  num('pitchZ', 'Vertical spacing', { group: 'holes', unit: 'mm', min: 15, max: 50, step: 0.5, default: 25 }),

  // ------------------------------------------------------------------- desk
  num('deskThickness', 'Desk thickness', {
    group: 'desk', unit: 'mm', min: 10, max: 80, step: 0.5, default: 25,
    help: 'Measure the edge where it will clamp. The preview winds the screw up to it.',
  }),
  num('clampOpening', 'Clamp opening', {
    group: 'desk', unit: 'mm', min: 15, max: 90, step: 0.5, default: 40,
    help: 'The thickest desk the clamp fits, with the screw wound all the way down.',
  }),
  num('screwTravel', 'Screw travel', {
    group: 'desk', unit: 'mm', min: 5, max: 50, step: 0.5, default: 25,
    help: 'How far the screw winds up. The thinnest desk it grips is the opening less this.',
  }),
  int('clampCount', 'Clamps', {
    group: 'desk', min: 1, max: 4, default: 2,
    help: 'Spread evenly along the panel. Two stop a wide panel from rocking.',
  }),
  num('clampWidth', 'Clamp width', { group: 'desk', unit: 'mm', min: 25, max: 80, step: 1, default: 40 }),
  num('jawDepth', 'Jaw depth', { group: 'desk', unit: 'mm', min: 30, max: 100, step: 1, default: 50, help: 'How far the jaws reach in over and under the desk.' }),
  num('jawThickness', 'Jaw thickness', { group: 'desk', unit: 'mm', min: 4, max: 16, step: 0.5, default: 7 }),
  num('spineThickness', 'Spine thickness', {
    group: 'desk', unit: 'mm', min: 9, max: 24, step: 0.5, default: 12,
    help: 'The upright of the C, down the face of the desk edge. The panel rail slides into a dovetail in it.',
  }),
  choice('clampScrew', 'Tightened by', {
    group: 'desk', default: 'printed',
    options: [
      { value: 'printed', label: 'Printed thumb screw and nut' },
      { value: 'm8', label: 'M8 bolt and nut' },
      { value: 'm6', label: 'M6 bolt and nut' },
    ],
    help: 'The nut drops into a hex pocket in the lower jaw. A metal bolt grips harder; the printed screw needs no hardware.',
  }),
  bool('deskPads', 'Protective pads', {
    group: 'desk', default: true,
    help: 'A pad under the top jaw, and the swivel pad on the screw. Print them in TPU if you can.',
  }),
  num('padThickness', 'Pad thickness', { group: 'desk', unit: 'mm', min: 0.8, max: 4, step: 0.1, default: 1.5, visibleIf: on('deskPads') }),
  bool('lockScrew', 'Rail lock screw', {
    group: 'desk', default: true,
    help: 'A hole down through each clamp onto the panel rail, for an M3 screw that stops the panel sliding sideways.',
  }),

  // ------------------------------------------------------------------- tray
  bool('tray', 'Top tray', { group: 'tray', default: true, help: 'Sits on the top jaws, located by pegs.' }),
  num('trayWidth', 'Length', { group: 'tray', unit: 'mm', min: 60, max: 600, step: 1, default: 240, visibleIf: on('tray'), help: 'Along the desk edge. Longer than your bed and it prints in sections.' }),
  num('trayDepth', 'Depth', { group: 'tray', unit: 'mm', min: 40, max: 200, step: 1, default: 90, visibleIf: on('tray') }),
  num('trayWall', 'Wall height', { group: 'tray', unit: 'mm', min: 10, max: 80, step: 0.5, default: 24, visibleIf: on('tray') }),
  num('trayLip', 'Desk-side lip', {
    group: 'tray', unit: 'mm', min: 4, max: 80, step: 0.5, default: 14, visibleIf: on('tray'),
    help: 'The wall nearest you, kept low so things lift out easily.',
  }),
  num('trayBase', 'Base thickness', { group: 'tray', unit: 'mm', min: 1.2, max: 5, step: 0.1, default: 2.4, visibleIf: on('tray') }),
  num('trayCorner', 'Corner radius', { group: 'tray', unit: 'mm', min: 0, max: 20, step: 0.5, default: 6, visibleIf: on('tray') }),
  int('trayDividers', 'Dividers', { group: 'tray', min: 0, max: 8, default: 2, visibleIf: on('tray') }),
  bool('removableDividers', 'Removable dividers', {
    group: 'tray', default: true, visibleIf: (v) => v.tray === true && Number(v.trayDividers) > 0,
    help: 'Separate plates that slide into guide slots, so the compartments can change later.',
  }),

  // ------------------------------------------------------------ accessories
  ...hookSet('hooksA', 'Utility hooks', true, 3, 1, 'j'),

  bool('headphone', 'Headphone hook', { group: 'headphone', default: true }),
  ...placement('headphone', 1, 1),
  num('headphoneLength', 'Reach', { group: 'headphone', unit: 'mm', min: 40, max: 120, step: 1, default: 75, visibleIf: on('headphone') }),
  num('headphoneWidth', 'Width', { group: 'headphone', unit: 'mm', min: 20, max: 60, step: 1, default: 34, visibleIf: on('headphone'), help: 'A wide saddle spreads the headband so it does not dent.' }),
  num('headphoneTurn', 'Turn', { group: 'headphone', unit: 'deg', min: -45, max: 45, step: 5, default: 0, visibleIf: on('headphone') }),

  bool('cup', 'Cup holder', { group: 'cup', default: true }),
  ...placement('cup', 2, 4),
  num('cupDiameter', 'Inside diameter', { group: 'cup', unit: 'mm', min: 40, max: 110, step: 1, default: 78, visibleIf: on('cup') }),
  num('cupDepth', 'Depth', { group: 'cup', unit: 'mm', min: 30, max: 140, step: 1, default: 70, visibleIf: on('cup') }),
  choice('cupBottom', 'Bottom', {
    group: 'cup', default: 'drain', visibleIf: on('cup'),
    options: [
      { value: 'drain', label: 'Closed, with drain holes' },
      { value: 'closed', label: 'Closed' },
      { value: 'ring', label: 'Open ring - the cup rests on a ledge' },
    ],
  }),

  bool('phone', 'Phone stand', { group: 'phone', default: true }),
  ...placement('phone', 6, 1),
  num('phoneWidth', 'Width', { group: 'phone', unit: 'mm', min: 50, max: 120, step: 1, default: 80, visibleIf: on('phone') }),
  num('phoneThickness', 'Phone thickness', { group: 'phone', unit: 'mm', min: 7, max: 22, step: 0.5, default: 13, visibleIf: on('phone'), help: 'With its case on.' }),
  num('phoneAngle', 'Lean angle', { group: 'phone', unit: 'deg', min: 55, max: 80, step: 1, default: 68, visibleIf: on('phone'), help: 'From horizontal. Steeper takes less room; shallower is easier to read.' }),
  num('phoneLip', 'Front lip', { group: 'phone', unit: 'mm', min: 4, max: 20, step: 0.5, default: 9, visibleIf: on('phone') }),
  bool('phoneCableSlot', 'Charging cable slot', { group: 'phone', default: true, visibleIf: on('phone') }),

  bool('cable', 'Cable holder', { group: 'cable', default: true }),
  ...placement('cable', 5, 4),
  int('cableSlots', 'Slots', { group: 'cable', min: 1, max: 10, default: 3, visibleIf: on('cable') }),
  num('cableDiameter', 'Cable diameter', {
    group: 'cable', unit: 'mm', min: 2.5, max: 12, step: 0.5, default: 5, visibleIf: on('cable'),
    help: 'The slot entry is a little narrower, so the cable clicks in and the plug rests on top.',
  }),
  num('cableReach', 'Reach', { group: 'cable', unit: 'mm', min: 15, max: 50, step: 1, default: 25, visibleIf: on('cable') }),

  bool('pen', 'Pen holder', { group: 'pen', default: true }),
  ...placement('pen', 8, 4),
  choice('penShape', 'Shape', {
    group: 'pen', default: 'round', visibleIf: on('pen'),
    options: [
      { value: 'round', label: 'Round' },
      { value: 'square', label: 'Square' },
    ],
  }),
  num('penSize', 'Inside size', { group: 'pen', unit: 'mm', min: 25, max: 90, step: 1, default: 46, visibleIf: on('pen'), help: 'Diameter, or width of the square.' }),
  num('penHeight', 'Height', { group: 'pen', unit: 'mm', min: 30, max: 150, step: 1, default: 75, visibleIf: on('pen') }),

  bool('shelf', 'Small shelf', { group: 'shelf', default: false }),
  ...placement('shelf', 6, 5),
  num('shelfWidth', 'Width', { group: 'shelf', unit: 'mm', min: 40, max: 240, step: 1, default: 70, visibleIf: on('shelf') }),
  num('shelfDepth', 'Depth', { group: 'shelf', unit: 'mm', min: 25, max: 120, step: 1, default: 45, visibleIf: on('shelf') }),
  num('shelfLip', 'Lip height', { group: 'shelf', unit: 'mm', min: 2, max: 30, step: 0.5, default: 8, visibleIf: on('shelf'), help: 'Front and side lips stop things rolling off.' }),

  bool('bottom', 'Bottom storage tray', { group: 'bottom', default: true, help: 'A wide shelf across the foot of the board, for a phone, adapters or stationery.' }),
  num('bottomWidth', 'Width', { group: 'bottom', unit: 'mm', min: 60, max: 500, step: 1, default: 220, visibleIf: on('bottom') }),
  num('bottomDepth', 'Depth', { group: 'bottom', unit: 'mm', min: 30, max: 150, step: 1, default: 75, visibleIf: on('bottom') }),
  num('bottomLip', 'Lip height', { group: 'bottom', unit: 'mm', min: 4, max: 40, step: 0.5, default: 14, visibleIf: on('bottom') }),
  int('bottomRaise', 'Rows up from the bottom', { group: 'bottom', min: 0, max: 12, default: 0, visibleIf: on('bottom') }),

  bool('controller', 'Controller holder', { group: 'controller', default: false }),
  ...placement('controller', 3, 6),
  num('controllerSpan', 'Grip spacing', {
    group: 'controller', unit: 'mm', min: 50, max: 140, step: 1, default: 80, visibleIf: on('controller'),
    help: 'Centre to centre of the two arms. The controller rests on them by its handles, sticks facing out.',
  }),
  num('controllerReach', 'Reach', { group: 'controller', unit: 'mm', min: 30, max: 90, step: 1, default: 55, visibleIf: on('controller') }),
  num('controllerArmWidth', 'Arm width', { group: 'controller', unit: 'mm', min: 10, max: 30, step: 1, default: 16, visibleIf: on('controller') }),

  ...hookSet('hooksB', 'Additional hooks', false, 1, 7, 'peg'),

  // ------------------------------------------------------------------- look
  choice('palette', 'Colour', {
    group: 'look', default: 'black',
    options: [
      { value: 'black', label: 'Matte black' },
      { value: 'white', label: 'White' },
      { value: 'gray', label: 'Gray' },
      { value: 'custom', label: 'Custom' },
    ],
  }),
  color('panelColor', 'Panel & tray', { group: 'look', default: '#2a2c30', visibleIf: (v) => v.palette === 'custom' }),
  color('clampColor', 'Clamps', { group: 'look', default: '#4a4f57', visibleIf: (v) => v.palette === 'custom' }),
  color('accessoryColor', 'Accessories', { group: 'look', default: '#e07a2f', visibleIf: (v) => v.palette === 'custom' }),
  bool('showDesk', 'Show the desk', { group: 'look', default: true, help: 'A slab of desk in the assembled view, to show how the clamp grips it. Never exported.' }),

  // ---------------------------------------------------------------- printer
  num('nozzle', 'Nozzle diameter', { group: 'printer', unit: 'mm', min: 0.2, max: 1, step: 0.05, default: 0.4 }),
  num('layer', 'Layer height', { group: 'printer', unit: 'mm', min: 0.08, max: 0.32, step: 0.02, default: 0.2 }),
  num('minWall', 'Minimum wall', {
    group: 'printer', unit: 'mm', min: 0.8, max: 4, step: 0.1, default: 1.2,
    help: 'Walls thinner than this are flagged. Accessory walls never go below it.',
  }),
  num('accWall', 'Accessory wall', { group: 'printer', unit: 'mm', min: 1.6, max: 6, step: 0.1, default: 2.4 }),
  num('clearance', 'Fit clearance', {
    group: 'printer', unit: 'mm', min: 0.05, max: 0.6, step: 0.05, default: 0.25,
    help: 'Taken off every peg, rail and divider and added to every hole, slot and pocket.',
  }),
  num('bedX', 'Bed width', { group: 'printer', unit: 'mm', min: 100, max: 500, step: 1, default: 256, help: 'Parts bigger than the bed are split into sections that dowel together.' }),
  num('bedY', 'Bed depth', { group: 'printer', unit: 'mm', min: 100, max: 500, step: 1, default: 256 }),
];
