import { BuildRunner, TOLERANCE, type BuildOutcome, type BuildRequest } from '../core/build/runner';
import { layAssembled, packPlates, type LaidOutPart, type PlateSet } from '../core/build/layout';
import { write3mfBundle, writeStlBundle } from '../core/export/bundle';
import { download, safeFilename } from '../core/export/download';
import { write3MF } from '../core/export/threemf';
import { writeBinarySTL } from '../core/export/stl';
import { ImageRegistry } from '../core/image/registry';
import { warmKernel } from '../core/kernel/manifold';
import type { RawMesh } from '../core/kernel/types';
import type {
  BuildResult,
  Generator,
  ParamValue,
  Params,
  VectorExport,
} from '../core/params/types';
import {
  changedFromDefaults,
  coerceAll,
  decodeHash,
  defaultsOf,
  encodeParams,
  isContent,
  styleOf,
} from '../core/params/validate';
import { FontRegistry } from '../core/text/fonts';
import { GENERATORS, findGenerator, generatorById } from '../generators/registry';
import { assembledToBufferGeometry, laidOutToBufferGeometry } from '../interop/toBufferGeometry';
import { Home } from './home';
import { ImageStore, decodeImageFile } from './images';
import { MAX_TRACE_PIXELS } from '../generators/imagetrace/build';
import { Panel } from './panel';
import { Viewer } from './viewer';

const PRESET_STORE = '3dgen.presets.v1';
const TEMPLATE_STORE = '3dgen.templates.v1';

interface SavedPresets {
  [generatorId: string]: { [name: string]: Params };
}

/**
 * Templates are kept in their own store, not alongside presets, because they
 * are a different kind of thing and behave differently on the way back in: a
 * preset is a whole configuration and REPLACES what you have, a template is a
 * look and is merged OVER it. Sharing one store would mean tagging each entry
 * and getting the tag right forever; two stores cannot be confused.
 */
type SavedTemplates = SavedPresets;

export class App {
  private readonly viewer: Viewer;
  private readonly panel: Panel;
  private readonly home: Home;
  private readonly fonts = new FontRegistry();
  private readonly imageStore = new ImageStore();
  /**
   * Dropped pictures, resolved through IndexedDB when they are not in memory
   * yet -- which is exactly what a reloaded permalink looks like.
   */
  private readonly images = new ImageRegistry((id) => this.imageStore.get(id));
  private readonly runner: BuildRunner;

  private gen: Generator;
  private values: Params;
  private lastResult: BuildResult | null = null;
  private lastPlates: PlateSet | null = null;
  /** What the exported file holds: the print plate, or the assembled model. */
  private exportLayout: 'plate' | 'assembled' = 'plate';
  private readonly layoutBtns: Partial<Record<'plate' | 'assembled', HTMLButtonElement>> = {};
  private lastPartCount = -1;
  private busyEl!: HTMLElement;
  private hudEl!: HTMLElement;
  /**
   * 'whole' shows the model assembled, as the thing it is. 'parts' shows what
   * actually goes on the bed: every piece rotated into its print orientation,
   * dropped to z = 0 and packed.
   *
   * Changing THIS changes only the preview. What an export contains is a
   * separate, explicit choice (see `exportLayout`), deliberately not wired to
   * this one: looking at the assembled model and then pressing STL should not
   * quietly hand you a file you cannot print. The reverse wiring is safe and
   * is there -- picking an export layout shows you that layout -- so the two
   * agree whenever the question was asked at the export end.
   *
   * Opens on 'whole', because the first thing anyone wants to see is the thing
   * they are making. A plate of flat pieces is the right answer to "how does
   * this print", which is a question you ask second -- and answering it first
   * meant a building was introduced as four slabs lying in a row.
   */
  private preview: 'whole' | 'parts' = 'whole';
  /** Part shown alone, or null for all of them. */
  private solo: string | null = null;
  private viewBtns: Partial<Record<'whole' | 'parts', HTMLButtonElement>> = {};
  private partsPanel!: HTMLElement;
  private resetBtn!: HTMLButtonElement;
  private deleteTemplateBtn!: HTMLButtonElement;
  private exportBtns: HTMLButtonElement[] = [];
  private vectorRow: HTMLElement | null = null;
  private exportEnabled = false;

  constructor(
    private readonly sidebar: HTMLElement,
    private readonly viewportEl: HTMLElement,
  ) {
    // Restore from the permalink if there is one.
    const fromHash = decodeHash(location.hash);
    this.gen = generatorById(fromHash.g ?? GENERATORS[0]!.id);
    this.values = coerceAll(this.gen, fromHash.p ?? {});

    this.viewer = new Viewer(this.viewportEl);
    this.buildChrome();

    this.panel = new Panel(
      this.sidebar.querySelector('.sb-body')!,
      {
        onChange: (id, value, commit) => this.onParamChange(id, value, commit),
        onFontUpload: (file) => void this.onFontUpload(file),
        onImageUpload: (file, paramId) => void this.onImageUpload(file, paramId),
      },
      this.fonts.list(),
      (id) => this.images.peek(id),
    );

    this.runner = new BuildRunner(
      this.fonts,
      this.images,
      (outcome) => this.onOutcome(outcome),
      (busy) => this.setBusy(busy),
    );

    this.panel.render(this.gen, this.values);
    this.panel.setValues(this.values);
    this.refreshResetState();

    // The picker sits over a fully laid-out editor rather than replacing it, so
    // opening a model is instant: the kernel is already warm and the first
    // build has already run behind the overlay.
    this.home = new Home(GENERATORS, (id) => this.openGenerator(id));
    document.body.appendChild(this.home.el);
    this.setView(fromHash.g ? 'editor' : 'home');
    window.addEventListener('popstate', () => this.onRoute());

    void this.hydrateImages();
    void warmKernel().then(() => this.rebuild(true));
  }

