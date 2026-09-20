import type { Generator } from '../core/params/types';
import { buildingGenerator } from './building/build';
import { drawerGenerator } from './drawer/build';
import { organizerGenerator } from './organizer/build';
import { imageTraceGenerator } from './imagetrace/build';
import { keyClickerGenerator } from './keyclicker/build';
import { keychainGenerator } from './keychain/build';
import { nameTagGenerator } from './nametag/build';
import { patternGenerator } from './pattern/build';
import { petBowlGenerator } from './petbowl/build';
import { pushDrawerGenerator } from './pushdrawer/build';

export const GENERATORS: readonly Generator[] = [
  nameTagGenerator,
  keychainGenerator,
  petBowlGenerator,
  keyClickerGenerator,
  buildingGenerator,
  drawerGenerator,
  pushDrawerGenerator,
  organizerGenerator,
  imageTraceGenerator,
  patternGenerator,
];

export function generatorById(id: string): Generator {
  return GENERATORS.find((g) => g.id === id) ?? GENERATORS[0]!;
}

export function findGenerator(id: string): Generator | undefined {
  return GENERATORS.find((g) => g.id === id);
}
