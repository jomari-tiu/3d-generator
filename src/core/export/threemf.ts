import { to3dmodel, fileForContentTypes, FileForRelThumbnail } from '@jscadui/3mf-export';
import { strToU8, zipSync } from 'fflate';
import type { LaidOutPart } from '../build/layout';

/** 3MF matrices are 3x4, row-major, translation last. */
const IDENTITY = '1 0 0 0 1 0 0 0 1 0 0 0';

export interface ThreeMfOptions {
  readonly title: string;
  /** PNG bytes; shows up in the OS file browser and PrusaSlicer's project view. */
  readonly thumbnail?: Uint8Array;
  /** Bake per-object colour. Cosmetic -- see the caveat below. */
  readonly color?: boolean;
}

const BASEMATERIALS_ID = '1';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Add per-object colour to the model XML.
 *
 * @jscadui/3mf-export has no basematerials support, so this post-processes its
 * output: one <basematerials> resource plus pid/pindex on each <object>.
 *
 * CAVEAT: it has NOT been verified that PrusaSlicer / Orca / Bambu Studio
 * actually honour per-object `displaycolor`. Treat this as cosmetic. The
 * geometry is correct either way, and the worst case is that parts arrive in
 * the slicer's own colours.
 */
function injectColors(model: string, parts: readonly LaidOutPart[]): string {
  const bases = parts
    .map(
      (p) =>
        `    <base name="${esc(p.name)}" displaycolor="${p.color.toUpperCase()}FF" />\n`,
    )
    .join('');

  const materials =
    `   <basematerials id="${BASEMATERIALS_ID}">\n${bases}   </basematerials>\n`;

  let out = model.replace('  <resources>\n', `  <resources>\n${materials}`);

  // Objects are emitted in `parts` order, so the nth <object> is the nth part.
  let n = 0;
  out = out.replace(/<object id="(\d+)" type="model"/g, (_full, id: string) => {
    const idx = n++;
    return `<object id="${id}" type="model" pid="${BASEMATERIALS_ID}" pindex="${idx}"`;
  });

  return out;
}

/**
 * Write a 3MF containing one object per part.
 *
 * 3MF is the recommended primary export for multi-part models: one file, real
 * part names, explicit millimetre units, and optional colour. Unlike STL it
 * has a scene graph, so a slicer sees separate objects rather than one solid
 * with internal walls.
 */
export function write3MF(parts: readonly LaidOutPart[], opts: ThreeMfOptions): Uint8Array {
  if (parts.length === 0) throw new Error('Nothing to export.');

  const meshes = parts.map((p, i) => ({
    // 3MF ids are xs:positiveInteger and must be unique within resources;
    // id 1 is taken by the basematerials resource.
    id: String(i + 2),
    name: p.name,
    vertices: p.positions,
    indices: p.index,
  }));

  let model = to3dmodel({
    meshes,
    // Flat: one build item per part, no <component> nesting, so PrusaSlicer's
    // children-before-parents ordering requirement is moot.
    items: meshes.map((mm) => ({ objectID: mm.id, transform: IDENTITY })),
    // getMesh is float32, so more than 7 significant digits is noise.
    precision: 7,
    header: {
      unit: 'millimeter',
      title: opts.title,
      application: '3d-generator',
      description: `${opts.title} - generated parametric model`,
    },
  });

  if (opts.color !== false) model = injectColors(model, parts);

  const rels = new FileForRelThumbnail();
  rels.add3dModel('/3D/3dmodel.model');
  if (opts.thumbnail) rels.addThumbnail('/Metadata/thumbnail.png');

  // Insertion order matters: OPC readers expect [Content_Types].xml first,
  // and fflate's zipSync preserves object key order.
  const files: Record<string, Uint8Array> = {};
  files[fileForContentTypes.name] = strToU8(fileForContentTypes.content);
  files[rels.name] = strToU8(rels.content);
  files['3D/3dmodel.model'] = strToU8(model);
  if (opts.thumbnail) files['Metadata/thumbnail.png'] = opts.thumbnail;

  return zipSync(files, { level: 6 });
}
