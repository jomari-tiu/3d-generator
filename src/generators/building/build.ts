import type { Manifold } from 'manifold-3d';
import { dropSlivers } from '../../core/kernel/primitives';
import { serialize } from '../../core/kernel/serialize';
import type { BuildCtx, BuildResult, Generator, Issue, Params, Part } from '../../core/params/types';
import { missingCharacters } from '../../core/text/textSolid';
import { derive, ftIn, IN_MM, STANDARD_SCALES, type Derived } from './geometry';
import { depth, makePlan, width, type Plan } from './plan';
import { buildBase } from './parts/base';
import { claddingSize, claddingTooThin } from './parts/cladding';
import { balconyLimit } from './parts/facade';
import { buildRoof, roofScreenFits, roofScreenWanted } from './parts/roof';
import { buildRooftop, flatDeck, ROOFTOP_LABEL, ROOFTOP_MIN_FT, rooftopFits } from './parts/rooftop';
import { faceLen, faces, frontFace, windowCentres } from './parts/shape';
import { buildStorey } from './parts/storey';
import { risersFor, stairFit } from './parts/stairs';
import { buildingGroups, buildingParams } from './schema';

/**
 * Building miniature.
 *
 * The premise is that the model is a BUILDING, not a picture of one: it is
 * designed in feet and inches, it has slabs of a real thickness, its storeys
 * are a real height floor-to-floor, and the rooms inside are laid out by a plan
 * rather than drawn on. Everything the user types is a real-world dimension and
 * the scale divides it exactly once, in derive().
 *
 * The consequence that shapes the whole generator: at 1:144 a real building is
 * mostly made of things too thin to print. A 5 in partition is 0.88 mm, a 9 in
 * slab is 1.59 mm, and a 4 in partition does not exist. So every thickness is
 * floored at what the nozzle can lay down, and the readouts say what the printed
 * wall actually represents in real inches -- because the alternative is a model
 * that silently stops being to scale in the one dimension nobody measures.
 */

/** Smaller than this and it is trimming debris, not a part of the building. */
const SLIVER = 0.05;

/**
 * Millimetres between pieces on the plate. A storey is a big piece with walls
 * standing right at its edges, and at the packer's usual 3 mm two of them read
 * as one -- and a nozzle travelling past one wall can catch the next.
 */
const PLATE_GAP = 10;

/**
 * How many plates `count` parts of this size need, or Infinity when one will
 * not fit at all.
 *
 * Mirrors packPlate's shelf packing -- 5 mm margins, PLATE_GAP gaps -- rather than
 * comparing areas. Area says four 146 x 98 mm storeys fit a 256 mm bed with
 * room to spare; the shelf packer, correctly, gets two on and leaves two off.
 */
function platesFor(
  bed: readonly [number, number],
  partW: number,
  partD: number,
  count: number,
): number {
  const gap = PLATE_GAP;
  const usableX = bed[0] - 10;
  const usableY = bed[1] - 10;
  if (partW > usableX || partD > usableY) return Infinity;
  const perRow = Math.max(1, Math.floor((usableX + gap) / (partW + gap)));
  const rows = Math.max(1, Math.floor((usableY + gap) / (partD + gap)));
  return Math.ceil(count / (perRow * rows));
}

/** The nearest standard scale that would get the whole model onto one plate. */
function suggestScale(d: Derived, partW: number, partD: number, pieces: number): string {
  const fits = STANDARD_SCALES.filter((n) => n > d.scale).find(
    (n) => platesFor(d.bed, (partW * d.scale) / n, (partD * d.scale) / n, pieces) === 1,
  );
  return fits
    ? `1:${fits} would fit it on one plate.`
    : 'Use a smaller building, or fewer storeys.';
}

// ---------------------------------------------------------------- validation

