import { serialize } from '../../core/kernel/serialize';
import type { BuildCtx, BuildResult, Generator, Issue, Params, Part } from '../../core/params/types';
import {
  clearance,
  derive,
  DENSITY_G_PER_CM3,
  innerAt,
  ringClearance,
  type Derived,
} from './geometry';
import { baseSolid } from './parts/base';
import { shadeSolid } from './parts/shade';
import { lampGroups, lampParams } from './schema';

const TAU = Math.PI * 2;

/** Triangles the loft will produce, before building it. */
function triangleEstimate(d: Derived): number {
  return 4 * d.zSteps * d.thetaSteps + 4 * d.thetaSteps + (d.mount === 'ring' ? 8 * d.thetaSteps : 0);
}

function validate(p: Params): Issue[] {
  const issues: Issue[] = [];
  const d = derive(p);
  const ringR = d.socket.ring / 2;

  // --- can the holder be fitted at all
  if (d.baseH < d.footH + d.deckT + 6) {
    issues.push({
      level: 'error',
      message: `A ${d.baseH} mm base has no room for a ${d.deckT} mm deck above a ${d.footH} mm foot. Make it taller.`,
      paramIds: ['baseHeight', 'deckThickness'],
    });
    return issues;
  }
  // Checked BEFORE the wall-thickness test below, which bails out early: a
  // neck too narrow for the ring is also too narrow for the wall round the
  // thread, and being told about the wall when the ring is the reason sends you
  // to the wrong control.
  if (d.mount === 'ring' && d.rNeck < ringR + 2) {
    issues.push({
      level: 'error',
      message: `The shade ring is ${d.socket.ring} mm across and the neck is ${(2 * d.rNeck).toFixed(0)} mm. The ring has to land on the deck with something under it - make the neck at least ${(2 * (ringR + 2)).toFixed(0)} mm.`,
      paramIds: ['baseTopDia', 'socketFamily'],
    });
  }
  if (d.rDeckIn <= d.rHole + 1) {
    const need = 2 * (d.rHole + 1 + d.baseWall + (d.mount === 'base' ? d.fit + d.rippleDepth : 0));
    issues.push({
      level: 'error',
      message:
        d.mount === 'base'
          ? `The shade’s hem is too narrow for the holder to pass through the neck under it. The hem needs to be about ${need.toFixed(0)} mm across, or use a smaller holder.`
          : `A ${(2 * d.rNeck).toFixed(0)} mm neck has no wall left round a ${d.socket.thread} mm thread. Widen the neck.`,
      paramIds: d.mount === 'base' ? ['shadeBottomDia', 'socketFamily'] : ['baseTopDia', 'socketFamily'],
    });
    return issues;
  }
  const ringGap = ringClearance(d);
  if (ringGap < 0.5) {
    issues.push({
      level: 'error',
      message: `The shade will not go down over the shade ring - it is ${(-ringGap + 0.5).toFixed(1)} mm too narrow inside somewhere on the way past a ${d.socket.ring} mm ring. Widen the hem by about ${(2 * (1 - ringGap)).toFixed(0)} mm, or take some depth out of the flutes.`,
      paramIds: ['shadeBottomDia', 'lobeDepth', 'fluteDepth'],
    });
  }

  // --- is it still a shade
  if (d.rTopIn <= 1.5) {
    issues.push({
      level: 'error',
      message: 'The flutes have closed the top opening. Reduce the flute or lobe depth, or widen the top.',
      paramIds: ['shadeTopDia', 'fluteDepth', 'lobeDepth'],
    });
    return issues;
  }
  if (d.mount === 'ring') {
    const seatIn = innerAt(d, d.seatH);
    if (d.rHole >= seatIn - 0.5) {
      issues.push({
        level: 'error',
        message: `At ${d.seatH} mm up, the shade is only ${(2 * seatIn).toFixed(0)} mm inside - there is no ring of material left to make a fitter from round a ${(2 * d.rHole).toFixed(0)} mm hole. Raise the fitter height, or widen the shade.`,
        paramIds: ['seatHeight', 'shadeBottomDia'],
      });
    }
    if (d.shadeZ < 0) {
      issues.push({
        level: 'error',
        message: `Hung from the ring, the hem lands ${(-d.shadeZ).toFixed(0)} mm below the table. Raise the base, or raise the fitter height so the shade sits higher on it.`,
        paramIds: ['baseHeight', 'seatHeight'],
      });
    }
  }

  // --- will it print
  //
  // One test for the flare and the twist together, because they are the same
  // thing: how far the wall has moved sideways by the time the next layer goes
  // down. Under a wall thickness, that layer still lands on the one below it.
  // The 45-degree overhang rule does not apply to a wall this thin and would
  // refuse shades that print perfectly.
  const blame: string[] = ['shadeWall', 'layer'];
  if (d.flareDeg > 25) blame.push('bulge', 'bulgeAt');
  if (Math.abs(d.twistRad) > 0.1) blame.push('twist');
  if (d.lateralStep > d.shadeWall) {
    issues.push({
      level: 'error',
      message: `The wall moves ${d.lateralStep.toFixed(2)} mm sideways per ${d.layer} mm layer, which is more than the ${d.shadeWall} mm wall is thick - so no layer lands on the one below it and the whole thing peels off into thin air. It leans out ${d.flareDeg.toFixed(0)} degrees at its steepest. Reduce the bulge or the twist, thicken the wall, or use a finer layer.`,
      paramIds: blame,
    });
  } else if (d.lateralStep > 0.6 * d.shadeWall) {
    issues.push({
      level: 'warn',
      message: `The wall moves ${d.lateralStep.toFixed(2)} mm sideways per layer against a ${d.shadeWall} mm wall, so each layer is only just landing on the one below. It will print, but slow it down and expect some texture where it leans hardest.`,
      paramIds: blame,
    });
  }
  const perims = d.shadeWall / d.nozzle;
  if (perims < 2) {
    issues.push({
      level: 'warn',
      message: `A ${d.shadeWall} mm wall is ${perims.toFixed(1)} extrusions at a ${d.nozzle} mm nozzle. Under two it will have gaps in it, and a lamp shade shows every one of them.`,
      paramIds: ['shadeWall', 'nozzle'],
    });
  }
  const bridge = d.rDeckIn - d.chamfer - d.rHole;
  if (bridge > 18) {
    issues.push({
      level: 'warn',
      message: `The deck has to bridge ${bridge.toFixed(0)} mm of thin air to reach the socket hole. Raise the deck chamfer, or bring the neck in.`,
      paramIds: ['bridgeChamfer', d.mount === 'ring' ? 'baseTopDia' : 'shadeBottomDia'],
    });
  }
  const bed = Math.min(Number(p.bedX), Number(p.bedY));
  if (2 * d.rShadeMax > bed - 10) {
    issues.push({
      level: 'warn',
      message: `The shade is ${(2 * d.rShadeMax).toFixed(0)} mm across and the bed is ${bed} mm. It will need cutting up, or a bigger printer.`,
      paramIds: ['shadeBottomDia', 'bulge', 'bedX'],
    });
  }
  const tris = triangleEstimate(d);
  if (tris > 600_000) {
    issues.push({
      level: 'warn',
      message: `This many flutes at this detail is about ${Math.round(tris / 1000)}k triangles. Drop the mesh detail while you are dialling the shape in.`,
      paramIds: ['meshDetail', 'flutes'],
    });
  }

  // --- the bulb, which is the whole reason any of this has to line up
  const c = clearance(d);
  if (d.bulb) {
    if (c.gap < 0) {
      issues.push({
        level: 'error',
        message: `The shade closes on the bulb ${c.atZ.toFixed(0)} mm above the deck - it is ${(-c.gap).toFixed(1)} mm inside where the glass is. Use a smaller bulb, widen the shade, or raise it.`,
        paramIds: ['bulbType', 'shadeTopDia', 'shadeBottomDia'],
      });
    } else if (c.gap < 6) {
      issues.push({
        level: 'warn',
        message: `Only ${c.gap.toFixed(1)} mm between the bulb and the shade, ${c.atZ.toFixed(0)} mm above the deck. That is fine for a few watts of LED and not fine for anything warmer, and it leaves nothing for a bulb that sits a little differently to yours.`,
        paramIds: ['bulbType', 'shadeTopDia'],
      });
    }
    if (c.bulbAbove > 2) {
      issues.push({
        level: 'warn',
        message: `The bulb stands ${c.bulbAbove.toFixed(0)} mm proud of the shade’s top opening. That is how the reference lamps look, but check it is what you want - a taller shade or a shorter bulb will swallow it.`,
        paramIds: ['shadeHeight', 'bulbType'],
      });
    }
  }

  // --- it has to stand up
  if (d.rShadeMax > d.rBase * 1.15) {
    issues.push({
      level: 'warn',
      message: `The shade is ${(2 * d.rShadeMax).toFixed(0)} mm across over a ${(2 * d.rBase).toFixed(0)} mm base, and both parts are hollow. It will go over if it is nudged - widen the base, or plan on weighting it.`,
      paramIds: ['baseDia', 'shadeBottomDia'],
    });
  }

  return issues;
}

