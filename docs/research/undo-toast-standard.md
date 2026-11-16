# Undo toasts: the established standard, and defaults for a reusable package

Research date: 2026-11-16. Scope: the transient "Item deleted. Undo" message shown after a reversible action, to set the defaults of a framework-free decision function with a React/TS surface.

## Summary

The sources agree on more than the shipped libraries suggest. The design systems that have updated their guidance recently (Material 3, Carbon, Polaris in code, Fluent 2) converge on one rule that most toast libraries do not follow by default: **a toast that carries an action, and Undo is the archetypal action, should not vanish on a short timer** [1][2][12][20]. Material 3 now says it outright: snackbars with actions "should remain on the screen until the user takes an action on the snackbar, or dismisses it" [1], and "Snackbars with actions shouldn't auto-dismiss" [2]. WCAG 2.2.1 backs this whenever the toast is the only way to undo [35]. Libraries such as sonner (4 s) and react-hot-toast (2–4 s) default to short timers for every toast [24][26][27], and react-admin's undoable mode commits after 5 s [29][30], so the package should not copy library defaults.

The second consensus is about focus and announcement: announce politely through a live region that already exists, do not move focus, do not trap focus, give keyboard users a documented shortcut to reach the toast, and let Escape close it [2][37][38][43][46]. Carbon is the outlier here, since its actionable toast is an `alertdialog` that takes and traps focus [13][14].

The third is that an undo toast is often the wrong pattern: errors, long-running work, irreversible actions and trivial frequent actions each have a better pattern, and GitHub's Primer goes as far as recommending against toasts altogether [22][23][48][49][9].

### Recommended defaults

| Setting | Recommended default | Where a different value applies |
|---|---|---|
| Name | "undo toast" in docs; "snackbar" as an alias | Material/Android codebases say snackbar [1][7] |
| Placement, desktop / wide | Bottom, inline-start (bottom-left in LTR), 24 px from the edges | Bottom-centre is equally sanctioned if consistent [1][4]; top-right only if the app already puts all notifications there (Carbon) [12] |
| Placement, phone / compact | Bottom, full width minus 16 px gutters, lifted above bottom nav, FAB, docked toolbar or persistent player | Never in front of navigation or a FAB [1][6] |
| Auto-dismiss when Undo is the only path to reverse the action | **None**: stays until Undo, Close, Escape, or replacement by the next toast | Required by M3 [1][2] and by WCAG 2.2.1 unless the timer is adjustable/extendable [35] |
| Auto-dismiss when the action is also reversible elsewhere (Ctrl/Cmd+Z, history, Trash) | 10 s, paused while hovered, focused, or the page is hidden | 4–7 s only for toasts with no action [2][5][15][24] |
| Commit model | Compensating undo (soft delete, restore on Undo); the toast lifetime is decoupled from the commit | Deferred commit only when the side effect cannot be reversed (sending email): window 10 s default, user-configurable (Gmail offers 5/10/20/30 s) [31] |
| Close control | Icon button "×" with accessible name "Close notification"; tooltip "Close" | Never "Dismiss", "Cancel" or "OK" as text beside Undo (see §3) [4][9] |
| Action label | Visible "Undo"; accessible name starts with it, e.g. "Undo delete of Report.pdf" | One action only [1][12] |
| Focus | Not moved on appear; not trapped; returns to the previously focused element (or next logical one) after Undo/Close | Carbon's `alertdialog` traps focus [13][14]; reserve that for decisions, not undo |
| Keyboard | Escape closes when focus is in the toast; Enter/Space only activate the focused button; a documented hotkey moves focus to the toast region (configurable, e.g. Alt+T as in sonner); Ctrl/Cmd+Z undoes the latest action when focus is not in an editable field | Gmail uses `z` [32]; Docs and macOS use Ctrl/Cmd+Z [34][8] |
| Announcement | Persistent `role="status"` (`aria-live="polite"`, `aria-atomic="true"`) region, present in the DOM before any message | `role="alert"` / assertive only for urgent errors, which should not be undo toasts anyway [37][46] |
| Stacking | One undo toast at a time; a new one replaces the old | Stacks (sonner 3, Fluent max 4) suit independent informational toasts [15][24] |
| Previous undo when replaced | Stays undoable through Ctrl/Cmd+Z / history (compensating model); a pending deferred commit is flushed | Batch same-kind actions inside the window: "3 items deleted. Undo" undoes all [8] |
| Motion | Short slide/fade; under `prefers-reduced-motion: reduce`, opacity only | WCAG 2.3.3 (AAA) [40] |
| Targets | Undo and Close at least 44×44 px on touch; never below 24×24 px | 2.5.8 AA is 24 px [39]; Apple 44 pt [11] |
| Swipe to dismiss | On for touch, threshold about 45 px, always paired with the Close button | 2.5.1 needs a single-pointer alternative [41] |