function validate(p: Params): Issue[] {
  const d = derive(p);
  const issues: Issue[] = [];

  // --- can a storey exist at all
  const shortest = Math.min(...d.levelH);
  if (shortest - d.slabT < 2 * d.minWall) {
    issues.push({
      level: 'error',
      message: `A ${ftIn(Math.min(...d.levelFt))} storey at 1:${d.scale} is ${shortest.toFixed(2)} mm, and the slab alone takes ${d.slabT.toFixed(2)} mm of it. There is no wall left. Raise the floor height, thin the slab, or work at a larger scale.`,
      paramIds: ['floorHeight', 'slab', 'scale'],
    });
    return issues;
  }
  if (d.innerW < 4 * d.minWall || d.innerD < 4 * d.minWall) {
    issues.push({
      level: 'error',
      message: 'The exterior walls meet in the middle — there is no interior left. Make the building bigger or the walls thinner.',
      paramIds: ['width', 'depth', 'extWall'],
    });
    return issues;
  }
  if (d.shape === 'corner') {
    // The courtyard is what makes it an L. Wings that meet across it leave a
    // rectangle with a notch the width of a corridor cut out of it.
    const narrow = Math.min(d.widthFt, d.depthFt);
    if (d.wingFt > narrow - 6) {
      issues.push({
        level: 'error',
        message: `Wings ${ftIn(d.wingFt)} deep on a ${d.widthFt} x ${d.depthFt} ft building leave under 6 ft of courtyard between them — that is a rectangle, not an L. Make the wings shallower or the building bigger.`,
        paramIds: ['wing', 'width', 'depth'],
      });
      return issues;
    }
    if (d.wing - 2 * d.extT < 4 * d.minWall) {
      issues.push({
        level: 'error',
        message: 'The walls of each wing meet in the middle — there is no inside to the wings. Make the wings deeper or the walls thinner.',
        paramIds: ['wing', 'extWall'],
      });
      return issues;
    }
  }

  // --- storey height as a real building
  const typical = d.levelFt[d.floors - 1]!;
  if (typical < 8) {
    issues.push({
      level: 'warn',
      message: `${ftIn(typical)} floor to floor leaves ${ftIn(d.clearFt)} of clear ceiling, which is below habitable height almost everywhere. 8 to 10 ft is the real-world range.`,
      paramIds: ['floorHeight'],
    });
  } else if (typical > 16) {
    issues.push({
      level: 'warn',
      message: `${ftIn(typical)} floor to floor is a double-height space, not a storey. Fine if that is what you meant.`,
      paramIds: ['floorHeight'],
    });
  }

  // --- the scale/nozzle collision, which is the interesting one here
  const asIn = (mm: number) => (mm * d.scale) / IN_MM;
  if (d.partTScaled < d.minWall - 1e-9) {
    issues.push({
      level: 'warn',
      message: `A ${d.partTRealIn} in partition is ${d.partTScaled.toFixed(2)} mm at 1:${d.scale}, under the ${d.minWall.toFixed(2)} mm a ${d.nozzle} mm nozzle can lay. It is being printed ${d.partT.toFixed(2)} mm thick, which reads as a ${asIn(d.partT).toFixed(1)} in wall.`,
      paramIds: ['partition', 'nozzle', 'scale'],
    });
  }
  if (d.extTScaled < d.minWall - 1e-9) {
    issues.push({
      level: 'warn',
      message: `The exterior wall is being printed ${d.extT.toFixed(2)} mm instead of ${d.extTScaled.toFixed(2)} mm, so it reads as ${asIn(d.extT).toFixed(1)} in rather than ${d.extTRealIn} in.`,
      paramIds: ['extWall', 'nozzle', 'scale'],
    });
  }
  if (d.slabTScaled < d.minPlate - 1e-9) {
    issues.push({
      level: 'warn',
      message: `The floor slab is thinner than three layers at this scale, so it is being printed ${d.slabT.toFixed(2)} mm — a ${asIn(d.slabT).toFixed(0)} in slab. Thinner floors need a finer layer height, not a thinner slab.`,
      paramIds: ['slab', 'layer', 'scale'],
    });
  }

  const parapet = (d.roof === 'parapet' || d.roof === 'penthouse') && d.parapetH > 0;
  if (parapet && d.parapetTScaled < d.minWall - 1e-9) {
    issues.push({
      level: 'warn',
      message: `A ${d.parapetTRealIn} in parapet is ${d.parapetTScaled.toFixed(2)} mm at 1:${d.scale}, under the ${d.minWall.toFixed(2)} mm a ${d.nozzle} mm nozzle can lay. It is being printed ${d.parapetT.toFixed(2)} mm thick, which reads as a ${asIn(d.parapetT).toFixed(1)} in wall.`,
      paramIds: ['parapetWall', 'nozzle', 'scale'],
    });
  }

  // --- openings
  if (d.windows === 'punched' && d.pitch < d.winW + d.perFt) {
    issues.push({
      level: 'error',
      message: `Windows ${ftIn(d.winW / d.perFt)} wide at ${ftIn(d.pitch / d.perFt)} centres leave under a foot of pier between them. Widen the spacing or narrow the windows.`,
      paramIds: ['winPitch', 'winWidth'],
    });
  }
  if (d.windows !== 'none') {
    const head = Number(p.winSill) + Number(p.winHeight);
    if (head > d.clearFt - 0.5) {
      issues.push({
        level: 'warn',
        message: `The window head reaches ${ftIn(head)} in a ${ftIn(d.clearFt)} clear storey, so it is being cut down to fit under the slab. Lower the sill or the window.`,
        paramIds: ['winSill', 'winHeight', 'floorHeight'],
      });
    }
    if (
      d.windows === 'punched' &&
      faces(d).every((f) => f.blank || windowCentres(d, faceLen(f)).length === 0)
    ) {
      issues.push({
        level: 'warn',
        message: 'No window fits between the corner piers on any face, so the walls have come out blank. Narrow the windows or widen the building.',
        paramIds: ['winWidth', 'width', 'depth'],
      });
    }
    if (d.windows === 'ribbon' && !d.glazing) {
      issues.push({
        level: 'warn',
        message: `A ribbon window leaves the wall above it spanning ${(Math.max(d.W, d.D) - 2 * d.pier).toFixed(0)} mm unsupported. It will print, but the first layer over the opening will droop unless you slow it right down — or glaze the windows, which leaves a pane of wall for it to land on.`,
        paramIds: ['windows', 'glazing'],
      });
    }
    // The pane is wall left standing, so the wall has to be able to spare it.
    if (p.glazing === true && !d.glazing) {
      issues.push({
        level: 'warn',
        message: `A ${d.extT.toFixed(2)} mm exterior wall has no room for both a pane and a reveal deep enough to see, so the windows have been left as openings. Thicken the wall, or work at a larger scale.`,
        paramIds: ['glazing', 'extWall', 'scale'],
      });
    }
  }
  if (p.doorLeaves === true && !d.doorLeaves) {
    issues.push({
      level: 'warn',
      message: `A ${d.partT.toFixed(2)} mm partition has no room for a leaf at all, so the doorways have been left open. Thicken the partitions, or work at a larger scale.`,
      paramIds: ['doorLeaves', 'partition', 'scale'],
    });
  } else if (d.doorLeaves && d.leafOneSided && d.layout !== 'open') {
    issues.push({
      level: 'warn',
      message: `A ${d.partT.toFixed(2)} mm partition cannot take a reveal on both faces, so each door shows on one side only and is flush on the other. Thicker partitions, or a larger scale, give it both.`,
      paramIds: ['doorLeaves', 'partition', 'scale'],
    });
  }
  const frontLen = faceLen(frontFace(d));
  if (d.entrance && !d.openFront && d.entranceW > frontLen - 4 * d.extT) {
    issues.push({
      level: 'error',
      message: 'The entrance is nearly as wide as the building — there is no wall left either side of it.',
      paramIds: ['entranceWidth', 'width'],
    });
  }
  if (d.lintel && Number(p.doorHeight) > d.clearFt - 0.25) {
    issues.push({
      level: 'warn',
      message: `A ${ftIn(Number(p.doorHeight))} doorway in a ${ftIn(d.clearFt)} clear storey leaves no lintel. It is being cut down to the ceiling.`,
      paramIds: ['doorHeight', 'floorHeight'],
    });
  }

  // --- the facade this style asked for
  if (d.t.balconies && d.balconyD > balconyLimit(d)) {
    const what = d.shape === 'corner' ? `${ftIn(d.wingFt)} deep wing` : `${d.depthFt} ft deep building`;
    issues.push({
      level: 'warn',
      message: `A ${ftIn(d.balconyD / d.perFt)} balcony is more than 40% of a ${what}, so it has been held to ${ftIn(balconyLimit(d) / d.perFt)} — any deeper and the recess reaches the stair core.`,
      paramIds: ['balconyDepth', d.shape === 'corner' ? 'wing' : 'depth'],
    });
  }
  if (d.t.stripes && d.stripeCount * (d.stripeW + d.pier) > frontLen - 2 * d.pier) {
    issues.push({
      level: 'warn',
      message: `${d.stripeCount} stripes ${ftIn(d.stripeW / d.perFt)} wide do not fit across a ${d.widthFt} ft front with piers between them, so they are being narrowed. Use fewer, or a wider building.`,
      paramIds: ['stripes', 'stripeWidth', 'width'],
    });
  }
  if (d.t.chamfer && d.chamfer >= Math.min(d.W, d.D) / 2 - d.extT * 2) {
    issues.push({
      level: 'warn',
      message: 'The corner chamfers meet in the middle and have been held back. Reduce the chamfer or make the building wider.',
      paramIds: ['chamfer', 'width', 'depth'],
    });
  }
  if (d.t.ground === 'pilotis' || d.t.ground === 'frontPilotis') {
    if (windowCentres(d, frontLen).length === 0) {
      issues.push({
        level: 'warn',
        message: 'The open ground floor has no columns under it: the window spacing leaves no bay to stand one on. Reduce the window spacing.',
        paramIds: ['winPitch', 'width'],
      });
    }
    // The one member the whole model stands on, and the only one that is a
    // free cantilever off the slab. Two separate things can be wrong with it:
    // it can have been thickened away from scale, or it can still be too thin
    // for the nozzle. Both are said plainly, in the currency of the control
    // that fixes them.
    if (d.colSize > d.colSizeScaled + 1e-9) {
      issues.push({
        level: 'warn',
        message: `A column under a ${ftIn(d.levelFt[0]!)} ground storey would be ${(d.colH / d.colSizeScaled).toFixed(1)} times its own width, which snaps at the slab the first time the model is picked up by an upper floor. It is being printed ${d.colSize.toFixed(2)} mm square, which reads as a ${ftIn(d.colSize / d.perFt)} column rather than ${ftIn(d.colSizeScaled / d.perFt)}. A lower ground storey, or a larger scale, keeps it honest.`,
        paramIds: ['groundHeight', 'floorHeight', 'scale'],
      });
    }
    if (d.colSize < 5 * d.nozzle) {
      issues.push({
        level: 'warn',
        message: `The columns are ${d.colSize.toFixed(2)} mm square — about ${(d.colSize / d.nozzle).toFixed(1)} extrusions of a ${d.nozzle} mm nozzle — and they carry the whole building. Print them slowly with generous cooling, and expect to break one if the model is handled. A larger scale is the real fix.`,
        paramIds: ['scale', 'nozzle'],
      });
    }
    if (!d.shopfront) {
      issues.push({
        level: 'warn',
        message: `Nothing braces the columns: each is a free post ${(d.colH / d.colSize).toFixed(1)} times its own width, and the open ground floor is the only place this model stands on sticks. A glazed shopfront set back behind them ties them together and costs a millimetre of wall.`,
        paramIds: ['shopfront'],
      });
    }
  }

  // --- the plan, and what it had to give up
  const plan = makePlan(d);
  for (const note of plan.notes) {
    issues.push({ level: 'warn', message: note, paramIds: ['rooms', 'minRoom', 'coreWidth', 'coreDepth'] });
  }

  // --- what stands on the roof
  if (roofScreenWanted(d) && !roofScreenFits(d)) {
    issues.push({
      level: 'warn',
      message: 'A rooftop screen needs a flat roof to stand on, and this one is pitched or open, so the screen has been left off. Choose a flat roof, or put the screen on the facade.',
      paramIds: ['signPlace', 'roof'],
    });
  }
  if (flatDeck(d) && d.rooftop !== 'empty' && !rooftopFits(d, plan.core)) {
    issues.push({
      level: 'warn',
      message: `A ${ROOFTOP_LABEL[d.rooftop].toLowerCase()} needs about ${ROOFTOP_MIN_FT[d.rooftop]} ft of open deck across, and this roof does not have it once the parapet${d.roof === 'penthouse' ? ', the penthouse' : ''} and the plant room are allowed for. It has been left off. A bigger building, or a plain parapet roof, makes room.`,
      paramIds: ['rooftop', 'roof', 'width', 'depth'],
    });
  }

  // --- the wall finish, and what the printer made of it
  if (claddingTooThin(d)) {
    issues.push({
      level: 'warn',
      message: `A ${d.extT.toFixed(2)} mm wall has no room to cut joints into without breaking into the storey joint, so the walls have been left smooth. Thicker walls, or a larger scale, take the finish.`,
      paramIds: ['cladding', 'extWall', 'scale'],
    });
  }
  const clad = claddingSize(d);
  if (clad && clad.blowup > 1.05) {
    const trueAt = STANDARD_SCALES.filter((n) => n < d.scale)
      .reverse()
      .find((n) => (claddingSize(d, n)?.blowup ?? Infinity) <= 1.05);
    const what = clad.courseTrue > 0 ? `a ${clad.label} course is ${clad.courseTrue.toFixed(2)} mm` : `a ${clad.label} is too narrow`;
    issues.push({
      level: 'warn',
      message: `At 1:${d.scale} ${what} — finer than a ${d.layer} mm layer and a ${d.nozzle} mm nozzle can draw a joint round — so the pattern is drawn ${clad.blowup.toFixed(1)} times real size to keep its joints printable.${trueAt ? ` At 1:${trueAt} it prints true to scale.` : ''}`,
      paramIds: ['cladding', 'scale'],
    });
  }

  // --- stairs
  if (plan.core && d.stairs !== 'none') {
    const fit = stairFit(d, plan.core, d.levelFt[0]!);
    if (!fit.ok) {
      const other = d.stairs === 'straight' ? 'A switchback needs far less run — try that first.' : 'Deepen the core, or lower the storey height so it needs fewer risers.';
      issues.push({
        level: 'warn',
        message: `A ${d.stairs} stair climbing ${ftIn(d.levelFt[0]!)} needs ${(fit.needs / d.perFt).toFixed(1)} ft of run in a core that is ${(fit.has / d.perFt).toFixed(1)} ft long, and ${(fit.needsCross / d.perFt).toFixed(1)} ft across where there is ${(fit.hasCross / d.perFt).toFixed(1)} ft. The shafts have been left empty. ${other}`,
        paramIds: ['stairs', 'coreDepth', 'coreWidth', 'floorHeight'],
      });
    }
  }

  if (d.split === 'storeys' && d.joint === 'none' && d.floors > 1) {
    issues.push({
      level: 'warn',
      message: 'Nothing joins the storeys, so they will slide on each other and the stack is held square by friction alone.',
      paramIds: ['joint'],
    });
  }
  if (d.split === 'storeys' && String(p.joint) === 'tongue' && d.joint === 'pins') {
    issues.push({
      level: 'warn',
      message: `A ${d.extT.toFixed(2)} mm wall and a ${d.slabT.toFixed(2)} mm slab have no room for a tongue and its groove, so the storeys key with pins instead. Thicker walls, or a larger scale, get the better joint.`,
      paramIds: ['joint', 'extWall', 'slab', 'scale'],
    });
  }

  // --- will it come off the bed
  //
  // Scale is the one control that changes every dimension at once, so this is
  // where a scale choice actually bites: the same building that fits four to a
  // plate at 1:144 needs three plates at 1:100. Predicted here, and named in
  // the currency the control is in -- a standard scale, never 1:137.
  const pitched = d.roof === 'gable' || d.roof === 'hip';
  // What stands proud of the walls on every storey: a band. (The shop canopy is
  // on one storey only, and the app packs the real pieces and says so if that
  // one spills over.) On a pitched roof the eaves may be wider still. On a
  // corner building it is trimmed flush on the shelf side, so it counts once.
  const proud = d.bandProj;
  const sides = d.shape === 'corner' ? 1 : 2;
  const partW = d.W + sides * (pitched ? Math.max(d.eaves, proud) : proud);
  const partD = d.D + sides * (pitched ? Math.max(d.eaves, proud) : proud);
  const pieces = d.split === 'storeys' ? d.floors + (d.roof === 'none' ? 0 : 1) : 1;
  const plates = platesFor(d.bed, partW, partD, pieces);

  if (plates === Infinity) {
    issues.push({
      level: 'warn',
      message: `A single storey is ${partW.toFixed(0)} x ${partD.toFixed(0)} mm, which is larger than the ${d.bed[0]} x ${d.bed[1]} mm plate on its own. ${suggestScale(d, partW, partD, pieces)}`,
      paramIds: ['scale', 'width', 'depth'],
    });
  } else if (plates > 1) {
    issues.push({
      level: 'warn',
      message: `At 1:${d.scale} the ${pieces} pieces need ${plates} plates on the ${d.bed[0]} x ${d.bed[1]} mm bed, and only one is laid out at a time. ${suggestScale(d, partW, partD, pieces)}`,
      paramIds: ['scale', 'floors'],
    });
  }

  return issues;
}

