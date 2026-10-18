import { bool, choice, color, font, num, text } from '../../core/params/dsl';
import type { ParamGroup, ParamSpec } from '../../core/params/types';

export const keychainGroups: readonly ParamGroup[] = [
  { id: 'style', label: 'Style', tab: 'Design' },
  { id: 'text', label: 'Word', tab: 'Design' },
  { id: 'initial', label: 'Big letter', tab: 'Design' },
  { id: 'small', label: 'Small text', tab: 'Design' },
  { id: 'body', label: 'Body', tab: 'Shape' },
  { id: 'join', label: 'Joining the letters', tab: 'Shape' },
  { id: 'stagger', label: 'Alternate heights', tab: 'Shape' },
  { id: 'tag', label: 'Tag', tab: 'Shape' },
  { id: 'ring', label: 'Keyring', tab: 'Shape' },
  { id: 'look', label: 'Colours', tab: 'Output' },
  { id: 'printer', label: 'Printer', tab: 'Output', collapsed: true },
];

/** The letters are the object, so they have to be welded to each other. */
const isSolid = (v: Record<string, unknown>) => v.style === 'solid';
/** A backing holds the letters together, so no welding is involved. */
const isBacked = (v: Record<string, unknown>) => v.style === 'outline' || v.style === 'double';
/** A big initial letter with the name raised across it. */
const isInitial = (v: Record<string, unknown>) => v.style === 'initial';
const isDouble = (v: Record<string, unknown>) => v.style === 'double';
/** More than one line of text. */
const hasLines = (v: Record<string, unknown>) => /\S[^\n]*\n[^\n]*\S/.test(String(v.text ?? ''));
/** The word is cut into a plain tag rather than being the keychain's shape. */
const isTag = (v: Record<string, unknown>) => v.style === 'tag';
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
      { value: 'outline', label: 'Backed - letters on a plate that follows the word' },
      { value: 'solid', label: 'Cut-out - the letters themselves are the keychain' },
      { value: 'double', label: 'Layered - letters, a halo, then a border' },
      { value: 'tag', label: 'Tag - letters cut into a rounded tag' },
      { value: 'initial', label: 'Initial - a name across a big initial letter' },
    ],
    help: 'Backed and Layered print as one object in two or three colours. Cut-out is a single colour and needs the letters welded to each other. Tag is a plain rounded tag with the letters cut through it, or engraved into it. Initial is a big serif letter with the name standing up across its face, in two colours.',
  }),

  // ------------------------------------------------------------------- word
  text('text', 'Word', {
    group: 'text',
    default: 'PEACE',
    maxLength: 48,
    multiline: true,
    placeholder: 'A name or a word',
    help: 'A name, a word, a nickname. Press Enter for another line - lines stack under each other, centred.',
    debounceMs: 250,
  }),
  font('font', 'Font', { group: 'text', default: 'nunito-extrabold', visibleIf: (v) => !isInitial(v), debounceMs: 250 }),
  num('fontSize', 'Letter height', {
    group: 'text',
    unit: 'mm',
    min: 6,
    max: 40,
    step: 0.5,
    default: 15,
    visibleIf: (v) => !isInitial(v),
    help: 'Cap height - the height of a capital letter. Everything else is sized off it.',
  }),
  choice('direction', 'Display', {
    group: 'text',
    default: 'horizontal',
    options: [
      { value: 'horizontal', label: 'Horizontal - the word reads across' },
      { value: 'vertical', label: 'Vertical - one letter per row, reading down' },
    ],
    visibleIf: (v) => !isInitial(v),
    help: 'Vertical hangs off a bag or a zip and reads downward.',
  }),
  num('widthScale', 'Letter width', {
    group: 'text',
    unit: '%',
    min: 40,
    max: 160,
    step: 1,
    default: 100,
    help: 'Stretches every letter sideways. Opens a condensed face up into wide, round letters.',
  }),
  num('weight', 'Letter weight', {
    group: 'text',
    unit: 'mm',
    min: -1.5,
    max: 1.5,
    step: 0.1,
    default: 0,
    help: 'Grows every letter outward with rounded corners, or thins it below zero. Up turns a slim display face fat and soft; down opens the slits in a very fat one. Changes the letter spacing by twice as much.',
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
  num('lineSpacing', 'Line gap', {
    group: 'text',
    unit: 'mm',
    min: -4,
    max: 10,
    step: 0.2,
    default: 1,
    visibleIf: (v) => v.direction !== 'vertical' && hasLines(v),
    help: 'Clear space between lines of text. Below zero the lines tuck into each other.',
  }),
  bool('fitLines', 'Fit every line to the same width', {
    group: 'text',
    default: true,
    visibleIf: (v) => v.direction !== 'vertical' && hasLines(v),
    help: 'Long lines are shrunk to the width of the shortest, so the block comes out square-edged; the letter height is the size of the shortest line.',
  }),

  // ---------------------------------------------------------------- initial
  text('initial', 'Big letter', {
    group: 'initial',
    default: '',
    maxLength: 1,
    placeholder: 'First letter of the word',
    visibleIf: isInitial,
    help: "Any letter, number or symbol. Left empty, it is the word's own first letter, as a capital.",
    debounceMs: 250,
  }),
  font('initialFont', 'Font', { group: 'initial', default: 'ultra', visibleIf: isInitial, debounceMs: 250 }),
  num('initialSize', 'Height', {
    group: 'initial', unit: 'mm', min: 25, max: 100, step: 1, default: 50,
    visibleIf: isInitial,
    help: 'Cap height of the big letter.',
  }),

  // ------------------------------------------------------------- small text
  font('smallFont', 'Font', { group: 'small', default: 'pacifico', visibleIf: isInitial, debounceMs: 250 }),
  num('smallSize', 'Height', {
    group: 'small', unit: 'mm', min: 6, max: 40, step: 0.5, default: 15,
    visibleIf: isInitial,
    help: 'Cap height of the word across the big letter.',
  }),
  choice('namePlace', 'Position', {
    group: 'small',
    default: 'middle',
    options: [
      { value: 'top', label: 'Top - along the top of the big letter' },
      { value: 'middle', label: 'Middle - across the big letter' },
      { value: 'bottom', label: 'Bottom - along the foot of the big letter' },
    ],
    visibleIf: isInitial,
  }),
  num('nameX', 'Nudge across', {
    group: 'small', unit: 'mm', min: -40, max: 40, step: 0.5, default: 0,
    visibleIf: isInitial,
    help: 'Slides the word sideways from where the position puts it.',
  }),
  num('nameY', 'Nudge up', {
    group: 'small', unit: 'mm', min: -40, max: 40, step: 0.5, default: 0,
    visibleIf: isInitial,
    help: 'Slides the word up or down from where the position puts it.',
  }),
  num('nameAngle', 'Tilt', {
    group: 'small', unit: 'deg', min: -30, max: 30, step: 1, default: 0,
    visibleIf: isInitial,
    help: 'Turns the word about its middle; above zero it rises to the right.',
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
    visibleIf: (v) => isBacked(v) || isInitial(v),
    help: 'Height of the lettering above the backing, or of the name above the initial. Also the layer a filament swap belongs at.',
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
    help: 'A cut-out keychain is only as strong as where its letters meet. The bar always works; overlapping looks better.',
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

  // ---------------------------------------------------------------- stagger
  bool('stagger', 'Alternate heights', {
    group: 'stagger',
    default: false,
    visibleIf: isSolid,
    help: 'Every other letter stands tall - the first, third, fifth - and the ones between sit low, tucked under their neighbours. Tighten the letter spacing so they overlap.',
  }),
  num('lowHeight', 'Low letter height', {
    group: 'stagger', unit: 'mm', min: 1, max: 8, step: 0.2, default: 3,
    visibleIf: (v) => isSolid(v) && v.stagger === true,
    help: 'Height of the low letters. The tall ones rise to the full thickness; the keyring eye stops at this height.',
  }),

  // -------------------------------------------------------------------- tag
  choice('tagCut', 'Letters', {
    group: 'tag',
    default: 'through',
    options: [
      { value: 'through', label: 'Cut right through, stencil style' },
      { value: 'engrave', label: 'Engraved into the face' },
    ],
    visibleIf: isTag,
    help: 'Cut through, the middle of an A, B, D, O, P, Q or R would fall out, so each is held in by a thin bridge across the letter, the way a stencil is.',
  }),
  num('engraveDepth', 'Engrave depth', {
    group: 'tag', unit: 'mm', min: 0.4, max: 3, step: 0.1, default: 1.2,
    visibleIf: (v) => isTag(v) && v.tagCut === 'engrave',
    help: 'How deep the letters are sunk into the face. Leave at least 1 mm of tag under them.',
  }),
  num('bridgeWidth', 'Stencil bridge', {
    group: 'tag', unit: 'mm', min: 0.8, max: 3, step: 0.1, default: 1.4,
    visibleIf: (v) => isTag(v) && v.tagCut !== 'engrave',
    help: 'Width of the bridges that hold in the middles of letters like A, O and R.',
  }),
  num('tagMargin', 'Margin round the letters', {
    group: 'tag', unit: 'mm', min: 2, max: 15, step: 0.5, default: 5,
    visibleIf: isTag,
    help: 'Plain tag left on every side of the lettering.',
  }),
  num('tagLength', 'Tag length', {
    group: 'tag', unit: 'mm', min: 0, max: 200, step: 1, default: 0,
    visibleIf: isTag,
    help: 'Make the tag longer than the lettering needs; the letters stay centred and the hole stays at its end. 0 fits it to the lettering.',
  }),
  num('tagCorner', 'Corner radius', {
    group: 'tag', unit: 'mm', min: 0, max: 15, step: 0.5, default: 4,
    visibleIf: isTag,
  }),

  // ------------------------------------------------------------------- ring
  choice('ring', 'Keyring eye', {
    group: 'ring',
    default: 'start',
    options: [
      { value: 'start', label: 'Before the first letter' },
      { value: 'end', label: 'After the last letter' },
      { value: 'top', label: 'On top, centred' },
      { value: 'corner', label: 'Top-left corner' },
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
    visibleIf: (v) => v.ring !== 'none' && !isTag(v),
  }),

  // ---------------------------------------------------------------- colours
  color('letterColor', 'Letters', { group: 'look', default: '#f7f9fb', visibleIf: (v) => !isTag(v) }),
  color('initialColor', 'Big letter', { group: 'look', default: '#d8322b', visibleIf: isInitial }),
  color('rimColor', 'Halo', { group: 'look', default: '#ffd166', visibleIf: isDouble }),
  color('plateColor', 'Backing', {
    group: 'look',
    default: '#e14b3f',
    visibleIf: (v) => isBacked(v) || isTag(v),
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