## 1. Placement

**What the sources say.**

- Material 3: snackbars "should be placed at the bottom of a UI, in front of the main content", may be "nudged upwards to avoid overlapping with other UI elements near the bottom, such as FABs or docked toolbars", and must not sit in front of navigation; "Snackbars should appear above FABs", never in front of or behind one [1]. On medium and expanded breakpoints they "can be left-aligned or center-aligned if they are consistently placed on the same spot at the bottom of the screen", and must not be flush to an edge [1]. For keyboard users on the web, the snackbar must not "completely obscure" actionable or focused elements [1].
- Material 1 gave the numbers: on tablet/desktop "centered or left-aligned 24dp from the left and bottom edges"; on mobile it animates up from the bottom edge [4]. MDC Web exposes the left variant as `--leading`, tablet/desktop only [5]. Android's `setAnchorView` exists to put the snackbar above a FAB, `BottomAppBar` or `BottomNavigationView` [6].
- Apple HIG: iOS has no toast component. Undo is a system gesture (shake, three-finger swipe) that shows an alert titled "Undo <action>", plus Edit-menu items and Cmd+Z on Mac and iPad [8]. Apple prefers status integrated into the interface near what it describes over a floating message [10], and says not to raise alerts for "common, undoable actions, even when they're destructive" [9].
- IBM Carbon: toasts "slide in and out from the top right of the screen" and stack with the newest on top [12].
- Fluent 2: one consistent location, "where they are least likely to block the main content", typically a top or bottom corner; the React library defaults to `bottom-end` [15][16].
- Atlassian: "Flags appear at the bottom left of the screen and overlay any content", above modals [17].
- Shopify: the App Bridge toast "appears at the top of the interface in the web admin and at the bottom in the Shopify mobile app" [21].
- Gmail undo-send: the "Message sent" notice with Undo appears at the bottom left [31].
- GitHub Primer recommends against toasts, partly because they "may sit outside a user's view on large displays" and are disconnected from the trigger [22].
- Libraries: sonner defaults to `bottom-right`, 32 px offset, 16 px on mobile [24]; react-hot-toast defaults to `top-center` [28].

**Disagreement.** Bottom versus top is a real split: Material, Atlassian, Gmail and Fluent's library default are at the bottom; Carbon, Shopify web admin and react-hot-toast are at the top. Left versus right also splits (Atlassian and Gmail left, sonner and Fluent right).

**Recommendation.** Desktop: bottom, inline-start (bottom-left in LTR, mirrored in RTL), 24 px from the edges, as Material and Gmail do [1][4][31]. The inline-start corner keeps clear of the bottom-right FAB and chat widgets that Material explicitly protects [1]. Phone: bottom, full width minus 16 px gutters [24], with a configurable bottom clearance computed from the obstructions present (bottom nav, FAB, docked toolbar, persistent media player, safe-area inset) [1][6]. A top placement fits only an app whose notifications already live at the top (Carbon-style dashboards) [12][21]. The decision function should take the list of bottom obstructions as an input rather than hard-code an offset.

## 2. Auto-dismiss timing and the WCAG questions

