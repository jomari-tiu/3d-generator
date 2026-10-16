import { bool, choice, color, int, num } from '../../core/params/dsl';
import type { ParamGroup, ParamSpec } from '../../core/params/types';
import { clawColourParams, clawParams, stairColourParams, stairParams } from '../shared/params';

export const hangarGroups: readonly ParamGroup[] = [
  { id: 'bay', label: 'Bay size', tab: 'Hangar' },
  { id: 'walls', label: 'Walls', tab: 'Hangar' },
  { id: 'door', label: 'Hangar door', tab: 'Hangar' },
  { id: 'details', label: 'Details', tab: 'Hangar' },
  { id: 'ceiling', label: 'Ceiling', tab: 'Hangar' },
  { id: 'catwalk', label: 'Catwalk', tab: 'Equipment' },
  { id: 'room', label: 'Control room', tab: 'Equipment' },
  { id: 'tower', label: 'Gantry tower', tab: 'Equipment' },
  { id: 'stairs', label: 'Stair tower & crew', tab: 'Equipment' },
  { id: 'fit', label: 'Moving parts', tab: 'Output' },
  { id: 'look', label: 'Colours', tab: 'Output' },
  { id: 'printer', label: 'Printer', tab: 'Output', collapsed: true },
];

type V = Record<string, unknown>;
const hasDoor = (v: V) => v.door === true;
const hasCatwalk = (v: V) => v.catwalk === true;
const hasBridge = (v: V) => hasCatwalk(v) && v.bridge === true;
const hasTower = (v: V) => v.tower === true;
const hasJib = (v: V) => hasTower(v) && v.jib === true;
const printedPins = (v: V) => v.pinStyle === 'printed';
const hasRoom = (v: V) => v.controlRoom === true;

