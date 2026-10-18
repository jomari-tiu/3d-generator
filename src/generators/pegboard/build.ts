import { serialize } from '../../core/kernel/serialize';
import type { BuildCtx, BuildResult, Generator, Issue, Params, Part } from '../../core/params/types';
import { box, cylinderX, cylinder, type M } from '../shared/solid';
import {
  buildCableHolder, buildContainer, buildController, buildHeadphone, buildHook, buildPhoneStand, buildShelf,
  type Accessory, type HookStyle,
} from './accessories';
import { buildBoltPreview, buildClampBody, buildJawPad, buildNut, buildScrew, buildSwivel, CLAMP_PRINT } from './clamp';
import { derive, HARDWARE, PEG, RAIL, TRAY_WALL, type Derived } from './geometry';
import { buildPanel, dowelLength, dowelR, dowels, ribWidth, sections, splitPlan } from './panel';
import { pegboardGroups, pegboardParams } from './schema';
import { buildDivider, buildTray, dividerXs, traySections } from './tray';

const PRINT_FACE_DOWN: [number, number, number] = [90, 0, 0];
const COLLIDE = '#e5484d';

const PALETTES: Record<string, { panel: string; clamp: string; acc: string; pad: string }> = {
  black: { panel: '#26282c', clamp: '#35383e', acc: '#303338', pad: '#7d848c' },
  white: { panel: '#ecebe6', clamp: '#d6d3cc', acc: '#f6f5f1', pad: '#8a9199' },
  gray: { panel: '#8e939a', clamp: '#70757c', acc: '#a7acb3', pad: '#3f444a' },
};

function colours(p: Params) {
  const c = PALETTES[String(p.palette)];
  if (c) return c;
  return { panel: String(p.panelColor), clamp: String(p.clampColor), acc: String(p.accessoryColor), pad: '#7d848c' };
}

// --------------------------------------------------------------- accessories

/** One accessory on the board: what it is, which controls place it, and how to build it. */
interface Spec {
  readonly key: string;
  readonly name: string;
  readonly group: string;
  /** Top-left peg, zero-based. Undefined row means "count up from the bottom". */
  readonly col: number;
  readonly row: number;
  readonly fromBottom?: number;
  readonly centred?: boolean;
  readonly make: (m: M, d: Derived) => Accessory;
}

function specs(p: Params): Spec[] {
  const out: Spec[] = [];
  const n = (k: string) => Number(p[k]);
  const at = (g: string) => ({ col: Math.round(n(`${g}Col`)) - 1, row: Math.round(n(`${g}Row`)) - 1 });

  for (const g of ['hooksA', 'hooksB'] as const) {
    if (p[g] !== true) continue;
    const count = Math.round(n(`${g}Count`));
    const step = count > 1 ? Math.round(n(`${g}Spacing`)) : 1;
    const base = at(g);
    const o = { style: String(p[`${g}Style`]) as HookStyle, length: n(`${g}Length`), width: n(`${g}Width`), turn: n(`${g}Turn`) };
    for (let i = 0; i < count; i++) {
      out.push({
        key: `${g}-${i}`,
        name: `${g === 'hooksA' ? 'Hook' : 'Extra hook'} ${i + 1}`,
        group: g,
        col: base.col + i * step,
        row: base.row,
        make: (m, dd) => buildHook(m, dd, o),
      });
    }
  }
  if (p.headphone === true) {
    out.push({
      key: 'headphone', name: 'Headphone hook', group: 'headphone', ...at('headphone'),
      make: (m, dd) => buildHeadphone(m, dd, { length: n('headphoneLength'), width: n('headphoneWidth'), turn: n('headphoneTurn') }),
    });
  }
  if (p.cup === true) {
    out.push({
      key: 'cup', name: 'Cup holder', group: 'cup', ...at('cup'),
      make: (m, dd) => buildContainer(m, dd, { shape: 'round', inner: n('cupDiameter'), depth: n('cupDepth'), bottom: String(p.cupBottom) as 'drain' }),
    });
  }
  if (p.pen === true) {
    out.push({
      key: 'pen', name: 'Pen holder', group: 'pen', ...at('pen'),
      make: (m, dd) => buildContainer(m, dd, { shape: String(p.penShape) as 'round', inner: n('penSize'), depth: n('penHeight'), bottom: 'closed' }),
    });
  }
  if (p.phone === true) {
    out.push({
      key: 'phone', name: 'Phone stand', group: 'phone', ...at('phone'),
      make: (m, dd) => buildPhoneStand(m, dd, {
        width: n('phoneWidth'), thickness: n('phoneThickness'), angle: n('phoneAngle'), lip: n('phoneLip'), cableSlot: p.phoneCableSlot === true,
      }),
    });
  }
  if (p.cable === true) {
    out.push({
      key: 'cable', name: 'Cable holder', group: 'cable', ...at('cable'),
      make: (m, dd) => buildCableHolder(m, dd, { slots: Math.round(n('cableSlots')), diameter: n('cableDiameter'), reach: n('cableReach') }),
    });
  }
  if (p.shelf === true) {
    out.push({
      key: 'shelf', name: 'Small shelf', group: 'shelf', ...at('shelf'),
      make: (m, dd) => buildShelf(m, dd, { width: n('shelfWidth'), depth: n('shelfDepth'), lip: n('shelfLip') }),
    });
  }
  if (p.controller === true) {
    out.push({
      key: 'controller', name: 'Controller holder', group: 'controller', ...at('controller'),
      make: (m, dd) => buildController(m, dd, { span: n('controllerSpan'), reach: n('controllerReach'), armWidth: n('controllerArmWidth') }),
    });
  }
  if (p.bottom === true) {
    out.push({
      key: 'bottom', name: 'Bottom storage tray', group: 'bottom', col: 0, row: 0, fromBottom: Math.round(n('bottomRaise')), centred: true,
      make: (m, dd) => buildShelf(m, dd, { width: Math.min(n('bottomWidth'), dd.W), depth: n('bottomDepth'), lip: n('bottomLip'), centred: true }),
    });
  }
  return out;
}

