/**
 * The undo offer's life, framework-free: one offer shown at a time, its timer (paused while the
 * user is on the toast or the page is hidden), what closing, expiring and being replaced mean,
 * coalescing a burst into one offer, and an undo that is guarded while it runs, kept on screen if
 * it fails, and never followed by a commit of what the user asked to cancel.
 *
 * Renderers subscribe to it (`subscribe` + `current`, the shape React's `useSyncExternalStore`
 * wants) and wire the page with `bindPage` (keys, hidden tab, `pagehide`). The React toast is
 * `undo-toast/react`; any other renderer reads the same view and calls the same `bindPage`.
 */

import { advise, type Advice, type PauseReason } from './advise.js';
import type { ActionContext, PresetName } from './spec.js';

export interface OfferInput {
  /** The text: past tense, object first ("“Intro” removed"). A function receives the count of a coalesced burst. */
  message: string | ((count: number) => string);
  /**
   * Take the action back: restore what the user sees (and, for a compensating action, the data).
   * It failed when it throws, rejects, or returns `false` or `{ ok: false }` (acture's and zodal's
   * convention; see `isFailure`).
   */
  undo: () => unknown;
  /** For a deferred action: send it. Runs once, when the window ends without an undo. */
  commit?: () => unknown;
  /** How to offer it. Default: `advise(context)`, re-run with the count when a burst merges. */
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
  /** `shown`; `undoing` while the undo runs (ignore presses); `failed` when it failed (offer Try again). */
  status: 'shown' | 'undoing' | 'failed';
  error?: unknown;
  /** True while a pause reason holds the timer. */
  paused: boolean;
}

export interface UndoOffers {
  /**
   * Offer undo for an action that just happened; replaces (and retires) any offer showing, or waits
   * until an undo in progress has settled. Returns its id, or null when the advice says no toast
   * (`surface: 'none'`: the result is its own feedback). Throws when the advice says the action
   * needed a confirmation or a pending control instead.
   */
  offer(input: OfferInput): number | null;
  /** Undo the offer showing (all of a coalesced burst, newest first). Resolves true when it worked. */
  undo(): Promise<boolean>;
  /** The user closed the toast: commit a deferred action now, or just hide it. */
  close(): void;
  /** Hold or release the timer for one reason (hover, focus, touch, hidden). Holds belong to the page, so they carry over to the next offer. */
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
  /** Told when a commit or an undo fails. Default: `console.error`. */
  onError?: (error: unknown, phase: 'commit' | 'undo') => void;
  /** Whether an undo's resolved value means it failed. Default: `false` or `{ ok: false }`. */
  isFailure?: (result: unknown) => boolean;
}

