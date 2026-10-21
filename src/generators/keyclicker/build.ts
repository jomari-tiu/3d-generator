import { serialize } from '../../core/kernel/serialize';
import type { BuildCtx, BuildResult, Generator, Issue, Params, Part } from '../../core/params/types';
import { missingCharacters } from '../../core/text/textSolid';
import { derive, keyX, legendChars, SWITCHES, type Derived } from './geometry';
import { buildBase } from './parts/base';
import { buildDome, buildKeycap, legendOutline } from './parts/keycap';
import { keyClickerGroups, keyClickerParams } from './schema';

function validate(p: Params): Issue[] {
  const issues: Issue[] = [];
  const d = derive(p);

  if (d.legend.length === 0) {
    issues.push({
      level: 'error',
      message: 'Enter at least one character - each one becomes a key.',
      paramIds: ['text'],
    });
    return issues;
  }

  // --- pitch against the switch it has to hold
  if (d.pitch < d.sw.minPitch) {
    issues.push({
      level: 'error',
      message: `${d.sw.label} needs at least ${d.sw.minPitch} mm between keys - below that the plate between two cutouts is too thin to hold a switch. Widen the pitch or use a smaller switch.`,
      paramIds: ['keyPitch', 'switchType'],
    });
  } else if (d.sw.cutout > 0) {
    const web = d.pitch - d.sw.cutout - d.clear;
    if (web < 4 * d.nozzle) {
      issues.push({
        level: 'warn',
        message: `Only ${web.toFixed(1)} mm of plate between cutouts. It will hold, but the bar will flex when you press a key.`,
        paramIds: ['keyPitch'],
      });
    }
  }

  // --- caps must not foul each other
  if (d.keySize > d.pitch - 0.6) {
    issues.push({
      level: 'error',
      message: `Keycaps ${d.keySize} mm across on a ${d.pitch} mm pitch would touch. Leave at least 0.6 mm between them.`,
      paramIds: ['keySize', 'keyPitch'],
    });
  } else if (d.keySize > d.pitch - 1) {
    issues.push({
      level: 'warn',
      message: 'The gap between keycaps is under 1 mm - they will rub if anything prints slightly wide.',
      paramIds: ['keySize', 'keyPitch'],
    });
  }
  // The cavity under the plate is the pocket's own footprint, and a switch's
  // lower housing has to fit down into it.
  if (d.sw.cutout > 0 && d.pocket < d.sw.cutout + 1) {
    issues.push({
      level: 'error',
      message: `${d.keySize} mm keycaps leave a ${d.pocket.toFixed(1)} mm pocket, and the ${d.sw.label} body needs ${(d.sw.cutout + 1).toFixed(0)} mm under the plate. Use bigger keycaps or a wider gap.`,
      paramIds: ['keySize', 'keyGap'],
    });
  }

  // --- the rim against a key that is held down. The printed variant has no
  // rim: its own travel check further down covers the well it sinks into.
  if (d.sw.hollow && d.pressedProud < 0) {
    issues.push({
      level: 'error',
      message: `Held down, a key would sink ${(-d.pressedProud).toFixed(1)} mm below the rim, out of reach of your thumb. Sink the keys less or make the caps taller.`,
      paramIds: ['keyDepth', 'capHeight'],
    });
  } else if (d.sw.hollow && d.pressedProud < 1) {
    issues.push({
      level: 'warn',
      message: `Held down, a key stands only ${d.pressedProud.toFixed(1)} mm above the rim - a fingertip will find the rim before the key bottoms out. Sink the keys less or make the caps taller.`,
      paramIds: ['keyDepth', 'capHeight'],
    });
  }

  // --- cap shell
  if (d.capTopSize < 6) {
    issues.push({
      level: 'error',
      message: `A ${d.capTaperDeg} degree taper over ${d.capH} mm leaves a ${d.capTopSize.toFixed(1)} mm top face - there is nothing left to put a letter on. Reduce the taper or the height.`,
      paramIds: ['capTaper', 'capHeight'],
    });
  }
  // The top face thickness is derived from the dish and the legend recess, so a
  // short cap can run out of room for the stem without any one slider looking
  // wrong on its own.
  if (d.capH - d.capTop < d.sw.stemDepth + 0.5) {
    issues.push({
      level: 'error',
      message: `A ${d.capH} mm cap keeps ${d.capTop.toFixed(2)} mm of top face for the dish and the legend, leaving ${(d.capH - d.capTop).toFixed(2)} mm of hollow - the ${d.sw.label} stem needs ${d.sw.stemDepth} mm. Make the cap taller, shallow the legend, or turn the dish off.`,
      paramIds: ['capHeight', 'legendDepth', 'topCurve'],
    });
  }
  if (d.legendStyle !== 'none' && d.legendSize > d.capTopSize - 2) {
    issues.push({
      level: 'warn',
      message: `A ${d.legendSize} mm letter runs off a ${d.capTopSize.toFixed(1)} mm top face. Reduce the legend size.`,
      paramIds: ['legendSize', 'capTaper'],
    });
  }
  // Cut-in caps print upside down, standing on the top face, and the
  // round-over takes that face away from the outside in.
  const flat = d.capTopSize - 2 * d.capRound;
  if (d.capRound > 0.05 && d.legendStyle !== 'raised' && flat < 6) {
    issues.push({
      level: 'warn',
      message:
        flat < 0.5
          ? 'Rounded into a ball, the cap has no flat top left to stand on upside down, and it would print on a point. Use raised letters - they print the right way up - or round it less.'
          : `Rounded over, the cap stands upside down on only ${flat.toFixed(1)} mm of flat top. It will rock and need a brim. Raised letters print the right way up instead.`,
      paramIds: ['capRound', 'legendStyle'],
    });
  }
  if (d.legendStyle === 'inlay' && d.legendDepth < 3 * d.layer - 1e-6) {
    issues.push({
      level: 'warn',
      message: `The inlay is under three layers deep at ${d.layer} mm, so the second colour will not cover. Use at least ${(3 * d.layer).toFixed(2)} mm.`,
      paramIds: ['legendDepth', 'layer'],
    });
  }
  if (d.legendStyle === 'raised' && d.legendDepth < 3 * d.layer - 1e-6) {
    issues.push({
      level: 'warn',
      message: `Letters standing ${d.legendDepth} mm proud are under three layers tall at ${d.layer} mm. They will read as a texture rather than lettering, and in a second colour they will not cover. Use at least ${(3 * d.layer).toFixed(2)} mm.`,
      paramIds: ['legendDepth', 'layer'],
    });
  }

  // --- walls
  if (d.wallT < 2 * d.nozzle) {
    issues.push({
      level: 'error',
      message: 'Walls thinner than two nozzle widths cannot be printed.',
      paramIds: ['wall', 'nozzle'],
    });
  }

  // --- switch fits are the one place a loose clearance actually breaks it
  if (d.sw.cutout > 0 && d.clear > 0.2) {
    issues.push({
      level: 'warn',
      message: `A ${d.clear.toFixed(2)} mm clearance on the cutout is loose for a snap-in switch - it will sit in the plate rather than clip to it. Aim for 0.1 mm.`,
      paramIds: ['partClearance', 'fitOffset'],
    });
  }
  if (d.clear < 0.02) {
    issues.push({
      level: 'error',
      message: 'The fit offset has closed the clearance to nothing - the stems would not go on.',
      paramIds: ['fitOffset', 'partClearance'],
    });
  }
  if (d.sw.stem !== 'post' && d.stemClear < 0.05) {
    issues.push({
      level: 'warn',
      message: `A ${d.stemClear.toFixed(2)} mm stem socket clearance is tight for a printed hole - the switch stem will likely not push into the keycap. Try 0.2 mm.`,
      paramIds: ['stemClearance', 'fitOffset'],
    });
  }

  // --- the printed dome, which is the part that has to be honest about itself
  if (d.sw.stem === 'post') {
    const ratio = d.domeH / d.domeWall;
    if (ratio < 1.6) {
      issues.push({
        level: 'warn',
        message: `This dome is too flat for its thickness (height is ${ratio.toFixed(1)}x the wall). It will squash rather than snap - raise the dome height or use a finer layer.`,
        paramIds: ['domeHeight', 'layer'],
      });
    } else if (ratio > 3.5) {
      issues.push({
        level: 'warn',
        message: `This dome is very tall for its thickness (${ratio.toFixed(1)}x the wall). It will snap hard and take a set after a few hundred presses.`,
        paramIds: ['domeHeight', 'domeDiameter'],
      });
    }
    if (d.material === 'PLA') {
      issues.push({
        level: 'warn',
        message: 'PLA domes crack rather than spring. PETG holds up far better, and TPU best of all if your printer will take it.',
        paramIds: ['material', 'switchType'],
      });
    }
    if (2 * d.domeR > d.keySize - 1) {
      issues.push({
        level: 'error',
        message: 'The dome is wider than the keycap well it sits in.',
        paramIds: ['domeDiameter', 'keySize'],
      });
    }
    if (d.travel > d.capH * 0.45) {
      issues.push({
        level: 'warn',
        message: 'The travel is deep for this keycap height - the cap may drop below the bar surface when pressed.',
        paramIds: ['travel', 'capHeight'],
      });
    }
  }

  return issues;
}

