import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import { serialize } from '../../core/kernel/serialize';
import { slot, taperedExtrude } from '../../core/kernel/primitives';
import type { BuildCtx, BuildResult, Generator, Issue, Params, Part } from '../../core/params/types';
import { cellSpan, derive, SHAPES, type Cell, type Derived, type Vec2 } from './geometry';
import { shelfGroups, shelfParams } from './schema';

/** Keyhole: a head hole the screw goes in by, and a slot it drops down onto. */
const KEY_HEAD = 9;
const KEY_SLOT = 4.4;
const KEY_DROP = 9;
const SCREW_D = 4.5;
const SCREW_HEAD = 9;
/** Gap a frame's backer keeps between itself and the picture, for the screw head. */
const STANDOFF = 3;
const STANDOFF_RING = 3;

const PRINT_BACK_DOWN: [number, number, number] = [-90, 0, 0];
const PRINT_FRONT_DOWN: [number, number, number] = [90, 0, 0];

/** Interior angle of the shape's corners, which decides how much a radius eats each face. */
function cornerAngle(d: Derived): number {
  const n = d.shape === 'triangle' ? 3 : d.shape === 'hexagon' ? 6 : d.shape === 'octagon' ? 8 : 4;
  return (Math.PI * (n - 2)) / n;
}

const cornerR = (d: Derived) => Math.max(0, Math.min(d.corner, d.apothem * 0.6));

/** Length of flat face left between two rounded corners. */
function flatFace(d: Derived): number {
  const len = d.cells[0]!.edges[0]!.length;
  return len - (2 * cornerR(d)) / Math.tan(cornerAngle(d) / 2);
}

function validate(p: Params): Issue[] {
  const issues: Issue[] = [];
  const d = derive(p);

  if (d.wall < 2 * d.nozzle) {
    issues.push({
      level: 'error',
      message: `A ${d.wall} mm wall is under two nozzle widths and cannot be printed. Use at least ${(2 * d.nozzle).toFixed(1)} mm.`,
      paramIds: ['wall', 'nozzle'],
    });
  } else if (d.wall < 2 && d.h > 150) {
    issues.push({
      level: 'warn',
      message: `${d.wall} mm walls are flimsy for a module ${d.h} mm tall - it will flex once it carries anything. 2.5 mm or more is safer.`,
      paramIds: ['wall', 'cellHeight'],
    });
  }

  if (d.innerApothem < 8) {
    issues.push({
      level: 'error',
      message: `With ${d.wall} mm walls a ${d.h} mm ${SHAPES[d.shape].label.toLowerCase()} has almost no opening left. Make the cells bigger or the walls thinner.`,
      paramIds: ['cellHeight', 'wall'],
    });
    return issues;
  }

  if (d.back > 0 && d.back < 3 * d.layer - 1e-6) {
    issues.push({
      level: 'warn',
      message: `A ${d.back} mm back panel is under three layers at ${d.layer} mm, and will print with holes in it.`,
      paramIds: ['backThickness', 'layer'],
    });
  }

  if (d.rim > 0) {
    if (d.rim > d.innerApothem - 5) {
      issues.push({
        level: 'error',
        message: `A ${d.rim} mm rim nearly closes a ${(2 * d.innerApothem).toFixed(0)} mm opening. Make the rim smaller.`,
        paramIds: ['frontRim'],
      });
    }
    if (d.rim > d.depth - d.back - 2) {
      issues.push({
        level: 'error',
        message: `The rim is chamfered at 45 degrees, so it needs ${d.rim} mm of depth and the module is only ${(d.depth - d.back).toFixed(0)} mm deep inside.`,
        paramIds: ['frontRim', 'depth'],
      });
    }
  }

  if (d.type === 'frame') {
    if (d.border > d.innerApothem - 3) {
      issues.push({
        level: 'error',
        message: `A ${d.border} mm border leaves no window in the frame. Make it narrower or the cells bigger.`,
        paramIds: ['border', 'cellHeight'],
      });
    }
    const face = d.depth - d.rebate;
    if (face < Math.max(1.2, 3 * d.layer)) {
      issues.push({
        level: 'error',
        message: `The rebate takes all but ${face.toFixed(1)} mm of the ${d.depth} mm depth, leaving no front face to hold the picture. Make the frame deeper or the rebate shallower.`,
        paramIds: ['rebate', 'depth'],
      });
    }
    if (d.backer > 0) {
      const needs = d.backer + (d.mount !== 'none' ? STANDOFF : 0);
      if (needs > d.rebate - 0.5) {
        issues.push({
          level: 'error',
          message:
            d.mount !== 'none'
              ? `The backer (${d.backer} mm) and the ${STANDOFF} mm standoff that keeps the screw head off the picture need ${needs.toFixed(1)} mm, plus room for the picture. Deepen the rebate.`
              : `A ${d.backer} mm backer leaves no room for the picture in a ${d.rebate} mm rebate. Deepen the rebate.`,
          paramIds: ['rebate', 'backerThickness'],
        });
      }
    }
  }

  if (d.connector !== 'none' && d.cells.length > 1) {
    if (d.joinAt.length === 0) {
      issues.push({
        level: 'error',
        message: `There is no plain stretch of wall deep enough for a ${d.holeD.toFixed(1)} mm join hole. Make the modules deeper, the rim smaller, or join them with nothing.`,
        paramIds: ['depth', 'frontRim', 'connector'],
      });
    }
    const face = flatFace(d);
    if (face < d.holeD + 3) {
      issues.push({
        level: 'error',
        message: `After the corner radius each face is ${face.toFixed(1)} mm long - too short for a ${d.holeD.toFixed(1)} mm join hole. Reduce the corner radius or make the cells bigger.`,
        paramIds: ['cornerRadius', 'cellHeight'],
      });
    }
    if (d.connector === 'pins' && d.pinLength < 3) {
      issues.push({
        level: 'error',
        message: `Pins span two walls, and two ${d.wall} mm walls only make a ${d.pinLength.toFixed(1)} mm pin - too short to grip. Thicken the walls or use bolts.`,
        paramIds: ['wall', 'connector'],
      });
    } else if (d.connector === 'pins' && d.pinD > 2 * d.wall + 1) {
      issues.push({
        level: 'warn',
        message: `A ${d.pinD} mm pin is fat for a ${d.pinLength.toFixed(1)} mm length and will be easy to knock out sideways. A thinner pin or thicker walls hold better.`,
        paramIds: ['pinDiameter', 'wall'],
      });
    }
  }

  return issues;
}

