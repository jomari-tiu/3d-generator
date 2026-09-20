import { dropSlivers } from '../../core/kernel/primitives';
import { serialize } from '../../core/kernel/serialize';
import type { BuildCtx, BuildResult, Generator, Issue, Params, Part } from '../../core/params/types';
import { missingCharacters } from '../../core/text/textSolid';
import {
  belowWaveSolid,
  derive,
  WRAP_FIDELITY,
  wrapToWall,
  type Derived,
} from './geometry';
import { buildLogo, buildName, logoHeight, plateRecess, whiskerCutter } from './parts/decals';
import { buildFoot, buildShell, footRecess } from './parts/shell';
import { petBowlGroups, petBowlParams } from './schema';

/**
 * Smallest fragment worth exporting. A letter stroke at the sizes here is tens
 * of cubic millimetres, so this only ever catches trimming debris.
 */
const SLIVER = 0.02;

/** Whiskers for a cat, bones for a dog, unless the user says otherwise. */
function resolveMotif(p: Params): string {
  const choice = String(p.sideMotif);
  if (choice !== 'auto') return choice;
  return String(p.species) === 'cat' ? 'whisker' : 'bone';
}

function validate(p: Params): Issue[] {
  const issues: Issue[] = [];
  const d = derive({ ...p, sideMotif: resolveMotif(p) });

  // --- the bowl has to be a bowl
  if (d.dishDepth > d.height - d.floorT - d.baseRimH - 2) {
    issues.push({
      level: 'error',
      message: `A ${d.dishDepth} mm bowl in a ${d.height} mm body leaves no floor under it. Reduce the depth to at most ${Math.floor(d.height - d.floorT - d.baseRimH - 2)} mm, or make the bowl taller.`,
      paramIds: ['dishDepth', 'height'],
    });
    return issues;
  }
  if (d.rInnerBot < d.wall * 2) {
    issues.push({
      level: 'error',
      message: 'The inside tapers to nothing before it reaches the floor. Reduce the base taper or the depth.',
      paramIds: ['dishAngle', 'dishDepth'],
    });
    return issues;
  }
  if (d.rTopIn <= d.rBase * 0.25) {
    issues.push({
      level: 'error',
      message: 'The rim is wider than the bowl. Reduce the rim width.',
      paramIds: ['rimWidth', 'topDiameter'],
    });
    return issues;
  }

  // --- printability
  if (d.wall < 3 * d.nozzle) {
    issues.push({
      level: 'warn',
      message: `A ${d.wall} mm wall is under three extrusions wide. A food bowl gets dropped and chewed - 1 mm more is cheap insurance.`,
      paramIds: ['wall', 'nozzle'],
    });
  }
  // Printed base-down, the OUTER wall is an underhang the whole way -- every
  // layer sits inside the one below it -- so the flare costs nothing to print,
  // however steep. The overhang that does matter is the INSIDE, which opens
  // outward as it rises.
  const dishDeg = Number(p.dishAngle);
  if (dishDeg >= 45) {
    issues.push({
      level: 'error',
      message: `An inside wall at ${dishDeg} degrees overhangs past 45 and will droop without supports. Bring it under 40.`,
      paramIds: ['dishAngle'],
    });
  } else if (dishDeg > 35) {
    issues.push({
      level: 'warn',
      message: `The inside wall overhangs at ${dishDeg} degrees. It will print, but slow it down and expect some texture inside the bowl.`,
      paramIds: ['dishAngle'],
    });
  }
  // The flare is what stops a pet shoving the bowl across the kitchen.
  const flareDeg = (Math.atan(-d.slope) * 180) / Math.PI;
  if (flareDeg < 4) {
    issues.push({
      level: 'warn',
      message: `Only ${flareDeg.toFixed(0)} degrees of flare makes this a straight-sided tub, and a pet will push it around. Raise the base flare.`,
      paramIds: ['baseFlare'],
    });
  }

  // --- the colour split
  if (d.waveClamped) {
    issues.push({
      level: 'warn',
      message: `The split has been held down to ${((d.waveZ / d.height) * 100).toFixed(0)}% so it stays below the inside floor - any higher and the cut surfaces inside the dish, giving you a two-tone bowl to feed out of. Make the bowl shallower to raise it.`,
      paramIds: ['waveHeight', 'dishDepth'],
    });
  }
  if (d.waveZ - d.waveAmp < d.baseRimH + 1) {
    issues.push({
      level: 'error',
      message: 'The wave dips into the foot. Raise the split height or reduce the wave depth.',
      paramIds: ['waveHeight', 'waveAmplitude'],
    });
  }

  // --- the plaque
  if (d.plateZ + d.plateH / 2 > d.zRimStart - 1) {
    issues.push({
      level: 'error',
      message: 'The name plaque runs off the top of the bowl. Reduce the name size or the plaque padding.',
      paramIds: ['nameSize', 'platePadY'],
    });
  }
  if (d.plateZ - d.plateH / 2 < d.waveZ + d.waveAmp) {
    issues.push({
      level: 'warn',
      message: 'The plaque overlaps the colour split, so the name will sit across two colours. Lower the split or shrink the plaque.',
      paramIds: ['waveHeight', 'nameSize'],
    });
  }
  if (d.plateDepth >= d.wall - 2 * d.layer) {
    issues.push({
      level: 'error',
      message: `A ${d.plateDepth} mm plaque in a ${d.wall} mm wall leaves almost nothing behind it. Use a shallower plaque or a thicker wall.`,
      paramIds: ['plateDepth', 'wall'],
    });
  }
  // A plaque is an arc, so its width is limited by the circumference it sits on.
  const frontArc = 2 * Math.PI * d.rBase * 0.42;
  if (d.plateW > frontArc) {
    issues.push({
      level: 'error',
      message: `A ${d.plateW} mm plaque wraps too far round a bowl this size. Keep it under ${frontArc.toFixed(0)} mm, or use a bigger bowl.`,
      paramIds: ['plateWidth', 'topDiameter'],
    });
  }

  // --- species features
  if (d.legs > 0) {
    const legArc = (2 * Math.PI * d.rBase) / d.legs - d.archW;
    if (legArc < 8) {
      issues.push({
        level: 'error',
        message: `${d.legs} legs at this arch width leaves only ${legArc.toFixed(0)} mm of leg between them. Narrow the arches or use fewer legs.`,
        paramIds: ['archShare', 'legs'],
      });
    }
    if (d.archH > d.waveZ - d.waveAmp) {
      issues.push({
        level: 'warn',
        message: 'The arches reach above the colour split, so the legs will be two-tone.',
        paramIds: ['legHeight', 'waveHeight'],
      });
    }
  }
  if (d.handles && d.handleZ + d.handleH / 2 > d.zRimStart - d.wall) {
    issues.push({
      level: 'warn',
      message: 'The carry slots are very close to the rim, which is where the bowl will crack when it is lifted full.',
      paramIds: ['handleHeight', 'height'],
    });
  }
  if (d.ears && d.earW > 2 * Math.PI * d.rTop * 0.3) {
    issues.push({
      level: 'error',
      message: 'The ears are too wide to fit side by side. Narrow them or spread them further apart.',
      paramIds: ['earWidth', 'earSpread'],
    });
  }

  // --- capacity sanity, which is the number that actually matters to a pet
  if (d.capacityMl < 60) {
    issues.push({
      level: 'warn',
      message: `This holds ${d.capacityMl.toFixed(0)} ml, which is a small bowl even for a kitten. Deepen it or widen the rim.`,
      paramIds: ['dishDepth', 'topDiameter'],
    });
  }

  return issues;
}