// ------------------------------------------------------------------ readouts

/**
 * The model's true overall size, measured off the parts that were built.
 *
 * Measured, not computed. `roofZ` is the roof DECK level -- the top of the top
 * storey -- and W and D are the walls. None of the three is the size of the
 * thing: a parapet, a 13 ft stair tower and a floor band standing 6 in proud of
 * the wall are all outside them. Reporting roofZ as the model height said 60 mm
 * for a model that measures 89, and disagreed with the size on the viewport,
 * which is exactly the kind of contradiction that makes someone doubt the
 * scale itself.
 */
function overallSize(parts: readonly Part[]): [number, number, number] | null {
  if (parts.length === 0) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) {
    for (let a = 0; a < 3; a++) {
      const offset = part.assembly?.[a] ?? 0;
      min[a] = Math.min(min[a]!, part.mesh.bbox.min[a]! + offset);
      max[a] = Math.max(max[a]!, part.mesh.bbox.max[a]! + offset);
    }
  }
  return [max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!];
}

const SCREEN_WORDS: Readonly<Record<Derived['signStyle'], string>> = {
  framed: 'framed blank billboard',
  slim: 'slim screen',
  tiled: 'tiled video wall',
};

const CLADDING_WORDS:Readonly<Record<Derived['cladding'], string>> = {
  smooth: '',
  brick: 'brick walls',
  stone: 'ashlar stone walls',
  siding: 'lap siding',
  batten: 'board and batten',
  panels: 'precast panels',
};