// ------------------------------------------------------------------- shapes

function outer(m: ManifoldToplevel, d: Derived, c: Cell): CrossSection {
  const poly = new m.CrossSection([c.verts.map(([x, y]) => [x, y] as [number, number])]);
  const r = cornerR(d);
  return r > 1e-3 ? poly.offset(-r, 'Round', 2, 48).offset(r, 'Round', 2, 48) : poly;
}

const opening = (m: ManifoldToplevel, d: Derived, c: Cell) => outer(m, d, c).offset(-d.wall, 'Miter', 2);

function keyhole(m: ManifoldToplevel, at: Vec2): CrossSection {
  const head = m.CrossSection.circle(KEY_HEAD / 2, 48);
  const drop = slot(m, KEY_DROP + KEY_SLOT, KEY_SLOT).rotate(90).translate([0, KEY_DROP / 2]);
  return head.add(drop).translate([at[0], at[1]]);
}

/**
 * Where the mounting holes go on one cell, or null when they will not fit
 * inside its opening with a margin to spare.
 *
 * Tried above the middle first -- hanging high keeps a loaded shelf from
 * tipping forward off its screw -- then dead centre, which is the only place a
 * point-up triangle has any width.
 */
function mountPoints(m: ManifoldToplevel, d: Derived, inside: CrossSection): Vec2[] | null {
  const room = inside.offset(-2, 'Miter', 2);
  for (const lift of [0.3 * d.innerApothem, 0]) {
    const pts: Vec2[] =
      d.mount === 'keyhole'
        ? [[0, lift - KEY_DROP / 2]]
        : [[-Math.min(0.45 * d.innerApothem, 30), lift], [Math.min(0.45 * d.innerApothem, 30), lift]];
    const marks = pts.map((pt) =>
      d.mount === 'keyhole' ? keyhole(m, pt) : m.CrossSection.circle(SCREW_HEAD / 2, 32).translate([pt[0], pt[1]]),
    );
    if (m.CrossSection.union(marks).subtract(room).area() < 1e-3) return pts;
  }
  return null;
}

