import type { Bitmap, Mask } from '../core/image/types';
import type { FontEntry } from '../core/text/fonts';
import { isVisible } from '../core/params/validate';
import type { Generator, Issue, ParamSpec, ParamValue, Params } from '../core/params/types';

export interface PanelCallbacks {
  /** commit=false while dragging, true on release / blur. */
  onChange(id: string, value: ParamValue, commit: boolean): void;
  onFontUpload(file: File): void;
  onImageUpload(file: File, paramId: string): void;
}

interface Row {
  readonly spec: ParamSpec;
  readonly wrap: HTMLElement;
  setValue(v: ParamValue): void;
  setIssue(level: 'error' | 'warn' | null): void;
}

/**
 * Renders the sidebar from a generator's parameter schema. Knows nothing
 * about any specific generator -- that is the whole point of the schema.
 */
/** One sidebar tab: its button, the group sections under it, and their rows. */
interface Tab {
  readonly name: string;
  readonly btn: HTMLButtonElement;
  readonly sections: HTMLElement[];
  readonly rows: Row[];
}

export class Panel {
  private rows: Row[] = [];
  private values: Params = {};
  private advancedOpen = false;
  private readoutHost: HTMLElement | null = null;
  private issueHost: HTMLElement | null = null;
  private tabs: Tab[] = [];
  private tabBar: HTMLElement | null = null;
  /**
   * Remembered by NAME across re-renders of the SAME generator -- applying a
   * preset should not throw you back to the first tab.
   *
   * Reset when the generator changes, though. Carrying it over means opening a
   * fresh model and landing on Printer, which is a stranger place to start than
   * anywhere the remembering was meant to save you from.
   */
  private activeTab = '';
  private lastGenId = '';
  /**
   * Repaint hooks for image controls. Kept as a list rather than folded into
   * Row.setValue because an image preview depends on OTHER parameters -- move
   * the threshold and the picture has to redraw, though nothing set the picture.
   */
  private previews: (() => void)[] = [];
  private previewFrame = 0;

  constructor(
    private readonly host: HTMLElement,
    private readonly cb: PanelCallbacks,
    private fonts: readonly FontEntry[],
    private readonly images: (id: string) => Bitmap | undefined = () => undefined,
  ) {}

  setFonts(fonts: readonly FontEntry[]): void {
    this.fonts = fonts;
  }

  render(gen: Generator, values: Params): void {
    if (gen.id !== this.lastGenId) this.activeTab = '';
    this.lastGenId = gen.id;
    this.values = { ...values };
    this.rows = [];
    this.previews = [];
    this.tabs = [];
    this.host.textContent = '';

    this.issueHost = el('div', 'issues');
    this.host.appendChild(this.issueHost);

    // The tab bar goes in before the groups, but its buttons are only known
    // once the groups have been walked -- so reserve the element now and fill
    // it as each new tab name turns up.
    this.tabBar = el('div', 'tabs');
    this.host.appendChild(this.tabBar);

    const byGroup = new Map<string, ParamSpec[]>();
    for (const spec of gen.params) {
      const list = byGroup.get(spec.group) ?? [];
      list.push(spec);
      byGroup.set(spec.group, list);
    }

    for (const group of gen.groups) {
      const specs = byGroup.get(group.id);
      if (!specs || specs.length === 0) continue;

      const tab = this.tabFor(group.tab ?? '');
      const details = document.createElement('details');
      details.className = 'group';
      details.open = !group.collapsed;
      const summary = document.createElement('summary');
      summary.textContent = group.label;
      details.appendChild(summary);

      const body = el('div', 'group-body');
      details.appendChild(body);

      let anyAdvanced = false;
      for (const spec of specs) {
        if (spec.advanced) anyAdvanced = true;
        const row = this.buildRow(spec);
        this.rows.push(row);
        tab.rows.push(row);
        body.appendChild(row.wrap);
      }

      if (anyAdvanced) {
        const toggle = el('button', 'btn btn-sub');
        toggle.textContent = this.advancedOpen ? 'Hide advanced' : 'Show advanced';
        toggle.addEventListener('click', () => {
          this.advancedOpen = !this.advancedOpen;
          toggle.textContent = this.advancedOpen ? 'Hide advanced' : 'Show advanced';
          this.applyVisibility();
        });
        body.appendChild(toggle);
      }

      tab.sections.push(details);
      this.host.appendChild(details);
    }

    this.readoutHost = el('div', 'readouts');
    this.host.appendChild(this.readoutHost);

    // A single unnamed tab is the old plain list: no bar, nothing to choose.
    const tabbed = this.tabs.length > 1;
    this.tabBar.hidden = !tabbed;
    const keep = this.tabs.find((t) => t.name === this.activeTab);
    this.activeTab = (keep ?? this.tabs[0])?.name ?? '';
    this.applyVisibility();
  }

