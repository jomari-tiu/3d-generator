import { serialize } from '../../core/kernel/serialize';
import type { RawMesh } from '../../core/kernel/types';
import type { BuildCtx, BuildResult, Generator, Issue, Params, Part } from '../../core/params/types';
import { buildBin, buildClip } from './bin';
import { binCentre, binExtras, binSize, derive, type BinSize, type Derived } from './geometry';
import { drawerGroups, drawerParams } from './schema';

const fmt = (n: number) => n.toFixed(1);

/** True when a w x d footprint fits the bed either way round. */
function fitsBed(d: Derived, s: BinSize): boolean {
  return (s.w <= d.bedX && s.d <= d.bedY) || (s.w <= d.bedY && s.d <= d.bedX);
}

/** Distinct bin sizes in the layout, keyed by span, largest first. */
function sizesOf(d: Derived): Map<string, BinSize> {
  const sizes = new Map<string, BinSize>();
  for (const b of d.layout.bins) sizes.set(`${b.w}x${b.h}`, binSize(d, b));
  return new Map([...sizes].sort((a, b) => b[1].w * b[1].d - a[1].w * a[1].d));
}

/**
 * Every place a clip goes: the middle of each grid-cell edge that has a
 * different bin on either side of it. An edge inside a merged bin needs none.
 * `across` is the direction the clip spans: 'x' between columns, 'y' between
 * rows.
 */
function clipSpots(d: Derived): { x: number; y: number; across: 'x' | 'y' }[] {
  const owner: number[][] = Array.from({ length: d.rows }, () => new Array<number>(d.cols).fill(-1));
  d.layout.bins.forEach((b, i) => {
    for (let r = b.row; r < b.row + b.h; r++) for (let c = b.col; c < b.col + b.w; c++) owner[r]![c] = i;
  });
  const left = -d.setW / 2;
  const front = -d.setD / 2;
  const colX = (c: number) => left + c * (d.cellW + d.gap) + d.cellW / 2;
  const rowY = (r: number) => front + r * (d.cellD + d.gap) + d.cellD / 2;
  const spots: { x: number; y: number; across: 'x' | 'y' }[] = [];
  for (let r = 0; r < d.rows; r++) {
    for (let c = 0; c < d.cols; c++) {
      if (c + 1 < d.cols && owner[r]![c] !== owner[r]![c + 1]) {
        spots.push({ x: left + (c + 1) * (d.cellW + d.gap) - d.gap / 2, y: rowY(r), across: 'x' });
      }
      if (r + 1 < d.rows && owner[r]![c] !== owner[r + 1]![c]) {
        spots.push({ x: colX(c), y: front + (r + 1) * (d.cellD + d.gap) - d.gap / 2, across: 'y' });
      }
    }
  }
  return spots;
}

