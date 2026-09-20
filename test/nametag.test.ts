import { describe, expect, it } from 'vitest';
import { cleanup, kernel, loadFont } from './kernel';
import { nameTagGenerator, secondLineText } from '../src/generators/nametag/build';
import { plateSection, safeArea, tabSection } from '../src/generators/nametag/shapes';
import { TEMPLATES, resolveStyle } from '../src/generators/nametag/templates';
import { coerceAll, defaultsOf } from '../src/core/params/validate';
import type { BuildCtx, Params } from '../src/core/params/types';
import type { ManifoldToplevel } from 'manifold-3d';

function ctxFor(m: ManifoldToplevel): BuildCtx {
  return {
    m,
    font: (id) => loadFont(id),
    image: () => undefined,
    tolerance: 0.02,
    issue: () => {},
  };
}

function paramsWith(patch: Params = {}): Params {
  return coerceAll(nameTagGenerator, { ...defaultsOf(nameTagGenerator), ...patch });
}

function errorsOf(result: { issues: readonly { level: string; message: string }[] }): string[] {
  return result.issues.filter((i) => i.level === 'error').map((i) => i.message);
}

describe('name tag', () => {
  it('composes the second line from grade and section', () => {
    expect(secondLineText(paramsWith({ secondLine: 'none' }))).toBe('');
    expect(
      secondLineText(paramsWith({ secondLine: 'gradeSection', grade: 'Grade 2', section: 'Jade' })),
    ).toBe('Grade 2 Jade');
    // Either half on its own is still a valid line.
    expect(
      secondLineText(paramsWith({ secondLine: 'gradeSection', grade: 'Prep', section: '' })),
    ).toBe('Prep');
    expect(
      secondLineText(paramsWith({ secondLine: 'custom', secondLineText: '  Room 12  ' })),
    ).toBe('Room 12');
  });

  it('loads the second line font only when there is a second line', () => {
    expect(nameTagGenerator.fontsNeeded?.(paramsWith())).toEqual(['inter-bold']);
    const both = nameTagGenerator.fontsNeeded?.(
      paramsWith({ secondLine: 'gradeSection', font: 'pacifico', secondLineFont: 'inter-bold' }),
    );
    expect(both).toEqual(['pacifico', 'inter-bold']);
  });

  it('grows the plate for the second line and lands it under the name', async () => {
    const m = await kernel();
    try {
      const plain = nameTagGenerator.build(paramsWith({ text: 'EMMA' }), ctxFor(m));
      const withLine = nameTagGenerator.build(
        paramsWith({ text: 'EMMA', secondLine: 'gradeSection' }),
        ctxFor(m),
      );
      expect(errorsOf(withLine)).toEqual([]);

      const heightOf = (r: typeof plain): number => {
        const p = r.parts.find((x) => x.id === 'plate')!;
        return p.mesh.bbox.max[1] - p.mesh.bbox.min[1];
      };
      expect(heightOf(withLine)).toBeGreaterThan(heightOf(plain));

      // The second line has to sit BELOW the name, not beside or over it.
      const letters = withLine.parts.find((x) => x.id === 'lettering')!;
      expect(letters.mesh.bbox.min[1]).toBeLessThan(plain.parts.find((x) => x.id === 'lettering')!.mesh.bbox.min[1]);
    } finally {
      cleanup();
    }
  });

  it('stacks the lettering one letter per line when asked', async () => {
    const m = await kernel();
    try {
      const boxOf = (r: { parts: readonly { id: string; mesh: { bbox: { min: number[]; max: number[] } } }[] }) => {
        const b = r.parts.find((x) => x.id === 'lettering')!.mesh.bbox;
        return { w: b.max[0]! - b.min[0]!, h: b.max[1]! - b.min[1]! };
      };
      const across = boxOf(nameTagGenerator.build(paramsWith({ text: 'EMMA' }), ctxFor(m)));
      const down = boxOf(
        nameTagGenerator.build(paramsWith({ text: 'EMMA', textDirection: 'vertical' }), ctxFor(m)),
      );
      expect(across.w).toBeGreaterThan(across.h);
      expect(down.h).toBeGreaterThan(down.w);
      // Four letters stacked stand at least as tall as four cap heights.
      expect(down.h).toBeGreaterThan(4 * 12);

      // A space has to hold its row open. Dropping blank rows instead is the
      // easy mistake, and it silently closes up any name with a space in it.
      const spaced = boxOf(
        nameTagGenerator.build(
          paramsWith({ text: 'A B', textDirection: 'vertical' }),
          ctxFor(m),
        ),
      );
      const tight = boxOf(
        nameTagGenerator.build(paramsWith({ text: 'AB', textDirection: 'vertical' }), ctxFor(m)),
      );
      expect(spaced.h).toBeGreaterThan(tight.h + 12);
    } finally {
      cleanup();
    }
  });

  it('builds every template as a valid two-colour tag', async () => {
    const m = await kernel();
    try {
      for (const t of TEMPLATES) {
        const result = nameTagGenerator.build(
          paramsWith({ template: t.id, text: 'EMMA', secondLine: 'gradeSection' }),
          ctxFor(m),
        );
        expect(errorsOf(result), `template "${t.label}"`).toEqual([]);
        expect(result.parts.map((p) => p.id), `template "${t.label}"`).toEqual([
          'plate',
          'lettering',
        ]);
        for (const part of result.parts) {
          expect(part.mesh.stats.volumeMm3, `${t.label} / ${part.name}`).toBeGreaterThan(0);
        }
      }
    } finally {
      cleanup();
    }
  });

  it('lets a template override the shape controls without touching the text', () => {
    const custom = { shape: 'hex', corner: 9, border: false, borderWidth: 1, borderGap: 1, hole: 'none', holePosition: 'left' };
    const free = resolveStyle('custom', 12, custom);
    expect(free.shape).toBe('hex');
    expect(free.frame).toBe('none');
    expect(free.hole).toBe('none');

    const cloud = resolveStyle('cloud', 12, custom);
    expect(cloud.shape).toBe('cloud');
    expect(cloud.frame).toBe('trace');
    expect(cloud.hole).toBe('slot');
    // Everything the template sets scales with the text, so a small tag and a
    // large one are the same design rather than differently-proportioned ones.
    expect(resolveStyle('cloud', 24, custom).frameWidth).toBeCloseTo(cloud.frameWidth * 2, 6);
  });

  it('keeps the cloud a cloud at every width', async () => {
    const m = await kernel();
    try {
      // Nothing here shows up in the bounding box or the area, and the shape
      // is only ever judged by eye, so pin down the two features that make it
      // read as a cloud: a tall dome over the middle, and scallops deep enough
      // to be scallops hanging off the bottom. Repeating the middle too eagerly
      // flattens both at once, which is how it last turned into a caterpillar.
      for (const [w, h] of [[83.75, 50], [95, 54], [130, 45], [70, 50], [120, 60], [64, 44]]) {
        const cloud = plateSection(m, 'cloud', w, h, 0);
        const tall = m.CrossSection.square([0.3, 4 * h], true);
        const edge = (x: number): { top: number; bottom: number } => {
          const b = cloud.intersect(tall.translate([x, 0])).bounds();
          return { top: b.max[1], bottom: b.min[1] };
        };

        // The dome stands well above the shoulders either side of it.
        const shoulder = Math.max(edge(-0.4 * w).top, edge(0.4 * w).top);
        const peak = Math.max(...[-0.1, 0, 0.1, 0.2].map((f) => edge(f * w).top));
        expect(peak - shoulder, `${w}x${h} dome`).toBeGreaterThan(0.18 * h);

        // And the base is scalloped, not flat and not a fringe.
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = 0; i <= 40; i++) {
          const y = edge((i / 40 - 0.5) * 0.7 * w).bottom;
          lo = Math.min(lo, y);
          hi = Math.max(hi, y);
        }
        expect(hi - lo, `${w}x${h} scallops`).toBeGreaterThan(0.06 * h);
        expect(hi - lo, `${w}x${h} scallops`).toBeLessThan(0.28 * h);

        // Count the scallops: a zigzag walk along the bottom that only turns
        // once the edge has moved by more than the sampling wobble, so a bump
        // has to be a real one.
        const prominence = 0.015 * h;
        const n = 240;
        let bumps = 0;
        let dir = 0;
        let lowest = edge(-0.45 * w).bottom;
        let highest = lowest;
        for (let i = 0; i <= n; i++) {
          const y = edge((i / n - 0.5) * 0.9 * w).bottom;
          lowest = Math.min(lowest, y);
          highest = Math.max(highest, y);
          if (dir !== -1 && y - lowest > prominence) {
            bumps++;
            dir = -1;
            lowest = y;
            highest = y;
          } else if (dir !== 1 && highest - y > prominence) {
            dir = 1;
            lowest = y;
            highest = y;
          }
        }
        expect(bumps, `${w}x${h} scallop count`).toBeGreaterThan(1);
        expect(bumps, `${w}x${h} scallop count`).toBeLessThanOrEqual(7);
      }
    } finally {
      cleanup();
    }
  });

  it('keeps the blob shapes inside the box they were asked for', async () => {
    const m = await kernel();
    try {
      for (const shape of ['cloud', 'bubble', 'scallop', 'rounded', 'pill']) {
        const s = plateSection(m, shape, 70, 26, 4);
        const b = s.bounds();
        expect(b.max[0] - b.min[0], `${shape} width`).toBeCloseTo(70, 1);
        expect(b.max[1] - b.min[1], `${shape} height`).toBeCloseTo(26, 1);
        expect(s.area(), `${shape} area`).toBeGreaterThan(0);
      }
    } finally {
      cleanup();
    }
  });

  it('leaves solid plate at top centre of every lobed shape', async () => {
    const m = await kernel();
    try {
      // The hanging hole goes at top centre. A lobe count that rounded the
      // wrong way would put a valley there and the hole would breach the edge.
      for (const shape of ['cloud', 'bubble', 'scallop']) {
        for (const w of [40, 55, 70, 95, 120]) {
          const s = plateSection(m, shape, w, 26, 4);
          const probe = m.CrossSection.square([3, 6], true).translate([0, 26 / 2 - 4]);
          expect(
            probe.subtract(s).area(),
            `${shape} at ${w}mm has no material under the hole`,
          ).toBeLessThan(0.05);
        }
      }
    } finally {
      cleanup();
    }
  });

  it('reports lettering that does not fit the shape it was given', async () => {
    const m = await kernel();
    try {
      const result = nameTagGenerator.build(
        paramsWith({ text: 'WIDE', sizeMode: 'fixed', width: 30, height: 14, fontSize: 12 }),
        ctxFor(m),
      );
      expect(errorsOf(result).join(' ')).toMatch(/bigger than the plate|does not fit/i);
    } finally {
      cleanup();
    }
  });

  it('adds a tab loop that stands above the plate and is pierced', async () => {
    const m = await kernel();
    try {
      const tab = tabSection(m, 70, 26, 4);
      const b = tab.outline.bounds();
      expect(b.max[1]).toBeGreaterThan(26 / 2);
      // It must reach back INTO the plate, not meet the edge on a tangent.
      expect(b.min[1]).toBeLessThan(26 / 2);
      expect(tab.hole.area()).toBeGreaterThan(0);
      expect(tab.hole.subtract(tab.outline).area()).toBeLessThan(0.05);
    } finally {
      cleanup();
    }
  });

  it('claims no more usable area than a shape really has', async () => {
    const m = await kernel();
    try {
      for (const shape of ['cloud', 'bubble', 'scallop', 'ellipse', 'hex', 'pill', 'rounded']) {
        const s = safeArea(shape);
        expect(s.x, `${shape} x`).toBeGreaterThan(0.4);
        expect(s.y, `${shape} y`).toBeGreaterThan(0.4);
        expect(s.x, `${shape} x`).toBeLessThanOrEqual(1);
        expect(s.y, `${shape} y`).toBeLessThanOrEqual(1);

        // The claim is a promise to the sizing code, so check it against the
        // geometry rather than against a hand-written number: the rectangle it
        // says is writable has to actually be inside the plate, at every
        // aspect ratio the shape is likely to be asked for.
        for (const [w, h] of [[60, 40], [70, 26], [90, 40], [120, 30], [83.75, 50]]) {
          // A square corner for the plain rectangle: safeArea describes the
          // SHAPE, and knows nothing about the corner-radius control.
          const plate = plateSection(m, shape, w, h, shape === 'rounded' ? 0 : h * 0.25);
          const claimed = m.CrossSection.square([s.x * w, s.y * h], true).translate([0, s.cy * h]);
          expect(claimed.subtract(plate).area(), `${shape} at ${w}x${h}`).toBeLessThan(0.05);
        }
      }
      expect(safeArea('rounded')).toEqual({ x: 1, y: 1, cy: 0, minAspect: 0 });
    } finally {
      cleanup();
    }
  });

  it('keeps the raised frame inside the plate it is framing', async () => {
    const m = await kernel();
    try {
      // A 'rect' frame is inset from the BOUNDING BOX, which only matches the
      // plate when the plate is a rounded rectangle. On a round-ended one the
      // corners of that rectangle fall outside, and nothing downstream clips
      // the ring before it is unioned on -- so the frame runs out past the
      // edge as a square ledge. Fixed size, so the outline to compare against
      // is known exactly.
      const w = 86;
      const h = 34;
      for (const t of TEMPLATES) {
        const p = paramsWith({
          template: t.id, text: 'EMMA', sizeMode: 'fixed', width: w, height: h, fontSize: 9,
        });
        const style = resolveStyle(t.id, Number(p.fontSize), {
          shape: String(p.shape), corner: Number(p.cornerRadius), border: false,
          borderWidth: 1, borderGap: 1, hole: String(p.hole), holePosition: String(p.holePosition),
        });
        let outline = plateSection(m, style.shape, w, h, style.corner);
        // The scallop's tab is deliberately outside the plate -- it is a loop
        // added above it, not a hole taken out of it.
        if (style.hole === 'tab') {
          outline = m.CrossSection.union([
            outline,
            tabSection(m, w, h, Number(p.holeDiameter)).outline,
          ]);
        }

        const plate = nameTagGenerator.build(p, ctxFor(m)).parts.find((x) => x.id === 'plate')!;
        const solid = m.Manifold.ofMesh({
          numProp: plate.mesh.numProp,
          vertProperties: plate.mesh.position,
          triVerts: plate.mesh.index,
        });
        // Just above the bed: everything the plate puts down on the first layer.
        const footprint = solid.slice(0.2);
        expect(
          footprint.subtract(outline.offset(0.05, 'Round', 2, 16)).area(),
          `template "${t.label}" puts material outside its own outline`,
        ).toBeLessThan(0.05);
      }
    } finally {
      cleanup();
    }
  });

  it('leaves the plate in one piece and the lettering free of debris', async () => {
    const m = await kernel();
    try {
      // The coplanar-contact trap: a feature landing exactly on a face reads as
      // watertight, passes every volume and manifoldness check, and prints as
      // loose debris. The frame and the tab are unioned onto the plate, so the
      // plate has to come back as exactly one piece.
      //
      // The lettering cannot -- it is one piece per glyph by nature. What
      // matters there is that every piece is a real letter and not a sliver
      // shaken loose off one, so each is held to a floor on its volume.
      for (const t of ['classic', 'cloud', 'scallop', 'bubble', 'capsule', 'custom']) {
        const result = nameTagGenerator.build(
          paramsWith({
            template: t, text: 'EMMA', secondLine: 'gradeSection',
            border: true, hole: 'slot',
          }),
          ctxFor(m),
        );
        for (const part of result.parts) {
          const pieces = m.Manifold.ofMesh({
            numProp: part.mesh.numProp,
            vertProperties: part.mesh.position,
            triVerts: part.mesh.index,
          }).decompose();

          if (part.id === 'lettering') {
            // EMMA + "Grade 1 Rose" is 14 glyphs, none of which touch.
            expect(pieces.length, `${t} / ${part.name}`).toBe(14);
            for (const piece of pieces) {
              expect(piece.volume(), `${t} / stray sliver`).toBeGreaterThan(0.5);
            }
          } else {
            expect(pieces.length, `${t} / ${part.name}`).toBe(1);
          }
        }
      }
    } finally {
      cleanup();
    }
  });

  it('builds every preset without errors', async () => {
    const m = await kernel();
    try {
      for (const preset of nameTagGenerator.presets ?? []) {
        const result = nameTagGenerator.build(paramsWith(preset.values), ctxFor(m));
        expect(errorsOf(result), `preset "${preset.label}"`).toEqual([]);
        expect(result.parts.length, `preset "${preset.label}"`).toBeGreaterThan(0);
      }
    } finally {
      cleanup();
    }
  });
});
