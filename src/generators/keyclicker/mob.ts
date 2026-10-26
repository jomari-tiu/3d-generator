import type { CrossSection, Manifold } from 'manifold-3d';
import { serialize } from '../../core/kernel/serialize';
import { choice, num } from '../../core/params/dsl';
import type { BuildCtx, BuildResult, Generator, Issue, ParamGroup, Params, ParamSpec, Part } from '../../core/params/types';
import { defaultsOf } from '../../core/params/validate';
import { keyClickerGenerator } from './build';
import { derive, type Derived } from './geometry';
import { MOBS, type Mob } from './mobs';
import { buildBase } from './parts/base';
import { buildDome, buildKeycap } from './parts/keycap';
import { keyClickerParams } from './schema';

/**
 * A one-key clicker as a blocky mob: the body is a cube, the keycap is the
 * mob's head pushed into its front, and the face is pixel art inlaid flush in
 * up to four colours.
 *
 * Mechanically it IS a one-key clicker -- the same switch, plate, cavity and
 * stem -- built switch-up as the key clicker always is, and only TURNED in the
 * assembled view so the head faces forward. Building it the clicker's way up
 * is what lets every part print the way it already prints: the body back-down
 * with its opening to the sky, the head face-down so the pixels are its first
 * layers.
 */

/** Extra body above the key, so the head sits low on the front as a mob's does. */
const ABOVE = 4;
/** Corner radius on the cube and the head: blocky, not sharp. */
const BLOCK_CORNER = 0.8;
/** Pixels across the face. */
const GRID = 8;

/** Turn the clicker's +Z (where the key points) to the front, -Y, and its +Y up. */
const FACE_FORWARD: readonly number[] = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1];

const mobGroups: readonly ParamGroup[] = [
  { id: 'mob', label: 'Mob', tab: 'Mob' },
  { id: 'switch', label: 'Switch', tab: 'Mob' },
  { id: 'cap', label: 'Head', tab: 'Shape' },
  { id: 'body', label: 'Body', tab: 'Shape' },
  { id: 'look', label: 'Material', tab: 'Output' },
  { id: 'tol', label: 'Tolerances', tab: 'Output', collapsed: true },
  { id: 'printer', label: 'Printer', tab: 'Output', collapsed: true },
];

/** The key clicker's own controls that still mean something on a mob, reworded where they need it. */
const SHARED: Readonly<Record<string, Partial<ParamSpec>>> = {
  switchType: {},
  travel: {},
  domeDiameter: {},
  domeHeight: {},
  capHeight: { label: 'Head depth', help: 'How far the head stands out of the body, plus what of it sits inside.' },
  keyDepth: { label: 'Head sunk by', help: 'How much of the head the body hides at rest.' },
  keyGap: {},
  wall: {},
  keyring: { label: 'Keyring hole', help: 'A channel through the top back corner of the body, from the top face out the back.' },
  loopDiameter: { label: 'Keyring hole size' },
  material: {},
  coverColor: {},
  partClearance: {},
  stemClearance: {},
  fitOffset: {},
  nozzle: {},
  layer: {},
  bedX: {},
  bedY: {},
};

const mobParams: readonly ParamSpec[] = [
  choice('mob', 'Mob', {
    group: 'mob',
    default: 'creeper',
    content: true,
    options: Object.entries(MOBS).map(([value, m]) => ({ value, label: m.label })),
    help: 'The face, and the colour of the head and the body it pushes into.',
  }),
  num('faceDepth', 'Face depth', {
    group: 'mob',
    unit: 'mm',
    min: 0.4,
    max: 1.6,
    step: 0.1,
    default: 0.6,
    help: 'How deep the face pixels are inlaid. At least three layers, or a colour will not cover what is under it.',
  }),
  ...keyClickerParams
    .filter((spec) => spec.id in SHARED)
    .map((spec) => ({ ...spec, ...SHARED[spec.id] }) as ParamSpec),
];

/**
 * The key clicker's parameters for this mob: one key, a flat-topped blocky
 * cap with an inlay's worth of roof, a cell body, and a back deep enough that
 * the body comes out a cube.
 */