function readouts(d: Derived, grams: number | null): Record<string, string> {
  const c = clearance(d);
  const out: Record<string, string> = {
    Overall: `${(2 * Math.max(d.rBase, d.rShadeMax)).toFixed(0)} x ${d.totalH.toFixed(0)} mm`,
    Shade: `${(2 * d.rShadeMax).toFixed(0)} mm across, ${d.shadeH.toFixed(0)} mm tall`,
    Wall: `${d.shadeWall.toFixed(1)} mm - ${(d.shadeWall / d.nozzle).toFixed(1)} extrusions at a ${d.nozzle} mm nozzle`,
    Mount:
      d.mount === 'base'
        ? `Hem on the collar, ${(2 * d.rSpigot).toFixed(0)} mm spigot inside it`
        : `Fitter ${d.seatH.toFixed(0)} mm up, on the shade ring; hem lands at ${d.shadeZ.toFixed(0)} mm`,
    'Top opening': `${(2 * d.rTopIn).toFixed(0)} mm`,
    'Over the ring': `${ringClearance(d).toFixed(1)} mm to spare going on`,
  };
  out['Bulb clearance'] = d.bulb
    ? `${c.gap.toFixed(1)} mm, ${c.atZ.toFixed(0)} mm above the deck` +
      (c.bulbAbove > 0 ? ` (tip ${c.bulbAbove.toFixed(0)} mm proud)` : '')
    : 'not checked';
  if (d.flutes > 0) {
    out['Flutes'] = `${d.flutes}, ${((TAU * d.rShadeMax) / d.flutes).toFixed(1)} mm apart at the widest`;
  }
  out['Wall step'] =
    `${d.lateralStep.toFixed(2)} mm sideways per ${d.layer} mm layer, leaning ${d.flareDeg.toFixed(0)} deg`;
  if (grams !== null) out['Filament'] = `about ${grams.toFixed(0)} g in PLA`;
  return out;
}