**What the design systems say.**

- Material 3: snackbars without actions "can auto-dismiss after 4–10 seconds, depending on platform"; "Avoid using auto-dismissing snackbars on web unless there's also inline feedback"; snackbars with actions "should remain on the screen until the user takes an action on the snackbar, or dismisses it" [1]. The accessibility page repeats "Snackbars with actions shouldn't auto-dismiss" [2]. This supersedes the older Material 2 guidance, which allowed "a minimum of four seconds, and a maximum of ten seconds" for all snackbars, actions included [3]. MDC Web's implementation still uses a 5000 ms default and accepts 4000–10000 ms or -1 (no timeout) [5]; Compose defaults to `SnackbarDuration.Short`, with `Indefinite` available [7].
- Carbon: toasts persist by default (React `timeout` defaults to 0) and can be set to dismiss after five seconds; actionable notifications "persist until a user dismisses them" [12][14].
- Polaris (from source; the guidance pages now redirect and could not be fetched): `DEFAULT_TOAST_DURATION = 5000`, `DEFAULT_TOAST_DURATION_WITH_ACTION = 10000`, and a console warning that a toast with an action "should persist for at least 10,000 milliseconds" [20].
- Fluent 2: a toast with no action "will time out after seven seconds"; hovering pauses it; "conditional dismissal" keeps a toast up until a condition is met [15]. The React library's default is 3000 ms with `pauseOnHover: false` [16], which disagrees with its own usage page.
- Atlassian: auto-dismiss flags close after 8 s (taken from a search summary of the auto-dismiss flag page and the Forge `showFlag` API; the page itself returned no text when fetched) [19]; "Never use auto dismiss flags for any critical warning or error messages" [17][18].
- Libraries: sonner 4000 ms for all toasts, paused while hovered, interacted with, or while the document is hidden [24][26]; react-hot-toast 2000 ms for success and 4000 ms otherwise, paused on hover [27][28]; react-admin's undoable mode shows the Undo notification and sends the mutation "after a 5 seconds delay" [29][30].
- Gmail undo-send offers a cancellation period of 5, 10, 20 or 30 seconds; the help page does not state the default [31].

**Reading-time rules.** None of the pages fetched for this report publishes a per-word formula (such as 500 ms/word); the numeric anchors in the primary sources are 4–10 s (Material) [2], 7 s (Fluent, no action) [15], 8 s (Atlassian) [19], and 10 s minimum with an action (Polaris) [20]. A per-word scaling is therefore a heuristic, not a standard; if the package offers one, treat it as a floor raiser on top of the 10 s minimum, never as a way to go shorter.

**WCAG 2.2.**

- **2.2.1 Timing Adjustable (Level A)** requires that, for each time limit set by the content, the user can turn it off, adjust it over at least ten times the default, or be warned and given at least 20 s to extend it, unless the limit is real-time, essential, or longer than 20 hours [35]. The Understanding document treats "any process that happens without user initiation after a set time" as a time limit, and its own notification example is the deciding test: a disappearing new-mail toast is fine because the inbox shows the same information, but "if the user has no other means of discovering the same information (or performing the same function), then each message would need to meet this success criterion" [35]. It adds that content on a timer need not be adjustable "if there is an alternative that does not rely on a timer" [35]. Applied to undo: **if the toast is the only way to undo, its timer is a time limit on that function and must be removable, adjustable 10×, or extendable**; if Ctrl/Cmd+Z, an undo history or a Trash also undoes the action, the toast may auto-dismiss. The 20-hour exception does not rescue a toast in practice. Primer, Roselli and O'Hara all read 2.2.1 this way [22][44][45].
- **Deferred commit is also a time limit.** When the action is committed at the end of the window (Gmail undo-send, react-admin undoable), the window bounds the undo function itself [29][31][35]. Gmail's user setting is an "adjust" mechanism, though 30 s is not ten times 5 s; whether Gmail conforms, or claims the essential exception, is not settled by the sources. The package should keep deferred commit for cases that really need it and pause the window while the toast is hovered or focused.
- **2.2.4 Interruptions (AAA)**: interruptions "can be postponed or suppressed by the user, except interruptions involving an emergency" [36]. A polite, non-focus-stealing toast is the low-interruption end; a global "quiet notifications" setting would satisfy it.
- **4.1.3 Status Messages (AA)**: a status message must be programmatically determinable "through role or properties" so assistive technology can present it without receiving focus [37]. Success/result messages use `role="status"` (technique ARIA22); `role="alert"` is for warnings and errors, and the listed failure is "Using role="alert" or aria-live="assertive" on content which is not important and time-sensitive" [37]. ARIA22's test checks that the `status` container exists "before the status message occurs" [38].
- **2.1.1 Keyboard and 2.4.3 Focus Order**: the Undo and Close controls must be keyboard operable and reachable in a logical order, and focus must be managed when the toast is removed [22][44][45].
- **Pause on hover and focus.** O'Hara: no auto-dismissal while focus or hover is inside the toast, while noting that screen-reader virtual cursors fire neither event [45]. sonner and react-hot-toast pause on hover; sonner also pauses while the page is hidden [26][28]. Fluent's guidance pauses on hover, its library default does not [15][16].

