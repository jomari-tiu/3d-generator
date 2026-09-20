import { dropSlivers } from '../../core/kernel/primitives';
import { serialize } from '../../core/kernel/serialize';
import type { BuildCtx, BuildResult, Generator, Issue, Params, Part } from '../../core/params/types';
import { camSpanY, derive, STRAIN_MAX, type Derived } from './geometry';
import { buildDrawer } from './parts/box';
import { buildCase } from './parts/case';
import { buildDovetailKey, buildStackScrew, buildStopBar, buildStopScrew, buildTravelPin } from './parts/hardware';
import { buildGridPlate } from './parts/insert';
import { pushDrawerGroups, pushDrawerParams } from './schema';

/**
 * Modular push-lock drawer.
 *
 * A re-creation of a working under-desk drawer: a case on the desk, a drawer
 * hung in it on dovetail rails, and a push-push latch that lives in the case
 * floor -- an island cam under the drawer and a sprung arm whose pin walks round
 * it, with a rubber band for the throw. See cam.ts for the walk, and
 * geometry.ts for how every number that two prints must agree on is derived
 * once and read by both.
 *
 * Then two things the original does not have: a relief pattern on the face you
 * push, and a choice of how a stack of them connects.
 */

const SLIVER = 0.05;

function validate(p: Params): Issue[] {
  const d = derive(p);
  const issues: Issue[] = [];

  if (d.boxH < 12 || d.boxW < 60) {
    issues.push({
      level: 'error',
      message: `The drawer comes out ${d.boxW.toFixed(0)} wide by ${d.boxH.toFixed(0)} mm tall inside a ${d.W} x ${d.H} mm case. Make the case bigger, or the rails and arm shorter.`,
      paramIds: ['width', 'height', 'railHeight', 'armHeight'],
    });
    return issues;
  }
  if (d.crestClear < 0.3) {
    issues.push({
      level: 'error',
      message: `The rail crest is ${(-d.crestClear).toFixed(1)} mm into the slot ceiling: the drawer would sit on the crests instead of hanging on the flanks, and the latch would lose its depth. Lower the rails.`,
      paramIds: ['railHeight', 'armHeight'],
    });
    return issues;
  }
  if (d.latch) {
    if (Math.max(d.camPadW / 2, d.moatX + d.moatOuterR) + 3 > d.slotInner) {
      issues.push({
        level: 'error',
        message: 'The cam pad and the band moats run into the rail slots. Widen the case.',
        paramIds: ['width', 'bossDiameter', 'camWidth'],
      });
      return issues;
    }
    const [camFront] = camSpanY(d);
    if (camFront < d.boxFrontY + d.trayWall + 6) {
      issues.push({
        level: 'error',
        message: `The cam is ${(d.lead + d.pop + d.over).toFixed(0)} mm long and runs off the front of a ${d.boxD.toFixed(0)} mm drawer. Deepen the case, shorten the lead-in, or pull the band posts closer together.`,
        paramIds: ['depth', 'leadIn', 'bandPull'],
      });
      return issues;
    }
    if (d.slabT > d.boxH - 8) {
      issues.push({
        level: 'error',
        message: `The cam needs a ${d.slabT.toFixed(1)} mm floor slab in a ${d.boxH.toFixed(0)} mm drawer, which leaves nothing to put anything in. Make the case taller or the pin smaller.`,
        paramIds: ['height', 'bossDiameter'],
      });
      return issues;
    }
  }
  if (d.travel < 30) {
    issues.push({
      level: 'error',
      message: `The drawer could only open ${d.travel.toFixed(0)} mm before its stop pins met the bar. Deepen the case.`,
      paramIds: ['depth'],
    });
    return issues;
  }

  // --- fit
  if (d.clear < 0.3) {
    issues.push({
      level: 'warn',
      message: `A ${d.clear} mm running clearance is tight for a 170 mm drawer on two rails. 0.4 mm is a safe start; raise it if the drawer binds.`,
      paramIds: ['clearance'],
    });
  }
  if (d.pinHoleDeep < 3) {
    issues.push({
      level: 'warn',
      message: 'The floor slab is too thin to hold much of the stop pins’ thread. They may pull out under a hard yank.',
      paramIds: ['bossDiameter', 'layer'],
    });
  }

  // --- the latch
  if (d.latch) {
    if (d.armStrain > STRAIN_MAX) {
      issues.push({
        level: 'warn',
        message: `The arm works to ${(d.armStrain * 100).toFixed(1)}% strain when the cam throws the pin to an apex, which PETG will take for a while and then crack. Narrow the arm or the cam.`,
        paramIds: ['armWidth', 'camWidth'],
      });
    }
    if (d.armLiftStrain > STRAIN_MAX) {
      issues.push({
        level: 'warn',
        message: `Lifting the pin over a one-way step strains the arm ${(d.armLiftStrain * 100).toFixed(1)}%. Lower the step, or use a shallower arm.`,
        paramIds: ['camStep', 'armHeight'],
      });
    }
    if (d.camStep < 2 * d.layer) {
      issues.push({
        level: 'warn',
        message: `A ${d.camStep} mm step is under two layers at ${d.layer} mm, so it prints as a ramp and the pin walks back the way it came. Raise the step or drop the layer height.`,
        paramIds: ['camStep', 'layer'],
      });
    }
    if (d.over < 2) {
      issues.push({
        level: 'warn',
        message: 'Under 2 mm of overtravel the pin may not clear the notch when you press it, and the latch will feel like it is jamming.',
        paramIds: ['overtravel'],
      });
    }
    if (d.pop > d.travel) {
      issues.push({
        level: 'error',
        message: `The band throws the drawer ${d.pop.toFixed(0)} mm but the stop catches it at ${d.travel.toFixed(0)} mm. It would slam into the bar every time it opened.`,
        paramIds: ['bandPull', 'depth'],
      });
    }
    if (d.pop < 8) {
      issues.push({
        level: 'warn',
        message: `The band goes slack after only ${d.pop.toFixed(0)} mm, which is not enough drawer to get hold of. Pull the posts further apart, or use a shorter band.`,
        paramIds: ['bandPull', 'bandLength'],
      });
    }
    if (d.bandStretchOpen > 3) {
      issues.push({
        level: 'warn',
        message: `Fully open, each band is stretched ${d.bandStretchOpen.toFixed(1)} times its length. Rubber takes about three; use a longer band or accept a shorter life.`,
        paramIds: ['bandLength'],
      });
    }
  }

  if (d.surface !== 'plain' && d.surfaceDepth > d.trayWall - 0.6) {
    issues.push({
      level: 'warn',
      message: `A ${d.surfaceDepth} mm relief in a ${d.trayWall} mm wall is capped at ${(d.trayWall - 0.6).toFixed(1)} mm so the front stays closed.`,
      paramIds: ['surfaceDepth', 'trayWall'],
    });
  }
  if (d.insert === 'gridfinity' && (d.gridCols < 1 || d.gridRows < 1)) {
    issues.push({
      level: 'warn',
      message: 'The drawer is too small for a single 42 mm Gridfinity cell, so there is no baseplate.',
      paramIds: ['width', 'depth', 'insert'],
    });
  }

  const biggest = Math.max(d.W + 2 * d.earOut, d.D);
  if (biggest > Math.min(d.bed[0], d.bed[1]) - 6) {
    issues.push({
      level: 'warn',
      message: `At ${(d.W + 2 * d.earOut).toFixed(0)} x ${d.D} mm the case is larger than your bed. Print it smaller, or turn it diagonally in the slicer.`,
      paramIds: ['width', 'depth', 'bedX'],
    });
  }
  return issues;
}

