# Agent notes for developing undo-toast

You are working on the package itself. Agents *using* undo-toast in an app read `skills/undo-toast/SKILL.md` instead.

- The decision lives in `src/advise.ts` (`RULES`, ordered, each citing a section of `docs/research/undo-toast-standard.md`; `TIMING`, every number). The vocabulary is `src/spec.ts` (`CONTEXT_FIELDS`, `PRESETS`): the CLI flags, the validation and the types derive from it, so a new field is one entry there (plus a rule that reads it) and a row in the skill's table and the README.
- The offer's life is `src/offers.ts` (framework-free); the React toast is `src/react/index.tsx`; the look is `src/styles.css` (copied to `dist/` by the build).
- A rule change is a behaviour change for every host: update its test in `tests/advise.test.ts`, the skill, and the research section it cites.
- Commands: `npm run typecheck && npm run build && npm test` (the CLI test runs `dist/`, so build first). Definition of done: all green, and `node dist/cli/main.js advise remove-item` prints a toast that stays (`durationMs: null`, rule `only-way-back`).
- Decision record: `docs/adr/`. Seams: the undo/commit callbacks, the renderer (any subscriber), `rules`/`timing`/`overrides`, `timers`.
