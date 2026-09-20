import { choice, color, font, num, text } from '../../core/params/dsl';
import type { ParamGroup, ParamSpec } from '../../core/params/types';

export const keychainGroups: readonly ParamGroup[] = [
  { id: 'style', label: 'Style', tab: 'Design' },
  { id: 'text', label: 'Word', tab: 'Design' },
  { id: 'body', label: 'Body', tab: 'Shape' },
  { id: 'join', label: 'Joining the letters', tab: 'Shape' },
  { id: 'ring', label: 'Keyring', tab: 'Shape' },
  { id: 'look', label: 'Colours', tab: 'Output' },
  { id: 'printer', label: 'Printer', tab: 'Output', collapsed: true },
];

/** The letters are the object, so they have to be welded to each other. */
const isSolid = (v: Record<string, unknown>) => v.style === 'solid';
/** A backing holds the letters together, so no welding is involved. */
const isBacked = (v: Record<string, unknown>) => v.style !== 'solid';
const isDouble = (v: Record<string, unknown>) => v.style === 'double';
/**
 * Tightening decides the spacing itself -- it pulls every letter up to real
 * contact -- so while it is on, the spacing sliders would be controls that do
 * nothing. The overlap is the spacing control in that mode.
 */
const spacingIsFree = (v: Record<string, unknown>) => !(v.style === 'solid' && v.join === 'weld');

