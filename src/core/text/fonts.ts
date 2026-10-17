import { parse, type Font } from 'opentype.js';

export interface FontEntry {
  readonly id: string;
  readonly label: string;
  readonly url?: string;
  /** True for fonts the user loaded themselves -- untested territory. */
  readonly custom?: boolean;
  /** Advisory shown in the sidebar when a face needs care. */
  readonly note?: string;
}

/**
 * Bundled faces. Heavy weights with closed, chunky counters are what survive
 * being printed at small sizes, which is why the defaults are bolds.
 * All OFL / Apache-2.0; licences sit alongside the files in public/fonts.
 */
export const BUNDLED_FONTS: readonly FontEntry[] = [
  { id: 'inter-bold', label: 'Inter Bold', url: 'fonts/inter-bold.woff' },
  { id: 'roboto-slab-bold', label: 'Roboto Slab Bold', url: 'fonts/roboto-slab-bold.woff' },
  { id: 'bebas-neue', label: 'Bebas Neue', url: 'fonts/bebas-neue.woff' },
  { id: 'nunito-extrabold', label: 'Nunito ExtraBold', url: 'fonts/nunito-extrabold.woff' },
  { id: 'archivo-black', label: 'Archivo Black', url: 'fonts/archivo-black.woff' },
  { id: 'chicle', label: 'Chicle (groovy)', url: 'fonts/chicle.woff' },
  { id: 'oi', label: 'Oi (groovy, extra fat)', url: 'fonts/oi.ttf' },
  { id: 'bagel-fat-one', label: 'Bagel Fat One (bubbly)', url: 'fonts/bagel-fat-one.woff' },
  { id: 'coiny', label: 'Coiny (round)', url: 'fonts/coiny.woff' },
  {
    id: 'pacifico',
    label: 'Pacifico (script)',
    url: 'fonts/pacifico.woff',
    note: 'Script face - needs a larger text size before its thin joins clear one nozzle width.',
  },
];

/**
 * Parses and caches fonts. Caches the opentype Font (a plain JS object), never
 * kernel objects -- those cannot outlive a build arena.
 */
export class FontRegistry {
  private readonly parsed = new Map<string, Font>();
  private readonly entries = new Map<string, FontEntry>();
  private readonly inflight = new Map<string, Promise<Font>>();

  constructor(entries: readonly FontEntry[] = BUNDLED_FONTS) {
    for (const e of entries) this.entries.set(e.id, e);
  }

  list(): readonly FontEntry[] {
    return [...this.entries.values()];
  }

  entry(id: string): FontEntry | undefined {
    return this.entries.get(id);
  }

  /** Already-parsed font, or undefined. Synchronous, for use inside a build. */
  peek(id: string): Font | undefined {
    return this.parsed.get(id);
  }

  get(id: string): Font {
    const f = this.parsed.get(id);
    if (!f) throw new Error(`Font not loaded: ${id}`);
    return f;
  }

  async load(id: string): Promise<Font> {
    const cached = this.parsed.get(id);
    if (cached) return cached;

    const pending = this.inflight.get(id);
    if (pending) return pending;

    const entry = this.entries.get(id);
    if (!entry?.url) throw new Error(`Unknown font: ${id}`);

    const p = (async () => {
      const res = await fetch(entry.url!);
      if (!res.ok) throw new Error(`Failed to fetch ${entry.url}: ${res.status}`);
      const font = parse(await res.arrayBuffer());
      this.parsed.set(id, font);
      this.inflight.delete(id);
      return font;
    })();
    this.inflight.set(id, p);
    return p;
  }

  /**
   * Register a user-supplied font file. WOFF2 is rejected with a clear
   * message: opentype.js needs an external decompressor for it.
   */
  addCustom(name: string, data: ArrayBuffer): FontEntry {
    let font: Font;
    try {
      font = parse(data);
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      if (msg.includes('WOFF2')) {
        throw new Error('WOFF2 fonts are not supported - please upload a .ttf, .otf or .woff.');
      }
      throw new Error(`Could not read that font: ${msg}`);
    }

    const id = `custom:${name}`;
    const entry: FontEntry = {
      id,
      label: name.replace(/\.(ttf|otf|woff)$/i, ''),
      custom: true,
      note: 'Uploaded font - check the thin-stroke warning before printing.',
    };
    this.entries.set(id, entry);
    this.parsed.set(id, font);
    return entry;
  }
}
