---
name: undo-toast
description: Decide whether and how to offer undo after a user action, and build it with the undo-toast package — an undo toast (snackbar), nothing, a confirmation, or a pending control; how long it stays, what closing and expiring mean (commit or forget), the labels, the keys, placement above a docked bottom bar. Use whenever a web UI removes, deletes, archives, clears, sends, forgets or bulk-changes something, on "X deleted. Undo", "undo toast", "snackbar", "toast with undo", "confirm or undo?", "should this have a confirmation dialog", "how long should the toast stay", "where should the toast go", and whenever an app already has its own hand-made undo bar.
---

# undo-toast — decide how to offer undo, then offer it

Undo beats a confirmation dialog for anything reversible: people learn to click through dialogs without reading. But not every action wants a toast, and the toast's details (how long, what closing means, which keys) are where hand-made versions go wrong. **Ask the package, do not guess.**

## 1. Ask for the advice

```bash
npx undo-toast advise remove-item --message "“Intro” removed"
npx undo-toast advise --reversal deferred --cost high      # an undo send
npx undo-toast presets    # named actions; fields / schema: what you can say; rules: what advise applies
```

or in code: `advise('remove-item')`, `advise({ reversal: 'compensating', cost: 'high', count: 12 })`. The answer is JSON: `surface` (`toast | none | confirm | pending`), `durationMs` (`null` = until closed), `onExpire` / `onClose` (`commit | forget`), `pauseOn`, `coalesce`, labels, `hotkeys`, and `reasons` (each rule that fired, why, and its source). **Read the reasons**; quote them when you explain the choice. `warnings` are things to fix in the host (a trash for costly deletes).

What to tell it (run `npx undo-toast fields` for the full table):

| Field | Ask yourself |
|---|---|
| `reversal` | Is it already done, with one Undo applying the inverse of the whole thing, in place (`compensating`)? Held back until the window ends (`deferred`: undo send, a held key)? Recoverable only by hand, item by item, somewhere else (`manual`: editing the playlist, restoring one by one from a trash)? Impossible to take back (`none`)? |
| `cost` | Would a mistake lose the user's work, many items, or something hard to recreate (`high`)? |
| `resultStaysInView` | Does the changed thing stay on screen showing its new state (a checkbox, a rename)? Then it is its own feedback. |
| `frequency`, `count` | A burst of the same action merges into one toast; several items lengthen the window. |
| `hasUndoStack`, `hasTrash` | Does the app keep an undo history (Ctrl/Cmd+Z) or a trash? Then the toast is a shortcut, not the only way back. |
| `keepNotices` | The user's setting "keep notices until I close them" (WCAG 2.2.1). |
| `verb` | What the confirm button should say if it comes to that: `'Move {count} {item|items} to Trash'` (`{count}` is filled in). |

If the surface is not `toast`, do what it says: `none` (the change is the feedback; no toast), `confirm` (a dialog whose button is `confirmLabel`, the verb with the count, "Move 12 items to Trash", never "OK"; the button disabled until typed when `typeToConfirm`; then a pending button), `pending` (the control pending until the server answers; a failure toast with Retry that stays).

### Bulk actions on a selection

The default: **ask for confirmation, with the count, unless one Undo takes the whole operation back, in place.** "Recoverable" is not enough: if taking it back means going to the playlist or the Trash and finding the items one by one, it is `reversal: 'manual'` and `advise` returns `confirm` (rule `bulk-confirm`). Earn the toast instead by running the whole selection as **one undo step** (one acture-undo transaction / history entry, one Restore for the batch), then say `compensating`; the reason `bulk-one-step-undo` explains the choice in words you can quote. Never show both a confirmation and an undo toast for one action. Presets: `move-to-trash`, `bulk-move-to-trash`, `add-to-collection`, and `delete-permanently` / `empty-trash` (always confirm; typed above `timing.confirmTypeAbove`, 10 by default, an estimate to expose as a setting). Take the count and the payload from the same selection object.

## 2. Offer it

