import { bool, choice, color, font, int, num, text } from '../../core/params/dsl';
import type { ParamGroup, ParamSpec, Params } from '../../core/params/types';
import { STANDARD_SCALES } from './geometry';
import { STYLES, traitsOf, type Style } from './styles';

/** What each standard scale is for, in the dropdown. */
const SCALE_NOTE: Readonly<Record<number, string>> = {
  48: 'O gauge, quarter-inch architectural',
  72: 'wargaming and aircraft',
  87: 'HO model railway',
  100: 'architectural metric (1 m = 10 mm)',
  144: 'building miniature (1 ft = 2.12 mm)',
  160: 'N model railway',
  200: 'architectural, for tall buildings',
};

/**
 * Four tabs, because eleven groups in one scroll is a scroll and not a form.
 *
 * Split by the question being asked rather than by how often a control is
 * touched: Shape is how big the building is, Plan is what is inside it, Facade
 * is what it looks like from outside, Output is what comes off the printer.
 * Ordered the way you would actually design one -- you cannot lay out rooms
 * before you have decided the footprint.
 */
export const buildingGroups: readonly ParamGroup[] = [
  { id: 'scale', label: 'Design & storeys', tab: 'Shape' },
  { id: 'size', label: 'Footprint', tab: 'Shape' },
  { id: 'plan', label: 'Floor plan', tab: 'Plan' },
  { id: 'core', label: 'Core & stairs', tab: 'Plan' },
  { id: 'openings', label: 'Windows & doors', tab: 'Facade' },
  { id: 'facade', label: 'Facade', tab: 'Facade' },
  { id: 'roof', label: 'Roof', tab: 'Facade' },
  { id: 'output', label: 'How it prints', tab: 'Output' },
  { id: 'look', label: 'Colours', tab: 'Output' },
  { id: 'detail', label: 'Detailing', tab: 'Output', collapsed: true },
  { id: 'printer', label: 'Printer', tab: 'Output', collapsed: true },
];

const hasCore = (v: Params) => v.core === true;
const isPitched = (v: Params) => v.roof === 'gable' || v.roof === 'hip';
const isFlat = (v: Params) => v.roof === 'flat' || v.roof === 'parapet';
const hasParapet = (v: Params) => v.roof === 'parapet' || v.roof === 'penthouse';
const hasRooms = (v: Params) => v.layout !== 'open';

/**
 * Which facade controls a style actually uses.
 *
 * Read from the trait table rather than listed by hand, so a style that gains
 * balconies gains the balcony sliders in the same edit -- there is no second
 * place to remember.
 */
const trait = (v: Params) => traitsOf(String(v.style));

/** What `Windows: match the building type` comes out as, for the controls below. */
const windowKind = (v: Params) =>
  String(v.windows) === 'auto' ? trait(v).windows : String(v.windows);

