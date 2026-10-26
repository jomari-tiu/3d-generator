import type { Generator } from '../core/params/types';
import { buildingGenerator } from './building/build';
import { drawerOrganizerGenerator } from './drawer/build';
import { hangarGenerator } from './hangar/build';
import { imageTraceGenerator } from './imagetrace/build';
import { keyClickerGenerator } from './keyclicker/build';
import { wasdClickerGenerator } from './keyclicker/wasd';
import { mobClickerGenerator } from './keyclicker/mob';
import { msCageGenerator } from './mscage/build';
import { keychainGenerator } from './keychain/build';
import { logoKeychainGenerator } from './logokeychain/build';
import { nameTagGenerator } from './nametag/build';
import { patternGenerator } from './pattern/build';
import { pegboardGenerator } from './pegboard/build';
import { shelfGenerator } from './shelf/build';

export const GENERATORS: readonly Generator[] = [
  nameTagGenerator,
  keychainGenerator,
  logoKeychainGenerator,
  keyClickerGenerator,
  wasdClickerGenerator,
  mobClickerGenerator,
  buildingGenerator,
  shelfGenerator,
  drawerOrganizerGenerator,
  pegboardGenerator,
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