  // ------------------------------------------------------------------ routes

  /** No generator in the hash means the front page. */
  private setView(view: 'home' | 'editor'): void {
    document.body.dataset.view = view;
    if (view === 'home') this.home.show();
    else this.home.hide();
  }

  private onRoute(): void {
    const route = decodeHash(location.hash);
    if (!route.g) {
      this.setView('home');
      return;
    }
    const gen = findGenerator(route.g);
    if (gen) {
      const switching = gen.id !== this.gen.id;
      this.gen = gen;
      this.values = coerceAll(gen, route.p ?? {});
      if (switching) this.reloadPanel();
      else this.panel.setValues(this.values);
      this.refreshResetState();
      this.rebuild(true);
    }
    this.setView('editor');
  }

  private openGenerator(id: string): void {
    this.gen = generatorById(id);
    this.values = defaultsOf(this.gen);
    this.reloadPanel();
    this.setView('editor');
    history.pushState(null, '', `#${encodeParams(this.gen, this.values)}`);
    this.rebuild(true);
  }

  private goHome(): void {
    this.setView('home');
    history.pushState(null, '', location.pathname + location.search);
  }

  /** Re-point the whole sidebar at `this.gen` / `this.values`. */
  private reloadPanel(): void {
    const picker = document.getElementById('gen-picker') as HTMLSelectElement | null;
    if (picker) picker.value = this.gen.id;
    const desc = document.getElementById('gen-desc');
    if (desc) desc.textContent = this.gen.description;
    this.panel.render(this.gen, this.values);
    this.panel.setValues(this.values);
    this.refreshPresetList();
    this.refreshTemplateList();
    this.refreshResetState();
    this.lastPartCount = -1;
    // A route change can land on a configuration that names a stored picture,
    // so hydration belongs here and not only at boot.
    void this.hydrateImages();
  }

  /**
   * Back to this generator's defaults.
   *
   * PUSHED onto history rather than replacing the current entry. Parameter
   * edits use replaceState, so the entry this displaces holds the settings as
   * they were a moment ago, and browser Back restores them exactly. That is why
   * there is no "are you sure" here -- the undo already exists, and a dialog
   * would only be in the way of the far more common deliberate click.
   */
  private resetSettings(): void {
    if (changedFromDefaults(this.gen, this.values).length === 0) return;
    this.values = defaultsOf(this.gen);
    this.panel.setValues(this.values);
    history.pushState(null, '', `#${encodeParams(this.gen, this.values)}`);
    this.refreshResetState();
    this.rebuild(true);
  }

  /**
   * The button goes dead once there is nothing left to reset, which doubles as
   * the confirmation that the click did something.
   */
  private refreshResetState(): void {
    const changed = changedFromDefaults(this.gen, this.values).length;
    this.resetBtn.disabled = changed === 0;
    this.resetBtn.title =
      changed === 0
        ? 'Every setting is already at its default.'
        : `Put ${changed} changed setting${changed === 1 ? '' : 's'} back to default. Browser Back undoes it.`;
  }

  // ------------------------------------------------------------------ chrome