export const buildingParams: readonly ParamSpec[] = [
  // ------------------------------------------------------ design & storeys
  choice('style', 'Building type', {
    group: 'scale',
    default: 'office',
    // The value is the architecture, not the paint: each of these switches a
    // different set of facade elements on. See styles.ts.
    options: (['apartment', 'office', 'ribbon', 'curtain', 'plain'] as Style[])
      .filter((id) => id in STYLES)
      .map((id) => ({
        value: id,
        label: {
          apartment: 'Apartment block — balconies, stair tower, open ground floor',
          office: 'Office slab — banded glazing and floor lines',
          ribbon: 'Commercial — ribbons round a chamfered corner, on columns',
          curtain: 'Curtain wall — glazed stripes, stone base, entrance canopy',
          plain: 'Plain — no facade articulation, for houses and sheds',
        }[id],
      })),
  }),
  choice('scale', 'Scale', {
    group: 'scale',
    default: '144',
    // The standard scales, largest model first. A choice rather than a bare
    // number because a scale is a convention you work IN -- other people's
    // figures, cars and trees have to fit next to it -- and typing 1:143 gets
    // you a model that matches nothing. Custom is still there for the rest.
    options: [
      ...STANDARD_SCALES.map((n) => ({
        value: String(n),
        label: `1:${n} — ${SCALE_NOTE[n]}`,
      })),
      { value: 'custom', label: 'Custom' },
    ],
    help: 'Everything else you type is a real-world dimension; this is the one number that turns them all into millimetres. A larger N means a smaller model.',
  }),
  num('customScale', 'Custom scale 1:N', {
    group: 'scale',
    min: 12,
    max: 1000,
    step: 1,
    default: 144,
    visibleIf: (v) => v.scale === 'custom',
    help: 'One real foot becomes 304.8/N mm. At 1:144 that is 2.12 mm; at 1:100, 3.05 mm.',
  }),
  int('floors', 'Storeys', {
    group: 'scale',
    min: 1,
    max: 24,
    default: 3,
    help: 'Habitable floors, ground included. The roof is separate.',
  }),
  num('floorHeight', 'Floor to floor', {
    group: 'scale',
    unit: '',
    min: 7,
    max: 20,
    step: 0.25,
    default: 9.5,
    help: 'FEET, slab top to slab top — the real dimension, not the model one. Real buildings run 8 to 10 ft; the clear ceiling you get is this less the slab thickness.',
  }),
  bool('tallGround', 'Taller ground floor', {
    group: 'scale',
    default: false,
    help: 'Shops and lobbies are usually taller than the floors above them.',
  }),
  num('groundHeight', 'Ground floor to floor', {
    group: 'scale',
    unit: '',
    min: 8,
    max: 30,
    step: 0.25,
    default: 13,
    visibleIf: (v) => v.tallGround === true,
    help: 'Feet.',
  }),

  // ------------------------------------------------------------- footprint
  num('width', 'Width', {
    group: 'size',
    unit: '',
    min: 12,
    max: 400,
    step: 1,
    default: 48,
    help: 'Feet, across the front.',
  }),
  num('depth', 'Depth', {
    group: 'size',
    unit: '',
    min: 12,
    max: 400,
    step: 1,
    default: 32,
    help: 'Feet, front to back.',
  }),
  num('extWall', 'Exterior wall', {
    group: 'size',
    unit: '',
    min: 4,
    max: 36,
    step: 1,
    default: 10,
    help: 'INCHES, real. Scaled down and then floored at what your nozzle can actually lay — the readout tells you if that happened.',
  }),
  num('slab', 'Floor slab', {
    group: 'size',
    unit: '',
    min: 4,
    max: 36,
    step: 1,
    default: 9,
    help: 'Inches, real. This is what a floor is made of, and it comes off the clear ceiling height.',
  }),
  num('partition', 'Internal partition', {
    group: 'size',
    unit: '',
    min: 3,
    max: 18,
    step: 0.5,
    default: 5,
    help: 'Inches, real. A 5 in stud wall is 0.88 mm at 1:144 — two extrusions, and the thinnest thing on the model.',
  }),

  // ------------------------------------------------------------ floor plan
  choice('layout', 'Plan', {
    group: 'plan',
    default: 'rooms',
    options: [
      { value: 'rooms', label: 'Rooms — subdivided floor plate' },
      { value: 'corridor', label: 'Corridor — rooms both sides of a spine' },
      { value: 'open', label: 'Open — no partitions' },
    ],
  }),
  int('rooms', 'Rooms per floor', {
    group: 'plan',
    min: 2,
    max: 24,
    default: 6,
    visibleIf: hasRooms,
    help: 'A target. The minimum room size wins if they disagree, and you are told when it does.',
  }),
  num('minRoom', 'Smallest room', {
    group: 'plan',
    unit: '',
    min: 4,
    max: 40,
    step: 0.5,
    default: 8,
    visibleIf: hasRooms,
    help: 'Feet, the shortest side any room is allowed. This is what stops the plan filling up with cupboards.',
  }),
  num('corridorWidth', 'Corridor width', {
    group: 'plan',
    unit: '',
    min: 3,
    max: 20,
    step: 0.5,
    default: 6,
    visibleIf: (v) => v.layout === 'corridor',
    help: 'Feet, clear.',
  }),
  int('seed', 'Plan seed', {
    group: 'plan',
    min: 1,
    max: 999,
    default: 7,
    visibleIf: hasRooms,
    help: 'Reshuffles where the partitions land. The same seed always gives the same plan.',
  }),
  bool('groundOpen', 'Open ground floor', {
    group: 'plan',
    default: true,
    help: 'A lobby: no partitions downstairs, but the core still comes through it.',
  }),

  // ---------------------------------------------------------- core & stairs
  bool('core', 'Stair & lift core', {
    group: 'core',
    default: true,
    help: 'A shaft through every slab, with the floor plate wrapped around it.',
  }),
  num('coreWidth', 'Core width', {
    group: 'core',
    unit: '',
    min: 4,
    max: 60,
    step: 0.5,
    default: 11,
    visibleIf: (v) => v.core === true && v.layout !== 'corridor',
    help: 'Feet. Shrunk if it would leave no usable floor around it.',
  }),
  num('coreDepth', 'Core depth', {
    group: 'core',
    unit: '',
    min: 4,
    max: 60,
    step: 0.5,
    default: 13,
    visibleIf: hasCore,
    help: 'Feet. In a corridor plan the core sits at the end of the spine and this is how far along it reaches.',
  }),
  choice('stairs', 'Stairs', {
    group: 'core',
    default: 'switchback',
    visibleIf: hasCore,
    options: [
      { value: 'switchback', label: 'Switchback — two flights and a landing' },
      { value: 'straight', label: 'Straight — one flight, needs a long core' },
      { value: 'none', label: 'None — leave the shaft empty' },
    ],
  }),

  // ------------------------------------------------------ windows and doors
  choice('windows', 'Windows', {
    group: 'openings',
    default: 'auto',
    options: [
      { value: 'auto', label: 'Match the building type' },
      { value: 'punched', label: 'Punched — a row of openings' },
      { value: 'ribbon', label: 'Ribbon — one band wrapping every face' },
      { value: 'none', label: 'None — blank walls' },
    ],
    help: 'Only the KIND of opening follows the building type. The sizes below stay yours either way.',
  }),
  num('winWidth', 'Window width', {
    group: 'openings',
    unit: '',
    min: 1.5,
    max: 20,
    step: 0.5,
    default: 3.5,
    visibleIf: (v) => windowKind(v) === 'punched',
    help: 'Feet.',
  }),
  num('winHeight', 'Window height', {
    group: 'openings',
    unit: '',
    min: 1.5,
    max: 14,
    step: 0.5,
    default: 4.5,
    visibleIf: (v) => windowKind(v) !== 'none',
    help: 'Feet.',
  }),
  num('winSill', 'Sill height', {
    group: 'openings',
    unit: '',
    min: 0,
    max: 8,
    step: 0.25,
    default: 3,
    visibleIf: (v) => windowKind(v) !== 'none',
    help: 'Feet above the floor.',
  }),
  num('winPitch', 'Window spacing', {
    group: 'openings',
    unit: '',
    min: 3,
    max: 40,
    step: 0.5,
    default: 10,
    visibleIf: (v) => windowKind(v) === 'punched',
    help: 'Feet, centre to centre. This is the structural bay of the building, and it is what makes it read as a building rather than a box.',
  }),
  bool('glazing', 'Glaze the windows', {
    group: 'openings',
    default: false,
    visibleIf: (v) => windowKind(v) !== 'none',
    help: 'Closes every window: the opening is cut as a reveal instead of a hole, leaving a thin pane of wall at the back of it. The building reads as glazed rather than as a shell, the wall over a ribbon window stops bridging thin air, and nothing is added that could come loose.',
  }),
  bool('entrance', 'Front entrance', {
    group: 'openings',
    default: true,
  }),
  num('entranceWidth', 'Entrance width', {
    group: 'openings',
    unit: '',
    min: 2.5,
    max: 40,
    step: 0.5,
    default: 8,
    visibleIf: (v) => v.entrance === true,
    help: 'Feet.',
  }),
  num('entranceHeight', 'Entrance height', {
    group: 'openings',
    unit: '',
    min: 6,
    max: 24,
    step: 0.5,
    default: 8,
    visibleIf: (v) => v.entrance === true,
    help: 'Feet.',
  }),
  bool('doorLeaves', 'Hang the doors', {
    group: 'openings',
    default: false,
    visibleIf: (v) => v.entrance === true || v.layout !== 'open',
    help: 'Closes the doorways the same way: a leaf left standing in the opening, set back so the reveal round it still reads. A thin partition may have no room for one, and the app says so when that happens.',
  }),

  // ---------------------------------------------------------------- facade
  // Every control here belongs to an element only some styles have, so each is
  // shown by asking the trait table rather than naming styles by hand.
  num('balconyDepth', 'Balcony depth', {
    group: 'facade',
    unit: '',
    min: 3,
    max: 20,
    step: 0.5,
    default: 6,
    visibleIf: (v) => trait(v).balconies,
    help: 'Feet recessed into the front. Held to 40% of the building depth so it cannot reach the stair core.',
  }),
  num('balconyWidth', 'Balcony width', {
    group: 'facade',
    unit: '%',
    min: 20,
    max: 95,
    step: 1,
    default: 62,
    visibleIf: (v) => trait(v).balconies,
    help: 'Share of the front it runs across, from the left. The rest is solid wall, which is where the windows go.',
  }),
  num('bandProjection', 'Band projection', {
    group: 'facade',
    unit: '',
    min: 2,
    max: 30,
    step: 1,
    default: 6,
    visibleIf: (v) => trait(v).bands !== 'none' || trait(v).ground === 'course',
    help: 'Inches the floor bands, spandrels or base course stand proud of the wall.',
  }),
  num('mullionPitch', 'Mullion spacing', {
    group: 'facade',
    unit: '',
    min: 2,
    max: 20,
    step: 0.5,
    default: 4.5,
    visibleIf: (v) => trait(v).mullions && windowKind(v) === 'ribbon',
    help: 'Feet between the piers left standing in the ribbon. This is what makes a band of glazing read as a grid of windows.',
  }),
  int('stripes', 'Glazed stripes', {
    group: 'facade',
    min: 1,
    max: 5,
    default: 2,
    visibleIf: (v) => trait(v).stripes,
    help: 'Slots of glazing running the full height of the upper floors, spaced evenly across the front.',
  }),
  num('stripeWidth', 'Stripe width', {
    group: 'facade',
    unit: '',
    min: 3,
    max: 40,
    step: 0.5,
    default: 9,
    visibleIf: (v) => trait(v).stripes,
    help: 'Feet.',
  }),
  choice('shopfront', 'Under the columns', {
    group: 'facade',
    default: 'auto',
    options: [
      { value: 'auto', label: 'Match the building type' },
      { value: 'glazed', label: 'Glazed shopfront behind them' },
      { value: 'open', label: 'Left open' },
    ],
    visibleIf: (v) => trait(v).ground === 'pilotis' || trait(v).ground === 'frontPilotis',
    help: 'A glazed wall set back behind the columns. It is what a shop has under it, and it also braces the columns: on its own each one is a cantilever off the slab, and the open ground floor is the only place a miniature building stands on sticks.',
  }),
  num('chamfer', 'Corner chamfer', {
    group: 'facade',
    unit: '',
    min: 0,
    max: 30,
    step: 0.5,
    default: 7,
    visibleIf: (v) => trait(v).chamfer,
    help: 'Feet cut off each corner in plan. The ribbon windows wrap round the chamfer, which is the whole point of it.',
  }),
  num('signWidth', 'Sign panel width', {
    group: 'facade',
    unit: '',
    min: 4,
    max: 60,
    step: 0.5,
    default: 13,
    visibleIf: (v) => trait(v).sign,
    help: 'Feet. A billboard standing proud of the front, over the glazing behind it.',
  }),
  num('canopyDepth', 'Entrance canopy', {
    group: 'facade',
    unit: '',
    min: 2,
    max: 24,
    step: 0.5,
    default: 7,
    visibleIf: (v) => trait(v).canopy,
    help: 'Feet it projects. It comes with posts and an apron, because a canopy on nothing prints as three loose pieces.',
  }),
  num('towerHeight', 'Stair tower', {
    group: 'facade',
    unit: '',
    min: 6,
    max: 40,
    step: 0.5,
    default: 13,
    visibleIf: (v) => trait(v).tower,
    help: 'Feet the core carries on above the roof, with its own slot windows.',
  }),

  // ------------------------------------------------------------------ roof
  choice('roof', 'Roof', {
    group: 'roof',
    default: 'parapet',
    options: [
      { value: 'parapet', label: 'Flat, with a parapet' },
      { value: 'penthouse', label: 'Parapet with a rooftop penthouse' },
      { value: 'flat', label: 'Flat' },
      { value: 'gable', label: 'Gable' },
      { value: 'hip', label: 'Hipped' },
    ],
  }),
  num('parapet', 'Parapet height', {
    group: 'roof',
    unit: '',
    min: 1,
    max: 12,
    step: 0.5,
    default: 3.5,
    visibleIf: hasParapet,
    help: 'Feet above the roof deck.',
  }),
  num('penthouseHeight', 'Penthouse height', {
    group: 'roof',
    unit: '',
    min: 6,
    max: 20,
    step: 0.5,
    default: 10,
    visibleIf: (v) => v.roof === 'penthouse',
    help: 'Feet above the deck. A set-back plant storey across the back of the roof, vented through its walls, leaving the front of the roof a terrace.',
  }),
  num('roofPitch', 'Pitch', {
    group: 'roof',
    unit: 'deg',
    min: 10,
    max: 60,
    step: 1,
    default: 32,
    visibleIf: isPitched,
  }),
  num('eaves', 'Eaves overhang', {
    group: 'roof',
    unit: '',
    min: 0,
    max: 8,
    step: 0.25,
    default: 1.5,
    visibleIf: isPitched,
    help: 'Feet beyond the wall, all round.',
  }),
  bool('bulkhead', 'Rooftop plant room', {
    group: 'roof',
    default: true,
    visibleIf: (v) => isFlat(v) && v.core === true,
    help: 'The box over the core — lift overrun, tank room, stair head. It is what stops a flat roof looking like a lid.',
  }),

  // --------------------------------------------------------------- output
  choice('split', 'Output', {
    group: 'output',
    default: 'storeys',
    options: [
      { value: 'storeys', label: 'One part per storey — stackable, rooms visible' },
      { value: 'single', label: 'One solid piece — sealed, rooms inside' },
    ],
  }),
  choice('joint', 'Storey joint', {
    group: 'output',
    default: 'tongue',
    visibleIf: (v) => v.split === 'storeys',
    options: [
      { value: 'tongue', label: 'Tongue and groove round the wall head' },
      { value: 'pins', label: 'Four alignment pins' },
      { value: 'none', label: 'Nothing — the storeys just stack' },
    ],
    help: 'How one printed storey connects to the next. The tongue runs the whole wall head into a groove in the slab above, so the pieces find each other going down and cannot rack; pins only stop the stack sliding. A wall too thin for a tongue falls back to pins, and the app says so.',
  }),
  bool('openFront', 'Cutaway front', {
    group: 'output',
    default: false,
    help: 'Leave the front wall off, dolls’-house fashion, so the rooms are visible from outside.',
  }),
  bool('base', 'Display plinth', { group: 'output', default: false }),
  text('baseName', 'Plinth label', {
    group: 'output',
    default: '',
    maxLength: 32,
    placeholder: 'Leave empty for a blank plinth',
    visibleIf: (v) => v.base === true,
    debounceMs: 250,
  }),
  font('baseFont', 'Label font', {
    group: 'output',
    default: 'inter-bold',
    visibleIf: (v) => v.base === true,
    debounceMs: 250,
  }),

  // -------------------------------------------------------------- colours
  color('wallColor', 'Walls & floors', { group: 'look', default: '#e6e0d4' }),
  color('roofColor', 'Roof', { group: 'look', default: '#5b6672' }),
  color('baseColor', 'Plinth', {
    group: 'look',
    default: '#2b2f33',
    visibleIf: (v) => v.base === true,
  }),
  color('labelColor', 'Plinth label', {
    group: 'look',
    default: '#d9cfae',
    visibleIf: (v) => v.base === true,
  }),

  // ------------------------------------------------------------ detailing
  num('doorWidth', 'Doorway width', {
    group: 'detail',
    unit: '',
    min: 2,
    max: 12,
    step: 0.25,
    default: 3,
    help: 'Feet.',
  }),
  num('doorHeight', 'Doorway height', {
    group: 'detail',
    unit: '',
    min: 5,
    max: 14,
    step: 0.25,
    default: 6.75,
    visibleIf: (v) => v.doorLintel === true,
    help: 'Feet, to the head.',
  }),
  bool('doorLintel', 'Wall over doorways', {
    group: 'detail',
    default: false,
    help: 'Off, the doorways run the full height of the partition, which reads far better in a cutaway. On, each gets a real head and a lintel over it.',
  }),
  num('railHeight', 'Balustrade height', {
    group: 'detail',
    unit: '',
    min: 2.5,
    max: 6,
    step: 0.25,
    default: 3.5,
    visibleIf: (v) => trait(v).balconies,
    help: 'Feet above the balcony floor.',
  }),
  num('signProjection', 'Sign projection', {
    group: 'detail',
    unit: '',
    min: 2,
    max: 36,
    step: 1,
    default: 10,
    visibleIf: (v) => trait(v).sign,
    help: 'Inches.',
  }),
  num('riser', 'Stair riser', {
    group: 'detail',
    unit: '',
    min: 5,
    max: 9,
    step: 0.25,
    default: 7,
    visibleIf: (v) => v.core === true && v.stairs !== 'none',
    help: 'Inches — a target. The flight divides the floor height into whole risers, so the one you get is close to this, not equal to it.',
  }),
  num('tread', 'Stair going', {
    group: 'detail',
    unit: '',
    min: 8,
    max: 16,
    step: 0.25,
    default: 11,
    visibleIf: (v) => v.core === true && v.stairs !== 'none',
    help: 'Inches per tread.',
  }),
  num('baseThickness', 'Plinth thickness', {
    group: 'detail',
    unit: 'mm',
    min: 1,
    max: 12,
    step: 0.5,
    default: 3.5,
    visibleIf: (v) => v.base === true,
    help: 'Millimetres — the plinth is not part of the building, so it is not to scale.',
  }),
  num('baseMargin', 'Plinth margin', {
    group: 'detail',
    unit: 'mm',
    min: 3,
    max: 40,
    step: 0.5,
    default: 10,
    visibleIf: (v) => v.base === true,
  }),
  num('baseNameSize', 'Label size', {
    group: 'detail',
    unit: 'mm',
    min: 1.5,
    max: 12,
    step: 0.5,
    default: 4,
    visibleIf: (v) => v.base === true,
  }),

  // --------------------------------------------------------------- printer
  num('nozzle', 'Nozzle diameter', {
    group: 'printer',
    unit: 'mm',
    min: 0.2,
    max: 1,
    step: 0.05,
    default: 0.4,
    help: 'Sets the floor on every wall thickness in the model. A 0.4 mm nozzle cannot print a wall under 0.8 mm, whatever the scale says it should be.',
  }),
  num('layer', 'Layer height', {
    group: 'printer',
    unit: 'mm',
    min: 0.08,
    max: 0.32,
    step: 0.02,
    default: 0.2,
  }),
];