**Is the undo still available after the toast disappears?** Gmail: deleted mail stays in Trash "up to 30 days" and is recoverable [33]; `z` undoes the last action once keyboard shortcuts are enabled [32]. Google Docs: Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z [34]. Apple: Edit menu and Cmd+Z/Shift+Cmd+Z on Mac, shake and three-finger swipe on iPhone and iPad, with multiple levels and no "unnecessary limits" [8]. Material 3: snackbars "shouldn't be the only way to access a core use case" [1]. Figma was not checked for this report.

**Recommendation.** The decision function takes `undoElsewhere: boolean` (Ctrl/Cmd+Z, history panel, Trash) and `commit: 'compensating' | 'deferred'`. If Undo lives only in the toast, no timer: the toast stays until Undo, Close, Escape or replacement [1][2][35]. If it lives elsewhere too, 10 s [20], paused on hover, focus-within and `document.hidden` [26][45]. For deferred commits, a 10 s window by default, paused while hovered or focused, with the length exposed as a user setting, Gmail-style [31]. Flushing a pending commit on `pagehide` (or warning on unload) is an engineering choice; react-admin's docs do not say what it does when the tab closes during the window [29][30].

## 3. The close control label

**What the sources say.** Material 1 allowed a single action "neither of which may be 'Dismiss' or 'Cancel'" [4]; Material 3 lists an optional close button in the anatomy, says "'Dismiss' or 'cancel' actions are optional", and cautions that a dismiss action is unnecessary for auto-dismissing snackbars [1]. Fluent 2 calls the control "Close" and allows it only when the content can be found again elsewhere [15]. Carbon's close button defaults to the accessible name "close notification" [14]; sonner's to "Close toast", with the close button off by default [26]; Polaris renders an icon-only close button with no accessible name in the source fetched, which is an accessibility bug rather than a precedent [20]. Apple reserves "Cancel" for "a button that cancels an alert's action" [9], which is exactly the reading that would make "Cancel" next to "Item deleted" mean undo.

**The confusion.** No source documents the "Dismiss" ambiguity directly. The reasoning is the Apple convention above: in a message about an action, "Cancel" and "Dismiss" read as verbs that apply to the action, so "Dismiss" beside "Item deleted" can be parsed as "dismiss the deletion". Material 1's ban on both words in snackbar actions points the same way [4]. "OK" or "Got it" implies acknowledgement is required, which a non-blocking toast does not need.

**Recommendation.** An icon-only "×" button with the accessible name "Close notification" (tooltip "Close"), positioned after Undo, visually quieter than Undo. The Undo button's visible text is "Undo", and its accessible name starts with that text and names the object ("Undo delete of Report.pdf"), which satisfies 2.5.3 Label in Name and its best practice of putting the visible label first [42]. Show the close button whenever the toast has no timer (it is then the only way to clear it besides Escape) [1][15].

