import {
  AmbientLight,
  Box3,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  EdgesGeometry,
  GridHelper,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Sphere,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { dimensionDrawing } from './dimensions';

export interface ViewPart {
  readonly id: string;
  readonly name: string;
  readonly geometry: BufferGeometry;
  readonly color: string;
  readonly visible?: boolean;
}

/** Gap between one plate and the next when a model needs several. */
const PLATE_GAP = 24;

/** On-screen height of a dimension label, in CSS pixels. */
const LABEL_PX = 15;
const DIM_COLOR = 0x8fb6ff;

export type ViewName = 'iso' | 'front' | 'side' | 'top';

const VIEW_DIRS: Record<ViewName, [number, number, number]> = {
  iso: [0.62, -0.72, 0.55],
  front: [0, -1, 0.0001],
  side: [1, 0, 0.0001],
  top: [0, -0.001, 1],
};

/** Z-up, millimetre-scale viewer with orbit / pan / zoom and on-demand rendering. */
export class Viewer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;

  private readonly modelRoot = new Group();
  private readonly plateRoot = new Group();
  private readonly dimRoot = new Group();
  private readonly meshes = new Map<string, Mesh>();
  private readonly edges = new Map<string, LineSegments>();
  private readonly labels: Sprite[] = [];
  private needsRender = true;
  private wireframe = false;
  private showEdges = true;
  private showDims = false;
  private bed: readonly [number, number] = [256, 256];
  private plateCount = 1;
  private view: ViewName = 'iso';

  constructor(private readonly host: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.host.appendChild(this.renderer.domElement);

    this.scene.background = new Color(0x14161a);

    // Z-up: matches how printers and slicers talk about models, so part
    // coordinates in the generators need no mental translation.
    this.camera = new PerspectiveCamera(45, 1, 0.1, 5000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(90, -120, 85);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.screenSpacePanning = false;
    this.controls.maxPolarAngle = Math.PI * 0.98;
    this.controls.addEventListener('change', () => this.invalidate());

    this.scene.add(new AmbientLight(0xffffff, 1.5));
    const key = new DirectionalLight(0xffffff, 2.1);
    key.position.set(60, -90, 140);
    this.scene.add(key);
    const fill = new DirectionalLight(0x9fc4ff, 0.7);
    fill.position.set(-80, 60, 40);
    this.scene.add(fill);

    this.scene.add(this.plateRoot);
    this.scene.add(this.modelRoot);
    this.scene.add(this.dimRoot);
    this.dimRoot.visible = false;
    this.buildPlate();

    // Observe the viewport element rather than window, so this stays correct
    // if the sidebar ever becomes resizable.
    new ResizeObserver(() => this.resize()).observe(this.host);
    this.resize();

    const tick = () => {
      requestAnimationFrame(tick);
      if (this.controls.update()) this.needsRender = true;
      if (this.needsRender) {
        this.needsRender = false;
        // Before the render, not after: the labels are sized from where the
        // camera is NOW, and sizing them from the previous frame's camera
        // leaves them visibly lagging a drag.
        if (this.showDims) this.sizeLabels();
        this.renderer.render(this.scene, this.camera);
      }
    };
    requestAnimationFrame(tick);
  }

  invalidate(): void {
    this.needsRender = true;
  }

  /**
   * The print bed, and how many of them.
   *
   * A model that needs more than one plate gets more than one bed drawn, side
   * by side along x. Showing a single bed and quietly dropping whatever did not
   * fit on it is the one thing this must not do: the parts are still going to
   * be printed, just not all at once.
   */
  setBed(x: number, y: number, plates = 1): void {
    this.bed = [x, y];
    this.plateCount = Math.max(1, Math.round(plates));
    this.buildPlate();
    this.invalidate();
  }

  /** Where plate `i` of `n` is centred, in world x. The set is centred on 0. */
  static plateOriginX(bedX: number, plates: number, i: number): number {
    const pitch = bedX + PLATE_GAP;
    return (i - (plates - 1) / 2) * pitch;
  }

  plateOrigin(i: number): number {
    return Viewer.plateOriginX(this.bed[0], this.plateCount, i);
  }

  private buildPlate(): void {
    this.plateRoot.clear();
    const [bx, by] = this.bed;
    const span = Math.max(bx, by);
    const hx = bx / 2;
    const hy = by / 2;

    for (let i = 0; i < this.plateCount; i++) {
      const ox = this.plateOrigin(i);

      const grid = new GridHelper(span, Math.round(span / 10), 0x2c323b, 0x21262d);
      // GridHelper lies in XZ by default; stand it up for a Z-up world.
      grid.rotation.x = Math.PI / 2;
      grid.position.x = ox;
      this.plateRoot.add(grid);

      const outline = new BufferGeometry();
      outline.setAttribute(
        'position',
        new BufferAttribute(
          new Float32Array([
            ox - hx, -hy, 0, ox + hx, -hy, 0,
            ox + hx, -hy, 0, ox + hx, hy, 0,
            ox + hx, hy, 0, ox - hx, hy, 0,
            ox - hx, hy, 0, ox - hx, -hy, 0,
          ]),
          3,
        ),
      );
      this.plateRoot.add(new LineSegments(outline, new LineBasicMaterial({ color: 0x4c9ffe })));
    }
  }

  /**
   * Show or hide the print bed.
   *
   * The bed is a statement about where the model will be printed, so it only
   * belongs in the view that is about printing. Left on under an assembled
   * model it reads as a claim that the thing sits on the plate like that.
   */
  setBedVisible(on: boolean): void {
    if (this.plateRoot.visible === on) return;
    this.plateRoot.visible = on;
    this.invalidate();
  }

  /** Replace the displayed parts. Geometries are owned by the viewer afterwards. */
  setParts(parts: readonly ViewPart[]): void {
    const seen = new Set<string>();

    for (const p of parts) {
      seen.add(p.id);
      let mesh = this.meshes.get(p.id);
      if (!mesh) {
        mesh = new Mesh(
          p.geometry,
          new MeshStandardMaterial({ flatShading: true, metalness: 0.05, roughness: 0.62 }),
        );
        this.meshes.set(p.id, mesh);
        this.modelRoot.add(mesh);
      } else if (mesh.geometry !== p.geometry) {
        mesh.geometry.dispose();
        mesh.geometry = p.geometry;
      }
      const mat = mesh.material as MeshStandardMaterial;
      mat.color.set(p.color);
      mat.wireframe = this.wireframe;
      mesh.visible = p.visible !== false;
      mesh.name = p.name;
      this.syncEdges(p, mesh);
    }

    for (const [id, mesh] of [...this.meshes]) {
      if (seen.has(id)) continue;
      this.modelRoot.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
      this.meshes.delete(id);
      this.dropEdges(id);
    }

    // The dimensions are of what is on screen, so they are rebuilt with it --
    // including when the only thing that changed is which parts are visible.
    if (this.showDims) this.buildDimensions();

    this.invalidate();
  }

  private dropEdges(id: string): void {
    const e = this.edges.get(id);
    if (!e) return;
    this.modelRoot.remove(e);
    e.geometry.dispose();
    (e.material as LineBasicMaterial).dispose();
    this.edges.delete(id);
  }

  private syncEdges(p: ViewPart, mesh: Mesh): void {
    this.dropEdges(p.id);
    if (!this.showEdges) return;
    // Outlining silhouette edges is what makes a faceted mechanical part
    // legible; skip it on dense meshes where it costs more than it gives.
    const tris = (p.geometry.getIndex()?.count ?? 0) / 3;
    if (tris > 60000) return;
    const seg = new LineSegments(
      new EdgesGeometry(p.geometry, 24),
      new LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }),
    );
    seg.visible = mesh.visible;
    this.edges.set(p.id, seg);
    this.modelRoot.add(seg);
  }

  setWireframe(on: boolean): void {
    this.wireframe = on;
    for (const m of this.meshes.values()) {
      (m.material as MeshStandardMaterial).wireframe = on;
    }
    this.invalidate();
  }

  // ------------------------------------------------------------- dimensions

  /**
   * Draw the overall size of whatever is on screen, as dimension lines on the
   * model rather than as a number in a corner.
   *
   * Measured over the VISIBLE meshes, which is what makes one implementation
   * serve every generator and every view at once: the assembled model in Whole,
   * the packed plate in Parts, and -- because hiding parts in the parts panel
   * is the same thing as making them invisible here -- a single part on its own
   * the moment you switch the others off. Nothing here knows what a lamp or a
   * drawer is, in the same way nothing else in this file does.
   */
  setDimensions(on: boolean): void {
    if (this.showDims === on) return;
    this.showDims = on;
    this.dimRoot.visible = on;
    if (on) this.buildDimensions();
    this.invalidate();
  }

  get dimensionsVisible(): boolean {
    return this.showDims;
  }

  /** Bounding box of the visible meshes, in world space. */
  private visibleBox(): Box3 {
    const box = new Box3();
    for (const m of this.meshes.values()) {
      if (!m.visible) continue;
      m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox;
      if (bb) box.union(bb);
    }
    return box;
  }

  private clearDimensions(): void {
    for (const child of this.dimRoot.children) {
      const any = child as LineSegments & Sprite;
      any.geometry?.dispose();
      const mat = any.material as LineBasicMaterial & SpriteMaterial;
      mat?.map?.dispose();
      mat?.dispose();
    }
    this.dimRoot.clear();
    this.labels.length = 0;
  }

  /**
   * A label that always reads at the same size on screen.
   *
   * A sprite sized in world units is a dimension you cannot read the moment you
   * zoom out to see the whole model -- which is exactly when you want to read
   * it. Sized per frame against the camera distance instead, so it behaves like
   * an annotation rather than like a decal stuck to the model.
   */
  private makeLabel(text: string, at: Vector3): Sprite {
    const pad = 10;
    const font = 42;
    const probe = document.createElement('canvas').getContext('2d');
    if (probe) probe.font = `600 ${font}px ui-sans-serif, system-ui, sans-serif`;
    const w = Math.ceil((probe?.measureText(text).width ?? text.length * font * 0.55) + pad * 2);
    const h = font + pad * 2;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(14, 17, 22, 0.86)';
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, 10);
        ctx.fill();
      } else {
        ctx.fillRect(0, 0, w, h);
      }
      ctx.font = `600 ${font}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillStyle = '#d7e6ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2 + 1);
    }

    const texture = new CanvasTexture(canvas);
    const sprite = new Sprite(
      new SpriteMaterial({ map: texture, depthTest: false, transparent: true }),
    );
    sprite.position.copy(at);
    sprite.renderOrder = 11;
    sprite.userData.aspect = w / h;
    this.labels.push(sprite);
    return sprite;
  }

  private sizeLabels(): void {
    const px = this.renderer.domElement.clientHeight || 1;
    const perUnit = (2 * Math.tan((this.camera.fov * Math.PI) / 360)) / px;
    for (const s of this.labels) {
      const worldH = this.camera.position.distanceTo(s.position) * perUnit * LABEL_PX;
      s.scale.set(worldH * (s.userData.aspect as number), worldH, 1);
    }
  }

  private buildDimensions(): void {
    this.clearDimensions();
    const box = this.visibleBox();
    if (box.isEmpty()) return;

    const drawing = dimensionDrawing(
      [box.min.x, box.min.y, box.min.z],
      [box.max.x, box.max.y, box.max.z],
    );
    if (!drawing) return;

    for (const label of drawing.labels) {
      this.dimRoot.add(this.makeLabel(label.text, new Vector3(...label.at)));
    }

    const geom = new BufferGeometry();
    geom.setAttribute('position', new BufferAttribute(drawing.segments, 3));
    const lines = new LineSegments(
      geom,
      // Drawn over the model, like every other annotation: a dimension that
      // disappears behind the thing it is measuring is worse than no dimension.
      new LineBasicMaterial({ color: DIM_COLOR, depthTest: false, transparent: true, opacity: 0.9 }),
    );
    lines.renderOrder = 10;
    this.dimRoot.add(lines);
  }

  /**
   * Frame the current model, from the last direction asked for.
   *
   * Front looks along +y, the way every generator here faces its model: the
   * front of the thing toward -y. Top is a hair off straight down, because
   * the camera's up is +z and looking exactly along it leaves no "up" at all.
   */
  fitView(view?: ViewName): void {
    if (view) this.view = view;
    const box = this.visibleBox();
    if (box.isEmpty()) return;

    const sphere = box.getBoundingSphere(new Sphere());
    const center = sphere.center;
    const r = Math.max(sphere.radius, 1);
    const dist = (r / Math.sin((this.camera.fov * Math.PI) / 360)) * 1.25;

    const dir = new Vector3(...VIEW_DIRS[this.view]).normalize();
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.controls.target.copy(center);
    this.camera.near = Math.max(dist / 500, 0.05);
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.invalidate();
  }

  /** Render + capture in the SAME task, so preserveDrawingBuffer isn't needed. */
  snapshot(): Promise<Blob> {
    this.renderer.render(this.scene, this.camera);
    return new Promise((resolve, reject) => {
      this.renderer.domElement.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
        'image/png',
      );
    });
  }

  private resize(): void {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }
}
