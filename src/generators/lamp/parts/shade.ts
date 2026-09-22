import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { shadeInner, shadeSurface, type Derived } from '../geometry';

const TAU = Math.PI * 2;

/**
 * The shade, hem at z = 0.
 *
 * Built as a mesh rather than out of booleans, and not for speed. The surface
 * is r(theta, z) -- a single-valued polar height field -- so writing it out
 * directly is the only construction that GUARANTEES what the sidebar promises:
 * every cross-section is a simple closed curve, so no flute depth, lobe count
 * or twist can make the shade pass through itself. Sweeping sixty ribs round a
 * cone and unioning them gives the same silhouette and no such guarantee, at
 * sixty booleans a rebuild.
 *
 * The inner surface is the same field offset by the wall, which is what makes
 * the whole thing one watertight tube: two rings of vertices per level, quads
 * between the levels, and an annulus closing each end.
 */
export function shadeSolid(m: ManifoldToplevel, d: Derived): Manifold {
  const tube = loft(m, d);
  return d.mount === 'ring' ? tube.add(seatFlange(m, d)) : tube;
}

function loft(m: ManifoldToplevel, d: Derived): Manifold {
  const nt = d.thetaSteps;
  const nz = d.zSteps;
  const ring = (nz + 1) * nt;

  const verts = new Float32Array(ring * 2 * 3);
  for (let iz = 0; iz <= nz; iz++) {
    const z = (iz / nz) * d.shadeH;
    for (let it = 0; it < nt; it++) {
      const th = (it / nt) * TAU;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const ro = shadeSurface(d, z, th);
      const ri = shadeInner(d, z, th);
      const k = (iz * nt + it) * 3;
      verts[k] = ro * c;
      verts[k + 1] = ro * s;
      verts[k + 2] = z;
      verts[ring * 3 + k] = ri * c;
      verts[ring * 3 + k + 1] = ri * s;
      verts[ring * 3 + k + 2] = z;
    }
  }

  // Two walls of quads plus two annular caps.
  const tris = new Uint32Array((4 * nz * nt + 4 * nt) * 3);
  let n = 0;
  const tri = (a: number, b: number, c: number): void => {
    tris[n++] = a;
    tris[n++] = b;
    tris[n++] = c;
  };
  const out = (iz: number, it: number): number => iz * nt + (it % nt);
  const inn = (iz: number, it: number): number => ring + iz * nt + (it % nt);

  for (let iz = 0; iz < nz; iz++) {
    for (let it = 0; it < nt; it++) {
      // Outward normals run theta-hat cross z-hat, so a triangle wound along
      // theta and then up faces out. The inner wall is the same quad wound the
      // other way -- its normals have to point at the bulb, not away from it,
      // or the kernel reads the shade as a solid with a bubble in it.
      const a = out(iz, it);
      const b = out(iz, it + 1);
      const c = out(iz + 1, it + 1);
      const e = out(iz + 1, it);
      tri(a, b, e);
      tri(b, c, e);
      const ai = inn(iz, it);
      const bi = inn(iz, it + 1);
      const ci = inn(iz + 1, it + 1);
      const ei = inn(iz + 1, it);
      tri(ai, ei, bi);
      tri(bi, ei, ci);
    }
  }
  for (let it = 0; it < nt; it++) {
    // Hem, facing down.
    tri(out(0, it), inn(0, it), out(0, it + 1));
    tri(out(0, it + 1), inn(0, it), inn(0, it + 1));
    // Top rim, facing up.
    tri(out(nz, it), out(nz, it + 1), inn(nz, it));
    tri(out(nz, it + 1), inn(nz, it + 1), inn(nz, it));
  }

  return m.Manifold.ofMesh(
    new m.Mesh({ numProp: 3, vertProperties: verts, triVerts: tris }),
  );
}

/** How thick the seat flange is. Six layers of bearing surface, at least. */
export function flangeThickness(d: Derived): number {
  return Math.max(2.4, 8 * d.layer);
}

