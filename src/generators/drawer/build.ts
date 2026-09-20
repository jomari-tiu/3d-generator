import { dropSlivers } from '../../core/kernel/primitives';
import { serialize } from '../../core/kernel/serialize';
import type { BuildCtx, BuildResult, Generator, Issue, Params, Part } from '../../core/params/types';
import { derive, type Derived } from './geometry';
import { buildCarcass } from './parts/carcass';
import { beamFree, buildDeck } from './parts/deck';
import { buildSpring, buildTemplate, followerSpec, springSeat, wireSpec } from './parts/latch';
import { buildTray } from './parts/tray';
import { drawerGroups, drawerParams } from './schema';

/**
 * Under-desk drawer, push to open and push to close.
 *
 * A carcass, one or two trays that slide in it, and a latch that is the whole
 * point of it: press the front and it springs out, press it again and it stays
 * shut. That is a heart cam -- a closed groove with a one-way stepped floor and
 * a sprung follower riding it -- and cam.ts is where it lives.
 *
 * Everything here is in millimetres as typed. What the generator actually does
 * with the numbers is resolve the FIT: the tray is the carcass interior less a
 * running clearance on every face it passes, and that clearance is one control,
 * because a drawer whose two halves were dimensioned independently is a drawer
 * that does not go in.
 */

const SLIVER = 0.05;