  private buildChrome(): void {
    this.sidebar.textContent = '';

    const head = div('sb-head');

    const titleRow = div('sb-title-row');
    const back = button('All models', 'btn-back');
    back.title = 'Back to the model picker';
    back.addEventListener('click', () => this.goHome());
    titleRow.appendChild(back);
    const title = document.createElement('p');
    title.className = 'sb-title';
    title.textContent = 'Model';
    titleRow.appendChild(title);
    head.appendChild(titleRow);

    const picker = document.createElement('select');
    picker.id = 'gen-picker';
    for (const g of GENERATORS) {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name;
      picker.appendChild(opt);
    }
    picker.value = this.gen.id;
    picker.addEventListener('change', () => this.switchGenerator(picker.value));
    head.appendChild(picker);

    const desc = div('hint');
    desc.textContent = this.gen.description;
    desc.id = 'gen-desc';
    head.appendChild(desc);
    this.sidebar.appendChild(head);

    this.sidebar.appendChild(div('sb-body'));

    // ---- footer: presets + export
    const foot = div('sb-foot');

    const presetRow = div('foot-row');
    const presetSel = document.createElement('select');
    presetSel.id = 'preset-sel';
    presetRow.appendChild(presetSel);
    const saveBtn = button('Save', 'btn btn-sub');
    saveBtn.title = 'Save everything, including the text, as a named preset';
    saveBtn.addEventListener('click', () => this.savePreset());
    presetRow.appendChild(saveBtn);
    foot.appendChild(presetRow);

    const templateRow = div('foot-row');
    const templateSel = document.createElement('select');
    templateSel.id = 'template-sel';
    templateRow.appendChild(templateSel);
    this.deleteTemplateBtn = button('✕', 'btn btn-sub');
    this.deleteTemplateBtn.title = 'Delete the selected template';
    this.deleteTemplateBtn.disabled = true;
    this.deleteTemplateBtn.addEventListener('click', () => this.deleteTemplate());
    templateRow.appendChild(this.deleteTemplateBtn);
    const saveTemplateBtn = button('Save as template', 'btn btn-sub');
    saveTemplateBtn.title =
      'Save the look - style, font, sizes, colours - but not the text, so it can be applied to any word';
    saveTemplateBtn.addEventListener('click', () => this.saveTemplate());
    templateRow.appendChild(saveTemplateBtn);
    foot.appendChild(templateRow);

    const shareRow = div('foot-row');
    const linkBtn = button('Copy shareable link', 'btn btn-sub btn-grow');
    linkBtn.addEventListener('click', () => void this.copyLink(linkBtn));
    this.resetBtn = button('Reset', 'btn btn-sub');
    this.resetBtn.addEventListener('click', () => this.resetSettings());
    shareRow.append(linkBtn, this.resetBtn);
    foot.appendChild(shareRow);

    // What the exported FILE contains, which is not the same question as what
    // the preview shows. Explicit rather than tied to the Whole/Parts toggle:
    // looking at the assembled model and then clicking STL should not silently
    // hand you something you cannot print.
    const layoutRow = div('foot-row layout-row');
    const layoutLabel = div('hint');
    layoutLabel.textContent = 'Export';
    layoutRow.appendChild(layoutLabel);
    const layoutSeg = div('seg');
    for (const mode of ['plate', 'assembled'] as const) {
      const b = button(mode === 'plate' ? 'Flat to print' : 'Assembled', 'btn btn-hud');
      b.title =
        mode === 'plate'
          ? 'Every piece rotated into its print orientation and packed on the plate'
          : 'Every piece where it belongs in the finished model, still as separate bodies';
      b.addEventListener('click', () => this.setExportLayout(mode));
      this.layoutBtns[mode] = b;
      layoutSeg.appendChild(b);
    }
    layoutRow.appendChild(layoutSeg);
    foot.appendChild(layoutRow);

    const exportRow = div('foot-row');
    const mfBtn = button('Export 3MF', 'btn btn-primary');
    mfBtn.title = 'One file, named parts, millimetre units, per-part colour';
    mfBtn.addEventListener('click', () => void this.export3mf());
    const stlBtn = button('STL', 'btn');
    stlBtn.title = 'One STL per part (zipped when there is more than one)';
    stlBtn.addEventListener('click', () => this.exportStl());
    const pngBtn = button('PNG', 'btn');
    pngBtn.addEventListener('click', () => void this.exportPng());
    // Vector exports are whatever the build declared, so the UI never learns
    // which generators have any or what formats they are -- it asks the result,
    // the same way it asks for readouts. Built fresh per build rather than
    // hidden and shown, because the LIST changes between generators.
    this.vectorRow = div('foot-vectors');
    exportRow.append(mfBtn, stlBtn, pngBtn, this.vectorRow);
    foot.appendChild(exportRow);
    this.exportBtns = [mfBtn, stlBtn];

    this.busyEl = div('hint busy');
    foot.appendChild(this.busyEl);
    this.sidebar.appendChild(foot);

    // ---- viewport overlay
    this.hudEl = div('hud hud-bl');
    this.viewportEl.appendChild(this.hudEl);

    const tools = div('hud hud-tl tools');

    const seg = div('seg');
    for (const mode of ['whole', 'parts'] as const) {
      const b = button(mode === 'whole' ? 'Whole' : 'Parts', 'btn btn-hud');
      b.title =
        mode === 'whole'
          ? 'The model assembled, as the finished thing'
          : 'Every piece laid out flat on the bed, the way it prints';
      b.addEventListener('click', () => this.setPreview(mode));
      this.viewBtns[mode] = b;
      seg.appendChild(b);
    }
    tools.appendChild(seg);

    const fit = button('Fit', 'btn btn-hud');
    fit.addEventListener('click', () => this.viewer.fitView());
    const wire = button('Wireframe', 'btn btn-hud');
    let wireOn = false;
    wire.addEventListener('click', () => {
      wireOn = !wireOn;
      wire.classList.toggle('active', wireOn);
      this.viewer.setWireframe(wireOn);
    });
    const dims = button('Dimensions', 'btn btn-hud');
    dims.title =
      'Overall size of what is on screen, measured on the model. Hide parts to measure one of them on its own.';
    dims.addEventListener('click', () => {
      const on = !this.viewer.dimensionsVisible;
      dims.classList.toggle('active', on);
      this.viewer.setDimensions(on);
    });
    tools.append(fit, wire, dims);
    this.viewportEl.appendChild(tools);

    this.partsPanel = div('hud hud-tr parts-panel');
    this.viewportEl.appendChild(this.partsPanel);

    this.refreshPresetList();
    this.refreshTemplateList();
  }

  // ------------------------------------------------------------------ events

