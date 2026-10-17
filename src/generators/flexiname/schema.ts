import { choice, color, font, int, num, text } from '../../core/params/dsl';
import type { ParamGroup, ParamSpec } from '../../core/params/types';

export const flexiGroups: readonly ParamGroup[] = [
  { id: 'text', label: 'Word', tab: 'Design' },
  { id: 'pose', label: 'Show it', tab: 'Design' },
  { id: 'body', label: 'Letters', tab: 'Shape' },
  { id: 'hinge', label: 'Hinges', tab: 'Shape' },
  { id: 'ring', label: 'Keyring', tab: 'Shape' },
  { id: 'look', label: 'Colours', tab: 'Output' },
  { id: 'printer', label: 'Printer', tab: 'Output', collapsed: true },
];


export const flexiParams: readonly ParamSpec[] = [
  // ------------------------------------------------------------------- word
  text('text', 'Word', {
    group: 'text',
    default: 'ETHAN',
    maxLength: 16,
    placeholder: 'A name or a word',
    help: 'Every letter is its own block, hinged to the next. Spaces are dropped - a hinge cannot span one.',
    debounceMs: 250,
  }),
  font('font', 'Font', { group: 'text', default: 'archivo-black', debounceMs: 250 }),
  num('fontSize', 'Letter height', {
    group: 'text',
    unit: 'mm',
    min: 10,
    max: 30,
    step: 0.5,
    default: 16,
    help: 'Cap height. Under about 10 mm there is no room in a letter for a joint.',
  }),

  // ------------------------------------------------------------------- pose
  choice('pose', 'Pose', {
    group: 'pose',
    default: 'curve',
    options: [
      { value: 'curve', label: 'Curled round, lying on the table' },
      { value: 'arch', label: 'Rolled up at the ends' },
      { value: 'hang', label: 'Hanging from the keyring' },
      { value: 'flat', label: 'Flat and straight, as it prints' },
    ],
    help: 'Only how it is shown here. It always prints flat and straight, joints and all, in one go.',
  }),
  num('bend', 'Side to side', {
    group: 'pose',
    unit: 'deg',
    min: 0,
    max: 20,
    step: 1,
    default: 8,
    visibleIf: (v) => v.pose === 'curve' || v.pose === 'hang',
    help: 'How far each hinge is rocked sideways in the picture. The hinges only have a little play this way; it stops where they run out.',
  }),
  num('tilt', 'Up and down', {
    group: 'pose',
    unit: 'deg',
    min: 0,
    max: 60,
    step: 1,
    default: 25,
    visibleIf: (v) => v.pose === 'arch' || v.pose === 'hang',
    help: 'How far each hinge is rolled in the picture. It stops where the letters would hit each other.',
  }),

  // ------------------------------------------------------------------- body
  num('thickness', 'Depth', {
    group: 'body',
    unit: 'mm',
    min: 8,
    max: 14,
    step: 0.5,
    default: 10,
    help: 'Front to back of each letter, which is the height it prints to. The hinges live in the back colour, so it needs at least 4 mm of it.',
  }),
  num('faceDepth', 'Face colour depth', {
    group: 'body',
    unit: 'mm',
    min: 1,
    max: 6,
    step: 0.2,
    default: 3.5,
    help: 'The front of every letter in the face colour. A filament change at this layer gives the two-tone look; the hinges all sit below it.',
  }),
  num('gap', 'Gap between letters', {
    group: 'body',
    unit: 'mm',
    min: 0.5,
    max: 4,
    step: 0.1,
    default: 0.8,
    help: 'Clear space between neighbouring letters. Wider lets each joint move further before the letters meet; pairs that would barely move are eased apart on their own.',
  }),

  // ------------------------------------------------------------------ hinge
  num('clearance', 'Pin clearance', {
    group: 'hinge',
    unit: 'mm',
    min: 0.2,
    max: 0.6,
    step: 0.05,
    default: 0.35,
    help: 'Gap round each pin and round each knuckle in its cradle. Too small and the hinges print fused; work them free before raising it.',
  }),
  num('axialGap', 'Knuckle gap', {
    group: 'hinge',
    unit: 'mm',
    min: 0.3,
    max: 1,
    step: 0.05,
    default: 0.5,
    help: 'Space between the knuckles along each pin. It is raised on its own where the knuckles need more to rock side to side.',
  }),

  // ------------------------------------------------------------------- ring
  choice('ring', 'Keyring eye', {
    group: 'ring',
    default: 'start',
    options: [
      { value: 'start', label: 'On the first letter' },
      { value: 'end', label: 'On the last letter' },
      { value: 'none', label: 'None' },
    ],
  }),
  num('ringHole', 'Hole', {
    group: 'ring',
    unit: 'mm',
    min: 2.5,
    max: 8,
    step: 0.5,
    default: 4,
    visibleIf: (v) => v.ring !== 'none',
  }),
  num('ringWall', 'Ring wall', {
    group: 'ring',
    unit: 'mm',
    min: 1.2,
    max: 5,
    step: 0.2,
    default: 2,
    visibleIf: (v) => v.ring !== 'none',
  }),

  // ---------------------------------------------------------------- colours
  color('faceColor', 'Face', { group: 'look', default: '#d8c08f' }),
  color('backColor', 'Back', {
    group: 'look',
    default: '#6b4a32',
    help: 'Prints first, from the bed up to the face colour, with every hinge inside it.',
  }),

  // ---------------------------------------------------------------- printer
  int('bedX', 'Bed width', { group: 'printer', unit: 'mm', min: 100, max: 500, default: 256 }),
  int('bedY', 'Bed depth', { group: 'printer', unit: 'mm', min: 100, max: 500, default: 256 }),
];
