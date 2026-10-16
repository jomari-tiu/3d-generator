import type { Manifold } from 'manifold-3d';
import { serialize } from '../../core/kernel/serialize';
import type { BuildCtx, BuildResult, Generator, Issue, Params, Part } from '../../core/params/types';
import { derive, doorTravel, fitsBed, trackTop, wallSizes, HINGE_U, type Derived } from './geometry';
import {
  bridgePinSpan, buildCatwalkLegs, legFloorHoles, buildBackWall, buildBase, buildBridge, buildFloorMark, buildGlass, buildHeaderStripes,
  buildBoom, buildBoomPin, buildHouse, buildHouseLights, buildLeaf, buildLeafStripes, buildLeftWall, buildPin, buildPipes, buildRailing,
  buildRightWall, buildRoofRailing, buildTower, floorMarks, jibPinSpan,
  armPose, buildArmPin, buildCabGlass, buildClaw, buildForearm, buildUpperArm, buildWrist,
} from './parts';
import { buildCeiling, buildColumn } from './ceiling';
import { hangarClawSpec, hangarStairSpec, stairBounds } from './extras';
import { clawLayout } from '../shared/claw';
import { addClaw, addStairs } from '../shared/parts';
import { stairCheck, stairLayout, stairSlot } from '../shared/stairs';
import { hangarGroups, hangarParams } from './schema';

const fmt = (n: number) => n.toFixed(0);

/** Lying on one side: +X up for the left wall, so its catwalk, ribs and ladder stand on it. */
const PRINT_POS_X_UP: [number, number, number] = [0, -90, 0];
const PRINT_NEG_X_UP: [number, number, number] = [0, 90, 0];
/** Front face up: the door track and the shutter slats on top. */
const PRINT_FRONT_UP: [number, number, number] = [-90, 0, 0];
const PRINT_FLIPPED: [number, number, number] = [180, 0, 0];
/** Robot arm links lie in the crane arm's plane: that plane down on the bed. */
const PRINT_ARM_FLAT: [number, number, number] = [90, 0, 0];
/** Arm pins run along y with their head at +y: head down. */
const PRINT_ARM_PIN: [number, number, number] = [-90, 0, 0];