  /** The tab of this name, created and added to the bar on first sight. */
  private tabFor(name: string): Tab {
    const found = this.tabs.find((t) => t.name === name);
    if (found) return found;

    const btn = el('button', 'tab') as HTMLButtonElement;
    btn.type = 'button';
    btn.textContent = name;
    btn.addEventListener('click', () => this.setTab(name));
    this.tabBar?.appendChild(btn);

    const tab: Tab = { name, btn, sections: [], rows: [] };
    this.tabs.push(tab);
    return tab;
  }

  private setTab(name: string): void {
    if (this.activeTab === name) return;
    this.activeTab = name;
    this.applyVisibility();
    // Back to the top: the tab you just opened starts at its first control,
    // not wherever the last one happened to be scrolled to.
    this.host.scrollTo({ top: 0 });
  }

  /** Push new values in without rebuilding the DOM (presets, permalinks). */
  setValues(values: Params): void {
    this.values = { ...values };
    for (const row of this.rows) {
      const v = this.values[row.spec.id];
      if (v !== undefined) row.setValue(v);
    }
    this.applyVisibility();
  }

  setIssues(issues: readonly Issue[]): void {
    if (!this.issueHost) return;
    this.issueHost.textContent = '';

    const flagged = new Map<string, 'error' | 'warn'>();
    for (const i of issues) {
      for (const id of i.paramIds ?? []) {
        if (i.level === 'error' || !flagged.has(id)) flagged.set(id, i.level);
      }
      const box = el('div', `issue issue-${i.level}`);
      box.textContent = i.message;
      this.issueHost.appendChild(box);
    }
    for (const row of this.rows) {
      row.setIssue(flagged.get(row.spec.id) ?? null);
    }

    // Tabs must never hide a problem. The message is always visible above the
    // bar, but the control it is about may be two tabs away, so the tab holding
    // it gets a marker -- error beats warning, since that is the one that
    // blocks the export.
    for (const tab of this.tabs) {
      let mark: 'error' | 'warn' | null = null;
      for (const row of tab.rows) {
        const level = flagged.get(row.spec.id);
        if (level === 'error') {
          mark = 'error';
          break;
        }
        if (level === 'warn') mark = 'warn';
      }
      tab.btn.classList.toggle('has-error', mark === 'error');
      tab.btn.classList.toggle('has-warn', mark === 'warn');
    }
  }

  setReadouts(readouts: Readonly<Record<string, string>> | undefined): void {
    if (!this.readoutHost) return;
    this.readoutHost.textContent = '';
    if (!readouts) return;
    for (const [k, v] of Object.entries(readouts)) {
      const row = el('div', 'readout');
      const label = el('span', 'readout-k');
      label.textContent = k;
      const val = el('span', 'readout-v');
      val.textContent = v;
      row.append(label, val);
      this.readoutHost.appendChild(row);
    }
  }

