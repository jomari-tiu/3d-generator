// Hand-written declarations for opentype.js 2.0.0.
//
// Deliberately NOT using @types/opentype.js: that package is 1.3.10 and
// describes the 1.x API against a 2.0.0 runtime, so it mistypes whatever
// changed (its `features` is a boolean record; 2.x wants {script, tags}[]).
// This declares only the surface we actually use.
declare module 'opentype.js' {
  export interface PathCommand {
    type: 'M' | 'L' | 'Q' | 'C' | 'Z';
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  }

  export interface BoundingBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }

  export class Path {
    commands: PathCommand[];
    getBoundingBox(): BoundingBox;
  }

  export class Glyph {
    index: number;
    name: string | null;
    unicode?: number;
    advanceWidth?: number;
    /** NOTE: negates Y (emits screen space). See commandsToRings. */
    getPath(x?: number, y?: number, fontSize?: number): Path;
    getBoundingBox(): BoundingBox;
  }

  export interface Os2Table {
    sCapHeight?: number;
    sxHeight?: number;
  }

  export interface FontTables {
    os2?: Os2Table;
  }

  export class Font {
    unitsPerEm: number;
    ascender: number;
    descender: number;
    tables: FontTables;
    names: Record<string, Record<string, string>>;
    /** Bypasses GSUB shaping, unlike getPaths/getAdvanceWidth. */
    charToGlyph(char: string): Glyph;
    getKerningValue(left: Glyph, right: Glyph): number;
  }

  export function parse(buffer: ArrayBuffer, options?: { lowMemory?: boolean }): Font;
}
