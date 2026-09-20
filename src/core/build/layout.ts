import { deinterleave } from '../kernel/serialize';
import type { RawMesh } from '../kernel/types';
import type { Part } from '../params/types';

export interface LaidOutPart {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  /** Tightly packed xyz, already rotated into print orientation and placed. */
  readonly positions: Float32Array;
  readonly index: Uint32Array;
  readonly size: readonly [number, number, number];
  readonly origin: readonly [number, number, number];
  /** Parts sharing a group print as one object and stay co-located. */
  readonly group?: string;
  /**
   * Which plate this part landed on, 0-based, when a model needs several.
   *
   * Set by packPlates and left undefined by packPlate, because "plate 0 of 1"
   * is a distinction without a difference and every caller would have to
   * special-case it.
   */
  readonly plate?: number;
}

interface PackUnit {
  readonly members: LaidOutPart[];
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
}

export interface Plate {
  readonly parts: readonly LaidOutPart[];
  readonly used: readonly [number, number];
  readonly fits: boolean;
  readonly overflow: readonly string[];
}

/**
 * A model laid out across as many plates as it needs.
 *
 * `fits` here means every part landed on SOME plate, which is a different
 * question from whether they all landed on one. A drawer whose case and box
 * are each 130 mm deep needs two beds and there is nothing wrong with it; a
 * part wider than the bed itself is the real failure, and that is `overflow`.
 */
export interface PlateSet {
  readonly plates: readonly Plate[];
  readonly bed: readonly [number, number];
  readonly fits: boolean;
  readonly overflow: readonly string[];
}

const DEG = Math.PI / 180;

/**
 * Rotate tightly-packed xyz in place-ish (returns a new array).
 *
 * Order matches Manifold's own rotate([x,y,z]): about X, then Y, then Z.
 */
function rotate(
  positions: Float32Array,
  [rx, ry, rz]: readonly [number, number, number],
): Float32Array {
  if (rx === 0 && ry === 0 && rz === 0) return positions;

  const cx = Math.cos(rx * DEG), sx = Math.sin(rx * DEG);
  const cy = Math.cos(ry * DEG), sy = Math.sin(ry * DEG);
  const cz = Math.cos(rz * DEG), sz = Math.sin(rz * DEG);

  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x0 = positions[i]!, y0 = positions[i + 1]!, z0 = positions[i + 2]!;
    // X
    const y1 = y0 * cx - z0 * sx;
    const z1 = y0 * sx + z0 * cx;
    // Y
    const x2 = x0 * cy + z1 * sy;
    const z2 = -x0 * sy + z1 * cy;
    // Z
    out[i] = x2 * cz - y1 * sz;
    out[i + 1] = x2 * sz + y1 * cz;
    out[i + 2] = z2;
  }
  return out;
}

function bounds(positions: Float32Array): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = positions[i + a]!;
      if (v < min[a]!) min[a] = v;
      if (v > max[a]!) max[a] = v;
    }
  }
  return { min, max };
}

function translate(
  positions: Float32Array,
  dx: number,
  dy: number,
  dz: number,
): Float32Array {
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    out[i] = positions[i]! + dx;
    out[i + 1] = positions[i + 1]! + dy;
    out[i + 2] = positions[i + 2]! + dz;
  }
  return out;
}

/** Rotate into print orientation, without dropping or packing. */
function layRotated(part: Part): LaidOutPart & { minZ: number } {
  const raw: RawMesh = part.mesh;
  const rotated = rotate(deinterleave(raw), part.orientation ?? [0, 0, 0]);
  const b = bounds(rotated);
  return {
    id: part.id,
    name: part.name,
    color: part.color,
    group: part.group,
    positions: rotated,
    index: raw.index,
    size: [b.max[0]! - b.min[0]!, b.max[1]! - b.min[1]!, b.max[2]! - b.min[2]!] as const,
    origin: [b.min[0]!, b.min[1]!, b.min[2]!] as const,
    minZ: b.min[2]!,
  };
}

