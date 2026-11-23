# undo-toast

Decide whether and how to offer undo after an action, then offer it: an agent-first decision function, a framework-free offer store, and a React toast that follows the standard (placement, timing, labels, keys, accessibility).

```bash
npm install undo-toast
npx undo-toast advise remove-item      # what to do, and why (JSON)
```

```tsx
import { offerUndo } from 'undo-toast';
import { UndoToast } from 'undo-toast/react';
import 'undo-toast/styles.css';

<UndoToast />   // once, near the root

removeSegment(item);
offerUndo({ message: `“${item.title}” removed`, undo: () => restore(item), context: 'remove-item' });
```

**No React?** A static site with one vanilla `app.js` uses the same toast through plain DOM calls: `import { offerUndo } from 'undo-toast'; import { mountUndoToast } from 'undo-toast/dom'` and call `mountUndoToast()` once at startup (it returns an `unmount`). With no bundler at all, load `dist/undo-toast.global.js` (`undo-toast/global`) with a script tag: it defines `UndoToast.offerUndo` and `UndoToast.mountUndoToast`. Same markup, same `styles.css`, same behaviour as the React toast.

The toast appears bottom-left on a wide screen and full width at the bottom on a phone. When it is the only way back it stays until Undo, Close or the next action (Material 3, WCAG 2.2.1); when undo is also reachable elsewhere (Ctrl/Cmd+Z, a trash) it leaves after 10 s, longer for long text or costly actions; a deferred action (an undo send) commits when its window ends. The timer pauses while the pointer, the focus or a finger is on the toast and while the tab is hidden. It has an **Undo** button and a **Close** (×) button, never takes focus, and announces itself politely.

## The decision

`advise(action)` takes a preset name or what you know about the action, and returns the advice with its reasons:

```ts
import { advise } from 'undo-toast';

advise('pay').surface;                                  // 'confirm': nothing can take it back
advise('toggle').surface;                               // 'none': the change is its own feedback
advise({ reversal: 'deferred', cost: 'high' });         // a 15 s window that commits on expiry or close
advise('bulk-delete', { count: 12 }).warnings;          // ['… add a trash or "recently removed" …']
advise('remove-item').durationMs;                       // null: the toast is the only way back, so it stays
advise('remove-item', { hasUndoStack: true }).durationMs; // 10000
advise('remove-item').reasons;                          // [{ rule, why, source }, …]
```

| Field | Values (default first) | Means |
|---|---|---|
| `reversal` | `compensating`, `deferred`, `manual`, `none` | one Undo applies the inverse, in place / nothing is sent until the window ends / recoverable only by hand, item by item / cannot be taken back |
| `cost` | `low`, `high` | what a mistake costs |
| `frequency` | `occasional`, `rare`, `frequent` | `frequent` coalesces bursts into one toast |
| `resultStaysInView` | `false`, `true` | the change is visible where it happened (then no toast) |
| `failsOften` | `false`, `true` | show it pending instead |
| `count` | `1` | items touched |
| `hasUndoStack`, `hasTrash` | `false` | the toast is not the only way back |
| `keepNotices` | `false` | the user's "keep notices until closed" setting |
| `message` | | longer text stays longer |
| `verb` | | the confirm button's label when the advice is to confirm (`'Move {count} {item|items} to Trash'`) |

Presets: `remove-item`, `delete-work`, `bulk-delete`, `move-to-trash`, `bulk-move-to-trash`, `add-to-collection`, `delete-permanently`, `empty-trash`, `archive`, `clear-history`, `forget-secret`, `send`, `toggle`, `pay` (`npx undo-toast presets`). Every rule and number can be replaced: `advise(action, extra, { rules, timing, overrides })`, with `RULES` and `TIMING` exported.

### Bulk actions on a selection

