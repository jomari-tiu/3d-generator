import type { PathCommand } from '../text/flatten';

/** Shortest round-trippable form: 3 decimals, no trailing zeros, no "-0". */
function n(v: number): string {
  const s = v.toFixed(3).replace(/\.?0+$/, '');
  return s === '-0' || s === '' ? '0' : s;
}

/** One ring's commands as an SVG path `d` string. */
export function commandsToPathData(cmds: readonly PathCommand[]): string {
  const out: string[] = [];
  for (const c of cmds) {
    switch (c.type) {
      case 'M':
        out.push(`M${n(c.x!)} ${n(c.y!)}`);
        break;
      case 'L':
        out.push(`L${n(c.x!)} ${n(c.y!)}`);
        break;
      case 'Q':
        out.push(`Q${n(c.x1!)} ${n(c.y1!)} ${n(c.x!)} ${n(c.y!)}`);
        break;
      case 'C':
        out.push(`C${n(c.x1!)} ${n(c.y1!)} ${n(c.x2!)} ${n(c.y2!)} ${n(c.x!)} ${n(c.y!)}`);
        break;
      case 'Z':
        out.push('Z');
        break;
    }
  }
  return out.join('');
}

export interface SvgOptions {
  /** viewBox extent. Millimetres, so the file opens at the right size everywhere. */
  readonly widthMm: number;
  readonly heightMm: number;
  readonly fill?: string;
  readonly title?: string;
}

/**
 * The traced rings as a standalone SVG document.
 *
 * ONE path element holding every ring, with fill-rule="nonzero". Splitting the
 * rings into separate elements would paint the holes in as solid shapes on top
 * of the shape they belong to: a counter is not a shape, it is the absence of
 * one, and only the fill rule expresses that. It is the same rule the kernel is
 * handed, so the SVG and the printed part cannot disagree about which side of a
 * contour is solid.
 *
 * Dimensions are written in millimetres AND as a unitless viewBox, so the file
 * drops into a laser cutter or Inkscape at true size and still scales cleanly
 * in a browser.
 */
export function ringsToSvg(rings: readonly (readonly PathCommand[])[], opts: SvgOptions): string {
  const d = rings.map(commandsToPathData).join('');
  const title = opts.title ? `<title>${escapeXml(opts.title)}</title>` : '';
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(opts.widthMm)}mm" height="${n(opts.heightMm)}mm" viewBox="0 0 ${n(opts.widthMm)} ${n(opts.heightMm)}">`,
    title,
    `<path fill="${opts.fill ?? '#000000'}" fill-rule="nonzero" d="${d}"/>`,
    '</svg>',
    '',
  ].join('\n');
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === '"' ? '&quot;' : '&apos;',
  );
}