## 4. Keyboard and screen readers

**Focus.** Material 3: "announce the message but don't move focus", don't trap it, and "on web, a shortcut should exist for users to move focus to snackbars with actions (like Alt+G)", documented in help [2]. After the snackbar, focus returns to the element that triggered it or the next logical element [2]. The APG alert pattern: "it is crucial they do not affect keyboard focus" [43]. Fluent: toasts without actions get no keyboard focus [15]. Soueidan: moving focus to an interactive notification is acceptable only as "an immediate response to the user's action" [47]. Carbon disagrees for actionable toasts: role `alertdialog`, focus moved to the action and trapped [13][14]. Roselli and Soueidan say an interactive toast is really a non-modal dialog, and that the live region cannot convey the button's semantics [44][47].

**Keys.** Material 3: Tab moves between interactive elements, Esc dismisses when focus is in the snackbar [2]; MDC's `closeOnEscape` defaults to true [5]; Carbon's actionable notification also closes on Escape [14]; Polaris listens for Escape [20]. sonner's hotkey to focus the region is Alt+T [24][26]. No source recommends binding Enter globally to undo; Enter and Space should only activate the focused button, which native `<button>` elements do. Global Ctrl/Cmd+Z is the platform undo [8][34]; Gmail's single-key `z` requires shortcuts to be turned on [32].

**Live regions.** Polite, not assertive: Material 3 says "use a live region with a polite (queued) announcement" on Android and web [2]; WCAG lists assertive for non-urgent content as a failure [37]. Fluent and Polaris use assertive for most toasts [15][20], which contradicts this. The region must exist before content is injected: Soueidan says to place it "in the DOM as early as possible and then populate it" [46]; Roselli says live regions must be present at render and not hidden with `display: none` [44]; ARIA22 tests for it [38]. `role="status"` implies `aria-live="polite"` and atomic reading, though ARIA22 advises an explicit `aria-atomic="true"` [38][46]. Roselli recommends a labelled `region` landmark (not itself a live region) as the toast holder [44]; sonner labels its region "Notifications" and marks it polite [25][26].

**Recommendation.** Mount one visually empty `role="status"` region at app start and put only the message text in it. Render the toast (with Undo and Close) in a labelled region landmark beside it, not inside the live region. Do not move focus on appear. Escape closes when focus is inside; after Undo or Close, focus returns to the previously focused element, or the next logical element if that one was deleted [2][45]. Provide a configurable focus hotkey (default Alt+T, as sonner) and a global Ctrl/Cmd+Z that undoes the most recent action when focus is not in an editable field, so native text undo keeps working.

## 5. Stacking and queueing

**What the sources say.** Material 3: "Only one snackbar may be displayed at a time"; consecutive snackbars appear one at a time, and "a snackbar with updated information can immediately replace an outdated snackbar"; don't stack them [1]. Material 1: the first contracts before the second appears [4]. Android: `LENGTH_INDEFINITE` lasts until dismissed "or another snackbar is shown" [6]. Stacking camp: Carbon (newest on top) [12], Atlassian (most recent on top; never mix dismissible and non-dismissible) [17], Fluent (at most four, 16 px apart) [15], sonner (three visible) [24].

**What happens to the previous undo.** No design system specifies it. Apple asks for multiple undo levels and for batch revert of "discrete but related actions" [8]. Under react-admin's deferred model, each mutation has its own 5 s timer [29].

**Recommendation.** One undo toast at a time; a new reversible action replaces it. The replaced action stays undoable through Ctrl/Cmd+Z and the undo history (compensating model) [8]; a pending deferred commit is flushed when replaced, since its only Undo control is gone. Same-kind actions within the window coalesce into one toast, "3 items deleted. Undo", whose Undo reverses all of them [8]. Independent informational toasts may stack separately, but not on top of the undo toast.

## 6. When an undo toast is the wrong pattern

