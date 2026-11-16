/**
 * The undo offer's life, framework-free: one offer shown at a time, its timer (paused while the
 * user is on it or the page is hidden), what closing, expiring and being replaced mean, coalescing
 * a burst into one offer, and an undo that is guarded while it runs and kept on screen if it fails.
 *
 * Renderers subscribe to it (`subscribe` + `current`, the shape React's `useSyncExternalStore`
 * wants). The React toast is `undo-toast/react`; any other renderer reads the same view.
 */

import { advise, type Advice, type PauseReason } from './advise.js';
import type { ActionContext, PresetName } from './spec.js';

export interface OfferInput {
  /** The text: past tense, object first ("“Intro” removed"). A function receives the count of a coalesced burst. */
  message: string | ((count: number) => string);
  /** Take the action back: restore what the user sees (and, for a compensating action, the data). */
  undo: () => unknown;
  /** For a deferred action: send it. Runs once, when the window ends without an undo. */
  commit?: () => unknown;
  /** How to offer it. Default: `advise(context)`. */
  advice?: Advice;
  /** What `advise` is told when `advice` is not given (a preset name or a context). */
  context?: PresetName | ActionContext;
  /** Offers with the same key merge while one shows, when the advice says `coalesce`. */
  key?: string;
}

/** What a renderer shows. */
export interface OfferView {
  id: number;
  message: string;
  count: number;
  advice: Advice;
  /** `shown`; `undoing` while the undo runs (ignore presses); `failed` when it threw (offer Try again). */
  status: 'shown' | 'undoing' | 'failed';
  error?: unknown;
  /** True while a pause reason holds the timer. */
  paused: boolean;
}