function build(p: Params, ctx: BuildCtx): BuildResult {
  const { m } = ctx;
  const d = derive(p);

  const issues: Issue[] = [];
  const blocking = validate(p);
  if (blocking.some((i) => i.level === 'error')) {
    return { parts: [], issues: blocking, readouts: readouts(d, null) };
  }

  const base = baseSolid(m, d);
  const shade = shadeSolid(m, d);

  const baseMesh = serialize(base);
  const shadeMesh = serialize(shade);
  const grams = ((baseMesh.stats.volumeMm3 + shadeMesh.stats.volumeMm3) / 1000) * DENSITY_G_PER_CM3;

  const perims = (d.shadeWall / d.nozzle).toFixed(1);
  const parts: Part[] = [
    {
      id: 'base',
      name: 'Base',
      mesh: baseMesh,
      color: String(p.baseColor),
      orientationNote:
        'Print as laid out, open end down, no supports. The cone leans inward the whole way so every layer sits inside the one below it, and the deck grows in off the wall at 45 degrees rather than bridging. The cord notch is at the back.',
    },
    {
      id: 'shade',
      name: 'Shade',
      mesh: shadeMesh,
      color: String(p.shadeColor),
      // Modelled at the origin, because the hem is the only sane frame to build
      // a fluted surface in. It belongs up on the base in the assembled view.
      assembly: [0, 0, d.shadeZ] as const,
      orientationNote: `Print hem down, as laid out. Set ${perims} perimeters and no infill - the wall IS the object, and its thickness is what decides how the lamp glows. No supports, no top or bottom layers to speak of.`,
    },
  ];

  if (d.bulb) {
    issues.push({
      level: 'warn',
      message:
        'Use an LED bulb. PLA starts to soften around 60 degrees and a filament or halogen bulb of the same brightness will reach that inside a shade this size - this is the one thing about this lamp that is not a matter of taste.',
      paramIds: ['bulbType'],
    });
  }

  return { parts, issues, readouts: readouts(d, grams) };
}