  private onParamChange(id: string, value: ParamValue, commit: boolean): void {
    this.values = coerceAll(this.gen, { ...this.values, [id]: value });
    const spec = this.gen.params.find((p) => p.id === id);
    const debounce = commit ? 0 : (spec?.debounceMs ?? 0);
    this.rebuild(commit, debounce);
    this.syncHash();
    this.refreshResetState();
  }

  private async onFontUpload(file: File): Promise<void> {
    try {
      const entry = this.fonts.addCustom(file.name, await file.arrayBuffer());
      this.panel.setFonts(this.fonts.list());
      this.values = coerceAll(this.gen, { ...this.values, font: entry.id });
      this.panel.render(this.gen, this.values);
      this.panel.setValues(this.values);
      this.rebuild(true);
    } catch (err) {
      this.panel.setIssues([
        { level: 'error', message: String((err as Error).message ?? err), paramIds: ['font'] },
      ]);
    }
  }

  /**
   * Decode a dropped picture, keep it, and point the control at it.
   *
   * The id is a content hash, so re-dropping the same file lands on the same
   * id, the same permalink and the same cached build -- nothing rebuilds and
   * nothing is stored twice.
   */
  private async onImageUpload(file: File, paramId: string): Promise<void> {
    try {
      const bmp = await decodeImageFile(file, MAX_TRACE_PIXELS);
      const entry = this.images.add(bmp);
      // Persisting is best-effort and deliberately not awaited before the
      // build: a blocked or full IndexedDB should cost the picture its place
      // after a reload, never its place on screen now.
      void this.imageStore.put(entry.id, bmp);
      this.values = coerceAll(this.gen, { ...this.values, [paramId]: entry.id });
      this.panel.setValues(this.values);
      this.rebuild(true);
      this.syncHash();
      this.refreshResetState();
    } catch (err) {
      this.panel.setIssues([
        { level: 'error', message: String((err as Error).message ?? err), paramIds: [paramId] },
      ]);
    }
  }

  /**
   * Pull any pictures this configuration names out of storage at boot, so a
   * reloaded link shows its thumbnail rather than an empty drop zone. The build
   * runner loads them too, but only it knows; the panel needs telling.
   */
  private async hydrateImages(): Promise<void> {
    const ids = this.gen.imagesNeeded?.(this.values) ?? [];
    let any = false;
    for (const id of ids) {
      if (!id || this.images.peek(id)) continue;
      if (await this.images.load(id)) any = true;
    }
    if (any) this.panel.setValues(this.values);
  }

  private switchGenerator(id: string): void {
    this.gen = generatorById(id);
    this.values = defaultsOf(this.gen);
    this.reloadPanel();
    this.rebuild(true);
    this.syncHash();
  }

  // ------------------------------------------------------------------- build

  private rebuild(fine: boolean, debounceMs = 0): void {
    // Draft quality while the user is dragging something slow; one final
    // fine-tolerance build on release.
    const tolerance = fine
      ? TOLERANCE.normal
      : this.runner.isStruggling
        ? TOLERANCE.draft
        : TOLERANCE.normal;

    const req: BuildRequest = { generator: this.gen, params: { ...this.values }, tolerance };
    this.runner.request(req, debounceMs);
  }

  private onOutcome(outcome: BuildOutcome): void {
    if (outcome.error) {
      this.panel.setIssues([{ level: 'error', message: outcome.error }]);
      this.panel.setReadouts(undefined);
      this.setExportEnabled(false);
      this.hudEl.textContent = '';
      return;
    }

    const result = outcome.result;
    if (!result) return;
    this.lastResult = result;

    this.panel.setIssues(result.issues);
    this.panel.setReadouts(result.readouts);
    // Independent of the 3D exports: the outline resolved cleanly even if the
    // model it was going to become has a problem, and the vector file is often
    // the whole point of having built it.
    this.renderVectorButtons(result.vectors ?? []);

    const blocked = result.issues.some((i) => i.level === 'error');
    this.setExportEnabled(!blocked && result.parts.length > 0);

    if (result.parts.length === 0) {
      this.viewer.setParts([]);
      this.lastPlates = null;
      this.hudEl.textContent = '';
      return;
    }

    // Preview what will actually be printed: every part rotated into its
    // declared print orientation, dropped onto z=0 and packed on the plate.
    // Showing the raw parts instead would stack a multi-part assembly at the
    // origin, all interpenetrating.
    const bed: [number, number] = [
      Number(this.values.bedX ?? 256),
      Number(this.values.bedY ?? 256),
    ];
    // As many plates as the model needs. Needing two beds is an ordinary fact
    // about a big model, not a failure -- what used to happen here was that the
    // second bed's worth of parts was silently dropped from the preview and the
    // export, which is how a drawer came to be missing its drawer.
    const set = packPlates(result.parts, bed, this.gen.plateGap);
    this.lastPlates = set;
    this.viewer.setBed(bed[0], bed[1], set.plates.length);

    const laidCount = set.plates.reduce((n, p) => n + p.parts.length, 0);

    if (!set.fits) {
      // Only offer the bed as a remedy when this generator actually has one to
      // offer. The building generator designs to a fixed 256 mm plate and
      // declares no bed controls, so telling its user to "set a larger bed"
      // would be sending them to look for a slider that is not there.
      const adjustable = this.gen.params.some((s) => s.id === 'bedX' || s.id === 'bedY');
      this.panel.setIssues([
        ...result.issues,
        {
          level: 'error',
          message: `These parts are each larger than a ${bed[0]} x ${bed[1]} mm bed, so no number of plates will hold them: ${set.overflow.join(', ')}. Make the model smaller${adjustable ? ' or set a larger bed' : ''}.`,
          paramIds: adjustable ? ['bedX', 'bedY'] : [],
        },
      ]);
      // Only the PRINT is blocked. An assembled export is the object, not a
      // plate, so a model too big to lay out still exports fine -- and refusing
      // it would be refusing the one file that still made sense.
      this.setExportEnabled(this.exportLayout === 'assembled');
    } else if (set.plates.length > 1) {
      this.panel.setIssues([
        ...result.issues,
        {
          level: 'warn',
          message: `This does not fit one bed, so it is laid out on ${set.plates.length} plates of ${bed[0]} x ${bed[1]} mm. Exports come out one folder or file per plate.`,
          paramIds: this.gen.params.some((x) => x.id === 'bedX') ? ['bedX', 'bedY'] : [],
        },
      ]);
    }

    const firstPaint = this.lastPartCount !== laidCount;
    this.lastPartCount = laidCount;

    // A rebuild can drop the part that was soloed -- turn the maker's mark off
    // while it is the only thing showing and the viewport would go black.
    if (this.solo && !result.parts.some((x) => x.id === this.solo)) this.solo = null;

    this.refreshView(firstPaint);
    this.updateHud(result, outcome);
  }