function readouts(d: Derived): Record<string, string> {
  const out: Record<string, string> = {
    Capacity: `${d.capacityMl.toFixed(0)} ml`,
    Overall: `${(2 * d.rTop).toFixed(0)} x ${d.height.toFixed(0)} mm${d.ears ? ` (+${d.earH.toFixed(0)} ears)` : ''}`,
    Inside: `${(2 * d.rTopIn).toFixed(0)} mm across, ${d.dishDepth.toFixed(0)} mm deep`,
    'Colour split': `${((d.waveZ / d.height) * 100).toFixed(0)}% up, ${d.waveLobes} wave${d.waveLobes === 1 ? '' : 's'}`,
    Flare: `${((Math.atan(-d.slope) * 180) / Math.PI).toFixed(0)} deg out, ${(2 * d.rBase).toFixed(0)} mm across the base`,
  };
  if (d.legs > 0) {
    out['Legs'] = `${d.legs}, ${((2 * Math.PI * d.rBase) / d.legs - d.archW).toFixed(0)} mm wide each`;
  }
  return out;
}

function build(p: Params, ctx: BuildCtx): BuildResult {
  const { m } = ctx;
  const d = derive({ ...p, sideMotif: resolveMotif(p) });

  // Only issues raised HERE go in the result; BuildRunner prepends validate().
  const issues: Issue[] = [];
  const blocking = validate(p);
  if (blocking.some((i) => i.level === 'error')) {
    return { parts: [], issues: blocking, readouts: readouts(d) };
  }

  const nameFont = String(p.nameFont);
  if (d.nameText.length > 0) {
    const missing = missingCharacters(ctx.font(nameFont), d.nameText + d.logoText + d.logoSub);
    if (missing.length > 0) {
      issues.push({
        level: 'warn',
        message: `This font has no glyph for ${missing.map((c) => `"${c}"`).join(', ')} - those would print as boxes.`,
        paramIds: ['nameFont', 'name'],
      });
    }
  }

  // ---------------------------------------------------------------- the body
  const shellWithEars = buildShell(ctx, d);
  let shell = shellWithEars.subtract(plateRecess(ctx, d));

  const whiskers = whiskerCutter(ctx, d);
  if (whiskers) shell = shell.subtract(whiskers);

  // Inner ears: a shallow pocket in the face of each ear, and a matching solid
  // to fill it in the second colour.
  const earInners: ReturnType<typeof buildShell>[] = [];
  if (d.ears) {
    // The pocket stays ABOVE the rim, entirely within the ear's free height.
    // Reaching below it would cut the bowl's own inner wall and put a pink
    // patch inside the dish.
    const innerW = d.earW * 0.5;
    const innerH = d.earFree * 0.6;
    const baseZ = d.height + Math.max(1.5, d.rimIn);
    const pocket = m.CrossSection.ofPolygons(
      [
        [
          [-innerW / 2, 0],
          [innerW / 2, 0],
          [0, innerH],
        ],
      ],
      'NonZero',
    )
      .offset(innerW * 0.16, 'Round', 2, 20)
      .translate([0, baseZ]);

    for (const sign of [-1, 1]) {
      const at = 180 + sign * d.earSpreadDeg;
      // Cut from the INNER face of the ear: that is the face you see from the
      // front of the bowl, and the only one worth a second colour.
      const band = { from: -d.earT, to: -d.earT + d.earInnerDepth, atDeg: at, fidelity: WRAP_FIDELITY };
      shell = shell.subtract(wrapToWall(m, d, pocket, band));

      // The filler comes from a slightly SMALLER outline, so it sits in the
      // pocket without sharing a single face with it.
      //
      // Deliberately NOT intersected with the shell to clip it: the pocket is
      // a fixed fraction of the ear and so always inside it, and intersecting
      // two dense warped meshes retriangulates the result into thousands of
      // slivers -- seven thousand triangles on a 24 mm plate, with normals
      // noisy enough that the preview shades it as a hatched mess.
      const inset = pocket.offset(-d.earInset, 'Round', 2, 16);
      if (inset.area() > 0.5) earInners.push(wrapToWall(m, d, inset, band));
    }
  }

  if (d.foot) shell = shell.subtract(footRecess(ctx, d));

  // ------------------------------------------------- split the shell by colour
  //
  // The whole point of the wave: each colour comes out as its own solid, so it
  // can be a separate body on a multi-material machine or a separate print to
  // be glued. The bowl's inside is entirely in the upper half by construction.
  // Sliver-filtered, and not only as a precaution: cutting the leg arches
  // leaves the dog's skirt with a second "piece" of volume -0.000 -- a shell
  // with inverted orientation and no interior. It survives status(), volume()
  // and genus() and goes straight into the STL as a phantom the slicer either
  // ignores or turns into a stray extrusion.
  // Sized off whichever end of the bowl is WIDER. Taking it from the rim was
  // right only while the rim was the widest part; once the base flares out past
  // it, a rim-sized cutter misses the skirt entirely and the lower colour comes
  // back as three crescents near the crests.
  const below = belowWaveSolid(m, d, Math.max(d.rTop, d.rBase) + 4, -10);
  const lower = dropSlivers(m, shell.intersect(below), SLIVER);
  const upper = dropSlivers(m, shell.subtract(below), SLIVER);

  const parts: Part[] = [
    {
      id: 'upper',
      name: 'Upper shell',
      mesh: serialize(upper),
      color: String(p.upperColor),
      group: 'bowl',
      orientationNote:
        'Print rim-up as laid out, base on the bed. The outer wall leans inward the whole way, so every layer sits on the one below and none of it needs support.',
    },
  ];

  if (lower.volume() > 1) {
    parts.push({
      id: 'lower',
      name: 'Lower shell',
      mesh: serialize(lower),
      color: String(p.lowerColor),
      group: 'bowl',
      orientationNote:
        'The second colour. On one extruder, print this separately and glue it to the upper shell - the seam is on the outside only, so the bowl still holds water.',
    });
  } else {
    issues.push({
      level: 'warn',
      message: 'The colour split is so low that the lower shell is empty. Raise the split height.',
      paramIds: ['waveHeight'],
    });
  }

  // ------------------------------------------------------------ the lettering
  const named = buildName(ctx, d, nameFont);
  if (named?.motifDroppedAt) {
    issues.push({
      level: 'warn',
      message: `There is no room for the bones beside a name this size, so they have been left off. The plaque would need to be ${Math.ceil(named.motifDroppedAt)} mm wide, or the name smaller.`,
      paramIds: ['plateWidth', 'nameSize', 'sideMotif'],
    });
  }
  if (named) {
    const trimmed = dropSlivers(m, named.solid.subtract(upper).subtract(lower), SLIVER);
    if (trimmed.volume() > 0.5) {
      parts.push({
        id: 'name',
        name: 'Name',
        mesh: serialize(trimmed),
        color: String(p.nameColor),
        group: 'bowl',
        orientationNote: 'Sits in the plaque recess. A filament change at that layer gives it its own colour.',
      });
    }
  } else if (d.nameText.length > 0) {
    issues.push({
      level: 'warn',
      message: 'The name produced no printable outline and was left off.',
      paramIds: ['name', 'nameFont'],
    });
  }

  for (const [i, inner] of earInners.entries()) {
    if (inner.volume() > 0.5) {
      parts.push({
        id: `ear-${i}`,
        name: `Inner ear ${i + 1}`,
        mesh: serialize(inner),
        color: String(p.earColor),
        group: 'bowl',
        orientationNote: 'Fills the pocket in the front of the ear.',
      });
    }
  }

  if (d.logo) {
    const markH = logoHeight(ctx, d, nameFont);
    if (markH > d.logoBand) {
      issues.push({
        level: 'warn',
        message: `The maker's mark is ${markH.toFixed(0)} mm tall but the band below the colour split is only ${d.logoBand.toFixed(0)} mm. Reduce the mark size to about ${Math.floor((d.logoBand / markH) * d.logoSize)} mm, or raise the split.`,
        paramIds: ['logoSize', 'waveHeight'],
      });
    }
    const logo = buildLogo(ctx, d, nameFont);
    // Trimmed against BOTH halves: the mark sits on the lower colour, but the
    // wave dips, and a mark that crossed the split would otherwise be left
    // floating where the shell is not.
    const trimmed = logo ? dropSlivers(m, logo.subtract(lower).subtract(upper), SLIVER) : null;
    if (trimmed && trimmed.volume() > 0.5) {
      parts.push({
        id: 'logo',
        name: 'Maker’s mark',
        mesh: serialize(trimmed),
        color: String(p.logoColor),
        group: 'bowl',
        orientationNote: 'Raised on the lower shell.',
      });
    }
  }

  if (d.foot) {
    parts.push({
      id: 'foot',
      name: 'Foot ring',
      mesh: serialize(buildFoot(ctx, d)),
      color: String(p.footColor),
      // Grouped with the bowl because that is where it physically sits -- under
      // it. Packed apart instead, the ring and the bowl need 270 mm of bed
      // between them and a 256 mm printer is told the design does not fit,
      // when in truth this is a separate job in a different material anyway.
      group: 'bowl',
      orientationNote:
        'A separate print, in TPU: flat, no supports. Glue or press it into the recess in the base once the bowl is done.',
    });
    issues.push({
      level: 'warn',
      message: 'The foot ring wants TPU or another flexible filament. In a rigid material it is decoration, not grip.',
      paramIds: ['foot'],
    });
  }

  return { parts, issues, readouts: readouts(d) };
}

