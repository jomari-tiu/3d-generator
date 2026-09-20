import { describe, expect, it } from 'vitest';
import {
  changedFromDefaults,
  coerceAll,
  decodeHash,
  defaultsOf,
  encodeParams,
  isContent,
  styleOf,
} from '../src/core/params/validate';
import { GENERATORS } from '../src/generators/registry';
import { nameTagGenerator } from '../src/generators/nametag/build';
import { keychainGenerator } from '../src/generators/keychain/build';

describe('changedFromDefaults', () => {
  it('finds nothing to reset in a fresh generator', () => {
    for (const gen of GENERATORS) {
      expect(changedFromDefaults(gen, defaultsOf(gen)), gen.name).toEqual([]);
    }
  });

  it('names only the parameters that actually differ', () => {
    const values = coerceAll(nameTagGenerator, {
      ...defaultsOf(nameTagGenerator),
      text: 'EMMA',
      fontSize: 14,
    });
    expect(changedFromDefaults(nameTagGenerator, values).sort()).toEqual(['fontSize', 'text']);
  });

  it('ignores a value set back to its own default', () => {
    const spec = nameTagGenerator.params.find((s) => s.id === 'fontSize')!;
    const values = coerceAll(nameTagGenerator, {
      ...defaultsOf(nameTagGenerator),
      fontSize: spec.default,
    });
    expect(changedFromDefaults(nameTagGenerator, values)).toEqual([]);
  });

  it('ignores keys that are not this generator\'s parameters', () => {
    // A permalink from an older build, or from another generator, carries keys
    // this one has never heard of. They are not settings, so they are not
    // something Reset can put back.
    const values = { ...defaultsOf(nameTagGenerator), somethingRemovedLongAgo: 42 };
    expect(changedFromDefaults(nameTagGenerator, values)).toEqual([]);
  });

  it('agrees with what the permalink chooses to encode', () => {
    // Both walk the same diff, so a "0 changed settings" reset button and a
    // bare permalink have to mean the same thing.
    for (const gen of GENERATORS) {
      const defaults = defaultsOf(gen);
      expect(decodeHash(`#${encodeParams(gen, defaults)}`).p, gen.name).toEqual({});

      const first = gen.params[0]!;
      const nudged = coerceAll(gen, {
        ...defaults,
        [first.id]: first.type === 'number' ? Number(first.default) + first.step : first.default,
      });
      const changed = changedFromDefaults(gen, nudged);
      const encoded = Object.keys(decodeHash(`#${encodeParams(gen, nudged)}`).p ?? {});
      expect(encoded.sort(), gen.name).toEqual(changed.sort());
    }
  });
});

describe('sidebar tabs', () => {
  it('gives every group a tab, in every generator', () => {
    // The panel falls back to one unnamed tab when nothing declares one, which
    // is the right default but the wrong outcome here: a generator that half
    // declares them would show some groups under a tab bar and the rest loose
    // beneath it, which reads as a bug rather than a layout.
    for (const gen of GENERATORS) {
      for (const group of gen.groups) {
        expect(group.tab, `${gen.name} / ${group.label}`).toBeTruthy();
      }
    }
  });

  it('keeps the bar short enough to fit the sidebar', () => {
    // The bar WRAPS now, so the count is no longer the whole story -- it used
    // to be capped at four because four short labels were all one row of a
    // 340px column would hold. What still has to hold is that the labels stay
    // short and that the bar does not become a menu: a tab per module is the
    // reason for the change, and a tab whose every control is hidden by a
    // visibleIf drops out of the bar on its own, so ten declared is six or
    // seven shown for a set anyone actually builds.
    for (const gen of GENERATORS) {
      const tabs = [...new Set(gen.groups.map((g) => g.tab))];
      expect(tabs.length, `${gen.name}: ${tabs.join(' | ')}`).toBeLessThanOrEqual(10);
      expect(tabs.length, gen.name).toBeGreaterThan(1);
      for (const t of tabs) expect(String(t).length, `${gen.name}: "${t}"`).toBeLessThanOrEqual(10);
    }
  });

  it('keeps each tab contiguous, so the bar order matches the groups', () => {
    // The panel creates a tab when it first meets one and appends the groups as
    // it walks. Groups that jumped back to an earlier tab would still render,
    // but the reading order of the sidebar would no longer be the declared
    // order of the schema -- and that is the thing the schema is for.
    for (const gen of GENERATORS) {
      const seen: string[] = [];
      for (const g of gen.groups) {
        const tab = String(g.tab);
        if (seen[seen.length - 1] !== tab) {
          expect(seen, `${gen.name}: "${tab}" resumes after a gap`).not.toContain(tab);
          seen.push(tab);
        }
      }
    }
  });

  it('puts every parameter in a group that exists', () => {
    // A typo'd group id used to mean a control that silently never rendered.
    // Under tabs it is worse: the group is missing from a tab, so there is not
    // even an empty section to notice.
    for (const gen of GENERATORS) {
      const ids = new Set(gen.groups.map((g) => g.id));
      for (const spec of gen.params) {
        expect(ids.has(spec.group), `${gen.name} / ${spec.id} -> "${spec.group}"`).toBe(true);
      }
    }
  });
});