- **Irreversible, uncommon, or high-cost actions.** Apple: warn when an action "can cause data loss that's unexpected and irreversible", but not when data loss is the expected result [10]; alert for an "uncommon destructive action that they can't undo" [9]. NN/g: reserve confirmation for serious consequences, make it specific, label buttons by outcome, and for the most dangerous cases require an unusual act such as typing a word (MailChimp) [49]. → Confirm dialog, or type-to-confirm when cost is extreme.
- **Common, reversible actions.** Raskin: "Never use a warning when you mean undo", because people habituate to confirmations [51]; Apple: avoid alerts for "common, undoable actions, even when they're destructive" [9]; NN/g prefers undo to confirmation [49][50]. → Undo toast.
- **Deferred commit versus compensating undo.** Gmail delays the send (deferred, 5–30 s) [31] but makes delete soft, with 30 days in Trash [33]; react-admin defers every mutation by 5 s [29][30]. → Prefer compensating undo, which frees the toast from any timer; use deferred commit only for side effects that cannot be reversed afterwards (sending a message, charging, notifying others).
- **Long-running actions.** Fluent: "conditional dismissal" until a condition is met [15]; Primer: banners plus email or notification-centre follow-up [22]. → Persistent progress notification, not a timed toast.
- **Errors.** NN/g: a toast "would be a bad way to implement an error message"; one user waited minutes after missing a 5 s error [48]. Atlassian: never auto-dismiss errors or warnings [17][18]; Primer: banners or dialogs [22]. → Persistent error with Retry.
- **The result is off-screen.** Apple: "Show the results of an undo or redo", scrolling to the restored item if needed [8]. → After Undo, scroll to and highlight the restored item; if the original action's effect is off-screen, the toast text must name the object.
- **Very frequent, trivial actions.** Apple: people "only need to know when it doesn't" succeed [10]; Primer: simple successful actions need no confirmation, the visible result is the feedback [22]; Material 3: snackbars should not be overused relative to dialogs [1]. → No toast; keep undo in Ctrl/Cmd+Z and history.
- **Information the user must not miss.** Material 3 on the web: an auto-dismissing snackbar needs inline feedback near the trigger ("Saved" on the Save button) [1][2]. → Inline feedback plus, optionally, the toast. GOV.UK goes further: its design system has no toast at all, and reports the outcome of an action on a previous page with a notification banner (the success variant uses `role="alert"`) [52].

## 7. Motion, touch targets, swipe

- **Motion.** WCAG 2.3.3 Animation from Interactions (AAA): "Motion animation triggered by interaction can be disabled, unless the animation is essential"; technique C39 is the `prefers-reduced-motion` media query [40]. Material 3: don't animate other components (such as the FAB) along with the snackbar [1]. sonner's source does not handle reduced motion [26]. → Slide plus fade normally, opacity-only under reduced motion.
- **Touch targets.** WCAG 2.5.8 (AA): at least 24×24 CSS px or sufficient spacing; the enhanced 2.5.5 uses 44×44 [39]; Apple: "a hit region of at least 44x44 pt" [11]; Roselli recommends large close targets for touch [44]. → 44×44 px hit areas for Undo and Close on coarse pointers, padding allowed to extend the visible size.
- **Swipe to dismiss.** Material snackbars "exit by being swiped off-screen" [4]; Android enables it inside `CoordinatorLayout` [6]; sonner uses a 45 px threshold or velocity above 0.11, in directions based on position [24][26]. WCAG 2.5.1 Pointer Gestures (A) lists swiping as path-based, so a single-pointer alternative is required [41]. → Swipe on for touch, the Close button always present when swipe is the only other dismissal.

## 8. Terminology

