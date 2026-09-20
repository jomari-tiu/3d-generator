import type { CrossSection, ManifoldToplevel } from 'manifold-3d';
import { commandsToRings, type PathCommand, type Vec2 } from '../text/flatten';
import { xsec } from '../kernel/manifold';
import { transformCommands } from './simplify';

export class EmptyTraceError extends Error {
  constructor() {
    super('That image traced to nothing printable.');
    this.name = 'EmptyTraceError';
  }
}

/**
 * Traced rings -> a 2D section in millimetres, Y up and centred on the origin.
 *
 * The rings go through commandsToRings -- the same flattener the font pipeline
 * uses -- for two reasons beyond not writing it twice. It already negates Y,
 * which is exactly the image-space-to-model-space flip needed here, and its
 * bezier subdivision is driven by the SAME mm tolerance the rest of the build
 * runs at, so a curve traced off a photo is no coarser than a letterform.
 *
 * NonZero, as with glyphs: the tracer emits outer boundaries and hole
 * boundaries with opposite winding, and the fill rule turns that into hollowed
 * counters with no containment analysis. CrossSection's own default is
 * 'Positive', which would silently swallow every hole in the image.
 */
export function sectionFromRings(
  m: ManifoldToplevel,
  rings: readonly (readonly PathCommand[])[],
  opts: { readonly mmPerPixel: number; readonly tolerance: number; readonly center?: boolean },
): CrossSection {
  const all: Vec2[][] = [];
  for (const cmds of rings) {
    const scaled = transformCommands(cmds, opts.mmPerPixel);
    for (const ring of commandsToRings(scaled, opts.tolerance)) all.push(ring);
  }
  if (all.length === 0) throw new EmptyTraceError();

  let cs = xsec(m, all, 'NonZero');
  if (!(cs.area() > 0)) throw new EmptyTraceError();
  cs = cs.simplify(opts.tolerance * 0.25);

  if (opts.center !== false) {
    const b = cs.bounds();
    cs = cs.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]);
  }
  return cs;
}