interface Placed {
  readonly spec: Spec;
  readonly acc: Accessory;
  readonly at: readonly [number, number, number];
  readonly box: { x0: number; x1: number; z0: number; z1: number };
}

/**
 * Put every accessory on its holes and check it against the board and its
 * neighbours. Overlaps are measured on bounding boxes in the board's plane,
 * which is what decides whether two things can hang side by side.
 */
function place(m: M, d: Derived, list: readonly Spec[], issues: Issue[]): { placed: Placed[]; bad: Set<string> } {
  const placed: Placed[] = [];
  const bad = new Set<string>();
  const nCols = d.cols.length;
  const nRows = d.rows.length;
  const ids = (s: Spec) => (s.centred ? [s.group, 'bottomRaise', 'bottomWidth'] : [`${s.group}Col`, `${s.group}Row`]);

  for (const s of list) {
    const acc = s.make(m, d);
    const pegsN = acc.mounting.pegXs.length;
    const stub = acc.mounting.stubRow;
    const col = s.centred ? Math.max(0, Math.floor((nCols - pegsN) / 2)) : s.col;
    const row = s.fromBottom !== undefined ? nRows - 1 - s.fromBottom - stub : s.row;
    if (col < 0 || col + pegsN > nCols || row < 0 || row + stub >= nRows) {
      issues.push({
        level: 'error',
        message: `The ${s.name.toLowerCase()} needs ${pegsN} column${pegsN === 1 ? '' : 's'} and ${stub + 1} rows of holes from where it is, and the grid is ${nCols} x ${nRows}. Move it, or make the board bigger.`,
        paramIds: ids(s),
      });
      continue;
    }
    const x = (d.cols[col]! + d.cols[col + pegsN - 1]!) / 2;
    const z = d.rows[row]!;
    const bb = acc.body.boundingBox();
    placed.push({
      spec: s,
      acc,
      at: [x, d.yFront, z],
      box: { x0: bb.min[0] + x, x1: bb.max[0] + x, z0: bb.min[2] + z, z1: bb.max[2] + z },
    });
  }

  const eps = 0.3;
  for (const a of placed) {
    const b = a.box;
    if (b.x0 < -d.W / 2 - eps || b.x1 > d.W / 2 + eps || b.z0 < d.zBottom - eps || b.z1 > d.zTop + eps) {
      bad.add(a.spec.key);
      issues.push({
        level: 'error',
        message: `The ${a.spec.name.toLowerCase()} sticks out past the edge of the board. Move it in, or make it smaller.`,
        paramIds: ids(a.spec),
      });
    }
  }
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!.box;
      const b = placed[j]!.box;
      if (a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.z0 < b.z1 - eps && b.z0 < a.z1 - eps) {
        bad.add(placed[i]!.spec.key);
        bad.add(placed[j]!.spec.key);
        issues.push({
          level: 'error',
          message: `The ${placed[i]!.spec.name.toLowerCase()} and the ${placed[j]!.spec.name.toLowerCase()} overlap. Move one of them to another column or row.`,
          paramIds: [...ids(placed[i]!.spec), ...ids(placed[j]!.spec)],
        });
      }
    }
  }
  return { placed, bad };
}