/** Through holes for mounting, cut into a plate `t` thick whose inside face is at z = t. */
function mountHoles(m: ManifoldToplevel, d: Derived, pts: readonly Vec2[], t: number): Manifold[] {
  return pts.map(([x, y]) => {
    if (d.mount === 'keyhole') return m.Manifold.extrude(keyhole(m, [x, y]), t + 2).translate([0, 0, -1]);
    // Countersunk from the inside, so the head sits flush with the shelf floor.
    const sink = Math.min((SCREW_HEAD - SCREW_D) / 2, t);
    return m.Manifold.union([
      m.Manifold.cylinder(t + 2, SCREW_D / 2, SCREW_D / 2, 32).translate([x, y, -1]),
      m.Manifold.cylinder(sink + 0.01, SCREW_HEAD / 2 - sink, SCREW_HEAD / 2, 48).translate([x, y, t - sink]),
      m.Manifold.cylinder(1, SCREW_HEAD / 2, SCREW_HEAD / 2, 48).translate([x, y, t]),
    ]);
  });
}

/**
 * The hollow inside one cell, in the cell's frame: x and y in the wall plane,
 * z from the wall (0) out to the front (depth).
 */
function cavity(m: ManifoldToplevel, d: Derived, c: Cell): Manifold {
  const inside = opening(m, d, c);
  if (d.type === 'frame') {
    const window = inside.offset(-d.border, 'Round', 2, 48);
    return m.Manifold.union([
      m.Manifold.extrude(window, d.depth + 2).translate([0, 0, -1]),
      m.Manifold.extrude(inside, d.rebate + 1).translate([0, 0, -1]),
    ]);
  }

  const z0 = d.back > 0 ? d.back : -1;
  if (d.rim <= 0) return m.Manifold.extrude(inside, d.depth + 1 - z0).translate([0, 0, z0]);

  // The rim leans in at 45 degrees: the opening shrinks by `rim` over the last
  // `rim` of depth. Scaling about the centroid is an even inset because every
  // cell is a regular polygon centred on it.
  const s = (d.innerApothem - d.rim) / d.innerApothem;
  return m.Manifold.union([
    m.Manifold.extrude(inside, d.depth - d.rim - z0 + 0.01).translate([0, 0, z0]),
    taperedExtrude(m, inside, d.rim, s).translate([0, 0, d.depth - d.rim]),
    m.Manifold.extrude(inside.scale([s, s]), 1).translate([0, 0, d.depth - 0.01]),
  ]);
}

/** Holes through every face of a cell, perpendicular to it, for pins or bolts. */
function joinHoles(m: ManifoldToplevel, d: Derived, c: Cell): Manifold[] {
  const out: Manifold[] = [];
  const len = 2 * d.wall + 2;
  for (const e of c.edges) {
    for (const z of d.joinAt) {
      out.push(
        m.Manifold.cylinder(len, d.holeD / 2, d.holeD / 2, 32, true)
          .rotate([0, 90, 0])
          .rotate([0, 0, (e.angle * 180) / Math.PI])
          .translate([e.mid[0], e.mid[1], z]),
      );
    }
  }
  return out;
}

/** One module, built lying on its back in its own frame. */
function buildModule(m: ManifoldToplevel, d: Derived, c: Cell): { body: Manifold; skipped: boolean } {
  const inside = opening(m, d, c);
  const cuts = [cavity(m, d, c)];
  let skipped = false;
  if (d.type === 'wall' && d.mount !== 'none') {
    const pts = mountPoints(m, d, inside);
    if (pts) cuts.push(...mountHoles(m, d, pts, d.back));
    else skipped = true;
  }
  if (d.modular && d.connector !== 'none' && d.cells.length > 1) cuts.push(...joinHoles(m, d, c));
  return { body: m.Manifold.extrude(outer(m, d, c), d.depth).subtract(m.Manifold.union(cuts)), skipped };
}