function readouts(d: Derived, plan: Plan, parts: readonly Part[] = []): Record<string, string> {
  const m2 = (ft: number) => (ft * 0.3048).toFixed(1);
  // What was BUILT, not what the style nominally has. A cutaway takes the front
  // wall away and with it every feature that was standing on it, and a readout
  // that still listed the entrance canopy would be describing a canopy that is
  // not there.
  const flat = d.roof === 'flat' || d.roof === 'parapet' || d.roof === 'railing';
  const front = !d.openFront;
  const clad = claddingSize(d);
  const facade = [
    front && d.t.balconies ? 'balconies' : '',
    d.t.bands === 'floor' ? 'floor bands' : d.t.bands === 'spandrel' ? 'spandrels' : '',
    d.t.mullions && d.windows === 'ribbon' ? 'mullions' : '',
    front && d.t.stripes ? `${d.stripeCount} glazed stripes` : '',
    d.chamfer > 0 ? 'chamfered corners' : '',
    d.t.ground === 'pilotis' ? 'on columns' : '',
    front && d.t.ground === 'frontPilotis' ? 'open front at ground' : '',
    d.t.ground === 'course' ? 'base course' : '',
    d.shopfront && (d.t.ground === 'pilotis' || (front && d.t.ground === 'frontPilotis'))
      ? 'glazed shopfront'
      : '',
    d.glazing ? 'glazed openings' : '',
    d.doorLeaves ? 'hung doors' : '',
    d.t.sign && d.signPlace === 'facade' && front && d.floors > 1
      ? `${SCREEN_WORDS[d.signStyle]} up the front`
      : '',
    roofScreenFits(d) ? `${SCREEN_WORDS[d.signStyle]} on the roof` : '',
    front && d.t.canopy ? 'entrance canopy' : '',
    d.t.tower && d.bulkhead && flat && plan.core && d.rooftop !== 'helipad' ? 'stair tower' : '',
    d.roof === 'penthouse' ? 'rooftop penthouse' : '',
    d.t.screen && (d.roof === 'parapet' || d.roof === 'penthouse') ? 'louvred parapet' : '',
    d.t.panes && d.windows === 'punched' ? 'paned windows' : '',
    d.t.trim && d.windows === 'punched' ? 'window surrounds and sills' : '',
    front && d.t.fascia && d.t.ground === 'shop' ? 'shop sign board' : '',
    front && d.t.blades && d.floors > 1 ? 'blade signs' : '',
    d.t.cornice && (flat || d.roof === 'penthouse') ? 'cornice' : '',
    front && d.t.ground === 'shop' ? 'glazed shop bays' : '',
    d.t.awning && d.floors > 1 ? 'shop canopy' : '',
    d.roof === 'railing' ? 'roof guard rail' : '',
    clad
      ? `${CLADDING_WORDS[d.cladding]}${clad.blowup > 1.05 ? ` (drawn ${clad.blowup.toFixed(1)}x real size)` : ''}`
      : '',
    flatDeck(d) && d.rooftop !== 'empty' && rooftopFits(d, plan.core)
      ? ROOFTOP_LABEL[d.rooftop].toLowerCase()
      : '',
    d.roof === 'none' ? 'open top' : '',
  ].filter(Boolean);

  const out: Record<string, string> = {
    Type: facade.length > 0 ? `${d.t.label} — ${facade.join(', ')}` : d.t.label,
    // Both readings, because the choice spans both conventions: 1:144 is a
    // twelfth of an inch to the foot and 1:100 is a centimetre to the metre,
    // and whichever one you think in, the other number is the one you cannot
    // do in your head.
    Scale: `1:${d.scale} — 1 ft = ${d.perFt.toFixed(2)} mm, 1 m = ${(1000 / d.scale).toFixed(2)} mm`,
    Building: `${d.widthFt} x ${d.depthFt} ft (${m2(d.widthFt)} x ${m2(d.depthFt)} m)${d.shape === 'corner' ? `, L-shaped for the ${d.mirror ? 'right' : 'left'}-hand shelf corner with ${ftIn(d.wingFt)} wings` : ''}, ${d.floors} storey${d.floors === 1 ? '' : 's'}, ${ftIn(d.heightFt)} to the roof`,
    Model: (() => {
      const box = overallSize(parts);
      const walls = `walls ${d.W.toFixed(1)} x ${d.D.toFixed(1)} x ${d.roofZ.toFixed(1)} mm to the roof deck`;
      return box
        ? `${box[0].toFixed(1)} x ${box[1].toFixed(1)} x ${box[2].toFixed(1)} mm overall — ${walls}`
        : walls;
    })(),
    Storey: `${ftIn(d.levelFt[d.floors - 1]!)} floor to floor = ${d.levelH[d.floors - 1]!.toFixed(2)} mm, ${ftIn(d.clearFt)} clear`,
    Structure: `Walls ${d.extT.toFixed(2)} mm (${d.extTRealIn} in) · partitions ${d.partT.toFixed(2)} mm (${d.partTRealIn} in) · slab ${d.slabT.toFixed(2)} mm (${d.slabTRealIn} in)`,
  };

  // Rooms excluding the core, which is a shaft rather than a room you use.
  const rooms = plan.rooms;
  if (rooms.length > 0) {
    const smallest = rooms.reduce((a, b) =>
      width(a) * depth(a) <= width(b) * depth(b) ? a : b,
    );
    const floorArea = rooms.reduce((sum, r) => sum + width(r) * depth(r), 0) / (d.perFt * d.perFt);
    out['Rooms'] = `${rooms.length} per floor, smallest ${(width(smallest) / d.perFt).toFixed(0)} x ${(depth(smallest) / d.perFt).toFixed(0)} ft · ${Math.round(floorArea)} sq ft of floor`;
  }
  if (plan.core) {
    out['Core'] = `${(width(plan.core) / d.perFt).toFixed(1)} x ${(depth(plan.core) / d.perFt).toFixed(1)} ft shaft`;
  }
  // The columns get a line of their own because they are the only members
  // carrying the model rather than describing it, and because the printed size
  // is not always the real one.
  if (d.t.ground === 'pilotis' || d.t.ground === 'frontPilotis') {
    const n = faces(d)
      .filter((f) => !f.blank && (d.t.ground === 'pilotis' || f.front))
      .reduce((sum, f) => sum + windowCentres(d, faceLen(f)).length, 0);
    out['Columns'] = `${n} at ${d.colSize.toFixed(2)} mm square (${ftIn(d.colSize / d.perFt)}), ${d.colH.toFixed(1)} mm clear — ${(d.colH / d.colSize).toFixed(1)} to 1${d.shopfront ? ', braced by the shopfront' : ', unbraced'}`;
  }
  if (plan.core && d.stairs !== 'none' && stairFit(d, plan.core, d.levelFt[0]!).ok) {
    const n = risersFor(d, d.levelFt[0]!);
    out['Stairs'] = `${n} risers at ${((d.levelFt[0]! * 12) / n).toFixed(2)} in, ${d.treadIn} in going, ${d.stairs}`;
  }

  if (d.windows === 'punched') {
    const size = `${ftIn(d.winW / d.perFt)} x ${ftIn(d.winH / d.perFt)} at ${ftIn(d.pitch / d.perFt)} centres`;
    if (d.shape === 'corner') {
      const n = faces(d)
        .filter((f) => !f.blank)
        .reduce((sum, f) => sum + windowCentres(d, faceLen(f)).length, 0);
      out['Windows'] = `${n} per floor on the four open faces, none on the two shelf walls — ${size}`;
    } else {
      const front = windowCentres(d, d.W).length;
      const side = windowCentres(d, d.D).length;
      out['Windows'] = `${front} front and back, ${side} each side — ${size}`;
    }
  }

  const pieces = d.split === 'storeys' ? d.floors + (d.roof === 'none' ? 0 : 1) : 1;
  const extra = [
    flatDeck(d) && d.rooftop !== 'empty' && rooftopFits(d, plan.core) ? 'rooftop' : '',
    d.base ? 'plinth' : '',
  ].filter(Boolean);
  out['Prints as'] = `${pieces} piece${pieces === 1 ? '' : 's'}${extra.map((e) => ` + ${e}`).join('')}`;
  return out;
}