function validate(p: Params): Issue[] {
  const d = derive(p);
  const issues: Issue[] = [];
  const err = (message: string, paramIds: string[]) => issues.push({ level: 'error', message, paramIds });
  const warn = (message: string, paramIds: string[]) => issues.push({ level: 'warn', message, paramIds });
  const bed = `your ${d.bedX} x ${d.bedY} mm bed`;

  if (!fitsBed(d, [d.W, d.D])) {
    err(`The base is ${fmt(d.W)} x ${fmt(d.D)} mm, bigger than ${bed}.`, ['bayWidth', 'bayDepth', 'bedX', 'bedY']);
  }
  const walls = wallSizes(d);
  if (!fitsBed(d, walls.back)) {
    err(`The back wall prints lying down at ${fmt(walls.back[0])} x ${fmt(walls.back[1])} mm, bigger than ${bed}. Make the bay narrower or the walls lower.`, ['bayWidth', 'wallHeight', 'bedX', 'bedY']);
  } else if (!fitsBed(d, walls.side)) {
    err(`The side walls print lying down at ${fmt(walls.side[0])} x ${fmt(walls.side[1])} mm, bigger than ${bed}.`, ['bayDepth', 'wallHeight', 'bedX', 'bedY']);
  }
  if (d.bayRight - d.xl1 < 60) {
    err('The bay is too narrow inside its walls to hold anything. Make it wider.', ['bayWidth', 'wallThickness']);
  }

  if (d.door) {
    const track = d.trackX1 - d.trackX0;
    if (d.doorW + 6 > track - 2) {
      err(`The door opening is wider than the track it slides on, which has ${fmt(track)} mm between the side walls. Make the opening narrower.`, ['doorWidth', 'bayWidth']);
    } else {
      const short = doorTravel(d).some((t) => t.need > t.room + 0.01);
      if (short) {
        warn(`There is not enough track beside the opening for the door to slide all the way open. Make the opening narrower${d.leaves === 1 ? ', or use two leaves' : ''}.`, ['doorWidth', 'doorLeaves']);
      }
    }
    if (trackTop(d) + 2 > d.wallTop) {
      err(`The door track runs ${fmt(trackTop(d) - d.floorZ)} mm up the wall, taller than the wall. Make the opening lower or the walls taller.`, ['doorHeight', 'wallHeight']);
    }
  }

  if (d.catwalk) {
    if (d.cz + d.railH > d.wallTop) {
      err('The catwalk and its railing stand higher than the wall. Lower the catwalk.', ['catwalkHeight', 'wallHeight']);
    }
    if (d.cd > (d.bayRight - d.xl1) / 2) {
      err('The catwalk reaches more than halfway across the bay. Make the walkway narrower.', ['catwalkDepth', 'bayWidth']);
    }
    if (d.bridge && d.pivot[0] + d.bridgeL > d.bayRight - 2) {
      warn('The swing bridge reaches all the way across the bay. Make it shorter so it can swing.', ['bridgeLength']);
    }
  }

  if (d.room) {
    const top = d.rz1 + (d.roofRailing ? d.railH : 0);
    if (top > d.wallTop - 1) {
      err(`The control room${d.roofRailing ? ' and its roof railing' : ''} would stand ${fmt(top - d.wallTop + 1)} mm above the wall. Make the room lower${d.catwalk ? ', the catwalk lower' : ''} or the walls taller.`, ['roomHeight', 'roomDepth', 'catwalkHeight', 'wallHeight']);
    }
    if (d.catwalk && d.rd > d.cd - 5) {
      err('The control room stands out further than the catwalk under it. Make it shallower or the walkway wider.', ['roomDepth', 'catwalkDepth']);
    }
    // It stands over the swing bridge, high enough for it, so only the wall
    // itself limits how long it can be.
    if (d.ry0 < d.deckY0 - 0.01) {
      err(`The control room is longer than the wall, which has ${fmt(d.deckY1 - d.deckY0)} mm for it. Make it shorter, or turn on Full length.`, ['roomLength', 'roomFullLength', 'bayDepth']);
    }
  }

  if (d.tower) {
    if (d.grooveX1 - d.grooveX0 < d.footW + 10) {
      err('The bay is too narrow for the gantry tower to slide. Make the tower narrower or the bay wider.', ['towerWidth', 'bayWidth']);
    }
    if (d.jib && d.jibL < HINGE_U + 30) {
      err(`The boom needs to reach at least ${fmt(HINGE_U + 30)} mm to clear the front of the house. Make it longer.`, ['jibLength']);
    }
    if (d.robotArm) {
      const pose = armPose(d);
      const low = Math.min(pose.H[0][1], pose.H[1][1]) - 1.2;
      if (low < d.floorZ + 5) {
        err(`The robot arm hangs ${fmt(d.floorZ + 5 - low)} mm too low and runs into the floor. Shorten its reach or make the tower taller.`, ['robotArmLength', 'towerHeight']);
      }
    }
    if (d.jib && d.towerH > d.wallH + 20) {
      warn('The tower stands well above the walls.', ['towerHeight']);
    }
  }

  const st = stairsOf(p, d);
  if (st) {
    const b = stairBounds(d);
    const L = stairLayout(st);
    if (L.run < 4 * L.sizes.tread) {
      err(`There is only ${fmt(b.maxX - b.minX)} mm beside the door for the stair tower, too little for flights between its landings. Make the door narrower or the bay wider, or turn the stairs off.`, ['stairSpan', 'doorWidth', 'bayWidth']);
    } else {
      const chk = stairCheck(st);
      if (chk.headroom < chk.needed) {
        err(`At ${fmt(st.x1 - st.x0)} mm wide the flights are too short to give a 1/${st.scale} figure 2 m of headroom under the flight above. Make the tower wider.`, ['stairSpan', 'stairScale']);
      }
    }
    const ceiling = d.ceiling ? (d.ceilingLights ? 3.6 : 0.4) : 0;
    if (st.zFloor + st.height + L.railH + 1 > d.wallTop - ceiling) {
      err('The stair tower and its top railing reach the top of the walls. Make it lower.', ['stairHeight', 'wallHeight']);
    }
  }
  const cl = clawOf(p, d);
  if (cl && clawLayout(cl).hubBottom - 20 < d.floorZ + 10) {
    err('The ceiling claw hangs down to the floor. Shorten its chain.', ['clawDrop']);
  }
  return issues;
}