  private applyVisibility(): void {
    for (const row of this.rows) {
      const hiddenByDep = !isVisible(row.spec, this.values);
      const hiddenByAdv = row.spec.advanced === true && !this.advancedOpen;
      row.wrap.hidden = hiddenByDep || hiddenByAdv;
    }

    // A tab whose every control is currently hidden by a visibleIf is a tab
    // that opens onto nothing, so it goes from the bar until it has something
    // to show again. Switching the roof to Flat should not leave a Facade tab
    // with a heading and no controls under it.
    const live = this.tabs.filter((t) => t.rows.some((r) => !r.wrap.hidden));
    if (live.length > 0 && !live.some((t) => t.name === this.activeTab)) {
      this.activeTab = live[0]!.name;
    }
    for (const tab of this.tabs) {
      const usable = live.includes(tab);
      const on = usable && tab.name === this.activeTab;
      tab.btn.hidden = !usable;
      tab.btn.classList.toggle('active', on);
      // Only the active tab's sections are in the document flow. Hiding the
      // SECTION rather than each row keeps the group headings with them.
      for (const section of tab.sections) section.hidden = this.tabs.length > 1 && !on;
    }
    this.schedulePreviews();
  }

  /**
   * Coalesce preview repaints onto one frame. A dragged slider fires on every
   * mousemove, and re-thresholding a few hundred thousand pixels per event --
   * on top of the build already doing exactly that -- is how a smooth control
   * turns into a stuttering one.
   */
  private schedulePreviews(): void {
    if (this.previews.length === 0 || this.previewFrame !== 0) return;
    this.previewFrame = requestAnimationFrame(() => {
      this.previewFrame = 0;
      for (const paint of this.previews) paint();
    });
  }

  private emit(spec: ParamSpec, value: ParamValue, commit: boolean): void {
    this.values[spec.id] = value;
    this.applyVisibility();
    this.cb.onChange(spec.id, value, commit);
  }

