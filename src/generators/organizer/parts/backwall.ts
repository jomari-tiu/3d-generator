import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { filletProfile, roundedRect } from '../../../core/kernel/primitives';
import { ledgeSlot, ledgeTongue } from '../dock';
import { moduleHeight } from './modules';
import type { Derived } from '../geometry';

/**
 * The back wall: an upstand along the whole back edge of the plate, and the
 * things that hang on it -- key hooks, a watch bar, a shelf for pocket change.
 *
 * A PLATE feature rather than a module. It is not as wide as the thing it
 * holds, the way every module is; it is as wide as the plate, and the plate
 * grows backward to carry it. That is also why it cannot be a bay: the bays
 * run left to right and this runs across all of them.
 *
 * A SEPARATE part, and that is forced rather than chosen. The plate prints
 * flat with its dovetail slots facing the
 * sky. Stand a wall up off that and every hook is a cantilever printed into
 * mid-air; worse, a 200 x 4 mm wall standing 150 mm tall with the weight of the
 * fittings at the top is a part that falls over while it is being made. Laid on
 * its own back the wall is flat to the bed, every hook points at the sky, and
 * nothing needs support.
 *
 * It goes on LAST. The plate's dovetails are open at the back so the modules
 * push in from behind, and this stands directly in that path -- slide the
 * modules on first, then drop the wall into the slot across the back ledge.
 */

/**
 * The wall divided left to right: the shelf takes one end, the hooks and the
 * watch bar take an end each of what is left.
 *
 * Side by side rather than stacked, because they are used at different heights
 * for different reasons and stacking them puts the shelf under the hooks --
 * which is where your hand goes to reach a key. Laid out down the wall instead
 * they were also simply on top of each other, the shelf spanning the middle
 * while hooks were spread across the whole width.
 */
interface Layout {
  /** The shelf's span, or null when there is none. */
  readonly shelf: { readonly x0: number; readonly x1: number } | null;
  /** Where each hook goes, left to right. */
  readonly hooks: readonly number[];
  /** The watch bar's centre, or null when there is none. */
  readonly bar: number | null;
}

/** How fat a key hook is, which is also how close two of them can sit. */
function hookR(d: Derived): number {
  return Math.max(2.5, Math.min(d.backWallT, 6) / 2);
}

/**
 * Three claims on one run of wall, settled in order.
 *
 * The SHELF takes a whole end -- whichever one it was put on. A whole end
 * rather than a slice out of the middle, because everything else then has one
 * unbroken run to live in instead of two stubs.
 *
 * The HOOKS take their own end of what is left, and they GROUP rather than
 * spread. Spread across the remainder they were four pegs 60 mm apart, which
 * is not how anybody hangs keys and is not a position you can ask for either;
 * grouped at a key's own pitch they are one thing in one place, and that place
 * is a setting. The pitch closes up if the run is too short for the natural
 * one, so they never walk off the end of the wall.
 *
 * The WATCH BAR takes the far end of the same run -- the end the hooks did not
 * want. Two fittings, two ends, and neither has to know how big the other is.
 */
function layout(d: Derived): Layout {
  const left = -(d.W / 2 - d.margin);
  const right = d.W / 2 - d.margin;
  let x0 = left + 4;
  let x1 = right - 4;

  let shelf: { x0: number; x1: number } | null = null;
  const sw = Math.min(d.coinShelf, d.W - 2 * d.margin - 4);
  if (d.coinShelf > 0 && sw > 2 * d.wall) {
    shelf =
      d.shelfSide === 'left' ? { x0: left, x1: left + sw } : { x0: right - sw, x1: right };
    if (d.shelfSide === 'left') x0 = shelf.x1 + 8;
    else x1 = shelf.x0 - 8;
  }

  let bar: number | null = null;
  if (d.watchPost && x1 - x0 > d.watchBarW) {
    bar = d.hookSide === 'left' ? x1 - d.watchBarW / 2 : x0 + d.watchBarW / 2;
    if (d.hookSide === 'left') x1 -= d.watchBarW + 6;
    else x0 += d.watchBarW + 6;
  }

  const hooks: number[] = [];
  const n = d.keyHooks;
  const r = hookR(d);
  if (n > 0 && x1 - x0 > 2 * r) {
    const room = x1 - x0 - 2 * r;
    const pitch = n > 1 ? Math.min(Math.max(22, 2 * r + 14), room / (n - 1)) : 0;
    const run = (n - 1) * pitch;
    const start = d.hookSide === 'left' ? x0 + r : x1 - r - run;
    for (let i = 0; i < n; i++) hooks.push(start + i * pitch);
  }
  return { shelf, hooks, bar };
}

/**
 * How high the shelf has to be to clear what is already on the plate.
 *
 * It projects FORWARD, out over the modules, so its height is not a free
 * choice: below the module underneath it, it is simply inside it. Measured
 * against only the bays the shelf actually spans -- taken against the tallest
 * module anywhere it stood 114 mm up to clear a phone stand at the far end of
 * the plate while sitting over a 60 mm card rack.
 */
