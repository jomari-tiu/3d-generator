import { serialize } from '../../core/kernel/serialize';
import type { BuildCtx, BuildResult, Generator, Issue, Params, Part } from '../../core/params/types';
import { clawLayout } from '../shared/claw';
import { addClaw, addStairs } from '../shared/parts';
import { stairCheck, stairLayout } from '../shared/stairs';
import { CABIN_H, COLUMN, derive, type Derived } from './geometry';
import {
  buildBackFrame, buildBase, buildBaseStripes, buildCabin, buildCabinGlass, buildColumn, buildGallery,
  buildTopFrame, clawSpec, columns,
} from './parts';
import { cageGroups, cageParams } from './schema';

const fmt = (n: number) => n.toFixed(0);

function fits(d: Derived, w: number, h: number): boolean {
  return (w <= d.bedX && h <= d.bedY) || (w <= d.bedY && h <= d.bedX);
}

function clawOf(p: Params, d: Derived) {
  return p.ceilingClaw === true ? clawSpec(d, Number(p.clawDrop)) : null;
}

function validate(p: Params): Issue[] {
  const d = derive(p);
  const issues: Issue[] = [];
  const err = (message: string, paramIds: string[]) => issues.push({ level: 'error', message, paramIds });
  const bed = `your ${d.bedX} x ${d.bedY} mm bed`;

  if (!fits(d, d.W + (d.joined ? 10 : 0), d.D + 12)) {
    err(`The base is ${fmt(d.W)} x ${fmt(d.D)} mm with its feet, bigger than ${bed}.`, ['cageWidth', 'cageDepth']);
  }
  if (!fits(d, d.columnTop, COLUMN + 4)) err(`The columns print lying down and are ${fmt(d.columnTop)} mm long, longer than ${bed}.`, ['cageHeight']);
  if (d.cyB - d.cyF < COLUMN + 40) err('The dock is too shallow for its galleries and a kit between the columns. Make it deeper.', ['cageDepth']);
  if (-2 * d.gxi < 50) err('The galleries leave less than 50 mm between them for the kit. Make the dock wider or the galleries narrower.', ['cageWidth', 'galleryWidth']);

  if (d.stairs) {
    const [s] = d.stairs;
    const L = stairLayout(s);
    if (L.run < 4 * L.sizes.tread) {
      err('The stair towers are too narrow for flights between their landings. Make them wider.', ['stairSpan']);
    } else {
      const chk = stairCheck(s);
      if (chk.headroom < chk.needed) {
        err(`At ${fmt(s.x1 - s.x0)} mm wide the flights are too short to give a 1/${s.scale} figure 2 m of headroom under the flight above. Make the towers wider.`, ['stairSpan', 'stairScale']);
      }
    }
    if (2 * (s.x1 - s.x0) > d.W - 20) err('The two stair towers meet in the middle. Make them narrower.', ['stairSpan', 'cageWidth']);
    if (d.levels.length === 0) err('The stair towers are too low to reach a gallery. Make them taller.', ['stairHeight']);
    if (s.zFloor + s.height + d.railH > d.columnTop - 1) err('The stair towers reach the top frame. Make them lower.', ['stairHeight', 'cageHeight']);
  }
  const top = d.levels.length > 0 ? d.levels[d.levels.length - 1]! : d.baseH;
  if (top + (d.cabin ? CABIN_H + 2 : d.railH) + 2 > d.columnTop - 2) {
    err('The top gallery and what stands on it reach the top frame. Make the stairs lower or the dock taller.', ['stairHeight', 'cageHeight']);
  }
  const cl = clawOf(p, d);
  if (cl && clawLayout(cl).hubBottom - 20 < d.baseH + 10) err('The claw hangs down to the floor. Shorten its chain.', ['clawDrop']);
  return issues;
}

function readouts(d: Derived): Record<string, string> {
  const out: Record<string, string> = {
    Footprint: `${fmt(d.W)} x ${fmt(d.D)} mm, ${fmt(d.H)} mm tall`,
    'Between the galleries': `${fmt(-2 * d.gxi)} mm`,
    Galleries: `${d.levels.map((z) => fmt(z - d.baseH)).join(', ')} mm above the floor`,
  };
  if (d.stairs) {
    const c = stairCheck(d.stairs[0]);
    out.Stairs = `${c.flights} flights a side, ${c.realRise.toFixed(0)} cm steps at 1/${c.scale}`;
  }
  if (d.joined) out.Joining = 'keys on the right, sockets on the left: press the next dock on from above';
  return out;
}