export const hangarParams: readonly ParamSpec[] = [
  // -------------------------------------------------------------------- bay
  num('bayWidth', 'Width', {
    group: 'bay',
    unit: 'mm',
    min: 120,
    max: 400,
    step: 1,
    default: 200,
    help: 'Side to side, the whole base. A 1/144 HG or RG kit wants about 200 mm, a 1/100 MG about 240 mm.',
  }),
  num('bayDepth', 'Depth', {
    group: 'bay',
    unit: 'mm',
    min: 90,
    max: 400,
    step: 1,
    default: 140,
    help: 'Front to back, the whole base.',
  }),
  num('wallHeight', 'Wall height', {
    group: 'bay',
    unit: 'mm',
    min: 80,
    max: 400,
    step: 1,
    default: 180,
    help: 'From the floor to the top of the walls. Leave the kit 20 mm or more of headroom: about 180 mm for HG, 240 mm for MG.',
  }),
  num('baseHeight', 'Base height', {
    group: 'bay',
    unit: 'mm',
    min: 8,
    max: 30,
    step: 0.5,
    default: 12,
    help: 'The plinth the floor sits on. The walls stand in slots cut into it.',
  }),
  bool('floorPanels', 'Floor plates', {
    group: 'bay',
    default: true,
    help: 'Shallow grooves that mark the floor out in deck plates.',
  }),
  num('panelSize', 'Plate size', {
    group: 'bay',
    unit: 'mm',
    min: 10,
    max: 80,
    step: 1,
    default: 30,
    visibleIf: (v) => v.floorPanels === true,
  }),

  // ------------------------------------------------------------------ walls
  choice('sideWalls', 'Side walls', {
    group: 'walls',
    default: 'left',
    options: [
      { value: 'left', label: 'Left only (open to the right)' },
      { value: 'both', label: 'Left and right' },
    ],
    help: 'The catwalk always goes on the left wall. One side open shows the kit off better.',
  }),
  num('wallThickness', 'Wall thickness', {
    group: 'walls',
    unit: 'mm',
    min: 2.4,
    max: 8,
    step: 0.2,
    default: 4,
  }),
  choice('wallStyle', 'Wall style', {
    group: 'walls',
    default: 'frames',
    options: [
      { value: 'frames', label: 'Framed bays with X-braces' },
      { value: 'ribs', label: 'Vertical ribs' },
      { value: 'plain', label: 'Plain' },
    ],
    help: 'What stands on the inside of the walls. Framed bays are steel frames with cross braces, hubs and bolts, mixed with plain panels. On the back wall they stay above the door, out of the way of the sliding leaves.',
  }),
  num('frameBayWidth', 'Bay width', {
    group: 'walls',
    unit: 'mm',
    min: 20,
    max: 80,
    step: 1,
    default: 38,
    visibleIf: (v) => v.wallStyle === 'frames',
    help: 'Roughly how wide each framed bay is. They are sized to fill each wall evenly.',
  }),
  num('ribSpacing', 'Rib spacing', {
    group: 'walls',
    unit: 'mm',
    min: 12,
    max: 80,
    step: 1,
    default: 28,
    visibleIf: (v) => v.wallStyle === 'ribs',
  }),

  // ------------------------------------------------------------------- door
  bool('door', 'Sliding door', {
    group: 'door',
    default: true,
    help: 'An opening in the back wall closed by shutter leaves that slide along a track. Slide them in from the end of the track before the side walls go on; the side walls then keep them in.',
  }),
  choice('doorLeaves', 'Leaves', {
    group: 'door',
    default: '2',
    visibleIf: hasDoor,
    options: [
      { value: '2', label: 'Two, part in the middle' },
      { value: '1', label: 'One, slides to the side' },
    ],
  }),
  num('doorWidth', 'Opening width', {
    group: 'door',
    unit: 'mm',
    min: 30,
    max: 300,
    step: 1,
    default: 86,
    visibleIf: hasDoor,
  }),
  num('doorHeight', 'Opening height', {
    group: 'door',
    unit: 'mm',
    min: 30,
    max: 350,
    step: 1,
    default: 140,
    visibleIf: hasDoor,
    help: 'The opening starts a little above the floor, over the bottom rail of the track.',
  }),

  // ---------------------------------------------------------------- details
  bool('hazardStripes', 'Hazard stripes', {
    group: 'details',
    default: true,
    help: 'Diagonal stripes along the foot of the door, on the beam over it and on the floor in front of it, and a marked pad where the kit stands. Each is a separate inlay part: print it in another colour or paint it.',
  }),
  bool('wallPanels', 'Wall panel seams', {
    group: 'details',
    default: true,
    help: 'Shallow seams that mark the back wall out in steel panels.',
  }),
  bool('pipes', 'Pipes', {
    group: 'details',
    default: true,
    help: 'A pair of pipes run along the left wall, below the catwalk. A separate part, for a second colour.',
  }),

  // ---------------------------------------------------------------- ceiling
  bool('ceiling', 'Ceiling frame', {
    group: 'ceiling',
    default: true,
    help: 'An open steel roof frame that sits on the wall tops and pegs into them: trusses round the edges and across the bay, beams over the top, work lamps hanging under it. Lift it off to get at the kit. With one side wall, a column at the front corner holds up the open side.',
  }),
  num('trussSpacing', 'Truss spacing', {
    group: 'ceiling',
    unit: 'mm',
    min: 20,
    max: 80,
    step: 1,
    default: 34,
    visibleIf: (v) => v.ceiling === true,
    help: 'Roughly how far apart the trusses and the beams over them are. They are spread to fill the ceiling evenly.',
  }),
  num('trussDepth', 'Truss depth', {
    group: 'ceiling',
    unit: 'mm',
    min: 5,
    max: 20,
    step: 0.5,
    default: 8,
    visibleIf: (v) => v.ceiling === true,
    help: 'How tall the trusses stand above the wall tops.',
  }),
  bool('ceilingLights', 'Work lamps', { group: 'ceiling', default: true, visibleIf: (v) => v.ceiling === true }),
  ...clawParams(
    'ceiling',
    45,
    'A three-talon claw on a chain, hooked over one of the beams on top of the ceiling and hanging down over the bay. Each talon swings on its own pin, so the claw opens and closes round a part.',
    (v) => v.ceiling === true,
  ),

  // ----------------------------------------------------------------- stairs
  ...stairParams(
    'stairs',
    { span: 37, height: 90, scale: '144' },
    'A stair tower against the back wall, right of the door: a steel frame with a railed landing at every turn, and open stairs between them switching back and forth in two lanes, so there is a full storey of headroom over every flight. The frame prints standing; each flight prints on its side and pegs onto its landings.',
  ),

  // ---------------------------------------------------------------- catwalk
  bool('catwalk', 'Catwalk', {
    group: 'catwalk',
    default: true,
    help: 'A walkway along the left wall at chest height, part of the wall itself, with a ladder up to it.',
  }),
  num('catwalkHeight', 'Height above floor', {
    group: 'catwalk',
    unit: 'mm',
    min: 20,
    max: 350,
    step: 1,
    default: 95,
    visibleIf: hasCatwalk,
    help: 'About the chest of the kit: 95 mm for HG, 130 mm for MG.',
  }),
  num('catwalkDepth', 'Walkway width', {
    group: 'catwalk',
    unit: 'mm',
    min: 14,
    max: 60,
    step: 1,
    default: 24,
    visibleIf: hasCatwalk,
  }),
  bool('railing', 'Railing', {
    group: 'catwalk',
    default: true,
    visibleIf: hasCatwalk,
    help: 'Printed flat and pegged into holes along the edge of the walkway.',
  }),
  bool('ladder', 'Ladder', { group: 'catwalk', default: true, visibleIf: hasCatwalk }),
  bool('catwalkLegs', 'Support legs', {
    group: 'catwalk',
    default: true,
    visibleIf: hasCatwalk,
    help: 'A frame of steel legs and cross braces under the outer edge of the walkway, down to the floor, the way a real one stands. It pegs into the walkway and the floor, and stops short of the path the gantry tower slides along.',
  }),
  bool('bridge', 'Swing bridge', {
    group: 'catwalk',
    default: true,
    visibleIf: hasCatwalk,
    help: 'An access bridge that swings out from the catwalk on a pin, to reach the cockpit.',
  }),
  num('bridgeLength', 'Bridge length', {
    group: 'catwalk',
    unit: 'mm',
    min: 20,
    max: 200,
    step: 1,
    default: 50,
    visibleIf: hasBridge,
  }),

  // ------------------------------------------------------------------- room
  bool('controlRoom', 'Control room', {
    group: 'room',
    default: true,
    help: 'An observation room for the crew, standing out from the left wall over the back of the catwalk, with a row of windows, a doorway onto the walkway and a balcony on its roof. Its underside slopes at 45 degrees, so it prints with the wall.',
  }),
  bool('roomFullLength', 'Full length of the wall', {
    group: 'room',
    default: true,
    visibleIf: hasRoom,
    help: 'Run the room along the whole wall, from the front edge to the door track. It stands high enough over the catwalk for the swing bridge to turn under it.',
  }),
  num('roomLength', 'Length', {
    group: 'room',
    unit: 'mm',
    min: 42,
    max: 200,
    step: 1,
    default: 60,
    visibleIf: (v) => hasRoom(v) && v.roomFullLength !== true,
    help: 'Measured from the back of the wall, by the door track. At least long enough for the doorway and its panels.',
  }),
  num('roomDepth', 'Depth from wall', {
    group: 'room',
    unit: 'mm',
    min: 8,
    max: 50,
    step: 1,
    default: 16,
    visibleIf: hasRoom,
    help: 'Kept shallower than the catwalk, so the walkway runs on under it.',
  }),
  num('roomHeight', 'Height', {
    group: 'room',
    unit: 'mm',
    min: 14,
    max: 80,
    step: 1,
    default: 26,
    visibleIf: hasRoom,
  }),
  int('roomWindows', 'Windows', { group: 'room', min: 1, max: 12, default: 5, visibleIf: hasRoom }),
  bool('roofRailing', 'Roof balcony railing', { group: 'room', default: true, visibleIf: hasRoom }),

  // ------------------------------------------------------------------ tower
  bool('tower', 'Gantry tower', {
    group: 'tower',
    default: true,
    help: 'A lattice maintenance tower. A channel under its foot rides a rail across the front of the floor, so it slides side to side.',
  }),
  num('towerHeight', 'Tower height', {
    group: 'tower',
    unit: 'mm',
    min: 40,
    max: 400,
    step: 1,
    default: 150,
    visibleIf: hasTower,
  }),
  num('towerWidth', 'Tower width', {
    group: 'tower',
    unit: 'mm',
    min: 14,
    max: 50,
    step: 1,
    default: 22,
    visibleIf: hasTower,
  }),
  bool('jib', 'Crane arm', {
    group: 'tower',
    default: true,
    visibleIf: hasTower,
    help: 'An arm with a hook on top of the tower that swings round on a pin.',
  }),
  choice('craneTool', 'On the crane arm', {
    group: 'tower',
    default: 'arm',
    visibleIf: hasJib,
    options: [
      { value: 'arm', label: 'Robot arm with a claw' },
      { value: 'hook', label: 'Hook on a cable' },
    ],
    help: 'The robot arm hangs from the tip of the crane arm: upper arm, forearm and wrist, each on a pin, with a two-finger claw that opens and closes. The joints are a snug fit, so it holds a pose.',
  }),
  num('robotArmLength', 'Robot arm reach', {
    group: 'tower',
    unit: 'mm',
    min: 30,
    max: 120,
    step: 1,
    default: 60,
    visibleIf: (v) => hasJib(v) && v.craneTool === 'arm',
    help: 'Upper arm and forearm together, joint to joint.',
  }),
  bool('craneCab', 'Operator cab', {
    group: 'tower',
    default: true,
    visibleIf: hasJib,
    help: 'The operator\'s cab, beside the boom on the crane\'s house, as on an excavator: glass round the front, a beacon on the roof. The house turns on the top of the tower, so the cab swings left and right with the boom.',
  }),
  bool('towerLadder', 'Tower ladder', {
    group: 'tower',
    default: true,
    visibleIf: hasTower,
    help: 'A ladder up the front of the tower, standing on its foot, to the operator cab\'s side door (or to the top platform, without a cab). It prints with the tower: the rungs bridge between the rails.',
  }),
  num('boomAngle', 'Boom angle', {
    group: 'tower',
    unit: 'deg',
    min: -5,
    max: 60,
    step: 1,
    default: 10,
    visibleIf: hasJib,
    help: 'How far the boom is raised, as shown here. It tips up and down on its hinge pin, a snug fit, so it stays where you set it.',
  }),
  num('jibLength', 'Arm length', {
    group: 'tower',
    unit: 'mm',
    min: 25,
    max: 150,
    step: 1,
    default: 60,
    visibleIf: hasJib,
    help: 'From the tower\'s axis to the tip.',
  }),

  // -------------------------------------------------------------------- fit
  num('clearance', 'Sliding clearance', {
    group: 'fit',
    unit: 'mm',
    min: 0.1,
    max: 0.8,
    step: 0.05,
    default: 0.3,
    help: 'Gap around everything that moves: the door leaves in their track, the tower key in its groove, the pins in their holes. Raise it if parts bind.',
  }),
  choice('pinStyle', 'Pivot pins', {
    group: 'fit',
    default: 'printed',
    options: [
      { value: 'printed', label: 'Printed pins' },
      { value: 'filament', label: '1.75 mm filament' },
    ],
    help: 'The bridge and the crane arm turn on pins. Print them, or cut a short piece of filament for each instead.',
  }),
  num('pinDiameter', 'Pin diameter', {
    group: 'fit',
    unit: 'mm',
    min: 2,
    max: 5,
    step: 0.1,
    default: 3,
    visibleIf: printedPins,
  }),
  num('jointFit', 'Robot arm joint fit', {
    group: 'fit',
    unit: 'mm',
    min: 0,
    max: 0.4,
    step: 0.05,
    default: 0.1,
    visibleIf: (v) => hasJib(v) && v.craneTool === 'arm',
    help: 'Gap round the pins in the robot arm and claw. Kept small so the joints are stiff enough to hold a pose; raise it if they will not turn.',
  }),
  num('wallFit', 'Wall slot clearance', {
    group: 'fit',
    unit: 'mm',
    min: 0,
    max: 0.6,
    step: 0.05,
    default: 0.15,
    help: 'Gap around the walls where they stand in the base. Small, so they push in and stay.',
  }),

  // ------------------------------------------------------------------- look
  color('baseColor', 'Base', { group: 'look', default: '#2b2d31' }),
  color('wallColor', 'Walls', { group: 'look', default: '#8b96a3' }),
  color('ceilingColor', 'Ceiling steel', { group: 'look', default: '#3b4048', visibleIf: (v) => v.ceiling === true }),
  color('doorColor', 'Door', { group: 'look', default: '#5d6875', visibleIf: hasDoor }),
  color('yellowColor', 'Tower & railings', { group: 'look', default: '#f0b323' }),
  color('accentColor', 'Bridge & crane arm', { group: 'look', default: '#e8692a' }),
  color('pinColor', 'Pins', { group: 'look', default: '#c9ced4', visibleIf: printedPins }),
  ...stairColourParams('look'),
  ...clawColourParams('look'),
  color('stripeColor', 'Hazard stripes', { group: 'look', default: '#f5c518', visibleIf: (v) => v.hazardStripes === true }),
  color('pipeColor', 'Pipes', { group: 'look', default: '#b8322f', visibleIf: (v) => v.pipes === true }),
  color('glassColor', 'Window glass', { group: 'look', default: '#5fb8ee', visibleIf: hasRoom }),

  // ---------------------------------------------------------------- printer
  int('bedX', 'Bed width', { group: 'printer', unit: 'mm', min: 100, max: 500, default: 256 }),
  int('bedY', 'Bed depth', { group: 'printer', unit: 'mm', min: 100, max: 500, default: 256 }),
];
