# ADR 0001: undo toasts get their own agent-first package

Status: accepted, 2026-11-16.

## Context

Four undo offers had been written by hand across the owner's apps and zodal, each with its own numbers: two apps' hand-made `UndoBar`s (15 s each; one paused on hover and focus and offered "Undo" and "Dismiss" at a fixed `bottom: 11rem`, the other never paused, had no close control and a fixed offset), zodal's headless `undoable` mutation mode (5 s, deferred send) and zodal's field-history "History cleared. Undo" (10 s). None was shared, and the owner's review of the first found three problems that the others share: the toast floated a third of the way up the screen, "Dismiss" read as "dismiss the action" (that is, undo), and it was unclear whether and when the toast would leave, or what Enter would do.

The owner asked for the toast to become a reusable primitive whose parameters are chosen per action, with "agent primitives that enable agents to make these decisions smartly, based on best practices and standard UX", possibly as a package that catalogues the seams and their concrete dependencies.

## Decision

1. **A package of its own, `undo-toast`** (npm; free on npm, PyPI and GitHub when checked on 2026-11-16, as were the alternatives `undoffer`, `undo-offer`, `undotoast` and `backsies`), in the owner's frontend directory, MIT.
2. **Not in zodal, not in acture.** The decision and the offer's life do not depend on a schema (zodal's concern) or on a command registry (acture's). Two of the four existing offers use neither. Both zodal (`onFeedback` of an `undoable` mutation) and acture (`createUndoHistory`) plug in through the one seam that matters, `undo: () => unknown`, via two small adapters typed by shape only, so when zodal's window becomes pausable the adapter changes and the apps do not.
3. **The core is the decision: `advise(action) → Advice`**, with the rules as an ordered data table (`RULES`), the numbers in one object (`TIMING`), the vocabulary in one field table (`CONTEXT_FIELDS`, with `PRESETS` for common actions), and every rule citing its source in the research report. The advice says why, rule by rule (`reasons`), so an agent can explain or override any part. The CLI (`npx undo-toast advise …`) and the shipped skill are the agent surfaces over the same function.
4. **The offer's life is framework-free** (`createUndoOffers`): one offer at a time, pauses, deferred commit, coalescing, a guarded undo that stays on screen if it fails. The React toast is one renderer of it (`undo-toast/react`).
5. **No zod.** The field table is the schema: types, validation, CLI flags and the skill's table derive from it. A toast should not make every host install a validation library. Revisit if a host wants the context as a Zod schema (for an MCP tool, say).

The defaults follow the research (`docs/research/undo-toast-standard.md`), which settled the owner's three questions: the toast goes bottom-left on a wide screen and full width at the bottom on a phone, above any docked bar; the close control is an × named "Close notification", never "Dismiss"; nothing happens on Enter unless the user moved focus to a button. On duration, the research and the UX review disagreed (8 s with undo kept reachable elsewhere, against Material 3 and WCAG 2.2.1's "a toast with an action stays"); the rule now depends on the context: a toast that is the only way back stays until closed or replaced, one with a fallback (an undo history, a trash) leaves after 10 s, and a deferred action's window is 10 s (15 s when costly) and user-adjustable.

## What the fleet already had (the search, 2026-11-16)

- The four hand-made undo offers above, and zodal's `undoSeconds` (core `operations.ts`) and `HISTORY_UNDO_MS` (`@zodal/ui`).
- **acture-undo** (`createUndoHistory`): the undo *history* (patches, transactions, Ctrl/Cmd+Z). Reused as the undo backend through `offerFromHistory`, not re-implemented; the toast is a consumer surface of it, not part of it.
- **zodal `createMutations` (`undoable` mode)**: the deferred send and its window. Reused through `offerFromMutationFeedback`; its window cannot be paused yet (i2mint/zodal#146).
- **zodal `createActionFeedback`** (press guard, pending and error state for actions): overlaps the `undoing` guard. Not reused because the guard here is three lines on the offer's own status, and `@zodal/ui` would be a dependency of every host.
- **acture-hotkeys** (tinykeys): overlaps the key matcher. Not reused because the toast needs two keys and no dependency; the advice emits tinykeys syntax (`$mod+z`) so an acture host can bind the same keys in its keymap instead.
- **Toast libraries** (sonner, react-hot-toast): their defaults (4-5 s, stacks) contradict the standard for a toast that is the only way back; a renderer seam is left for them instead of a dependency.
- Prior fleet research: the feedback principle's optimistic-updates note (undo beats a confirmation; zodal's feedback sink) is cited, not redone.

## Seams

| # | Seam | v1 default | Replacement we can point at |
|---|---|---|---|
| 1 | What Undo does (`undo`, `commit` on each offer) | the host's callbacks | zodal `MutationFeedback.undo`, acture-undo `history.undo()`, through the structural adapters `offerFromMutationFeedback` / `offerFromHistory` (no import of either) |
| 2 | The renderer | `UndoToast` (React, plain DOM and CSS, no UI library) | sonner (the shadcn toast) or a design system's toast, over `subscribe` + `current()` |
| 3 | The rules and numbers (`rules`, `timing`, `overrides` on `advise`) | `RULES`, `TIMING` | a host's own policy, the owner's request for per-action parameters |
| 4 | Timers and clock (`timers` on `createUndoOffers`) | the global ones | the fake clock in the tests |

Not seams, on purpose: the live region (the toast's own `role="status"`), the placement (CSS custom properties), the close icon. The page wiring (keys, hidden tab, `pagehide`) is core code (`bindPage`) that every renderer calls, so a second renderer cannot drift from the first.

Surfaces: the shipped skill and the CLI are built; the React toast is built because the first consumers are React apps. MCP: the CLI's JSON is already what an MCP tool would return; not built until an agent outside a shell needs it. Python: none.

## Consequences

- Apps replace their hand-made undo bars with `offerUndo` + `<UndoToast />` (adoption issues filed per app). zodal's 5 s default is shorter than the standard's 10 s for a deferred window; filed upstream, with the request to let a host pause a scheduled mutation's window.
- The frontend skill routes undo toasts here; acture remains the home of undo *history*.
- The first npm publish is the owner's (a new name needs their login); CI publishes later versions with trusted publishing.
