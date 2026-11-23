# Bulk actions: confirmation or undo

An excerpt (section 4, unchanged) of the views-and-selection research report (2026-11-23) (128 references in all). It is the source of the `bulk-confirm`, `manual` and `bulk-one-step-undo` rules in `src/advise.ts`. Reference numbers are the report's own.

## 4. Confirmation, undo and reversibility for bulk operations

### 4.1 What the guidance says

- **Undo beats a warning.** Aza Raskin's argument is that people habituate to dialogs and click through them, so a warning does not protect; an undo does. The title is the rule: "Never use a warning when you mean undo". He also rejects louder warnings and typed confirmations as general fixes, and gives Gmail as the model: delete offers an undo at once, and the message also goes to Trash [19].
- **NN/g is more balanced.** Keep confirmations for actions with serious consequences, because "if you cry wolf too many times, people will stop paying attention"; make the dialog specific about the item and the consequence; label the buttons with the outcome, not Yes and No; add unusual friction such as typing only for rare severe cases; and offer undo wherever possible [18]. Heuristic 3, user control and freedom, asks for a clearly marked emergency exit and a visible undo [74].
- **Platforms agree.** Apple advises against alerts for common, undoable actions, even destructive ones [75] (summary). Fluent reserves alert dialogs for potential loss [76] (summary). Material's snackbar guidance recommends an "Undo" action [77] (summary).
- **Design systems grade by impact.** Carbon's remove pattern has three tiers: low impact needs no confirmation, especially when undo exists; medium impact gets a modal that states the consequences; high impact requires typing the resource name [78] (summary). Cloudscape limits typed confirmation to high-severity deletions, such as a resource that cannot be recreated, and warns that extra steps on low-impact deletions frustrate users [20]. GitHub Primer recommends an undo window for reversible actions [79] (summary).

### 4.2 Thresholds by count

None of the design systems we could read gives a numeric threshold for the number of items. NN/g says only that thresholds need analysis and may be personal [18]. So a count rule has to be configuration, not a built-in number. The structure that the sources support is this: reversibility and cost of error choose the tier, and count can only promote an irreversible action from a plain confirmation to a typed one. A reversible bulk action stays at undo however large it is. Two conditions deserve promotion besides raw count: an implicit selection that includes items the user has not seen, and a selection with items hidden by the current filter.

### 4.3 Dialog content

State the count and the object type ("Delete 37 tracks permanently?"), the consequence, and that it cannot be undone. Use verb labels ("Delete 37 tracks", "Cancel"). Style the destructive button as destructive and do not make it the default. For a typed confirmation, keep the primary button disabled until the text matches [18][20][78]. The scope text and count must come from the same selection object as the payload [17].

### 4.4 Undo for bulk operations

- **One intention is one undo step.** Abowd and Dix frame undo as serving a user's intention, not a system command [80] (bibliographic record). A bulk delete of 37 items is therefore one history entry: a composite command or a transaction. Reusable hierarchical command objects are the classic implementation [81] (not opened).
- **Linear or selective.** Berlage's selective undo reverses one earlier command in the current state, when that is meaningful [82] (abstract). In shared data the established model is to undo one's own actions only [83] (not opened). A single global linear stack is therefore wrong for multi-user data.
- **Implementation strategies** (our synthesis): an inverse command (small, but wrong if the state drifted); a snapshot of the affected items (robust, costs memory); a delayed commit, where the call fires after the undo window (atomic, but a closed tab in the window loses or duplicates the action unless the pending intent is persisted); and soft delete, where the inverse is an attribute flip and undo survives a reload. Soft delete plus a toast is the combination to prefer for delete.
- **Timing and accessibility.** We could not verify a duration figure in the Material specification; the often-quoted "4 to 10 seconds" has no source we could find. Angular Material advises against a fixed duration on a snackbar that has an action, so that screen-reader users can reach it [84] (summary). WCAG 2.2.1 allows timed content when an alternative that does not rely on the timer exists [85], and O'Hara argues that a screen-reader user may not reach Undo before a toast goes, so undo should also live outside the toast [86]. Hence: pause the timer on hover and focus, and always mirror the undo in a persistent place (the trash, or a history entry).

### 4.5 Partial failure

