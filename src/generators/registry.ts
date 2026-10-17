import type { Generator } from '../core/params/types';
import { buildingGenerator } from './building/build';
import { drawerOrganizerGenerator } from './drawer/build';
import { hangarGenerator } from './hangar/build';
import { imageTraceGenerator } from './imagetrace/build';
import { keyClickerGenerator } from './keyclicker/build';
import { msCageGenerator } from './mscage/build';
import { flexiNameGenerator } from './flexiname/build';
import { keychainGenerator } from './keychain/build';
import { nameTagGenerator } from './nametag/build';
import { patternGenerator } from './pattern/build';
import { shelfGenerator } from './shelf/build';

export const GENERATORS: readonly Generator[] = [
  nameTagGenerator,
  keychainGenerator,
  flexiNameGenerator,
  keyClickerGenerator,
  buildingGenerator,
  shelfGenerator,
  drawerOrganizerGenerator,
  hangarGenerator,
  msCageGenerator,
  imageTraceGenerator,
  patternGenerator,
];

export function generatorById(id: string): Generator {
  return GENERATORS.find((g) => g.id === id) ?? GENERATORS[0]!;
}

export function findGenerator(id: string): Generator | undefined {
  return GENERATORS.find((g) => g.id === id);
}
