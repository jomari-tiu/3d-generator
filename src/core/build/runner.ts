import { withArena } from '../kernel/manifold';
import type { ImageRegistry } from '../image/registry';
import { DEFAULT_TOLERANCE } from '../text/textSolid';
import type { FontRegistry } from '../text/fonts';
import type { BuildCtx, BuildResult, Generator, Issue, Params } from '../params/types';
import { hashKey } from '../params/validate';

/** Tolerance presets, in mm of bezier flattening error. */
export const TOLERANCE = { draft: 0.05, normal: DEFAULT_TOLERANCE, fine: 0.01 } as const;

export interface BuildRequest {
  readonly generator: Generator;
  readonly params: Params;
  readonly tolerance: number;
}

export interface BuildOutcome {
  readonly result: BuildResult | null;
  readonly error: string | null;
  readonly ms: number;
  readonly fromCache: boolean;
}

/**
 * Runs builds with latest-wins coalescing: at most one build in flight, a
 * newer request replaces any queued one, and stale results are dropped.
 *
 * Numeric sliders deliberately pass debounce 0 and rely on this gate instead,
 * which self-tunes to the build cost -- a 12ms build feels like 60fps, a 200ms
 * build like 5fps, and neither queues a backlog or loses the final value.
 *
 * This is intentionally the same shape a Web Worker client would have, so the
 * kernel can move off the main thread without touching anything above here.
 */
export class BuildRunner {
  private inflight = false;
  private queued: BuildRequest | null = null;
  private timer: number | undefined;
  private lastKey = '';
  private lastOutcome: BuildOutcome | null = null;
  private slowSince = 0;

  constructor(
    private readonly fonts: FontRegistry,
    private readonly images: ImageRegistry,
    private readonly onOutcome: (outcome: BuildOutcome, req: BuildRequest) => void,
    private readonly onBusy: (busy: boolean) => void,
  ) {}

  /** Is a build currently taking long enough to warrant draft quality? */
  get isStruggling(): boolean {
    return this.slowSince > 0 && performance.now() - this.slowSince > 400;
  }

  request(req: BuildRequest, debounceMs: number): void {
    this.queued = req;
    clearTimeout(this.timer);
    if (debounceMs <= 0) {
      this.pump();
    } else {
      this.timer = setTimeout(() => this.pump(), debounceMs) as unknown as number;
    }
  }

  private pump(): void {
    if (this.inflight || !this.queued) return;
    const req = this.queued;
    this.queued = null;

    const key = hashKey(req.generator.id, req.params, req.tolerance);
    if (key === this.lastKey && this.lastOutcome) {
      // Dragging a slider back to an already-computed value costs nothing.
      this.onOutcome({ ...this.lastOutcome, fromCache: true }, req);
      return;
    }

    this.inflight = true;
    this.onBusy(true);
    const started = performance.now();
    this.slowSince = started;

    void this.run(req)
      .then((outcome) => {
        this.lastKey = key;
        this.lastOutcome = outcome;
        this.onOutcome(outcome, req);
      })
      .finally(() => {
        this.inflight = false;
        this.slowSince = 0;
        this.onBusy(false);
        // Drain anything that arrived while this build was running.
        if (this.queued) this.pump();
      });
  }

  private async run(req: BuildRequest): Promise<BuildOutcome> {
    const t0 = performance.now();

    // Fonts are plain JS and must be loaded before entering the arena.
    for (const id of req.generator.fontsNeeded?.(req.params) ?? []) {
      if (!this.fonts.peek(id)) {
        try {
          await this.fonts.load(id);
        } catch (err) {
          return {
            result: null,
            error: `Could not load font "${id}": ${String((err as Error).message ?? err)}`,
            ms: performance.now() - t0,
            fromCache: false,
          };
        }
      }
    }

    // Images are plain TypedArrays and, like fonts, have to be resolved before
    // the arena opens. Unlike a font, a MISSING one is not an error: an id this
    // browser has never seen is what a shared permalink looks like from the
    // other end, and the generator reports it in its own words.
    for (const id of req.generator.imagesNeeded?.(req.params) ?? []) {
      if (id && !this.images.peek(id)) await this.images.load(id);
    }

    const preIssues = req.generator.validate?.(req.params) ?? [];
    if (preIssues.some((i) => i.level === 'error')) {
      return {
        result: { parts: [], issues: preIssues },
        error: null,
        ms: performance.now() - t0,
        fromCache: false,
      };
    }

    try {
      const result = await withArena((m) => {
        const collected: Issue[] = [];
        const ctx: BuildCtx = {
          m,
          font: (id) => this.fonts.get(id),
          image: (id) => this.images.peek(id),
          tolerance: req.tolerance,
          issue: (i) => collected.push(i),
        };
        const out = req.generator.build(req.params, ctx);
        return { ...out, issues: [...preIssues, ...collected, ...out.issues] };
      });
      return { result, error: null, ms: performance.now() - t0, fromCache: false };
    } catch (err) {
      return {
        result: null,
        error: String((err as Error)?.message ?? err),
        ms: performance.now() - t0,
        fromCache: false,
      };
    }
  }
}
