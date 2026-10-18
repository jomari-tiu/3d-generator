import type { CrossSection, ManifoldToplevel } from 'manifold-3d';
import { dropSlivers, ngon, roundedRect, segmentsForRadius } from '../../core/kernel/primitives';
import { serialize } from '../../core/kernel/serialize';
import { ringsToSvg } from '../../core/image/svg';
import type { PathCommand } from '../../core/text/flatten';
import type { BuildCtx, BuildResult, Generator, Issue, Params, Part } from '../../core/params/types';
import { hasThinStrokes } from '../../core/text/textSolid';
import { floodedIssue, traceArtwork } from '../shared/artwork';
import { bridgeLoose } from './bridges';
import { logoKeychainGroups, logoKeychainParams } from './schema';

/** Rim under which a frame bends in a pocket. */
const MIN_RIM = 1.2;
/** Clear space between the loop's hole and whatever it hangs off. */
const HOLE_CLEAR = 0.4;
/** How far the ornament cap reaches down into the frame below its corners. */
const CAP_BITE = 1;
/** Volume below which a leftover shell is debris rather than a feature. */
const SLIVER_MM3 = 0.02;

/** Frame outline. `height` is only read for a rectangle; every other shape is `size` across. */
function frameOutline(m: ManifoldToplevel, shape: string, size: number, height: number): CrossSection {
  const r = size / 2;
  // A hexagon from ngon has a vertex on +X, so its top is a flat for the cap
  // to sit on.
  if (shape === 'hexagon') return ngon(m, r, 6);
  if (shape === 'square') return roundedRect(m, size, size, size * 0.2, 48);
  if (shape === 'rectangle') return roundedRect(m, size, height, Math.min(size, height) * 0.2, 48);
  return m.CrossSection.circle(r, segmentsForRadius(r));
}

function frameOpening(m: ManifoldToplevel, shape: string, size: number, height: number, rim: number): CrossSection {
  if (shape === 'circle') {
    const r = size / 2 - rim;
    return m.CrossSection.circle(r, segmentsForRadius(r));
  }
  return frameOutline(m, shape, size, height).offset(-rim, 'Round', 2, 48);
}

/** Highest point of `outline` over the vertical line at x. */
function topAt(m: ManifoldToplevel, outline: CrossSection, x: number): number {
  const b = outline.bounds();
  const probe = m.CrossSection.square([0.02, b.max[1] - b.min[1] + 2], true).translate([x, (b.min[1] + b.max[1]) / 2]);
  const hit = outline.intersect(probe);
  return hit.isEmpty() ? b.max[1] : hit.bounds().max[1];
}

/**
 * The hanger: a loop on the frame's top, optionally standing on a Christmas
 * ornament's cap.
 *
 * The cap reaches down past the frame's edge at its CORNERS, not just at its
 * centre line. On a circle the edge falls away either side of the top, and a
 * cap that only met it at the middle would be joined along a tangent point --
 * a part that renders whole and snaps off the first time it is pulled.
 */
function buildHanger(
  m: ManifoldToplevel,
  outline: CrossSection,
  kind: string,
  holeD: number,
  wall: number,
): { solid: CrossSection; hole: CrossSection; centre: number } | null {
  if (kind === 'none') return null;
  const holeR = holeD / 2;
  const eyeR = holeR + wall;
  const top = outline.bounds().max[1];

  let solid: CrossSection;
  let cy: number;
  if (kind === 'cap') {
    const capW = 2 * eyeR + 2;
    const capH = Math.max(2, eyeR * 0.8);
    const bottom = topAt(m, outline, capW / 2) - CAP_BITE;
    const capTop = top + capH;
    const cap = roundedRect(m, capW, capTop - bottom, 0.6, 16).translate([0, (capTop + bottom) / 2]);
    cy = capTop + holeR + HOLE_CLEAR;
    solid = cap.add(m.CrossSection.circle(eyeR, segmentsForRadius(eyeR)).translate([0, cy]));
  } else {
    cy = top + holeR + HOLE_CLEAR;
    solid = m.CrossSection.circle(eyeR, segmentsForRadius(eyeR)).translate([0, cy]);
  }
  return {
    solid,
    hole: m.CrossSection.circle(holeR, segmentsForRadius(holeR)).translate([0, cy]),
    centre: cy,
  };
}

