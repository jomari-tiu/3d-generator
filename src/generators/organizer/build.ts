import { dropSlivers } from '../../core/kernel/primitives';
import { serialize } from '../../core/kernel/serialize';
import type { BuildCtx, BuildResult, Generator, Issue, Params, Part } from '../../core/params/types';
import { dockFits } from './dock';
import {
  backX,
  clipSpec,
  derive,
  phoneFootZ,
  standBay,
  standSoftR,
  type Derived,
} from './geometry';
import { buildBase } from './parts/base';
import { buildBackWall, shelfZ } from './parts/backwall';
import { buildFrontTray } from './parts/fronttray';
import { buildModule, moduleHeight } from './parts/modules';
import { buildPanel } from './parts/panel';
import { buildStand } from './parts/stand';
import { organizerGroups, organizerParams } from './schema';

/**
 * Modular desk organizer.
 *
 * On a wall, a panel with a dovetail per bay and modules that slide on from one
 * end. On a desk, one plate with the modules already part of it and nothing to
 * slide on at all -- only the phone stand comes off, out of a shallow recess.
 * Either way: a phone stand that lifts off, a pen cup, an open tray, a shallow pen tray,
 * a card rack.
 *
 * The stand comes two ways, and they are not variants of one shape. A CRADLE is
 * a low block with a slot through it: the phone drops in and the charging lead
 * comes up the middle of the block into the port, so it is 30 mm tall and the
 * phone is charging the moment it is put down. A REST is the tall leaning face,
 * and is the only one of the two with anywhere to put a MagSafe puck.
 *
 * Two forms, one set of modules. On a desk they sit side by side on a plate
 * flat on the desktop; on a wall they stack up a back panel as shelves. All that actually changes is which face the dovetail is on and which
 * axis the bays run along, which is why not one module needed rewriting.
 *
 * The plate is DERIVED from the modules rather than the other way round. Pick a
 * cup and a stand and a rack, each comes out as wide as the thing it holds, and
 * the plate is exactly wide enough for them with a margin. Size the plate first
 * and divide it into equal bays and you get a pen cup with 20 mm of air beside
 * it, which is the difference between a designed object and a grid.
 */

const SLIVER = 0.05;