export interface UndoOffers {
  /**
   * Offer undo for an action that just happened; replaces (and retires) any offer showing. Returns
   * its id, or null when the advice says no toast (`surface: 'none'`: the result is its own feedback).
   * Throws when the advice says the action needed a confirmation or a pending control instead.
   */
  offer(input: OfferInput): number | null;
  /** Undo the offer showing (all of a coalesced burst, newest first). Resolves true when it worked. */
  undo(): Promise<boolean>;
  /** The user closed the toast: commit a deferred action now, or just hide it. */
  close(): void;
  /** Hold or release the timer for one reason (hover, focus, touch, hidden). */
  hold(reason: PauseReason, on: boolean): void;
  /** Commit a deferred offer now (call it on `pagehide`); the toast goes away. */
  flush(): void;
  /** The offer showing, or null. Same object until something changes. */
  current(): OfferView | null;
  /** Called after every change. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export interface UndoOffersOptions {
  /** Timers and clock, for tests. Default: the global ones. */
  timers?: {
    setTimeout(fn: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
    now(): number;
  };
  /** Told when a commit or an undo throws. Default: `console.error`. */
  onError?: (error: unknown, phase: 'commit' | 'undo') => void;
}

const defaultTimers = {
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

interface Live {
  view: OfferView;
  input: OfferInput;
  entries: Array<Pick<OfferInput, 'undo' | 'commit'>>;
  remaining: number | null;
  startedAt: number;
  holds: Set<PauseReason>;
  timer: unknown;
}

/** Create an undo-offer store. Most apps need one, shared by the whole page. */
export function createUndoOffers({ timers = defaultTimers, onError = (e, phase) => console.error(`undo-toast: ${phase} failed`, e) }: UndoOffersOptions = {}): UndoOffers {
  let live: Live | null = null;
  let seq = 0;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const textOf = (input: OfferInput, count: number) =>
    typeof input.message === 'function' ? input.message(count) : count > 1 ? `${input.message} (${count})` : input.message;

  function update(patch: Partial<OfferView>) {
    if (!live) return;
    live.view = { ...live.view, ...patch };
    emit();
  }

  function stopTimer(l: Live) {
    if (l.timer !== undefined) timers.clearTimeout(l.timer);
    l.timer = undefined;
    if (l.remaining !== null && !l.view.paused) l.remaining -= timers.now() - l.startedAt;
  }

  function startTimer(l: Live) {
    if (l.remaining === null || l.holds.size > 0) return;
    l.startedAt = timers.now();
    l.timer = timers.setTimeout(() => {
      if (live === l) retire('expire');
    }, Math.max(0, l.remaining));
  }

  function commitAll(entries: Live['entries']) {
    for (const e of entries) {
      if (!e.commit) continue;
      try {
        Promise.resolve(e.commit()).catch((err) => onError(err, 'commit'));
      } catch (err) {
        onError(err, 'commit');
      }
    }
  }

  /** End the offer showing: as it expires, as the user closes it, or because a new one replaces it. */
  function retire(how: 'expire' | 'close') {
    const l = live;
    if (!l) return;
    stopTimer(l);
    live = null;
    const policy = how === 'close' ? l.view.advice.onClose : l.view.advice.onExpire;
    // A failed undo has already restored nothing; a deferred action still commits unless undone.
    if (policy === 'commit' && l.view.status !== 'undoing') commitAll(l.entries);
    emit();
  }

  return {
    offer(input) {
      const advice = input.advice ?? advise(input.context ?? {});
      if (advice.surface === 'none') return null;
      if (advice.surface !== 'toast') {
        const why = advice.reasons.at(-1)?.why ?? '';
        throw new Error(`undo-toast: this action calls for '${advice.surface}', not an undo toast. ${why}`);
      }
      const l = live;
      if (l && advice.coalesce && input.key !== undefined && l.input.key === input.key && l.view.status === 'shown') {
        stopTimer(l);
        l.entries.push({ undo: input.undo, commit: input.commit });
        l.remaining = advice.durationMs;
        l.input = input;
        const count = l.view.count + 1;
        live = l;
        update({ message: textOf(input, count), count, advice });
        startTimer(l);
        return l.view.id;
      }
      if (l) retire('expire');
      const id = ++seq;
      const next: Live = {
        view: { id, message: textOf(input, 1), count: 1, advice, status: 'shown', paused: false },
        input,
        entries: [{ undo: input.undo, commit: input.commit }],
        remaining: advice.durationMs,
        startedAt: timers.now(),
        holds: new Set(),
        timer: undefined,
      };
      live = next;
      startTimer(next);
      emit();
      return id;
    },

    async undo() {
      const l = live;
      if (!l || l.view.status === 'undoing') return false;
      stopTimer(l);
      update({ status: 'undoing', error: undefined });
      try {
        for (const e of [...l.entries].reverse()) await e.undo();
      } catch (error) {
        onError(error, 'undo');
        if (live === l) {
          // Keep it on screen until the user retries or closes it: the undo did not happen.
          l.remaining = null;
          update({ status: 'failed', error });
        }
        return false;
      }
      if (live === l) {
        live = null;
        emit();
      }
      return true;
    },

    close() {
      retire('close');
    },

    hold(reason, on) {
      const l = live;
      if (!l || !l.view.advice.pauseOn.includes(reason)) return;
      if (on === l.holds.has(reason)) return;
      if (on) {
        if (l.holds.size === 0) stopTimer(l);
        l.holds.add(reason);
        update({ paused: true });
        return;
      }
      l.holds.delete(reason);
      if (l.holds.size > 0) return;
      if (l.remaining !== null) l.remaining = Math.max(l.remaining, l.view.advice.resumeMinMs);
      update({ paused: false });
      if (l.view.status === 'shown') startTimer(l);
    },

    flush() {
      if (live && live.view.advice.onExpire === 'commit') retire('expire');
    },

    current: () => live?.view ?? null,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Wire an offer store to the page: pause while the tab is hidden, commit deferred offers on
 * `pagehide` (a closed tab must not lose a send). Returns the cleanup. The React toast calls it.
 */
export function bindDocument(offers: UndoOffers, doc: Document = document): () => void {
  const win = doc.defaultView;
  const onVisibility = () => offers.hold('hidden', doc.visibilityState === 'hidden');
  const onPageHide = () => offers.flush();
  doc.addEventListener('visibilitychange', onVisibility);
  win?.addEventListener('pagehide', onPageHide);
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    win?.removeEventListener('pagehide', onPageHide);
  };
}
