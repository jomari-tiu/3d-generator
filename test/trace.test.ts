import { describe, expect, it } from 'vitest';
import type { ManifoldToplevel } from 'manifold-3d';
import { cleanup, kernel, loadFont } from './kernel';
import { bitmapOf, disc, maskOf } from './traceFixtures';
import { ringArea, type Vec2 } from '../src/core/text/flatten';
import { despeckle, hasAlpha, inkCount, toMask } from '../src/core/image/mask';
import { ringAreaAbs, traceContours } from '../src/core/image/contour';
import { ringToCommands, simplifyRing, transformCommands } from '../src/core/image/simplify';
import { commandsToPathData, ringsToSvg } from '../src/core/image/svg';
import { traceBitmap } from '../src/core/image/trace';
import { sectionFromRings } from '../src/core/image/section';
import { ImageRegistry, imageId } from '../src/core/image/registry';
import type { Bitmap } from '../src/core/image/types';
import { imageTraceGenerator } from '../src/generators/imagetrace/build';
import { coerceAll, decodeHash, defaultsOf, encodeParams } from '../src/core/params/validate';
import type { BuildCtx, BuildResult, Params } from '../src/core/params/types';

function ctxFor(m: ManifoldToplevel, bmp?: Bitmap): BuildCtx {
  return {
    m,
    font: (id) => loadFont(id),
    image: () => bmp,
    tolerance: 0.02,
    issue: () => {},
  };
}

function paramsWith(patch: Params = {}): Params {
  return coerceAll(imageTraceGenerator, { ...defaultsOf(imageTraceGenerator), ...patch });
}

const messagesOf = (r: BuildResult, level: 'error' | 'warn'): string[] =>
  r.issues.filter((i) => i.level === level).map((i) => i.message);

// ---------------------------------------------------------------------- mask

describe('thresholding', () => {
  it('reads the threshold the same way round in both channels', () => {
    // Mid-grey ink on white. Raising the slider takes MORE as ink, and that has
    // to stay true when the source flips to alpha -- where the underlying
    // comparison points the other way and an honest control has to flip with it.
    const grey = bitmapOf(['..', '##'], { ink: 128 });
    expect(inkCount(toMask(grey, { threshold: 40 }))).toBe(0);
    expect(inkCount(toMask(grey, { threshold: 60 }))).toBe(2);

    const keyed = bitmapOf(['..', '##'], { ink: 255, inkAlpha: 128, paperAlpha: 0 });
    expect(inkCount(toMask(keyed, { source: 'alpha', threshold: 40 }))).toBe(0);
    expect(inkCount(toMask(keyed, { source: 'alpha', threshold: 60 }))).toBe(2);
  });

  it('keys on alpha automatically, but only when there is alpha to key on', () => {
    // A WHITE logo on transparency. Brightness says the whole image is paper,
    // so auto has to notice the alpha or the picture disappears.
    const cutout = bitmapOf(['.#', '#.'], { ink: 255, inkAlpha: 255, paperAlpha: 0 });
    expect(hasAlpha(cutout)).toBe(true);
    expect(inkCount(toMask(cutout, { threshold: 50 }))).toBe(2);
    expect(inkCount(toMask(cutout, { source: 'luminance', threshold: 50 }))).toBe(0);

    const opaque = bitmapOf(['.#', '#.']);
    expect(hasAlpha(opaque)).toBe(false);
    expect(inkCount(toMask(opaque, { threshold: 50 }))).toBe(2);
  });

  it('inverts after thresholding, not before', () => {
    const b = bitmapOf(['#.', '..']);
    expect(inkCount(toMask(b, { threshold: 50 }))).toBe(1);
    expect(inkCount(toMask(b, { threshold: 50, invert: true }))).toBe(3);
  });
});