// ---------------------------------------------------------------- validation

function validate(p: Params): Issue[] {
  const d = derive(p);
  const issues: Issue[] = [];
  const err = (message: string, paramIds: string[]) => issues.push({ level: 'error', message, paramIds });
  const warn = (message: string, paramIds: string[]) => issues.push({ level: 'warn', message, paramIds });

  const web = Math.min(d.px, d.pz) - d.holeD;
  if (web < 2 * d.nozzle) {
    err(`Holes ${d.holeD} mm wide on a ${Math.min(d.px, d.pz)} mm grid leave ${web.toFixed(1)} mm between them - under two nozzle widths. Space them out or make them smaller.`, ['holeD', 'pitchX', 'pitchZ']);
  } else if (web < 3) {
    warn(`Only ${web.toFixed(1)} mm of board between holes. It will print, but crack easily.`, ['holeD', 'pitchX', 'pitchZ']);
  }
  if (d.holeD - 2 * d.pinR < 1) {
    err(`Pegs are at least 3 mm thick, and a ${d.holeD} mm hole leaves them too little room to swing their bend through. Use holes of 4.5 mm or more.`, ['holeD']);
  }
  if (d.counterbore > 0 && d.counterbore > Math.min(d.px, d.pz) - 2) {
    err(`A ${d.pt} mm board is counterbored from behind to a ${d.land} mm hole so the hooks can turn through it, and ${d.counterbore.toFixed(1)} mm counterbores do not fit a ${Math.min(d.px, d.pz)} mm grid. Make the board ${d.land} mm or thinner, or space the holes out.`, ['panelThickness', 'pitchX', 'pitchZ']);
  }
  if (d.pt < 3 * d.layer || d.pt < 2 * d.nozzle) {
    err(`A ${d.pt} mm board is too thin to print solid. Use at least ${Math.max(3 * d.layer, 2 * d.nozzle).toFixed(1)} mm.`, ['panelThickness']);
  } else if (d.pt < 3) {
    warn(`A ${d.pt} mm board flexes under load. 4 mm is a safer face.`, ['panelThickness']);
  }
  if (d.cols.length === 0 || d.rows.length === 0) {
    err(
      d.mount === 'below'
        ? `The rail band at the top takes ${(d.header.z1 - d.header.z0).toFixed(0)} mm, leaving no room for a row of holes. Make the board taller.`
        : `No room for a row of holes above the rail band. Make the board taller.`,
      ['panelHeight', 'panelWidth'],
    );
  }
  if (d.ribs && ribWidth(d) === 0) {
    warn(`There is no room for ribs between ${d.holeD} mm holes at ${d.px} mm spacing, so the back is a frame only.`, ['backRibs', 'pitchX']);
  }

  // ---- clamp
  if (d.deskT > d.opening) {
    err(`A ${d.deskT} mm desk will not go into a ${d.opening} mm clamp opening. Open it to at least ${d.deskT} mm.`, ['deskThickness', 'clampOpening']);
  } else if (d.deskT < d.minDesk) {
    err(`The screw winds up ${d.travel} mm, so this clamp grips desks from ${d.minDesk.toFixed(1)} to ${d.opening} mm - not ${d.deskT} mm. Give the screw more travel or shrink the opening.`, ['deskThickness', 'screwTravel', 'clampOpening']);
  }
  if (d.travel > d.opening) {
    err(`${d.travel} mm of travel would wind the screw past the top jaw. Keep it under the ${d.opening} mm opening.`, ['screwTravel']);
  }
  if (d.spine - RAIL.depth < 4) {
    err(`The rail groove is ${RAIL.depth} mm deep, which leaves ${(d.spine - RAIL.depth).toFixed(1)} mm of a ${d.spine} mm spine behind it. Make the spine at least ${RAIL.depth + 4} mm.`, ['spineThickness']);
  }
  if (d.jawT < 5) {
    warn(`${d.jawT} mm jaws will bend when the screw is tightened. 6 mm or more is safer.`, ['jawThickness']);
  }
  if (d.clampCount * d.clampW > d.W) {
    err(`${d.clampCount} clamps ${d.clampW} mm wide do not fit along a ${d.W} mm board.`, ['clampCount', 'clampWidth', 'panelWidth']);
  }
  if (d.screw === 'printed' && d.clampW < d.nutAF / Math.sqrt(3) * 2 + 6) {
    err(`The printed nut is ${(2 * d.nutAF / Math.sqrt(3)).toFixed(0)} mm across its corners and needs a clamp at least ${(2 * d.nutAF / Math.sqrt(3) + 6).toFixed(0)} mm wide.`, ['clampWidth', 'clampScrew']);
  }

  // ---- tray
  if (d.tray) {
    const reach = d.trayY0 + d.trayD - TRAY_WALL;
    if (reach < d.pegY + PEG.r + d.clear + 1) {
      err(`The tray has to reach ${Math.ceil(d.pegY + PEG.r + TRAY_WALL + 2 - d.trayY0)} mm in over the desk to sit on the clamp pegs. Make it deeper.`, ['trayDepth']);
    }
    if (d.trayBase < 3 * d.layer) {
      warn(`A ${d.trayBase} mm tray floor is under three layers and may print with gaps.`, ['trayBase', 'layer']);
    }
    if (d.trayW > d.W + 120) {
      warn(`The tray overhangs the board by ${((d.trayW - d.W) / 2).toFixed(0)} mm each side and only rests on the clamps.`, ['trayWidth']);
    }
  }

  if (d.accWall < 2 * d.nozzle) {
    err(`${d.accWall} mm accessory walls are under two nozzle widths.`, ['accWall', 'nozzle']);
  }
  if (d.minWall < 2 * d.nozzle) {
    warn(`A ${d.minWall} mm minimum wall is under two ${d.nozzle} mm nozzle widths, so the thinnest walls print as single lines.`, ['minWall', 'nozzle']);
  }
  if (d.clear < 0.1) {
    warn(`${d.clear} mm clearance is tight for printed pegs and rails. Most printers want 0.2 mm or more.`, ['clearance']);
  }
  return issues;
}