/** Every module fused into one, in the cluster frame. */
function buildCluster(m: ManifoldToplevel, d: Derived): { body: Manifold; skipped: number } {
  // Unioned in 2D first: Clipper merges the shared faces exactly, where a 3D
  // union of prisms that merely touch is left to decide whether they do.
  const shell = m.CrossSection.union(d.cells.map((c) => outer(m, d, c).translate([c.cx, c.cy])))
    .offset(0.01, 'Miter', 2)
    .offset(-0.01, 'Miter', 2);
  const cuts: Manifold[] = [];
  let skipped = 0;
  for (const c of d.cells) {
    const local = [cavity(m, d, c)];
    if (d.type === 'wall' && d.mount !== 'none') {
      const pts = mountPoints(m, d, opening(m, d, c));
      if (pts) local.push(...mountHoles(m, d, pts, d.back));
      else skipped++;
    }
    cuts.push(m.Manifold.union(local).translate([c.cx, c.cy, 0]));
  }
  return { body: m.Manifold.extrude(shell, d.depth).subtract(m.Manifold.union(cuts)), skipped };
}

/** The plate behind a frame's picture, standoff ring forward. */
function buildBacker(m: ManifoldToplevel, d: Derived, c: Cell): { body: Manifold; skipped: boolean } {
  const plate = opening(m, d, c).offset(-d.clear, 'Miter', 2);
  const parts = [m.Manifold.extrude(plate, d.backer)];
  let skipped = false;
  let holes: Manifold[] = [];
  if (d.mount !== 'none') {
    parts.push(
      m.Manifold.extrude(plate.subtract(plate.offset(-STANDOFF_RING, 'Miter', 2)), STANDOFF + 0.01).translate([
        0, 0, d.backer - 0.01,
      ]),
    );
    const pts = mountPoints(m, d, plate.offset(-STANDOFF_RING, 'Miter', 2));
    if (pts) holes = mountHoles(m, d, pts, d.backer);
    else skipped = true;
  }
  const body = m.Manifold.union(parts);
  return { body: holes.length ? body.subtract(m.Manifold.union(holes)) : body, skipped };
}

/** A D-section pin: the flat goes on the bed, so it prints strong across the joint. */
function buildPin(m: ManifoldToplevel, d: Derived): Manifold {
  const r = d.pinD / 2;
  const flat = 0.35 * d.pinD;
  const section = m.CrossSection.circle(r, 32).intersect(
    m.CrossSection.square([d.pinD + 2, d.pinD + 2]).translate([-r - 1, -flat]),
  );
  return m.Manifold.extrude(section, d.pinLength).rotate([90, 0, 0]).translate([0, d.pinLength / 2, flat]);
}

// ------------------------------------------------------------------- output

/** Lying (x, y in the wall plane, z out of it) to standing (z up, front toward -y). */
const stand = (s: Manifold) => s.rotate([90, 0, 0]);

function hardware(d: Derived): string | null {
  if (!d.modular || d.cells.length < 2 || d.connector === 'none') return null;
  const n = d.sharedFaces * d.joinAt.length;
  if (d.connector === 'pins') return `${n} printed pins`;
  return `${n} x M3 bolt, ${Math.ceil(2 * d.wall + 4)} mm or longer, with nuts`;
}

function readouts(d: Derived): Record<string, string> {
  const span = cellSpan(d);
  const out: Record<string, string> = {
    Modules: `${d.cells.length} ${SHAPES[d.shape].label.toLowerCase()}${d.cells.length === 1 ? '' : 's'}`,
    Overall: `${d.width.toFixed(0)} x ${d.height.toFixed(0)} mm, ${d.depth} mm deep`,
    'One module': `${span.w.toFixed(0)} x ${span.h.toFixed(0)} mm`,
    Opening:
      d.type === 'frame'
        ? `${(2 * (d.innerApothem - d.border)).toFixed(0)} mm window across flats`
        : `${(2 * d.innerApothem).toFixed(0)} mm across flats`,
  };
  const hw = hardware(d);
  if (hw) out['Joins'] = hw;
  if (d.mount !== 'none') {
    out['Mounting'] = d.mount === 'keyhole' ? 'one keyhole per module, for a pan-head screw' : 'two countersunk 4 mm screws per module';
  }
  return out;
}

