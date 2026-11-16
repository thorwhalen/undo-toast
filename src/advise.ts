/**
 * `advise`: the agent-first decision function. Given what is known about an action, it says whether
 * to offer undo at all, how (a toast, nothing, a confirmation, a pending control), for how long,
 * what closing and expiring mean, the labels and the keys — and why, rule by rule, so an agent can
 * explain or override any part of it.
 *
 * The rules are data ({@link RULES}): an ordered list a host can extend or replace (`rules`), and
 * the numbers live in one place ({@link TIMING}). The research behind every rule is cited by its
 * `source` (`docs/research/undo-toast-standard.md` in this package).
 */

import { presetContext, resolveContext, type ActionContext, type PresetName, type ResolvedContext } from './spec.js';

/** Which surface acknowledges the action. */
export type Surface = 'toast' | 'none' | 'confirm' | 'pending';
/** What pauses the toast's timer. */
export type PauseReason = 'hover' | 'focus' | 'touch' | 'hidden';

export interface Advice {
  /** `toast`: an undo toast. `none`: the changed thing is its own feedback. `confirm`: ask first, naming the verb. `pending`: show the control pending, report failure with Retry. */
  surface: Surface;
  /** How long the toast stays, in ms; `null` = until the user closes it. Meaningless unless `surface` is `toast`. */
  durationMs: number | null;
  /** After a pause, the timer resumes with at least this much left. */
  resumeMinMs: number;
  /** What pauses the timer. */
  pauseOn: readonly PauseReason[];
  /** When the time runs out: `commit` sends a deferred action; `forget` just hides the toast. */
  onExpire: 'commit' | 'forget';
  /** When the user closes the toast: as `onExpire`, but at once. */
  onClose: 'commit' | 'forget';
  /** Merge a burst of the same action into one toast ("3 segments removed. Undo"). */
  coalesce: boolean;
  /** The undo button's label. */
  undoLabel: string;
  /** The close (×) button's accessible name. Never "Dismiss": it reads as dismissing the action. */
  closeLabel: string;
  /** `focus`: the key that moves focus into the toast. `undo`: the key that undoes while it shows (`null` when the app's own undo history owns it). */
  hotkeys: { focus: string | null; undo: string | null };
  /** Every rule that shaped this advice, in order. */
  reasons: Array<{ rule: string; why: string; source: string }>;
  /** Things the host should consider (a trash for costly deletes, say). */
  warnings: string[];
}

/** Every number `advise` uses. Pass `timing` to change one (a user's chosen undo-send window, say). */
export const TIMING = {
  /** A timed toast with an action stays at least this long (Polaris' minimum for toasts with an action). */
  actionMs: 10_000,
  /** The window of a deferred action before it is sent (Gmail's choices: 5, 10, 20, 30 s). Let the user set it. */
  deferredMs: 10_000,
  /** Costly actions, when timed, stay at least this long. */
  highCostMs: 15_000,
  /** Words a message may have before reading time adds to the duration. */
  baseWords: 10,
  /** Added per extra word (an estimate: no primary source gives a formula). */
  msPerExtraWord: 250,
  /** Reading time never takes a timed toast past this. */
  maxMs: 20_000,
  /** After a pause, at least this much time is left. */
  resumeMinMs: 4_000,
} as const;
export type Timing = { -readonly [K in keyof typeof TIMING]: number };

/** One rule: when it applies, what it changes, why, and where that comes from. */
export interface Rule {
  id: string;
  when: (c: ResolvedContext, t: Timing) => boolean;
  then: (advice: Advice, c: ResolvedContext, t: Timing) => Partial<Advice>;
  why: string;
  source: string;
  /** Stop here: later rules do not apply (used when the surface is not a toast). */
  final?: boolean;
}

const words = (s: string | undefined): number => (s ? s.trim().split(/\s+/).filter(Boolean).length : 0);
const isCostly = (c: ResolvedContext): boolean => c.cost === 'high' || c.count > 1;
const hasFallback = (c: ResolvedContext): boolean => c.hasUndoStack || c.hasTrash;
const R = 'docs/research/undo-toast-standard.md';