A bulk action asks for confirmation, with the count, **unless one Undo takes the whole operation back in place**. Recoverable is not reversible: if taking it back means going to the playlist or the Trash and finding the 30 items one by one, say `reversal: 'manual'` and it confirms.

```ts
advise({ reversal: 'manual', count: 12, verb: 'Move {count} {item|items} to Trash' });
// { surface: 'confirm', confirmLabel: 'Move 12 items to Trash', reasons: [{ rule: 'bulk-confirm', … }] }
advise('bulk-move-to-trash', { count: 12 });             // a 15 s toast: one Undo restores the selection
advise('empty-trash', { count: 40 }).typeToConfirm;      // true: irreversible, above timing.confirmTypeAbove (10)
```

Earn the toast by running the selection as one undo step (one history entry, one restore); the `bulk-one-step-undo` reason says so, for an agent to quote. Delete permanently and Empty Trash always confirm. A `manual` bulk action gets a plain confirmation however large (the items can still be recovered); only irreversible ones are typed. `{one|other}` in `verb` picks the singular at a count of 1, and `advise(…, …, { label })` replaces the wording (translations). Why: [`docs/research/bulk-confirm.md`](docs/research/bulk-confirm.md).

## The offer store

`createUndoOffers()` holds the offer showing: its timer and pauses (`hold`), `undo` (guarded while it runs; a failure stays on screen with *Try again*), `close`, `flush` (commit a deferred action now; the React toast calls it on `pagehide`), coalescing by `key`, and `subscribe` + `current()` for any renderer. `offerUndo` uses a shared one.

For a deferred action (an undo send), pass `commit`: it runs once when the window ends, the toast is closed or replaced, or the page is hidden for good.

## From zodal or acture

```ts
import { offerFromHistory, offerFromMutationFeedback, offerUndo } from 'undo-toast';

// acture-undo: after the dispatch
offerUndo(offerFromHistory(history, { message: '“Intro” removed', context: 'remove-item' }));

// zodal undoable mutations
createMutations(provider, get, set, { mode: 'undoable', onFeedback: (f) => {
  const offer = offerFromMutationFeedback(f, { message: 'Row deleted' });
  if (offer) offerUndo(offer);
} });
```

An `undo` fails when it throws, rejects, or returns `false` or `{ ok: false }`; the toast then stays with *Try again*, and a deferred action is never committed once Undo was pressed. Another renderer reads `subscribe` + `current()` and calls `bindPage(offers, { focus, contains })` for the keys, the hidden-tab pause and `pagehide`.

## Above a docked bar

```tsx
const playerRef = useRef<HTMLDivElement>(null);
useBottomDock(playerRef);   // the toast sits just above the player, or at the bottom when it is gone
```

## The host's own buttons

An app with its own pressable component (large touch targets, a tap guard, a lockout after a press: an app for users with hand tremor needs all three) draws the controls itself and keeps the toast's policy (timing, pauses, hotkeys, coalescing, failure and *Try again*):

```tsx
<UndoToast renderAction={(a) => (
  <Press ref={a.ref} aria-describedby={a.describedBy} pending={a.pending} onTap={a.onActivate}>{a.label}</Press>
)} />
```

`a.kind` is `'undo'` or `'close'`; return `undefined` to keep the default control for a kind. A longer offer for an accessibility setting is the host's advice: `offerUndo({ …, advice: { ...advise('remove-item'), durationMs: 15000 } })`.

Styles are plain CSS with custom properties (`--undo-toast-bg`, `--undo-toast-fg`, `--undo-toast-accent`, `--undo-toast-gap`, `--undo-toast-z`, …); the toast inherits the page's font.

## For agents

The shipped skill, `skills/undo-toast/SKILL.md`, is the agent's guide: how to describe an action, how to wire zodal mutations or acture-undo, and the rules any other renderer must keep. The research behind every rule is `docs/research/undo-toast-standard.md`; the design decision is `docs/adr/0001-undo-toast-package.md`.

## License

MIT