function readouts(d: Derived): Record<string, string> {
  const n = d.tiers.length;
  const innerW = d.boxW - 2 * d.trayWall;
  const innerD = d.boxD - 2 * d.trayWall;
  const innerH = d.boxH - d.slabT;
  const out: Record<string, string> = {
    Case: `${d.W} x ${d.D} x ${d.H} mm${n > 1 ? `, ${n} high: ${(n * d.H).toFixed(0)} mm below the desk` : ''}`,
    Drawer: `${d.boxW.toFixed(1)} x ${d.boxD.toFixed(1)} x ${d.boxH.toFixed(1)} mm, ${innerW.toFixed(0)} x ${innerD.toFixed(0)} x ${innerH.toFixed(0)} inside, standing ${d.lip} mm proud when shut`,
    Rails: `Two ${d.railH} mm dovetail rails ${(2 * d.railX).toFixed(0)} mm apart; the drawer hangs on their flanks with ${d.crestClear.toFixed(1)} mm over the crests`,
    Travel: `${d.travel.toFixed(0)} mm to the stop bar. Two screws hold the bar; take them out to lift the drawer off its rails`,
  };
  if (d.latch) {
    out['Latch'] = `Heart cam: Ø${d.bossD} pin, ${d.pop.toFixed(0)} mm pop-out, ${d.over} mm overtravel, ${d.camStep} mm one-way step; ${d.armLen.toFixed(0)} mm arm at ${(d.armStrain * 100).toFixed(1)}% strain sideways, ${(d.armLiftStrain * 100).toFixed(1)}% over a step`;
    out['Band'] = `Two ${d.bandLen} mm bands, stretched over ${d.bandPull} mm when shut. Pops ${d.pop.toFixed(0)} mm, then slack; ${d.bandStretchOpen.toFixed(1)}x stretched fully open`;
  }
  if (d.insert === 'gridfinity' && d.gridCols > 0 && d.gridRows > 0) {
    out['Insert'] = `Gridfinity ${d.gridCols} x ${d.gridRows} baseplate, ${d.gridCols * 42} x ${d.gridRows * 42} mm, takes 21 mm bins`;
  }
  if (n > 1 && d.connector !== 'none') {
    out['Stack'] =
      d.connector === 'screws'
        ? `${4 * (n - 1)} printed Ø${d.stackScrewD} screws down through the corner lugs`
        : d.connector === 'bolts'
          ? `${4 * (n - 1)} M3 x 30 bolts and nuts through the corner lugs`
          : `${4 * (n - 1)} printed dovetail keys, slid in from the front`;
  }
  return out;
}

