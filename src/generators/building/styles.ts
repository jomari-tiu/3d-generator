/**
 * The four building types, as a table of traits rather than four code paths.
 *
 * Each style is a real architectural language, and what separates them is which
 * facade ELEMENTS exist, not how they are drawn: an apartment block has
 * balconies and a stair tower, an office slab has banded glazing and floor
 * lines, a commercial block wraps ribbons round a chamfered corner over an open
 * ground floor, a curtain-wall office has glazed stripes on a stone base. Every
 * one of those is a boolean or a small enum here, and facade.ts reads the table.
 *
 * Keeping it a table rather than a switch matters for one reason: the styles
 * share nearly all their elements, and the moment they are four separate
 * builders the shared ones start to drift apart.
 */

export type Style =
  | 'apartment'
  | 'office'
  | 'commercial'
  | 'ribbon'
  | 'curtain'
  | 'modern'
  | 'plain';

/** Where the ground floor differs from the storeys above it. */
export type Ground =
  /** Same as any other floor. */
  | 'wall'
  /** Open under the front only, on columns -- the entrance is under cover. */
  | 'frontPilotis'
  /** Open on every face, on columns. */
  | 'pilotis'
  /** A projecting base course, for a stone or granite plinth storey. */
  | 'course'
  /** Glazed shop bays across the front, one per structural bay, in the wall. */
  | 'shop';

/** Horizontal articulation between storeys. */
export type Bands =
  | 'none'
  /** A thin line at each floor, the thickness of the slab behind it. */
  | 'floor'
  /** The whole spandrel, floor line to window sill, standing proud. */
  | 'spandrel';

export interface StyleTraits {
  readonly label: string;
  /** What `Windows: match the style` resolves to. */
  readonly windows: 'punched' | 'ribbon';
  /** Leave piers standing in the ribbon, so it reads as a grid of panes. */
  readonly mullions: boolean;
  readonly balconies: boolean;
  readonly bands: Bands;
  readonly ground: Ground;
  /** Glazed slots running the full height of the upper floors. */
  readonly stripes: boolean;
  /**
   * What `Under the columns: match the building type` resolves to. A shop
   * wants a glazed front behind its columns; an apartment block wants the
   * undercroft left open, and putting glass in it is a different building.
   */
  readonly shopfront: boolean;
  /** The core carries on above the roof as a stair tower with its own windows. */
  readonly tower: boolean;
  readonly chamfer: boolean;
  /** A billboard panel standing proud of the front. */
  readonly sign: boolean;
  /** A flat canopy on posts over the entrance. */
  readonly canopy: boolean;
  /** A louvred screen punched through the parapet. */
  readonly screen: boolean;
  /**
   * A thin slab running out over the ground floor on every face you can see:
   * the canopy over a row of shopfronts.
   */
  readonly awning: boolean;
  /** Each punched window divided into panes by a mullion and a transom. */
  readonly panes: boolean;
  /** A raised surround and a sill round every punched window. */
  readonly trim: boolean;
  /** A sign board over the shop bays, across the front. */
  readonly fascia: boolean;
  /** Blank blade signs standing out square from the front, up the upper floors. */
  readonly blades: boolean;
  /** A cornice finishing the top of the walls. */
  readonly cornice: boolean;
}

export const STYLES: Readonly<Record<Style, StyleTraits>> = {
  apartment: {
    label: 'Apartment block',
    windows: 'punched',
    mullions: false,
    balconies: true,
    bands: 'none',
    ground: 'frontPilotis',
    stripes: false,
    shopfront: false,
    tower: true,
    chamfer: false,
    sign: false,
    canopy: false,
    screen: false,
    awning: false,
    panes: false,
    trim: false,
    fascia: false,
    blades: false,
    cornice: false,
  },
  office: {
    label: 'Office slab',
    windows: 'ribbon',
    mullions: true,
    balconies: false,
    bands: 'floor',
    ground: 'wall',
    stripes: false,
    shopfront: false,
    tower: true,
    chamfer: false,
    sign: false,
    canopy: false,
    screen: false,
    awning: false,
    panes: false,
    trim: false,
    fascia: false,
    blades: false,
    cornice: false,
  },
  // The old city corner block: shops along the street with a sign board over
  // them, tall paned windows in raised surrounds above, blade signs standing
  // out from the corners, a cornice along the top -- and on the roof, the
  // billboard up on its steel tower (the screen's default place is the roof).
  commercial: {
    label: 'Commercial',
    windows: 'punched',
    mullions: false,
    balconies: false,
    bands: 'none',
    ground: 'shop',
    stripes: false,
    shopfront: false,
    tower: false,
    chamfer: false,
    sign: true,
    canopy: false,
    screen: false,
    awning: false,
    panes: true,
    trim: true,
    fascia: true,
    blades: true,
    cornice: true,
  },
  // The post-war commercial block: ribbon windows wrapping a chamfered corner
  // over a ground floor on columns.
  ribbon: {
    label: 'Ribbon block',
    windows: 'ribbon',
    mullions: false,
    balconies: false,
    bands: 'spandrel',
    ground: 'pilotis',
    stripes: false,
    shopfront: true,
    tower: false,
    chamfer: true,
    sign: true,
    canopy: false,
    screen: false,
    awning: false,
    panes: false,
    trim: false,
    fascia: false,
    blades: false,
    cornice: false,
  },
  // The contemporary city mid-rise of model-railway catalogues: a white box,
  // punched windows each divided into panes, a ground floor of glazed shop
  // bays under a thin canopy slab, and -- set by its presets -- a guard rail
  // round a flat roof with the stair head standing on it.
  modern: {
    label: 'Modern',
    windows: 'punched',
    mullions: false,
    balconies: false,
    bands: 'none',
    ground: 'shop',
    stripes: false,
    shopfront: false,
    tower: false,
    chamfer: false,
    sign: false,
    canopy: false,
    screen: false,
    awning: true,
    panes: true,
    trim: false,
    fascia: false,
    blades: false,
    cornice: false,
  },
  // Not one of the four, and not a placeholder either: a house, a shed or a
  // warehouse has no facade articulation at all, and every one of the four
  // above would put something on it that the building does not have.
  plain: {
    label: 'Plain',
    windows: 'punched',
    mullions: false,
    balconies: false,
    bands: 'none',
    ground: 'wall',
    stripes: false,
    shopfront: false,
    tower: false,
    chamfer: false,
    sign: false,
    canopy: false,
    screen: false,
    awning: false,
    panes: false,
    trim: false,
    fascia: false,
    blades: false,
    cornice: false,
  },
  curtain: {
    label: 'Curtain wall',
    windows: 'punched',
    mullions: false,
    balconies: false,
    bands: 'none',
    ground: 'course',
    stripes: true,
    shopfront: false,
    tower: true,
    chamfer: false,
    sign: false,
    canopy: true,
    screen: true,
    awning: false,
    panes: false,
    trim: false,
    fascia: false,
    blades: false,
    cornice: false,
  },
};

export function traitsOf(style: string): StyleTraits {
  return STYLES[style as Style] ?? STYLES.office;
}