// --------------------------------------------------------------------- build

function build(p: Params, ctx: BuildCtx): BuildResult {
  const { m } = ctx;
  const d = derive(p);

  const blocking = validate(p);
  if (blocking.some((i) => i.level === 'error')) {
    return { parts: [], issues: blocking, readouts: readouts(d, makePlan(d)) };
  }
  const issues: Issue[] = [];

  const plan = makePlan(d);
  // The lobby is a variant of the SAME plan -- see makePlan -- so the core and
  // the stairwell above it stay over one another.
  const ground = d.groundOpen ? makePlan(d, true) : plan;

  // Everything is built for the left-hand shelf corner; the right-hand one is
  // its mirror image, taken once here rather than threaded through every part.
  const place = (s: Manifold): Manifold => (d.mirror ? s.mirror([1, 0, 0]) : s);

  const storeys: Manifold[] = [];
  for (let i = 0; i < d.floors; i++) {
    storeys.push(place(buildStorey(m, d, i === 0 ? ground : plan, i).solid));
  }
  const rawRoof = buildRoof(m, d, plan.core);
  const roof = rawRoof ? place(rawRoof) : null;
  // Its own part, so it can take its own colour; trimmed off the roof it is
  // rooted into, the same way the plinth label is, so the two do not overlap.
  const rawTop = buildRooftop(m, d, plan.core);
  const rooftop = rawTop && rawRoof ? place(rawTop.subtract(rawRoof)) : null;

  const parts: Part[] = [];
  const wallColor = String(p.wallColor);
  const roofGroup = d.split === 'single' ? 'building' : 'roof';

  if (d.split === 'single') {
    // Grouped with the roof: it is one printed object in two colours, and the
    // packer keeps grouped parts in their relative positions so the roof does
    // not get laid out beside the building it is supposed to be sitting on.
    parts.push({
      id: 'building',
      name: 'Building',
      mesh: serialize(dropSlivers(m, m.Manifold.union(storeys), SLIVER)),
      color: wallColor,
      group: 'building',
      orientationNote:
        'Prints as it stands, ground floor on the bed. Every window head is a short bridge and every wall leans on the one below it, so it needs no supports — but the rooms inside are sealed once it is printed.',
    });
    if (roof) {
      parts.push({
        id: 'roof',
        name: 'Roof',
        mesh: serialize(dropSlivers(m, roof, SLIVER)),
        color: String(p.roofColor),
        group: 'building',
        orientationNote: 'A filament change at this height gives the roof its own colour.',
      });
    }
  } else {
    for (const [i, solid] of storeys.entries()) {
      parts.push({
        id: `storey-${i}`,
        name: i === 0 ? 'Ground floor' : `Floor ${i}`,
        mesh: serialize(dropSlivers(m, solid, SLIVER)),
        color: wallColor,
        orientationNote:
          i === 0
            ? 'Slab down on the bed, walls up. Print every storey this way and stack them in order.'
            : d.joint === 'tongue'
              ? 'Slab down. The groove round its underside drops over the tongue on the walls below.'
              : d.joint === 'pins'
                ? 'Slab down. The sockets in its underside drop over the pins on the storey below.'
                : 'Slab down. Nothing keys it to the storey below, so line it up by eye.',
      });
    }
    if (roof) {
      parts.push({
        id: 'roof',
        name: 'Roof',
        mesh: serialize(dropSlivers(m, roof, SLIVER)),
        color: String(p.roofColor),
        // Grouped only so the rooftop part stays sitting on it.
        group: rooftop ? roofGroup : undefined,
        orientationNote:
          d.roof === 'gable' || d.roof === 'hip'
            ? 'Deck down on the bed. The slopes lean inward the whole way, so the shell self-supports and only the ridge bridges.'
            : 'Deck down on the bed.',
      });
    }
  }

  if (rooftop && d.rooftop !== 'empty') {
    parts.push({
      id: 'rooftop',
      name: ROOFTOP_LABEL[d.rooftop],
      mesh: serialize(dropSlivers(m, rooftop, SLIVER)),
      color: String(p.rooftopColor),
      group: roofGroup,
      orientationNote:
        d.rooftop === 'watertank'
          ? 'Prints on the roof deck. The tank platform bridges between its legs, so slow the bridging down; a filament change at the deck gives it its own colour.'
          : 'Prints on the roof deck. A filament change just above the deck gives it its own colour.',
    });
  }

  if (d.base) {
    const fontId = String(p.baseFont);
    if (d.baseText.length > 0) {
      const missing = missingCharacters(ctx.font(fontId), d.baseText);
      if (missing.length > 0) {
        issues.push({
          level: 'warn',
          message: `This font has no glyph for ${missing.map((c) => `"${c}"`).join(', ')} — those would print as boxes.`,
          paramIds: ['baseFont', 'baseName'],
        });
      }
    }
    const base = buildBase(ctx, d, fontId);
    parts.push({
      id: 'plinth',
      name: 'Plinth',
      mesh: serialize(base.plinth),
      color: String(p.baseColor),
      group: 'base',
      orientationNote: 'Flat on the bed, label up. A separate print from the building.',
    });
    if (base.label) {
      const trimmed = dropSlivers(m, base.label.subtract(base.plinth), SLIVER);
      if (trimmed.volume() > 0.2) {
        parts.push({
          id: 'label',
          name: 'Plinth label',
          mesh: serialize(trimmed),
          color: String(p.labelColor),
          group: 'base',
          orientationNote: 'Raised on the plinth. A filament change at that layer gives it its own colour.',
        });
      }
    } else if (d.baseText.length > 0) {
      issues.push({
        level: 'warn',
        message: 'There is no room on the plinth margin for a label this size, so it has been left off. Widen the margin or shrink the label.',
        paramIds: ['baseMargin', 'baseNameSize'],
      });
    }
  }

  return { parts, issues, readouts: readouts(d, plan, parts) };
}