describe('despeckle', () => {
  it('drops small ink blobs and fills small holes, and leaves the paper alone', () => {
    const m = maskOf([
      '.......',
      '.#####.',
      '.##.##.',
      '.#####.',
      '.......',
      '....#..',
      '.......',
    ]);
    const out = despeckle(m, 4);
    // The 1px pinhole is filled, the 1px speck is gone, the block survives.
    expect(inkCount(out)).toBe(15);
    expect(out.bits[2 * 7 + 3]).toBe(1);
    expect(out.bits[5 * 7 + 4]).toBe(0);
  });

  it('never treats the background the image sits on as a hole', () => {
    // A 2x2 of paper in the corner is smaller than the filter, but it is the
    // page, not a pinhole -- filling it would swallow the border.
    const m = maskOf(['..##', '..##', '####', '####']);
    expect(inkCount(despeckle(m, 8))).toBe(inkCount(m));
  });

  it('counts a diagonal chain as one blob, matching the tracer', () => {
    // Four pixels touching only at their corners. Read with 4-connectivity
    // these are four separate 1px specks, and the whole stroke would be culled
    // one pixel at a time -- while the tracer welds it into a single body.
    const m = maskOf(['#...', '.#..', '..#.', '...#']);
    expect(inkCount(despeckle(m, 3))).toBe(4);
  });
});

// ------------------------------------------------------------------- contour

describe('contour tracing', () => {
  it('walks the pixel cracks, so a block comes out at its true extent', () => {
    const rings = traceContours(maskOf(['.....', '.###.', '.###.', '.###.', '.....']));
    expect(rings).toHaveLength(1);
    expect(ringAreaAbs(rings[0]!)).toBeCloseTo(9, 9);
    // Exactly four turns: collinear crack points are dropped as they are walked.
    expect(rings[0]).toHaveLength(4);
  });

  it('gives a hole the opposite winding to the outline it sits in', () => {
    // This is what lets the kernel hollow counters with NonZero alone, with no
    // containment analysis anywhere in the pipeline.
    const rings = traceContours(
      maskOf(['.......', '.#####.', '.#####.', '.##.##.', '.#####.', '.#####.', '.......']),
    );
    expect(rings).toHaveLength(2);
    const areas = rings.map(ringArea).sort((a, b) => Math.abs(b) - Math.abs(a));
    expect(Math.abs(areas[0]!)).toBeCloseTo(25, 9);
    expect(Math.abs(areas[1]!)).toBeCloseTo(1, 9);
    expect(Math.sign(areas[0]!)).toBe(-Math.sign(areas[1]!));
  });

  it('resolves a corner touch the way the policy asks', () => {
    const saddle = maskOf(['#.', '.#']);
    expect(traceContours(saddle, 'connect')).toHaveLength(1);
    expect(traceContours(saddle, 'separate')).toHaveLength(2);
  });

  it('traces every body in the image, not just the first', () => {
    expect(traceContours(maskOf(['#.#', '...', '#.#']))).toHaveLength(4);
  });

  it('closes a shape that runs to the edge of the image', () => {
    // Nothing outside the mask is ink, so the image border is a real boundary
    // and the ring has to close along it rather than run off.
    const rings = traceContours(maskOf(['###', '###']));
    expect(rings).toHaveLength(1);
    expect(ringAreaAbs(rings[0]!)).toBeCloseTo(6, 9);
  });
});

// ------------------------------------------------------------------ simplify