export function shelfZ(d: Derived): number {
  const s = layout(d).shelf;
  if (!s) return 0;
  const over = d.bays.filter((b) => b.cx + b.w / 2 > s.x0 && b.cx - b.w / 2 < s.x1);
  return Math.max(0, ...over.map((b) => moduleHeight(d, b))) + 8;
}

/** Where the hooks and the post hang, measured up the wall. */
function fittingZ(d: Derived): number {
  return Math.max(d.backWallT * 2, d.backWall - Math.max(18, d.hookLen * 0.9));
}

/** The slab itself, on its tongue. */
function slab(m: ManifoldToplevel, d: Derived): Manifold {
  const w = d.W - 2 * d.margin;
  const r = Math.min(d.corner, d.backWallT / 2, 3);
  const body = m.Manifold.extrude(roundedRect(m, w, d.backWallT, r), d.backWall).translate([
    0,
    d.backY,
    d.baseT,
  ]);
  return body.add(ledgeTongue(m, d, d.backY));
}

/** The front face of the slab, which everything grows out of. */
const faceY = (d: Derived) => d.backY - d.backWallT / 2;

/**
 * A hook: a tapered post leaning UP and out of the wall.
 *
 * Up, not straight out, for two unrelated reasons that happen to want the same
 * shape. A ring on a level peg comes off it the moment the wall is knocked; and
 * a level peg, on a wall printed lying on its back, is a post growing sideways
 * out of the bed. Tilted up past thirty degrees it is both a hook things stay
 * on and a post that prints in clean air.
 *
 * Rotating X by +90 sends the cylinder's own +Z to -Y, which is out of the
 * face. By -90 it goes to +Y -- into the wall, and downward -- which is where
 * the first version of this put every post while leaving its tip out in front,
 * so the wall came out with four balls hanging in mid-air.
 */
function hook(m: ManifoldToplevel, d: Derived, x: number, z: number): Manifold {
  const r = hookR(d);
  const rise = (d.hookRise * Math.PI) / 180;
  // Tapered to the tip: easier to get a crowded keyring over, and the taper is
  // what stops the free end being a blob of stringing.
  const post = m.Manifold.cylinder(d.hookLen, r * 1.15, r * 0.75, 32).rotate([
    90 - d.hookRise,
    0,
    0,
  ]);
  // A ball on the end, so a ring rides over it and then sits behind it.
  const tip = m.Manifold.sphere(r * 0.95, 24).translate([
    0,
    -d.hookLen * Math.cos(rise),
    d.hookLen * Math.sin(rise),
  ]);
  // Sunk into the wall rather than butted on it: face to face the union has no
  // volume to work with and the hook comes back as a body that merely touches.
  return post.add(tip).translate([x, faceY(d) + 0.8, d.baseT + z]);
}

/**
 * The watch bar: an arm out of the wall that turns UP at the free end.
 *
 * Not a post, which is what this started as, and not the plain ledge it
 * became. A watch is not HUNG the way a keyring is, it is DRAPED: the case
 * lies on the arm and the strap falls down both sides. A round post gives it a
 * tangent line to balance on; a flat stub gives it a proper seat and nothing
 * to stop it walking off the end. The upturn at the tip is the whole point --
 * the strap sits in the corner behind it and stays there.
 *
 * **The upturn costs reach, and it costs it for a printing reason.** The wall
 * prints lying on its back, so everything on the front face grows at the sky:
 * the arm is a prism standing off the bed, built from the wall outward. In
 * that frame the upturn is not "up" at all, it is the section suddenly getting
 * `lip` taller at the top of a 30 mm tower -- a flat unsupported ledge the
 * full width of the bar. So the inside of the hook is a 45-degree ramp rather
 * than a square corner: the section grows one millimetre taller for every
 * millimetre further out, which is the steepest a printer can manage in air.
 *
 * It reads as a cradle, which is what it is. The strap drops into the scoop
 * between the arm and the ramp, and the ridge at the tip holds it.
 *
 * `rotate([90, 0, 90])` maps a local (x, y, z) to world (z, x, y), so the
 * cross-section is drawn in (reach, height) and the extrusion runs along the
 * wall. Local -x is out of the face, which is also the way the printer builds.
 */