export const buildingGenerator: Generator = {
  id: 'building',
  name: 'Building miniature',
  description:
    'A scale-model building with real floor slabs, storey heights and rooms inside. Designed in feet and inches, printed in millimetres.',
  tagline: 'A building at 1:144, floors and rooms and all',
  highlights: [
    'Designed in real feet and inches — the scale divides once',
    'Real slabs and 8-to-10 ft storeys, with the clear ceiling reported',
    'Rooms laid out by plan: subdivided, corridor, or open',
    'Stair core with switchback or straight flights through every floor',
    'Prints as a stack of storeys you can lift apart to see inside',
    'An L-shaped plan that fits the inside corner of a shelf',
    'Brick, stone, siding or panel walls; a helipad, garden or plant on the roof',
  ],
  art: `<svg viewBox="0 0 120 96" role="img" aria-hidden="true">
    <defs>
      <linearGradient id="bl-w" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#efe9dd"/><stop offset="1" stop-color="#ddd5c5"/>
      </linearGradient>
    </defs>
    <rect x="18" y="20" width="84" height="66" fill="url(#bl-w)"/>
    <rect x="14" y="14" width="92" height="7" rx="1.5" fill="#5b6672"/>
    <g fill="#2f3a45">
      <rect x="26" y="27" width="10" height="9"/><rect x="43" y="27" width="10" height="9"/>
      <rect x="60" y="27" width="10" height="9"/><rect x="77" y="27" width="10" height="9"/>
      <rect x="26" y="47" width="10" height="9"/><rect x="43" y="47" width="10" height="9"/>
      <rect x="60" y="47" width="10" height="9"/><rect x="77" y="47" width="10" height="9"/>
    </g>
    <g stroke="#b9ae99" stroke-width="2.5" fill="none">
      <path d="M18 41h84M18 61h84"/>
    </g>
    <g stroke="#b9ae99" stroke-width="2" fill="none" opacity=".85">
      <path d="M40 61v25M40 74h28M68 61v25"/>
    </g>
    <rect x="52" y="70" width="16" height="16" fill="#2f3a45"/>
    <rect x="14" y="86" width="92" height="6" rx="1.5" fill="#2b2f33"/>
  </svg>`,
  params: buildingParams,
  plateGap: PLATE_GAP,
  groups: buildingGroups,
  fontsNeeded: (p) =>
    p.base === true && String(p.baseName).trim().length > 0 ? [String(p.baseFont)] : [],
  validate,
  build,
  presets: [
    {
      label: 'Apartment block, 1:144',
      values: {
        style: 'apartment', width: 40, depth: 34, floors: 5, floorHeight: 9,
        winWidth: 3, winHeight: 4, winPitch: 8, core: true, coreWidth: 11, coreDepth: 13,
        balconyDepth: 6, balconyWidth: 64, roof: 'parapet', parapet: 3,
        wallColor: '#dcdcd6', roofColor: '#c9c9c2',
      },
    },
    {
      label: 'Office slab, 1:144',
      values: {},
    },
    {
      // The old city corner block of the reference photo: blue lap siding,
      // shops along the street under a sign board, tall paned windows in white
      // surrounds, blade signs at the ends, a cornice, and the billboard up on
      // its steel tower on the roof. Five pieces, one plate.
      label: 'Commercial: corner shop block, 1:144',
      values: {
        style: 'commercial', width: 36, depth: 30, floors: 4, floorHeight: 10, tallGround: true,
        groundHeight: 13, entranceWidth: 4, entranceHeight: 8.5, winWidth: 3, winHeight: 5.5,
        winSill: 2.5, winPitch: 6.5, glazing: true, coreDepth: 13, minRoom: 6, cladding: 'siding',
        roof: 'parapet', parapet: 3, signPlace: 'roof', signMount: 'frame', signLift: 10,
        signHeight: 13, signWidth: 28, signStyle: 'framed',
        wallColor: '#4e7da3', roofColor: '#4a4d52',
      },
    },
    {
      label: 'Ribbon block, 1:144',
      values: {
        signPlace: 'facade',
        style: 'ribbon', width: 54, depth: 40, floors: 7, floorHeight: 10,
        tallGround: true, groundHeight: 14, winHeight: 5, winSill: 3, chamfer: 8,
        signWidth: 15, roof: 'penthouse', parapet: 4, penthouseHeight: 10, glazing: true,
        wallColor: '#b4483f', roofColor: '#8d9298',
      },
    },
    {
      label: 'Curtain-wall office, 1:144',
      values: {
        style: 'curtain', width: 56, depth: 40, floors: 6, floorHeight: 10,
        tallGround: true, groundHeight: 14, winWidth: 4, winHeight: 5, winPitch: 8,
        stripes: 2, stripeWidth: 9, roof: 'parapet', parapet: 6,
        wallColor: '#d9a173', roofColor: '#6e6e6a',
      },
    },
    {
      label: 'Terraced house, 1:144',
      values: {
        style: 'plain', width: 22, depth: 30, floors: 2, floorHeight: 8.5, layout: 'rooms', rooms: 4,
        minRoom: 8, core: false, roof: 'gable', roofPitch: 38, windows: 'punched',
        winWidth: 3, winPitch: 7, entranceWidth: 3.5, groundOpen: false, balconyWidth: 45,
        cladding: 'brick', wallColor: '#c98b6b', roofColor: '#4a4038',
      },
    },
    // ---- Modern city buildings, after the white model-railway kits. Shared:
    // white walls, glazed openings, a light roof. Each differs where the real
    // ones do -- the ground floor, the windows and the roof.
    {
      // Low block over a row of open garage bays on columns, guard rail round
      // the roof.
      label: 'Modern: garage block',
      values: {
        style: 'modern', width: 44, depth: 30, floors: 3, floorHeight: 9.5, tallGround: true,
        groundHeight: 11, groundFloor: 'frontPilotis', shopfront: 'open', winWidth: 4, winHeight: 4,
        winSill: 3, winPitch: 9, glazing: true, entrance: false, coreWidth: 8, coreDepth: 12, minRoom: 6, roof: 'railing', parapet: 3.5,
        wallColor: '#efefeb', roofColor: '#dcdcd6',
      },
    },
    {
      // Notched-corner tower: wide banded windows on both arms, the entrance
      // in the corner under a canopy.
      label: 'Modern: notched-corner tower',
      values: {
        style: 'modern', footprint: 'corner', width: 34, depth: 32, wing: 17, floors: 7,
        floorHeight: 9.5, winWidth: 7, winHeight: 4.5, winSill: 3, winPitch: 9, glazing: true,
        entranceWidth: 5, entranceHeight: 8.5, awningDepth: 2.5, coreWidth: 7, coreDepth: 11, rooms: 3,
        roof: 'parapet', parapet: 2.5, wallColor: '#ececea', roofColor: '#d8d8d4',
      },
    },
    {
      // Slim tower: one wide paned window a floor, a guard rail and a stair
      // head on the roof.
      label: 'Modern: slim tower',
      values: {
        style: 'modern', width: 24, depth: 30, floors: 7, floorHeight: 9.5, winWidth: 9,
        winHeight: 4, winSill: 3, winPitch: 12, glazing: true, minRoom: 6, coreWidth: 7,
        coreDepth: 10, entranceWidth: 5, awningDepth: 2, roof: 'railing', parapet: 3.5,
        bulkhead: true, wallColor: '#eeeeea', roofColor: '#d9d9d4',
      },
    },
    {
      // Panelled tower with a stepped top: a grid of square windows on precast
      // panels, and a set-back storey on the roof.
      label: 'Modern: stepped panel tower',
      values: {
        style: 'modern', width: 34, depth: 30, floors: 6, floorHeight: 9.5, winWidth: 3,
        winHeight: 3.5, winSill: 3, winPitch: 5, panes: 'off', glazing: true, cladding: 'panels',
        groundFloor: 'shop', awningDepth: 1.5, roof: 'penthouse', parapet: 2, penthouseHeight: 9,
        wallColor: '#ededea', roofColor: '#dadad6',
      },
    },
    {
      // Arcade tower: the ground floor open under the front on columns with
      // glazing behind, paned window bands above, a plant box on the roof.
      label: 'Modern: arcade tower',
      values: {
        style: 'modern', width: 32, depth: 30, floors: 6, floorHeight: 9.5, tallGround: true,
        groundHeight: 12, groundFloor: 'frontPilotis', shopfront: 'glazed', winWidth: 7,
        winHeight: 4, winSill: 3, winPitch: 10, glazing: true, coreWidth: 8, coreDepth: 13, minRoom: 6,
        roof: 'parapet', parapet: 2, bulkhead: true, wallColor: '#efeeea', roofColor: '#d9d8d3',
      },
    },
    {
      // Shop block: paned windows over glazed shop bays under a thin canopy,
      // a guard rail round the roof. Four pieces to a plate.
      label: 'Modern: shop block',
      values: {
        style: 'modern', width: 40, depth: 30, floors: 3, floorHeight: 10, tallGround: true,
        groundHeight: 12, winWidth: 5, winHeight: 5, winSill: 2.5, winPitch: 8, glazing: true,
        entranceWidth: 6, entranceHeight: 9, awningDepth: 3, coreWidth: 9, coreDepth: 13, minRoom: 6,
        roof: 'railing', parapet: 3.5, bulkhead: true,
        wallColor: '#eeede8', roofColor: '#d6d5cf',
      },
    },
    {
      // Townhouse with arched shop windows: three storeys on a deep plot,
      // round-headed bays with fanlights at the ground floor.
      label: 'Modern: arched townhouse',
      values: {
        style: 'modern', width: 28, depth: 36, floors: 3, floorHeight: 10, tallGround: true,
        groundHeight: 13, winWidth: 3.5, winHeight: 5, winSill: 2.5, winPitch: 6.5, glazing: true,
        archedShops: true, entranceWidth: 4, entranceHeight: 10, awningDepth: 1, core: false,
        rooms: 4, roof: 'flat', wallColor: '#e3ebe8', roofColor: '#d3dbd8',
      },
    },
    {
      // Office tower with a glazed stripe running its full height, paned
      // punched windows either side, on a stone base.
      label: 'Modern: glazed-stripe tower',
      values: {
        style: 'curtain', width: 40, depth: 30, floors: 8, floorHeight: 9.5, panes: 'on',
        winWidth: 4, winHeight: 4.5, winSill: 3, winPitch: 7, glazing: true, stripes: 1,
        stripeWidth: 5, roof: 'parapet', parapet: 2.5, wallColor: '#ecebe7', roofColor: '#d7d6d1',
      },
    },
    {
      // L-shaped tower on precast panels, the entrances under canopies in the
      // courtyard.
      label: 'Modern: L-shaped tower',
      values: {
        style: 'modern', footprint: 'corner', width: 40, depth: 36, wing: 17, floors: 6,
        floorHeight: 9.5, winWidth: 4, winHeight: 4.5, winSill: 3, winPitch: 7, glazing: true,
        entranceWidth: 5, entranceHeight: 8.5, awningDepth: 3, coreWidth: 7, coreDepth: 11, rooms: 5,
        cladding: 'panels', roof: 'railing', parapet: 3.5,
        wallColor: '#e9ece8', roofColor: '#cfd3cf',
      },
    },
    {
      // Sized to go four pieces to a plate: three storeys and the roof, each
      // about 100 x 85 mm at 1:144.
      label: 'Shelf-corner apartments, 1:144',
      values: {
        style: 'apartment', footprint: 'corner', cornerSide: 'left', width: 48, depth: 40, wing: 18,
        floors: 3, floorHeight: 9, winWidth: 3, winHeight: 4, winPitch: 8, coreWidth: 8, coreDepth: 11,
        balconyDepth: 5, balconyWidth: 60, roof: 'parapet', parapet: 3, rooftop: 'garden',
        cladding: 'brick', wallColor: '#b5694f', roofColor: '#8f8a82', rooftopColor: '#5f7d4a',
      },
    },
    {
      label: 'Tower, 1:200',
      values: {
        style: 'office', scale: 200, width: 90, depth: 60, floors: 12, floorHeight: 10, tallGround: true,
        groundHeight: 16, layout: 'corridor', corridorWidth: 6, rooms: 10,
        core: true, coreDepth: 22, windows: 'ribbon', winHeight: 6, winSill: 2.5,
        roof: 'parapet', rooftop: 'helipad', cladding: 'panels',
        wallColor: '#9aa4ad', roofColor: '#3a424b', rooftopColor: '#c9ccc4',
      },
    },
    {
      label: 'Cutaway dolls’ house',
      values: {
        style: 'plain', width: 34, depth: 26, floors: 3, floorHeight: 9, openFront: true, core: true,
        coreWidth: 8, coreDepth: 12, stairs: 'straight', rooms: 4, minRoom: 8,
        groundOpen: false, roof: 'hip', roofPitch: 34, base: true, baseName: '',
      },
    },
    {
      label: 'Warehouse shell',
      values: {
        style: 'plain', width: 120, depth: 70, floors: 1, floorHeight: 20, scale: 200, layout: 'open',
        core: false, windows: 'ribbon', winHeight: 8, winSill: 9, roof: 'gable',
        roofPitch: 14, eaves: 2, entranceWidth: 16, entranceHeight: 14,
        wallColor: '#b6bcc2', roofColor: '#7d848b',
      },
    },
  ],
};
