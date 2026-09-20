import type { CrossSection } from 'manifold-3d';
import { roundedRect, slot } from '../../core/kernel/primitives';
import { serialize } from '../../core/kernel/serialize';
import type { BuildCtx, BuildResult, Generator, Issue, Params, Part } from '../../core/params/types';
import {
  hasThinStrokes,
  measureTextWidth,
  missingCharacters,
  multilineTextOutline,
  stackedTextOutline,
  textOutline,
} from '../../core/text/textSolid';
import { nameTagGroups, nameTagParams } from './schema';
import { plateSection, safeArea, tabSection } from './shapes';
import { resolveStyle, type Style } from './templates';

const MIN_WALL = 1.2; // mm of plate left around a hole
// Clearance the lettering keeps from a plate edge. Deliberately smaller than
// MIN_WALL: a hole is a tear-out risk under load, an edge next to a letter is
// only a look, and 1 mm is what a desk plate has always been allowed.
const TEXT_MARGIN = 1;

function lines(raw: string): string[] {
  return raw.split(/\r?\n/).slice(0, 2);
}

/** The second line's text, whichever way it is being composed. */
export function secondLineText(p: Params): string {
  switch (String(p.secondLine)) {
    case 'gradeSection':
      return [String(p.grade ?? ''), String(p.section ?? '')]
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .join(' ');
    case 'custom':
      return String(p.secondLineText ?? '').trim();
    default:
      return '';
  }
}

function holeSection(
  ctx: BuildCtx,
  kind: string,
  diameter: number,
  plateW: number,
  plateH: number,
  edgeOffset: number,
  position: string,
): { section: CrossSection; centre: [number, number] } | null {
  if (kind === 'none' || kind === 'tab') return null;
  const { m } = ctx;
  const r = diameter / 2;
  const base = kind === 'slot' ? slot(m, diameter * 2, diameter) : m.CrossSection.circle(r, 48);

  // Offset the hole by its OWN half-extent along the axis it is being pushed
  // in, not by a nominal radius: a slot is twice as long as it is wide, so
  // measuring a side slot by its radius buries half of it in the edge.
  const halfX = kind === 'slot' ? diameter : r;
  let cx = 0;
  let cy = 0;
  if (position === 'left') cx = -plateW / 2 + edgeOffset + halfX;
  else if (position === 'right') cx = plateW / 2 - edgeOffset - halfX;
  else cy = plateH / 2 - edgeOffset - r;

  return { section: base.translate([cx, cy]), centre: [cx, cy] };
}

/**
 * The raised frame, and the region left inside it for lettering.
 *
 * `trace` offsets the plate silhouette inward, which is what a lobed outline
 * needs -- a cloud wants a cloud-shaped frame. `rect` insets a rounded
 * rectangle instead, and drops its top edge clear of a top-mounted hole, which
 * is why the square and capsule tags get a frame rather than a shadow of
 * themselves.
 */
function frameRing(
  ctx: BuildCtx,
  style: Style,
  basePlate: CrossSection,
  plateW: number,
  plateH: number,
  topReserve: number,
): { ring: CrossSection; inside: CrossSection } | null {
  const { m } = ctx;
  if (style.frame === 'none') return null;

  let outer: CrossSection;
  if (style.frame === 'rect') {
    const w = plateW - 2 * style.frameGap;
    const h = plateH - 2 * style.frameGap - topReserve;
    if (!(w > 2 * style.frameWidth) || !(h > 2 * style.frameWidth)) return null;
    // Inset from the BOUNDING BOX, which is only the same as inset from the
    // plate when the plate is itself a rounded rectangle. On anything with a
    // round end -- the capsule -- the corners of that rectangle are outside
    // the plate, and the ring gets added to the solid without anything
    // clipping it, so the frame runs out past the edge as a square ledge.
    // Intersecting puts the frame back inside and keeps its gap: it stays the
    // rectangle it is meant to be down the long sides, and follows the plate
    // around the ends.
    outer = roundedRect(m, w, h, Math.max(0, style.corner - style.frameGap))
      .translate([0, -topReserve / 2])
      .intersect(basePlate.offset(-style.frameGap, 'Round', 2, 32));
  } else {
    outer = basePlate.offset(-style.frameGap, 'Round', 2, 32);
  }

  const inside = outer.offset(-style.frameWidth, 'Round', 2, 32);
  const ring = outer.subtract(inside);
  if (!(ring.area() > 0.01) || !(inside.area() > 0.01)) return null;
  return { ring, inside };
}

