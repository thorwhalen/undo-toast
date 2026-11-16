/**
 * undo-toast: decide how to offer undo for an action, then offer it.
 *
 * - `advise(action)` — the agent-first decision: toast or not, how long, what closing means, labels,
 *   keys, and the reasons. Rules and numbers are data (`RULES`, `TIMING`); presets name the usual cases.
 * - `createUndoOffers()` / `offerUndo(input)` — the framework-free life of one offer (timer, pauses,
 *   replace, coalesce, deferred commit, guarded undo).
 * - `bindPage(offers)` — the page wiring every renderer shares (keys, hidden tab, `pagehide`).
 * - `offerFromMutationFeedback`, `offerFromHistory` — offers from zodal mutations and acture-undo.
 * - `undo-toast/react` — the toast itself; `undo-toast/styles.css` — its look.
 */

export { advise, RULES, TIMING } from './advise.js';
export type { Advice, AdviseOptions, PauseReason, Rule, Surface, Timing } from './advise.js';
export { CONTEXT_FIELDS, PRESETS, contextJsonSchema, presetContext, resolveContext } from './spec.js';
export type { ActionContext, PresetName, ResolvedContext } from './spec.js';
export { bindPage, createUndoOffers, defaultIsFailure, isEditable, matchesHotkey } from './offers.js';
export type { OfferInput, OfferView, PageBinding, UndoOffers, UndoOffersOptions } from './offers.js';
export { offerFromHistory, offerFromMutationFeedback } from './adapters.js';
export type { MutationFeedbackLike, UndoHistoryLike } from './adapters.js';

import { createUndoOffers, type OfferInput, type UndoOffers } from './offers.js';

let shared: UndoOffers | undefined;

/** The page's shared offer store (created on first use). `<UndoToast />` shows it by default. */
export function getUndoOffers(): UndoOffers {
  return (shared ??= createUndoOffers());
}

/**
 * Offer undo on the shared store: the one-line way.
 *
 * @example offerUndo({ message: '“Intro” removed', undo: () => restore(item), context: 'remove-item' })
 */
export function offerUndo(input: OfferInput): number | null {
  return getUndoOffers().offer(input);
}