Material calls the pattern a **snackbar** and reserves "toast" for Android system messages [1][4]. Carbon says **toast notification**, and **actionable notification** for one with a button [12]. Fluent 2, Polaris, Shopify App Bridge, sonner and react-hot-toast say **toast** [15][20][21][24][27]. Atlassian says **flag** [17]. NN/g defines a toast as "a small nonmodal popup that disappears after a few seconds", a kind of passive notification [48]. WCAG names the content a **status message** [37]; ARIA names the roles `status` and `alert` [37][43]. Apple has no component name; undo is a system feature [8]. → Use **"undo toast"** in package docs and API names, mention "snackbar" as a synonym for Material users, and use "status message" in accessibility docs.

## Implications for the decision function

Inputs that the sources show to matter: reversibility (`none` / `compensating` / `deferred`), cost and frequency of the action, whether undo exists elsewhere (`undoElsewhere`), whether the affected object is visible, viewport class (compact / wide), the bottom obstructions present, text direction, pointer type, and `prefers-reduced-motion`. Outputs: the pattern (`none` / `undoToast` / `confirm` / `typeToConfirm` / `progress` / `persistentError`), placement and bottom clearance, duration (`null` for none), pause triggers, commit timing, close control on/off, and whether to coalesce with the current toast. Every row of the defaults table is one branch of that function.

## Sources not fetched or partially fetched

- Polaris toast guidance: polaris.shopify.com and polaris-react.shopify.com redirect to shopify.dev and the old content path returns 404; findings come from the Polaris React source [20] and the App Bridge toast page [21].
- Material 3 snackbar pages render client-side and returned no text to a plain fetch; they were read in a browser [1][2]. The Material 2 guidelines were read from a third-party mirror [3].
- Fluent 2 toast accessibility page returned 404; the usage page and library source were used [15][16].
- Atlassian auto-dismiss flag page returned no text; the 8 s figure comes from a search summary of that page and of the Forge `showFlag` API [19].
- Apple HIG pages were read through their JSON data endpoints [8][9][10][11].
- Gmail's delete-undo toast duration and default undo-send period could not be verified; Figma was not checked.

## REFERENCES