const defaultTimers = {
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

/** `false`, or an object whose `ok` is `false` (acture's `UndoHistory.undo()`, zodal's command results). */
export const defaultIsFailure = (result: unknown): boolean =>
  result === false || (typeof result === 'object' && result !== null && (result as { ok?: unknown }).ok === false);

interface Live {
  view: OfferView;
  input: OfferInput;
  /** Not yet undone, oldest first. An entry leaves as soon as its undo succeeds. */
  entries: Array<Pick<OfferInput, 'undo' | 'commit'>>;
  remaining: number | null;
  startedAt: number;
  running: boolean;
  timer: unknown;
}

/** Create an undo-offer store. Most apps need one, shared by the whole page. */
export function createUndoOffers({
  timers = defaultTimers,
  onError = (e, phase) => console.error(`undo-toast: ${phase} failed`, e),
  isFailure = defaultIsFailure,
}: UndoOffersOptions = {}): UndoOffers {
  let live: Live | null = null;
  /** An offer that arrived while an undo was running: shown once that undo has settled. */
  let queued: { input: OfferInput; advice: Advice; id: number } | null = null;
  let seq = 0;
  const holds = new Set<PauseReason>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const textOf = (input: OfferInput, count: number) =>
    typeof input.message === 'function' ? input.message(count) : count > 1 ? `${input.message} (${count})` : input.message;
  const isHeld = (advice: Advice) => advice.pauseOn.some((r) => holds.has(r));
  const adviceFor = (input: OfferInput, count: number): Advice => {
    if (input.advice) return input.advice;
    const context = input.context ?? {};
    return count > 1 ? advise(context, { count }) : advise(context);
  };

  function setView(l: Live, patch: Partial<OfferView>) {
    l.view = { ...l.view, ...patch };
  }

  function stopTimer(l: Live) {
    if (!l.running) return;
    timers.clearTimeout(l.timer);
    l.running = false;
    if (l.remaining !== null) l.remaining -= timers.now() - l.startedAt;
  }

  /** Run the timer unless it is held or the offer is not counting down. */
  function syncTimer(l: Live) {
    const shouldRun = l.remaining !== null && l.view.status === 'shown' && !isHeld(l.view.advice);
    if (shouldRun === l.running) return;
    if (!shouldRun) return stopTimer(l);
    l.startedAt = timers.now();
    l.running = true;
    l.timer = timers.setTimeout(() => {
      if (live === l) retire('expire');
    }, Math.max(0, l.remaining ?? 0));
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

  function show(input: OfferInput, advice: Advice, id: number) {
    const l: Live = {
      view: { id, message: textOf(input, 1), count: 1, advice, status: 'shown', paused: isHeld(advice) },
      input,
      entries: [{ undo: input.undo, commit: input.commit }],
      remaining: advice.durationMs,
      startedAt: timers.now(),
      running: false,
      timer: undefined,
    };
    live = l;
    syncTimer(l);
  }

  /** End the offer showing: it expired, the user closed it, or a new one replaces it. */
  function retire(how: 'expire' | 'close') {
    const l = live;
    if (!l) return;
    stopTimer(l);
    live = null;
    const policy = how === 'close' ? l.view.advice.onClose : l.view.advice.onExpire;
    // Once Undo was pressed (running or failed), the user asked to cancel: never commit.
    if (policy === 'commit' && l.view.status === 'shown') commitAll(l.entries);
    drainQueue();
    emit();
  }

  function drainQueue() {
    if (live || !queued) return;
    const q = queued;
    queued = null;
    show(q.input, q.advice, q.id);
  }

  return {
    offer(input) {
      const advice = adviceFor(input, 1);
      if (advice.surface === 'none') return null;
      if (advice.surface !== 'toast') {
        const why = advice.reasons.at(-1)?.why ?? '';
        throw new Error(`undo-toast: this action calls for '${advice.surface}', not an undo toast. ${why}`);
      }
      const l = live;
      if (l && l.view.status === 'undoing') {
        // Do not retire an undo in flight: its failure must stay visible. Show this one after it.
        // A second arrival replaces the first in the queue: retire that one as if it had shown.
        if (queued && queued.advice.onExpire === 'commit') commitAll([{ undo: queued.input.undo, commit: queued.input.commit }]);
        queued = { input, advice, id: ++seq };
        return queued.id;
      }
      if (l && advice.coalesce && input.key !== undefined && l.input.key === input.key && l.view.status === 'shown') {
        stopTimer(l);
        const count = l.view.count + 1;
        const merged = adviceFor(input, count);
        l.entries.push({ undo: input.undo, commit: input.commit });
        l.remaining = merged.durationMs;
        l.input = input;
        setView(l, { message: textOf(input, count), count, advice: merged, paused: isHeld(merged) });
        syncTimer(l);
        emit();
        return l.view.id;
      }
      if (l) {
        stopTimer(l);
        live = null;
        const policy = l.view.advice.onExpire;
        if (policy === 'commit' && l.view.status === 'shown') commitAll(l.entries);
      }
      const id = ++seq;
      show(input, advice, id);
      emit();
      return id;
    },

    async undo() {
      const l = live;
      if (!l || l.view.status === 'undoing') return false;
      stopTimer(l);
      setView(l, { status: 'undoing', error: undefined });
      emit();
      let failure: unknown;
      try {
        // Newest first; each entry leaves once undone, so Try again never repeats one.
        while (l.entries.length) {
          const entry = l.entries[l.entries.length - 1]!;
          const result = await entry.undo();
          if (isFailure(result)) throw new Error('undo-toast: the undo reported failure');
          l.entries.pop();
        }
      } catch (error) {
        failure = error;
      }
      if (failure !== undefined) {
        onError(failure, 'undo');
        if (live === l) {
          // Keep it on screen, without a timer, until the user retries or closes it.
          l.remaining = null;
          setView(l, { status: 'failed', error: failure });
          emit();
        }
        return false;
      }
      if (live === l) live = null;
      drainQueue();
      emit();
      return true;
    },

    close() {
      retire('close');
    },

    hold(reason, on) {
      if (on === holds.has(reason)) return;
      if (on) holds.add(reason);
      else holds.delete(reason);
      const l = live;
      if (!l) return;
      const wasPaused = l.view.paused;
      const paused = isHeld(l.view.advice);
      if (wasPaused === paused) return;
      if (paused) stopTimer(l);
      else if (l.remaining !== null) l.remaining = Math.max(l.remaining, l.view.advice.resumeMinMs);
      setView(l, { paused });
      syncTimer(l);
      emit();
    },

    flush() {
      if (live && live.view.advice.onExpire === 'commit') retire('expire');
      if (queued && queued.advice.onExpire === 'commit') {
        commitAll([{ undo: queued.input.undo, commit: queued.input.commit }]);
        queued = null;
      }
    },

    current: () => live?.view ?? null,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** What `bindPage` needs from the renderer, beyond the store. */
export interface PageBinding {
  /** The document to listen on. Default: `document`. */
  doc?: Document;
  /** Move focus into the toast (to its Undo button). Called on the advice's focus key. */
  focus?: () => void;
  /** Whether an element is inside the toast (for Escape). */
  contains?: (el: Element | null) => boolean;
}

/** True when `hotkey` (`F8`, `$mod+z`, `ctrl+shift+z`; `$mod`/`mod` = Cmd on Apple, Ctrl elsewhere) matches the event. */
export function matchesHotkey(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
  hotkey: string | null,
  mac: boolean = isApple(),
): boolean {
  if (!hotkey) return false;
  const parts = hotkey.toLowerCase().split('+');
  const key = parts.pop();
  const mod = parts.includes('$mod') || parts.includes('mod');
  const wantMeta = parts.includes('meta') || (mod && mac);
  const wantCtrl = parts.includes('ctrl') || (mod && !mac);
  return (
    event.key.toLowerCase() === key &&
    event.metaKey === wantMeta &&
    event.ctrlKey === wantCtrl &&
    event.shiftKey === parts.includes('shift') &&
    event.altKey === parts.includes('alt')
  );
}

/** Apple platforms, where `$mod` is Cmd. */
export function isApple(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

/** True for any element that edits text, including inside a shadow root, where Ctrl/Cmd+Z belongs to the field. */
export function isEditable(el: Element | null): boolean {
  let node: Element | null = el;
  while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement;
  if (!node) return false;
  const tag = node.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (node as HTMLElement).isContentEditable === true;
}

/**
 * Wire an offer store to the page, for any renderer: pause while the tab is hidden (read at once,
 * then on every change), commit deferred offers on `pagehide` (a closed tab must not lose a send),
 * and the advice's keys: the focus key moves focus into the toast, Ctrl/Cmd+Z undoes while it
 * shows (outside text fields, and not when another handler already took the key), Escape inside
 * the toast closes it. Returns the cleanup.
 */
export function bindPage(offers: UndoOffers, { doc = document, focus, contains }: PageBinding = {}): () => void {
  const win = doc.defaultView;
  const onVisibility = () => offers.hold('hidden', doc.visibilityState === 'hidden');
  const onPageHide = () => offers.flush();
  const onKey = (e: KeyboardEvent) => {
    const view = offers.current();
    if (!view || e.defaultPrevented || e.repeat) return;
    const { hotkeys } = view.advice;
    if (focus && matchesHotkey(e, hotkeys.focus)) {
      e.preventDefault();
      focus();
    } else if (matchesHotkey(e, hotkeys.undo) && !isEditable(doc.activeElement)) {
      e.preventDefault();
      void offers.undo();
    } else if (e.key === 'Escape' && contains?.(doc.activeElement)) {
      e.preventDefault();
      offers.close();
    }
  };
  onVisibility();
  doc.addEventListener('visibilitychange', onVisibility);
  win?.addEventListener('pagehide', onPageHide);
  win?.addEventListener('keydown', onKey);
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    win?.removeEventListener('pagehide', onPageHide);
    win?.removeEventListener('keydown', onKey);
    offers.hold('hidden', false);
  };
}