  /** Which preview to show. Never touches what an export contains. */
  private setPreview(mode: 'whole' | 'parts'): void {
    if (this.preview === mode) return;
    this.preview = mode;
    this.refreshView(true);
  }

  /** Show one part alone, or clear it by picking the same one again. */
  private setSolo(id: string | null): void {
    this.solo = this.solo === id ? null : id;
    this.refreshView(false);
  }

  /**
   * Repaint from the LAST build.
   *
   * Switching view or soloing a part is a change of camera, not of model, so
   * neither re-runs the kernel -- on a bowl that would be half a second of dead
   * time for a question the build already answered.
   */
  private refreshView(refit: boolean): void {
    for (const mode of ['whole', 'parts'] as const) {
      this.viewBtns[mode]?.classList.toggle('active', mode === this.preview);
    }
    for (const mode of ['plate', 'assembled'] as const) {
      this.layoutBtns[mode]?.classList.toggle('active', mode === this.exportLayout);
    }
    this.viewer.setBedVisible(this.preview === 'parts');

    const result = this.lastResult;
    if (!result || result.parts.length === 0) {
      this.viewer.setParts([]);
      this.renderPartsPanel();
      return;
    }

    const shown = (id: string): boolean => this.solo === null || basePartId(id) === this.solo;

    if (this.preview === 'whole') {
      this.viewer.setParts(
        result.parts.map((part) => ({
          id: part.id,
          name: part.name,
          geometry: assembledToBufferGeometry(part.mesh, part.assembly),
          color: part.color,
          visible: shown(part.id),
        })),
      );
    } else if (this.lastPlates) {
      // Each plate is packed centred on its own origin; sliding plate 2 to the
      // right of plate 1 is a view-only shift, and the copy happens inside
      // laidOutToBufferGeometry so the export data stays on its own bed.
      const n = this.lastPlates.plates.length;
      const bedX = this.lastPlates.bed[0];
      this.viewer.setParts(
        this.lastPlates.plates.flatMap((plate, i) =>
          plate.parts.map((part) => ({
            id: part.id,
            name: part.name,
            geometry: laidOutToBufferGeometry(part, Viewer.plateOriginX(bedX, n, i)),
            color: part.color,
            visible: shown(part.id),
          })),
        ),
      );
    }

    if (refit) this.viewer.fitView();
    this.renderPartsPanel();
  }

  /** The list of parts, with a download for each and a click to isolate. */
  private renderPartsPanel(): void {
    const parts = this.lastResult?.parts ?? [];
    this.partsPanel.textContent = '';
    // One part is not a list, it is the model.
    if (parts.length < 2) return;

    const head = div('parts-head');
    head.textContent = this.solo ? 'Showing one part' : `${parts.length} parts`;
    this.partsPanel.appendChild(head);

    for (const part of parts) {
      const row = div('part-row');
      if (this.solo === part.id) row.classList.add('solo');

      const swatch = div('part-swatch');
      swatch.style.background = part.color;
      row.appendChild(swatch);

      const qty = part.quantity && part.quantity > 1 ? ` x${part.quantity}` : '';
      const name = button(part.name + qty, 'part-name');
      name.title =
        this.solo === part.id ? 'Show every part again' : `Show only the ${part.name}`;
      name.addEventListener('click', () => this.setSolo(part.id));
      row.appendChild(name);

      const dl = button('STL', 'btn btn-hud part-dl');
      dl.title = `Download the ${part.name} on its own, laid out for printing`;
      dl.disabled = !this.exportEnabled;
      dl.addEventListener('click', () => this.exportPart(part.id));
      row.appendChild(dl);

      this.partsPanel.appendChild(row);
    }
  }