function validate(p: Params): Issue[] {
  const issues: Issue[] = [];
  const d = derive(p);

  for (const message of d.layout.errors) {
    issues.push({ level: 'error', message, paramIds: ['layout', 'columns', 'rows'] });
  }

  const minSide = 2 * d.wall + 10;
  if (d.cellW < minSide) {
    issues.push({
      level: 'error',
      message: `${d.cols} columns in a ${d.drawerW} mm drawer makes bins ${fmt(d.cellW)} mm wide - too narrow to hold anything. Use fewer columns.`,
      paramIds: ['columns', 'drawerWidth'],
    });
  }
  if (d.cellD < minSide) {
    issues.push({
      level: 'error',
      message: `${d.rows} rows in a ${d.drawerD} mm drawer makes bins ${fmt(d.cellD)} mm deep - too shallow to hold anything. Use fewer rows.`,
      paramIds: ['rows', 'drawerDepth'],
    });
  }

  const minH = d.floor + (d.stackable ? d.lipH + d.footInset : 0) + 5;
  if (d.binH < minH) {
    issues.push({
      level: 'error',
      message: `With ${p.headroom} mm of headroom the bins would be ${fmt(d.binH)} mm tall, and they need at least ${fmt(minH)} mm${d.stackable ? ' with the stacking lip' : ''}. Reduce the headroom${d.stackable ? ' or turn off the stacking lip' : ''}.`,
      paramIds: ['headroom', 'drawerHeight', 'lipHeight'],
    });
  }
  if (d.connectors && d.clipLeg > d.binH - d.floor - 2) {
    issues.push({
      level: 'error',
      message: `Clip legs ${fmt(d.clipLeg)} mm long would reach the floor of ${fmt(d.binH)} mm bins. Shorten them.`,
      paramIds: ['clipLeg'],
    });
  }
  if (d.connectors && d.clipW + 2 * d.clipClear > Math.min(d.cellW, d.cellD) - 2 * d.corner) {
    issues.push({
      level: 'error',
      message: `A ${fmt(d.clipW)} mm clip does not fit along the straight part of a ${fmt(Math.min(d.cellW, d.cellD))} mm bin's wall. Use a narrower clip or a smaller corner radius.`,
      paramIds: ['clipWidth', 'corner'],
    });
  }
  if (issues.length > 0) return issues;

  for (const s of sizesOf(d).values()) {
    if (fitsBed(d, s)) continue;
    issues.push({
      level: 'error',
      message: `A bin would be ${fmt(s.w)} x ${fmt(s.d)} mm, bigger than your ${d.bedX} x ${d.bedY} mm bed. Use more columns or rows, or make the merged bins narrower.`,
      paramIds: ['columns', 'rows', 'layout', 'bedX', 'bedY'],
    });
    break;
  }

  // Trimmed extras are reported against the smallest bin, which is the one
  // that trims them hardest.
  const smallest = [...sizesOf(d).values()].pop()!;
  const { scoopR, labelD } = binExtras(d, smallest);
  if (d.scoop && scoopR + 0.01 < d.scoopRadius) {
    issues.push({
      level: 'warn',
      message: `The finger scoop is trimmed to ${fmt(scoopR)} mm in the smallest bins.`,
      paramIds: ['scoopRadius'],
    });
  }
  if (d.labelTab && labelD + 0.01 < d.labelDepth) {
    issues.push({
      level: 'warn',
      message:
        labelD > 2
          ? `The label tab is trimmed to ${fmt(labelD)} mm deep in the smallest bins.`
          : 'The smallest bins are too small for a label tab, so it was left off them.',
      paramIds: ['labelDepth'],
    });
  }
  return issues;
}

function readouts(d: Derived): Record<string, string> {
  const out: Record<string, string> = {
    Bins: `${d.layout.bins.length} on a ${d.cols} x ${d.rows} grid`,
    'Single bin': `${fmt(d.cellW)} x ${fmt(d.cellD)} x ${fmt(d.binH)} mm`,
  };
  const sizes = [...sizesOf(d)].filter(([k]) => k !== '1x1');
  if (sizes.length > 0) {
    out['Merged bins'] = sizes.map(([k, s]) => `${k}: ${fmt(s.w)} x ${fmt(s.d)}`).join(', ');
  }
  out['Whole set'] = `${fmt(d.setW)} x ${fmt(d.setD)} mm in a ${d.drawerW} x ${d.drawerD} mm drawer`;
  if (d.connectors) out.Connectors = `${clipSpots(d).length} clips`;
  return out;
}

const rowName = (row: number) => String.fromCharCode(65 + row);

function build(p: Params, ctx: BuildCtx): BuildResult {
  const d = derive(p);
  const blocking = validate(p);
  if (blocking.some((i) => i.level === 'error')) {
    return { parts: [], issues: blocking, readouts: readouts(d) };
  }

  const parts: Part[] = [];

  // Bins of the same size are the same part, so each size is built and
  // serialised once and shared. A separate part per bin rather than a
  // quantity, so the assembled view shows the drawer filled, each bin where
  // it goes.
  const meshes = new Map<string, RawMesh>();
  for (const b of d.layout.bins) {
    const key = `${b.w}x${b.h}`;
    if (!meshes.has(key)) meshes.set(key, serialize(buildBin(ctx, d, binSize(d, b), b)));
    const [x, y] = binCentre(d, b);
    const span = b.w > 1 || b.h > 1 ? ` (${key})` : '';
    parts.push({
      id: `bin-${b.row}-${b.col}`,
      name: `Bin ${rowName(b.row)}${b.col + 1}${span}`,
      mesh: meshes.get(key)!,
      color: String(p.binColor),
      assembly: [x, y, 0],
      orientationNote: 'Print open side up, as laid out. Nothing overhangs: the stacking step and the label tab are both 45 degree slopes.',
    });
  }

  // A clip wherever two different bins meet across a cell edge. Two meshes,
  // one per direction, shared by every clip that way round.
  if (d.connectors) {
    const clips = { x: serialize(buildClip(ctx, d, 'x')), y: serialize(buildClip(ctx, d, 'y')) };
    clipSpots(d).forEach((c, k) => {
      parts.push({
        id: `clip-${k}`,
        name: `Connector clip ${k + 1}`,
        mesh: clips[c.across],
        color: String(p.connectorColor),
        assembly: [c.x, c.y, 0],
        orientation: [180, 0, 0],
        orientationNote: 'Prints upside down, bar on the bed and legs up. Drop it in over two neighbouring bins; lift it out to part them.',
      });
    });
  }
  return { parts, issues: [], readouts: readouts(d) };
}