function validate(p: Params): Issue[] {
  const d = derive(p);
  const issues: Issue[] = [];

  if (d.latch && d.reach + d.pinD > d.trayD - 10) {
    issues.push({
      level: 'error',
      message: `The follower reaches ${d.reach.toFixed(0)} mm forward under a tray only ${d.trayD.toFixed(0)} mm long, so the cam runs off the front of it. Make the carcass deeper, shorten the pop-out or the lead-in, or narrow the beam.`,
      paramIds: ['depth', 'pop', 'leadIn', 'beamThickness', 'latch'],
    });
    return issues;
  }
  if (d.latch && d.trayH < 15) {
    issues.push({
      level: 'error',
      message: `The latch bay takes ${d.bayH.toFixed(1)} mm off the bottom of a ${d.openH} mm opening, which leaves ${d.trayH.toFixed(0)} mm of tray. Make the drawers taller, or turn the latch off for a plain pull-out.`,
      paramIds: ['height', 'latch', 'beamThickness'],
    });
    return issues;
  }
  if (d.trayW < 30 || d.trayH < 12) {
    issues.push({
      level: 'error',
      message: 'The walls and clearances have eaten the tray. Make the carcass bigger or the walls thinner.',
      paramIds: ['width', 'height', 'wall'],
    });
    return issues;
  }

  // --- the fit, which is the thing that decides whether it works at all
  if (d.clear < 0.2) {
    issues.push({
      level: 'warn',
      message: `A ${d.clear} mm running clearance is tighter than most printers hold. If the tray binds, this is the number — 0.3 mm is a safe start.`,
      paramIds: ['clearance'],
    });
  }
  if (d.slideP < 2) {
    issues.push({
      level: 'warn',
      message: 'A tongue under 2 mm deep will jump its groove when the tray is loaded at the front. Deepen it.',
      paramIds: ['slideDepth'],
    });
  }
  if (d.travel > d.trayD - 15) {
    issues.push({
      level: 'warn',
      message: `Opening ${d.travel} mm of a ${d.trayD.toFixed(0)} mm tray leaves almost nothing in the grooves, and it will droop. Keep the travel under ${(d.trayD - 15).toFixed(0)} mm.`,
      paramIds: ['travel', 'depth'],
    });
  }
  if (d.H > 220) {
    issues.push({
      level: 'warn',
      message: `${d.tiers.length} drawers at ${d.openH} mm hang ${d.H} mm below the desk, which is most of a knee. Shorten the drawers or drop one.`,
      paramIds: ['drawers', 'height'],
    });
  }

  // --- the latch
  if (d.latch) {
    if (d.camStep < 2 * d.layer) {
      issues.push({
        level: 'warn',
        message: `A ${d.camStep} mm step is under two layers at ${d.layer} mm, so it will print as a ramp and the pin will walk back the way it came. Raise the step or drop the layer height.`,
        paramIds: ['camStep', 'layer'],
      });
    }
    // The ejector tunnel is bored through the tray's own floor, so the floor
    // under it, the bore, and the skin over it all have to live inside the
    // tray's height with something left to put things in.
    const plinth = d.tunnelFloor + d.tunnelH + d.trayFloor;
    if (plinth > d.trayH - 6) {
      issues.push({
        level: 'error',
        message: `The ejector tunnel stands ${plinth.toFixed(0)} mm up into a ${d.trayH.toFixed(0)} mm tray, which leaves no tray above it. Make the drawers taller, or narrow the spring.`,
        paramIds: ['height', 'springWidth', 'ejector'],
      });
    } else if (plinth > d.trayH * 0.45) {
      issues.push({
        level: 'warn',
        message: `The ejector tunnel raises the tray's floor by ${plinth.toFixed(0)} mm over the back ${(d.springGap - d.backGap + 2 * d.trayWall).toFixed(0)} mm of it. That corner of the drawer is that much shallower — taller drawers make the step less of one.`,
        paramIds: ['height', 'springWidth'],
      });
    }
    if (d.over < 1.5) {
      issues.push({
        level: 'warn',
        message: 'Under 1.5 mm of overtravel and the pin may not clear the notch when you press it. The latch will feel like it is jamming.',
        paramIds: ['overtravel'],
      });
    }
    if (d.pop > d.travel) {
      issues.push({
        level: 'error',
        message: `The latch throws the tray ${d.pop} mm but the stop catches it at ${d.travel} mm. The tray would slam into the stop every time it opened.`,
        paramIds: ['pop', 'travel'],
      });
    }

    if (d.follower === 'printed') {
      // The beam is sized from the strain budget, so this only fires if some
      // other constraint has squeezed the bay -- but when it does, the part
      // does not break loudly, it just cracks after a month.
      const free = beamFree(d);
      const strain = (3 * d.beamRoot * d.beamThrow) / (2 * free * free);
      if (strain > 0.025) {
        issues.push({
          level: 'warn',
          message: `The follower beam works to ${(strain * 100).toFixed(1)}% strain at full throw, which PETG will take for a while and then crack. Narrow the beam, or narrow the cam so it has less far to swing.`,
          paramIds: ['beamThickness', 'camWidth'],
        });
      }
      if (d.deckW < 40) {
        issues.push({
          level: 'warn',
          message: 'The latch deck is narrower than the follower needs to swing in. Widen the carcass.',
          paramIds: ['width', 'camWidth'],
        });
      }
    } else {
      const arm = d.reach;
      if (arm > 60) {
        issues.push({
          level: 'warn',
          message: `The wire has to reach ${arm.toFixed(0)} mm from its boss to the notch. That long, a paperclip is too floppy to hold the pin down — shorten the lead-in or the pop-out, or switch to the printed follower.`,
          paramIds: ['leadIn', 'pop', 'follower'],
        });
      }
      issues.push({
        level: 'warn',
        message:
          'The wire presses into its boss from UNDERNEATH, through the open face of the latch bay — so fit it before the tray goes in, and in a stack fit the lower one first. The printed follower just slides into its rails.',
        paramIds: ['follower'],
      });
    }

    if (d.eject === 'spring') {
      // Epsilon, because 3 * 0.4 is 1.2000000000000002 and a 1.2 mm ribbon was
      // being told to use at least 1.2 mm.
      if (d.springT < 3 * d.nozzle - 1e-9) {
        issues.push({
          level: 'warn',
          message: `A ${d.springT} mm ribbon is under three extrusions wide and will print as a wavy line rather than a spring. Use at least ${(3 * d.nozzle).toFixed(1)} mm.`,
          paramIds: ['springThickness', 'nozzle'],
        });
      }
      const solid = (d.springTurns + 1) * d.springT;
      if (solid > d.springGap - d.over) {
        issues.push({
          level: 'warn',
          message: `Pressed all the way in, the spring has ${(d.springGap - d.over).toFixed(0)} mm to fold into and its ribbons alone stack ${solid.toFixed(0)} mm. It will go solid before the latch releases. Use fewer folds or a thinner ribbon.`,
          paramIds: ['springTurns', 'springThickness'],
        });
      }
    }
  }

  // --- bed
  const biggest = Math.max(d.W, d.D);
  if (biggest > Math.min(d.bed[0], d.bed[1]) - 10) {
    issues.push({
      level: 'warn',
      message: `At ${d.W} x ${d.D} mm the carcass is larger than your bed. Print it smaller, or turn it diagonally in the slicer.`,
      paramIds: ['width', 'depth', 'bedX'],
    });
  }

  return issues;
}