function watchBar(m: ManifoldToplevel, d: Derived, cx: number, z: number): Manifold {
  const t = d.watchBarT;
  const w = d.watchBarW;
  const bite = 0.8;
  // The hook is as tall as the arm is thick -- one number doing two jobs, and
  // it scales with the bar. Never more than half the reach, or the ramp eats
  // the arm and there is nowhere left to lay a watch.
  const dep = d.watchBarD;
  const lip = Math.max(3, Math.min(t, dep / 2 - 2));

  // The scoop is a fillet, and a fillet in a CONCAVE corner adds material --
  // right where the ramp leaves the arm, and on the unsupported side of it.
  // So the ramp is laid out one fillet radius shallower than 45 degrees, and
  // what the fillet puts back still lands under the 45.
  const scoop = Math.min(2.5, lip / 2);
  const run = lip + scoop;
  const poly: [number, number][] = [
    [bite, 0], // into the wall, so the two solids weld
    [-dep, 0], // along the underside to the free end
    [-dep, t + lip], // and up the outside of the hook
    [-dep + run, t], // back down the ramp -- see above
    [bite, t], // and home along the top of the arm
  ];
  // Concave first (dilate then erode), convex second (erode then dilate);
  // one call cannot do both.
  const r = Math.min(1.6, t / 3);
  const cs = filletProfile(m.CrossSection.ofPolygons([poly], 'NonZero'), scoop)
    .offset(-r, 'Round', 2, 32)
    .offset(r, 'Round', 2, 32);
  return m.Manifold.extrude(cs, w)
    .rotate([90, 0, 90])
    .translate([cx - w / 2, faceY(d), d.baseT + z - t / 2]);
}
/**
 * The shelf for pocket change: an open tray on the wall, out over the modules.
 *
 * Floored and walled on three sides with the fourth left open against the wall,
 * so it sweeps out into your hand instead of having to be tipped. Lying on its
 * back on the bed the front lip is a bridge between the two side walls rather
 * than an overhang, which is why this is a square tray and not a scoop.
 */
function shelf(m: ManifoldToplevel, d: Derived): Manifold | null {
  const s = layout(d).shelf;
  if (!s) return null;
  const w = s.x1 - s.x0;
  const cx = (s.x0 + s.x1) / 2;
  const z = d.baseT + shelfZ(d);
  const dep = d.coinShelfD;
  const h = Math.max(d.wall * 3, 14);
  const y0 = faceY(d);
  const r = Math.min(3, Math.max(0.5, d.corner));

  const at = (dy: number, dz: number) => [cx, y0 - dep / 2 + 0.8 + dy, z + dz] as [number, number, number];
  const outer = m.Manifold.extrude(roundedRect(m, w, dep, r), h).translate(at(0, 0));
  const inner = m.Manifold.extrude(
    roundedRect(m, w - 2 * d.wall, dep - 2 * d.wall, Math.max(0.5, r - d.wall)),
    h,
  ).translate(at(0, d.wall));
  let tray = outer.subtract(inner);

  // Open the back of it INTO the wall, so change sweeps out rather than sitting
  // behind a fourth wall a millimetre in front of a solid slab.
  tray = tray.subtract(
    m.Manifold.cube([w - 2 * d.wall, d.wall * 3, h], true).translate([
      cx,
      y0 + 0.8,
      z + d.wall + h / 2,
    ]),
  );

  // A gusset under it. Unsupported, the tray is a shelf held on one edge and
  // the first handful of coins peels it off the wall.
  const g = Math.min(dep, 14);
  const gusset = m.Manifold.extrude(
    m.CrossSection.ofPolygons([[[0, 0], [-g, 0], [0, -g]]], 'NonZero'),
    w,
  )
    .rotate([90, 0, 90])
    .translate([cx - w / 2, y0 + 0.8, z]);
  return tray.add(gusset);
}

/** The hooks and the bar, each where `layout` put it. */
function fittings(m: ManifoldToplevel, d: Derived): Manifold | null {
  const { hooks, bar } = layout(d);
  const z = fittingZ(d);
  const parts: Manifold[] = hooks.map((x) => hook(m, d, x, z));
  if (bar !== null) parts.push(watchBar(m, d, bar, z));
  return parts.length > 0 ? m.Manifold.union(parts) : null;
}

/**
 * Everything in front of the wall's back face.
 *
 * A fitting is sunk into the face so it welds rather than merely touches, and
 * a tilted cylinder sunk into a 4 mm slab does not stop at the slab: the old
 * watch post was 18 mm across and leaned, so the far edge of its base cap came
 * out two millimetres proud of the BACK of the wall -- a lump on the face that is
 * supposed to be flat against a desk or a wall, and the face the part is
 * printed on. Trimmed rather than shuffled, because the same thing happens
 * again at any diameter once the wall is thin enough.
 *
 * The tongue is deliberately not trimmed: an undercut reaching behind the face
 * is the entire point of a dovetail.
 */
function inFront(m: ManifoldToplevel, d: Derived, s: Manifold): Manifold {
  const big = Math.max(d.W, d.backWall) * 3;
  const backFace = d.backY + d.backWallT / 2;
  return s.intersect(
    m.Manifold.cube([big, big, big], true).translate([0, backFace - big / 2, 0]),
  );
}

export function buildBackWall(m: ManifoldToplevel, d: Derived): Manifold | null {
  if (d.backWall <= 0) return null;
  let solid = slab(m, d);

  const f = fittings(m, d);
  if (f) solid = solid.add(inFront(m, d, f));

  const s = shelf(m, d);
  if (s) solid = solid.add(inFront(m, d, s));

  return solid;
}

/** The slot the wall's tongue drops into, cut in the plate's back ledge. */
export function backWallCut(m: ManifoldToplevel, d: Derived): Manifold | null {
  if (d.backWall <= 0) return null;
  return ledgeSlot(m, d, d.backY);
}