Batch APIs report per item. Elasticsearch's `_bulk` returns a top-level `errors` flag and one result per operation, in order [87] (summary). S3 `DeleteObjects` returns a result per key and reports a missing key as deleted, which makes it idempotent [88] (summary). HTTP 207 Multi-Status carries one status per resource [89] (summary). Best effort with per-item results is the norm; all-or-nothing needs a transaction and is right only when the items depend on each other. For the UI: report the counts and the per-item reasons, keep the failed items selected, offer "Retry failed", and make undo cover only what succeeded (our synthesis; we found no design-system page on partial-failure screens).

### Recommendations

| Reversible by the system? | Cost and scale | Treatment |
|---|---|---|
| Yes (trash, archive, tag, move, status change) | any count | No dialog. Act at once; one compound undo ("37 items moved to Trash · Undo"); the trash or history is the long window |
| Yes, but with side effects that cannot be reversed (messages sent, external calls) | any | Plain confirmation naming the side effect |
| No (delete permanently, empty trash) | low cost, small count | Confirmation with count, object type and consequence; verb buttons; no destructive default |
| No | high cost, or count over a host-set limit, or an implicit selection with unseen items | Typed confirmation; primary disabled until it matches |

1. Each action declares `reversible` and optionally `confirm: 'none' | 'simple' | 'typed'` and `confirmThreshold`; the component derives the default from `reversible`. Ship no magic number: the threshold is a setting with a documented default labelled as an estimate.
2. Never show both a confirmation and an undo toast for one action.
3. Give every bulk operation a `batchId`, so its undo and its restore from trash act on the group.
4. Proposed result type, used by every selection action and by restore:

```ts
type BulkResult = {
  requested: number;
  succeeded: Id[];
  failed: { id: Id; code: string; message: string; retryable: boolean }[];
  skipped: { id: Id; reason: string }[];
  undoToken?: string;
};
```

5. Treat "not found" on delete as success. Show a toast for full success, and a result panel with "Retry failed" for partial success.

## References

[17] [Migrate select-all actions from Polaris React — Shopify, 2026](https://shopify.dev/docs/apps/build/app-home/migrate-from-polaris-react/select-all-actions.md)
[18] [Confirmation Dialogs Can Prevent User Errors — If Not Overused — Nielsen Norman Group](https://www.nngroup.com/articles/confirmation-dialog/)
[19] [Never Use a Warning When You Mean Undo — Aza Raskin, A List Apart, 2007](https://alistapart.com/article/neveruseawarning/)
[20] [Delete with additional confirmation — Cloudscape](https://cloudscape.design/patterns/resource-management/delete/delete-with-additional-confirmation/)
[74] [User Control and Freedom (Usability Heuristic 3) — Nielsen Norman Group](https://www.nngroup.com/articles/user-control-and-freedom/)
[75] [Alerts — Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/alerts) (search-summarised)
[76] [Dialog usage — Fluent 2](https://fluent2.microsoft.design/components/web/react/dialog/usage) (search-summarised)
[77] [Snackbars — Material Design](https://material.io/components/snackbars) (via search summary)
[78] [Remove pattern — Carbon Design System](https://carbondesignsystem.com/community/patterns/remove-pattern) (search-summarised)
[79] [Delete scenario pattern — GitHub Primer](https://primer.style/product/scenario-patterns/delete) (search-summarised)
[80] [Giving Undo Attention — Abowd and Dix, Interacting with Computers 4(3), 1992](https://bibbase.org/network/publication/abowd-dix-givingundoattention-1992) (bibliographic record)
[81] [Reusable Hierarchical Command Objects — Myers and Kosbie, CHI 1996](https://www.cs.cmu.edu/~amulet/papers/commandsCHI.html) (not opened)
[82] [A selective undo mechanism for graphical user interfaces based on command objects — Berlage, ACM TOCHI 1(3), 1994](https://scilit.com/publications/adb1ed36673556bf92702df99bdf41cf) (bibliographic record)
[83] [A Framework for Undoing Actions in Collaborative Systems — Prakash and Knister, TOCHI 1994](https://web.eecs.umich.edu/~aprakash/papers/undo-tochi94.pdf) (not opened)
[84] [Snackbar overview — Angular Material](https://material.angular.io/components/snack-bar) (via search summary)
[85] [Understanding SC 2.2.1 Timing Adjustable — W3C WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html)
[86] [A toast to a11y toasts — Scott O'Hara, 2019](https://scottohara.me/blog/2019/07/08/a-toast-to-a11y-toasts.html)
[87] [Bulk API — Elasticsearch reference](https://www.elastic.co/guide/en/elasticsearch/reference/current/docs-bulk.html)
[88] [DeleteObjects — Amazon S3 API reference](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObjects.html)
[89] [207 Multi-Status — MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/207)