function readouts(d: Derived): Record<string, string> {
  const n = d.tiers.length;
  const inner = `${(d.trayW - 2 * d.trayWall).toFixed(0)} x ${(d.trayD - 2 * d.trayWall).toFixed(0)} x ${(d.trayH - d.trayFloor).toFixed(0)} mm`;
  const cells = (d.divX + 1) * (d.divY + 1);
  const litres = ((d.trayW - 2 * d.trayWall) * (d.trayD - 2 * d.trayWall) * (d.trayH - d.trayFloor)) / 1e6;

  const out: Record<string, string> = {
    Overall: `${d.W} x ${d.D} mm, hanging ${(d.H + d.topT).toFixed(0)} mm below the desk`,
    Drawers: n === 1 ? 'One' : `${n}, one above the other, ${d.openH} mm of opening each`,
    Inside: `${inner} each — ${(litres * n).toFixed(2)} litres over ${cells * n} compartment${cells * n === 1 ? '' : 's'}`,
    Tray: `${d.trayD.toFixed(0)} mm deep of a ${d.D} mm carcass — the full depth${d.latch ? `, the latch living in a ${d.bayH.toFixed(1)} mm bay underneath` : ''}`,
    Slides: `${d.slideP} x ${d.slideT} mm tongue, ${d.clear} mm running clearance, opens ${d.travel} mm`,
  };

  if (d.latch) {
    out['Latch'] = `Heart cam: ${d.pop} mm pop-out, ${d.over} mm overtravel, ${d.camStep} mm one-way step`;
    out['Follower'] = d.follower === 'printed' ? followerSpec(d) : wireSpec(d);
    out['Ejector'] =
      d.eject === 'spring'
        ? `Printed spring, ${d.springFree.toFixed(0)} mm free into a ${d.springGap.toFixed(0)} mm gap, ${d.springT} mm ribbon in ${d.springTurns} folds`
        : `Elastic band, two posts ${d.bandSpan} mm apart on the back wall to a peg in the tray's tunnel`;
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
  const many = d.tiers.length > 1;
  const suffix = (base: string, tier: { index: number }) =>
    many ? `${base}-${tier.index + 1}` : base;

  const parts: Part[] = [
    {
      id: 'carcass',
      name: 'Carcass',
      mesh: serialize(dropSlivers(m, buildCarcass(m, d), SLIVER)),
      color: String(p.carcassColor),
      // Top plate DOWN. The plate is the one face that has to be flat to bed
      // against the desk, and printing it against the glass is how it gets that
      // way; everything else on the part then overhangs upward.
      orientation: [180, 0, 0],
      orientationNote:
        'Print top-plate-down, so the face that meets the desk comes off the bed flat. The slide grooves and the latch rails then face up and need no supports.',
    },
  ];

  // One tray, one deck, one spring -- modelled once and dropped into each
  // tier. Two drawers are the same drawer twice, and working the second one
  // out separately is how the two stop agreeing.
  const tray = dropSlivers(m, buildTray(m, d), SLIVER);
  const deck = buildDeck(m, d);
  const spring = buildSpring(m, d);
  const seat = springSeat(d);

  for (const tier of d.tiers) {
    parts.push({
      id: suffix('tray', tier),
      name: tier.name,
      mesh: serialize(tray.translate([0, 0, tier.z0])),
      color: String(p.trayColor),
      orientationNote:
        'Print floor-down, open side up, no supports. The cam groove and the ejector tunnel are both cut into the underside, so the bed carries them: the groove is a 3 mm channel the slicer bridges in one pass, and the tunnel prints its own floor first and bridges its roof. Nothing hangs below the floor, which is the whole reason the tray can still be printed on its base with the latch underneath it.',
    });
  }

  if (d.latch) {
    if (deck) {
      for (const tier of d.tiers) {
        parts.push({
          id: suffix('deck', tier),
          name: many ? `Latch deck (${tier.name.toLowerCase()})` : 'Latch deck',
          mesh: serialize(deck.translate([0, 0, tier.z0])),
          color: String(p.partColor),
          // No flip any more: the pin points up in the assembly too, because
          // the cam it rides is the tray's underside. Flat on the bed is what
          // makes the beam bend in the layer plane instead of trying to peel
          // the layers apart, and that is the whole reason a printed follower
          // can replace the wire.
          orientationNote:
            'Print flat, exactly as it sits, pin upward, in PETG. Lying flat is what makes the spring arm bend along its layers rather than across them — stand it on edge and it snaps on the first press. Slide it into the rails at the BOTTOM of the opening, in from the open front, until it clicks past the bumps.',
        });
      }
    }
    if (spring) {
      for (const tier of d.tiers) {
        parts.push({
          id: suffix('spring', tier),
          name: many ? `Ejector spring (${tier.name.toLowerCase()})` : 'Ejector spring',
          mesh: serialize(
            spring.translate([seat[0], seat[1], seat[2] + tier.z0]),
          ),
          color: String(p.partColor),
          orientationNote:
            'Print as laid out: the folds then bend in the layer plane, loading each layer along its length instead of trying to peel it off the one below. PETG — PLA takes a set and stops throwing.',
        });
      }
      issues.push({
        level: 'warn',
        message: 'The printed spring is the part most likely to want a second go. If the throw is weak, thicken the ribbon by 0.2 mm; if it will not compress, thin it. An elastic band is the fallback that never needs tuning.',
        paramIds: ['springThickness', 'ejector'],
      });
    }

    if (d.follower === 'wire') {
      const gauge = buildTemplate(m, d);
      if (gauge) {
        parts.push({
          id: 'gauge',
          name: 'Wire bending gauge',
          mesh: serialize(gauge),
          color: String(p.partColor),
          quantity: 1,
          orientationNote:
            'A tool, not a part of the drawer. Lay the paperclip in the channel and bend it round the posts.',
        });
      }
      issues.push({
        level: 'warn',
        message: `The follower is not printed: ${wireSpec(d)}`,
        paramIds: ['wireDiameter', 'follower'],
      });
    }
  }

  return { parts, issues, readouts: readouts(d) };
}

export const drawerGenerator: Generator = {
  id: 'drawer',
  name: 'Under-desk drawer',
  description:
    'A drawer that screws under a desktop, with a push-to-open, push-to-close latch. Stack two of them, and the latch is printed — no springs to buy and no wire to bend.',
  tagline: 'Press it and it springs open. Press it again and it stays shut',
  highlights: [
    'Push to open, push to close — a real heart-cam latch',
    'The whole latch lives UNDER the tray, so the tray is the full depth of the box',
    'One drawer or two, stacked, each with its own latch',
    'The follower is a leaf spring cut out of a flat plate: nothing to bend',
    'Two parts that slide on printed tongues, no bought runners',
    'One clearance control sets the whole fit',
  ],
  art: `<svg viewBox="0 0 120 96" role="img" aria-hidden="true">
    <rect x="6" y="8" width="108" height="9" rx="2" fill="#8b929c"/>
    <rect x="14" y="17" width="92" height="66" rx="3" fill="#3b4149"/>
    <rect x="22" y="23" width="84" height="26" rx="3" fill="#d9d3c7"/>
    <rect x="22" y="55" width="84" height="26" rx="3" fill="#d9d3c7"/>
    <rect x="18" y="19" width="6" height="32" rx="2" fill="#c2683f"/>
    <rect x="18" y="51" width="6" height="32" rx="2" fill="#c2683f"/>
    <g stroke="#b3ab99" stroke-width="2" fill="none">
      <path d="M50 23v26M78 23v26"/>
    </g>
    <path d="M30 29h70M30 61h70" stroke="#b3ab99" stroke-width="2" fill="none" opacity=".65"/>
    <g fill="none" stroke="#c2683f" stroke-width="2.2" stroke-linecap="round">
      <path d="M96 88 L60 88"/>
    </g>
    <circle cx="58" cy="88" r="3" fill="#c2683f"/>
  </svg>`,
  params: drawerParams,
  groups: drawerGroups,
  validate,
  build,
  presets: [
    { label: 'Two drawers, pens and cables', values: {} },
    {
      label: 'One shallow drawer — stationery',
      values: { drawers: 1, width: 220, depth: 150, height: 32, dividersX: 4, dividersY: 1, travel: 95 },
    },
    {
      label: 'Two deep drawers — cables and chargers',
      values: { width: 150, depth: 210, height: 70, dividersX: 1, dividersY: 1, frontStyle: 'bar', travel: 145 },
    },
    {
      label: 'No latch, plain pull-out',
      values: { drawers: 1, latch: false, frontStyle: 'bar', dividersX: 3 },
    },
    {
      label: 'Paperclip follower, elastic band',
      values: { drawers: 1, follower: 'wire', ejector: 'band', frontStyle: 'scoop' },
    },
  ],
};
