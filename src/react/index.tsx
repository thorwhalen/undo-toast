/**
 * The React undo toast: one polite live region, mounted once, bottom-left on a wide screen and
 * full-width at the bottom on a narrow one, above whatever bar is docked there (`useBottomDock`).
 * It never takes focus; F8 moves focus into it, Ctrl/Cmd+Z undoes while it shows (unless the app's
 * own undo history owns that key), Escape inside it closes it. Import `undo-toast/styles.css` once.
 */

import { useEffect, useId, useRef, useSyncExternalStore, type RefObject } from 'react';
import { getUndoOffers } from '../index.js';
import { bindDocument, type UndoOffers } from '../offers.js';

export interface UndoToastProps {
  /** The offer store to show. Default: the page's shared one (`getUndoOffers()`). */
  offers?: UndoOffers;
  /** The region's accessible name. */
  regionLabel?: string;
  /** Shown when an undo threw. */
  failedText?: string;
  /** The undo button's label after a failure. */
  retryLabel?: string;
}

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** True when the key event matches `F8`, `mod+z` and the like (`mod` = Cmd on Apple, Ctrl elsewhere). */
export function matchesHotkey(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>, hotkey: string | null, mac = isMac()): boolean {
  if (!hotkey) return false;
  const parts = hotkey.toLowerCase().split('+');
  const key = parts.pop();
  const mod = parts.includes('mod');
  const wantMeta = parts.includes('meta') || (mod && mac);
  const wantCtrl = parts.includes('ctrl') || (mod && !mac);
  return (
    event.key.toLowerCase() === key &&
    event.metaKey === wantMeta &&
    event.ctrlKey === wantCtrl &&
    event.shiftKey === parts.includes('shift') &&
    event.altKey === parts.includes('alt')
  );
}

const isEditable = (el: Element | null): boolean =>
  !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement).isContentEditable);

/** The toast. Render it once, near the root, always (its live region must exist before a message). */
export function UndoToast({ offers = getUndoOffers(), regionLabel = 'Notifications', failedText = 'Could not undo.', retryLabel = 'Try again' }: UndoToastProps) {
  const view = useSyncExternalStore(offers.subscribe, offers.current, () => null);
  const toastRef = useRef<HTMLDivElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const messageId = useId();

  useEffect(() => bindDocument(offers), [offers]);

  const hotkeys = view?.advice.hotkeys;
  useEffect(() => {
    if (!hotkeys) return;
    const onKey = (e: KeyboardEvent) => {
      if (matchesHotkey(e, hotkeys.focus)) {
        e.preventDefault();
        undoRef.current?.focus();
      } else if (matchesHotkey(e, hotkeys.undo) && !isEditable(document.activeElement)) {
        e.preventDefault();
        void offers.undo();
      } else if (e.key === 'Escape' && toastRef.current?.contains(document.activeElement)) {
        e.preventDefault();
        offers.close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [offers, hotkeys]);

  const hint = hotkeys?.undo ? (isMac() ? '⌘Z' : 'Ctrl+Z') : null;
  const failed = view?.status === 'failed';
  const undoing = view?.status === 'undoing';

  return (
    <section className="undo-toast-region" aria-label={regionLabel}>
      <div role="status" aria-live="polite" aria-atomic="true">
        {view && (
          <div
            ref={toastRef}
            className="undo-toast"
            data-status={view.status}
            onPointerEnter={(e) => e.pointerType === 'mouse' && offers.hold('hover', true)}
            onPointerLeave={(e) => e.pointerType === 'mouse' && offers.hold('hover', false)}
            onPointerDown={(e) => e.pointerType !== 'mouse' && offers.hold('touch', true)}
            onPointerUp={(e) => e.pointerType !== 'mouse' && offers.hold('touch', false)}
            onPointerCancel={() => offers.hold('touch', false)}
            onFocus={() => offers.hold('focus', true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) offers.hold('focus', false);
            }}
          >
            <span id={messageId} className="undo-toast-message">{failed ? `${failedText} ${view.message}` : view.message}</span>
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
              {failed ? retryLabel : view.advice.undoLabel}
              {hint && !failed && (
                <kbd className="undo-toast-hint" aria-hidden="true">
                  {hint}
                </kbd>
              )}
            </button>
            <button type="button" className="undo-toast-close" aria-label={view.advice.closeLabel} onClick={() => offers.close()}>
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </section>
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
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => root.style.setProperty(property, `${el.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => {
      observer.disconnect();
      root.style.removeProperty(property);
    };
  }, [ref, property]);
}