export const petBowlGenerator: Generator = {
  id: 'petbowl',
  name: 'Pet bowl',
  description:
    'A cat or dog food bowl with a wavy two-colour body, a name plaque and a non-slip foot.',
  tagline: 'A named food bowl that splits into its own colours',
  highlights: [
    'Cat bowl with ears, or a raised dog bowl on legs',
    'Wavy colour split - each colour exports as its own part',
    'Name plaque with whiskers or bones either side',
    'Maker’s mark you can retitle or switch off',
  ],
  art: `<svg viewBox="0 0 120 96" role="img" aria-hidden="true">
    <defs>
      <linearGradient id="pb-l" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4f7f62"/><stop offset="1" stop-color="#3f6b52"/>
      </linearGradient>
      <clipPath id="pb-c"><path d="M22 34h76l-9 40H31z"/></clipPath>
    </defs>
    <path d="M30 24q6-13 13 0z" fill="#f0c3bd" stroke="#efe7d8" stroke-width="3"/>
    <path d="M77 24q7-13 13 0z" fill="#f0c3bd" stroke="#efe7d8" stroke-width="3"/>
    <path d="M22 34h76l-9 40H31z" fill="#efe7d8"/>
    <g clip-path="url(#pb-c)">
      <path d="M18 56q13-9 26 0t26 0 26 0v26H18z" fill="url(#pb-l)"/>
    </g>
    <ellipse cx="60" cy="34" rx="38" ry="7" fill="#e2d8c4"/>
    <ellipse cx="60" cy="34" rx="31" ry="5" fill="#fbf7ef"/>
    <rect x="38" y="41" width="44" height="12" rx="4" fill="#e2d8c4"/>
    <text x="60" y="50" text-anchor="middle" font-size="9" font-weight="700"
      font-family="ui-sans-serif, system-ui, sans-serif" fill="#44494f">SUSHI</text>
    <g fill="#efe7d8">
      <circle cx="60" cy="62" r="2.6"/>
      <circle cx="56" cy="58" r="1.5"/><circle cx="59" cy="56.6" r="1.5"/>
      <circle cx="62" cy="56.6" r="1.5"/><circle cx="65" cy="58" r="1.5"/>
    </g>
  </svg>`,
  params: petBowlParams,
  groups: petBowlGroups,
  fontsNeeded: (p) => [String(p.nameFont)],
  validate,
  build,
  presets: [
    {
      label: 'Cat bowl - Sushi',
      values: { species: 'cat', name: 'SUSHI', lowerColor: '#3f6b52' },
    },
    {
      label: 'Dog bowl - Milo',
      values: {
        species: 'dog', name: 'MILO', topDiameter: 170, height: 95, dishDepth: 52,
        baseFlare: 20, dishAngle: 12, nameSize: 12, plateWidth: 96, legHeight: 26,
        lowerColor: '#2f5686',
      },
    },
    {
      label: 'Kitten bowl, no branding',
      values: {
        species: 'cat', name: 'BEAN', topDiameter: 110, height: 44, dishDepth: 20,
        nameSize: 10, plateWidth: 56, logo: false, lowerColor: '#c98b6b',
      },
    },
    {
      label: 'Plain, straight band',
      values: {
        name: '', logo: false, waveAmplitude: 0, ears: false, sideMotif: 'none',
      },
    },
  ],
};