// --------------------------------------------------------------------- build

function hardwareLine(d: Derived): string {
  const parts: string[] = [];
  if (d.screw !== 'printed') {
    const hw = HARDWARE[d.screw];
    const len = Math.ceil((d.bossH + d.travel + 10) / 5) * 5;
    parts.push(`${d.clampCount} x ${hw.label} x ${len} mm bolt and nut`);
  }
  if (d.lock) parts.push(`${d.clampCount} x M3 x 12 mm screw (rail lock)`);
  return parts.length ? parts.join(', ') : 'None - everything prints';
}

function build(p: Params, ctx: BuildCtx): BuildResult {
  const m = ctx.m;
  const d = derive(p);
  const blocking = validate(p);
  if (blocking.some((i) => i.level === 'error')) return { parts: [], issues: blocking, readouts: readouts(d, 0, 1) };

  const issues: Issue[] = [...blocking];
  const col = colours(p);
  const parts: Part[] = [];

  // ---- board
  const plan = splitPlan(d);
  const panel = buildPanel(m, d, plan);
  const secs = sections(m, d, panel, plan);
  const letters = 'ABCDEFGH';
  for (const s of secs) {
    const tag = secs.length === 1 ? '' : ` ${letters[s.row] ?? s.row + 1}${s.col + 1}`;
    parts.push({
      id: `panel-${s.row}-${s.col}`,
      name: `Pegboard${tag}`,
      mesh: serialize(s.body),
      color: col.panel,
      orientation: PRINT_FACE_DOWN,
      orientationNote: 'Print face down, as laid out: the holes stand upright and the rail and ribs rise off the back. No supports.',
      explode: secs.length > 1 ? [(s.col - (plan.xs.length) / 2) * 25, 0, (plan.zs.length / 2 - s.row) * 25] : undefined,
    });
  }
  if (secs.length > 1) {
    issues.push({
      level: 'warn',
      message: `The board is bigger than the bed, so it prints in ${secs.length} sections that dowel together along the seams.`,
      paramIds: ['panelWidth', 'panelHeight', 'bedX', 'bedY'],
    });
    const all = dowels(d, plan);
    for (const axis of ['x', 'z'] as const) {
      const these = all.filter((w) => w.axis === axis);
      if (!these.length) continue;
      const [x, y, z] = these[0]!.at;
      const len = dowelLength(d, axis);
      const r = dowelR(d) - d.clear / 2;
      const body = axis === 'x' ? cylinderX(m, r, y, z, x - len / 2, x + len / 2) : cylinder(m, r, x, y, z - len / 2, z + len / 2);
      parts.push({
        id: `dowel-${axis}`,
        name: axis === 'x' ? 'Seam dowel' : 'Level seam dowel',
        mesh: serialize(body),
        color: col.clamp,
        quantity: these.length,
        orientation: axis === 'x' ? [0, 90, 0] : undefined,
        orientationNote: 'Print standing on end. Glue them into one section, then press the next section on.',
      });
    }
  }

  // ---- clamps
  const clampMesh = serialize(buildClampBody(m, d));
  const padMesh = d.pads ? serialize(buildJawPad(m, d)) : null;
  const swivelMesh = serialize(buildSwivel(m, d));
  const screwMesh = d.screw === 'printed' ? serialize(buildScrew(m, d)) : null;
  const nutMesh = d.screw === 'printed' ? serialize(buildNut(m, d)) : null;
  const boltMesh = d.screw === 'printed' ? null : serialize(buildBoltPreview(m, d));
  d.clampXs.forEach((cx, i) => {
    const n = d.clampCount === 1 ? '' : ` ${i + 1}`;
    const at: [number, number, number] = [cx, 0, 0];
    parts.push({
      id: `clamp-${i}`, name: `Clamp${n}`, mesh: clampMesh, color: col.clamp, assembly: at, explode: [0, 45, 0],
      orientation: CLAMP_PRINT,
      orientationNote: 'Print on its side, as laid out, so each layer is a whole C and the jaws cannot split along the layers. 4+ walls and 40%+ infill.',
    });
    if (padMesh) {
      parts.push({
        id: `pad-${i}`, name: `Jaw pad${n}`, mesh: padMesh, color: col.pad, assembly: at, explode: [0, 45, 18],
        orientationNote: 'Print flat, in TPU if you have it. Glue under the top jaw.',
      });
    }
    parts.push({
      id: `swivel-${i}`, name: `Swivel pad${n}`, mesh: swivelMesh, color: d.pads ? col.pad : col.clamp, assembly: at, explode: [0, 45, 10],
      orientation: [180, 0, 0],
      orientationNote: 'Print socket up. Press it onto the screw tip.',
    });
    if (screwMesh && nutMesh) {
      parts.push({
        id: `screw-${i}`, name: `Thumb screw${n}`, mesh: screwMesh, color: col.clamp, assembly: at, explode: [0, 45, -45],
        orientationNote: 'Print standing on its knob, 3+ walls. The thread is coarse and round, so it needs no supports.',
      });
      parts.push({
        id: `nut-${i}`, name: `Clamp nut${n}`, mesh: nutMesh, color: col.clamp, assembly: at, explode: [0, 45, -20],
        orientationNote: 'Print flat. Drop it into the hex pocket in the lower jaw.',
      });
    } else if (boltMesh) {
      parts.push({ id: `bolt-${i}`, name: `${HARDWARE[d.screw as 'm8'].label} bolt${n}`, mesh: boltMesh, color: '#9aa3ad', assembly: at, previewOnly: true, explode: [0, 45, -35] });
    }
  });

  // ---- tray
  if (d.tray) {
    const tsecs = traySections(d);
    const divs = dividerXs(d, tsecs);
    tsecs.forEach((s, i) => {
      parts.push({
        id: `tray-${i}`, name: tsecs.length === 1 ? 'Top tray' : `Top tray ${i + 1}`,
        mesh: serialize(buildTray(m, d, s, divs)), color: col.panel, explode: [0, 0, 45],
        orientationNote: 'Print as it sits, floor down.',
      });
      const holds = d.clampXs.some((x) => x > s.x0 && x < s.x1);
      if (!holds) {
        issues.push({ level: 'warn', message: `Tray section ${i + 1} has no clamp under it, so nothing locates it. Add a clamp or shorten the tray.`, paramIds: ['clampCount', 'trayWidth'] });
      }
    });
    if (d.removable) {
      divs.forEach((x, i) => {
        parts.push({
          id: `divider-${i}`, name: `Tray divider ${i + 1}`, mesh: serialize(buildDivider(m, d, x)), color: col.acc, explode: [0, 0, 80],
          orientation: [0, 90, 0],
          orientationNote: 'Print lying flat. Slides down between the guide ribs.',
        });
      });
    }
  }

  // ---- accessories
  const { placed, bad } = place(m, d, specs(p), issues);
  const meshes = new Map<string, Part['mesh']>();
  for (const a of placed) {
    // Hooks of one set are one mesh, hung in several places.
    const shareKey = a.spec.group.startsWith('hooks') ? a.spec.group : a.spec.key;
    let mesh = meshes.get(shareKey);
    if (!mesh) {
      mesh = serialize(a.acc.body);
      meshes.set(shareKey, mesh);
    }
    parts.push({
      id: `acc-${a.spec.key}`,
      name: a.spec.name,
      mesh,
      color: bad.has(a.spec.key) ? COLLIDE : col.acc,
      assembly: a.at,
      explode: [0, -55, 0],
      orientationNote: 'Print as it hangs, back plate upright: everything rises off its foot. To hang it, raise its front so the hooks point down into the holes, feed the bends through, then swing it down until the lower pegs drop in. Lift the front again to take it off.',
    });
  }

  // ---- desk
  if (p.showDesk === true) {
    const margin = 90;
    parts.push({
      id: 'desk',
      name: 'Desk (reference)',
      mesh: serialize(box(m, -d.W / 2 - margin, d.W / 2 + margin, 0, 260, -d.deskT, 0)),
      color: '#8b6a4b',
      previewOnly: true,
    });
  }

  issues.push({
    level: 'warn',
    message: 'This design has not been load tested. How much the clamp and pegs hold depends on the material, print orientation, wall count, infill and how the load sits - start light, and use PETG or ABS/ASA for anything warm or heavy.',
  });

  const result: BuildResult = { parts, issues, readouts: readouts(d, placed.length, secs.length) };
  return { ...result, vectors: [guideExport(d, parts, result)] };
}

