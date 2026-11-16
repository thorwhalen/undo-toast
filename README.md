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
| `reversal` | `compensating`, `deferred`, `none` | undo applies the inverse / nothing is sent until the window ends / cannot be taken back |
| `cost` | `low`, `high` | what a mistake costs |
| `frequency` | `occasional`, `rare`, `frequent` | `frequent` coalesces bursts into one toast |
| `resultStaysInView` | `false`, `true` | the change is visible where it happened (then no toast) |
| `failsOften` | `false`, `true` | show it pending instead |
| `count` | `1` | items touched |
| `hasUndoStack`, `hasTrash` | `false` | the toast is not the only way back |
| `keepNotices` | `false` | the user's "keep notices until closed" setting |
| `message` | | longer text stays longer |

Presets: `remove-item`, `delete-work`, `bulk-delete`, `archive`, `clear-history`, `forget-secret`, `send`, `toggle`, `pay` (`npx undo-toast presets`). Every rule and number can be replaced: `advise(action, extra, { rules, timing, overrides })`, with `RULES` and `TIMING` exported.

## The offer store

`createUndoOffers()` holds the offer showing: its timer and pauses (`hold`), `undo` (guarded while it runs; a failure stays on screen with *Try again*), `close`, `flush` (commit a deferred action now; the React toast calls it on `pagehide`), coalescing by `key`, and `subscribe` + `current()` for any renderer. `offerUndo` uses a shared one.

For a deferred action (an undo send), pass `commit`: it runs once when the window ends, the toast is closed or replaced, or the page is hidden for good.

## Above a docked bar

```tsx
const playerRef = useRef<HTMLDivElement>(null);
useBottomDock(playerRef);   // the toast sits just above the player, or at the bottom when it is gone
```

Styles are plain CSS with custom properties (`--undo-toast-bg`, `--undo-toast-fg`, `--undo-toast-accent`, `--undo-toast-gap`, `--undo-toast-z`, …); the toast inherits the page's font.

## For agents

The shipped skill, `skills/undo-toast/SKILL.md`, is the agent's guide: how to describe an action, how to wire zodal mutations or acture-undo, and the rules any other renderer must keep. The research behind every rule is `docs/research/undo-toast-standard.md`; the design decision is `docs/adr/0001-undo-toast-package.md`.

## License

MIT
