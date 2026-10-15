import { serialize } from '../../core/kernel/serialize';
import type { RawMesh } from '../../core/kernel/types';
import type { BuildCtx, BuildResult, Generator, Issue, Params, Part } from '../../core/params/types';
import { buildBin } from './bin';
import { binCentre, binExtras, binSize, derive, type BinSize, type Derived } from './geometry';
import { drawerGroups, drawerParams } from './schema';
import { buildTray, splitTray } from './tray';

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
      message: `With ${p.headroom} mm of headroom${d.tray ? ' and the tray under them' : ''} the bins would be ${fmt(d.binH)} mm tall, and they need at least ${fmt(minH)} mm${d.stackable ? ' with the stacking lip' : ''}. Reduce the headroom${d.stackable ? ' or turn off the stacking lip' : ''}.`,
      paramIds: ['headroom', 'drawerHeight', 'lipHeight', 'trayBase'],
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
  if (d.splitError) {
    issues.push({ level: 'error', message: d.splitError, paramIds: ['columns', 'rows', 'tray'] });
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
  out['Whole set'] = `${fmt(d.trayW)} x ${fmt(d.trayD)} mm in a ${d.drawerW} x ${d.drawerD} mm drawer`;
  if (d.tray) {
    const n = (d.cutsX.length - 1) * (d.cutsY.length - 1);
    out.Tray = n === 1 ? 'one piece' : `${n} pieces, ${d.cutsX.length - 1} x ${d.cutsY.length - 1}, jigsaw-jointed`;
  }
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

  // The tray is modelled in place, in drawer coordinates, so its pieces need
  // no assembly offset.
  if (d.tray) {
    const pieces = splitTray(ctx, d, buildTray(ctx, d));
    const many = pieces.length > 1;
    for (const piece of pieces) {
      parts.push({
        id: `tray-${piece.i}-${piece.j}`,
        name: many ? `Tray ${piece.j + 1}-${piece.i + 1}` : 'Tray',
        mesh: serialize(piece.solid),
        color: String(p.trayColor),
        orientationNote: many
          ? 'Print flat, pockets up. The pieces press together from above: line up the knobs and push down.'
          : 'Print flat, pockets up.',
      });
    }
  }

  // Bins of the same size are the same part, so each size is built and
  // serialised once and shared. A separate part per bin rather than a
  // quantity, so the assembled view shows the drawer filled, each bin where
  // it goes.
  const meshes = new Map<string, RawMesh>();
  for (const b of d.layout.bins) {
    const key = `${b.w}x${b.h}`;
    if (!meshes.has(key)) meshes.set(key, serialize(buildBin(ctx, d, binSize(d, b))));
    const [x, y] = binCentre(d, b);
    const span = b.w > 1 || b.h > 1 ? ` (${key})` : '';
    parts.push({
      id: `bin-${b.row}-${b.col}`,
      name: `Bin ${rowName(b.row)}${b.col + 1}${span}`,
      mesh: meshes.get(key)!,
      color: String(p.binColor),
      assembly: [x, y, d.binZ],
      orientationNote: 'Print open side up, as laid out. Nothing overhangs: the stacking step and the label tab are both 45 degree slopes.',
    });
  }
  return { parts, issues: [], readouts: readouts(d) };
}

export const drawerOrganizerGenerator: Generator = {
  id: 'drawer-organizer',
  name: 'Drawer organizer',
  description:
    'Type in the inside of your drawer and get a set of bins that fills it - each one sized to print on its own.',
  tagline: 'Bins that fit your drawer exactly',
  highlights: [
    'Sized from your drawer, with a fit gap and headroom',
    'Any grid of rows and columns, with bins merged across columns or rows',
    'A tray with a pocket per bin, in jigsaw pieces when it outgrows the bed',
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