function keyParams(p: Params): Params {
  const base: Params = {
    ...defaultsOf(keyClickerGenerator),
    ...p,
    text: 'M',
    // Not drawn -- the face is -- but it sizes the cap's roof for an inlay.
    legendStyle: 'inlay',
    legendDepth: Number(p.faceDepth),
    baseStyle: 'cells',
    topCurve: 0,
    capRound: 0,
    capTaper: 0,
    capCorner: BLOCK_CORNER,
    cellRound: 0,
    keyring: false,
  };
  const d = derive(base);
  return { ...base, floorExtra: Math.max(0, d.cell - d.baseH) };
}

/** The clicker's derived body, made a cube taller by ABOVE, with square edges. */
function mobDerived(p: Params): Derived {
  const d = derive(keyParams(p));
  return {
    ...d,
    bodyPieces: [{ x: 0, y: ABOVE / 2, w: d.cell, h: d.cell + ABOVE, corner: BLOCK_CORNER }],
    chamfer: 0,
  };
}

/**
 * The keyring channel: down from the top face and in from the back, meeting
 * inside the top back corner. Kept in the solid band above the pocket and
 * behind the cavity, so the ring never reaches the switch.
 */
function keyringChannel(ctx: BuildCtx, d: Derived): Manifold {
  const { m } = ctx;
  const r = Math.min(d.loopD, 3.4) / 2;
  const top = d.cell / 2 + ABOVE;
  const x = -d.cell / 2 + d.wallT + r + 1;
  // Centre of the turn: in the slab above the pocket, and in the floor.
  const y = top - Math.max(r + 1, (top - d.pocket / 2) / 2);
  const z = Math.min(d.floorT - r - 0.6, r + 1.4);
  const down = m.Manifold.cylinder(top - y + 1, r, r, 32)
    .rotate([-90, 0, 0])
    .translate([x, y, z]);
  const back = m.Manifold.cylinder(z + 1, r, r, 32).translate([x, y, -1]);
  const turn = m.Manifold.sphere(r, 32).translate([x, y, z]);
  return m.Manifold.union([down, back, turn]);
}

/** One colour's pixels, as a section on the head's face. */
function pixels(ctx: BuildCtx, mob: Mob, letter: string, size: number): CrossSection | null {
  const { m } = ctx;
  const px = size / GRID;
  const squares: CrossSection[] = [];
  mob.face.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch !== letter) return;
      squares.push(
        m.CrossSection.square([px, px], true).translate([-size / 2 + (c + 0.5) * px, size / 2 - (r + 0.5) * px]),
      );
    });
  });
  return squares.length > 0 ? m.CrossSection.union(squares) : null;
}