function readouts(d: Derived): Record<string, string> {
  const out: Record<string, string> = {
    Keys: `${d.keys} on a ${Number(d.pitch.toFixed(2))} mm pitch`,
    Body: `${d.baseW.toFixed(1)} x ${d.baseD.toFixed(1)} x ${d.baseH.toFixed(1)} mm`,
    'With caps': `${(
      Math.max(d.baseH, d.plateTop + d.capRest + d.capH + d.capDome) +
      (d.legendStyle === 'raised' ? d.legendDepth : 0)
    ).toFixed(1)} mm tall`,
    'Keycap top': `${d.capTopSize.toFixed(1)} mm across`,
    Hardware: d.sw.hardware === 'none' ? 'none - fully printed' : `${d.keys} x ${d.sw.hardware.replace('one ', '').replace(' per key', '')}`,
  };
  if (d.sw.hollow) {
    out['Above the rim'] = `${(d.capRest + d.capH - d.rimH).toFixed(1)} mm, ${d.pressedProud.toFixed(1)} mm held down`;
  }
  if (d.sw.stem === 'post') {
    out['Dome'] = `${(2 * d.domeR).toFixed(1)} mm across, ${(d.domeH / d.domeWall).toFixed(1)}x wall`;
    out['Travel'] = `${d.travel.toFixed(1)} mm`;
  }
  return out;
}