function build(p: Params, ctx: BuildCtx): BuildResult {
  const m = ctx.m;
  const d = derive(p);
  const issues: Issue[] = [];
  const blocking = validate(p);
  if (blocking.some((i) => i.level === 'error')) return { parts: [], issues: blocking, readouts: readouts(d) };

  const parts: Part[] = [];
  const color = String(p.bodyColor);
  const accent = String(p.accentColor);
  const frame = d.type === 'frame';
  const bodyNote = frame
    ? 'Print face down, as laid out. The rebate widens going up, so nothing overhangs.'
    : d.back > 0
      ? 'Print on its back, as laid out. The walls rise straight off the back panel and the rim leans in at 45 degrees - no supports.'
      : 'Print on its back edge, as laid out - an open ring needs no supports.';
  let skipped = 0;

  if (d.modular) {
    // Modules of the same outline are the same mesh; only triangles come in two.
    const cache = new Map<boolean, { mesh: Part['mesh']; skipped: boolean }>();
    for (const c of d.cells) {
      let hit = cache.get(c.flipped);
      if (!hit) {
        const built = buildModule(m, d, c);
        hit = { mesh: serialize(stand(built.body)), skipped: built.skipped };
        cache.set(c.flipped, hit);
      }
      if (hit.skipped) skipped++;
      parts.push({
        id: `module-${c.index}`,
        name: d.cells.length === 1 ? 'Module' : `Module ${c.index + 1}`,
        mesh: hit.mesh,
        color,
        assembly: [c.cx, 0, c.cy],
        orientation: frame ? PRINT_FRONT_DOWN : PRINT_BACK_DOWN,
        orientationNote: bodyNote,
      });
    }
  } else {
    const built = buildCluster(m, d);
    skipped = built.skipped;
    parts.push({
      id: 'cluster',
      name: frame ? 'Frames' : 'Shelf',
      mesh: serialize(stand(built.body)),
      color,
      orientation: frame ? PRINT_FRONT_DOWN : PRINT_BACK_DOWN,
      orientationNote: bodyNote,
    });
  }

  if (frame && d.backer > 0) {
    const cache = new Map<boolean, { mesh: Part['mesh']; skipped: boolean }>();
    for (const c of d.cells) {
      let hit = cache.get(c.flipped);
      if (!hit) {
        const built = buildBacker(m, d, c);
        hit = { mesh: serialize(stand(built.body)), skipped: built.skipped };
        cache.set(c.flipped, hit);
      }
      if (hit.skipped) skipped++;
      parts.push({
        id: `backer-${c.index}`,
        name: d.cells.length === 1 ? 'Backer' : `Backer ${c.index + 1}`,
        mesh: hit.mesh,
        color: accent,
        assembly: [c.cx, 0, c.cy],
        orientation: PRINT_BACK_DOWN,
        orientationNote:
          d.mount !== 'none'
            ? 'Print flat, ring up. The ring presses the picture into the frame and leaves room behind it for the screw head.'
            : 'Print flat. Press it into the rebate behind the picture.',
      });
    }
  }

  if (skipped > 0) {
    issues.push({
      level: 'warn',
      message: `${skipped === d.cells.length ? 'No' : `${skipped} of the`} module${skipped === 1 ? '' : 's'} had room for the ${d.mount === 'keyhole' ? 'keyhole' : 'screw holes'}, so ${skipped === 1 ? 'it was' : 'they were'} left off. Make the cells bigger, or hang the cluster by its neighbours.`,
      paramIds: ['mount', 'cellHeight'],
    });
  }

  const joins = d.modular && d.cells.length > 1 && d.connector !== 'none' && d.sharedFaces > 0;
  if (joins && d.connector === 'pins') {
    parts.push({
      id: 'pin',
      name: 'Join pin',
      mesh: serialize(buildPin(m, d)),
      color: accent,
      quantity: d.sharedFaces * d.joinAt.length,
      // Shown lying in front of the cluster: a pin is too small to spot in its hole.
      assembly: [0, -d.depth - 15, 0],
      orientationNote: 'Print on the flat side, as laid out, so the layers run along the pin and it cannot shear at the joint.',
    });
  }
  if (joins) {
    issues.push({
      level: 'warn',
      message:
        d.connector === 'pins'
          ? `Press ${d.sharedFaces * d.joinAt.length} pins through the matching holes where modules meet. Every face has holes, so modules can be rearranged later.`
          : `You will need ${hardware(d)}. Every face has holes, so modules can be rearranged later.`,
      paramIds: ['connector'],
    });
  }

  return { parts, issues, readouts: readouts(d) };
}

