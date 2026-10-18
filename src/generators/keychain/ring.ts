import type { CrossSection, ManifoldToplevel } from 'manifold-3d';
import type { Direction } from './lettering';

/**
 * The keyring lug: an eye on the end of the word, with a neck that bites into
 * whatever is there.
 *
 * "Whatever is there" is the hard part. On a backed keychain the lug meets a
 * smooth silhouette and anywhere along it will do. On a solid one it has to
 * meet a LETTER, and a letter is mostly not there: an "A" has material at the
 * far left only down at the baseline, a "T" only up at the cap line, and a lug
 * hung at mid-height off either of them is a ring that falls off in the box.
 *
 * So nothing here is assumed about where the body starts, how thick it is or
 * what shape its edge has. All three are measured: the attachment height is
 * the one whose band picks up the most material, the neck is sized to the
 * material it finds there, and it is then driven in until it has eaten a set
 * AREA out of the body -- not until it reaches a set depth, and not until it
 * merely touches. That keeps the stub short on a "P", lets it run in under the
 * arch of an "A", and makes it chase a curve as far as the curve costs,
 * without any of the three being special-cased.
 */

export interface RingOpts {
  readonly holeD: number;
  /** Ring material around the hole. */
  readonly wall: number;
  /** Clear space between the eye and the body's bounding box. */
  readonly gap: number;
  readonly direction: Direction;
  readonly atEnd: boolean;
  /**
   * Hang the eye off the top-left corner instead of an end -- the tab a big
   * single initial is hung from. Overrides `direction` and `atEnd`.
   */
  readonly corner?: boolean;
}

export interface Ring {
  /** Eye plus neck, in the body's own frame. */
  readonly solid: CrossSection;
  /** The hole through the eye. */
  readonly hole: CrossSection;
  readonly outerD: number;
  /** Centre of the eye, for readouts and for checking it cleared the body. */
  readonly centre: readonly [number, number];
  /** Material the neck actually shares with the body, mm². */
  readonly jointArea: number;
  /** What that had to reach for the joint to carry a bunch of keys. */
  readonly jointTarget: number;
}

/**
 * The bite the neck has to take out of the body, as a depth across its full
 * height. The joint is sized by AREA, not by depth.
 *
 * Stopping a fixed distance past first contact is the obvious rule and it is
 * wrong, because first contact against a convex edge is a tangent point: the
 * shared material is then a thin lens that tapers to nothing at both ends, and
 * the further the edge curves away the less of it there is. Every backed
 * preset here joined on about 8.8 mm² of material that way except "Joshua",
 * whose "J" hooks left and left the eye hanging on 1.13 mm² -- one piece by
 * every check the exporter makes, and a joint you could break with a
 * fingernail.
 *
 * So the neck is driven in until it has actually eaten `NECK_BITE` x its own
 * height out of the body. On a flat edge that is the same distance it used to
 * travel; on a curved one it goes as much further as the curve costs.
 */
const NECK_BITE = 1.4;
/**
 * How far the neck may chase a joint before giving up, x the body's extent.
 *
 * A fraction alone starves a short word: at 0.55 a one-letter keychain gives
 * the neck under 3 mm to find a joint in, which is less than the eye's own
 * radius. It is floored at the eye's width and ceilinged just short of the
 * body, so the neck can cross a single letter but never come out the far side.
 */
const MAX_NECK = 0.55;

/**
 * Rotation that puts the ring end of the word on the -X side.
 *
 * Working in one canonical frame and rotating back is what keeps this to a
 * single case instead of four near-copies that drift apart. CrossSection
 * rotation is exact for these angles, so nothing is lost on the round trip.
 */
function frameAngle(direction: Direction, atEnd: boolean): number {
  if (direction === 'horizontal') return atEnd ? 180 : 0;
  // Vertical: 'start' is the top of the column (+Y), 'end' the bottom (-Y).
  return atEnd ? -90 : 90;
}