function build(p: Params, ctx: BuildCtx): BuildResult {
  const { m } = ctx;
  const issues: Issue[] = [];

  const textLines = lines(String(p.text ?? ''));
  const fnt = ctx.font(String(p.font));

  const capHeight = Number(p.fontSize);
  const letterSpacingMm = Number(p.letterSpacing);
  const thickness = Number(p.thickness);
  const textMode = String(p.textMode);
  const textDepth = Number(p.textDepth);
  const nozzle = Number(p.nozzle);

  // ---------------------------------------------------------------- text 2D
  // Stacked runs the whole text down one column, so the line break stops being
  // a line break and becomes just another gap in the run.
  const nameBlock =
    String(p.textDirection) === 'vertical'
      ? stackedTextOutline(m, fnt, textLines.join(' '), {
          capHeightMm: capHeight,
          letterSpacingMm,
          tolerance: ctx.tolerance,
          lineGapMm: Number(p.lineGap),
        })
      : multilineTextOutline(m, fnt, textLines, {
          capHeightMm: capHeight,
          letterSpacingMm,
          tolerance: ctx.tolerance,
          lineGapMm: Number(p.lineGap),
          align: String(p.align) as 'left' | 'center' | 'right',
        });

  // Unmapped characters resolve to .notdef, which has a box outline -- so
  // without this they would silently print as solid rectangles.
  const reportMissing = (font: typeof fnt, s: string, paramIds: string[]): void => {
    const missing = missingCharacters(font, s);
    if (missing.length > 0) {
      issues.push({
        level: 'warn',
        message: `This font has no glyph for ${missing.map((c) => `"${c}"`).join(', ')} - those characters would print as boxes. Pick another font or remove them.`,
        paramIds,
      });
    }
  };
  reportMissing(fnt, textLines.join(''), ['font', 'text']);

  // --- the optional second line, set smaller and hung under the name
  const second = secondLineText(p);
  let glyphs = nameBlock;
  let secondHeight = 0;
  if (second.length > 0) {
    const secondFont = ctx.font(String(p.secondLineFont));
    reportMissing(secondFont, second, ['secondLineFont', 'secondLineText', 'grade', 'section']);
    const secondSize = Number(p.secondLineSize);
    try {
      const line = textOutline(m, secondFont, {
        text: second,
        capHeightMm: secondSize,
        letterSpacingMm,
        tolerance: ctx.tolerance,
      });
      const nb = nameBlock.bounds();
      const sb = line.bounds();
      secondHeight = sb.max[1] - sb.min[1];
      const placed = line.translate([0, nb.min[1] - Number(p.secondLineGap) - sb.max[1]]);
      const joined = m.CrossSection.union([nameBlock, placed]);
      const jb = joined.bounds();
      glyphs = joined.translate([
        -(jb.min[0] + jb.max[0]) / 2,
        -(jb.min[1] + jb.max[1]) / 2,
      ]);
    } catch {
      issues.push({
        level: 'warn',
        message: 'The second line produced no printable outline and was skipped.',
        paramIds: ['secondLine'],
      });
    }
  } else if (String(p.secondLine) !== 'none') {
    issues.push({
      level: 'warn',
      message: 'The second line is switched on but empty.',
      paramIds: ['grade', 'section', 'secondLineText'],
    });
  }

  if (hasThinStrokes(glyphs, nozzle)) {
    issues.push({
      level: 'warn',
      message: `Some strokes are thinner than the ${nozzle} mm nozzle and may not print.${secondHeight > 0 ? ' The second line is the usual culprit - it is the smallest text on the tag.' : ''} Increase the text size or pick a bolder font.`,
      paramIds: secondHeight > 0 ? ['font', 'fontSize', 'secondLineSize'] : ['font', 'fontSize'],
    });
  }

  const tb = glyphs.bounds();
  const textW = tb.max[0] - tb.min[0];
  const textH = tb.max[1] - tb.min[1];

  // --------------------------------------------------------------- plate 2D
  const style = resolveStyle(String(p.template), capHeight, {
    shape: String(p.shape),
    corner: Number(p.cornerRadius),
    border: p.border === true,
    borderWidth: Number(p.borderWidth),
    borderGap: Number(p.borderGap),
    hole: String(p.hole),
    holePosition: String(p.holePosition),
  });

  const holeD = Number(p.holeDiameter);
  const holeEdge = Number(p.holeEdgeOffset);
  const auto = String(p.sizeMode) === 'auto';
  const frameInset = style.frame === 'none' ? 0 : style.frameGap + style.frameWidth;

  const topHole = style.holePosition === 'top' && style.hole !== 'none' && style.hole !== 'tab';

  // A traced frame follows the silhouette all the way round, so a hole at its
  // default distance from the edge lands ON the rim and takes a bite out of
  // it -- and a rim with a gap in it looks like a mistake, not a hole. Push
  // the hole in past the rim instead, into the field the frame encloses,
  // which is where a shop-bought tag puts it. Only ever inward: a user who
  // has deliberately set a bigger offset keeps it.
  const holeInField = topHole && style.frame === 'trace';
  const effHoleEdge = holeInField ? Math.max(holeEdge, frameInset + MIN_WALL) : holeEdge;

  // A lobed outline cannot be written on edge to edge: a bubble's valleys bite
  // into the middle of the top and bottom edges, and a cloud is all puffs
  // above the waist. So auto sizing divides by the fraction of the plate that
  // can be written in.
  //
  // The PADDING is divided along with the text, because it is measured inside
  // the writable area; the FRAME is added outside it, because it is a uniform
  // offset from the outline and so grows the plate one for one. Dividing the
  // text alone -- and leaving the padding to be added outside, where there is
  // nothing to hold it -- is what put the lettering through the frame on the
  // deeper shapes.
  const safe = safeArea(style.shape);
  let plateW = auto
    ? (textW + 2 * Number(p.padX)) / safe.x + 2 * frameInset
    : Number(p.width);
  // Height before any allowance for the hole. The allowance is measured
  // against this, so it has to exist first.
  const plateH0 = auto
    ? (textH + 2 * Number(p.padY)) / safe.y + 2 * frameInset
    : Number(p.height);

  // A hole at the top steals a band of the plate. Reserving it here, and
  // pushing the lettering down by half of it, keeps the text centred in the
  // space it actually has rather than centred in the outline.
  //
  // What that costs depends on where the hole sits. Through a 'rect' frame it
  // is the frame's own top edge that has to drop clear of the hole, whatever
  // the lettering is doing. Anywhere else it is the LETTERING that has to
  // clear it -- so the only question is whether the lettering reaches that
  // high, and a shape that keeps its writing surface low has already paid for
  // it. That is why the cloud, whose text sits under the puffs, costs nothing
  // here while a symmetric blob still pays.
  const textTop = safe.cy * plateH0 + textH / 2;
  const holeBottom = plateH0 / 2 - effHoleEdge - holeD;
  const topReserve = !topHole
    ? 0
    : style.frame === 'rect'
      ? Math.max(0, holeEdge + holeD + MIN_WALL - style.frameGap)
      : Math.max(0, textTop + MIN_WALL - holeBottom);

  const plateH = auto ? plateH0 + topReserve : plateH0;

  // Some shapes are only themselves at a certain proportion. A cloud that has
  // grown as tall as it is wide -- which a name over a second line will do to
  // it -- has no room left for puffs worth the name, and comes out a lumpy
  // square. Widening costs nothing but margin either side of the lettering,
  // where a squarer plate costs the shape.
  if (auto && safe.minAspect > 0) plateW = Math.max(plateW, safe.minAspect * plateH);

  const basePlate = plateSection(m, style.shape, plateW, plateH, style.corner);
  let plate2d = basePlate;

  const hole = holeSection(ctx, style.hole, holeD, plateW, plateH, effHoleEdge, style.holePosition);

  // The hole steals width from the text when it sits beside it, so shift the
  // lettering clear rather than letting them collide.
  let textShiftX = 0;
  if (hole && style.holePosition !== 'top' && auto) {
    const dir = style.holePosition === 'left' ? 1 : -1;
    textShiftX = (dir * (holeD + effHoleEdge + MIN_WALL)) / 2;
  }
  const placedGlyphs = glyphs.translate([textShiftX, safe.cy * plateH - topReserve / 2]);

  if (hole) {
    plate2d = plate2d.subtract(hole.section);
    const grown = hole.section.offset(MIN_WALL, 'Round', 2, 24);
    if (grown.subtract(basePlate).area() > 0.01) {
      issues.push({
        level: 'error',
        message: `The hole leaves less than ${MIN_WALL} mm of plate around it. Move it further from the edge or make it smaller.`,
        paramIds: ['holeDiameter', 'holeEdgeOffset'],
      });
    }
  }

  // --------------------------------------------------------------- frame 2D
  const frame = frameRing(ctx, style, basePlate, plateW, plateH, topReserve);
  if (style.frame !== 'none' && !frame) {
    issues.push({
      level: 'warn',
      message: 'The frame is too wide for this plate and was skipped.',
      paramIds: ['borderWidth', 'borderGap', 'template'],
    });
  }

  // ------------------------------------------------------------- validation
  // One check for every shape and both size modes: does the lettering actually
  // land on plastic? A rectangle makes this obvious and a cloud does not.
  let room = frame ? frame.inside : basePlate.offset(-TEXT_MARGIN, 'Round', 2, 24);
  // The hole is a hazard for the lettering too, not just for the plate edge.
  if (hole) room = room.subtract(hole.section.offset(MIN_WALL, 'Round', 2, 24));
  if (placedGlyphs.subtract(room).area() > 0.05) {
    issues.push({
      level: 'error',
      message: auto
        ? 'The lettering does not fit inside this shape. Reduce the text size, or raise the padding.'
        : 'The text is bigger than the plate. Reduce the text size or switch to "Fit to text".',
      paramIds: auto
        ? ['fontSize', 'secondLineSize', 'padX', 'padY']
        : ['fontSize', 'width', 'height'],
    });
  }
  if (textMode === 'engraved' && textDepth >= thickness) {
    issues.push({
      level: 'error',
      message: 'Engraving is as deep as the plate is thick - it would cut straight through.',
      paramIds: ['textDepth', 'thickness'],
    });
  }

  // ------------------------------------------------------------------- 3D
  let plate = plate2d.extrude(thickness);

  // The tab is added AFTER the frame is worked out, so the frame stays on the
  // plate and does not run up around the loop.
  if (style.hole === 'tab') {
    const tab = tabSection(m, plateW, plateH, holeD);
    plate = plate.add(tab.outline.extrude(thickness)).subtract(
      tab.hole.extrude(thickness + 2).translate([0, 0, -1]),
    );
  }

  if (frame) {
    // Frames stand as tall as the lettering does, so a filament swap at that
    // layer catches both at once.
    const lift = textMode === 'raised' ? textDepth : Math.max(0.6, textDepth);
    const ring = hole ? frame.ring.subtract(hole.section.offset(MIN_WALL, 'Round', 2, 24)) : frame.ring;
    if (ring.area() > 0.01) plate = plate.add(ring.extrude(thickness + lift));
  }

  const parts: Part[] = [];
  const plateColor = String(p.plateColor);

  if (textMode === 'cutout') {
    const cutter = placedGlyphs.extrude(thickness + 2).translate([0, 0, -1]);
    parts.push({
      id: 'plate',
      name: 'Name tag',
      mesh: serialize(plate.subtract(cutter)),
      color: plateColor,
    });
  } else if (textMode === 'engraved') {
    // Overshoot upward so the cutter's top face is never coplanar with the
    // plate's top face.
    const cutter = placedGlyphs.extrude(textDepth + 1).translate([0, 0, thickness - textDepth]);
    parts.push({
      id: 'plate',
      name: 'Name tag',
      mesh: serialize(plate.subtract(cutter)),
      color: plateColor,
    });
  } else {
    // Raised: extrude the lettering from z=0 through the plate so the union
    // has a solid overlap rather than a knife-edge coplanar contact, then
    // keep it as its own part so it can carry its own colour.
    const rawText = placedGlyphs.extrude(thickness + textDepth);
    const textSolid = rawText.subtract(plate);
    parts.push({
      id: 'plate',
      name: 'Plate',
      mesh: serialize(plate),
      color: plateColor,
      group: 'tag',
    });
    parts.push({
      id: 'lettering',
      name: 'Lettering',
      mesh: serialize(textSolid),
      color: String(p.textColor),
      // Same group as the plate: raised lettering sits ON the plate and is
      // printed with it via a filament swap, not as a separate part.
      group: 'tag',
    });
  }

  const readouts: Record<string, string> = {
    Size: `${plateW.toFixed(1)} x ${plateH.toFixed(1)} x ${(thickness + (textMode === 'raised' ? textDepth : 0)).toFixed(1)} mm`,
    Text: `${textW.toFixed(1)} x ${textH.toFixed(1)} mm`,
  };
  if (second.length > 0) readouts['Second line'] = second;
  if (style.hole === 'tab') readouts['Overall height'] = `${(plateH + holeD * 2.4).toFixed(1)} mm with the tab`;

  return { parts, issues, readouts };
}