function stairsOf(p: Params, d: Derived) {
  return p.stairs === true
    ? hangarStairSpec(d, Number(p.stairSpan), Number(p.stairHeight), Number(p.stairScale))
    : null;
}

function clawOf(p: Params, d: Derived) {
  return d.ceiling && p.ceilingClaw === true ? hangarClawSpec(d, Number(p.clawDrop)) : null;
}

function readouts(d: Derived): Record<string, string> {
  const inside = `${fmt(d.bayRight - d.xl1)} x ${fmt(d.yb0 - d.yFront)} mm`;
  const out: Record<string, string> = {
    'Bay floor': inside,
    'Fits a kit up to': `about ${fmt(d.wallH - 20)} mm tall`,
  };
  if (d.door) out['Door opening'] = `${fmt(d.doorW)} x ${fmt(d.doorH)} mm, ${d.leaves === 2 ? 'two leaves' : 'one leaf'}`;
  if (d.catwalk) out.Catwalk = `${fmt(d.cz - d.floorZ)} mm above the floor`;
  if (d.room) out['Control room'] = `${fmt(d.rl)} x ${fmt(d.rd)} x ${fmt(d.rh)} mm, ${d.roomWindows} windows`;
  return out;
}

function build(p: Params, ctx: BuildCtx): BuildResult {
  const { m } = ctx;
  const d = derive(p);
  const issues = validate(p);
  if (issues.some((i) => i.level === 'error')) return { parts: [], issues, readouts: readouts(d) };

  const wall = String(p.wallColor);
  const yellow = String(p.yellowColor);
  const accent = String(p.accentColor);
  const parts: Part[] = [
    {
      id: 'base',
      name: 'Base',
      mesh: serialize(buildBase(m, d, [...(stairsOf(p, d) ? [stairSlot(m, stairsOf(p, d)!)] : []), ...legFloorHoles(m, d)])),
      color: String(p.baseColor),
      orientationNote: 'Print flat, floor up.',
    },
    {
      id: 'back-wall',
      name: 'Back wall',
      mesh: serialize(buildBackWall(m, d)),
      color: wall,
      orientation: PRINT_FRONT_UP,
      orientationNote: d.door
        ? 'Print lying down, inside face up. The door track prints on top; its undersides are 45 degree slopes.'
        : 'Print lying down.',
    },
    {
      id: 'left-wall',
      name: 'Left wall',
      mesh: serialize(buildLeftWall(m, d)),
      color: wall,
      orientation: PRINT_POS_X_UP,
      orientationNote: d.catwalk
        ? 'Print lying down, inside face up. The catwalk stands up off it, braced by its gussets.'
        : 'Print lying down, inside face up.',
    },
  ];
  if (d.both) {
    parts.push({
      id: 'right-wall',
      name: 'Right wall',
      mesh: serialize(buildRightWall(m, d)),
      color: wall,
      orientation: PRINT_NEG_X_UP,
      orientationNote: 'Print lying down, inside face up.',
    });
  }

  // Inlays print with what carries them, as one object in a second colour.
  const stripe = String(p.stripeColor);
  const marks = floorMarks(m, d);
  if (marks.band || marks.pad) parts[0] = { ...parts[0]!, group: 'base' };
  if (marks.band) {
    parts.push({
      id: 'floor-stripes',
      name: 'Floor hazard stripes',
      mesh: serialize(buildFloorMark(m, d, marks.band)),
      color: stripe,
      group: 'base',
      orientationNote: 'An inlay, flush in the floor in front of the door.',
    });
  }
  if (marks.pad) {
    parts.push({
      id: 'kit-pad',
      name: 'Kit pad marking',
      mesh: serialize(buildFloorMark(m, d, marks.pad)),
      color: stripe,
      group: 'base',
      orientationNote: 'An inlay, flush in the floor where the kit stands.',
    });
  }
  if (d.header && d.hazard) {
    parts[1] = { ...parts[1]!, group: 'back-wall' };
    parts.push({
      id: 'header-stripes',
      name: 'Door header stripes',
      mesh: serialize(buildHeaderStripes(m, d)),
      color: stripe,
      group: 'back-wall',
      orientation: PRINT_FRONT_UP,
      orientationNote: 'Prints on the face of the beam over the doorway.',
    });
  }
  if (d.room) {
    parts[2] = { ...parts[2]!, group: 'left-wall' };
    parts.push({
      id: 'glass',
      name: 'Control room glass',
      mesh: serialize(buildGlass(m, d)),
      color: String(p.glassColor),
      group: 'left-wall',
      orientation: PRINT_POS_X_UP,
      orientationNote: 'An inlay in the window pocket. The mullions bridge over it.',
    });
  }
  const pipes = buildPipes(m, d);
  if (pipes) {
    parts[2] = { ...parts[2]!, group: 'left-wall' };
    parts.push({
      id: 'pipes',
      name: 'Wall pipes',
      mesh: serialize(pipes),
      color: String(p.pipeColor),
      group: 'left-wall',
      orientation: PRINT_POS_X_UP,
      orientationNote: 'Half-round, flat side down on the wall.',
    });
  }

  if (d.door) {
    const names = d.leaves === 2 ? ['Door leaf, left', 'Door leaf, right'] : ['Door'];
    d.leafSpans.forEach((_, i) => {
      const group = d.hazard ? `door-${i}` : undefined;
      parts.push({
        id: `door-${i}`,
        name: names[i]!,
        mesh: serialize(buildLeaf(m, d, i)),
        color: String(p.doorColor),
        group,
        orientation: PRINT_FRONT_UP,
        orientationNote: 'Print flat, armour up. Slide it into the track from the end before the side walls go on.',
      });
      if (d.hazard) {
        parts.push({
          id: `door-${i}-stripes`,
          name: `${names[i]!} stripes`,
          mesh: serialize(buildLeafStripes(m, d, i)),
          color: stripe,
          group,
          orientation: PRINT_FRONT_UP,
          orientationNote: 'Prints on the foot of the door leaf.',
        });
      }
    });
  }

  if (d.roofRailing) {
    parts.push({
      id: 'roof-railing',
      name: 'Control room railing',
      mesh: serialize(buildRoofRailing(m, d)),
      color: yellow,
      orientation: PRINT_NEG_X_UP,
      orientationNote: 'Print flat. Push its pegs into the holes along the front of the control room roof.',
    });
  }

  if (d.railing) {
    parts.push({
      id: 'railing',
      name: 'Catwalk railing',
      mesh: serialize(buildRailing(m, d)),
      color: yellow,
      orientation: PRINT_NEG_X_UP,
      orientationNote: 'Print flat. Push its pegs into the holes along the edge of the catwalk.',
    });
  }
  const pinColor = String(p.pinColor);
  const pin = (id: string, name: string, x: number, y: number, [z0, z1]: [number, number]) => {
    if (!d.printedPins) return;
    parts.push({
      id,
      name,
      mesh: serialize(buildPin(m, d, x, y, z0, z1)),
      color: pinColor,
      orientation: PRINT_FLIPPED,
      orientationNote: 'Print standing on its head.',
    });
  };
  if (d.bridge) {
    parts.push({
      id: 'bridge',
      name: 'Swing bridge',
      mesh: serialize(buildBridge(m, d)),
      color: accent,
      orientationNote: 'Print flat, deck down. It sits on the catwalk and swings on a pin.',
    });
    pin('bridge-pin', 'Bridge pin', d.pivot[0], d.pivot[1], bridgePinSpan(d));
  }

  if (d.tower) {
    parts.push({
      id: 'tower',
      name: 'Gantry tower',
      mesh: serialize(buildTower(m, d)),
      color: yellow,
      orientationNote: 'Print standing up, as it stands in the hangar. The beams bridge between the posts and the braces climb at 45 degrees.',
    });
    if (d.jib) {
      parts.push({
        id: 'house',
        name: d.craneCab ? 'Crane house and cab' : 'Crane house',
        mesh: serialize(buildHouse(m, d)),
        color: accent,
        group: 'house',
        orientationNote: 'Print upright, deck down. It turns on the pin at the top of the tower, cab and boom together.',
      });
      parts.push({
        id: 'house-lights',
        name: 'Crane light strip',
        mesh: serialize(buildHouseLights(m, d)),
        color: String(p.glassColor),
        group: 'house',
        orientationNote: 'An inlay round the back of the counterweight.',
      });
      if (d.craneCab) {
        parts.push({
          id: 'cab-glass',
          name: 'Operator cab glass',
          mesh: serialize(buildCabGlass(m, d)),
          color: String(p.glassColor),
          group: 'house',
          orientationNote: 'An inlay round the front of the cab, behind its pillars.',
        });
      }
      pin('jib-pin', 'Turntable pin', d.towerX, d.railY, jibPinSpan(d));
      parts.push({
        id: 'jib',
        name: 'Crane boom',
        mesh: serialize(buildBoom(m, d)),
        color: accent,
        orientation: PRINT_ARM_FLAT,
        orientationNote: 'Print flat, on its side. It tips up and down on its hinge pin.',
      });
      if (d.printedPins) {
        parts.push({
          id: 'boom-pin',
          name: 'Boom hinge pin',
          mesh: serialize(buildBoomPin(m, d)),
          color: String(p.pinColor),
          orientation: PRINT_ARM_PIN,
          orientationNote: 'Print standing on its head.',
        });
      }
    }
    if (d.robotArm) {
      const pose = armPose(d);
      const flat = 'Print flat. It turns on pins, snug enough to hold a pose.';
      const links: [string, string, Manifold][] = [
        ['arm-upper', 'Robot upper arm', buildUpperArm(m, d)],
        ['arm-fore', 'Robot forearm', buildForearm(m, d)],
        ['arm-wrist', 'Robot wrist', buildWrist(m, d)],
        ['claw-0', 'Claw finger, left', buildClaw(m, d, 0)],
        ['claw-1', 'Claw finger, right', buildClaw(m, d, 1)],
      ];
      for (const [id, name, solid] of links) {
        parts.push({ id, name, mesh: serialize(solid), color: yellow, orientation: PRINT_ARM_FLAT, orientationNote: flat });
      }
      if (d.printedPins) {
        const joints: [string, string, readonly [number, number], number][] = [
          ['pin-shoulder', 'Shoulder pin', pose.S, pose.yBracket[0]],
          ['pin-elbow', 'Elbow pin', pose.E, pose.yB[0]],
          ['pin-wrist', 'Wrist pin', pose.W, pose.yB[0]],
          ['pin-claw-0', 'Claw pin, left', pose.F[0], pose.yB[0]],
          ['pin-claw-1', 'Claw pin, right', pose.F[1], pose.yB[0]],
        ];
        for (const [id, name, at, y0] of joints) {
          parts.push({
            id, name,
            mesh: serialize(buildArmPin(m, d, at, y0)),
            color: String(p.pinColor),
            orientation: PRINT_ARM_PIN,
            orientationNote: 'Print standing on its head.',
          });
        }
      }
    }
  }
  if (d.legs) {
    parts.push({
      id: 'catwalk-legs',
      name: 'Catwalk supports',
      mesh: serialize(buildCatwalkLegs(m, d)),
      color: String(p.stairColor),
      orientation: [0, 90, 0],
      orientationNote: 'Print flat. Its pegs go up into the walkway and down into the floor.',
    });
  }
  const st = stairsOf(p, d);
  if (st) addStairs(parts, m, st, String(p.stairColor), String(p.stairRailColor));
  const cl = clawOf(p, d);
  if (cl) addClaw(m, parts, cl, String(p.clawColor), String(p.chainColor), String(p.pinColor), d.printedPins);

  if (d.ceiling) {
    parts.push({
      id: 'ceiling',
      name: 'Ceiling frame',
      mesh: serialize(buildCeiling(m, d)),
      color: String(p.ceilingColor),
      orientation: PRINT_FLIPPED,
      orientationNote: 'Print upside down, so the top beams lie flat on the bed. It sits on the wall tops, its pegs in their holes.',
    });
    const column = buildColumn(m, d);
    if (column) {
      parts.push({
        id: 'column',
        name: 'Corner column',
        mesh: serialize(column),
        color: String(p.ceilingColor),
        orientation: PRINT_ARM_FLAT,
        orientationNote: 'Print lying down, flanges standing. It stands in a socket in the base and holds up the ceiling\'s open corner.',
      });
    }
    // Anything that reaches up into the lamps or the frame.
    const under = d.wallTop - (d.ceilingLights ? 3.4 : 0.2);
    const tall = parts.filter((x) => ['house', 'jib', 'tower'].includes(x.id) && x.mesh.bbox.max[2] > under);
    if (tall.length > 0) {
      issues.push({
        level: 'warn',
        message: `The ${tall.map((x) => x.name.toLowerCase()).join(' and ')} reach${tall.length === 1 ? 'es' : ''} up into the ceiling. Lower the boom or the tower, or raise the walls.`,
        paramIds: ['boomAngle', 'towerHeight', 'wallHeight'],
      });
    }
  }
  return { parts, issues, readouts: readouts(d) };
}