function build(p: Params, ctx: BuildCtx): BuildResult {
  const { m } = ctx;
  const d = derive(p);
  const blocking = validate(p);
  if (blocking.some((i) => i.level === 'error')) {
    return { parts: [], issues: blocking, readouts: readouts(d) };
  }
  const issues: Issue[] = [];
  const issue = (i: Issue) => issues.push(i);
  const many = d.tiers.length > 1;
  const id = (base: string, k: number) => (many ? `${base}-${k + 1}` : base);
  const named = (base: string, t: { name: string }) => (many ? `${base} (${t.name.toLowerCase()})` : base);

  // One of everything, modelled once, dropped into each tier.
  const kase = dropSlivers(m, buildCase(m, d), SLIVER);
  const drawer = dropSlivers(m, buildDrawer(m, d, issue), SLIVER);
  const bar = buildStopBar(m, d);
  const screws = ([-1, 1] as const).map((s) => buildStopScrew(m, d, s));
  const pins = ([-1, 1] as const).map((s) => buildTravelPin(m, d, s));
  const plate = buildGridPlate(m, d);

  const parts: Part[] = [];
  for (const t of d.tiers) {
    const at = (s: { translate(v: readonly [number, number, number]): unknown }) =>
      (s.translate([0, 0, t.z0]) as typeof kase);
    parts.push({
      id: id('case', t.index),
      name: named('Case', t),
      mesh: serialize(at(kase)),
      color: String(p.caseColor),
      orientationNote:
        'Print floor-down, as it sits. The arm lies flat in its window on the bed, so unlike the original it needs no supports; the rails, posts and lugs grow upward and the desk ears have a 45-degree underside.',
    });
    parts.push({
      id: id('drawer', t.index),
      name: t.name,
      mesh: serialize(at(drawer)),
      color: String(p.trayColor),
      orientationNote:
        'Print floor-down, open side up, no supports. Everything under the floor -- the cam islands, the dovetail slots, the band moats -- is a recess in the bed face. The dovetail slots’ slanted walls are 45-degree overhangs and print clean.',
    });
    parts.push({
      id: id('stop-bar', t.index),
      name: named('Stop bar', t),
      mesh: serialize(at(bar)),
      color: String(p.partColor),
      orientation: [180, 0, 0],
      orientationNote:
        'Print upside down, flat face on the bed, lip pointing up. Fit it last, after the drawer is on its rails: it goes on from underneath with the two printed screws, and it is what stops the drawer coming out in your lap.',
    });
    screws.forEach((s, i) =>
      parts.push({
        id: id(`stop-screw-${i + 1}`, t.index),
        name: named(`Stop-bar screw ${i + 1}`, t),
        mesh: serialize(at(s)),
        color: String(p.partColor),
        orientationNote: 'Print head-down, as it sits. The thread is a real helix at 1.2 mm pitch; it bites the bar’s ear and passes the floor loosely.',
      }),
    );
    pins.forEach((s, i) =>
      parts.push({
        id: id(`stop-pin-${i + 1}`, t.index),
        name: named(`Travel pin ${i + 1}`, t),
        mesh: serialize(at(s)),
        color: String(p.partColor),
        orientationNote:
          'Print head-down, as it sits, and screw it up into the drawer’s underside once the drawer is printed. The rounded head is what hits the stop bar.',
      }),
    );
    if (plate) {
      parts.push({
        id: id('baseplate', t.index),
        name: named('Gridfinity baseplate', t),
        mesh: serialize(at(plate)),
        color: String(p.partColor),
        orientationNote: 'Print as it sits. It drops loose into the drawer and lifts out.',
      });
    }
  }

  // The connectors, one set per joint, in the frame of the UPPER case of each.
  if (many && d.connector !== 'none') {
    for (let k = 0; k + 1 < d.tiers.length; k++) {
      const upper = d.tiers[k]!;
      let i = 0;
      for (const sx of [-1, 1] as const) {
        for (const sy of [-1, 1] as const) {
          i++;
          if (d.connector === 'screws') {
            parts.push({
              id: `stack-screw-${k + 1}-${i}`,
              name: `Stack screw ${i} (${upper.name.toLowerCase()} to the one below)`,
              mesh: serialize(buildStackScrew(m, d, sx, sy).translate([0, 0, upper.z0])),
              color: String(p.partColor),
              orientation: [180, 0, 0],
              orientationNote:
                'Print head-down, thread up. Drops down through the upper case’s corner lug into the tapped lug of the case below; a coin turns it.',
            });
          } else if (d.connector === 'dovetail') {
            parts.push({
              id: `stack-key-${k + 1}-${i}`,
              name: `Dovetail key ${i} (${upper.name.toLowerCase()} to the one below)`,
              mesh: serialize(buildDovetailKey(m, d, sx, sy).translate([0, 0, upper.z0])),
              color: String(p.partColor),
              orientation: [0, sx > 0 ? -90 : 90, 0],
              orientationNote:
                'Print on its web, tenons up. With the two cases stacked, slide it into the pair of grooves from the front until it is flush.',
            });
          }
        }
      }
    }
    if (d.connector === 'bolts') {
      issues.push({
        level: 'warn',
        message: `Not printed: ${4 * (d.tiers.length - 1)} M3 x 30 bolts with nuts. The nut sits in the hex pocket under each top lug; put it in before the case above goes on.`,
        paramIds: ['connector'],
      });
    }
  }

  if (d.latch) {
    issues.push({
      level: 'warn',
      message: `Not printed: two rubber bands, about 1.4 x ${d.bandLen} mm (a small stationery band). Each loops from a post on the case floor to the island in the moat under the drawer on the same side. PETG for the case: the arm flexes ${(d.armStrain * 100).toFixed(1)}% every press.`,
      paramIds: ['bandLength'],
    });
  }

  return { parts, issues, readouts: readouts(d) };
}

