/**
 * Raster input for the tracer. DOM-free by construction: decoding a File into
 * one of these needs a canvas and so happens up in src/ui, exactly like font
 * parsing does -- everything below this line works on plain TypedArrays and
 * can move to a worker untouched.
 */
export interface Bitmap {
  readonly width: number;
  readonly height: number;
  /**
   * Perceptual luminance, one byte per pixel, row-major from the TOP LEFT --
   * image order, Y down. Already composited over white, so a transparent PNG
   * reads as white here rather than as black.
   */
  readonly gray: Uint8Array;
  /** The alpha channel that compositing consumed, kept so a cut-out PNG can key on it. */
  readonly alpha: Uint8Array;
  /** Shown in the sidebar; never used for geometry. */
  readonly name?: string;
}

/** A binary foreground mask in image order. 1 = ink. */
export interface Mask {
  readonly w: number;
  readonly h: number;
  readonly bits: Uint8Array;
}

export type MaskSource = 'auto' | 'luminance' | 'alpha';

export interface MaskOptions {
  /**
   * Which channel decides ink. 'auto' picks alpha when the image actually has
   * transparency -- a logo exported as a cut-out PNG is defined by its alpha,
   * and thresholding its luminance instead keys on whatever colour the artwork
   * happens to be, which for a white logo is the entire image.
   */
  readonly source?: MaskSource;
  /** 0..100. Pixels darker than this (or more opaque than it) become ink. */
  readonly threshold: number;
  readonly invert?: boolean;
  /** Drop ink blobs and holes smaller than this many pixels. 0 disables. */
  readonly despeckle?: number;
}

/**
 * How a diagonal touch is read, at the one place a binary mask is genuinely
 * ambiguous: two ink pixels meeting corner to corner.
 *
 * 'connect' keeps them one body, which is what a print needs -- the alternative
 * leaves a zero-width contact that slices into two loose pieces.
 */
export type DiagonalPolicy = 'connect' | 'separate';

export interface TraceOptions extends MaskOptions {
  readonly diagonal?: DiagonalPolicy;
  /** Douglas-Peucker tolerance in PIXELS. Higher = fewer, longer segments. */
  readonly detail?: number;
  /** 0..1. Corner cutting: 0 leaves the staircase, 1 is a full quadratic spline. */
  readonly smooth?: number;
  /**
   * Turn angle in degrees above which a vertex is treated as a real corner and
   * kept sharp through smoothing. Without it, smoothing rounds the deliberate
   * 90-degree corners of a logo as eagerly as it rounds the staircase noise.
   */
  readonly cornerAngle?: number;
  /** Discard rings whose area is under this many square pixels. */
  readonly minArea?: number;
}