export const keychainParams: readonly ParamSpec[] = [
  // ------------------------------------------------------------------ style
  choice('style', 'Style', {
    group: 'style',
    default: 'outline',
    options: [
      { value: 'outline', label: 'Outlined - letters on a backing that follows the word' },
      { value: 'solid', label: 'Solid - the letters themselves are the keychain' },
      { value: 'double', label: 'Double outline - letters, a halo, then a border' },
    ],
    help: 'Outlined and double print as one object in two or three colours. Solid is a single colour and needs the letters welded to each other.',
  }),

  // ------------------------------------------------------------------- word
  text('text', 'Word', {
    group: 'text',
    default: 'PEACE',
    maxLength: 24,
    placeholder: 'A name or a word',
    help: 'A name, a word, a nickname. Long words make long keychains.',
    debounceMs: 250,
  }),
  font('font', 'Font', { group: 'text', default: 'nunito-extrabold', debounceMs: 250 }),
  num('fontSize', 'Letter height', {
    group: 'text',
    unit: 'mm',
    min: 6,
    max: 40,
    step: 0.5,
    default: 15,
    help: 'Cap height - the height of a capital letter. Everything else is sized off it.',
  }),
  choice('direction', 'Display', {
    group: 'text',
    default: 'horizontal',
    options: [
      { value: 'horizontal', label: 'Horizontal - the word reads across' },
      { value: 'vertical', label: 'Vertical - one letter per row, reading down' },
    ],
    help: 'Vertical hangs off a bag or a zip and reads downward.',
  }),
  num('letterSpacing', 'Letter spacing', {
    group: 'text',
    unit: 'mm',
    min: -3,
    max: 6,
    step: 0.1,
    default: 0,
    visibleIf: (v) => v.direction !== 'vertical' && spacingIsFree(v),
  }),
  num('lineGap', 'Row gap', {
    group: 'text',
    unit: 'mm',
    min: -4,
    max: 10,
    step: 0.5,
    default: 1,
    visibleIf: (v) => v.direction === 'vertical' && spacingIsFree(v),
    help: 'Clear space between rows.',
  }),

  // ------------------------------------------------------------------- body
  num('thickness', 'Thickness', {
    group: 'body',
    unit: 'mm',
    min: 1.6,
    max: 8,
    step: 0.2,
    default: 3,
    help: 'A keychain lives in a pocket. Under about 2.5 mm they snap.',
  }),
  num('outlineWidth', 'Outline width', {
    group: 'body',
    unit: 'mm',
    min: 1,
    max: 8,
    step: 0.1,
    default: 2.4,
    visibleIf: isBacked,
    help: 'How far the backing stands out past the letters. This is also what bridges the gaps between them.',
  }),
  num('outlineWidth2', 'Second outline', {
    group: 'body',
    unit: 'mm',
    min: 0.8,
    max: 6,
    step: 0.1,
    default: 1.8,
    visibleIf: isDouble,
  }),
  num('letterHeight', 'Letters stand up', {
    group: 'body',
    unit: 'mm',
    min: 0.4,
    max: 4,
    step: 0.2,
    default: 1.2,
    visibleIf: isBacked,
    help: 'Height of the lettering above the backing. Also the layer a filament swap belongs at.',
  }),
  num('rimHeight', 'Halo stands up', {
    group: 'body',
    unit: 'mm',
    min: 0.4,
    max: 3,
    step: 0.2,
    default: 0.8,
    visibleIf: isDouble,
  }),
  num('smooth', 'Outline smoothing', {
    group: 'body',
    unit: 'mm',
    min: 0,
    max: 4,
    step: 0.1,
    default: 1.2,
    visibleIf: isBacked,
    help: 'Rounds off the notches where the backing runs between two letters. Higher is softer and blobbier.',
  }),

  // ------------------------------------------------------------------- join
  choice('join', 'Join the letters', {
    group: 'join',
    default: 'weld',
    options: [
      { value: 'weld', label: 'Overlap them until they touch' },
      { value: 'bar', label: 'Bar along the bottom' },
      { value: 'none', label: 'Leave the spacing alone' },
    ],
    visibleIf: isSolid,
    help: 'A solid keychain is only as strong as where its letters meet. The bar always works; overlapping looks better.',
  }),
  num('overlap', 'Overlap', {
    group: 'join',
    unit: 'mm',
    min: 0.2,
    max: 4,
    step: 0.1,
    default: 0.9,
    visibleIf: (v) => v.style === 'solid' && v.join === 'weld',
    help: 'How far each letter is driven into the one before it, past first contact. This is what sets the spacing while the weld is on, which is why the spacing sliders are hidden. Stacked rows meet along a much wider band, so they get a fraction of it.',
  }),
  num('weldRadius', 'Weld fillet', {
    group: 'join',
    unit: 'mm',
    min: 0,
    max: 2.5,
    step: 0.1,
    default: 0.7,
    visibleIf: isSolid,
    help: 'Rounds the notch where two letters cross - the notch is where a keychain snaps. Too big and it fills the counters in "o" and "a".',
  }),
  num('barThickness', 'Bar thickness', {
    group: 'join',
    unit: 'mm',
    min: 1,
    max: 8,
    step: 0.2,
    default: 2.5,
    visibleIf: (v) => v.style === 'solid' && v.join === 'bar',
  }),

  // ------------------------------------------------------------------- ring
  choice('ring', 'Keyring eye', {
    group: 'ring',
    default: 'start',
    options: [
      { value: 'start', label: 'Before the first letter' },
      { value: 'end', label: 'After the last letter' },
      { value: 'none', label: 'None' },
    ],
    help: 'Vertical puts "before" at the top of the column and "after" at the bottom.',
  }),
  num('ringHole', 'Hole', {
    group: 'ring',
    unit: 'mm',
    min: 2.5,
    max: 12,
    step: 0.5,
    default: 5,
    visibleIf: (v) => v.ring !== 'none',
    help: 'A split ring wants about 5 mm; a lanyard clip more.',
  }),
  num('ringWall', 'Ring wall', {
    group: 'ring',
    unit: 'mm',
    min: 1.2,
    max: 6,
    step: 0.2,
    default: 2,
    visibleIf: (v) => v.ring !== 'none',
    help: 'Material around the hole. This is the part that takes the whole weight of the keys.',
  }),
  num('ringGap', 'Gap from the word', {
    group: 'ring',
    unit: 'mm',
    min: 0,
    max: 6,
    step: 0.2,
    default: 0.8,
    visibleIf: (v) => v.ring !== 'none',
  }),

  // ---------------------------------------------------------------- colours
  color('letterColor', 'Letters', { group: 'look', default: '#f7f9fb' }),
  color('rimColor', 'Halo', { group: 'look', default: '#ffd166', visibleIf: isDouble }),
  color('plateColor', 'Backing', {
    group: 'look',
    default: '#e14b3f',
    visibleIf: isBacked,
    help: 'The backing exports as its own object, so a filament swap gives two colours off one extruder.',
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