export const lampGenerator: Generator = {
  id: 'lamp',
  name: 'Table lamp',
  description:
    'A two-part table lamp built round a threaded E27 holder: a cone base the socket clamps to, and a fluted shade that either sits on it or hangs from the shade ring.',
  tagline: 'A cone base and a fluted shade, fitted to the holder you actually own',
  highlights: [
    'Swirled mushroom or pleated empire, from the same surface',
    'Base sized to an E27 or E14 holder with a shade ring',
    'Checks the bulb clears the shade at every height',
    'Wall thickness measured through the wall, where the light comes out',
  ],
  art: `<svg viewBox="0 0 120 96" role="img" aria-hidden="true">
    <defs>
      <linearGradient id="lm-s" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fdf8ec"/><stop offset="1" stop-color="#efe3c9"/>
      </linearGradient>
      <linearGradient id="lm-b" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#e9b4a8"/><stop offset="1" stop-color="#d3968a"/>
      </linearGradient>
    </defs>
    <ellipse cx="60" cy="86" rx="34" ry="5" fill="#000" opacity="0.07"/>
    <path d="M46 88q2-30 14-30t14 30z" fill="url(#lm-b)"/>
    <path d="M60 14q26 0 26 22 0 20-26 20T34 36q0-22 26-22z" fill="url(#lm-s)"/>
    <g stroke="#d9c9a6" stroke-width="1.4" fill="none" opacity="0.85">
      <path d="M44 20q-6 12-4 26"/><path d="M52 16q-5 14-3 30"/>
      <path d="M60 15v32"/><path d="M68 16q5 14 3 30"/>
      <path d="M76 20q6 12 4 26"/>
    </g>
    <ellipse cx="60" cy="15" rx="13" ry="4" fill="#fffdf6"/>
    <ellipse cx="60" cy="15" rx="8" ry="2.4" fill="#ffe9ae"/>
  </svg>`,
  params: lampParams,
  groups: lampGroups,
  validate,
  build,
  presets: [
    {
      // Proportioned off the reference photo: the shade is the lamp and the
      // base is a modest cone under it. Hem, belly and base read as 0.55, 1.00
      // and 0.72 of the widest point, and the joint is the narrowest thing
      // about the whole object -- which is what makes it a mushroom rather than
      // a vase on a plinth.
      label: 'Swirled mushroom',
      values: {
        shadeStyle: 'swirl', mount: 'auto',
        shadeHeight: 120, shadeBottomDia: 82, shadeTopDia: 66, bulge: 38, bulgeAt: 48,
        baseDia: 108, baseHeight: 70,
        flutes: 64, fluteDepth: 1.2, twist: 160, lobes: 3, lobeDepth: 3.6,
        bulbType: 'a60',
      },
    },
    {
      // 120 mm across and 150 mm tall, which is what the reference is labelled.
      // The base comes out a little chunkier than the photo's for a reason that
      // is not stylistic: an E27 shade ring is 55 mm, so the neck it lands on
      // cannot be under about 60 mm however slender the picture looks.
      label: 'Pleated empire',
      values: {
        shadeStyle: 'pleat', mount: 'auto',
        shadeHeight: 82, shadeBottomDia: 120, shadeTopDia: 58, bulge: 0,
        seatHeight: 12, baseDia: 76, baseHeight: 72, baseTopDia: 62,
        flutes: 44, fluteDepth: 3.6, crease: 85, twist: 0,
        bulbType: 'g45',
      },
    },
    {
      label: 'Smooth cone, no flutes',
      values: {
        shadeStyle: 'swirl', flutes: 0, lobes: 0, bulge: 0,
        shadeHeight: 100, shadeBottomDia: 96, shadeTopDia: 70, twist: 0,
        baseDia: 108, baseHeight: 70, bulbType: 'g45',
      },
    },
    {
      label: 'Tall swirl, deep lobes',
      values: {
        shadeStyle: 'swirl', shadeHeight: 150, shadeBottomDia: 90, shadeTopDia: 56,
        bulge: 46, bulgeAt: 38, baseDia: 120, baseHeight: 82,
        flutes: 96, fluteDepth: 0.9, twist: 300, lobes: 5, lobeDepth: 5,
        bulbType: 'a60',
      },
    },
  ],
};