  /**
   * One part on its own.
   *
   * Laid out for printing whichever view is up, and one copy however many the
   * model calls for -- you print the quantity, you do not download it.
   */
  private exportPart(id: string): void {
    const part = this.plateParts().find((x) => basePartId(x.id) === id);
    if (!part) return;
    download(
      writeBinarySTL(stlMeshOf(part), part.name),
      `${this.baseName()}-${safeFilename(part.name, id)}.stl`,
      'model/stl',
    );
  }

  private updateHud(result: BuildResult, outcome: BuildOutcome): void {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let tris = 0;
    let volume = 0;
    for (const p of result.parts) {
      minX = Math.min(minX, p.mesh.bbox.min[0]);
      minY = Math.min(minY, p.mesh.bbox.min[1]);
      minZ = Math.min(minZ, p.mesh.bbox.min[2]);
      maxX = Math.max(maxX, p.mesh.bbox.max[0]);
      maxY = Math.max(maxY, p.mesh.bbox.max[1]);
      maxZ = Math.max(maxZ, p.mesh.bbox.max[2]);
      tris += p.mesh.stats.tris;
      volume += p.mesh.stats.volumeMm3;
    }

    const badges = [
      `${(maxX - minX).toFixed(1)} × ${(maxY - minY).toFixed(1)} × ${(maxZ - minZ).toFixed(1)} mm`,
      `${tris.toLocaleString()} tris`,
      `${(volume / 1000).toFixed(2)} cm³`,
      outcome.fromCache ? 'cached' : `${outcome.ms.toFixed(0)} ms`,
    ];
    this.hudEl.innerHTML = badges
      .map((b) => `<span class="hud-badge">${b}</span>`)
      .join('');
  }

  private setBusy(busy: boolean): void {
    this.busyEl.textContent = busy ? 'Building…' : '';
  }

  private setExportEnabled(on: boolean): void {
    this.exportEnabled = on;
    for (const b of this.exportBtns) b.disabled = !on;
    for (const b of this.partsPanel?.querySelectorAll('.part-dl') ?? []) {
      (b as HTMLButtonElement).disabled = !on;
    }
  }

  // ------------------------------------------------------------------ export

  /**
   * What to call the files.
   *
   * Whatever the user typed, found through the same content/look split that
   * templates use -- so it is the name on the tag, the pet's name, the word on
   * the keychain, without the exporter having to know which field that is in
   * any given generator. `text` alone missed every generator that calls its
   * field something else.
   */
  private baseName(): string {
    for (const spec of this.gen.params) {
      if (!isContent(spec)) continue;
      // An image's value is a content hash, which would make a hostile
      // filename. What the user calls that picture is the file they dropped in,
      // so resolve it rather than skipping the field.
      if (spec.type === 'image') {
        const name = this.images.peek(String(this.values[spec.id] ?? ''))?.name;
        const stem = name?.replace(/\.[^.]+$/, '') ?? '';
        if (stem.length > 0) return safeFilename(stem, this.gen.id);
        continue;
      }
      const v = String(this.values[spec.id] ?? '').trim();
      if (v.length > 0) return safeFilename(v, this.gen.id);
    }
    return this.gen.id;
  }

  /**
   * Switch what the exported file holds, and show it.
   *
   * The preview follows this choice, and only in this direction. Wiring it the
   * other way -- exports following the viewport -- is the thing that must not
   * happen: looking at the assembled model and pressing STL would quietly hand
   * you a file you cannot print. Following the export is the safe direction and
   * answers the obvious question, which is what the file you are about to
   * download actually looks like.
   */
  private setExportLayout(mode: 'plate' | 'assembled'): void {
    if (this.exportLayout === mode) return;
    this.exportLayout = mode;
    for (const [key, btn] of Object.entries(this.layoutBtns)) {
      btn?.classList.toggle('active', key === mode);
    }
    this.setPreview(mode === 'assembled' ? 'whole' : 'parts');
    // Plate overflow disables export, but only in plate mode -- an assembled
    // file is not going on a bed, so a model too big to print in one batch is
    // still perfectly exportable as the object it is.
    this.setExportEnabled(mode === 'assembled' || (this.lastPlates?.fits ?? false));
  }

  /**
   * The parts an export should write.
   *
   * Two genuinely different answers to "what is this file". The plate is the
   * print: rotated, dropped, packed, ready to slice. Assembled is the object:
   * every piece where it belongs, still separate so it comes apart again.
   */
  private exportParts(): readonly LaidOutPart[] | null {
    if (this.exportLayout === 'assembled') {
      const parts = this.lastResult?.parts;
      return parts && parts.length > 0 ? layAssembled(parts) : null;
    }
    const parts = this.plateParts();
    return parts.length > 0 ? parts : null;
  }

  /** Every laid-out part across every plate, each stamped with its plate index. */
  private plateParts(): readonly LaidOutPart[] {
    return this.lastPlates?.plates.flatMap((p) => p.parts) ?? [];
  }