export const shelfGenerator: Generator = {
  id: 'shelf',
  name: 'Modular shelf',
  description:
    'Connected hexagonal shelves, display frames and wall-mounted modules, in a shape and size of your choosing.',
  tagline: 'Honeycomb shelves and frames that join edge to edge',
  highlights: [
    'Hexagon, square, diamond, triangle or octagon modules',
    'Wall shelves, freestanding shelves or picture frames',
    'Printed pins or M3 bolts join any face to any other',
    'Keyhole or countersunk mounting in the back',
    'Separate modules, or the whole cluster in one piece',
  ],
  art: `<svg viewBox="0 0 120 96" role="img" aria-hidden="true">
    <defs><linearGradient id="sh-b" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e2c29d"/><stop offset="1" stop-color="#b48a5c"/>
    </linearGradient></defs>
    <g fill="url(#sh-b)" fill-rule="evenodd">
      <path d="M22 30l10-17h20l10 17-10 17H32zM28 30l7 12h14l7-12-7-12H35z"/>
      <path d="M58 47l10-17h20l10 17-10 17H68zM64 47l7 12h14l7-12-7-12H71z"/>
      <path d="M22 64l10-17h20l10 17-10 17H32zM28 64l7 12h14l7-12-7-12H35z"/>
    </g>
    <rect x="38" y="68" width="9" height="8" rx="1.5" fill="#6f5a46"/>
    <circle cx="80" cy="54" r="4" fill="#6f5a46"/>
  </svg>`,
  params: shelfParams,
  groups: shelfGroups,
  plateGap: 6,
  validate,
  build,
  presets: [
    {
      label: 'Honeycomb wall shelf',
      values: { moduleType: 'wall', shape: 'hexagon', columns: 3, rows: 2, cellHeight: 120, depth: 90, wall: 3, frontRim: 0, mount: 'keyhole' },
    },
    {
      label: 'Hexagon photo frames',
      values: {
        moduleType: 'frame', shape: 'hexagon', columns: 3, rows: 1, cellHeight: 110, depth: 14, wall: 2.4,
        border: 8, rebate: 8, backer: true, backerThickness: 1.6, mount: 'keyhole',
        bodyColor: '#2f3136', accentColor: '#9aa0a6',
      },
    },
    {
      label: 'Square desk cubbies',
      values: { moduleType: 'shelf', shape: 'square', columns: 3, rows: 2, cellHeight: 100, depth: 120, backPanel: true, frontRim: 4, cornerRadius: 4 },
    },
    {
      label: 'Triangle strip',
      values: { moduleType: 'wall', shape: 'triangle', columns: 5, rows: 1, cellHeight: 110, depth: 80, mount: 'keyhole', cornerRadius: 3, bodyColor: '#7aa6c2' },
    },
    {
      label: 'Diamond display lattice',
      values: { moduleType: 'frame', shape: 'diamond', columns: 3, rows: 3, cellHeight: 100, depth: 16, border: 6, rebate: 9, bodyColor: '#f2efe8', accentColor: '#c9a46b' },
    },
    {
      label: 'Octagon niches, one piece',
      values: { moduleType: 'wall', shape: 'octagon', columns: 2, rows: 1, cellHeight: 100, depth: 70, joinMode: 'single', mount: 'screw', frontRim: 3 },
    },
  ],
};
