import type { CrossSection, ManifoldToplevel } from 'manifold-3d';

type Pt = readonly [number, number];

/** Most ties one build will add. Past this the trace is noise, not a logo. */
const MAX_TIES = 48;

/** Closest point to p on the segment a-b. */
function closestOnSegment(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return a;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return [a[0] + t * dx, a[1] + t * dy];
}

/**
 * The closest pair of points between two sets of polygons, one on each.
 *
 * Vertex-to-SEGMENT both ways, not vertex to vertex: a traced logo is mostly
 * long straight runs with few vertices on them, and the nearest pair of
 * vertices can sit well round a corner from where the two outlines actually
 * come closest -- which would hang the tie at an angle across the gap.
 */
function nearestPair(a: readonly (readonly Pt[])[], b: readonly (readonly Pt[])[]): { p: Pt; q: Pt; d: number } {
  let best = { p: [0, 0] as Pt, q: [0, 0] as Pt, d: Infinity };
  const sweep = (from: readonly (readonly Pt[])[], to: readonly (readonly Pt[])[], flip: boolean): void => {
    for (const poly of from) {
      for (const v of poly) {
        for (const ring of to) {
          for (let i = 0; i < ring.length; i++) {
            const c = closestOnSegment(v, ring[i]!, ring[(i + 1) % ring.length]!);
            const d = Math.hypot(c[0] - v[0], c[1] - v[1]);
            if (d < best.d) best = flip ? { p: c, q: v, d } : { p: v, q: c, d };
          }
        }
      }
    }
  };
  sweep(a, b, false);
  sweep(b, a, true);
  return best;
}

/**
 * A straight bar from p to q, carried on past both ends so it overlaps what it
 * joins by real area. Stopping exactly at the two outlines would join them
 * along a line, which slices as two pieces sitting side by side.
 */
function tieBar(m: ManifoldToplevel, p: Pt, q: Pt, width: number): CrossSection {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const len = Math.hypot(dx, dy);
  const bite = width / 2 + 0.3;
  if (len < 1e-6) return m.CrossSection.circle(bite, 24).translate([p[0], p[1]]);
  return m.CrossSection.square([len + 2 * bite, width], true)
    .rotate((Math.atan2(dy, dx) * 180) / Math.PI)
    .translate([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
}

const extent = (s: CrossSection): number => {
  const b = s.bounds();
  return (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]);
};

/**
 * Tie every loose piece of `section` to the main body with a straight bar.
 *
 * The main body is the piece with the biggest footprint -- the frame, which
 * encloses everything else. Each round ties in whichever loose piece is
 * CLOSEST to it, then looks again: a tie can cross another loose piece and
 * catch it on the way, and a dot inside an O is better tied to the O once the
 * O is in than across it to the rim.
 */
export function bridgeLoose(
  m: ManifoldToplevel,
  section: CrossSection,
  width: number,
): { section: CrossSection; bars: CrossSection | null; count: number } {
  let s = section;
  let bars: CrossSection | null = null;
  let count = 0;

  for (; count < MAX_TIES; count++) {
    const pieces = s.decompose();
    if (pieces.length <= 1) break;

    let main = 0;
    for (let i = 1; i < pieces.length; i++) if (extent(pieces[i]!) > extent(pieces[main]!)) main = i;
    const mainPolys = pieces[main]!.toPolygons();

    let best: { p: Pt; q: Pt; d: number } | null = null;
    for (let i = 0; i < pieces.length; i++) {
      if (i === main) continue;
      const pair = nearestPair(pieces[i]!.toPolygons(), mainPolys);
      if (!best || pair.d < best.d) best = pair;
    }
    if (!best) break;

    const bar = tieBar(m, best.p, best.q, width);
    bars = bars ? bars.add(bar) : bar;
    s = s.add(bar);
  }

  return { section: s, bars, count };
}
