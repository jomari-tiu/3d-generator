// @jscadui/3mf-export ships no types. Declares only what we call.
// Notably absent from the library: any basematerials / colour support, which
// is why threemf.ts post-processes the returned XML.
declare module '@jscadui/3mf-export' {
  export interface Mesh3MF {
    id: string;
    vertices: Float32Array;
    indices: Uint32Array;
    name?: string;
  }

  export interface Child3MF {
    objectID: string;
    /** 3x4 row-major matrix as a space-separated string. */
    transform: string;
  }

  export interface Header {
    unit?: 'micron' | 'millimeter' | 'centimeter' | 'inch' | 'foot' | 'meter';
    title?: string;
    author?: string;
    description?: string;
    application?: string;
    creationDate?: string | Date;
    license?: string;
    modificationDate?: string | Date;
  }

  export function to3dmodel(options: {
    meshes?: readonly Mesh3MF[];
    items?: readonly Child3MF[];
    precision?: number;
    header?: Header;
  }): string;

  export const fileForContentTypes: { name: string; content: string };

  export class FileForRelThumbnail {
    readonly name: string;
    readonly content: string;
    add3dModel(path: string): void;
    addThumbnail(path: string): void;
  }
}