function validate(p: Params): Issue[] {
  const d = derive(p);
  const issues: Issue[] = [];

  if (d.bays.length === 0) {
    issues.push({
      level: 'error',
      message: 'Every bay is empty, so there is nothing to build. Put a module in at least one.',
      paramIds: ['slot1', 'slot2', 'slot3'],
    });
    return issues;
  }

  if (d.form === 'wall' && !dockFits(d)) {
    issues.push({
      level: 'error',
      message: `A ${d.dtH} mm dovetail needs a plate at least ${(d.dtH + 2 * d.minPlate).toFixed(1)} mm thick to sit in, and this one is ${d.baseT} mm. Thicken the plate or shallow the dovetail.`,
      paramIds: ['baseThickness', 'dovetailHeight'],
    });
    return issues;
  }

  // --- the dock, which is the only fit in the whole thing
  if (d.form === 'wall' && d.clear < 0.15) {
    issues.push({
      level: 'warn',
      message: `A ${d.clear} mm clearance on a sliding dovetail is tighter than most printers hold, and a module that will not go on cannot be persuaded. 0.25 mm is a safe start.`,
      paramIds: ['clearance'],
    });
  }
  const widest = Math.min(...d.bays.map((b) => b.w));
  if (d.form === 'wall' && d.dtW + 2 * d.wall > widest) {
    issues.push({
      level: 'error',
      message: `A ${d.dtW} mm dovetail does not fit under a ${widest.toFixed(0)} mm module with walls either side. Narrow the dovetail or widen the narrowest module.`,
      paramIds: ['dovetailWidth', 'cardsWidth'],
    });
  }
  if (d.form === 'wall' && d.dtStop > d.D - 20) {
    issues.push({
      level: 'warn',
      message: 'The front stop is so far back that the dovetail barely engages. Reduce it.',
      paramIds: ['dovetailStop', 'depth'],
    });
  }

  // --- the stand
  const stand = standBay(d);

  if (stand) {
    const well = d.lipT + d.phoneT + 2 * d.clear + d.restT;
    if (well > d.D - 10) {
      issues.push({
        level: 'error',
        message: `The lip, the phone and the back rest need ${well.toFixed(0)} mm of the ${d.D} mm depth and leave no plate behind them. Make it deeper, or thin the back rest.`,
        paramIds: ['depth', 'restThickness', 'phoneThickness'],
      });
    }
    // And the same question at the TOP of it, which nothing asked. The panel
    // leans back as it rises, so height and lean together decide whether it
    // is still standing on its own plate up there: a 40-degree lean on a
    // 200 mm panel puts the top of it 80 mm behind the back edge. The profile
    // is one polygon and it does not fold -- it comes out inside out, and the
    // part that used to be a ring with a window in it is neither.
    const tip = backX(d, Math.max(d.standH - d.plateT, 5)) + 2 * stand.margin;
    if (tip > d.D) {
      issues.push({
        level: 'error',
        message: `Leaning ${d.lean} deg, a ${d.standH.toFixed(0)} mm stand reaches ${tip.toFixed(0)} mm back at the top and the plate is ${d.D} mm deep, so the panel hangs off the back of its own foot. Lean it less, make it shorter, or make the set deeper.`,
        paramIds: ['standAngle', 'standHeight', 'depth'],
      });
    }
    if (d.lipH <= d.plateT + 2) {
      issues.push({
        level: 'warn',
        message: 'The lip is barely proud of the stand’s own plate, so there is nothing for the phone to rest on. Raise it.',
        paramIds: ['lipHeight'],
      });
    }
    if (d.lipStyle === 'tabs' && d.ledgeZ + 0.01 < d.plugT) {
      issues.push({
        level: 'warn',
        message: `The tabs are ${d.ledgeZ} mm up, so there is ${d.ledgeZ} mm between the stand's plate and the bottom of the phone — a ${d.plugT} mm plug will not get in under it. The open gap between the tabs is only half the job; raise them to ${d.plugT} mm or more for the other half.`,
        paramIds: ['ledgeHeight', 'plugThickness'],
      });
    }

    const softLimb = d.standSoft > 0.05 ? 2 * d.standSoft + 0.6 : 0;
    if (softLimb > Number(p.lipThickness) + 0.01) {
      issues.push({
        level: 'warn',
        message: `${d.standSoft} mm of edge softening rounds a limb away unless that limb is at least ${softLimb.toFixed(1)} mm thick, so the lip has been thickened from ${Number(p.lipThickness)} to ${d.lipT.toFixed(1)} mm to carry it. Soften less if you would rather keep the lip slim.`,
        paramIds: ['standSoft', 'lipThickness'],
      });
    }
    if (d.wireless) {
      const back = d.restT - d.puckT;
      if (back < 2 * d.minPlate) {
        issues.push({
          level: 'warn',
          message: `A ${d.puckT} mm puck in a ${d.restT} mm back rest leaves ${back.toFixed(1)} mm behind it. The rest has been thickened to suit; set it thicker yourself if you want more.`,
          paramIds: ['restThickness', 'puckThickness'],
        });
      }
      // The pocket bites into the front of the rest and the cable groove into
      // the back of it. Below the pocket, where the groove is on its own, what
      // is left between them is all that holds the rest together.
      const left = d.restT - d.cableD;
      if (left < 2 * d.minPlate) {
        issues.push({
          level: 'warn',
          message: `A ${d.cableD} mm groove down the back of a ${d.restT.toFixed(1)} mm rest leaves ${left.toFixed(1)} mm of it. The rest has been thickened to suit; shallow the groove if you would rather keep it slim.`,
          paramIds: ['cableDepth', 'restThickness'],
        });
      }
      if (d.puckD + 2 * d.wall > d.standW) {
        issues.push({
          level: 'error',
          message: `A ${d.puckD} mm charger will not fit in a stand ${d.standW.toFixed(0)} mm wide. Widen the phone width, or use a smaller puck.`,
          paramIds: ['puckDiameter', 'phoneWidth'],
        });
      }
      const top = d.puckH + d.puckD / 2;
      if (top > d.standH - 2) {
        issues.push({
          level: 'warn',
          message: `The charger reaches ${top.toFixed(0)} mm up a ${d.standH} mm stand, so it breaks out of the top. Lower it or make the stand taller.`,
          paramIds: ['puckHeight', 'standHeight'],
        });
      }
      // A ring's panel is not a rectangle: its top is an arc, so the width
      // beside the window shrinks the higher the window sits, and a charger
      // that clears the sides at its own centre can still come out through
      // the shoulder. That is not a hole in a panel, it is a fork with two
      // horns -- so `ringMinH` puts a floor under the height rather than
      // letting it happen and reporting it afterwards.
      if (d.standStyle === 'ring' && d.standH > Number(p.standHeight) + 0.01) {
        issues.push({
          level: 'warn',
          message: `A ring's top is an arc, so the panel narrows the higher you go — and a ${d.puckD} mm charger centred ${d.puckH} mm up needs ${d.standH.toFixed(0)} mm of panel to stay inside it. The stand has been raised from ${Number(p.standHeight)} to ${d.standH.toFixed(0)} mm. Lower the charger instead if you would rather keep it short.`,
          paramIds: ['standHeight', 'puckHeight', 'puckDiameter'],
        });
      }
      // The clip on the back, which is not always buildable. It stands
      // upright off a face that leans away from it, and its underside has to
      // be a 45-degree ramp off that face; past about thirty-two degrees of
      // lean the two are near enough parallel that no finite bracket is ever
      // supported. Better said out loud than silently left off the part.
      if (d.standStyle === 'ring' && d.cableClip && !clipSpec(d)) {
        issues.push({
          level: 'warn',
          message: `At ${d.lean} deg of lean the back of the panel runs away faster than a 45-degree ramp can follow it, so there is no clip that would print without support. It has been left off — lean the stand back less, or turn the clip off and let the lead hang.`,
          paramIds: ['standAngle', 'cableClip'],
        });
      }
      // And the bottom of it, which nothing ever checked. `puckHeight` is the
      // CENTRE, measured from the floor the phone's bottom edge stands on, so
      // anything below one radius puts the pocket through that floor and into
      // the lip in front of it. The whole lower third of the slider did that
      // silently: at the minimum 20 mm a stock 56 mm puck reaches 8 mm below
      // the well.
      const foot = phoneFootZ(d);
      const low = d.puckH - d.puckD / 2 - foot;
      if (low < 0) {
        issues.push({
          level: 'warn',
          message: `A ${d.puckD} mm charger centred ${d.puckH} mm up reaches ${(-low).toFixed(0)} mm below where the phone stands${foot > 0 ? ` (the tabs, ${foot} mm up)` : ''}, so nothing of it meets the back of the phone. Raise it to ${(foot + d.puckD / 2).toFixed(0)} mm or more, drop the tabs, or use a smaller puck.`,
          paramIds: ['puckHeight', 'puckDiameter', 'ledgeHeight'],
        });
      }
    }
  }
  // Only when there is genuinely no stand. Hung off the `rest` branch instead,
  // it fired on every cradle -- telling the user there was no phone stand in a
  // bay they were looking at a phone stand in.
  if (!stand && p.wireless === true) {
    issues.push({
      level: 'warn',
      message: 'There is no phone stand in any bay, so the charger settings are doing nothing.',
      paramIds: ['slot1', 'slot2', 'slot3'],
    });
  }

  // --- the wall form
  if (d.form === 'wall') {
    // A shelf is a cantilever and the dovetail is the only thing holding it.
    // The desk form never has to care: the plate is under the module.
    const heavy = d.bays.filter((b) => b.w > 2.5 * d.dtW);
    if (heavy.length > 0) {
      issues.push({
        level: 'warn',
        message: `On a wall each module hangs off its dovetail alone, and a ${heavy[0]!.w.toFixed(0)} mm shelf on a ${d.dtW} mm rail is a lot of leverage. Widen the dovetail, or keep the heavy things on the lowest shelf.`,
        paramIds: ['dovetailWidth', 'form'],
      });
    }
    if (d.D > 120) {
      issues.push({
        level: 'warn',
        message: `${d.D} mm is a long way for a shelf to stick out of a wall. Under about 120 mm it stays a shelf; past that it is a diving board.`,
        paramIds: ['depth', 'form'],
      });
    }
  }

  // --- the back wall
  if (d.backWall > 0) {
    const tallest = Math.max(0, ...d.bays.map((b) => moduleHeight(d, b)));
    if (d.coinShelf > 0) {
      const need = shelfZ(d) + Math.max(d.wall * 3, 14) + 4;
      if (need > d.backWall) {
        issues.push({
          level: 'warn',
          message: `The change shelf has to clear the tallest module, which puts its floor ${shelfZ(d).toFixed(0)} mm up — and it needs a ${d.backWall.toFixed(0)} mm wall to be ${need.toFixed(0)} mm. Raise the wall, or drop whatever is tallest on the plate.`,
          paramIds: ['backWall', 'coinShelf'],
        });
      }
    }
    if (d.backWall < tallest) {
      issues.push({
        level: 'warn',
        message: `The wall is ${d.backWall.toFixed(0)} mm and something on the plate is ${tallest.toFixed(0)} mm, so the hooks are behind it rather than above it. Raise the wall past the tallest module to reach them.`,
        paramIds: ['backWall', 'slot1'],
      });
    }
    if (!dockFits(d)) {
      issues.push({
        level: 'error',
        message: 'The back wall hangs on the same dovetail the modules do, and the plate is too thin to hold one. Thicken the plate.',
        paramIds: ['baseThickness', 'backWall'],
      });
    }
  }

  // --- the bed
  const plateH = d.form === 'wall' ? d.panelH : d.plateD;
  if (d.W > d.bed[0] - 10 || plateH > d.bed[1] - 10) {
    issues.push({
      level: 'warn',
      message:
        d.form === 'wall'
          ? `The panel is ${d.W.toFixed(0)} x ${d.panelH.toFixed(0)} mm, which is more than your bed. Drop a module, or shorten one.`
          : `The plate is ${d.W.toFixed(0)} x ${d.plateD.toFixed(0)} mm, which is more than your bed. Drop a module, or narrow one.`,
      paramIds: ['slot1', 'depth', 'bedX'],
    });
  }

  return issues;
}