/** The rules, in the order they apply. Hosts pass `rules` to replace them, or `[...RULES, mine]` to extend. */
export const RULES: readonly Rule[] = [
  {
    id: 'irreversible',
    when: (c) => c.reversal === 'none',
    then: () => ({ surface: 'confirm', durationMs: null }),
    why: 'Nothing can take it back, so an Undo button would lie: ask first, on a button that names the verb ("Pay €12", not "OK"), or type-to-confirm when the stakes are high; then show it pending.',
    source: `${R} §6`,
    final: true,
  },
  {
    id: 'fails-often',
    when: (c) => c.failsOften,
    then: () => ({ surface: 'pending', durationMs: null }),
    why: 'An action that often fails, or whose result the server computes, must not look done: keep the control pending until it is, and report a failure with Retry in a notice that stays until closed.',
    source: `${R} §6`,
    final: true,
  },
  {
    id: 'result-in-view',
    when: (c) => c.resultStaysInView && !isCostly(c) && c.reversal === 'compensating',
    then: () => ({ surface: 'none', durationMs: null }),
    why: "The changed thing stays on screen in its new state, so it is its own feedback; a toast for a cheap, visible change is noise. Undo stays available through the app's undo history (Ctrl/Cmd+Z) if it has one.",
    source: `${R} §6`,
    final: true,
  },
  {
    id: 'only-way-back',
    when: (c) => c.reversal === 'compensating' && !hasFallback(c),
    then: () => ({ durationMs: null }),
    why: 'The toast is the only way to undo, so it stays until Undo, Close, Escape, or the next action replaces it (Material 3: a snackbar with an action should remain; WCAG 2.2.1: a time limit must be adjustable). Give the app an undo history or a trash to make it timed.',
    source: `${R} §2`,
  },
  {
    id: 'undo-elsewhere',
    when: (c) => c.reversal === 'compensating' && hasFallback(c),
    then: (_a, _c, t) => ({ durationMs: t.actionMs }),
    why: 'Undo is also reachable elsewhere (Ctrl/Cmd+Z, history, trash), so the toast is a shortcut and may leave on its own: 10 s, paused while hovered, focused, touched or hidden.',
    source: `${R} §2`,
  },
  {
    id: 'deferred',
    when: (c) => c.reversal === 'deferred',
    then: (_a, _c, t) => ({ durationMs: t.deferredMs, onExpire: 'commit', onClose: 'commit' }),
    why: 'Nothing is sent until the window ends: expiry sends, closing sends at once, a replacing toast sends, and so does `pagehide`. The window is always finite (a held action is stale for other tabs and lost with the tab) and the user should be able to choose its length (`timing.deferredMs`), as Gmail offers 5-30 s.',
    source: `${R} §2`,
  },
  {
    id: 'reading-time',
    when: (c, t) => words(c.message) > t.baseWords,
    then: (a, c, t) =>
      a.durationMs === null ? {} : { durationMs: Math.min(t.maxMs, Math.max(a.durationMs, a.durationMs + (words(c.message) - t.baseWords) * t.msPerExtraWord)) },
    why: 'A long message gets reading time on top of a timed toast (an estimate, capped).',
    source: `${R} §2`,
  },
  {
    id: 'high-cost',
    when: isCostly,
    then: (a, _c, t) => (a.durationMs === null ? {} : { durationMs: Math.max(a.durationMs, t.highCostMs) }),
    why: 'A costly mistake (lost work, several items) gets a longer window when the toast is timed.',
    source: `${R} §2`,
  },
  {
    id: 'no-trash',
    when: (c) => isCostly(c) && c.reversal === 'compensating' && !hasFallback(c),
    then: (a) => ({
      warnings: [
        ...a.warnings,
        'Costly and undoable only from the toast: add a trash or "recently removed" that outlives it, or an undo history, so a replaced or closed toast is not a lost item.',
      ],
    }),
    why: 'The toast should be a shortcut, not the only way back; prefer a soft delete.',
    source: `${R} §2`,
  },
  {
    id: 'keep-notices',
    when: (c) => c.keepNotices && c.reversal === 'compensating',
    then: () => ({ durationMs: null }),
    why: 'The user asked to keep notices until they close them (WCAG 2.2.1, Timing Adjustable).',
    source: `${R} §2`,
  },
  {
    id: 'frequent',
    when: (c) => c.frequency === 'frequent',
    then: () => ({ coalesce: true }),
    why: 'A burst of the same action merges into one toast with a count ("3 items deleted. Undo"); one Undo takes back the whole burst.',
    source: `${R} §5`,
  },
  {
    id: 'undo-stack',
    when: (c) => c.hasUndoStack,
    then: (a) => ({ hotkeys: { ...a.hotkeys, undo: null } }),
    why: "The app's own undo history owns Ctrl/Cmd+Z, and a replaced toast's action stays undoable there.",
    source: `${R} §4`,
  },
];

/** The advice every rule starts from: one polite, timed toast with Undo and a Close (×), no default button. */
function baseAdvice(t: Timing): Advice {
  return {
    surface: 'toast',
    durationMs: t.actionMs,
    resumeMinMs: t.resumeMinMs,
    pauseOn: ['hover', 'focus', 'touch', 'hidden'],
    onExpire: 'forget',
    onClose: 'forget',
    coalesce: false,
    undoLabel: 'Undo',
    closeLabel: 'Close notification',
    hotkeys: { focus: 'F8', undo: 'mod+z' },
    reasons: [],
    warnings: [],
  };
}

export interface AdviseOptions {
  /** Replace the rule list (default {@link RULES}). */
  rules?: readonly Rule[];
  /** Change any number (default {@link TIMING}). */
  timing?: Partial<Timing>;
  /** Fields forced last, whatever the rules said (recorded as the `override` reason). */
  overrides?: Partial<Omit<Advice, 'reasons' | 'warnings'>>;
}

/**
 * Decide how to offer undo for an action.
 *
 * @param action a preset name (`'remove-item'`, see `PRESETS`) or an {@link ActionContext}
 * @param extra context added on top of a preset (`advise('bulk-delete', { count: 12 })`)
 * @example advise({ reversal: 'deferred', cost: 'high' }).durationMs // 15000
 */
export function advise(
  action: PresetName | ActionContext = {},
  extra: ActionContext = {},
  { rules = RULES, timing, overrides }: AdviseOptions = {},
): Advice {
  const t: Timing = { ...TIMING, ...timing };
  const context = resolveContext(typeof action === 'string' ? presetContext(action, extra) : { ...action, ...extra });
  let advice = baseAdvice(t);
  for (const rule of rules) {
    if (!rule.when(context, t)) continue;
    advice = { ...advice, ...rule.then(advice, context, t) };
    advice.reasons = [...advice.reasons, { rule: rule.id, why: rule.why, source: rule.source }];
    if (rule.final) break;
  }
  if (overrides && Object.keys(overrides).length) {
    advice = { ...advice, ...overrides };
    advice.reasons = [...advice.reasons, { rule: 'override', why: `Set by the host: ${Object.keys(overrides).join(', ')}.`, source: 'caller' }];
  }
  return advice;
}