export const pushDrawerGenerator: Generator = {
  id: 'pushdrawer',
  name: 'Push-lock drawer',
  description:
    'A modular under-desk drawer with a push-push latch in its floor: an island cam under the drawer, a sprung arm in the case, and a rubber band for the throw. Stack them with printed screws, bolts or dovetail keys, and put a relief on the face you push.',
  tagline: 'Press to open, press to close. Stack as many as you like',
  highlights: [
    'A real push-push latch — island cam and sprung arm, nothing in the way of the drawer',
    'The drawer hangs on two dovetail rails and runs the full depth of the case',
    'Stackable: printed screws, M3 bolts or dovetail keys at the corners',
    'Relief patterns on the front: ribs, hex, voronoi, knurl and more',
    'Gridfinity baseplate sized to the drawer, or printed dividers',
  ],
  art: `<svg viewBox="0 0 120 96" role="img" aria-hidden="true">
    <rect x="6" y="6" width="108" height="8" rx="2" fill="#8b929c"/>
    <rect x="12" y="14" width="96" height="30" rx="3" fill="#5a4636"/>
    <rect x="16" y="18" width="88" height="22" rx="3" fill="#c9b79c"/>
    <rect x="12" y="46" width="96" height="30" rx="3" fill="#5a4636"/>
    <rect x="24" y="50" width="88" height="22" rx="3" fill="#c9b79c"/>
    <g fill="none" stroke="#8a6a4a" stroke-width="2" stroke-linecap="round">
      <path d="M40 86 L70 86 L64 92 M40 86 L46 80"/>
    </g>
    <circle cx="74" cy="86" r="3" fill="#8a6a4a"/>
  </svg>`,
  params: pushDrawerParams,
  groups: pushDrawerGroups,
  validate,
  build,
  presets: [
    { label: 'One drawer, Gridfinity 4 x 3', values: {} },
    { label: 'Two drawers, printed screws', values: { drawers: 2, connector: 'screws' } },
    {
      label: 'Three drawers, dovetail keys, ribbed fronts',
      values: { drawers: 3, connector: 'dovetail', surface: 'ribs', surfaceCell: 3, surfaceGap: 1 },
    },
    {
      label: 'Wide and shallow, hex front, dividers',
      values: { width: 230, depth: 120, height: 28, surface: 'hex', surfaceCell: 10, insert: 'dividers', dividersX: 3, dividersY: 1 },
    },
    { label: 'Plain pull-out, no latch', values: { latch: false, insert: 'none' } },
  ],
};
