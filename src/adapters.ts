/**
 * Offers from the undo machinery the fleet already has, typed by shape only (no import of zodal or
 * acture), so when either changes, this file changes and the apps that use it do not.
 *
 * - `offerFromMutationFeedback`: zodal's `createMutations({ onFeedback })` in `undoable` mode.
 * - `offerFromHistory`: acture-undo's `createUndoHistory(...)` (Ctrl/Cmd+Z history).
 */

import { advise, type Advice } from './advise.js';
import type { OfferInput } from './offers.js';
import type { ActionContext, PresetName } from './spec.js';

/** The part of zodal's `MutationFeedback` this needs. */
export interface MutationFeedbackLike {
  kind: string;
  /** Seconds left in the window (on `scheduled`). */
  seconds?: number;
  /** Cancel the scheduled mutation; `false` when it is too late. */
  undo?: () => boolean;
  mutation?: { kind?: string; itemId?: string };
}

/**
 * The offer for a zodal undoable mutation, or null for any feedback other than `scheduled`. zodal
 * owns the window's timer, so the toast lasts exactly as long and does not promise a pause zodal
 * cannot keep (i2mint/zodal#146 asks zodal for one). A too-late undo shows as a failure.
 *
 * @example onFeedback: (f) => { const o = offerFromMutationFeedback(f, { message: 'Row deleted' }); if (o) offerUndo(o); }
 */
export function offerFromMutationFeedback(
  feedback: MutationFeedbackLike,
  { message, context = {} }: { message: OfferInput['message']; context?: ActionContext },
): OfferInput | null {
  if (feedback.kind !== 'scheduled' || !feedback.undo || feedback.seconds === undefined) return null;
  const undo = feedback.undo;
  const advice: Advice = advise({ ...context, reversal: 'deferred' }, {}, {
    overrides: { durationMs: feedback.seconds * 1000, pauseOn: [], onExpire: 'forget', onClose: 'forget' },
  });
  return { message, undo: () => undo(), advice };
}

/** The part of acture-undo's `UndoHistory` this needs. */
export interface UndoHistoryLike {
  undo(): { readonly ok: boolean } | boolean | void;
}

/**
 * The offer for the action an undo history just recorded: Undo rolls the history back one entry,
 * and the advice knows the app owns Ctrl/Cmd+Z (so the toast is timed, and leaves that key alone).
 *
 * @example await registry.dispatch('app.segment.remove', { id }); offerUndo(offerFromHistory(history, { message: '“Intro” removed', context: 'remove-item' }));
 */
export function offerFromHistory(
  history: UndoHistoryLike,
  { message, context = {}, key }: { message: OfferInput['message']; context?: PresetName | ActionContext; key?: string },
): OfferInput {
  const advice = typeof context === 'string' ? advise(context, { hasUndoStack: true }) : advise({ ...context, hasUndoStack: true });
  return { message, undo: () => history.undo(), advice, ...(key === undefined ? {} : { key }) };
}