function build(p: Params, ctx: BuildCtx): BuildResult {
  const d = derive(p);
  // Only issues raised HERE go in the result. BuildRunner already collects
  // validate()'s output and prepends it, so returning those again shows every
  // warning twice.
  const issues: Issue[] = [];
  const blocking = validate(p);
  if (blocking.some((i) => i.level === 'error')) {
    return { parts: [], issues: blocking, readouts: readouts(d) };
  }

  const fontId = String(p.legendFont);
  if (d.legendStyle !== 'none') {
    const missing = missingCharacters(ctx.font(fontId), d.legend.join(''));
    if (missing.length > 0) {
      issues.push({
        level: 'warn',
        message: `This font has no glyph for ${missing.map((c) => `"${c}"`).join(', ')} - those keys would print with a box on them.`,
        paramIds: ['legendFont', 'text'],
      });
    }
  }

  const parts: Part[] = [
    {
      id: 'base',
      name: 'Body',
      mesh: serialize(buildBase(ctx, d)),
      color: String(p.bodyColor),
      orientationNote: d.sw.hollow
        ? 'Print floor-down, as laid out. The bottom is closed, and the plate bridges the switch cavity once - a short span most printers manage without support.'
        : 'Print wells upward, as laid out. The wells and the dome seats are pockets, so nothing overhangs and nothing needs support.',
    },
  ];

  // One part per key: the caps differ by their letter, so they cannot be a
  // quantity. Each cap and its inlay share a group so the plate keeps them
  // together -- they are one printed object with a filament change in it.
  // Raised letters stand on the face that would otherwise go on the bed, so a
  // raised legend is the one case where the cap prints the right way up.
  const raised = d.legendStyle === 'raised';
  const capOrientation: [number, number, number] = raised ? [0, 0, 0] : [180, 0, 0];
  const capNote = raised
    ? 'Prints legend upward, as laid out - raised letters cannot be pressed into the bed. The skirt is hollow and the stem hangs inside it, so turn supports on. Switch the legend to the two-colour inlay if you would rather print it upside down with none.'
    : 'MUST print upside down, top face on the bed. The stem hangs off the underside, so the right way up it would start in mid-air.';

  d.legend.forEach((ch, i) => {
    const outline = d.legendStyle === 'none' ? null : legendOutline(ctx, d, fontId, ch);
    const { cap, insert } = buildKeycap(ctx, d, outline);

    // Where this cap belongs on the assembled bar. Every keycap is BUILT at the
    // origin -- it is the only frame in which a cross stem socket is worth
    // cutting -- so without this they all stack in the same place in the
    // assembled view. Sitting on the plate, less the depth the stem goes in by.
    const seat: [number, number, number] = [
      keyX(d, i),
      0,
      d.plateTop + d.capRest,
    ];

    parts.push({
      id: `cap-${i}`,
      name: `Keycap ${ch}`,
      mesh: serialize(cap),
      color: String(p.capColor),
      group: `key-${i}`,
      assembly: seat,
      orientation: capOrientation,
      orientationNote: capNote,
    });

    if (insert) {
      try {
        parts.push({
          id: `legend-${i}`,
          name: `Legend ${ch}`,
          mesh: serialize(insert),
          color: String(p.legendColor),
          group: `key-${i}`,
          // Rides with its cap, or the letter floats where the key used to be.
          assembly: seat,
          // Same orientation as its cap, always: these two are one printed
          // object, and flipping one without the other lands the letter on the
          // wrong face.
          orientation: capOrientation,
          orientationNote: raised
            ? 'Printed with its keycap: these are the top layers, so a filament change there gives the second colour.'
            : 'Printed with its keycap: upside down, this is the first few layers, so a filament change there gives the second colour.',
        });
      } catch {
        issues.push({
          level: 'warn',
          message: `The legend "${ch}" produced nothing solid and was left off its keycap.`,
          paramIds: ['legendFont', 'legendSize'],
        });
      }
    }
  });

  if (d.sw.stem === 'post') {
    parts.push({
      id: 'dome',
      name: 'Snap dome',
      mesh: serialize(buildDome(ctx, d)),
      color: String(p.coverColor),
      quantity: d.keys,
      // One dome stands in for all of them in the assembled view: it sits under
      // the first key, in its seat.
      assembly: [keyX(d, 0), 0, d.plateTop - d.wellDepth - d.domeH - 0.4],
      orientationNote:
        'Print apex up - a shallow cone supports itself. Slow it right down: this part is three layers thick and has to flex for the life of the toy.',
    });
    issues.push({
      level: 'warn',
      message: 'Printed domes are the experimental option here. They click, but a real switch clicks better and lasts longer - print one key first and decide before you commit.',
      paramIds: ['switchType'],
    });
  } else {
    issues.push({
      level: 'warn',
      message: `You will need ${d.keys} x ${d.sw.label} switches. Push each one down through its cutout from the top until both clips snap under the plate.`,
      paramIds: ['switchType'],
    });
  }

  return { parts, issues, readouts: readouts(d) };
}