  /** How many plates the current layout needs. One, for almost everything. */
  private plateCount(): number {
    return this.exportLayout === 'assembled' ? 1 : (this.lastPlates?.plates.length ?? 1);
  }

  /** Assembled files say so in their name -- the two are not interchangeable. */
  private exportName(): string {
    const base = this.baseName();
    return this.exportLayout === 'assembled' ? `${base}-assembled` : base;
  }

  private exportStl(): void {
    const parts = this.exportParts();
    if (!parts || parts.length === 0) return;
    const base = this.exportName();

    // A single part goes out as a plain .stl; several are zipped, because STL
    // has no scene graph and merging them would read as one solid.
    if (parts.length === 1) {
      const only = parts[0]!;
      download(writeBinarySTL(stlMeshOf(only), only.name), `${base}.stl`, 'model/stl');
      return;
    }

    download(
      writeStlBundle(parts, {
        title: `${this.gen.name} - ${base}`,
        notes: this.printNotes(),
      }),
      `${base}-stl.zip`,
      'application/zip',
    );
  }

  private async export3mf(): Promise<void> {
    const parts = this.exportParts();
    if (!parts || parts.length === 0) return;
    let thumbnail: Uint8Array | undefined;
    try {
      thumbnail = new Uint8Array(await (await this.viewer.snapshot()).arrayBuffer());
    } catch {
      // A missing thumbnail is cosmetic; never block the export on it.
    }
    const title = `${this.gen.name} - ${this.exportName()}`;
    if (this.plateCount() > 1) {
      download(
        write3mfBundle(parts, {
          title,
          base: this.exportName(),
          notes: this.printNotes(),
          thumbnail,
        }),
        `${this.exportName()}-3mf.zip`,
        'application/zip',
      );
      return;
    }
    download(
      write3MF(parts, { title, thumbnail }),
      `${this.exportName()}.3mf`,
      'model/3mf',
    );
  }

  /** Orientation notes the generator declared, for the bundle readme. */
  private printNotes(): string[] {
    const notes = new Set<string>();
    if (this.exportLayout === 'assembled') {
      // Said first, because everything after it assumes the opposite. These
      // parts are where they belong in the model, not where they print.
      notes.add(
        'These parts are in ASSEMBLED position, not laid out for printing. Each is a separate body; ' +
          'orient and arrange them in your slicer, or re-export with "Flat to print".',
      );
    }
    for (const p of this.lastResult?.parts ?? []) {
      if (p.orientationNote) notes.add(`${p.name}: ${p.orientationNote}`);
    }
    return [...notes];
  }

  private renderVectorButtons(vectors: readonly VectorExport[]): void {
    const host = this.vectorRow;
    if (!host) return;
    host.textContent = '';
    for (const v of vectors) {
      const btn = button(v.label, 'btn');
      if (v.title) btn.title = v.title;
      btn.addEventListener('click', () => {
        const data = typeof v.data === 'function' ? v.data() : v.data;
        download(
          new Blob([data as BlobPart], { type: v.mime }),
          `${this.baseName()}.${v.extension}`,
          v.mime,
        );
      });
      host.appendChild(btn);
    }
  }

  private async exportPng(): Promise<void> {
    const blob = await this.viewer.snapshot();
    download(blob, `${safeFilename(String(this.values.text ?? this.gen.id), this.gen.id)}.png`, 'image/png');
  }

  // ----------------------------------------------------------------- sharing

  private syncHash(): void {
    const encoded = encodeParams(this.gen, this.values);
    history.replaceState(null, '', `#${encoded}`);
  }

  private async copyLink(btn: HTMLButtonElement): Promise<void> {
    this.syncHash();
    const original = btn.textContent;
    try {
      await navigator.clipboard.writeText(location.href);
      btn.textContent = 'Link copied';
    } catch {
      btn.textContent = 'Copy failed - use the address bar';
    }
    setTimeout(() => {
      btn.textContent = original;
    }, 1800);
  }

  // ----------------------------------------------------------------- presets

  private loadStore(): SavedPresets {
    try {
      const raw = localStorage.getItem(PRESET_STORE);
      return raw ? (JSON.parse(raw) as SavedPresets) : {};
    } catch {
      return {};
    }
  }

  private refreshPresetList(): void {
    const sel = document.getElementById('preset-sel') as HTMLSelectElement | null;
    if (!sel) return;
    sel.textContent = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Presets…';
    sel.appendChild(placeholder);

    for (const p of this.gen.presets ?? []) {
      const opt = document.createElement('option');
      opt.value = `builtin:${p.label}`;
      opt.textContent = p.label;
      sel.appendChild(opt);
    }
    const mine = this.loadStore()[this.gen.id] ?? {};
    for (const name of Object.keys(mine)) {
      const opt = document.createElement('option');
      opt.value = `mine:${name}`;
      opt.textContent = `${name} (yours)`;
      sel.appendChild(opt);
    }

    sel.onchange = () => {
      const v = sel.value;
      if (!v) return;
      const [kind, ...rest] = v.split(':');
      const name = rest.join(':');
      const patch =
        kind === 'builtin'
          ? this.gen.presets?.find((p) => p.label === name)?.values
          : this.loadStore()[this.gen.id]?.[name];
      if (patch) this.applyPreset(patch);
      sel.value = '';
    };
  }

