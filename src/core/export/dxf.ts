import type { Vec2 } from '../text/flatten';

/**
 * Minimal DXF R12 (AC1009) writer: closed polylines, one unit per millimetre.
 *
 * R12 rather than anything newer, and POLYLINE/VERTEX/SEQEND rather than
 * LWPOLYLINE, because that combination is the one every CAD package reads
 * without argument -- including Fusion 360's Insert > DXF, which is the whole
 * point of this file existing. LWPOLYLINE is smaller and would be a lie in a
 * file stamped AC1009; a newer stamp drags in CLASSES and OBJECTS sections that
 * this has no business inventing.
 *
 * Everything is flattened to straight segments before it gets here. A DXF ARC
 * or SPLINE would be prettier in the sketch, but the geometry has already been
 * resolved by Clipper2 into polygons by that point, and re-fitting arcs to them
 * would be guessing at curves the kernel no longer has. Fusion is perfectly
 * happy extruding a dense polyline, and what it extrudes is then exactly what
 * the printed part is.
 *
 * DXF has no unit of its own: the numbers are bare. $INSUNITS says millimetres
 * for readers that look, and the caller is writing millimetres either way, so
 * an importer that ignores it and assumes mm still lands on the right size.
 */

/** DXF group code / value pair. */
function pair(code: number, value: string | number): string {
  return `${code}\n${value}\n`;
}

function num(v: number): string {
  // Six decimals is well under any CAD tolerance at millimetre scale, and keeps
  // a 40k-vertex voronoi panel from becoming a 10MB text file.
  const s = v.toFixed(6).replace(/\.?0+$/, '');
  return s === '' || s === '-0' ? '0' : s;
}

/**
 * A named group of rings.
 *
 * Layers, rather than one flat pile of curves, because that is the difference
 * between a usable import and a puzzle: Fusion lists them on the way in, so the
 * panel outline and the pattern arrive as things you can select, hide and
 * extrude separately.
 */
export interface DxfLayer {
  readonly name: string;
  readonly rings: readonly (readonly Vec2[])[];
}

export interface DxfOptions {
  /** Written into $EXTMIN/$EXTMAX so the sketch opens framed on the geometry. */
  readonly bounds?: { readonly min: Vec2; readonly max: Vec2 };
}

/** Closed rings in millimetres -> a DXF document. */
export function writeDxf(layers: readonly DxfLayer[], opts: DxfOptions = {}): string {
  const live = layers
    .map((l) => ({ name: sanitizeLayer(l.name), rings: l.rings.filter((r) => r.length >= 3) }))
    .filter((l) => l.rings.length > 0);
  const bounds = opts.bounds ?? boundsOf(live.flatMap((l) => l.rings));

  let out = '';

  out += pair(0, 'SECTION') + pair(2, 'HEADER');
  out += pair(9, '$ACADVER') + pair(1, 'AC1009');
  // 4 = millimetres. R12 predates the variable, so readers that do not know it
  // skip it; readers that do get told the truth.
  out += pair(9, '$INSUNITS') + pair(70, 4);
  out += pair(9, '$EXTMIN') + pair(10, num(bounds.min[0])) + pair(20, num(bounds.min[1])) + pair(30, '0');
  out += pair(9, '$EXTMAX') + pair(10, num(bounds.max[0])) + pair(20, num(bounds.max[1])) + pair(30, '0');
  out += pair(0, 'ENDSEC');

  // Some importers refuse geometry on a layer the table never declared, so
  // every layer used below is declared here first.
  out += pair(0, 'SECTION') + pair(2, 'TABLES');
  out += pair(0, 'TABLE') + pair(2, 'LAYER') + pair(70, Math.max(1, live.length));
  live.forEach((l, i) => {
    // Colour 7 is "by background", 1..6 are the standard ACI primaries. Giving
    // each layer its own keeps them apart visually on import.
    out += pair(0, 'LAYER') + pair(2, l.name) + pair(70, 0) + pair(62, 1 + (i % 6)) + pair(6, 'CONTINUOUS');
  });
  out += pair(0, 'ENDTAB');
  out += pair(0, 'ENDSEC');

  out += pair(0, 'SECTION') + pair(2, 'ENTITIES');
  for (const l of live) {
    for (const ring of l.rings) {
      // 66 = "vertices follow", 70 bit 1 = closed. Without the closed flag every
      // ring arrives in Fusion as an open profile and nothing can be extruded.
      out += pair(0, 'POLYLINE') + pair(8, l.name) + pair(66, 1) + pair(70, 1);
      out += pair(10, '0') + pair(20, '0') + pair(30, '0');
      for (const [x, y] of ring) {
        out += pair(0, 'VERTEX') + pair(8, l.name);
        out += pair(10, num(x)) + pair(20, num(y)) + pair(30, '0');
      }
      out += pair(0, 'SEQEND') + pair(8, l.name);
    }
  }
  out += pair(0, 'ENDSEC');

  out += pair(0, 'EOF');
  return out;
}

/** Layer names cannot carry the characters DXF uses structurally. */
function sanitizeLayer(name: string): string {
  const cleaned = name.toUpperCase().replace(/[^A-Z0-9_-]+/g, '_').slice(0, 31);
  return cleaned.length > 0 ? cleaned : 'PATTERN';
}

function boundsOf(rings: readonly (readonly Vec2[])[]): { min: Vec2; max: Vec2 } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return { min: [0, 0], max: [0, 0] };
  return { min: [minX, minY], max: [maxX, maxY] };
}