/**
 * Parts where they were MODELLED -- the assembled thing, not the print.
 *
 * No print rotation, no drop to z = 0, no packing: each part keeps the position
 * its generator built it in, plus whatever `assembly` offset it declared. That
 * makes the result the building, the bowl, the keyboard -- something you can
 * hand to someone, drop into a render, or open in a viewer.
 *
 * Bodies stay SEPARATE. Welding them would make it unprintable and would also
 * be a lie about the object: a stack of storeys that lifts apart is the point.
 *
 * `quantity` is deliberately NOT expanded here, unlike in packPlate. A part
 * declared five times is five copies to print, but it was modelled once and in
 * one place -- stamping five coincident bodies into the assembled file would
 * give the slicer five overlapping solids and the viewer a z-fighting mess.
 * This matches what the Whole preview shows, which is the whole idea.
 */
export function layAssembled(parts: readonly Part[]): LaidOutPart[] {
  return parts.map((part) => {
    // Copy before shifting: deinterleave hands back the mesh's OWN array when
    // there are no extra vertex properties, and translating in place would
    // walk the cached build result away from the origin on every export.
    const xyz = new Float32Array(deinterleave(part.mesh));
    const [dx, dy, dz] = part.assembly ?? [0, 0, 0];
    const moved = dx === 0 && dy === 0 && dz === 0 ? xyz : translate(xyz, dx, dy, dz);
    const b = bounds(moved);
    return {
      id: part.id,
      name: part.name,
      color: part.color,
      group: part.group,
      positions: moved,
      index: part.mesh.index,
      size: [b.max[0]! - b.min[0]!, b.max[1]! - b.min[1]!, b.max[2]! - b.min[2]!] as const,
      origin: [b.min[0]!, b.min[1]!, b.min[2]!] as const,
    };
  });
}

/** Rotate into print orientation and drop onto z = 0, without packing. */
export function layFlat(part: Part): LaidOutPart {
  const r = layRotated(part);
  // Sitting on the plate is what users expect; a part floating at z=12 is the
  // single most common "why is it in the air" complaint.
  return {
    ...r,
    positions: translate(r.positions, 0, 0, -r.minZ),
    origin: [r.origin[0]!, r.origin[1]!, 0] as const,
  };
}

/**
 * Shelf-pack parts onto a plate. Pure arithmetic on bounding boxes -- no
 * kernel calls -- so it is trivially testable and costs nothing to re-run
 * when the preview toggles between assembled and flat.
 *
 * Deliberately a simple shelf packer: a MaxRects implementation would be
 * over-engineering for the <= 20 parts these generators produce.
 */
export function packPlate(
  parts: readonly Part[],
  bed: readonly [number, number],
  gap = 3,
  margin = 5,
): Plate {
  const units = unitsOf(parts);
  const { plate, leftover } = shelf(units, bed, gap, margin);
  // One plate, so anything that did not land on it did not land: a caller
  // asking for a single plate is asking whether it all fits on one.
  return leftover.length === 0
    ? plate
    : {
        ...plate,
        fits: false,
        overflow: [...plate.overflow, ...leftover.flatMap((u) => u.members.map((mem) => mem.name))],
      };
}

/**
 * Lay a model out across as many plates as it takes.
 *
 * The same shelf packer, run again on whatever would not fit, until nothing is
 * left. Parts too large for the bed in their own right are refused rather than
 * carried forward -- they would never fit any plate and would loop forever.
 *
 * Each plate's parts are centred on ITS OWN origin. Putting them side by side
 * is a presentation choice and belongs to whoever is drawing the beds, not
 * here: an export wants plate 2 centred on the plate, not 260 mm off to the
 * right of plate 1.
 */
export function packPlates(
  parts: readonly Part[],
  bed: readonly [number, number],
  gap = 3,
  margin = 5,
): PlateSet {
  const plates: Plate[] = [];
  const overflow: string[] = [];
  let pending = unitsOf(parts);

  while (pending.length > 0) {
    const { plate, leftover } = shelf(pending, bed, gap, margin);
    overflow.push(...plate.overflow);
    const index = plates.length;
    const stamped: Plate = { ...plate, parts: plate.parts.map((p) => ({ ...p, plate: index })) };
    // Nothing placed and nothing refused would mean no progress; the only way
    // that happens is an empty unit list, which the loop condition rules out.
    if (stamped.parts.length > 0) plates.push(stamped);
    if (leftover.length === pending.length) {
      // Every remaining unit was refused as too big -- shelf() has already
      // recorded them in overflow, so there is nothing left to try.
      break;
    }
    pending = leftover;
  }

  return {
    plates,
    bed,
    fits: overflow.length === 0,
    overflow,
  };
}