export const keyClickerGenerator: Generator = {
  id: 'keyclicker',
  name: 'Key clicker',
  description:
    'A row of keyboard keys on a keychain. Spell anything, press them, and they click.',
  tagline: 'A fidget keychain that spells whatever you want',
  highlights: [
    'One key per letter, up to twelve',
    'Cherry MX, Kailh Choc, or a fully printed snap dome',
    'Two-colour legends from a single filament change',
    'Keys sunk in a tray, or each in its own rounded cell',
    'Keyring loop on the end or the side',
  ],
  art: `<svg viewBox="0 0 120 96" role="img" aria-hidden="true">
    <defs><linearGradient id="kc-b" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#c8a37a"/><stop offset="1" stop-color="#9c7748"/>
    </linearGradient></defs>
    <rect x="8" y="46" width="94" height="26" rx="7" fill="url(#kc-b)"/>
    <circle cx="108" cy="59" r="8" fill="none" stroke="#939cab" stroke-width="3"/>
    <g fill="#e7cfae">
      <rect x="13" y="30" width="20" height="20" rx="4"/>
      <rect x="36" y="30" width="20" height="20" rx="4"/>
      <rect x="59" y="30" width="20" height="20" rx="4"/>
      <rect x="82" y="30" width="16" height="20" rx="4"/>
    </g>
    <g fill="#5b3a22" font-size="12" font-weight="700"
       font-family="ui-sans-serif, system-ui, sans-serif" text-anchor="middle">
      <text x="23" y="45">K</text><text x="46" y="45">E</text>
      <text x="69" y="45">Y</text><text x="90" y="45">S</text>
    </g>
  </svg>`,
  params: keyClickerParams,
  groups: keyClickerGroups,
  fontsNeeded: (p) => (String(p.legendStyle) === 'none' ? [] : [String(p.legendFont)]),
  validate,
  build,
  presets: [
    {
      label: 'Name in a tray',
      values: {
        text: 'EMILY', baseStyle: 'tray', legendFont: 'roboto-slab-bold', legendStyle: 'inlay',
        legendSize: 9, capHeight: 8, keyDepth: 2.5, capCorner: 1.6,
        bodyColor: '#e9a2b2', capColor: '#f5f2ea', legendColor: '#e27b97',
      },
    },
    {
      label: 'Stacked cells',
      values: {
        text: 'JOY', baseStyle: 'cells', legendFont: 'nunito-extrabold', legendStyle: 'inlay',
        legendSize: 9, capCorner: 3.5, cellCorner: 5, keyDepth: 2,
        bodyColor: '#ec7a1f', capColor: '#f3e4a8', legendColor: '#ec7a1f',
      },
    },
    {
      label: 'MX four-letter keychain',
      values: { text: 'KONG', switchType: 'mx', keyPitch: 19.05, keySize: 17.4 },
    },
    {
      label: 'Choc low-profile, compact',
      values: {
        text: 'CLICK', switchType: 'choc', keyPitch: 18, keySize: 16.4,
        capHeight: 5.5, endWall: 2.5,
      },
    },
    {
      label: 'Fully printed, no hardware',
      values: {
        text: 'FIDGET', switchType: 'printed', keyPitch: 16, keySize: 14.4,
        capHeight: 6, legendSize: 5, material: 'PETG',
      },
    },
    {
      label: 'Single key, blank',
      values: { text: 'A', legendStyle: 'none', endWall: 5, loopPosition: 'side' },
    },
  ],
};

export { SWITCHES, legendChars };