interface Body {
  readonly id: string;
  readonly name: string;
  /** What stands to the full thickness. Null for the backing alone, which is its own solid. */
  readonly section: CrossSection | null;
  readonly color: string;
  readonly backing?: boolean;
}

/**
 * Bodies of the same colour, welded into one.
 *
 * Frame and logo are only separate so they CAN take different filaments. Left
 * apart in one colour they are two solids sharing a wall, which shows as a seam
 * in the preview and goes to the slicer as two objects -- so unless the
 * colours actually differ, they are one section, unioned in 2D before
 * extruding, and print as one part.
 */
function byColour(bodies: readonly Body[]): Body[] {
  const out: Body[] = [];
  for (const b of bodies) {
    // The backing joins a colour as a FLAG, never as section: its outline is
    // the whole opening, and extruding that to full height alongside the rest
    // fills the space the logo stands in -- a second solid in the same place.
    const standing = b.backing ? null : b.section;
    if (!b.backing && (!standing || standing.isEmpty())) continue;
    const i = out.findIndex((o) => o.color.toLowerCase() === b.color.toLowerCase());
    if (i < 0) {
      out.push({ ...b, section: standing });
      continue;
    }
    const o = out[i]!;
    out[i] = {
      id: `${o.id}-${b.id}`,
      name: `${o.name} and ${b.name.toLowerCase()}`,
      section: o.section && standing ? o.section.add(standing) : (o.section ?? standing),
      color: o.color,
      backing: o.backing === true || b.backing === true,
    };
  }
  return out;
}

function partOf(c: Body, mesh: Part['mesh'], count: number): Part {
  // One colour is the whole keychain; several are one object of several bodies.
  return count === 1
    ? { id: 'keychain', name: 'Keychain', mesh, color: c.color }
    : { id: c.id, name: c.name, mesh, color: c.color, group: 'badge' };
}

/** A section as SVG path commands, Y flipped into page order. */
function sectionCommands(section: CrossSection, maxY: number, minX: number): PathCommand[][] {
  return section.toPolygons().map((poly) => {
    const cmds: PathCommand[] = poly.map(([x, y], i) => ({ type: i === 0 ? 'M' : 'L', x: x - minX, y: maxY - y }));
    cmds.push({ type: 'Z' });
    return cmds;
  });
}

