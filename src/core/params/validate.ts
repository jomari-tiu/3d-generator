import type { Generator, ParamSpec, ParamValue, Params } from './types';

export function defaultsOf(gen: Generator): Params {
  const out: Params = {};
  for (const p of gen.params) out[p.id] = p.default;
  return out;
}

/** Clamp/coerce one incoming value to its spec. Never throws. */
export function coerce(spec: ParamSpec, raw: unknown): ParamValue {
  switch (spec.type) {
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
      if (!Number.isFinite(n)) return spec.default;
      const clamped = Math.min(spec.max, Math.max(spec.min, n));
      return spec.integer ? Math.round(clamped) : clamped;
    }
    case 'bool':
      return typeof raw === 'boolean' ? raw : String(raw) === 'true' || raw === 1;
    case 'text': {
      const s = String(raw ?? '');
      return s.length > spec.maxLength ? s.slice(0, spec.maxLength) : s;
    }
    case 'choice': {
      const s = String(raw ?? '');
      return spec.options.some((o) => o.value === s) ? s : spec.default;
    }
    case 'color': {
      const s = String(raw ?? '').trim();
      return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : spec.default;
    }
    case 'font':
      return String(raw ?? '') || spec.default;
    // An image id is opaque: it names something that either is on this machine
    // or is not, and coercion cannot tell the difference. Substituting the
    // default for an unknown id would silently swap the picture, so an id that
    // resolves to nothing is reported as a missing image instead.
    case 'image':
      return String(raw ?? '');
  }
}

/** Merge partial values over defaults, coercing everything. */
export function coerceAll(gen: Generator, incoming: Readonly<Record<string, unknown>>): Params {
  const out = defaultsOf(gen);
  for (const spec of gen.params) {
    if (Object.prototype.hasOwnProperty.call(incoming, spec.id)) {
      out[spec.id] = coerce(spec, incoming[spec.id]);
    }
  }
  return out;
}

/** Parameters that differ from this generator's defaults. */
export function changedFromDefaults(gen: Generator, values: Params): string[] {
  const defaults = defaultsOf(gen);
  return gen.params
    .filter((spec) => values[spec.id] !== undefined && values[spec.id] !== defaults[spec.id])
    .map((spec) => spec.id);
}

/**
 * Is this parameter the CONTENT -- the particular thing being made -- rather
 * than the look it is made in?
 *
 * Free text is content unless a generator says otherwise. That single rule
 * covers every generator here (the name, the grade and section, the pet's
 * name, the keys to spell, the word on the keychain) without the UI having to
 * know what any of them are, which is the same bargain the rest of the schema
 * makes. A generator that needs a different answer sets `content` itself.
 */
export function isContent(spec: ParamSpec): boolean {
  return spec.content ?? spec.type === 'text';
}

/**
 * The look, without the content: what a saved template is made of.
 *
 * Only the look is stored, and that is the whole point rather than an
 * optimisation -- applying a template merges it OVER the current values, so
 * whatever is missing from it is whatever survives. Leave the text out and the
 * word you have already typed is kept.
 */
export function styleOf(gen: Generator, values: Params): Params {
  const out: Params = {};
  for (const spec of gen.params) {
    if (isContent(spec)) continue;
    const v = values[spec.id];
    if (v !== undefined) out[spec.id] = v;
  }
  return out;
}

/**
 * Serialize only the values that differ from defaults, so permalinks stay
 * short and an old link degrades (via coerceAll) instead of throwing.
 */
export function encodeParams(gen: Generator, values: Params): string {
  const defaults = defaultsOf(gen);
  const diff: Record<string, ParamValue> = {};
  for (const spec of gen.params) {
    const v = values[spec.id];
    if (v !== undefined && v !== defaults[spec.id]) diff[spec.id] = v;
  }
  const payload = { g: gen.id, p: diff };
  return encodeURIComponent(JSON.stringify(payload));
}

export function decodeHash(hash: string): { g?: string; p?: Record<string, unknown> } {
  const raw = hash.replace(/^#/, '');
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    if (parsed && typeof parsed === 'object') {
      return parsed as { g?: string; p?: Record<string, unknown> };
    }
  } catch {
    // A hand-edited or stale link should degrade to defaults, not break.
  }
  return {};
}

export function isVisible(spec: ParamSpec, values: Params): boolean {
  return spec.visibleIf ? spec.visibleIf(values) : true;
}

/** Stable cache key for (generator, values, tolerance). */
export function hashKey(genId: string, values: Params, tolerance: number): string {
  const keys = Object.keys(values).sort();
  let s = `${genId}|${tolerance}`;
  for (const k of keys) s += `|${k}=${String(values[k])}`;
  return s;
}