  private applyPreset(patch: Params): void {
    this.values = coerceAll(this.gen, { ...defaultsOf(this.gen), ...patch });
    this.panel.setValues(this.values);
    this.refreshResetState();
    this.rebuild(true);
    this.syncHash();
  }

  // --------------------------------------------------------------- templates

  private loadTemplates(): SavedTemplates {
    try {
      const raw = localStorage.getItem(TEMPLATE_STORE);
      return raw ? (JSON.parse(raw) as SavedTemplates) : {};
    } catch {
      return {};
    }
  }

  private writeTemplates(store: SavedTemplates): void {
    try {
      localStorage.setItem(TEMPLATE_STORE, JSON.stringify(store));
    } catch {
      // Private-mode or blocked storage: not worth interrupting the user.
    }
  }

  private refreshTemplateList(): void {
    const sel = document.getElementById('template-sel') as HTMLSelectElement | null;
    if (!sel) return;
    sel.textContent = '';

    const mine = this.loadTemplates()[this.gen.id] ?? {};
    const names = Object.keys(mine);

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = names.length === 0 ? 'No templates yet' : 'Apply a template…';
    sel.appendChild(placeholder);
    sel.disabled = names.length === 0;

    for (const name of names) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    }

    sel.onchange = () => {
      // The selection is KEPT rather than snapped back to the placeholder, so
      // the delete button beside it has something to refer to. A template is a
      // look you work in for a while -- several names in a row -- where a
      // preset is a one-shot jump.
      this.deleteTemplateBtn.disabled = sel.value === '';
      const look = this.loadTemplates()[this.gen.id]?.[sel.value];
      if (look) this.applyTemplate(look);
    };
    this.deleteTemplateBtn.disabled = true;
  }

  /**
   * Merge a look OVER the current settings.
   *
   * The one line that matters is the spread: `this.values` first, template
   * second. A preset starts from defaults and so wipes the text; a template
   * starts from what you have, and because it carries no content keys at all,
   * the word you just typed is still there when it lands.
   */
  private applyTemplate(look: Params): void {
    this.values = coerceAll(this.gen, { ...this.values, ...look });
    this.panel.setValues(this.values);
    this.refreshResetState();
    this.rebuild(true);
    this.syncHash();
  }

  private saveTemplate(): void {
    const look = styleOf(this.gen, this.values);
    const store = this.loadTemplates();
    const mine = store[this.gen.id] ?? {};
    const name = prompt(
      `Save the look as a template.\n\nThe ${Object.keys(look).length} style settings are saved; the text is not, so you can apply this to any word.`,
      '',
    );
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    if (
      Object.prototype.hasOwnProperty.call(mine, trimmed) &&
      !confirm(`"${trimmed}" already exists. Replace it?`)
    ) {
      return;
    }
    store[this.gen.id] = { ...mine, [trimmed]: look };
    this.writeTemplates(store);
    this.refreshTemplateList();
    const sel = document.getElementById('template-sel') as HTMLSelectElement | null;
    if (sel) {
      sel.value = trimmed;
      this.deleteTemplateBtn.disabled = false;
    }
  }

  private deleteTemplate(): void {
    const sel = document.getElementById('template-sel') as HTMLSelectElement | null;
    const name = sel?.value;
    if (!name) return;
    if (!confirm(`Delete the template "${name}"? This cannot be undone.`)) return;
    const store = this.loadTemplates();
    const mine = { ...(store[this.gen.id] ?? {}) };
    delete mine[name];
    store[this.gen.id] = mine;
    this.writeTemplates(store);
    this.refreshTemplateList();
  }

  private savePreset(): void {
    const name = prompt('Save this configuration as:');
    if (!name) return;
    const store = this.loadStore();
    store[this.gen.id] = { ...(store[this.gen.id] ?? {}), [name]: { ...this.values } };
    try {
      localStorage.setItem(PRESET_STORE, JSON.stringify(store));
    } catch {
      // Private-mode or blocked storage: not worth interrupting the user.
    }
    this.refreshPresetList();
  }
}

function div(className: string): HTMLElement {
  const d = document.createElement('div');
  d.className = className;
  return d;
}

function button(label: string, className: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = className;
  b.textContent = label;
  return b;
}

/**
 * Strip the copy suffix the plate packer adds to a repeated part.
 *
 * `packPlate` expands a quantity into `dome#1`, `dome#2` and so on, so the
 * viewport and the parts list are keyed differently. Everything the user picks
 * is a PART, not a copy of one, so both resolve back to the same id.
 */
function basePartId(id: string): string {
  const hash = id.indexOf('#');
  return hash < 0 ? id : id.slice(0, hash);
}

/**
 * A laid-out part in the shape `writeBinarySTL` wants.
 *
 * The stats are placeholders on purpose: STL carries no volume, area or genus,
 * and the packer has already discarded the solid they would have come from.
 */
function stlMeshOf(part: LaidOutPart): RawMesh {
  return {
    position: part.positions,
    index: part.index,
    numProp: 3,
    bbox: { min: [0, 0, 0], max: part.size },
    stats: { volumeMm3: 0, areaMm2: 0, genus: 0, tris: part.index.length / 3 },
  };
}
