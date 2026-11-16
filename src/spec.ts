/**
 * The decision vocabulary: what an agent (or a person) says about an action, and the named presets
 * for common actions. This table is the single source of truth: the TypeScript types, the
 * validation in `advise`, the CLI's `fields` and `presets` commands and the shipped skill's tables
 * are all derived from it.
 */

/** One field of {@link ActionContext}: its allowed values, its default, and what it means. */
interface FieldSpec<V> {
  readonly values: readonly V[] | 'number' | 'string';
  readonly default: V | undefined;
  readonly describe: string;
}

export const CONTEXT_FIELDS = {
  reversal: {
    values: ['deferred', 'compensating', 'none'] as const,
    default: 'compensating',
    describe:
      "How the action can be taken back. 'deferred': nothing is committed until the undo window ends (Gmail's undo send, zodal's undoable mutation). 'compensating': it is already done, and undo applies the inverse (re-insert, restore). 'none': it cannot be taken back (a payment, an email already delivered).",
  },
  cost: {
    values: ['low', 'high'] as const,
    default: 'low',
    describe:
      "What a mistake costs the user. 'high': their work is lost (a document, hours of edits), many items at once, or something hard to recreate (a key, a playlist they built). 'low': it is easy to redo by hand.",
  },
  frequency: {
    values: ['rare', 'occasional', 'frequent'] as const,
    default: 'occasional',
    describe:
      "How often the user does this. 'frequent' (toggle, check, reorder, many times a session) makes a toast noise.",
  },
  resultStaysInView: {
    values: [true, false] as const,
    default: false,
    describe:
      'True when the changed thing stays on screen showing its new state (a checked box, a renamed title), so the change is its own feedback. False when the item leaves the view, moves away, or the action was done by a shortcut.',
  },
  failsOften: {
    values: [true, false] as const,
    default: false,
    describe:
      'True when the action often fails or its result is computed by the server: show it pending, not done, and report failure with Retry.',
  },
  count: {
    values: 'number',
    default: 1,
    describe: 'How many items the action touched. Above 1 the message names the count and the cost leans high.',
  },
  hasUndoStack: {
    values: [true, false] as const,
    default: false,
    describe:
      'True when the app keeps its own undo history (acture-undo, Ctrl/Cmd+Z). Then the toast is a shortcut, the app owns Ctrl/Cmd+Z, and the action stays undoable after the toast leaves.',
  },
  hasTrash: {
    values: [true, false] as const,
    default: false,
    describe: "True when deleted things go to a trash or 'recently removed' that outlives the toast.",
  },
  keepNotices: {
    values: [true, false] as const,
    default: false,
    describe:
      "The user's own setting 'keep notices until I close them' (WCAG 2.2.1, Timing Adjustable). True makes a compensating toast stay until closed.",
  },
  message: {
    values: 'string',
    default: undefined,
    describe: 'The toast text, if known: longer text stays longer (reading time).',
  },
} as const satisfies Record<string, FieldSpec<unknown>>;

type Spec = typeof CONTEXT_FIELDS;
type ValueOf<F> = F extends { values: readonly (infer V)[] } ? V : F extends { values: 'number' } ? number : string;

/** What is known about the action to offer undo for. Every field is optional (see the defaults). */
export type ActionContext = { -readonly [K in keyof Spec]?: ValueOf<Spec[K]> };
/** {@link ActionContext} with every default applied (except `message`). */
export type ResolvedContext = { -readonly [K in keyof Spec]-?: ValueOf<Spec[K]> } & { message?: string };

/** Common actions, named, so `advise('remove-item')` is enough for the usual case. */
export const PRESETS = {
  'remove-item': {
    describe: 'Remove one item from a list or collection (a segment, a row, a card); undo puts it back.',
    context: { reversal: 'compensating', cost: 'low' },
  },
  'delete-work': {
    describe: 'Delete something the user built (a document, a playlist, a project).',
    context: { reversal: 'compensating', cost: 'high' },
  },
  'bulk-delete': {
    describe: 'Delete several items at once (pass count).',
    context: { reversal: 'compensating', cost: 'high', count: 2 },
  },
  archive: {
    describe: 'Archive, hide, or move out of the current view.',
    context: { reversal: 'compensating', cost: 'low' },
  },
  'clear-history': {
    describe: 'Clear a list of past entries (recent searches, input history).',
    context: { reversal: 'compensating', cost: 'low' },
  },
  'forget-secret': {
    describe: 'Forget a stored key or credential; it is held, not erased, until the window ends.',
    context: { reversal: 'deferred', cost: 'high' },
  },
  send: {
    describe: 'Send, publish or share; held back until the window ends (undo send).',
    context: { reversal: 'deferred', cost: 'high' },
  },
  toggle: {
    describe: 'Toggle, check, star, reorder: frequent, cheap, and its result stays in view.',
    context: { reversal: 'compensating', cost: 'low', frequency: 'frequent', resultStaysInView: true },
  },
  pay: {
    describe: 'Pay, or any action with an external effect that cannot be called back.',
    context: { reversal: 'none', cost: 'high' },
  },
} as const satisfies Record<string, { describe: string; context: ActionContext }>;

export type PresetName = keyof typeof PRESETS;

/** Apply the defaults and check every value, with an error that names the field and the choices. */
export function resolveContext(context: ActionContext = {}): ResolvedContext {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(context)) {
    if (!(key in CONTEXT_FIELDS)) {
      throw new Error(`undo-toast: unknown context field "${key}"; the fields are ${Object.keys(CONTEXT_FIELDS).join(', ')}.`);
    }
  }
  for (const [key, spec] of Object.entries(CONTEXT_FIELDS) as Array<[string, FieldSpec<unknown>]>) {
    const value = (context as Record<string, unknown>)[key];
    if (value === undefined) {
      if (spec.default !== undefined) out[key] = spec.default;
      continue;
    }
    if (spec.values === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error(`undo-toast: "${key}" must be a non-negative number, got ${String(value)}.`);
      }
    } else if (spec.values === 'string') {
      if (typeof value !== 'string') throw new Error(`undo-toast: "${key}" must be a string, got ${typeof value}.`);
    } else if (!spec.values.includes(value)) {
      throw new Error(`undo-toast: "${key}" must be one of ${spec.values.map((v) => JSON.stringify(v)).join(', ')}, got ${JSON.stringify(value)}.`);
    }
    out[key] = value;
  }
  return out as ResolvedContext;
}

/** A preset's context, with `extra` on top; throws naming the presets when the name is unknown. */
export function presetContext(name: string, extra: ActionContext = {}): ActionContext {
  const preset = (PRESETS as Record<string, { context: ActionContext }>)[name];
  if (!preset) throw new Error(`undo-toast: unknown preset "${name}"; the presets are ${Object.keys(PRESETS).join(', ')}.`);
  return { ...preset.context, ...extra };
}
