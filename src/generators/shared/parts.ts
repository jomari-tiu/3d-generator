import type { Manifold } from 'manifold-3d';
import { serialize } from '../../core/kernel/serialize';
import type { Part } from '../../core/params/types';
import {
  buildClawChain, buildClawHub, buildTalon, buildTalonPin, clawLayout, talonOrientation, talonPinOrientation,
} from './claw';
import { buildFlight, buildStairFrame, stairLayout } from './stairs';

/*
 * The parts the stair tower and the ceiling claw add to whichever hangar
 * carries them, named and oriented the same in every one.
 */

/**
 * The stair tower's parts: its frame, standing, and each flight, on its side.
 * `tag` tells two towers apart when a model has more than one.
 */
export function addStairs(
  parts: Part[],
  m: Parameters<typeof buildStairFrame>[0],
  st: Parameters<typeof buildStairFrame>[1],
  frameColor: string,
  flightColor: string,
  tag?: string,
): void {
  const L = stairLayout(st);
  const id = tag ? `stair-${tag}` : 'stair';
  const name = tag ? `${tag[0]!.toUpperCase()}${tag.slice(1)} stair` : 'Stair';
  parts.push({
    id: `${id}-frame`,
    name: `${name} tower`,
    mesh: serialize(buildStairFrame(m, st)),
    color: frameColor,
    orientationNote: 'Print standing, as it stands: the landings bridge between their posts. Its sill drops into the slot in the floor.',
  });
  for (const f of L.flights) {
    parts.push({
      id: `${id}-flight-${f.index + 1}`,
      name: `${name} flight ${f.index + 1}`,
      mesh: serialize(buildFlight(m, st, f)),
      color: flightColor,
      orientation: [90, 0, 0],
      orientationNote: 'Print on its side, the handrail side down: the treads stand up off it. Its lip rests on the landing above and its pegs go into the landings.',
    });
  }
}

/** The ceiling claw's parts: chain, hub, three talons and their pins. */
export function addClaw(
  m: Parameters<typeof buildClawChain>[0],
  parts: Part[],
  spec: Parameters<typeof buildClawChain>[1],
  clawColor: string,
  chainColor: string,
  pinColor: string,
  printedPins: boolean,
): void {
  const L = clawLayout(spec);
  parts.push({
    id: 'claw-chain',
    name: 'Claw chain',
    mesh: serialize(buildClawChain(m, spec)),
    color: chainColor,
    orientation: [90, 0, 0],
    orientationNote: 'Print flat. The hook slides onto its bar from the side; the peg pushes into the claw.',
  });
  parts.push({
    id: 'claw-hub',
    name: 'Claw hub',
    mesh: serialize(buildClawHub(m, spec)),
    color: clawColor,
    orientation: [180, 0, 0],
    orientationNote: 'Print upside down, the lugs up.',
  });
  L.pivots.forEach((pv, i) => {
    const talon: Manifold = buildTalon(m, spec, i);
    parts.push({
      id: `claw-talon-${i}`,
      name: `Claw talon ${i + 1}`,
      mesh: serialize(talon),
      color: clawColor,
      orientation: talonOrientation(pv.azimuth),
      orientationNote: 'Print flat. It swings open and shut on its pin.',
    });
    if (printedPins) {
      parts.push({
        id: `claw-pin-${i}`,
        name: `Claw pin ${i + 1}`,
        mesh: serialize(buildTalonPin(m, spec, i)),
        color: pinColor,
        orientation: talonPinOrientation(pv.azimuth),
        orientationNote: 'Print standing on its head.',
      });
    }
  });
}
