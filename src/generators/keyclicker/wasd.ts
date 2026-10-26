import type { Generator, Params, ParamSpec } from '../../core/params/types';
import { keyClickerGenerator } from './build';
import { keyClickerGroups, keyClickerParams } from './schema';

/**
 * The key clicker's settings, with the letters and the loop reworded for a
 * cluster. Everything else -- switches, keycaps, rounding, legends, body,
 * colours, tolerances -- is the key clicker's own, because it is the same
 * object with its keys in a different place.
 */
const wasdParams: readonly ParamSpec[] = keyClickerParams.map((spec): ParamSpec => {
  if (spec.id === 'text' && spec.type === 'text') {
    return {
      ...spec,
      default: 'WASD',
      maxLength: 4,
      placeholder: 'WASD',
      help: 'Four keys in keyboard order: the top key first, then the row below it, left to right. WASD, ESDF, or arrows.',
    };
  }
  if (spec.id === 'loopPosition' && spec.type === 'choice') {
    return {
      ...spec,
      options: [
        { value: 'end', label: 'Beside the D key' },
        { value: 'side', label: 'Above the W key' },
      ],
    };
  }
  return spec;
});

/** The key clicker's own build and checks, told to lay the keys out as WASD. */
const asWasd = (p: Params): Params => ({ ...p, layout: 'wasd' });

export const wasdClickerGenerator: Generator = {
  id: 'wasd-clicker',
  name: 'WASD clicker',
  family: { id: 'keyclicker', label: 'WASD' },
  description:
    'W, A, S and D as a clicky keychain, laid out exactly as on a keyboard - W a quarter key left of S - for the fingers of anyone who plays shooters.',
  tagline: 'The movement keys, clicking in your pocket',
  highlights: [
    'Real keyboard stagger: W sits a quarter key left of S',
    'Cherry MX, Kailh Choc, or a fully printed dome',
    'One cluster-shaped tray, or a rounded cell per key',
    'Separate, raised, inlaid or engraved letters',
    'Keyring loop beside D or above W',
  ],
  art: `<svg viewBox="0 0 120 96" role="img" aria-hidden="true">
    <defs><linearGradient id="wa-p" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3a3f4b"/><stop offset="1" stop-color="#1f232b"/>
    </linearGradient></defs>
    <path d="M38 14 h28 a4 4 0 0 1 4 4 v20 h24 a4 4 0 0 1 4 4 v28 a4 4 0 0 1 -4 4 h-72 a4 4 0 0 1 -4 -4 v-28 a4 4 0 0 1 4 -4 h12 v-20 a4 4 0 0 1 4 -4 z"
      fill="url(#wa-p)"/>
    <circle cx="104" cy="56" r="5" fill="none" stroke="#9aa3b2" stroke-width="2.6"/>
    <g fill="#e8e9ee">
      <rect x="40" y="17" width="23" height="21" rx="4"/>
      <rect x="21" y="44" width="23" height="21" rx="4"/>
      <rect x="47" y="44" width="23" height="21" rx="4"/>
      <rect x="73" y="44" width="23" height="21" rx="4"/>
    </g>
    <g fill="#e2343c" font-size="13" font-weight="800" text-anchor="middle"
      font-family="ui-sans-serif, system-ui, sans-serif">
      <text x="51.5" y="32">W</text><text x="32.5" y="59">A</text>
      <text x="58.5" y="59">S</text><text x="84.5" y="59">D</text>
    </g>
  </svg>`,
  params: wasdParams,
  groups: keyClickerGroups,
  fontsNeeded: (p) => keyClickerGenerator.fontsNeeded?.(asWasd(p)) ?? [],
  validate: (p) => keyClickerGenerator.validate?.(asWasd(p)) ?? [],
  build: (p, ctx) => keyClickerGenerator.build(asWasd(p), ctx),
  presets: [
    {
      // Black keys, red letters standing proud: the gaming-keyboard look.
      label: 'Stealth',
      values: {
        text: 'WASD', baseStyle: 'tray', legendFont: 'bowlby-one-sc', legendStyle: 'raised',
        legendSize: 9.5, legendDepth: 1, topCurve: 0, capRound: 1.5,
        bodyColor: '#1d1f24', capColor: '#2a2d34', legendColor: '#e2343c',
      },
    },
    {
      // The Curvy look from the key clicker, on the movement keys.
      label: 'Curvy WASD',
      values: {
        text: 'WASD', baseStyle: 'cells', legendFont: 'bowlby-one-sc', legendStyle: 'raised',
        legendSize: 9.5, legendDepth: 1.5, topCurve: 0, capCorner: 1.7, capRound: 2.9,
        keyGap: 0.3, cellRound: 1.5,
        bodyColor: '#c77ab9', capColor: '#c77ab9', legendColor: '#f5f5f5',
      },
    },
  ],
};
