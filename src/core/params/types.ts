import type { ManifoldToplevel } from 'manifold-3d';
import type { Font } from 'opentype.js';
import type { Bitmap, Mask } from '../image/types';
import type { RawMesh } from '../kernel/types';

export type Unit = 'mm' | 'deg' | 'count' | '%' | '';

export type ParamValue = number | boolean | string;
export type Params = Record<string, ParamValue>;

interface Base<T extends ParamValue> {
  readonly id: string;
  readonly label: string;
  /** Sidebar section this control belongs to. */
  readonly group: string;
  readonly default: T;
  readonly help?: string;
  readonly unit?: Unit;
  /** Hidden behind the Advanced toggle. */
  readonly advanced?: boolean;
  /** Show only when this predicate passes. Hidden values are RETAINED. */
  readonly visibleIf?: (v: Params) => boolean;
  /** Trailing debounce for this control specifically. Default 0. */
  readonly debounceMs?: number;
  /**
   * Whether this parameter is CONTENT -- the particular thing being made --
   * rather than the look it is made in.
   *
   * A saved template carries the look and deliberately leaves the content
   * alone, so applying one to a new name keeps the name. Defaults to
   * `type === 'text'` via `isContent()`, which is right for every generator
   * here: the free-text fields are the name, the second line, the word. Set it
   * explicitly when that inference is wrong for a particular control -- a text
   * field that is really styling, or a choice that really is content.
   */
  readonly content?: boolean;
}

export interface NumberParam extends Base<number> {
  readonly type: 'number';
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly integer?: boolean;
}

export interface BoolParam extends Base<boolean> {
  readonly type: 'bool';
}

export interface TextParam extends Base<string> {
  readonly type: 'text';
  readonly maxLength: number;
  readonly multiline?: boolean;
  readonly placeholder?: string;
}