/** Rotate, expand quantities and group co-printed bodies into packable units. */
function unitsOf(parts: readonly Part[]): PackUnit[] {
  const laid = parts.flatMap((p) => {
    const one = layRotated(p);
    const n = Math.max(1, p.quantity ?? 1);
    return Array.from({ length: n }, (_, i) =>
      n === 1
        ? one
        : { ...one, id: `${one.id}#${i + 1}`, name: `${one.name} (${i + 1}/${n})` },
    );
  });

  // Parts sharing a `group` are one printed object in several colours (a plate
  // and its raised lettering, say). They must keep their relative positions in
  // all three axes -- dropping each to z=0 on its own would slide the
  // lettering off the top of the plate and bury it inside instead.
  const groups = new Map<string, (LaidOutPart & { minZ: number })[]>();
  for (const part of laid) {
    const key = part.group ?? `@${part.id}`;
    const list = groups.get(key) ?? [];
    list.push(part);
    groups.set(key, list);
  }

  return [...groups.values()].map((rotatedMembers) => {
    // Drop the whole group by its lowest point, so the relative Z survives.
    const groupMinZ = Math.min(...rotatedMembers.map((mem) => mem.minZ));
    const members: LaidOutPart[] = rotatedMembers.map((mem) => ({
      ...mem,
      positions: translate(mem.positions, 0, 0, -groupMinZ),
      origin: [mem.origin[0]!, mem.origin[1]!, mem.minZ - groupMinZ] as const,
    }));

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const mem of members) {
      minX = Math.min(minX, mem.origin[0]!);
      minY = Math.min(minY, mem.origin[1]!);
      maxX = Math.max(maxX, mem.origin[0]! + mem.size[0]);
      maxY = Math.max(maxY, mem.origin[1]! + mem.size[1]);
    }
    return { members, minX, minY, width: maxX - minX, height: maxY - minY };
  });
}

/**
 * Fill ONE plate, tallest unit first, and hand back whatever did not fit.
 *
 * `leftover` is units that ran out of plate; `overflow` on the returned plate
 * is units that could never fit any plate of this size. The two are different
 * answers and the caller treats them differently: one means "start another
 * plate", the other means "this cannot be printed here at all".
 */
function shelf(
  units: readonly PackUnit[],
  bed: readonly [number, number],
  gap: number,
  margin: number,
): { plate: Plate; leftover: PackUnit[] } {
  // Tallest-first keeps shelves compact.
  const order = [...units].sort((a, b) => b.height - a.height);

  const usableW = bed[0] - 2 * margin;
  const usableH = bed[1] - 2 * margin;

  const placed: LaidOutPart[] = [];
  const overflow: string[] = [];
  const leftover: PackUnit[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let shelfHeight = 0;
  let usedW = 0;

  for (const unit of order) {
    const { width: w, height: h } = unit;
    if (w > usableW || h > usableH) {
      overflow.push(...unit.members.map((mem) => mem.name));
      continue;
    }
    if (cursorX > 0 && cursorX + gap + w > usableW) {
      cursorX = 0;
      cursorY += shelfHeight + gap;
      shelfHeight = 0;
    }
    if (cursorY + h > usableH) {
      leftover.push(unit);
      continue;
    }
    const x = cursorX === 0 ? 0 : cursorX + gap;
    // One shift for the whole unit, so members keep their relative offsets.
    const dx = x - unit.minX;
    const dy = cursorY - unit.minY;
    for (const mem of unit.members) {
      placed.push({
        ...mem,
        positions: translate(mem.positions, dx, dy, 0),
        origin: [mem.origin[0]! + dx, mem.origin[1]! + dy, 0] as const,
      });
    }
    cursorX = x + w;
    shelfHeight = Math.max(shelfHeight, h);
    usedW = Math.max(usedW, cursorX);
  }

  const usedH = cursorY + shelfHeight;

  // Centre the packed set on the origin so it sits in the middle of the plate.
  const centred = placed.map((p) => ({
    ...p,
    positions: translate(p.positions, -usedW / 2, -usedH / 2, 0),
  }));

  return {
    plate: {
      parts: centred,
      used: [usedW, usedH] as const,
      fits: overflow.length === 0 && leftover.length === 0,
      overflow,
    },
    leftover,
  };
}