1. [Material Design 3: Snackbar, guidelines](https://m3.material.io/components/snackbar/guidelines)
2. [Material Design 3: Snackbar, accessibility](https://m3.material.io/components/snackbar/accessibility)
3. [Material Design 2: Snackbars (third-party mirror of the original guidelines)](https://zyun.gitbook.io/temporary-views/official/material-design/original/snackbars)
4. [Material Design 1: Snackbars & toasts](https://m1.material.io/components/snackbars-toasts.html)
5. [Material Components for the Web: mdc-snackbar README](https://github.com/material-components/material-components-web/blob/master/packages/mdc-snackbar/README.md)
6. [Material Components for Android: Snackbar](https://github.com/material-components/material-components-android/blob/master/docs/components/Snackbar.md)
7. [Android Developers: Snackbar (Jetpack Compose)](https://developer.android.com/develop/ui/compose/components/snackbar)
8. [Apple Human Interface Guidelines: Undo and redo](https://developer.apple.com/design/human-interface-guidelines/undo-and-redo)
9. [Apple Human Interface Guidelines: Alerts](https://developer.apple.com/design/human-interface-guidelines/alerts)
10. [Apple Human Interface Guidelines: Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback)
11. [Apple Human Interface Guidelines: Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)
12. [Carbon Design System: Notification, usage](https://carbondesignsystem.com/components/notification/usage/)
13. [Carbon Design System: Notification, accessibility](https://carbondesignsystem.com/components/notification/accessibility/)
14. [Carbon React: Notification.tsx source](https://github.com/carbon-design-system/carbon/blob/main/packages/react/src/components/Notification/Notification.tsx)
15. [Fluent 2: Toast, usage](https://fluent2.microsoft.design/components/web/react/core/toast/usage)
16. [Fluent UI React v9: createToaster.ts source](https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-toast/library/src/state/vanilla/createToaster.ts)
17. [Atlassian Design System: Flag, usage](https://atlassian.design/components/flag/usage)
18. [Atlassian Design System: Flag, examples](https://atlassian.design/components/flag/examples)
19. [Atlassian Design System: Auto dismiss flag](https://atlassian.design/components/flag/auto-dismiss-flag) and [Atlassian Forge: showFlag](https://developer.atlassian.com/platform/forge/apis-reference/ui-api-bridge/showFlag/) (via search summary)
20. [Shopify Polaris React: Toast.tsx source](https://github.com/Shopify/polaris/blob/main/polaris-react/src/components/Frame/components/Toast/Toast.tsx)
21. [Shopify App Bridge: Toast API](https://shopify.dev/docs/api/app-bridge-library/apis/toast)
22. [GitHub Primer: Accessibility, Toasts](https://primer.style/accessibility/toasts)
23. [GitHub Primer: Notification messaging](https://primer.style/product/ui-patterns/notification-messaging/)
24. [sonner: Toaster API](https://sonner.emilkowal.ski/toaster)
25. [sonner: toast() API](https://sonner.emilkowal.ski/toast)
26. [sonner: src/index.tsx source](https://github.com/emilkowalski/sonner/blob/main/src/index.tsx)
27. [react-hot-toast: toast() API](https://react-hot-toast.com/docs/toast)
28. [react-hot-toast: toaster.tsx source](https://github.com/timolins/react-hot-toast/blob/main/src/components/toaster.tsx)
29. [react-admin: Features (undoable mutations)](https://marmelab.com/react-admin/Features.html)
30. [react-admin: Edit, mutationMode](https://marmelab.com/react-admin/Edit.html)
31. [Gmail Help: Unsend Gmail messages](https://support.google.com/mail/answer/2819488?hl=en)
32. [Gmail Help: Keyboard shortcuts for Gmail](https://support.google.com/mail/answer/6594?hl=en)
33. [Gmail Help: Delete or recover deleted Gmail messages](https://support.google.com/mail/answer/7401?hl=en)
34. [Google Docs Editors Help: Keyboard shortcuts for Google Docs](https://support.google.com/docs/answer/179738?hl=en)
35. [W3C: Understanding SC 2.2.1 Timing Adjustable](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html)
36. [W3C: Understanding SC 2.2.4 Interruptions](https://www.w3.org/WAI/WCAG22/Understanding/interruptions.html)
37. [W3C: Understanding SC 4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
38. [W3C: Technique ARIA22, Using role=status to present status messages](https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA22)
39. [W3C: Understanding SC 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
40. [W3C: Understanding SC 2.3.3 Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)
41. [W3C: Understanding SC 2.5.1 Pointer Gestures](https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html)
42. [W3C: Understanding SC 2.5.3 Label in Name](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html)
43. [W3C ARIA Authoring Practices Guide: Alert pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alert/)
44. [Adrian Roselli: Defining 'Toast' Messages](https://adrianroselli.com/2020/01/defining-toast-messages.html)
45. [Scott O'Hara: A toast to an accessible toast](https://www.scottohara.me/blog/2019/07/08/a-toast-to-a11y-toasts.html)
46. [Sara Soueidan: Accessible notifications with ARIA Live Regions, part 1](https://www.sarasoueidan.com/blog/accessible-notifications-with-aria-live-regions-part-1/)
47. [Sara Soueidan: Accessible notifications with ARIA Live Regions, part 2](https://www.sarasoueidan.com/blog/accessible-notifications-with-aria-live-regions-part-2/)
48. [Nielsen Norman Group: Indicators, Validations, and Notifications](https://www.nngroup.com/articles/indicators-validations-notifications/)
49. [Nielsen Norman Group: Confirmation Dialogs Can Prevent User Errors (If Not Overused)](https://www.nngroup.com/articles/confirmation-dialog/)
50. [Nielsen Norman Group: Preventing User Errors: Avoiding Conscious Mistakes](https://www.nngroup.com/articles/user-mistakes/)
51. [Aza Raskin, A List Apart: Never Use a Warning When you Mean Undo](https://alistapart.com/article/neveruseawarning/)
52. [GOV.UK Design System: Notification banner](https://design-system.service.gov.uk/components/notification-banner/)