/**
 * The fitter a ring-hung shade hangs from: an inward flange partway up the
 * inside, which drops over the socket's threaded skirt and lands on the shade
 * ring. Everything below it skirts down past the base's neck; everything above
 * it goes on up around the bulb.
 *
 * Its aperture only has to clear the THREAD, not the bulb. The shade goes on
 * first and the bulb screws in afterwards, from above, and by the time the
 * glass starts widening it is already well clear of the flange -- so sizing
 * this hole to the envelope would cut a 60 mm hole in the shade for no reason.
 *
 * A hub with spokes, not a disc, for the reason a real lampshade fitter is a
 * spider: on a wide shade the disc is tens of grams of plastic blanking off the
 * light the open bottom is there to let out.
 *
 * Where a spoke does reach the wall it follows the shade's own fluted surface
 * rather than a circle, three quarters of the way out through it. A circle
 * would either stand proud of the valleys or fall short of the crests, and
 * falling short is the bad one: a spoke that misses the wall is a loose rib
 * inside a tube, and the two still union into a perfectly valid solid.
 */
function seatFlange(m: ManifoldToplevel, d: Derived): Manifold {
  const nt = d.thetaSteps;
  const t = flangeThickness(d);
  const zBot = d.seatH;
  const zTop = d.seatH + t;
  const rIn = d.socket.thread / 2 + d.fit;

  // Out to the wall inside a spoke, and only as far as the hub between them.
  // One outer radius per angle, so the star comes out of the same triangulation
  // an annulus does -- the step between the two radii falls in one sample
  // interval and becomes the spoke's own side wall.
  const pitch = d.spokes > 0 ? TAU / d.spokes : 0;
  const reach = (th: number, z: number): number => {
    if (d.spokes > 0) {
      const a = ((th % pitch) + pitch) % pitch;
      if (Math.min(a, pitch - a) > d.spokeHalf) return d.hubR;
    }
    const ro = shadeSurface(d, z, th);
    const ri = shadeInner(d, z, th);
    return ro - 0.25 * (ro - ri);
  };

  const verts = new Float32Array(nt * 4 * 3);
  const put = (slot: number, it: number, r: number, z: number): void => {
    const th = (it / nt) * TAU;
    const k = (slot * nt + it) * 3;
    verts[k] = r * Math.cos(th);
    verts[k + 1] = r * Math.sin(th);
    verts[k + 2] = z;
  };
  for (let it = 0; it < nt; it++) {
    const th = (it / nt) * TAU;
    put(0, it, reach(th, zTop), zTop);
    put(1, it, reach(th, zBot), zBot);
    put(2, it, rIn, zTop);
    put(3, it, rIn, zBot);
  }

  const tris = new Uint32Array(nt * 8 * 3);
  let n = 0;
  const tri = (a: number, b: number, c: number): void => {
    tris[n++] = a;
    tris[n++] = b;
    tris[n++] = c;
  };
  const at = (slot: number, it: number): number => slot * nt + (it % nt);
  for (let it = 0; it < nt; it++) {
    const ot = at(0, it), ot1 = at(0, it + 1);
    const ob = at(1, it), ob1 = at(1, it + 1);
    const nT = at(2, it), nT1 = at(2, it + 1);
    const nB = at(3, it), nB1 = at(3, it + 1);
    tri(ot, ot1, nT); // top face
    tri(ot1, nT1, nT);
    tri(ob, nB, ob1); // underside, which is the face that bears on the ring
    tri(ob1, nB, nB1);
    tri(ob, ob1, ot); // outer edge, buried in the wall
    tri(ob1, ot1, ot);
    tri(nB, nT, nB1); // aperture
    tri(nB1, nT, nT1);
  }

  return m.Manifold.ofMesh(
    new m.Mesh({ numProp: 3, vertProperties: verts, triVerts: tris }),
  );
}