export interface ChoiceParam extends Base<string> {
  readonly type: 'choice';
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

export interface FontParam extends Base<string> {
  readonly type: 'font';
}

export interface ColorParam extends Base<string> {
  readonly type: 'color';
}

/**
 * A raster image the user supplies.
 *
 * The VALUE is an id, not the picture. Millions of pixels have no business in
 * a permalink, a preset or a build cache key, and the id is a content hash of
 * the decoded bitmap -- so the same file dropped in twice is the same id, and a
 * link still names the same picture after a reload. The bitmap itself lives in
 * an ImageRegistry and reaches build() through ctx.image(), exactly as a font
 * reaches it through ctx.font().
 */
export interface ImageParam extends Base<string> {
  readonly type: 'image';
  /** Accept attribute for the file picker. */
  readonly accept?: string;
  /**
   * What the current settings would actually trace, for a live preview beside
   * the control.
   *
   * Supplied by the generator, like visibleIf, because only the generator knows
   * which of its parameters decide the answer -- the panel stays a renderer of
   * schemas and learns nothing about thresholds. Worth the hook: a threshold
   * slider with no preview is a slider you drag until the 3D view stops looking
   * wrong.
   */
  readonly preview?: (values: Params, bmp: Bitmap) => Mask | undefined;
}

export type ParamSpec =
  | NumberParam
  | BoolParam
  | TextParam
  | ChoiceParam
  | FontParam
  | ColorParam
  | ImageParam;

export interface ParamGroup {
  readonly id: string;
  readonly label: string;
  readonly collapsed?: boolean;
  /**
   * Sidebar tab this group sits under. Groups sharing a tab appear together,
   * and the tabs run in the order the groups first mention them.
   *
   * Optional, and the panel still knows nothing about any generator: declare no
   * tabs and there is exactly one, so the bar hides itself and the sidebar is
   * the plain list of groups it always was. It exists because these schemas
   * grew -- eleven groups in one scroll is a scroll, not a form -- and the only
   * place that knows which groups belong together is the generator.
   */
  readonly tab?: string;
}

// ---------------------------------------------------------------- build output

export interface Part {
  readonly id: string;
  readonly name: string;
  readonly mesh: RawMesh;
  readonly color: string;
  /**
   * Print orientation in degrees, XYZ order. DECLARED by the generator,
   * never inferred: only the generator knows the lever must lie flat so its
   * flexure bends in XY.
   */
  readonly orientation?: readonly [number, number, number];
  /** Why that orientation matters, surfaced to the user. */
  readonly orientationNote?: string;
  /**
   * Where this part sits in the ASSEMBLED model, as a translation from where it
   * was built. Preview only -- exports are always laid out for printing.
   *
   * Most parts here are modelled where they belong and need nothing. It exists
   * for the ones that are not: a keycap is built at the origin because that is
   * the only sane frame to cut a stem socket in, and would otherwise stack on
   * top of its neighbours in the assembled view.
   *
   * Translation only. A part that has to be TURNED to sit in the assembled
   * model says so with `pose` instead.
   */
  readonly assembly?: readonly [number, number, number];
  /**
   * A rigid transform for the ASSEMBLED model, applied after `assembly`: a
   * 4x4 matrix, column-major (three.js order). Preview and assembled export
   * only -- the print never sees it.
   *
   * For parts that print in one pose and are shown in another: a hinged chain
   * of letters prints flat and straight, and the only way to show that it
   * moves is to draw each link turned on its hinge.
   */
  readonly pose?: readonly number[];
  /**
   * Which way, and how far, this part moves apart from the rest in the
   * exploded view: a translation applied after `assembly` and `pose`. Preview
   * only. A generator that declares none on any part gets no Explode button,
   * since only it knows which way its pieces come apart.
   */
  readonly explode?: readonly [number, number, number];
  /**
   * Shown in the assembled preview and nowhere else: never laid on a plate,
   * never exported, never counted in the size or volume. For things that are
   * not printed -- the metal keyring a keychain hangs from -- but that the
   * user wants to see it with.
   */
  readonly previewOnly?: boolean;
  readonly quantity?: number;
  /**
   * Parts sharing a group are ONE printed object made of several coloured
   * bodies (a plate and its raised lettering), so plate layout keeps them
   * co-located instead of packing them apart.
   */
  readonly group?: string;
}

export interface Issue {
  readonly level: 'error' | 'warn';
  readonly message: string;
  /** Controls to highlight. */
  readonly paramIds?: readonly string[];
}

export interface BuildResult {
  readonly parts: readonly Part[];
  readonly issues: readonly Issue[];
  /** Extra readouts for the sidebar, e.g. computed spring force. */
  readonly readouts?: Readonly<Record<string, string>>;
  /**
   * 2D vector renderings of what this build produced, each offered as its own
   * download button.
   *
   * Declared by the generator so the UI can offer the buttons without knowing
   * which generator has any, or what formats -- the same bargain the rest of
   * the schema makes. A list rather than one field because the answer is
   * genuinely plural: the same rings are an SVG for a laser cutter and a DXF
   * for a CAD sketch, and neither is the "real" one.
   */
  readonly vectors?: readonly VectorExport[];
}

/** One downloadable vector file a build produced. */
export interface VectorExport {
  readonly id: string;
  /** Button text. Kept short: it sits in a row with 3MF, STL and PNG. */
  readonly label: string;
  /** Without the dot. The filename comes from the generator's content. */
  readonly extension: string;
  readonly mime: string;
  /** Button tooltip, for saying what the format is actually good for. */
  readonly title?: string;
  /**
   * The file itself, or a function that makes it. A function is only called
   * when the button is pressed, for exports too heavy to write on every rebuild.
   */
  readonly data: string | Uint8Array | (() => string | Uint8Array);
}

export interface BuildCtx {
  readonly m: ManifoldToplevel;
  /** Resolve an already-loaded font by id. */
  readonly font: (id: string) => Font;
  /**
   * Resolve an already-decoded bitmap by id, or undefined when it is not on
   * this machine -- which is what a shared permalink means, and an ordinary
   * thing for a generator to report rather than throw over.
   */
  readonly image: (id: string) => Bitmap | undefined;
  /** Bezier flattening tolerance in mm for this build. */
  readonly tolerance: number;
  issue(i: Issue): void;
}

export interface Generator {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /**
   * Presentation for the model picker. The picker renders whatever a generator
   * declares and knows nothing else about it, so adding a generator still means
   * adding exactly one module.
   */
  readonly tagline?: string;
  readonly highlights?: readonly string[];
  /**
   * Inline SVG for the picker card. Authored here in module source, never from
   * user input, which is why the picker can insert it as markup.
   */
  readonly art?: string;
  /**
   * Generators that are different designs of the same kind of thing share a
   * family, and the editor shows them as tabs -- one per design, each label
   * the generator's own -- so switching between them is one click and each
   * keeps its own settings. Still declared by the generator, so the UI learns
   * nothing about any particular one.
   */
  readonly family?: { readonly id: string; readonly label: string };
  readonly params: readonly ParamSpec[];
  readonly groups: readonly ParamGroup[];
  /**
   * Millimetres between pieces on the print plate. Defaults to the packer's
   * 3 mm, which suits small parts; big pieces with walls standing at their
   * edges want more, so a nozzle travelling past one cannot catch the next.
   */
  readonly plateGap?: number;
  /** Font ids this generator needs loaded before build() can run. */
  fontsNeeded?(p: Params): readonly string[];
  /** Image ids this generator needs decoded before build() can run. */
  imagesNeeded?(p: Params): readonly string[];
  /** Cheap cross-field checks, run before building. */
  validate?(p: Params): readonly Issue[];
  build(p: Params, ctx: BuildCtx): BuildResult;
  readonly presets?: readonly { readonly label: string; readonly values: Params }[];
}