  private buildRow(spec: ParamSpec): Row {
    const wrap = el('div', 'row');
    const head = el('div', 'row-head');
    const label = el('label', 'row-label');
    label.textContent = spec.label;
    head.appendChild(label);
    wrap.appendChild(head);

    let setValue: (v: ParamValue) => void = () => {};

    switch (spec.type) {
      case 'number': {
        const readout = el('span', 'row-value');
        head.appendChild(readout);

        const range = document.createElement('input');
        range.type = 'range';
        range.min = String(spec.min);
        range.max = String(spec.max);
        range.step = String(spec.step);

        const numInput = document.createElement('input');
        numInput.type = 'number';
        numInput.className = 'num';
        numInput.min = String(spec.min);
        numInput.max = String(spec.max);
        numInput.step = String(spec.step);

        const show = (n: number) => {
          readout.textContent = `${fmt(n, spec.step)}${spec.unit ? ` ${spec.unit}` : ''}`;
        };

        range.addEventListener('input', () => {
          const n = Number(range.value);
          numInput.value = String(n);
          show(n);
          this.emit(spec, n, false);
        });
        range.addEventListener('change', () => this.emit(spec, Number(range.value), true));
        numInput.addEventListener('change', () => {
          const n = Math.min(spec.max, Math.max(spec.min, Number(numInput.value)));
          numInput.value = String(n);
          range.value = String(n);
          show(n);
          this.emit(spec, n, true);
        });

        const pair = el('div', 'pair');
        pair.append(range, numInput);
        wrap.appendChild(pair);

        setValue = (v) => {
          const n = Number(v);
          range.value = String(n);
          numInput.value = String(n);
          show(n);
        };
        break;
      }

      case 'bool': {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'check';
        label.prepend(input);
        input.addEventListener('change', () => this.emit(spec, input.checked, true));
        setValue = (v) => {
          input.checked = v === true || v === 'true';
        };
        break;
      }

      case 'text': {
        if (spec.multiline) {
          const ta = document.createElement('textarea');
          ta.rows = 2;
          ta.maxLength = spec.maxLength;
          if (spec.placeholder) ta.placeholder = spec.placeholder;
          ta.addEventListener('input', () => this.emit(spec, ta.value, false));
          ta.addEventListener('change', () => this.emit(spec, ta.value, true));
          wrap.appendChild(ta);
          setValue = (v) => {
            if (ta.value !== String(v)) ta.value = String(v);
          };
        } else {
          const input = document.createElement('input');
          input.type = 'text';
          input.maxLength = spec.maxLength;
          if (spec.placeholder) input.placeholder = spec.placeholder;
          input.addEventListener('input', () => this.emit(spec, input.value, false));
          input.addEventListener('change', () => this.emit(spec, input.value, true));
          wrap.appendChild(input);
          setValue = (v) => {
            if (input.value !== String(v)) input.value = String(v);
          };
        }
        break;
      }

      case 'choice': {
        const sel = document.createElement('select');
        for (const o of spec.options) {
          const opt = document.createElement('option');
          opt.value = o.value;
          opt.textContent = o.label;
          sel.appendChild(opt);
        }
        sel.addEventListener('change', () => this.emit(spec, sel.value, true));
        wrap.appendChild(sel);
        setValue = (v) => {
          sel.value = String(v);
        };
        break;
      }

      case 'font': {
        const sel = document.createElement('select');
        const refresh = (current: string) => {
          sel.textContent = '';
          for (const f of this.fonts) {
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = f.custom ? `${f.label} (yours)` : f.label;
            sel.appendChild(opt);
          }
          sel.value = current;
        };
        refresh(String(spec.default));
        sel.addEventListener('change', () => {
          this.emit(spec, sel.value, true);
          this.showFontNote(wrap, sel.value);
        });
        wrap.appendChild(sel);

        const upload = document.createElement('input');
        upload.type = 'file';
        upload.accept = '.ttf,.otf,.woff';
        upload.className = 'file';
        upload.addEventListener('change', () => {
          const file = upload.files?.[0];
          if (file) this.cb.onFontUpload(file);
          upload.value = '';
        });
        const uploadLabel = el('label', 'hint upload');
        uploadLabel.textContent = 'Load your own font (.ttf, .otf, .woff)';
        uploadLabel.appendChild(upload);
        wrap.appendChild(uploadLabel);

        setValue = (v) => {
          refresh(String(v));
          this.showFontNote(wrap, String(v));
        };
        break;
      }

      case 'image': {
        const zone = el('div', 'drop');
        zone.tabIndex = 0;
        zone.setAttribute('role', 'button');
        const canvas = document.createElement('canvas');
        canvas.className = 'drop-canvas';
        const cap = el('div', 'drop-cap');
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = spec.accept ?? 'image/*';
        input.className = 'file';
        zone.append(canvas, cap, input);

        const clear = el('button', 'btn btn-sub');
        clear.textContent = 'Remove picture';

        const take = (file: File | null | undefined): void => {
          if (file) this.cb.onImageUpload(file, spec.id);
        };
        zone.addEventListener('click', () => input.click());
        zone.addEventListener('keydown', (ev) => {
          const key = (ev as KeyboardEvent).key;
          if (key === 'Enter' || key === ' ') {
            ev.preventDefault();
            input.click();
          }
        });
        input.addEventListener('change', () => {
          take(input.files?.[0]);
          // Clearing the input is what lets the SAME file be picked twice --
          // after a failed decode, otherwise 'change' never fires again.
          input.value = '';
        });
        for (const name of ['dragenter', 'dragover']) {
          zone.addEventListener(name, (ev) => {
            ev.preventDefault();
            zone.classList.add('over');
          });
        }
        for (const name of ['dragleave', 'dragend']) {
          zone.addEventListener(name, () => zone.classList.remove('over'));
        }
        zone.addEventListener('drop', (ev) => {
          ev.preventDefault();
          zone.classList.remove('over');
          take((ev as DragEvent).dataTransfer?.files?.[0]);
        });
        clear.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.emit(spec, '', true);
        });

        wrap.append(zone, clear);

        const paint = (): void => {
          const id = String(this.values[spec.id] ?? '');
          clear.hidden = id.length === 0;
          const bmp = id.length > 0 ? this.images(id) : undefined;
          if (!bmp) {
            canvas.hidden = true;
            cap.textContent =
              id.length === 0
                ? 'Drop an image here, or click to choose'
                : 'That picture is not on this device - drop the file in again';
            return;
          }
          canvas.hidden = false;
          const mask = spec.preview?.(this.values, bmp);
          if (mask) paintMask(canvas, mask);
          else paintBitmap(canvas, bmp);
          cap.textContent = `${bmp.name ?? 'Picture'} - ${bmp.width} x ${bmp.height} px`;
        };
        this.previews.push(paint);
        setValue = () => paint();
        break;
      }