function build(p: Params, ctx: BuildCtx): BuildResult {
  const { m } = ctx;
  const issues: Issue[] = [];

  const style = String(p.style);
  const shape = String(p.shape);
  // `size` is the long side of a rectangle and `height` the short one, so
  // flipping the orientation turns the same tag on end; set the other way
  // round, the bigger one is still taken as the long side.
  const long = Number(p.size);
  const vertical = shape === 'rectangle' && String(p.orientation) === 'vertical';
  const rim = Number(p.rim);
  const thickness = Number(p.thickness);
  const extend = String(p.overflow) === 'extend';
  const short = shape === 'rectangle' ? Number(p.height) : long;
  const size = vertical ? Math.min(long, short) : Math.max(long, short);
  const height = vertical ? Math.max(long, short) : Math.min(long, short);
  const openW = size - 2 * rim;
  const openH = height - 2 * rim;

  // ------------------------------------------------------------------ logo
  const traced = traceArtwork(
    p,
    ctx,
    // Fitted to the opening's box, so a logo in a long rectangle is sized by
    // whichever side it runs out of first.
    (pxW, pxH) => (Number(p.logoSize) / 100) * Math.min(openW / pxW, openH / pxH),
    'logoSize',
  );
  if ('issues' in traced) return { parts: [], issues: [...traced.issues] };
  const { trace } = traced.artwork;
  const art = traced.artwork.art.rotate(Number(p.logoAngle)).translate([Number(p.logoX), Number(p.logoY)]);

  // ----------------------------------------------------------------- frame
  const outline = frameOutline(m, shape, size, height);
  const opening = frameOpening(m, shape, size, height, rim);
  const hanger = buildHanger(m, outline, String(p.hanger), Number(p.holeDiameter), Number(p.loopWall));
  let frame = outline.subtract(opening);
  if (hanger) frame = frame.add(hanger.solid);

  // The logo as it will actually be made: trimmed to the opening, or allowed
  // past the rim, and never over the frame -- the two are separate bodies for
  // a two-colour print, so they must meet without overlapping.
  let logo = (extend ? art : art.intersect(opening)).subtract(frame);
  if (hanger) logo = logo.subtract(hanger.hole);
  if (hanger) frame = frame.subtract(hanger.hole);

  if (logo.isEmpty()) {
    issues.push({
      level: 'warn',
      message: 'None of the logo lands inside the frame. Move it back, or make it bigger.',
      paramIds: ['logoX', 'logoY', 'logoSize'],
    });
  }

  // -------------------------------------------------------------- bodies
  const parts: Part[] = [];
  const frameColor = String(p.frameColor);
  let whole: CrossSection;
  let bridgeCount = 0;
  let loose = 0;

  if (style === 'backed') {
    // The disc bites into the rim rather than stopping at its inner edge, so
    // the rim is welded to it by real overlap instead of a coplanar seam.
    const backing2d = opening.offset(Math.min(rim / 2, 1), 'Round', 2, 48);
    const backing = backing2d.extrude(Number(p.backThickness));
    whole = frame.add(logo).add(backing2d);
    const colours = byColour([
      { id: 'backing', name: 'Backing', section: backing2d, color: String(p.backColor), backing: true },
      { id: 'frame', name: 'Frame', section: frame, color: frameColor },
      { id: 'logo', name: 'Logo', section: logo, color: String(p.logoColor) },
    ]);
    for (const c of colours) {
      // A colour that includes the backing is the backing plus everything of
      // that colour standing on it, as one body. Any other colour stands ON the
      // backing, so it is trimmed back against it.
      const standing = c.section?.extrude(thickness);
      const solid = c.backing
        ? standing ? backing.add(standing) : backing
        : dropSlivers(m, standing!.subtract(backing), SLIVER_MM3);
      parts.push(partOf(c, serialize(solid), colours.length));
    }
  } else {
    let body: CrossSection;
    if (style === 'cutout') {
      body = frame.add(opening.subtract(art));
      if (extend) body = body.add(art.subtract(outline));
      if (hanger) body = body.subtract(hanger.hole);
    } else {
      body = frame.add(logo);
    }

    let bars: CrossSection | null = null;
    if (p.bridges === true) {
      const tied = bridgeLoose(m, body, Number(p.bridgeWidth));
      bridgeCount = tied.count;
      bars = tied.bars;
      body = tied.section;
      if (hanger) body = body.subtract(hanger.hole);
    }
    whole = body;
    loose = body.decompose().length - 1;

    if (style === 'cutout') {
      parts.push({ id: 'keychain', name: 'Keychain', mesh: serialize(body.extrude(thickness)), color: frameColor });
    } else {
      // The ties belong to the frame's body, less wherever they run over the
      // logo, so two colours still meet without overlapping.
      let frameBody = bars ? frame.add(bars.subtract(logo)) : frame;
      if (hanger) frameBody = frameBody.subtract(hanger.hole);
      const colours = byColour([
        { id: 'frame', name: 'Frame', section: frameBody, color: frameColor },
        { id: 'logo', name: 'Logo', section: logo, color: String(p.logoColor) },
      ]);
      for (const c of colours) parts.push(partOf(c, serialize(c.section!.extrude(thickness)), colours.length));
    }
  }

  // ------------------------------------------------------------ advisories
  const nozzle = Number(p.nozzle);
  if (loose > 0) {
    issues.push({
      level: 'warn',
      message:
        p.bridges === true
          ? `${loose} piece${loose === 1 ? '' : 's'} could not be tied in and will print loose.`
          : `${loose} piece${loose === 1 ? '' : 's'} of the logo touch${loose === 1 ? 'es' : ''} nothing and will fall out. Turn on Tie loose pieces in, or use the backed style.`,
      paramIds: ['bridges', 'style'],
    });
  }
  if (hasThinStrokes(whole, nozzle)) {
    issues.push({
      level: 'warn',
      message: `Parts of the logo are thinner than the ${nozzle} mm nozzle and may not print. Make it bigger, raise Detail, or raise Despeckle.`,
      paramIds: ['size', 'logoSize', 'detail', 'despeckle'],
    });
  }
  if (rim < MIN_RIM) {
    issues.push({ level: 'warn', message: `A rim under ${MIN_RIM} mm bends and snaps in a pocket.`, paramIds: ['rim'] });
  }
  if (thickness < 2.4) {
    issues.push({
      level: 'warn',
      message: 'Under about 2.4 mm a keychain snaps in a pocket. Raise the thickness.',
      paramIds: ['thickness'],
    });
  }
  const flooded = floodedIssue(trace);
  if (flooded) issues.push(flooded);

  // -------------------------------------------------------------- outputs
  const b = whole.bounds();
  const w = b.max[0] - b.min[0];
  const h = b.max[1] - b.min[1];
  const ab = (extend ? art : art.intersect(opening)).bounds();
  const readouts: Record<string, string> = {
    Size: `${w.toFixed(1)} x ${h.toFixed(1)} x ${thickness.toFixed(1)} mm`,
    Logo: `${(ab.max[0] - ab.min[0]).toFixed(1)} x ${(ab.max[1] - ab.min[1]).toFixed(1)} mm`,
    Pieces: loose === 0 ? 'One - it holds together' : `${loose + 1} - see the warnings`,
  };
  if (bridgeCount > 0) readouts.Ties = String(bridgeCount);
  if (trace.tileRemoved) readouts.Background = 'Dark tile removed';

  const svg = ringsToSvg(sectionCommands(whole, b.max[1], b.min[0]), {
    widthMm: w,
    heightMm: h,
    fill: frameColor,
    title: traced.artwork.bmp.name ?? 'Logo keychain',
  });

  return {
    parts,
    issues,
    readouts,
    vectors: [
      {
        id: 'svg',
        label: 'SVG',
        extension: 'svg',
        mime: 'image/svg+xml',
        title: 'The keychain outline as a vector file, in millimetres - for a laser or vinyl cutter',
        data: svg,
      },
    ],
  };
}