export function buildRing(
  m: ManifoldToplevel,
  body: CrossSection,
  opts: RingOpts,
): Ring | null {
  // The top-left diagonal sits at 135 degrees; turning it a further 45 points
  // it down -X like every other end.
  const angle = opts.corner ? 45 : frameAngle(opts.direction, opts.atEnd);
  const local = body.rotate(angle);
  const b = local.bounds();
  const bodyW = b.max[0] - b.min[0];
  const bodyH = b.max[1] - b.min[1];
  if (!(bodyW > 0) || !(bodyH > 0)) return null;

  const outerR = opts.holeD / 2 + opts.wall;
  const cx = b.min[0] - opts.gap - outerR;

  // The window the neck is allowed to reach into. Everything below is decided
  // by looking at what is inside it, never by assuming where the body's edge
  // is or what shape it has.
  const neckReach = Math.min(bodyW * 0.9, Math.max(bodyW * MAX_NECK, outerR * 2));
  const deepest = b.min[0] + neckReach;
  const window = local.intersect(
    m.CrossSection.square([neckReach, bodyH * 2], true).translate([
      (b.min[0] + deepest) / 2,
      (b.min[1] + b.max[1]) / 2,
    ]),
  );

  // Neck height. Wide enough to be a neck rather than a hinge, never taller
  // than the eye it hangs off -- and never taller than the material it is
  // attaching to.
  //
  // That last clause is the one that matters. A backing is a blob and will
  // take any neck offered; a bare letter is a stroke, and a "J" is a stem with
  // a hook on it about a fifth as thick as the neck the eye would like. Hang a
  // 6 mm neck off a 2.5 mm hook and the joint can never reach a full-height
  // bite however deep it is driven -- there is not that much letter. Matching
  // the neck to the stroke makes the target reachable AND stops the eye
  // arriving on a stalk visibly fatter than the letter holding it.
  const wanted = Math.min(outerR * 1.4, Math.max(bodyH * 0.45, opts.wall * 2));
  const available = window.area() / neckReach; // mean thickness in the window
  const neckH = Math.max(Math.min(wanted, available), Math.min(wanted, Math.max(1.6, opts.wall)));

  // Where to hang it: the height whose band picks up the most material. The
  // bounding-box centre of the leftmost sliver is the obvious answer and it
  // lands in thin air on any letter whose edge curves -- the "J" hook again,
  // whose box centre is the hollow inside the curve.
  const bandAt = (y: number): CrossSection =>
    m.CrossSection.square([neckReach, neckH], true).translate([(b.min[0] + deepest) / 2, y]);
  const SAMPLES = 25;
  let attachY = (b.min[1] + b.max[1]) / 2;
  let best = -1;
  for (let i = 0; i < SAMPLES; i++) {
    const y = b.min[1] + ((i + 0.5) / SAMPLES) * bodyH;
    const a = bandAt(y).intersect(window).area();
    if (a > best) {
      best = a;
      attachY = y;
    }
  }
  // Centred whenever the middle is nearly as good. On a backing every height
  // is a near-tie, and the strict maximum lands the eye off to one side of
  // the end for the sake of a few square millimetres.
  const middle = (b.min[1] + b.max[1]) / 2;
  if (bandAt(middle).intersect(window).area() >= best * 0.9) attachY = middle;

  // Drive the neck in until the joint carries its weight.
  //
  // The area shared with the body grows monotonically as the neck is extended,
  // so the depth that first reaches the target is found by bisection. Nothing
  // here looks at where the body's edge is: a tangent, a corner and a flat all
  // ask for different depths and all get the same joint.
  const neckAt = (reach: number): CrossSection | null => {
    const len = reach - cx;
    return len > 1e-3
      ? m.CrossSection.square([len, neckH], true).translate([cx + len / 2, attachY])
      : null;
  };
  const jointArea = (reach: number): number => {
    const n = neckAt(reach);
    return n ? n.intersect(local).area() : 0;
  };

  const target = neckH * NECK_BITE;
  let reach = deepest;
  if (jointArea(deepest) >= target) {
    let lo = cx;
    let high = deepest;
    while (high - lo > 0.05) {
      const mid = (lo + high) / 2;
      if (jointArea(mid) >= target) high = mid;
      else lo = mid;
    }
    reach = high;
  }
  // If even the deepest neck cannot find `target` -- a body thinner than the
  // neck the whole way along, which a one-letter word can be -- it stays at
  // full depth and takes whatever joint is there. The connectivity check is
  // still downstream of this, and a thin body is thin by the user's own doing.

  const neck = neckAt(reach);

  const eye = m.CrossSection.circle(outerR, 64).translate([cx, attachY]);
  const solid = neck ? eye.add(neck) : eye;
  const hole = m.CrossSection.circle(opts.holeD / 2, 48).translate([cx, attachY]);

  const back = -angle;
  const centreLocal: [number, number] = [cx, attachY];
  const rad = (back * Math.PI) / 180;
  const centre: [number, number] = [
    centreLocal[0] * Math.cos(rad) - centreLocal[1] * Math.sin(rad),
    centreLocal[0] * Math.sin(rad) + centreLocal[1] * Math.cos(rad),
  ];

  return {
    solid: solid.rotate(back),
    hole: hole.rotate(back),
    outerD: outerR * 2,
    centre,
    jointArea: jointArea(reach),
    jointTarget: target,
  };
}