export const hangarGenerator: Generator = {
  id: 'hangar',
  name: 'Mobile suit hangar',
  description:
    'A maintenance bay diorama for a Gunpla kit: base, walls, a sliding hangar door, a catwalk with a swing bridge and a gantry tower that rolls along the floor.',
  tagline: 'A hangar bay for your Gunpla, with parts that move',
  highlights: [
    'Sized for 1/144 HG and RG or 1/100 MG kits',
    'Shutter door that slides open in a dovetail track',
    'Catwalk with railing, ladder and a swing-out access bridge',
    'Gantry tower that slides on a floor rail, with a swinging crane arm',
    'Walls plug into the base, everything prints without supports',
  ],
  art: `<svg viewBox="0 0 120 96" role="img" aria-hidden="true">
    <rect x="10" y="80" width="100" height="10" rx="2" fill="#2b2d31"/>
    <rect x="14" y="10" width="92" height="70" fill="#8b96a3"/>
    <rect x="14" y="10" width="10" height="70" fill="#6f7a86"/>
    <rect x="42" y="26" width="16" height="54" fill="#5d6875"/><rect x="60" y="26" width="16" height="54" fill="#5d6875"/>
    <g stroke="#4a545f" stroke-width="1"><path d="M44 34h12M44 42h12M44 50h12M44 58h12M44 66h12M62 34h12M62 42h12M62 50h12M62 58h12M62 66h12"/></g>
    <rect x="24" y="46" width="16" height="3" fill="#6f7a86"/>
    <path d="M24 46v-6M30 46v-6M36 46v-6M24 40h16" stroke="#f0b323" stroke-width="1.5" fill="none"/>
    <rect x="38" y="46" width="22" height="2.5" fill="#e8692a"/>
    <g stroke="#f0b323" stroke-width="2" fill="none"><path d="M86 80V22M98 80V22M86 22h12M86 34h12M86 46h12M86 58h12M86 70h12M86 34l12 12M98 46l-12 12M86 58l12 12"/></g>
    <path d="M92 20H64" stroke="#e8692a" stroke-width="3"/><path d="M67 20v12" stroke="#2b2d31" stroke-width="1"/><rect x="65" y="32" width="4" height="4" fill="#2b2d31"/>
  </svg>`,
  family: { id: 'hangar', label: 'Hangar 1' },
  params: hangarParams,
  groups: hangarGroups,
  plateGap: 6,
  validate,
  build,
  presets: [
    {
      label: '1/144 HG or RG',
      values: {},
    },
    {
      label: '1/100 MG',
      values: {
        bayWidth: 240, bayDepth: 170, wallHeight: 240, baseHeight: 14,
        doorWidth: 104, doorHeight: 190, catwalkHeight: 130, catwalkDepth: 30,
        bridgeLength: 65, towerHeight: 200, towerWidth: 26, jibLength: 70,
        stairScale: '100', stairSpan: 46, stairHeight: 120, clawDrop: 55,
      },
    },
    {
      label: 'Open bay, no door',
      values: { door: false, sideWalls: 'left', wallStyle: 'ribs' },
    },
    {
      label: 'Enclosed, both walls',
      values: { sideWalls: 'both', doorLeaves: '2' },
    },
  ],
};