/**
 * What each kind is called, in the readout and on the part.
 *
 * One table rather than a name spelled out at each site: the readout used to
 * carry its own copy, and a kind added to one and not the other comes out as
 * `undefined 78 mm`.
 */
const MODULE_NAMES: Readonly<Record<string, string>> = {
  stand: 'phone stand',
  cup: 'pen cup',
  tray: 'tray',
  pentray: 'pen tray',
  cards: 'card rack',
  none: '',
};

/** The same names, capitalised, for the part list. */
function partName(kind: string): string {
  const n = MODULE_NAMES[kind] ?? kind;
  return n.charAt(0).toUpperCase() + n.slice(1);
}

function readouts(d: Derived): Record<string, string> {
  const tallest = Math.max(0, ...d.bays.map((b) => moduleHeight(d, b)));
  const names: Record<string, string> = MODULE_NAMES;
  const wall = d.form === 'wall';
  const out: Record<string, string> = {
    Footprint: wall
      ? `${d.W.toFixed(0)} mm wide, ${d.panelH.toFixed(0)} mm tall, standing ${d.D.toFixed(0)} mm off the wall`
      : `${d.W.toFixed(0)} x ${d.plateD.toFixed(0)} mm, ${(d.baseT + tallest).toFixed(0)} mm tall`
        + (d.frontLedge === 'groove'
          ? ` — including a ${d.frontD} mm pen groove along the front`
          : d.frontLedge === 'tray'
            ? ` — including the ledge the ${d.frontD.toFixed(0)} mm front tray sits on`
            : ''),
    Modules: d.bays.map((b) => `${names[b.kind]} ${b.w.toFixed(0)} mm`).join(wall ? ', top down: ' : ' · '),
    Assembly: wall
      ? `${d.dtW} mm dovetail at ${d.dtAngle} deg, ${d.clear} mm clearance — slide each shelf in from one end`
      : standBay(d)
        ? 'One piece, with the phone stand dropping into its own shallow recess — nothing to slide on'
        : 'One piece — nothing to slide on',
  };

  const stand = standBay(d);
  if (stand) {
    out['Stands on'] =
      d.lipStyle === 'tabs'
        ? `Two ${d.tabW} mm tabs ${d.ledgeZ} mm up the face, open in the middle — the plug goes straight into the port from the front`
        : `A lip right across the front, ${(d.lipH - d.plateT).toFixed(1)} mm proud of the well${d.passthrough ? ' — with a notch under it for a plug-in cable' : ''}`;
  }
  if (stand) {
    // The softening needs every limb to be at least twice its radius, so the
    // limbs are grown to carry it rather than it being throttled to fit them.
    // Worth saying which ones moved: asking for 8 mm of round on a leaning
    // stand is also asking for a 16.6 mm lip, and that is a visible thing to
    // have happened without saying so.
    const r = standSoftR(d);
    // A limb sitting exactly ON the softening's floor is one the softening
    // put there. The readout has only the derived numbers, not what was typed,
    // and this is the honest reading of them.
    const floor = r > 0.05 ? 2 * r + 0.6 : 0;
    const grown: string[] = [];
    if (floor > 0 && d.lipT >= floor - 0.01) {
      grown.push(`the lip to ${d.lipT.toFixed(1)} mm`);
    }
    if (floor > 0 && d.restT >= floor - 0.01 && d.restT <= floor + 0.01) {
      grown.push(`the rest to ${d.restT.toFixed(1)} mm`);
    }
    out['Edges'] =
      r <= 0.01
        ? 'Square — the plain block'
        : `Rounded ${r.toFixed(1)} mm on every outside edge; the face it prints on stays square` +
          (grown.length > 0 ? ` — which took ${grown.join(' and ')}` : '');
  }
  if (stand) {
    out['Stand'] =
      `${d.standH} mm tall — a phone up to ${d.phoneW} x ${d.phoneT} mm leans on it at ${d.lean} deg`;
    const ring = d.standStyle === 'ring';
    out['Charging'] = d.wireless
      ? ring
        ? `${d.puckD} mm puck seated from the FRONT, centred ${d.puckH} mm up the panel, lead out of the slot below it and down the back${d.cableClip ? `, caught in a clip ${d.clipZ} mm up` : ''} — nothing through the plate`
        : `${d.puckD} mm puck, centred ${(d.puckH - phoneFootZ(d)).toFixed(0)} mm above the bottom edge of the phone (measure yours from there to the middle of its magnet ring), lead laid into the open groove down the BACK${d.passthrough ? ' — plus a channel under the front for a plug-in cable' : ''}`
      : d.passthrough
        ? 'Cable channel under the front, fed from the run beneath the plate'
        : 'None';
  }
  if (!wall && d.backWall > 0) {
    const bits = [
      d.keyHooks > 0 ? `${d.keyHooks} hook${d.keyHooks > 1 ? 's' : ''}` : '',
      d.watchPost ? `a ${d.watchBarW.toFixed(0)} mm watch bar` : '',
      d.coinShelf > 0 ? `a ${d.coinShelf.toFixed(0)} mm change shelf ${shelfZ(d).toFixed(0)} mm up` : '',
    ].filter(Boolean);
    out['Back wall'] =
      `${d.backWall.toFixed(0)} mm tall, ${d.backWallT} mm thick, carrying ${bits.length > 0 ? bits.join(', ') : 'nothing yet'} — goes on after the modules`;
  }
  if (!wall && d.frontLedge !== 'none') {
    out['In front'] =
      d.frontLedge === 'groove'
        ? `A ${d.frontD} mm pen groove, ${d.grooveD} mm deep, cut into the plate`
        : `A ${d.frontD.toFixed(0)} x ${d.frontTrayH} mm shallow tray, dovetailed on — lifts off to be tipped out`;
  }
  out['Mounting'] = wall
    ? 'Two screws in the wall, through the keyholes at the top of the panel'
    : 'Flat on the desk, on four stick-on feet — the lead leaves through the groove in the underside';
  // On a desk the plate is one part with every module already in it, so the
  // only other pieces are the phone stand and the back wall -- the two things
  // that have to print in an orientation the plate cannot give them.
  const n = wall
    ? d.bays.length + 1
    : 1 + (standBay(d) ? 1 : 0) + (d.backWall > 0 ? 1 : 0);
  out['Prints as'] = `${n} piece${n === 1 ? '' : 's'}, all flat on the bed`;
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

  const wall = d.form === 'wall';
  const parts: Part[] = [
    wall
      ? {
          id: 'panel',
          name: 'Back panel',
          mesh: serialize(dropSlivers(m, buildPanel(m, d), SLIVER)),
          color: String(p.baseColor),
          // On its back, slots up. Standing, every slot is an undercut and the
          // keyholes are bridges.
          orientation: [-90, 0, 0],
          orientationNote:
            'Print lying on its back, slots facing the sky — the same orientation the base plate wants, for the same reason. Hang it on two screws through the keyholes before any module goes on.',
        }
      : {
          id: 'base',
          name: 'Base plate',
          mesh: serialize(dropSlivers(m, buildBase(m, d), SLIVER)),
          color: String(p.baseColor),
          orientationNote:
            'Flat on the bed, top face up. Every module is part of this one part — only the phone stand lifts out — so the open tops all face the sky and the only overhang is the chamfer round the foot, which is a chamfer so that it is not one.',
        },
  ];

  const front = wall ? buildFrontTray(m, d) : null;
  if (front) {
    parts.push({
      id: 'fronttray',
      name: 'Front tray',
      mesh: serialize(dropSlivers(m, front, SLIVER)),
      color: String(p.moduleColor),
      orientationNote:
        'Open side up, dovetail tongue on the bed. No supports. It slides onto the ledge along the front of the plate from either end.',
    });
  }

  const back = buildBackWall(m, d);
  if (back) {
    parts.push({
      id: 'backwall',
      name: 'Back wall',
      mesh: serialize(dropSlivers(m, back, SLIVER)),
      color: String(p.baseColor),
      // On its back, which is what turns every hook from a cantilever into a
      // post. Stood up the way it is used it is also a 4 mm slab 150 mm tall
      // with the weight of the fittings at the top -- a part that falls over
      // while it is being printed.
      orientation: [-90, 0, 0],
      orientationNote:
        'Print lying on its BACK, hooks pointing at the sky. No supports. Stood up the way it is used every hook is printed into mid-air. It is the LAST thing to go on: slide the modules in from behind first, then drop this into the slot across the back ledge.',
    });
  }

  const seen = new Map<string, number>();
  for (const bay of d.bays) {
    const n = (seen.get(bay.kind) ?? 0) + 1;
    seen.set(bay.kind, n);
    const many = d.bays.filter((b) => b.kind === bay.kind).length > 1;

    if (bay.kind === 'stand') {
      parts.push({
        id: `stand-${n}`,
        name: many ? `Phone stand ${n}` : 'Phone stand',
        mesh: serialize(dropSlivers(m, buildStand(m, d, bay), SLIVER)),
        color: String(p.standColor),
        // On its back. Stood up the way it is used, the leaning face is a
        // 75-degree overhang and the tabs are printed into mid-air.
        orientation: [-90, 0, 0],
        orientationNote:
          'Print lying on its BACK, not standing up. On its back every face is flat and the charger recess opens to the sky; upright, the leaning face is a 75-degree overhang. It drops into the shallow tray in the plate — there is nothing to slide or click, so lift it straight out.',
      });
      continue;
    }

    // On a desk every other module is part of the plate now, so there is
    // nothing here to hand out as a part of its own.
    if (!wall) continue;
    const solid = buildModule(m, d, bay);
    if (!solid) continue;
    parts.push({
      id: `${bay.kind}-${n}`,
      name: many ? `${partName(bay.kind)} ${n}` : partName(bay.kind),
      mesh: serialize(dropSlivers(m, solid, SLIVER)),
      color: String(p.moduleColor),
      orientationNote: wall
        ? 'Open side up, dovetail rail standing off its back. No supports. It slides onto the panel from one end.'
        : 'Open side up, dovetail foot on the bed. No supports.',
    });
  }

  // A ring threads nothing: the puck drops into the front of its own panel and
  // the lead comes out of the slot behind it with the plug still on the end.
  if (standBay(d) && d.standStyle !== 'ring' && (d.wireless || d.passthrough)) {
    issues.push({
      level: 'warn',
      message:
        'Thread the charger cable before the stand goes on: in at the back of the plate, along the channel underneath, up through the hole and into the back of the stand. Once the stand is dovetailed on, the hole is behind it.',
      paramIds: ['wireless', 'passthrough'],
    });
  }

  return { parts, issues, readouts: readouts(d) };
}