export const logoKeychainGenerator: Generator = {
  id: 'logo-keychain',
  name: 'Logo keychain',
  description: 'Drop in an SVG logo and get an ornament-style keychain: the logo set in a ring, on a disc, or cut out of one.',
  tagline: 'Any SVG logo, framed and ready to hang',
  highlights: [
    'Upload an SVG (or PNG/JPG) and it is traced for you',
    'Open ring, backed disc, or cut-out styles',
    'Circle, hexagon or rounded-square frame',
    'Loose pieces tied in automatically',
    'Ornament cap and loop, or a plain loop',
  ],
  art: `<svg viewBox="0 0 120 96" role="img" aria-hidden="true">
    <defs><linearGradient id="lk-p" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f5c518"/><stop offset="1" stop-color="#e08a12"/>
    </linearGradient></defs>
    <circle cx="60" cy="12" r="5" fill="none" stroke="#9aa3b2" stroke-width="2.6"/>
    <rect x="54" y="16" width="12" height="7" rx="1.5" fill="#9aa3b2"/>
    <circle cx="60" cy="56" r="34" fill="none" stroke="url(#lk-p)" stroke-width="6"/>
    <path d="M70 26 L46 60 H60 L50 86 L76 50 H62 Z" fill="url(#lk-p)"/>
  </svg>`,
  params: logoKeychainParams,
  groups: logoKeychainGroups,
  imagesNeeded: (p) => [String(p.image ?? '')].filter((s) => s.length > 0),
  validate: (p) => {
    const out: Issue[] = [];
    if (String(p.image ?? '').length === 0) {
      out.push({ level: 'error', message: 'Drop a logo in - an SVG works best.', paramIds: ['image'] });
    }
    const shortest = String(p.shape) === 'rectangle' ? Math.min(Number(p.size), Number(p.height)) : Number(p.size);
    if (shortest - 2 * Number(p.rim) < 6) {
      out.push({ level: 'error', message: 'The rim is so wide there is no room left for the logo.', paramIds: ['rim', 'size', 'height'] });
    }
    if (String(p.style) === 'backed' && Number(p.backThickness) >= Number(p.thickness)) {
      out.push({
        level: 'error',
        message: 'The backing is as thick as the whole keychain, so the logo would not stand above it.',
        paramIds: ['backThickness', 'thickness'],
      });
    }
    return out;
  },
  build,
};