describe('templates: the look without the content', () => {
  it('leaves the content out of the look', () => {
    let withContent = 0;
    for (const gen of GENERATORS) {
      const look = styleOf(gen, defaultsOf(gen));
      // Asked by content rather than by type, because free text is only the
      // DEFAULT answer to that question: the image tracer's content is the file
      // that was dropped in.
      const contentIds = gen.params.filter(isContent).map((s) => s.id);
      if (contentIds.length > 0) withContent++;
      for (const id of contentIds) {
        expect(Object.prototype.hasOwnProperty.call(look, id), `${gen.name}.${id}`).toBe(false);
      }
    }
    // Most generators make a named thing, and the rule would be vacuous if none
    // did. Not ALL of them, though: the drawer is a mechanism with nothing
    // written on it, so its template is simply the whole configuration -- which
    // is the right answer for a part with no content to preserve.
    expect(withContent).toBeGreaterThan(GENERATORS.length / 2);
  });

  it('carries every non-content setting', () => {
    for (const gen of GENERATORS) {
      const look = styleOf(gen, defaultsOf(gen));
      const expected = gen.params.filter((s) => !isContent(s)).map((s) => s.id);
      expect(Object.keys(look).sort(), gen.name).toEqual(expected.sort());
    }
  });

  it('keeps the word you already typed when a look is applied over it', () => {
    // The whole point of a template: styling saved off one name, applied to
    // the next one, without retyping either.
    const dylan = coerceAll(keychainGenerator, {
      ...defaultsOf(keychainGenerator),
      text: 'Dylan',
      style: 'double',
      plateColor: '#f0a500',
      fontSize: 12,
    });
    const look = styleOf(keychainGenerator, dylan);

    const typing = coerceAll(keychainGenerator, { ...defaultsOf(keychainGenerator), text: 'Rekha' });
    const applied = coerceAll(keychainGenerator, { ...typing, ...look });

    expect(applied.text).toBe('Rekha');
    expect(applied.style).toBe('double');
    expect(applied.plateColor).toBe('#f0a500');
    expect(applied.fontSize).toBe(12);
  });

  it('is a look, not a whole configuration - unlike a preset', () => {
    // A preset starts from defaults and so wipes the text; a template merges
    // over what you have. This is the difference, asserted.
    const mine = coerceAll(nameTagGenerator, {
      ...defaultsOf(nameTagGenerator),
      text: 'EMMA',
      plateColor: '#112233',
    });
    const asPreset = coerceAll(nameTagGenerator, {
      ...defaultsOf(nameTagGenerator),
      ...{ ...mine },
    });
    const asTemplate = coerceAll(nameTagGenerator, {
      ...coerceAll(nameTagGenerator, { ...defaultsOf(nameTagGenerator), text: 'NOAH' }),
      ...styleOf(nameTagGenerator, mine),
    });
    expect(asPreset.text).toBe('EMMA');
    expect(asTemplate.text).toBe('NOAH');
    expect(asTemplate.plateColor).toBe('#112233');
  });

  it('honours an explicit content flag over the text-type inference', () => {
    const spec = { id: 'x', label: 'X', type: 'text', group: 'g', default: '', maxLength: 4 } as const;
    expect(isContent(spec)).toBe(true);
    expect(isContent({ ...spec, content: false })).toBe(false);
    const choice = { id: 'y', label: 'Y', type: 'choice', group: 'g', default: 'a', options: [] } as const;
    expect(isContent(choice)).toBe(false);
    expect(isContent({ ...choice, content: true })).toBe(true);
  });
});