function build(p: Params, ctx: BuildCtx): BuildResult {
  const { m } = ctx;
  const d = derive(p);
  const issues = validate(p);
  if (issues.some((i) => i.level === 'error')) return { parts: [], issues, readouts: readouts(d) };

  const frame = String(p.frameColor);
  const parts: Part[] = [
    {
      id: 'base',
      name: 'Base',
      mesh: serialize(buildBase(m, d)),
      color: String(p.baseColor),
      group: d.hazard ? 'base' : undefined,
      orientationNote: d.joined ? 'Print flat. Its keys on the right press down into the next dock\'s sockets.' : 'Print flat.',
    },
  ];
  if (d.hazard) {
    parts.push({
      id: 'base-stripes', name: 'Floor markings', mesh: serialize(buildBaseStripes(m, d)),
      color: String(p.stripeColor), group: 'base', orientationNote: 'An inlay, flush in the floor.',
    });
  }
  const names = ['Column, front left', 'Column, front right', 'Column, back left', 'Column, back right'];
  columns(d).forEach((c, i) => {
    parts.push({
      id: `column-${i + 1}`,
      name: names[i]!,
      mesh: serialize(buildColumn(m, d, c)),
      color: frame,
      orientation: c[0] < 0 ? [0, 90, 0] : [0, -90, 0],
      orientationNote: 'Print lying on its inner face, the panels up.',
    });
  });
  parts.push({
    id: 'top-frame',
    name: 'Top frame',
    mesh: serialize(buildTopFrame(m, d)),
    color: frame,
    orientation: [180, 0, 0],
    orientationNote: 'Print upside down, the top chords on the bed. Its pegs go down into the columns.',
  });
  if (d.backFrame) {
    parts.push({
      id: 'back-frame', name: 'Back frame', mesh: serialize(buildBackFrame(m, d)),
      color: String(p.backColor), orientation: [90, 0, 0],
      orientationNote: 'Print flat. It stands in the base and pegs up into the top frame.',
    });
  }

  const bayW = d.stairs ? stairLayout(d.stairs[0]).bay : 0;
  for (const side of [-1, 1] as const) {
    d.levels.forEach((z, i) => {
      parts.push({
        id: `gallery-${side < 0 ? 'left' : 'right'}-${i + 1}`,
        name: `${side < 0 ? 'Left' : 'Right'} gallery ${i + 1}`,
        mesh: serialize(buildGallery(m, d, side, z, bayW)),
        color: String(p.galleryColor),
        orientationNote: 'Print flat, deck down, the rails standing. Its pegs push into the columns.',
      });
    });
  }
  if (d.cabin && d.levels.length > 0) {
    parts.push({
      id: 'cabin', name: 'Operator cabin', mesh: serialize(buildCabin(m, d)),
      color: String(p.cabinColor), group: 'cabin',
      orientationNote: 'Print upright. Its pegs go into the top right gallery.',
    });
    parts.push({
      id: 'cabin-glass', name: 'Cabin glass', mesh: serialize(buildCabinGlass(m, d)),
      color: String(p.glassColor), group: 'cabin', orientationNote: 'An inlay round the cabin front, behind its corner pillars.',
    });
  }
  if (d.stairs) {
    const [left, right] = d.stairs;
    addStairs(parts, m, left, String(p.stairColor), String(p.stairRailColor), 'left');
    addStairs(parts, m, right, String(p.stairColor), String(p.stairRailColor), 'right');
  }
  const cl = clawOf(p, d);
  if (cl) addClaw(m, parts, cl, String(p.clawColor), String(p.chainColor), String(p.pinColor), d.printedPins);
  return { parts, issues, readouts: readouts(d) };
}

export const msCageGenerator: Generator = {
  id: 'ms-cage',
  name: 'MS dock',
  description:
    'A walk-around maintenance dock for a Gunpla kit: four columns and a truss frame over it, galleries stacked down both sides, a stair tower at each front corner opening onto them, an operator cabin, and a claw hanging from the hoist over the kit. Bases key together side by side into a row.',
  tagline: 'A maintenance dock the crew can walk round',
  highlights: [
    'Sized for 1/100 MG or 1/144 HG kits',
    'Galleries down both sides, one at every other landing of the stairs',
    'Stair towers built to the crew\'s scale, with headroom over every flight',
    'A claw on a chain from the hoist over the kit, that opens and closes',
    'Bases join side to side with dovetail keys; everything prints without supports',
  ],
  art: `<svg viewBox="0 0 120 96" role="img" aria-hidden="true">
    <rect x="10" y="82" width="100" height="8" rx="2" fill="#4a525b"/>
    <rect x="14" y="10" width="7" height="72" fill="#8a6a4a"/><rect x="99" y="10" width="7" height="72" fill="#8a6a4a"/>
    <rect x="12" y="6" width="96" height="7" fill="#8a6a4a"/>
    <path d="M14 13l6-7 6 7 6-7 6 7 6-7 6 7 6-7 6 7 6-7 6 7 6-7 6 7 6-7 6 7 6-7" stroke="#5e4630" stroke-width="1.2" fill="none"/>
    <path d="M60 13v18" stroke="#9aa3ad" stroke-width="1.2"/><path d="M56 34l4-3 4 3M55 39l1-5M65 39l-1-5" stroke="#3a4048" stroke-width="1.6" fill="none"/>
    <g fill="#d08a35"><rect x="14" y="36" width="22" height="3"/><rect x="14" y="54" width="22" height="3"/><rect x="84" y="28" width="22" height="3"/><rect x="84" y="46" width="22" height="3"/><rect x="84" y="64" width="22" height="3"/></g>
    <g stroke="#d08a35" stroke-width="1" fill="none"><path d="M14 36v-5h22v5M14 54v-5h22v5M84 46v-5h22v5M84 64v-5h22v5"/></g>
    <rect x="88" y="16" width="14" height="12" fill="#e8e2d0"/><rect x="90" y="18" width="10" height="5" fill="#5fb8ee"/>
    <path d="M14 82l6-8h6l6-8h6l6-8" stroke="#f0b323" stroke-width="1.6" fill="none"/>
    <path d="M106 82l-6-8h-6l-6-8h-6" stroke="#f0b323" stroke-width="1.6" fill="none"/>
  </svg>`,
  family: { id: 'hangar', label: 'Hangar 2' },
  params: cageParams,
  groups: cageGroups,
  plateGap: 6,
  validate,
  build,
  presets: [
    { label: '1/100 MG', values: {} },
    {
      label: '1/144 HG',
      values: { cageWidth: 160, cageDepth: 140, cageHeight: 180, galleryWidth: 18, stairScale: '144', stairSpan: 40, stairHeight: 95, clawDrop: 15 },
    },
    { label: 'No stairs', values: { stairs: false, galleryLevels: 3 } },
  ],
};