```tsx
import { offerUndo, offerFromHistory, offerFromMutationFeedback } from 'undo-toast';
import { UndoToast, useBottomDock } from 'undo-toast/react';
import 'undo-toast/styles.css';

// once, near the root (its live region must exist before the first message):
<UndoToast />

// after the action:
removeSegment(item);
offerUndo({ message: `“${item.title}” removed`, undo: () => insertSegment(item, index), context: 'remove-item' });
```

- **Deferred** (nothing sent yet): pass `commit` too. It runs once when the window ends, when the user closes the toast, when another offer replaces it, or on `pagehide`. `undo` then only restores the screen.
- **A docked bottom bar** (a player, a tab bar): `useBottomDock(barRef)` on it. The toast then sits just above it, and at the very bottom when the bar is gone. Never hard-code an offset (`bottom: 11rem`): that is how a toast ends up a third of the way up the screen.
- **A burst** (triage deletes): `key: 'remove'` and a message function `(n) => \`${n} segments removed\``; the advice for `frequency: 'frequent'` coalesces.
- **An app with its own undo history** (acture-undo): `offerUndo(offerFromHistory(history, { message, context: 'remove-item' }))` after the dispatch. Undo rolls the history back one entry, `{ ok: false }` shows as a failure, and Ctrl/Cmd+Z stays the app's.
- **zodal undoable mutations**: `onFeedback: (f) => { const o = offerFromMutationFeedback(f, { message: 'Row deleted' }); if (o) offerUndo(o); }`. zodal owns that window's timer, so the toast lasts as long and does not pause (until i2mint/zodal#146); a too-late undo (`false`) shows as a failure. Set zodal's `undoSeconds` from `advise({ reversal: 'deferred' }).durationMs / 1000`.
- **Undo results**: `undo` fails when it throws, rejects, or returns `false` or `{ ok: false }` (change with `isFailure` on `createUndoOffers`). A failed undo stays on screen with *Try again*, and a deferred action is never committed once Undo was pressed.
- **Another renderer** (sonner, a design system's toast): read `subscribe` + `current()`, call `undo`, `close`, `hold`, and call `bindPage(offers, { focus, contains })` once for the keys, the hidden-tab pause and `pagehide`. The labels (`undoLabel`, `closeLabel`, `failedText`, `retryLabel`) and `hotkeys` (tinykeys syntax, `$mod+z`) come in the advice. Keep the standing rules below.

## 3. The standing rules (the toast already follows them; keep them in any other renderer)

- **Placement**: bottom-left on a wide screen (bottom-right is where chat widgets live), full width at the bottom on a phone, above any docked bar and the home indicator.
- **One at a time**: a new offer replaces the old (a deferred one commits). No stacks.
- **The close control is an × named "Close notification"**, never "Dismiss" (read as "dismiss the action", which is Undo) and never "Keep" (read as "keep the item").
- **No default button, never steal focus**: the next Enter belongs to whatever the user was doing. F8 moves focus into the toast; Escape inside it closes it; Ctrl/Cmd+Z undoes while it shows (outside text fields, and unless the app's history owns the key).
- **Duration follows the way back**: the only way back → the toast stays until Undo, Close or the next action (Material 3, WCAG 2.2.1); undo also reachable elsewhere (Ctrl/Cmd+Z, a trash) → 10 s; deferred → a finite window (10 s, 15 s when costly) the user should be able to set (`timing.deferredMs`). **Pause** on hover, focus, touch and a hidden tab; resume with at least 4 s left.
- **Polite**: `role="status"` in a region mounted before any message; never `role="alert"` for an undo.
- **Words**: past tense, the object first: "“Intro” removed". After an undo, no second toast: the item comes back where it was.
- **Never** a countdown bar, a stack of toasts, top-right placement, or a library's 4-5 s default for a toast that is the only way back.

## Sources

The research behind every rule, with references: `docs/research/undo-toast-standard.md` in this package (`node_modules/undo-toast/docs/…`); for bulk actions, `docs/research/bulk-confirm.md`. The decision record: `docs/adr/0001-undo-toast-package.md`.