export const drawerOrganizerGenerator: Generator = {
  id: 'drawer-organizer',
  name: 'Drawer organizer',
  description:
    'Type in the inside of your drawer and get a set of bins that fills it - each one sized to print on its own, clipped to its neighbours.',
  tagline: 'Bins that fit your drawer exactly',
  highlights: [
    'Sized from your drawer, with a fit gap and headroom',
    'Any grid of rows and columns, with bins merged across columns or rows',
    'Clips that join neighbouring bins into one set, and lift out to part them',
    'Bins stack on each other out of the drawer',
    'Label tab and finger scoop, no supports needed',
  ],
  art: `<svg viewBox="0 0 120 96" role="img" aria-hidden="true">
    <rect x="8" y="14" width="104" height="70" rx="5" fill="#c8a37a"/>
    <rect x="13" y="19" width="94" height="60" rx="3" fill="#8f6b45"/>
    <g fill="#7aa6c2" stroke="#4f7d99" stroke-width="1.5">
      <rect x="15" y="21" width="29" height="27" rx="3"/>
      <rect x="46" y="21" width="29" height="27" rx="3"/>
      <rect x="77" y="21" width="28" height="27" rx="3"/>
      <rect x="15" y="50" width="29" height="27" rx="3"/>
      <rect x="46" y="50" width="29" height="27" rx="3"/>
      <rect x="77" y="50" width="28" height="27" rx="3"/>
    </g>
    <g fill="#eef4f8"><rect x="19" y="23" width="21" height="4" rx="1"/><rect x="50" y="23" width="21" height="4" rx="1"/>
      <rect x="81" y="23" width="20" height="4" rx="1"/><rect x="19" y="52" width="21" height="4" rx="1"/>
      <rect x="50" y="52" width="21" height="4" rx="1"/><rect x="81" y="52" width="20" height="4" rx="1"/></g>
    <g fill="#4f7d99"><rect x="42" y="31" width="6" height="4" rx="1"/><rect x="73" y="31" width="6" height="4" rx="1"/>
      <rect x="27" y="46" width="6" height="6" rx="1"/><rect x="58" y="46" width="6" height="6" rx="1"/></g>
  </svg>`,
  params: drawerParams,
  groups: drawerGroups,
  plateGap: 6,
  validate,
  build,
  presets: [
    {
      label: 'Desk drawer, 3 x 4',
      values: {
        drawerWidth: 300, drawerDepth: 400, drawerHeight: 60, columns: 3, rows: 4,
        layout: '2,1\n1,1,1\n1,2\n1,1,1',
      },
    },
    {
      label: 'Cutlery drawer, long slots',
      values: {
        drawerWidth: 380, drawerDepth: 450, drawerHeight: 70, columns: 5, rows: 2,
        layout: '', labelTab: false,
      },
    },
    {
      label: 'Shallow office drawer',
      values: {
        drawerWidth: 250, drawerDepth: 300, drawerHeight: 35, headroom: 3,
        columns: 4, rows: 4, layout: '4\n2,2\n1,1,2x2', stackable: false, scoopRadius: 10,
      },
    },
    {
      label: 'Makeup drawer, small bins',
      values: {
        drawerWidth: 200, drawerDepth: 280, drawerHeight: 80, columns: 3, rows: 5,
        layout: '3\n1,1,1\n1x2,2\n2', binColor: '#e9a2b2',
      },
    },
  ],
};