function build(p: Params, ctx: BuildCtx): BuildResult {
  const issues: Issue[] = [];
  const mob = MOBS[String(p.mob)] ?? MOBS.creeper!;
  const d = mobDerived(p);

  let body = buildBase(ctx, d);
  if (p.keyring === true) body = body.subtract(keyringChannel(ctx, d));

  const parts: Part[] = [
    {
      id: 'body',
      name: `${mob.label} body`,
      mesh: serialize(body),
      color: mob.body,
      pose: FACE_FORWARD,
      orientationNote:
        'Print back-down, as laid out, with the opening for the head facing up. The plate bridges the switch cavity once.',
    },
  ];

  // The head: a flat-topped keycap with each of the face's colours cut a face
  // depth into it and given back as its own body. Intersected, not trimmed,
  // so every pixel is exactly flush with the face around it.
  const { cap } = buildKeycap(ctx, d, null);
  const seat: [number, number, number] = [0, 0, d.plateTop + d.capRest];
  const depth = d.legendDepth;
  const cutters = Object.keys(mob.palette)
    .filter((ch) => ch !== mob.base)
    .map((ch) => {
      const area = pixels(ctx, mob, ch, d.capTopSize);
      return area ? { ch, cutter: area.extrude(depth + 1).translate([0, 0, d.capH - depth]) } : null;
    })
    .filter((c): c is { ch: string; cutter: Manifold } => c !== null);

  const headNote = 'Print face-down, as laid out: the face is the first layers, one filament per colour. The stem hangs off the back, so face-down it needs no support.';
  let head = cap;
  for (const { cutter } of cutters) head = head.subtract(cutter);
  parts.push({
    id: 'head',
    name: `${mob.label} head`,
    mesh: serialize(head),
    color: mob.palette[mob.base]!,
    group: 'head',
    assembly: seat,
    pose: FACE_FORWARD,
    orientation: [180, 0, 0],
    orientationNote: headNote,
  });
  for (const { ch, cutter } of cutters) {
    parts.push({
      id: `face-${ch}`,
      name: `${mob.label} ${(mob.names[ch] ?? 'face').toLowerCase()}`,
      mesh: serialize(cap.intersect(cutter)),
      color: mob.palette[ch]!,
      group: 'head',
      assembly: seat,
      pose: FACE_FORWARD,
      orientation: [180, 0, 0],
      orientationNote: headNote,
    });
  }

  if (d.sw.stem === 'post') {
    parts.push({
      id: 'dome',
      name: 'Snap dome',
      mesh: serialize(buildDome(ctx, d)),
      color: String(p.coverColor),
      assembly: [0, 0, d.plateTop - d.wellDepth - d.domeH - 0.4],
      pose: FACE_FORWARD,
      orientationNote: 'Print apex up - a shallow cone supports itself.',
    });
  } else {
    issues.push({
      level: 'warn',
      message: `You will need one ${d.sw.label} switch. Push it into the opening in the front until both clips snap under the plate, then press the head on.`,
      paramIds: ['switchType'],
    });
  }

  const colours = new Set([mob.body, ...Object.values(mob.palette)]).size;
  return {
    parts,
    issues,
    readouts: {
      Body: `${d.cell.toFixed(1)} wide x ${(d.cell + ABOVE).toFixed(1)} tall x ${d.baseH.toFixed(1)} deep mm`,
      Head: `${d.keySize.toFixed(1)} mm square, ${(d.capTopSize / GRID).toFixed(2)} mm pixels`,
      Colours: `${colours} - one filament each`,
    },
  };
}

export const mobClickerGenerator: Generator = {
  id: 'mob-clicker',
  name: 'Mob clicker',
  family: { id: 'keyclicker', label: 'Mob' },
  description:
    'A one-key clicker as a blocky pixel mob: push its head into its body and it clicks. Creeper, pig, sheep, spider, zombie, skeleton, cow or wolf.',
  tagline: 'Push its head in - it clicks',
  highlights: [
    'Eight blocky mobs, 8 x 8 pixel faces',
    'Faces inlaid flush in up to four colours, for a multi-colour printer',
    'Cherry MX, Kailh Choc, or a fully printed dome',
    'Keyring channel hidden in the top back corner',
    'Body and head both print without supports',
  ],
  art: `<svg viewBox="0 0 120 96" role="img" aria-hidden="true">
    <rect x="30" y="14" width="56" height="62" rx="3" fill="#2f8f3b"/>
    <rect x="34" y="18" width="48" height="54" rx="2" fill="#3fae49"/>
    <rect x="40" y="34" width="36" height="36" rx="2" fill="#4cc257" stroke="#2a7a34" stroke-width="1.4"/>
    <g fill="#161616">
      <rect x="44.5" y="43" width="9" height="9"/><rect x="62.5" y="43" width="9" height="9"/>
      <rect x="53.5" y="52" width="9" height="4.5"/><rect x="49" y="56.5" width="18" height="9"/>
      <rect x="49" y="65.5" width="4.5" height="4.5"/><rect x="62.5" y="65.5" width="4.5" height="4.5"/>
    </g>
    <circle cx="38" cy="22" r="2.4" fill="#1d5c25"/>
  </svg>`,
  params: mobParams,
  groups: mobGroups,
  validate: (p) => keyClickerGenerator.validate?.(keyParams(p)) ?? [],
  build,
};