      case 'color': {
        const input = document.createElement('input');
        input.type = 'color';
        input.className = 'color';
        input.addEventListener('input', () => this.emit(spec, input.value, false));
        input.addEventListener('change', () => this.emit(spec, input.value, true));
        head.appendChild(input);
        setValue = (v) => {
          input.value = String(v);
        };
        break;
      }
    }

    if (spec.help) {
      const help = el('div', 'hint');
      help.textContent = spec.help;
      wrap.appendChild(help);
    }

    const setIssue = (level: 'error' | 'warn' | null) => {
      wrap.classList.toggle('has-error', level === 'error');
      wrap.classList.toggle('has-warn', level === 'warn');
    };

    return { spec, wrap, setValue, setIssue };
  }

  private showFontNote(wrap: HTMLElement, id: string): void {
    wrap.querySelector('.font-note')?.remove();
    const note = this.fonts.find((f) => f.id === id)?.note;
    if (!note) return;
    const box = el('div', 'hint font-note');
    box.textContent = note;
    wrap.appendChild(box);
  }
}

function el(tag: string, className = ''): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** Ink and paper in the preview, matching the way the 3D view reads. */
const INK = [232, 236, 244] as const;
const PAPER = [27, 30, 36] as const;

function paintMask(canvas: HTMLCanvasElement, mask: Mask): void {
  const img = new ImageData(mask.w, mask.h);
  for (let i = 0; i < mask.bits.length; i++) {
    const c = mask.bits[i] === 1 ? INK : PAPER;
    const o = i * 4;
    img.data[o] = c[0];
    img.data[o + 1] = c[1];
    img.data[o + 2] = c[2];
    img.data[o + 3] = 255;
  }
  blit(canvas, img);
}

function paintBitmap(canvas: HTMLCanvasElement, bmp: Bitmap): void {
  const img = new ImageData(bmp.width, bmp.height);
  for (let i = 0; i < bmp.gray.length; i++) {
    const v = bmp.gray[i]!;
    const o = i * 4;
    img.data[o] = v;
    img.data[o + 1] = v;
    img.data[o + 2] = v;
    img.data[o + 3] = 255;
  }
  blit(canvas, img);
}

/**
 * Scale an ImageData into the visible canvas.
 *
 * Via an intermediate canvas because putImageData ignores every transform and
 * writes pixel for pixel, so a 600px mask would land as the top-left corner of
 * a 260px box. drawImage is also what brings the smoothing that makes a
 * downscaled mask readable rather than aliased into confetti.
 */
function blit(dst: HTMLCanvasElement, img: ImageData): void {
  const src = document.createElement('canvas');
  src.width = img.width;
  src.height = img.height;
  const sg = src.getContext('2d');
  if (!sg) return;
  sg.putImageData(img, 0, 0);

  const scale = Math.min(260 / img.width, 170 / img.height, 3);
  dst.width = Math.max(1, Math.round(img.width * scale));
  dst.height = Math.max(1, Math.round(img.height * scale));
  const g = dst.getContext('2d');
  if (!g) return;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.clearRect(0, 0, dst.width, dst.height);
  g.drawImage(src, 0, 0, dst.width, dst.height);
}

function fmt(n: number, step: number): string {
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return n.toFixed(decimals);
}
