import { bool, choice, color, int, num } from '../../core/params/dsl';
import type { ParamGroup, ParamSpec, Params } from '../../core/params/types';

export const pushDrawerGroups: readonly ParamGroup[] = [
  { id: 'size', label: 'Size', tab: 'Box' },
  { id: 'stack', label: 'Stacking', tab: 'Box' },
  { id: 'mount', label: 'Desk mount', tab: 'Box' },
  { id: 'tray', label: 'Drawer', tab: 'Drawer' },
  { id: 'face', label: 'Front surface', tab: 'Drawer' },
  { id: 'insert', label: 'Insert', tab: 'Drawer' },
  { id: 'latch', label: 'Push latch', tab: 'Latch' },
  { id: 'band', label: 'Band ejector', tab: 'Latch' },
  { id: 'rails', label: 'Rails & stop', tab: 'Latch', collapsed: true },
  { id: 'look', label: 'Colours', tab: 'Output' },
  { id: 'fit', label: 'Fit', tab: 'Output', collapsed: true },
  { id: 'printer', label: 'Printer', tab: 'Output', collapsed: true },
];

const stacked = (v: Params) => Number(v.drawers) > 1;
const patterned = (v: Params) => v.surface !== 'plain';

export const pushDrawerParams: readonly ParamSpec[] = [
  // ------------------------------------------------------------------- size
  int('drawers', 'Drawers', {
    group: 'size',
    min: 1,
    max: 4,
    default: 1,
    help: 'Cases stack one under the other, each with its own drawer and latch. Four is the sensible limit for a stack hung off four screws.',
  }),
  num('width', 'Case width', {
    group: 'size',
    unit: 'mm',
    min: 100,
    max: 320,
    step: 1,
    default: 176,
    help: 'Outside of the case across the desk, wall to wall. The desk-mount ears stand a little outside this.',
  }),
  num('depth', 'Case depth', {
    group: 'size',
    unit: 'mm',
    min: 90,
    max: 260,
    step: 1,
    default: 134,
    help: 'Front to back. The drawer runs the whole of it: the latch lives in the floor, not behind the drawer.',
  }),
  num('height', 'Case height', {
    group: 'size',
    unit: 'mm',
    min: 22,
    max: 80,
    step: 0.5,
    default: 32.4,
    help: 'One case, floor to the top of its walls. Stacked, this is also the pitch from one drawer to the next.',
  }),
  num('wall', 'Case wall', { group: 'size', unit: 'mm', min: 1.6, max: 4, step: 0.2, default: 2 }),

  // ---------------------------------------------------------------- stacking
  choice('connector', 'Stack connector', {
    group: 'stack',
    default: 'screws',
    visibleIf: stacked,
    options: [
      { value: 'screws', label: 'Printed screws — down through corner lugs, nothing to buy' },
      { value: 'bolts', label: 'M3 bolts — through the same lugs, nut trapped below' },
      { value: 'dovetail', label: 'Dovetail keys — slide a printed key in from the front' },
      { value: 'none', label: 'None — cases just sit on each other' },
    ],
    help: 'How one case hangs off the one above it. Every case carries both halves of the joint at all four corners, so a stack is the same case printed again — only the top one is screwed to the desk.',
  }),

  // ---------------------------------------------------------------- mounting
  choice('mount', 'Fix to the desk with', {
    group: 'mount',
    default: 'screws',
    options: [
      { value: 'screws', label: 'Screws — four ears with clearance holes' },
      { value: 'tape', label: 'Double-sided tape — flat wall tops, no ears' },
    ],
  }),
  num('screwDiameter', 'Screw diameter', {
    group: 'mount',
    unit: 'mm',
    min: 2.5,
    max: 6,
    step: 0.1,
    default: 3.2,
    visibleIf: (v) => v.mount === 'screws',
    help: 'Clearance hole through the ears. 3.2 mm clears an M3 or a #4 wood screw.',
  }),

  // -------------------------------------------------------------- the drawer
  num('trayWall', 'Drawer wall', { group: 'tray', unit: 'mm', min: 1.2, max: 3, step: 0.1, default: 1.5 }),
  num('lip', 'Front stand-off', {
    group: 'tray',
    unit: 'mm',
    min: 2,
    max: 15,
    step: 0.5,
    default: 5.5,
    help: 'How far the drawer front stands proud of the case when it is shut. This is what you push on.',
  }),
  num('cornerRadius', 'Corner radius', { group: 'tray', unit: 'mm', min: 0, max: 8, step: 0.5, default: 2 }),

  // ----------------------------------------------------------- front surface
  choice('surface', 'Front surface', {
    group: 'face',
    default: 'plain',
    options: [
      { value: 'plain', label: 'Plain' },
      { value: 'ribs', label: 'Ribs — fine horizontal lines' },
      { value: 'chevron', label: 'Chevron' },
      { value: 'hex', label: 'Hex tiles' },
      { value: 'diamond', label: 'Diamond tiles' },
      { value: 'dots', label: 'Dots' },
      { value: 'voronoi', label: 'Voronoi cells' },
      { value: 'knurl', label: 'Knurl' },
    ],
    help: 'A relief worked into the face you push on. Engraved, it is cut into the front wall; embossed, it stands off it.',
  }),
  choice('surfaceMode', 'Relief', {
    group: 'face',
    default: 'engrave',
    visibleIf: patterned,
    options: [
      { value: 'engrave', label: 'Engraved into the face' },
      { value: 'emboss', label: 'Embossed, standing proud' },
    ],
  }),
  num('surfaceCell', 'Pattern pitch', {
    group: 'face',
    unit: 'mm',
    min: 2,
    max: 30,
    step: 0.5,
    default: 8,
    visibleIf: patterned,
  }),
  num('surfaceGap', 'Pattern web', {
    group: 'face',
    unit: 'mm',
    min: 0.6,
    max: 6,
    step: 0.1,
    default: 1.2,
    visibleIf: patterned,
    help: 'The plain material left between one shape and the next.',
  }),
  num('surfaceDepth', 'Relief depth', {
    group: 'face',
    unit: 'mm',
    min: 0.2,
    max: 1.5,
    step: 0.1,
    default: 0.6,
    visibleIf: patterned,
  }),
  num('surfaceAngle', 'Pattern angle', {
    group: 'face',
    unit: 'deg',
    min: 0,
    max: 180,
    step: 5,
    default: 0,
    visibleIf: patterned,
  }),
  num('surfaceBorder', 'Plain border', {
    group: 'face',
    unit: 'mm',
    min: 0,
    max: 15,
    step: 0.5,
    default: 4,
    visibleIf: patterned,
  }),

  // ------------------------------------------------------------------ insert
  choice('insert', 'Insert', {
    group: 'insert',
    default: 'gridfinity',
    options: [
      { value: 'gridfinity', label: 'Gridfinity baseplate — 42 mm grid' },
      { value: 'dividers', label: 'Printed dividers' },
      { value: 'none', label: 'Nothing — an open tray' },
    ],
    help: 'The baseplate is sized to as many whole 42 mm cells as the drawer fits, and drops in loose so you can lift it out.',
  }),
  int('dividersX', 'Dividers across', { group: 'insert', min: 0, max: 8, default: 2, visibleIf: (v) => v.insert === 'dividers' }),
  int('dividersY', 'Dividers front to back', { group: 'insert', min: 0, max: 8, default: 1, visibleIf: (v) => v.insert === 'dividers' }),

  // ------------------------------------------------------------------- latch
  bool('latch', 'Push to open, push to close', {
    group: 'latch',
    default: true,
    help: 'A heart-shaped island in the drawer’s underside and a sprung arm in the case floor whose pin walks round it. Off, the drawer is a plain pull-out on the same rails.',
  }),
  num('bossDiameter', 'Pin diameter', {
    group: 'latch',
    unit: 'mm',
    min: 3,
    max: 6,
    step: 0.5,
    default: 4,
    help: 'The pin on the end of the arm. The whole cam scales with it, because every gap in the cam is a pin-width plus a hair.',
  }),
  num('armWidth', 'Arm width', {
    group: 'latch',
    unit: 'mm',
    min: 0.8,
    max: 2,
    step: 0.1,
    default: 1.2,
    help: 'Thinner is softer and easier to push; thicker holds the drawer shut harder. Two to three nozzle widths.',
  }),
  num('armHeight', 'Arm height', { group: 'latch', unit: 'mm', min: 2, max: 5, step: 0.2, default: 3 }),
  num('camWidth', 'Cam width', {
    group: 'latch',
    unit: 'mm',
    min: 4,
    max: 24,
    step: 0.5,
    default: 10,
    help: 'How far the groove throws the pin sideways. Wider is a more positive click and needs a longer, softer arm.',
  }),
  num('camStep', 'One-way step', {
    group: 'latch',
    unit: 'mm',
    min: 0.2,
    max: 1.5,
    step: 0.05,
    default: 0.4,
    help: 'How far the groove floor drops at each corner. This is what stops the pin going back the way it came, and it is the first thing to raise if the latch skips.',
  }),
  num('leadIn', 'Lead-in', {
    group: 'latch',
    unit: 'mm',
    min: 3,
    max: 25,
    step: 0.5,
    default: 8,
    help: 'Straight run that funnels the pin back into the cam when you push the drawer in from fully open.',
  }),
  num('overtravel', 'Overtravel', {
    group: 'latch',
    unit: 'mm',
    min: 5,
    max: 14,
    step: 0.5,
    default: 8.5,
    help: 'How far the shut drawer can still be pushed in. The cam needs most of this to work; the rest is what the push feels like.',
  }),

  // -------------------------------------------------------------------- band
  num('bandLength', 'Band length', {
    group: 'band',
    unit: 'mm',
    min: 20,
    max: 60,
    step: 1,
    default: 35,
    help: 'The elastic band, laid flat and measured end to end — a 35 mm stationery band. One per side, from a post in the case to a post under the drawer.',
  }),
  num('bandPull', 'Band stretch when shut', {
    group: 'band',
    unit: 'mm',
    min: 20,
    max: 70,
    step: 1,
    default: 39,
    help: 'How far apart the two posts sit with the drawer shut. Further is a harder pop; the readout says how far the drawer flies before the band goes slack.',
  }),

  // ------------------------------------------------------------ rails & stop
  num('railHeight', 'Rail height', { group: 'rails', unit: 'mm', min: 5, max: 10, step: 0.5, default: 7 }),

  // --------------------------------------------------------------- colours
  color('caseColor', 'Case', { group: 'look', default: '#5a4636' }),
  color('trayColor', 'Drawer', { group: 'look', default: '#c9b79c' }),
  color('partColor', 'Small parts', { group: 'look', default: '#8a6a4a' }),

  // ------------------------------------------------------------------- fit
  num('clearance', 'Running clearance', {
    group: 'fit',
    unit: 'mm',
    min: 0.2,
    max: 0.8,
    step: 0.05,
    default: 0.4,
    help: 'Between the drawer and everything it slides past. One number sets the whole fit.',
  }),

  // --------------------------------------------------------------- printer
  num('nozzle', 'Nozzle diameter', { group: 'printer', unit: 'mm', min: 0.2, max: 1, step: 0.05, default: 0.4 }),
  num('layer', 'Layer height', { group: 'printer', unit: 'mm', min: 0.08, max: 0.32, step: 0.02, default: 0.2 }),
  num('bedX', 'Bed width', { group: 'printer', unit: 'mm', min: 100, max: 500, step: 1, default: 256, advanced: true }),
  num('bedY', 'Bed depth', { group: 'printer', unit: 'mm', min: 100, max: 500, step: 1, default: 256, advanced: true }),
];