export const organizerGenerator: Generator = {
  id: 'organizer',
  name: 'Desk organizer',
  description:
    'A modular organizer: modules that slide on a dovetail, side by side on a desk plate or stacked as shelves on a wall panel. The phone stand lifts off — a leaning slab that takes a MagSafe puck, with two tabs to stand the phone on and the middle left open so a cable plugs straight into the port.',
  tagline: 'A desk set that comes apart, with the cable hidden',
  highlights: [
    'On the desk or on the wall — the same modules, docked on a different face',
    'Phone stand lifts off — leans back on a slab, tabs to stand on, open for the plug',
    'MagSafe pocket in the face and nothing on it: the cable feeds from behind',
    'The plate is sized by the modules, not the other way round',
  ],
  art: `<svg viewBox="0 0 120 96" role="img" aria-hidden="true">
    <rect x="8" y="70" width="104" height="12" rx="3" fill="#27408b"/>
    <rect x="14" y="36" width="20" height="34" rx="2.5" fill="#2f4fa3"/>
    <g fill="#1d2f66">
      <rect x="18" y="40" width="3" height="30"/><rect x="24" y="40" width="3" height="30"/>
      <rect x="30" y="40" width="3" height="30"/>
    </g>
    <path d="M42 70V30l26-9v40z" fill="#2f4fa3"/>
    <rect x="40" y="62" width="30" height="8" rx="2" fill="#27408b"/>
    <circle cx="55" cy="44" r="9" fill="#1d2f66"/>
    <rect x="78" y="30" width="28" height="40" rx="3" fill="#2f4fa3"/>
    <g stroke="#dfe4ee" stroke-width="3" stroke-linecap="round">
      <path d="M85 30V16M92 30V12M99 30V18"/>
    </g>
  </svg>`,
  params: organizerParams,
  groups: organizerGroups,
  validate,
  build,
  presets: [
    { label: 'Cards · stand · cup', values: {} },
    {
      label: 'Wide set — tray, stand, cup, cards',
      values: { slot1: 'tray', slot2: 'stand', slot3: 'cup', slot4: 'cards', depth: 110 },
    },
    {
      label: 'Hallway drop — wall, hooks, watch and change',
      values: {
        slot1: 'cards',
        slot2: 'tray',
        slot3: 'none',
        slot4: 'none',
        slot5: 'none',
        backWall: 150,
        keyHooks: 4,
        watchPost: true,
        coinShelf: 70,
        coinShelfDepth: 45,
        frontLedge: 'tray',
        frontDepth: 26,
        frontTrayHeight: 15,
      },
    },
    {
      label: 'Desk tidy — cards and a pen tray',
      values: {
        slot1: 'cards',
        slot2: 'pentray',
        slot3: 'none',
        slot4: 'none',
        slot5: 'none',
        // A pen tray is as wide as a pen is LONG, so it is the module that sets
        // how wide the whole set comes out -- and the only one that can push a
        // plate off a 256 bed by itself. This pairs it with the narrowest
        // module there is, for 204 mm. Putting the STAND beside it instead
        // comes to 253 and the plate no longer fits, which is the one
        // combination worth knowing about before you try it.
        penTrayWidth: 150,
        penTrayHeight: 18,
        penTrayLanes: 2,
        gap: 4,
      },
    },
    {
      label: 'Stand alone — leaning, with a MagSafe puck',
      values: { slot1: 'stand', slot2: 'none', slot3: 'none', wireless: true, margin: 10 },
    },
    {
      label: 'Compact — stand and cup',
      // A short panel and a low charger together. The puck has to be inside
      // an arc-topped panel, so a stand cut down cuts the charger down with
      // it -- lower the one without the other and the window comes out
      // through the shoulder.
      values: {
        slot1: 'stand',
        slot2: 'cup',
        slot3: 'none',
        depth: 90,
        standHeight: 100,
        puckHeight: 50,
        cupHeight: 70,
      },
    },
    {
      label: 'On the wall — stand over a tray',
      values: {
        form: 'wall',
        slot1: 'stand',
        slot2: 'tray',
        slot3: 'none',
        depth: 95,
        standHeight: 105,
        puckHeight: 55,
        trayHeight: 32,
        trayWidth: 120,
      },
    },
    {
      label: 'On the wall — valet, cards over a tray',
      values: {
        form: 'wall',
        slot1: 'cards',
        slot2: 'tray',
        slot3: 'none',
        depth: 85,
        trayHeight: 35,
        trayWidth: 140,
        cardsWidth: 140,
        cardsHeight: 55,
      },
    },
  ],
};
