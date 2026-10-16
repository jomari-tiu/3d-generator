import { bool, choice, color, num } from '../../core/params/dsl';
import type { ParamSpec } from '../../core/params/types';

type V = Record<string, unknown>;
const hasStairs = (v: V) => v.stairs === true;

/**
 * The switchback stairs' settings, the same in every hangar that has them:
 * which group they sit in, and the defaults that suit that hangar.
 */
export function stairParams(group: string, defaults: { span: number; height: number; scale: '100' | '144' }, help: string): ParamSpec[] {
  return [
    bool('stairs', 'Stair tower', { group, default: true, help }),
    choice('stairScale', 'Crew scale', {
      group, default: defaults.scale,
      options: [
        { value: '100', label: '1/100 (MG)' },
        { value: '144', label: '1/144 (HG, RG)' },
      ],
      help: 'The scale of the figures who use the stairs and ladders. Everything they climb is sized from real ones at this scale: an 18 cm step, a 90 cm flight, a 1 m railing, 2 m clear over every flight, ladder rungs 30 cm apart.',
    }),
    num('stairSpan', 'Tower width', {
      group, unit: 'mm', min: 30, max: 120, step: 1, default: defaults.span, visibleIf: hasStairs,
      help: 'End to end. A landing bay at each end, the flights between; wider makes longer, shallower flights with more headroom.',
    }),
    num('stairHeight', 'Tower height', {
      group, unit: 'mm', min: 20, max: 300, step: 1, default: defaults.height, visibleIf: hasStairs,
      help: 'From the floor up to the top landing. Rounded to a whole number of flights.',
    }),
  ];
}

/** The ceiling claw's settings: on or off, and how far down it hangs. */
export function clawParams(group: string, defaultDrop: number, help: string, visibleIf?: (v: V) => boolean): ParamSpec[] {
  const shown = (v: V) => (visibleIf ? visibleIf(v) : true);
  return [
    bool('ceilingClaw', 'Ceiling claw', { group, default: true, visibleIf: shown, help }),
    num('clawDrop', 'Chain length', {
      group, unit: 'mm', min: 10, max: 120, step: 1, default: defaultDrop,
      visibleIf: (v) => shown(v) && v.ceilingClaw === true,
      help: 'From the hook down to the claw.',
    }),
  ];
}

export function stairColourParams(group: string): ParamSpec[] {
  return [
    color('stairColor', 'Stairs', { group, default: '#5a626c', visibleIf: hasStairs }),
    color('stairRailColor', 'Stair railing', { group, default: '#f0b323', visibleIf: hasStairs }),
  ];
}

export function clawColourParams(group: string): ParamSpec[] {
  return [
    color('clawColor', 'Claw', { group, default: '#3a4048', visibleIf: (v) => v.ceilingClaw === true }),
    color('chainColor', 'Chain', { group, default: '#9aa3ad', visibleIf: (v) => v.ceilingClaw === true }),
  ];
}