function readouts(d: Derived, accessories: number, panelSections: number): Record<string, string> {
  const out: Record<string, string> = {
    Board: `${d.W} x ${d.H} mm, ${(d.pt + d.gap).toFixed(1)} mm deep`,
    'Hole grid': `${d.cols.length} x ${d.rows.length} holes, ${d.px} x ${d.pz} mm apart`,
    Pegs: `${(2 * d.pinR).toFixed(1)} mm hooks in ${d.holeD} mm holes${d.counterbore ? `, counterbored to ${d.land} mm` : ''}`,
    'Desks it fits': `${Math.max(0, d.minDesk).toFixed(1)} - ${d.opening} mm thick`,
    Hardware: hardwareLine(d),
    Accessories: String(accessories),
  };
  if (panelSections > 1) out['Board sections'] = String(panelSections);
  return out;
}

/** The printable parts list and assembly steps, as a text file. */
function guideExport(d: Derived, parts: readonly Part[], result: BuildResult) {
  return {
    id: 'guide',
    label: 'Guide',
    extension: 'txt',
    mime: 'text/plain',
    title: 'Parts list, print orientations and assembly steps',
    data: () => {
      const L: string[] = [];
      const title = 'Clamp-on pegboard organizer - assembly guide';
      L.push(title, '='.repeat(title.length), '', 'All dimensions in millimetres.', '');
      L.push('Settings', '--------');
      for (const [k, v] of Object.entries(result.readouts ?? {})) L.push(`  ${k}: ${v}`);
      L.push('', 'Parts to print', '--------------');
      const seen = new Map<string, number>();
      for (const part of parts) {
        if (part.previewOnly) continue;
        const key = part.name.replace(/ \d+$/, '');
        seen.set(key, (seen.get(key) ?? 0) + (part.quantity ?? 1));
      }
      for (const part of parts) {
        if (part.previewOnly) continue;
        const key = part.name.replace(/ \d+$/, '');
        const qty = seen.get(key);
        if (qty === undefined) continue;
        seen.delete(key);
        const b = part.mesh.bbox;
        const size = [0, 1, 2].map((i) => (b.max[i]! - b.min[i]!).toFixed(0)).join(' x ');
        L.push(`  ${String(qty).padStart(2)} x ${key.padEnd(24)} ${size} mm`);
        if (part.orientationNote) L.push(`       ${part.orientationNote}`);
      }
      L.push('', 'Hardware', '--------', `  ${hardwareLine(d)}`);
      L.push('', 'Assembly', '--------');
      const steps = [
        d.screw === 'printed'
          ? 'Drop a nut into the hex pocket of each clamp from inside the C, and wind the thumb screw up through it from below.'
          : `Drop a ${HARDWARE[d.screw].label} nut into the hex pocket of each clamp from inside the C, and wind the bolt up through it from below.`,
        'Press a swivel pad onto each screw tip.' + (d.pads ? ' Glue a jaw pad under each top jaw.' : ''),
        d.mount === 'below'
          ? 'Slide the clamps onto the rail along the top of the board from its ends, and space them out.'
          : 'Slide the clamps onto the rail along the foot of the board from its ends, and space them out.',
        d.lock ? 'Optional: drive an M3 screw down through the hole in each clamp onto the rail, so the board cannot slide.' : '',
        `Push the clamps onto the desk edge (${Math.max(0, d.minDesk).toFixed(0)} - ${d.opening} mm thick) and wind the screws up until the board is firm. Hand tight is enough.`,
        d.tray ? 'Set the top tray on the jaws so the pegs drop into its sockets.' + (d.removable && d.dividers ? ' Slide the dividers into their guides.' : '') : '',
        'Hang each accessory: hold it with its front raised so the curved hooks point down into the top-row holes, feed them in until the bends are through, then swing it down until the lower pegs drop into their holes. It cannot pull straight out; lift the front again to take it off.',
      ].filter(Boolean);
      steps.forEach((s, i) => L.push(`  ${i + 1}. ${s}`));
      L.push('', 'Warnings', '--------');
      for (const i of result.issues) L.push(`  - ${i.message}`);
      return L.join('\r\n') + '\r\n';
    },
  };
}

