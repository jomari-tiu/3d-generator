import { bool, color, int, num, text } from '../../core/params/dsl';
import type { ParamGroup, ParamSpec } from '../../core/params/types';

export const drawerGroups: readonly ParamGroup[] = [
  { id: 'drawer', label: 'Your drawer', tab: 'Size' },
  { id: 'grid', label: 'Bins', tab: 'Size' },
  { id: 'tray', label: 'Tray', tab: 'Size' },
  { id: 'bin', label: 'Bin shape', tab: 'Bins' },
  { id: 'extras', label: 'Extras', tab: 'Bins' },
  { id: 'look', label: 'Colour', tab: 'Output' },
  { id: 'printer', label: 'Printer', tab: 'Output', collapsed: true },
];

const stacks = (v: Record<string, unknown>) => v.stackable === true;
const labelled = (v: Record<string, unknown>) => v.labelTab === true;
const scooped = (v: Record<string, unknown>) => v.scoop === true;
const trayed = (v: Record<string, unknown>) => v.tray === true;

export const drawerParams: readonly ParamSpec[] = [
  // ----------------------------------------------------------------- drawer
  num('drawerWidth', 'Inside width', {
    group: 'drawer',
    unit: 'mm',
    min: 30,
    max: 1200,
    step: 1,
    default: 300,
    help: 'Measured inside the drawer, side to side.',
  }),
  num('drawerDepth', 'Inside depth', {
    group: 'drawer',
    unit: 'mm',
    min: 30,
    max: 1200,
    step: 1,
    default: 400,
    help: 'Measured inside the drawer, front to back.',
  }),
  num('drawerHeight', 'Inside height', {
    group: 'drawer',
    unit: 'mm',
    min: 15,
    max: 300,
    step: 1,
    default: 60,
    help: 'From the drawer floor to the underside of whatever is above it when the drawer closes.',
  }),
  num('fitGap', 'Fit gap', {
    group: 'drawer',
    unit: 'mm',
    min: 0,
    max: 10,
    step: 0.5,
    default: 2,
    help: 'Taken off the width and the depth in total, so the bins drop in without a fight. Drawers are rarely square.',
  }),
  num('headroom', 'Headroom', {
    group: 'drawer',
    unit: 'mm',
    min: 0,
    max: 50,
    step: 0.5,
    default: 5,
    help: 'Left between the top of the bins and the top of the drawer, so the drawer still shuts over what you put in them.',
  }),

  // ------------------------------------------------------------------- grid
  int('columns', 'Columns (across)', { group: 'grid', min: 1, max: 20, default: 3 }),
  int('rows', 'Rows (front to back)', { group: 'grid', min: 1, max: 20, default: 4 }),
  text('layout', 'Bin layout', {
    group: 'grid',
    default: '2,1',
    multiline: true,
    maxLength: 400,
    placeholder: 'One line per row, front row first',
    help: 'One line per row, front row first. Each number is how many columns wide that bin is: "2,1" is a double bin then a single. Write "2x2" for a bin two columns wide and two rows deep. Anything you leave out is filled with single bins.',
    debounceMs: 300,
  }),
  num('binGap', 'Gap between bins', {
    group: 'grid',
    unit: 'mm',
    min: 0,
    max: 5,
    step: 0.1,
    default: 0.5,
    help: 'So neighbours lift out without dragging each other along.',
  }),

  // ------------------------------------------------------------------- tray
  bool('tray', 'Tray under the bins', {
    group: 'tray',
    default: true,
    help: 'A base that fills the drawer, with a pocket where each bin goes, so the bins stay put. Bigger than your bed, it is printed in pieces that lock together.',
  }),
  num('trayBase', 'Tray base', {
    group: 'tray',
    unit: 'mm',
    min: 1,
    max: 5,
    step: 0.1,
    default: 2,
    visibleIf: trayed,
    help: 'Thickness of the floor under the pockets. It comes off the height of the bins.',
  }),
  num('trayWall', 'Pocket depth', {
    group: 'tray',
    unit: 'mm',
    min: 1,
    max: 15,
    step: 0.5,
    default: 4,
    visibleIf: trayed,
    help: 'How high the walls around each pocket stand. With the stacking lip on, kept no taller than the lip.',
  }),
  num('jointClearance', 'Joint clearance', {
    group: 'tray',
    unit: 'mm',
    min: 0,
    max: 0.6,
    step: 0.05,
    default: 0.2,
    visibleIf: trayed,
    help: 'Gap around the jigsaw knobs that join the tray pieces. Raise it if they will not press together.',
  }),

  // -------------------------------------------------------------------- bin
  num('wall', 'Wall thickness', {
    group: 'bin',
    unit: 'mm',
    min: 0.8,
    max: 4,
    step: 0.1,
    default: 1.6,
    help: 'Four lines of a 0.4 mm nozzle by default.',
  }),
  num('floor', 'Floor thickness', {
    group: 'bin',
    unit: 'mm',
    min: 0.6,
    max: 4,
    step: 0.1,
    default: 1.2,
  }),
  num('corner', 'Corner radius', {
    group: 'bin',
    unit: 'mm',
    min: 0,
    max: 20,
    step: 0.5,
    default: 4,
    help: 'Outside corners. Rounder corners are easier to wipe out, and leave a little more space between bins.',
  }),

  // ----------------------------------------------------------------- extras
  bool('stackable', 'Stacking lip', {
    group: 'extras',
    default: true,
    help: 'The bottom of each bin steps in so it sits inside the top of another bin. Out of the drawer they stack.',
  }),
  num('lipHeight', 'Lip height', {
    group: 'extras',
    unit: 'mm',
    min: 1.5,
    max: 8,
    step: 0.5,
    default: 3,
    visibleIf: stacks,
    help: 'How far a bin drops into the one below it.',
  }),
  bool('labelTab', 'Label tab', {
    group: 'extras',
    default: true,
    help: 'A ledge along the back wall to write on or stick a label to. Its underside is sloped, so it prints without support.',
  }),
  num('labelDepth', 'Label tab depth', {
    group: 'extras',
    unit: 'mm',
    min: 5,
    max: 25,
    step: 0.5,
    default: 10,
    visibleIf: labelled,
  }),
  bool('scoop', 'Finger scoop', {
    group: 'extras',
    default: true,
    help: 'Curves the floor up into the front wall, so small things slide out on a fingertip instead of hiding in the corner.',
  }),
  num('scoopRadius', 'Scoop radius', {
    group: 'extras',
    unit: 'mm',
    min: 5,
    max: 40,
    step: 0.5,
    default: 15,
    visibleIf: scooped,
    help: 'Trimmed automatically on short or shallow bins.',
  }),

  // ------------------------------------------------------------------- look
  color('binColor', 'Bins', { group: 'look', default: '#7aa6c2' }),
  color('trayColor', 'Tray', { group: 'look', default: '#4f7d99', visibleIf: trayed }),

  // ---------------------------------------------------------------- printer
  num('bedX', 'Bed width', {
    group: 'printer',
    unit: 'mm',
    min: 100,
    max: 500,
    step: 1,
    default: 256,
  }),
  num('bedY', 'Bed depth', {
    group: 'printer',
    unit: 'mm',
    min: 100,
    max: 500,
    step: 1,
    default: 256,
  }),
];
