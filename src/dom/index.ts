/**
 * The framework-free undo toast: the same toast as `undo-toast/react`, drawn with plain DOM calls,
 * for a static site with one vanilla `app.js` (no React, no bundler). Call `mountUndoToast()` once
 * at startup; it creates the polite live region, shows whatever the offer store holds, and returns
 * a function that removes it. The markup and class names are the React toast's, so the same
 * `undo-toast/styles.css` styles both. The page wiring (keys, hidden tab, `pagehide`) is the core's
 * `bindPage`; focus never moves except on F8 and goes back where it came from when the toast leaves.
 * Message text is set with `textContent`, never parsed as HTML.
 */

import { getUndoOffers } from '../index.js';
import { bindPage, isApple, type OfferView, type UndoOffers } from '../offers.js';

export interface MountUndoToastOptions {
  /** The offer store to show. Default: the page's shared one (`getUndoOffers()`). */
  offers?: UndoOffers;
  /** The region's accessible name. */
  regionLabel?: string;
  /** Where to put the region. Default: `document.body`. */
  container?: HTMLElement;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
let nextId = 0;

/** Mount the toast once, always (its live region must exist before a message). Returns `unmount`. */
export function mountUndoToast({ offers = getUndoOffers(), regionLabel = 'Notifications', container }: MountUndoToastOptions = {}): () => void {
  const region = el('section', 'undo-toast-region');
  region.setAttribute('aria-label', regionLabel);
  const live = el('div');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  region.append(live);
  // Called from a <script> in <head>, there is no body yet: attach once the page is parsed.
  const attach = () => (container ?? document.body).append(region);
  if (container || document.body) attach();
  else document.addEventListener('DOMContentLoaded', attach, { once: true });

  let toast: HTMLElement | null = null;
  let undoButton: HTMLButtonElement | null = null;
  let shownId: number | null = null;
  /** Where focus was before it entered the toast; it goes back there when the toast leaves. */
  let returnFocus: HTMLElement | null = null;

  const remove = () => {
    if (toast && toast.contains(document.activeElement)) {
      const target = returnFocus;
      returnFocus = null;
      toast.remove();
      if (target?.isConnected) target.focus();
    } else toast?.remove();
    toast = undoButton = null;
    shownId = null;
  };

  const render = () => {
    const view = offers.current();
    if (!view) return remove();
    // A new offer id is a new toast (announced and animated afresh); the same id only updates in place.
    if (view.id !== shownId) {
      remove();
      ({ toast, undoButton } = build(view, offers, (from) => (returnFocus = from)));
      shownId = view.id;
      live.append(toast);
    }
    update(toast!, undoButton!, view);
  };

  const unbind = bindPage(offers, {
    focus: () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && !toast?.contains(active)) returnFocus = active;
      undoButton?.focus();
    },
    contains: (node) => !!node && !!toast?.contains(node),
  });
  const unsubscribe = offers.subscribe(render);
  render();

  return () => {
    unsubscribe();
    unbind();
    remove();
    region.remove();
  };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** Build one offer's elements and wire its pointer, focus and button events to the store. */
function build(view: OfferView, offers: UndoOffers, rememberFocus: (from: HTMLElement) => void) {
  const toast = el('div', 'undo-toast');
  const message = el('span', 'undo-toast-message');
  message.id = `undo-toast-message-${++nextId}`;

  const undo = el('button', 'undo-toast-undo');
  undo.type = 'button';
  undo.setAttribute('aria-describedby', message.id);
  undo.addEventListener('click', () => void offers.undo());

  const close = el('button', 'undo-toast-close');
  close.type = 'button';
  close.setAttribute('aria-label', view.advice.closeLabel);
  close.addEventListener('click', () => offers.close());
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M4 4l8 8M12 4l-8 8');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.75');
  path.setAttribute('stroke-linecap', 'round');
  svg.append(path);
  close.append(svg);

  toast.append(message, undo, close);

  toast.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && offers.hold('hover', true));
  toast.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && offers.hold('hover', false));
  toast.addEventListener('pointerdown', (e) => e.pointerType !== 'mouse' && offers.hold('touch', true));
  toast.addEventListener('pointerup', (e) => e.pointerType !== 'mouse' && offers.hold('touch', false));
  toast.addEventListener('pointercancel', () => offers.hold('touch', false));
  toast.addEventListener('focusin', (e) => {
    const from = e.relatedTarget;
    if (from instanceof HTMLElement && !toast.contains(from)) rememberFocus(from);
    offers.hold('focus', true);
  });
  toast.addEventListener('focusout', (e) => {
    if (!toast.contains(e.relatedTarget as Node | null)) offers.hold('focus', false);
  });
  return { toast, undoButton: undo };
}

/** Bring an existing toast in line with the offer's current status (showing, undoing, failed). */
function update(toast: HTMLElement, undo: HTMLButtonElement, view: OfferView): void {
  const { advice, status } = view;
  const failed = status === 'failed';
  const undoing = status === 'undoing';
  toast.dataset.status = status;
  toast.querySelector('.undo-toast-message')!.textContent = failed ? `${advice.failedText} ${view.message}` : view.message;
  undo.textContent = failed ? advice.retryLabel : advice.undoLabel;
  if (undoing) {
    undo.setAttribute('aria-disabled', 'true');
    undo.setAttribute('aria-busy', 'true');
    undo.dataset.pending = 'true';
  } else {
    undo.removeAttribute('aria-disabled');
    undo.removeAttribute('aria-busy');
    delete undo.dataset.pending;
  }
  if (advice.hotkeys.undo && !failed) {
    const hint = el('kbd', 'undo-toast-hint');
    hint.setAttribute('aria-hidden', 'true');
    hint.textContent = isApple() ? '⌘Z' : 'Ctrl+Z';
    undo.append(hint);
  }
}