export const pegboardGenerator: Generator = {
  id: 'pegboard',
  name: 'Clamp-on pegboard',
  description:
    'A desk-edge pegboard organizer: a holed panel on screw clamps, a tray on top, and hooks, holders and shelves that hang anywhere on the grid.',
  tagline: 'A pegboard that clamps to your desk, with accessories to hang on it',
  highlights: [
    'Screw clamp for desks of any thickness you set',
    'Hole grid, pegs and every accessory sized from one hole diameter',
    'Hooks, cup and pen holders, phone stand, cable comb, shelves',
    'Collision checks as you move accessories around the grid',
    'Boards bigger than the bed print in doweled sections',
  ],
  art: `<svg viewBox="0 0 120 96" role="img" aria-hidden="true">
    <rect x="18" y="20" width="70" height="66" rx="5" fill="#33363c"/>
    <g fill="#14161a">${Array.from({ length: 4 }, (_, i) => Array.from({ length: 5 }, (_, j) => `<circle cx="${28 + j * 12.5}" cy="${34 + i * 13}" r="2.4"/>`).join('')).join('')}</g>
    <rect x="12" y="12" width="84" height="9" rx="3" fill="#4a4f57"/>
    <path d="M88 14h18v6H95v20h-7z" fill="#5a606a"/>
    <rect x="30" y="58" width="22" height="20" rx="3" fill="#e07a2f"/>
    <path d="M66 36v9h12v-5h-3v2h-6v-6z" fill="#e07a2f"/>
    <path d="M40 34v8h10v-5h-3v2h-4v-5z" fill="#e07a2f"/>
  </svg>`,
  params: pegboardParams,
  groups: pegboardGroups,
  plateGap: 6,
  validate,
  build,
  presets: [
    {
      label: 'Gaming desk side',
      values: { panelWidth: 240, panelHeight: 240, palette: 'black' },
    },
    {
      label: 'Home office, white',
      values: {
        palette: 'white', headphone: false, controller: false, phone: true, pen: true, cup: true,
        shelf: true, shelfCol: 4, shelfRow: 1, shelfWidth: 45, hooksA: true, hooksACol: 1, hooksARow: 1, hooksACount: 2, hooksASpacing: 2,
        phoneCol: 6, phoneRow: 1,
      },
    },
    {
      label: 'Above the desk, tall',
      values: { mount: 'above', panelHeight: 320, panelWidth: 240, tray: false },
    },
    {
      label: 'Wide board in sections',
      values: { panelWidth: 400, panelHeight: 240, clampCount: 3, trayWidth: 400, bottomWidth: 380, headphoneCol: 2, controller: true, controllerCol: 11, controllerRow: 1 },
    },
  ],
};