describe('simplification and smoothing', () => {
  it('collapses a staircase into the line it was approximating', () => {
    const ring: Vec2[] = [];
    for (let i = 0; i < 20; i++) ring.push([i, i], [i + 1, i]);
    ring.push([20, 30], [0, 30]);
    const out = simplifyRing(ring, 1.2);
    expect(out.length).toBeLessThanOrEqual(8);
    expect(out.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps a square square however hard it is smoothed', () => {
    const square: Vec2[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(ringToCommands(square, { smooth: 1, cornerAngle: 72 }).some((c) => c.type === 'Q')).toBe(
      false,
    );

    // Raise the bar past 90 degrees and the same corners round off. That knob
    // is the whole difference between a deliberate right angle and staircase
    // noise, which smoothing on its own cannot tell apart.
    const rounded = ringToCommands(square, { smooth: 1, cornerAngle: 120 });
    expect(rounded.filter((c) => c.type === 'Q')).toHaveLength(4);
  });

  it('leaves the polygon alone at zero smoothing', () => {
    const tri: Vec2[] = [
      [0, 0],
      [10, 0],
      [5, 8],
    ];
    const cmds = ringToCommands(tri, { smooth: 0, cornerAngle: 170 });
    expect(cmds.some((c) => c.type === 'Q')).toBe(false);
    expect(cmds.filter((c) => c.type === 'L')).toHaveLength(3);
  });

  it('scales and shifts every control point, not just the endpoints', () => {
    const cmds = transformCommands([{ type: 'Q', x1: 2, y1: 4, x: 6, y: 8 }], 0.5, -1, -2);
    expect(cmds[0]).toMatchObject({ x1: 0, y1: 0, x: 2, y: 2 });
  });
});

// ----------------------------------------------------------------------- svg

describe('svg output', () => {
  it('writes one path with the nonzero rule, in millimetres', () => {
    const trace = traceBitmap(disc(48, 18, 7), { threshold: 50, detail: 1, smooth: 0.6 });
    const mmPerPixel = 40 / (trace.bounds!.max[0] - trace.bounds!.min[0]);
    const svg = ringsToSvg(
      trace.rings.map((r) => transformCommands(r, mmPerPixel)),
      { widthMm: 40, heightMm: 40, title: 'ring' },
    );

    // Both rings in ONE path: a hole is the absence of a shape, and only the
    // fill rule says so. Two elements would paint the counter back in.
    expect(svg.match(/<path/g)).toHaveLength(1);
    expect(svg).toContain('fill-rule="nonzero"');
    expect(svg).toContain('width="40mm"');
    expect(svg).toContain('viewBox="0 0 40 40"');
    expect(svg.match(/M/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it('escapes the title rather than letting it close the tag', () => {
    const svg = ringsToSvg([[{ type: 'M', x: 0, y: 0 }, { type: 'Z' }]], {
      widthMm: 1,
      heightMm: 1,
      title: '</title><script>x</script>',
    });
    expect(svg).not.toContain('<script>');
  });

  it('rounds coordinates without emitting negative zero', () => {
    expect(commandsToPathData([{ type: 'M', x: -0.0001, y: 2.5 }])).toBe('M0 2.5');
  });
});

// --------------------------------------------------------------------- trace

describe('traceBitmap', () => {
  it('finds the outline and the counter of a ring', () => {
    const trace = traceBitmap(disc(64, 26, 11), { threshold: 50 });
    expect(trace.ringCount).toBe(2);
    expect(trace.bounds).not.toBeNull();
    const w = trace.bounds!.max[0] - trace.bounds!.min[0];
    expect(w).toBeGreaterThan(50);
    expect(w).toBeLessThanOrEqual(54);
  });

  it('reports nothing rather than throwing when the threshold excludes everything', () => {
    const faint = disc(32, 12, 0, 200);
    const trace = traceBitmap(faint, { threshold: 5 });
    expect(trace.bounds).toBeNull();
    expect(trace.ringCount).toBe(0);
    // The same picture at a threshold that reaches it does come through.
    expect(traceBitmap(faint, { threshold: 90 }).ringCount).toBe(1);
  });

  it('drops rings with no printable area', () => {
    // Stray single pixels have area 1, under the default floor of 4.
    const speckled = bitmapOf(['#.....#', '.......', '...##..', '...##..', '#.....#']);
    expect(traceBitmap(speckled, { threshold: 50, despeckle: 0 }).ringCount).toBe(1);
  });
});

describe('image ids', () => {
  it('are the same picture twice and different pictures apart', () => {
    expect(imageId(disc(32, 12, 4))).toBe(imageId(disc(32, 12, 4)));
    expect(imageId(disc(32, 12, 4))).not.toBe(imageId(disc(32, 13, 4)));
  });

  it('travel in a permalink, because the value is an id and not the picture', () => {
    const v = paramsWith({ image: 'a1b2c3d4e5f60718', threshold: 70 });
    const encoded = encodeParams(imageTraceGenerator, v);
    const round = decodeHash(`#${encoded}`);
    expect(round.g).toBe('image');
    expect(round.p?.image).toBe('a1b2c3d4e5f60718');
    // The whole point of not putting pixels in the value: a link stays a link.
    expect(encoded.length).toBeLessThan(200);
  });

  it('resolve to undefined rather than throwing when nothing has that id', async () => {
    const reg = new ImageRegistry();
    expect(reg.peek('nope')).toBeUndefined();
    await expect(reg.load('nope')).resolves.toBeUndefined();
    const entry = reg.add(disc(16, 6, 0));
    expect(reg.get(entry.id).width).toBe(16);
  });
});

// -------------------------------------------------------------------- kernel

describe('traced sections in the kernel', () => {
  it('hollows the counter instead of filling it', async () => {
    const m = await kernel();
    try {
      const trace = traceBitmap(disc(96, 40, 20), { threshold: 50, detail: 0.6, smooth: 0.8 });
      const mmPerPixel = 40 / (trace.bounds!.max[0] - trace.bounds!.min[0]);
      const section = sectionFromRings(m, trace.rings, { mmPerPixel, tolerance: 0.02 });

      expect(section.numContour()).toBe(2);
      expect(section.decompose()).toHaveLength(1);
      // An annulus of 40 and 20 image pixels, scaled to a 40mm outer diameter:
      // pi * (20^2 - 10^2) = 942.
      expect(section.area()).toBeGreaterThan(880);
      expect(section.area()).toBeLessThan(990);
    } finally {
      cleanup();
    }
  });

  it('lands the artwork on the millimetre size that was asked for', async () => {
    const m = await kernel();
    try {
      const trace = traceBitmap(disc(64, 24, 0), { threshold: 50 });
      const mmPerPixel = 30 / (trace.bounds!.max[0] - trace.bounds!.min[0]);
      const b = sectionFromRings(m, trace.rings, { mmPerPixel, tolerance: 0.02 }).bounds();
      expect(b.max[0] - b.min[0]).toBeCloseTo(30, 1);
      // Centred on the origin, like every other section in this project.
      expect(b.min[0] + b.max[0]).toBeCloseTo(0, 6);
    } finally {
      cleanup();
    }
  });
});

describe('image generator', () => {
  it('refuses to build without a picture, and says which control to use', () => {
    const issues = imageTraceGenerator.validate?.(paramsWith()) ?? [];
    expect(issues.some((i) => i.level === 'error' && i.paramIds?.includes('image'))).toBe(true);
  });

  it('asks for exactly the image it was given, and never for an empty id', () => {
    expect(imageTraceGenerator.imagesNeeded?.(paramsWith())).toEqual([]);
    expect(imageTraceGenerator.imagesNeeded?.(paramsWith({ image: 'abc' }))).toEqual(['abc']);
  });

  it('explains a permalink whose picture lives on another machine', async () => {
    const m = await kernel();
    try {
      const out = imageTraceGenerator.build(paramsWith({ image: 'missing' }), ctxFor(m));
      expect(out.parts).toHaveLength(0);
      expect(messagesOf(out, 'error')[0]).toMatch(/not on this device/);
    } finally {
      cleanup();
    }
  });

  it('builds a two-colour plaque, with the artwork trimmed against the plate', async () => {
    const m = await kernel();
    try {
      const bmp = disc(96, 40, 20);
      const out = imageTraceGenerator.build(
        paramsWith({ image: imageId(bmp), style: 'plaque', width: 40, margin: 5 }),
        ctxFor(m, bmp),
      );
      expect(messagesOf(out, 'error')).toEqual([]);
      expect(out.parts.map((p) => p.id)).toEqual(['plate', 'artwork']);
      for (const part of out.parts) expect(part.mesh.stats.volumeMm3).toBeGreaterThan(0);
      // Both bodies are one printed object, so plate layout keeps them together.
      expect(new Set(out.parts.map((p) => p.group)).size).toBe(1);
      // The raised artwork is a ring and nothing else: no flat shells left
      // behind where trimming very nearly coincided with the plate.
      expect(out.parts.find((p) => p.id === 'artwork')!.mesh.stats.genus).toBe(1);
      expect(out.vectors?.find((v) => v.id === 'svg')?.data).toContain('<path');
    } finally {
      cleanup();
    }
  });

  it('warns that a cut-through leaves the counter with nothing holding it', async () => {
    const m = await kernel();
    try {
      const bmp = disc(96, 40, 20);
      const out = imageTraceGenerator.build(
        paramsWith({ image: imageId(bmp), style: 'cutout', width: 40 }),
        ctxFor(m, bmp),
      );
      expect(messagesOf(out, 'warn').join(' ')).toMatch(/island/);
      expect(out.parts).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it('warns that a bare silhouette of several blobs prints as several parts', async () => {
    const m = await kernel();
    try {
      const twoBlobs = bitmapOf([
        '####....####',
        '####....####',
        '####....####',
        '####....####',
      ]);
      const out = imageTraceGenerator.build(
        paramsWith({ image: imageId(twoBlobs), style: 'silhouette', width: 40, despeckle: 0 }),
        ctxFor(m, twoBlobs),
      );
      expect(messagesOf(out, 'warn').join(' ')).toMatch(/separate pieces/);
    } finally {
      cleanup();
    }
  });

  it('refuses an engraving that would cut through the plate', async () => {
    const m = await kernel();
    try {
      const bmp = disc(64, 26, 0);
      const out = imageTraceGenerator.build(
        paramsWith({ image: imageId(bmp), style: 'engraved', thickness: 2, relief: 2 }),
        ctxFor(m, bmp),
      );
      expect(messagesOf(out, 'error').join(' ')).toMatch(/cut straight through/);
    } finally {
      cleanup();
    }
  });

  it('grows the plate to make room for a hanging hole rather than eating the margin', async () => {
    const m = await kernel();
    try {
      const bmp = disc(64, 26, 0);
      const base = { image: imageId(bmp), style: 'plaque', width: 40, margin: 5 };
      const plain = imageTraceGenerator.build(paramsWith(base), ctxFor(m, bmp));
      const hung = imageTraceGenerator.build(
        paramsWith({ ...base, hole: true, holeDiameter: 4, holePosition: 'top' }),
        ctxFor(m, bmp),
      );
      const heightOf = (r: BuildResult): number => {
        const plate = r.parts.find((x) => x.id === 'plate')!;
        return plate.mesh.bbox.max[1] - plate.mesh.bbox.min[1];
      };
      expect(heightOf(hung)).toBeGreaterThan(heightOf(plain) + 4);
      expect(messagesOf(hung, 'error')).toEqual([]);
      // The hole is a hole: the plate now has one tunnel through it.
      expect(hung.parts.find((x) => x.id === 'plate')!.mesh.stats.genus).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('builds every preset, on a picture with a curve, a corner and a counter', async () => {
    const m = await kernel();
    try {
      // Every preset covers a different style, and each style has its own way
      // of meeting the plate -- this is the one test that walks all of them.
      const bmp = disc(96, 40, 18);
      for (const preset of imageTraceGenerator.presets ?? []) {
        const out = imageTraceGenerator.build(
          paramsWith({ ...preset.values, image: imageId(bmp) }),
          ctxFor(m, bmp),
        );
        expect(messagesOf(out, 'error'), preset.label).toEqual([]);
        expect(out.parts.length, preset.label).toBeGreaterThan(0);
        expect(out.vectors?.find((v) => v.id === 'svg')?.data, preset.label).toContain('<path');
        for (const part of out.parts) {
          expect(part.mesh.stats.volumeMm3, `${preset.label}/${part.id}`).toBeGreaterThan(0);
        }
      }
    } finally {
      cleanup();
    }
  });

  it('hangs a silhouette off a lug that is welded to it, not resting on it', async () => {
    const m = await kernel();
    try {
      const bmp = disc(64, 26, 0);
      const out = imageTraceGenerator.build(
        paramsWith({
          image: imageId(bmp),
          style: 'silhouette',
          width: 30,
          hole: true,
          holeDiameter: 4,
        }),
        ctxFor(m, bmp),
      );
      expect(messagesOf(out, 'error')).toEqual([]);
      expect(out.parts).toHaveLength(1);
      // One body with one tunnel: a tangent lug would serialize just as
      // happily and print as a loose ring.
      expect(out.parts[0]!.mesh.stats.genus).toBe(1);
    } finally {
      cleanup();
    }
  });
});
