/**
 * The React undo toast: one polite live region, mounted once, bottom-left on a wide screen and
 * full-width at the bottom on a narrow one, above whatever bar is docked there (`useBottomDock`).
 * It never takes focus; the page wiring (keys, hidden tab, `pagehide`) is the core's `bindPage`, so
 * any other renderer behaves the same. When the toast leaves with focus inside it, focus goes back
 * where it came from. Import `undo-toast/styles.css` once.
 */

import { useEffect, useId, useLayoutEffect, useRef, useSyncExternalStore, type MutableRefObject, type ReactNode, type Ref, type RefObject } from 'react';
import { getUndoOffers } from '../index.js';
import { bindPage, isApple, type OfferView, type UndoOffers } from '../offers.js';

export { matchesHotkey } from '../offers.js';

/** What a host-drawn control is given (see `renderAction`). */
export interface ActionRenderProps {
  /** Which control: the Undo (or Try again) button, or the close (×) button. */
  kind: 'undo' | 'close';
  /** Its text (Undo / Try again) or, for close, its accessible name. */
  label: string;
  /** Run it: undo (or retry) the action, or close the toast. */
  onActivate: () => void;
  /** Attach to the Undo control: the focus hotkey moves focus to it. Unset for close. */
  ref?: Ref<HTMLButtonElement>;
  /** The message's element id, for `aria-describedby` on the Undo control. */
  describedBy?: string;
  /** An undo is running: show it pending and ignore presses. */
  pending: boolean;
  /** The keyboard hint for Undo (⌘Z / Ctrl+Z), when the advice binds one. */
  hint: string | null;
  /** The class the default control has, to keep the toast's layout. */
  className: string;
}

export interface UndoToastProps {
  /** The offer store to show. Default: the page's shared one (`getUndoOffers()`). */
  offers?: UndoOffers;
  /** The region's accessible name. */
  regionLabel?: string;
  /**
   * Draw the Undo and close controls with the host's own pressable component (large touch targets,
   * a tap guard, a lockout after a press: an app for users with hand tremor needs all three). The
   * toast keeps the policy: timing, pauses, hotkeys, coalescing, failure and Try again. Return
   * `undefined` to keep the default control for a `kind`.
   */
  renderAction?: (props: ActionRenderProps) => ReactNode | undefined;
}

/** The toast. Render it once, near the root, always (its live region must exist before a message). */
export function UndoToast({ offers = getUndoOffers(), regionLabel = 'Notifications', renderAction }: UndoToastProps) {
  const view = useSyncExternalStore(offers.subscribe, offers.current, () => null);
  const toastRef = useRef<HTMLDivElement | null>(null);
  const undoRef = useRef<HTMLButtonElement | null>(null);
  /** Where focus was before it entered the toast; it goes back there when the toast leaves. */
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(
    () =>
      bindPage(offers, {
        focus: () => {
          const active = document.activeElement;
          if (active instanceof HTMLElement && !toastRef.current?.contains(active)) returnFocus.current = active;
          undoRef.current?.focus();
        },
        contains: (el) => !!el && !!toastRef.current?.contains(el),
      }),
    [offers],
  );

  return (
    <section className="undo-toast-region" aria-label={regionLabel}>
      <div role="status" aria-live="polite" aria-atomic="true">
        {view && <Toast key={view.id} view={view} offers={offers} toastRef={toastRef} undoRef={undoRef} returnFocus={returnFocus} renderAction={renderAction} />}
      </div>
    </section>
  );
}

interface ToastProps {
  view: OfferView;
  offers: UndoOffers;
  toastRef: MutableRefObject<HTMLDivElement | null>;
  undoRef: MutableRefObject<HTMLButtonElement | null>;
  returnFocus: MutableRefObject<HTMLElement | null>;
  renderAction?: UndoToastProps['renderAction'];
}

/** One offer, keyed by its id, so a replacing offer is announced and animated afresh. */
function Toast({ view, offers, toastRef, undoRef, returnFocus, renderAction }: ToastProps) {
  const messageId = useId();
  const own = useRef<HTMLDivElement | null>(null);

  // Runs before React removes the element: if focus is inside, send it back where it came from.
  useLayoutEffect(
    () => () => {
      const el = own.current;
      if (el && el.contains(document.activeElement)) {
        const target = returnFocus.current;
        returnFocus.current = null;
        if (target?.isConnected) target.focus();
      }
    },
    [returnFocus],
  );

  const { advice, status } = view;
  const failed = status === 'failed';
  const undoing = status === 'undoing';
  const hint = advice.hotkeys.undo ? (isApple() ? '⌘Z' : 'Ctrl+Z') : null;

  return (
    <div
      ref={(el) => {
        own.current = el;
        toastRef.current = el;
      }}
      className="undo-toast"
      data-status={status}
      onPointerEnter={(e) => e.pointerType === 'mouse' && offers.hold('hover', true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && offers.hold('hover', false)}
      onPointerDown={(e) => e.pointerType !== 'mouse' && offers.hold('touch', true)}
      onPointerUp={(e) => e.pointerType !== 'mouse' && offers.hold('touch', false)}
      onPointerCancel={() => offers.hold('touch', false)}
      onFocus={(e) => {
        const from = e.relatedTarget;
        if (from instanceof HTMLElement && !e.currentTarget.contains(from)) returnFocus.current = from;
        offers.hold('focus', true);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) offers.hold('focus', false);
      }}
    >
      <span id={messageId} className="undo-toast-message">
        {failed ? `${advice.failedText} ${view.message}` : view.message}
      </span>
      {renderAction?.({
        kind: 'undo',
        label: failed ? advice.retryLabel : advice.undoLabel,
        onActivate: () => {
          if (!undoing) void offers.undo();
        },
        ref: undoRef,
        describedBy: messageId,
        pending: undoing,
        hint: failed ? null : hint,
        className: 'undo-toast-undo',
      }) ?? (
        <button
          ref={undoRef}
          type="button"
          className="undo-toast-undo"
          aria-describedby={messageId}
          aria-disabled={undoing || undefined}
          aria-busy={undoing || undefined}
          data-pending={undoing || undefined}
          onClick={() => void offers.undo()}
        >
          {failed ? advice.retryLabel : advice.undoLabel}
          {hint && !failed && (
            <kbd className="undo-toast-hint" aria-hidden="true">
              {hint}
            </kbd>
          )}
        </button>
      )}
      {renderAction?.({
        kind: 'close',
        label: advice.closeLabel,
        onActivate: () => offers.close(),
        pending: false,
        hint: null,
        className: 'undo-toast-close',
      }) ?? (
        <button type="button" className="undo-toast-close" aria-label={advice.closeLabel} onClick={() => offers.close()}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

/**
 * Keep the toast above a bar docked at the bottom of the screen (a player, a tab bar): the bar's
 * height, measured live, becomes `--undo-toast-dock` on the root element. No hard-coded offset, so
 * the toast sits at the very bottom when the bar is gone and right above it when it is there.
 */
export function useBottomDock(ref: RefObject<HTMLElement | null>, { property = '--undo-toast-dock' }: { property?: string } = {}): void {
  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el) return;
    const measure = () => root.style.setProperty(property, `${el.getBoundingClientRect().height}px`);
    measure();
    if (typeof ResizeObserver === 'undefined') return () => root.style.removeProperty(property);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty(property);
    };
  }, [ref, property]);
}
