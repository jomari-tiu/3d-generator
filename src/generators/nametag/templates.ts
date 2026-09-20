/**
 * School-tag templates: shape, frame and hanging hole as one named style.
 *
 * These own the STYLE, never the DIMENSIONS. Plate thickness, text size, hole
 * diameter, padding and colours all stay on their own sliders, because they
 * are what makes a tag fit a particular lanyard, printer and bag. Picking a
 * template therefore never throws away what the user has already typed or
 * sized -- which is also why this is a parameter rather than a preset, since
 * applying a preset resets every field.
 *
 * Everything the template does set is expressed as a multiple of the name's cap
 * height, so a 40 mm tag and a 90 mm tag come out looking like the same design
 * rather than the small one looking like a thick-rimmed coaster.
 */
export interface TemplateSpec {
  readonly id: string;
  readonly label: string;
  readonly shape: string;
  /** Corner radius, x cap height. Only meaningful for rounded and scallop. */
  readonly cornerMul: number;
  /**
   * 'trace' follows the plate silhouette inward -- the right answer for a
   * lobed outline. 'rect' insets a rounded rectangle instead, which is what
   * both the square and the capsule tags want: a pill offset inward is just a
   * smaller pill, and it reads as a shadow rather than a frame.
   */
  readonly frame: 'none' | 'trace' | 'rect';
  readonly frameWidthMul: number;
  readonly frameGapMul: number;
  readonly hole: string;
  readonly holePosition: string;
}

export const TEMPLATES: readonly TemplateSpec[] = [
  {
    id: 'classic',
    label: 'Classic',
    shape: 'rounded',
    cornerMul: 0.55,
    frame: 'rect',
    frameWidthMul: 0.13,
    frameGapMul: 0.2,
    hole: 'slot',
    holePosition: 'top',
  },
  {
    id: 'cloud',
    label: 'Cloud',
    shape: 'cloud',
    cornerMul: 0,
    // A wider rim, set further in than the other templates get: a cloud is
    // read by its outline, and a hairline rim following it at a hairline
    // distance just makes the edge look doubled instead of framed.
    frameWidthMul: 0.24,
    frame: 'trace',
    frameGapMul: 0.24,
    hole: 'slot',
    holePosition: 'top',
  },
  {
    id: 'scallop',
    label: 'Scallop',
    shape: 'scallop',
    cornerMul: 0.5,
    frame: 'trace',
    frameWidthMul: 0.12,
    frameGapMul: 0.14,
    hole: 'tab',
    holePosition: 'top',
  },
  {
    id: 'bubble',
    label: 'Bubble',
    shape: 'bubble',
    cornerMul: 0,
    frame: 'trace',
    frameWidthMul: 0.12,
    frameGapMul: 0.14,
    hole: 'slot',
    holePosition: 'top',
  },
  {
    id: 'capsule',
    label: 'Capsule',
    shape: 'pill',
    cornerMul: 0.55,
    frame: 'rect',
    frameWidthMul: 0.13,
    frameGapMul: 0.26,
    hole: 'slot',
    holePosition: 'top',
  },
];

export function templateById(id: string): TemplateSpec | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export interface Style {
  readonly shape: string;
  readonly corner: number;
  readonly frame: 'none' | 'trace' | 'rect';
  readonly frameWidth: number;
  readonly frameGap: number;
  readonly hole: string;
  readonly holePosition: string;
}

/**
 * Resolve the effective style: the template's, or the individual controls when
 * no template is active. One function so the build never has to ask twice
 * which of the two is in charge.
 */
export function resolveStyle(
  templateId: string,
  capHeight: number,
  custom: {
    shape: string;
    corner: number;
    border: boolean;
    borderWidth: number;
    borderGap: number;
    hole: string;
    holePosition: string;
  },
): Style {
  const t = templateById(templateId);
  if (!t) {
    return {
      shape: custom.shape,
      corner: custom.corner,
      frame: custom.border ? 'trace' : 'none',
      frameWidth: custom.borderWidth,
      frameGap: custom.borderGap,
      hole: custom.hole,
      holePosition: custom.holePosition,
    };
  }
  return {
    shape: t.shape,
    corner: t.cornerMul * capHeight,
    frame: t.frame,
    frameWidth: t.frameWidthMul * capHeight,
    frameGap: t.frameGapMul * capHeight,
    hole: t.hole,
    holePosition: t.holePosition,
  };
}
