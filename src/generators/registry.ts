import type { Generator } from '../core/params/types';
import { buildingGenerator } from './building/build';
import { imageTraceGenerator } from './imagetrace/build';
import { keyClickerGenerator } from './keyclicker/build';
import { keychainGenerator } from './keychain/build';
import { nameTagGenerator } from './nametag/build';
import { patternGenerator } from './pattern/build';

export const GENERATORS: readonly Generator[] = [
  nameTagGenerator,
  keychainGenerator,
  keyClickerGenerator,
  buildingGenerator,
  imageTraceGenerator,
  patternGenerator,
];

export function generatorById(id: string): Generator {
  return GENERATORS.find((g) => g.id === id) ?? GENERATORS[0]!;
}

export function findGenerator(id: string): Generator | undefined {
  return GENERATORS.find((g) => g.id === id);
}