export const nameTagGenerator: Generator = {
  id: 'nametag',
  name: 'Name tag',
  description: 'Text on a plate, with an optional second line, raised frame and hanging hole.',
  tagline: 'School bag tags and name plates, in any font you can load',
  highlights: [
    'Five ready-made shapes: classic, cloud, scallop, bubble, capsule',
    'Optional grade-and-section line under the name',
    'Lettering across, or stacked one letter per line',
    'Two-colour export, ready for a filament swap',
    'Any .ttf, .otf or .woff you drop in',
  ],
  art: `<svg viewBox="0 0 120 96" role="img" aria-hidden="true">
    <defs><linearGradient id="nt-p" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4c9ffe"/><stop offset="1" stop-color="#2f6fb3"/>
    </linearGradient></defs>
    <rect x="10" y="22" width="100" height="52" rx="13" fill="url(#nt-p)"/>
    <rect x="49" y="26" width="22" height="4" rx="2" fill="#14161a" fill-opacity="0.45"/>
    <rect x="17" y="35" width="86" height="33" rx="9" fill="none"
      stroke="#f2f4f8" stroke-opacity="0.85" stroke-width="2.6"/>
    <text x="60" y="54" text-anchor="middle" font-size="19" font-weight="700"
      font-family="ui-sans-serif, system-ui, sans-serif" fill="#f2f4f8">EMMA</text>
    <text x="60" y="64" text-anchor="middle" font-size="8"
      font-family="ui-sans-serif, system-ui, sans-serif" fill="#f2f4f8"
      fill-opacity="0.9">Grade 1 Rose</text>
  </svg>`,
  params: nameTagParams,
  groups: nameTagGroups,
  fontsNeeded: (p) =>
    secondLineText(p).length > 0
      ? [String(p.font), String(p.secondLineFont)]
      : [String(p.font)],
  validate: (p) => {
    const out: Issue[] = [];
    if (String(p.text ?? '').trim().length === 0) {
      out.push({ level: 'error', message: 'Enter some text.', paramIds: ['text'] });
    }
    if (secondLineText(p).length > 0 && Number(p.secondLineSize) >= Number(p.fontSize)) {
      out.push({
        level: 'warn',
        message: 'The second line is as big as the name. It is meant to read as secondary.',
        paramIds: ['secondLineSize', 'fontSize'],
      });
    }
    return out;
  },
  build,
  presets: [
    {
      label: 'School tag - Classic',
      values: {
        template: 'classic', text: 'EMMA', secondLine: 'gradeSection',
        grade: 'Grade 1', section: 'Rose', fontSize: 14, secondLineSize: 5.5,
        plateColor: '#cfd0e8', textColor: '#ffffff', thickness: 3, textDepth: 1,
      },
    },
    {
      label: 'School tag - Cloud',
      values: {
        template: 'cloud', text: 'Lucas', font: 'pacifico', secondLine: 'gradeSection',
        grade: 'Prep', section: 'Blue', fontSize: 15, secondLineSize: 5.5,
        plateColor: '#f3bd80', textColor: '#fdf4e8', thickness: 3, textDepth: 1,
      },
    },
    {
      label: 'School tag - Scallop',
      values: {
        template: 'scallop', text: 'BENJAMIN', secondLine: 'gradeSection',
        grade: 'Grade 2', section: 'Jade', fontSize: 13, secondLineSize: 5,
        plateColor: '#bcdd5c', textColor: '#f5fae2', thickness: 3, textDepth: 1,
      },
    },
    {
      label: 'School tag - Bubble',
      values: {
        template: 'bubble', text: 'AMELIA', secondLine: 'gradeSection',
        grade: 'Grade 3', section: 'Ruby', fontSize: 14, secondLineSize: 5.5,
        plateColor: '#f4b2cb', textColor: '#fff4f8', thickness: 3, textDepth: 1,
      },
    },
    {
      label: 'School tag - Capsule',
      values: {
        template: 'capsule', text: 'NOAH', secondLine: 'gradeSection',
        grade: 'Kindergarten', section: 'Sun', fontSize: 14, secondLineSize: 5,
        plateColor: '#7ed1ec', textColor: '#f2fbff', thickness: 3, textDepth: 1,
      },
    },
    {
      label: 'Desk name plate',
      values: { text: 'A. Engineer', sizeMode: 'fixed', width: 112, height: 30, fontSize: 13 },
    },
    {
      label: 'Luggage tag',
      values: { text: 'J. Smith\n555-0100', hole: 'round', holePosition: 'left', fontSize: 7, lineGap: 2 },
    },
    {
      label: 'Engraved keyring',
      values: { text: 'Spare', textMode: 'engraved', shape: 'pill', hole: 'round', fontSize: 8 },
    },
  ],
};

export function measureFor(p: Params, fnt: Parameters<typeof measureTextWidth>[0]): number {
  return measureTextWidth(fnt, {
    text: lines(String(p.text ?? '')).join(''),
    capHeightMm: Number(p.fontSize),
    letterSpacingMm: Number(p.letterSpacing),
  });
}
