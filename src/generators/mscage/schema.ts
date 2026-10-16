import { bool, choice, color, int, num } from '../../core/params/dsl';
import type { ParamGroup, ParamSpec } from '../../core/params/types';
import { clawColourParams, clawParams, stairColourParams, stairParams } from '../shared/params';

export const cageGroups: readonly ParamGroup[] = [
  { id: 'size', label: 'Size', tab: 'Dock' },
  { id: 'base', label: 'Floor', tab: 'Dock' },
  { id: 'connect', label: 'Joining docks', tab: 'Dock' },
  { id: 'galleries', label: 'Galleries', tab: 'Decks' },
  { id: 'stairs', label: 'Stair towers & crew', tab: 'Decks' },
  { id: 'claw', label: 'Hoist claw', tab: 'Decks' },
  { id: 'fit', label: 'Fit', tab: 'Output' },
  { id: 'look', label: 'Colours', tab: 'Output' },
  { id: 'printer', label: 'Printer', tab: 'Output', collapsed: true },
];

type V = Record<string, unknown>;
const joined = (v: V) => v.connector === 'dovetail';
const printedPins = (v: V) => v.pinStyle === 'printed';

export const cageParams: readonly ParamSpec[] = [
  // ------------------------------------------------------------------- size
  num('cageWidth', 'Width', {
    group: 'size', unit: 'mm', min: 140, max: 320, step: 1, default: 200,
    help: 'Side to side. About 200 mm for a 1/100 MG kit, 150 mm for 1/144 HG.',
  }),
  num('cageDepth', 'Depth', {
    group: 'size', unit: 'mm', min: 110, max: 300, step: 1, default: 170,
    help: 'Front to back, stair towers included.',
  }),
  num('cageHeight', 'Height', {
    group: 'size', unit: 'mm', min: 120, max: 320, step: 1, default: 230,
    help: 'Bottom of the base to the top of the gantry frame. Leave the kit headroom under the cross truss and its claw.',
  }),

  // ------------------------------------------------------------------- base
  num('baseHeight', 'Base height', { group: 'base', unit: 'mm', min: 8, max: 25, step: 0.5, default: 12 }),
  num('standHole', 'Stand socket', {
    group: 'base', unit: 'mm', min: 0, max: 10, step: 0.1, default: 4,
    help: 'A hole in a boss where the kit stands, for a display stand or a peg into its foot. 0 leaves it off.',
  }),
  bool('floorPattern', 'Floor pattern', {
    group: 'base', default: true,
    help: 'Deck plates with their corners cut, grilles of slots in some of them and small stencilled marking blocks, across the dock floor. Off, it has plain seams.',
  }),
  bool('apron', 'Front apron', {
    group: 'base', default: true, visibleIf: (v) => v.stairs === true,
    help: 'A raised deck across the front between the stair towers, three steps high at the crew scale: two flights of steps down its front with pipe handrails, an orange guide band, hatches, vents along its face and pipes down its sides. It pegs onto the floor.',
  }),
  bool('hazardStripes', 'Floor markings', {
    group: 'base', default: true,
    help: 'A hazard band across the front of the dock and a pad round where the kit stands, as an inlay to print in a second colour.',
  }),

  // ---------------------------------------------------------------- connect
  choice('connector', 'Joints', {
    group: 'connect', default: 'dovetail',
    options: [
      { value: 'dovetail', label: 'Dovetail keys, side to side' },
      { value: 'none', label: 'None' },
    ],
    help: 'Keys on the right edge of the base and sockets on its left, so docks press together into a row from above.',
  }),
  num('jointClearance', 'Joint clearance', { group: 'connect', unit: 'mm', min: 0, max: 0.6, step: 0.05, default: 0.2, visibleIf: joined }),

  // -------------------------------------------------------------- galleries
  num('galleryWidth', 'Gallery width', {
    group: 'galleries', unit: 'mm', min: 10, max: 50, step: 1, default: 22,
    help: 'How far each gallery reaches in from its columns toward the kit.',
  }),
  int('galleryLevels', 'Levels without stairs', {
    group: 'galleries', min: 1, max: 5, default: 3, visibleIf: (v) => v.stairs !== true,
    help: 'With the stair towers on, there is a gallery at every landing they reach on the outside, so the crew can walk off the stairs onto it.',
  }),
  bool('cabin', 'Operator cabin', {
    group: 'galleries', default: true,
    help: 'A cabin with glass round its front on the top right gallery, pegged into the deck.',
  }),
  bool('backFrame', 'Back frame', {
    group: 'galleries', default: true,
    help: 'A lattice behind the kit between the galleries, standing in the base and pegged into the top frame.',
  }),

  // ----------------------------------------------------------------- stairs
  ...stairParams(
    'stairs',
    { span: 50, height: 130, scale: '100' },
    'A stair tower at each front corner: a steel frame with a railed landing at every turn and open stairs switching back in two lanes, so there is a full storey of headroom over every flight. Every other landing opens straight onto a gallery behind it.',
  ),

  // ------------------------------------------------------------------- claw
  ...clawParams('claw', 20, 'A three-talon claw on a chain from a hoist trolley on the cross truss over the kit. The trolley slides from side to side along the truss, held on by a pin under it, and each talon swings on its own pin, so the claw opens and closes round a part.'),

  // -------------------------------------------------------------------- fit
  num('clearance', 'Pin clearance', {
    group: 'fit', unit: 'mm', min: 0.1, max: 0.6, step: 0.05, default: 0.3,
    help: 'Gap round the claw\'s pins.',
  }),
  choice('pinStyle', 'Claw pins', {
    group: 'fit', default: 'printed',
    options: [
      { value: 'printed', label: 'Printed pins' },
      { value: 'filament', label: '1.75 mm filament' },
    ],
  }),
  num('fit', 'Peg & slot clearance', {
    group: 'fit', unit: 'mm', min: 0, max: 0.5, step: 0.05, default: 0.15,
    help: 'Gap round the pegs and in the slots everything stands in.',
  }),

  // ------------------------------------------------------------------- look
  color('baseColor', 'Floor', { group: 'look', default: '#4a525b' }),
  color('frameColor', 'Columns & top frame', { group: 'look', default: '#8a6a4a' }),
  color('galleryColor', 'Galleries', { group: 'look', default: '#d08a35' }),
  color('backColor', 'Back frame', { group: 'look', default: '#3d444c', visibleIf: (v) => v.backFrame === true }),
  color('cabinColor', 'Cabin', { group: 'look', default: '#e8e2d0', visibleIf: (v) => v.cabin === true }),
  color('glassColor', 'Cabin glass', { group: 'look', default: '#5fb8ee', visibleIf: (v) => v.cabin === true }),
  color('apronColor', 'Apron', { group: 'look', default: '#6c747e', visibleIf: (v) => v.apron === true }),
  color('apronStripeColor', 'Apron guide band', { group: 'look', default: '#f08a1c', visibleIf: (v) => v.apron === true }),
  color('stripeColor', 'Floor markings', { group: 'look', default: '#f5c518', visibleIf: (v) => v.hazardStripes === true }),
  ...stairColourParams('look'),
  ...clawColourParams('look'),
  color('pinColor', 'Pins', { group: 'look', default: '#9aa3ad', visibleIf: printedPins }),

  // ---------------------------------------------------------------- printer
  int('bedX', 'Bed width', { group: 'printer', unit: 'mm', min: 100, max: 500, default: 256 }),
  int('bedY', 'Bed depth', { group: 'printer', unit: 'mm', min: 100, max: 500, default: 256 }),
];
