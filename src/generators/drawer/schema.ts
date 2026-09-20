import { bool, choice, color, int, num } from '../../core/params/dsl';
import type { ParamGroup, ParamSpec, Params } from '../../core/params/types';

export const drawerGroups: readonly ParamGroup[] = [
  { id: 'size', label: 'Size', tab: 'Box' },
  { id: 'mount', label: 'Mounting', tab: 'Box' },
  { id: 'tray', label: 'Tray & front', tab: 'Tray' },
  { id: 'inside', label: 'Compartments', tab: 'Tray' },
  { id: 'latch', label: 'Push latch', tab: 'Latch' },
  { id: 'eject', label: 'Ejector', tab: 'Latch' },
  { id: 'look', label: 'Colours', tab: 'Output' },
  { id: 'fit', label: 'Fit & slides', tab: 'Output', collapsed: true },
  { id: 'printer', label: 'Printer', tab: 'Output', collapsed: true },
];

const hasLatch = (v: Params) => v.latch === true;
const hasWire = (v: Params) => v.latch === true && v.follower === 'wire';
const hasBeam = (v: Params) => v.latch === true && v.follower === 'printed';

export const drawerParams: readonly ParamSpec[] = [
  // ------------------------------------------------------------------- size
  int('drawers', 'Drawers', {
    group: 'size',
    min: 1,
    max: 2,
    default: 2,
    help: 'Two stacks a second drawer under the first. They are the same tray twice, and each gets its own latch.',
  }),
  num('width', 'Width', {
    group: 'size',
    unit: 'mm',
    min: 60,
    max: 400,
    step: 1,
    default: 120,
    help: 'Outside of the carcass, across the desk.',
  }),
  num('depth', 'Depth', {
    group: 'size',
    unit: 'mm',
    min: 80,
    max: 400,
    step: 1,
    default: 170,
    help: 'Front to back. The tray gets all of it — the latch sits in a bay UNDER the tray now, not behind it.',
  }),
  num('height', 'Drawer height', {
    group: 'size',
    unit: 'mm',
    min: 25,
    max: 160,
    step: 1,
    default: 45,
    help: 'The opening ONE drawer gets, latch bay included. The bay takes about five millimetres off the bottom of it; the readout says what is left. Two drawers hang twice this far below the desk.',
  }),
  num('wall', 'Carcass wall', { group: 'size', unit: 'mm', min: 1.6, max: 6, step: 0.2, default: 2.4 }),
  num('topPlate', 'Top plate', {
    group: 'size',
    unit: 'mm',
    min: 1.6,
    max: 8,
    step: 0.2,
    default: 3,
    help: 'What the whole drawer hangs from. Thin it at your peril.',
  }),

  // ---------------------------------------------------------------- mounting
  choice('mount', 'Fix to the desk with', {
    group: 'mount',
    default: 'screws',
    options: [
      { value: 'screws', label: 'Screws — four counterbored holes' },
      { value: 'tape', label: 'Double-sided tape — recessed pads' },
    ],
  }),
  num('screwDiameter', 'Screw diameter', {
    group: 'mount',
    unit: 'mm',
    min: 2,
    max: 8,
    step: 0.5,
    default: 4,
    visibleIf: (v) => v.mount === 'screws',
    help: 'Clearance hole. Use screws short enough not to come through the desktop.',
  }),
  num('screwInset', 'Screw inset', {
    group: 'mount',
    unit: 'mm',
    min: 6,
    max: 40,
    step: 1,
    default: 12,
    visibleIf: (v) => v.mount === 'screws',
  }),

  // ------------------------------------------------------------ tray & front
  num('trayWall', 'Tray wall', { group: 'tray', unit: 'mm', min: 1.2, max: 5, step: 0.2, default: 2 }),
  num('trayFloor', 'Tray floor', { group: 'tray', unit: 'mm', min: 1, max: 5, step: 0.2, default: 2 }),
  num('travel', 'Opening travel', {
    group: 'tray',
    unit: 'mm',
    min: 20,
    max: 350,
    step: 1,
    default: 110,
    help: 'How far it pulls out before the stop catches the tongue. Push it past the stop to take the tray out altogether.',
  }),
  choice('frontStyle', 'Front', {
    group: 'tray',
    default: 'scoop',
    options: [
      { value: 'scoop', label: 'Scoop — a finger hollow along the top edge' },
      { value: 'bar', label: 'Bar — a round pull standing proud' },
      { value: 'flush', label: 'Flush — nothing to catch on' },
    ],
  }),
  num('frontThickness', 'Front thickness', { group: 'tray', unit: 'mm', min: 1.6, max: 8, step: 0.2, default: 3 }),
  num('frontOverhang', 'Front overhang', {
    group: 'tray',
    unit: 'mm',
    min: 0,
    max: 20,
    step: 0.5,
    default: 3,
    help: 'How far the face stands past the tray on each side, to cover the gap round the opening.',
  }),
  num('pullHeight', 'Scoop radius', {
    group: 'tray',
    unit: 'mm',
    min: 4,
    max: 30,
    step: 0.5,
    default: 11,
    visibleIf: (v) => v.frontStyle === 'scoop',
  }),
  num('pullDepth', 'Pull size', {
    group: 'tray',
    unit: 'mm',
    min: 3,
    max: 20,
    step: 0.5,
    default: 8,
    visibleIf: (v) => v.frontStyle !== 'flush',
  }),

  // ------------------------------------------------------------ compartments
  int('dividersX', 'Dividers across', { group: 'inside', min: 0, max: 8, default: 2 }),
  int('dividersY', 'Dividers front to back', { group: 'inside', min: 0, max: 8, default: 0 }),
  num('dividerThickness', 'Divider thickness', { group: 'inside', unit: 'mm', min: 0.8, max: 4, step: 0.2, default: 1.6 }),
  num('dividerHeight', 'Divider height', {
    group: 'inside',
    unit: '%',
    min: 20,
    max: 100,
    step: 1,
    default: 80,
    help: 'Share of the tray depth. Short of the rim is easier to clean out.',
  }),

  // ------------------------------------------------------------------ latch
  bool('latch', 'Push to open, push to close', {
    group: 'latch',
    default: true,
    help: 'A heart-cam groove cut into the UNDERSIDE of the tray and a sprung follower lying in a shallow bay beneath it. Off, it is an ordinary pull-out drawer — and the bay goes with it.',
  }),
  choice('follower', 'Follower', {
    group: 'latch',
    default: 'printed',
    visibleIf: hasLatch,
    options: [
      {
        value: 'printed',
        label: 'Printed leaf spring — a third part, nothing to buy',
      },
      {
        value: 'wire',
        label: 'Bent paperclip — shallower, but you have to bend it',
      },
    ],
    help: 'What rides the cam. The printed one is a beam cut out of a flat plate: soft sideways, stiff downward. It reaches further back under the tray than a wire does, which under the tray costs nothing but a taller bay.',
  }),
  num('beamThickness', 'Beam width', {
    group: 'latch',
    unit: 'mm',
    min: 0.8,
    max: 2.5,
    step: 0.1,
    default: 1.4,
    visibleIf: hasBeam,
    help: 'At the root; it tapers to just over half that at the tip. Thicker is a firmer click and a longer beam, which now simply reaches further along under the tray to keep the strain the same.',
  }),
  num('pop', 'Pop-out', {
    group: 'latch',
    unit: 'mm',
    min: 6,
    max: 30,
    step: 0.5,
    default: 12,
    visibleIf: hasLatch,
    help: 'How far the ejector throws the tray when the latch lets go — enough to get a fingernail behind.',
  }),
  num('overtravel', 'Overtravel', {
    group: 'latch',
    unit: 'mm',
    min: 1,
    max: 8,
    step: 0.5,
    default: 2.5,
    visibleIf: hasLatch,
    help: 'The extra press past the latched point that frees the pin. Too little and it will not release; too much and the drawer feels spongy.',
  }),
  num('wireDiameter', 'Wire diameter', {
    group: 'latch',
    unit: 'mm',
    min: 0.7,
    max: 2,
    step: 0.1,
    default: 1.1,
    visibleIf: hasWire,
    help: 'Measure the paperclip. A big one is about 1.1 mm.',
  }),
  num('camWidth', 'Cam width', {
    group: 'latch',
    unit: 'mm',
    min: 4,
    max: 30,
    step: 0.5,
    default: 10,
    visibleIf: hasLatch,
    help: 'How far the pin is thrown sideways. Wider is more positive and needs a longer, softer wire.',
  }),
  num('camStep', 'One-way step', {
    group: 'latch',
    unit: 'mm',
    min: 0.2,
    max: 1.5,
    step: 0.05,
    default: 0.4,
    visibleIf: hasLatch,
    help: 'How far the groove floor drops at each corner. This is what stops the pin going back the way it came — and it is the first thing to raise if the latch skips.',
  }),
  num('leadIn', 'Lead-in', {
    group: 'latch',
    unit: 'mm',
    min: 3,
    max: 25,
    step: 0.5,
    default: 8,
    visibleIf: hasLatch,
    help: 'Straight run that funnels the pin back into the cam when you push the tray in from fully open.',
  }),

  // --------------------------------------------------------------- ejector
  choice('ejector', 'Ejector', {
    group: 'eject',
    default: 'spring',
    visibleIf: hasLatch,
    options: [
      { value: 'spring', label: 'Printed spring — nothing to buy' },
      { value: 'band', label: 'Elastic band — two posts, lasts less long but never sulks' },
    ],
  }),
  num('springPreload', 'Spring preload', {
    group: 'eject',
    unit: 'mm',
    min: 1,
    max: 15,
    step: 0.5,
    default: 5,
    visibleIf: (v) => v.latch === true && v.ejector === 'spring',
    help: 'How much the spring is still compressed when the tray is fully out. Without some, the last millimetre of the throw has no push behind it.',
  }),
  num('springWidth', 'Spring width', {
    group: 'eject',
    unit: 'mm',
    min: 6,
    max: 40,
    step: 1,
    default: 18,
    visibleIf: (v) => v.latch === true && v.ejector === 'spring',
  }),
  num('springThickness', 'Spring ribbon', {
    group: 'eject',
    unit: 'mm',
    min: 0.6,
    max: 3,
    step: 0.1,
    default: 1.4,
    visibleIf: (v) => v.latch === true && v.ejector === 'spring',
    help: 'The one number to change if the throw is weak or the spring will not compress. Under the tray the spring is shorter than it used to be, so this is the control that buys the throw back. PETG, not PLA.',
  }),
  int('springTurns', 'Spring folds', {
    group: 'eject',
    min: 2,
    max: 10,
    default: 4,
    visibleIf: (v) => v.latch === true && v.ejector === 'spring',
  }),

  // --------------------------------------------------------------- colours
  color('carcassColor', 'Carcass', { group: 'look', default: '#3b4149' }),
  color('trayColor', 'Tray', { group: 'look', default: '#d9d3c7' }),
  color('partColor', 'Latch parts', { group: 'look', default: '#c2683f' }),

  // ---------------------------------------------------------- fit & slides
  num('clearance', 'Running clearance', {
    group: 'fit',
    unit: 'mm',
    min: 0.1,
    max: 0.8,
    step: 0.05,
    default: 0.3,
    help: 'Between every pair of surfaces that slide on each other. Raise it if the tray binds, lower it if it rattles — this one number sets the whole fit.',
  }),
  num('slideHeight', 'Tongue height', { group: 'fit', unit: 'mm', min: 2, max: 12, step: 0.5, default: 4 }),
  num('slideDepth', 'Tongue depth', { group: 'fit', unit: 'mm', min: 1.5, max: 8, step: 0.5, default: 2.5 }),

  // --------------------------------------------------------------- printer
  num('nozzle', 'Nozzle diameter', { group: 'printer', unit: 'mm', min: 0.2, max: 1, step: 0.05, default: 0.4 }),
  num('layer', 'Layer height', { group: 'printer', unit: 'mm', min: 0.08, max: 0.32, step: 0.02, default: 0.2 }),
  num('bedX', 'Bed width', { group: 'printer', unit: 'mm', min: 100, max: 500, step: 1, default: 256, advanced: true }),
  num('bedY', 'Bed depth', { group: 'printer', unit: 'mm', min: 100, max: 500, step: 1, default: 256, advanced: true }),
];
