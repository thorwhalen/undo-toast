// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUndoOffers } from '../src/index.js';
import { mountUndoToast } from '../src/dom/index.js';

let unmount: (() => void) | undefined;
afterEach(() => {
  unmount?.();
  unmount = undefined;
});
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('mountUndoToast', () => {
  it('keeps its polite live region mounted before any message, and unmount removes it', () => {
    unmount = mountUndoToast({ offers: createUndoOffers() });
    const status = q('[role=status]')!;
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('');
    unmount();
    expect(q('.undo-toast-region')).toBeNull();
    unmount = undefined;
  });

  it('shows the message, Undo and a Close button, and never takes focus', () => {
    const offers = createUndoOffers();
    unmount = mountUndoToast({ offers });
    offers.offer({ message: '“Intro” removed', undo: () => {} });
    const message = q('.undo-toast-message')!;
    expect(message.textContent).toBe('“Intro” removed');
    expect(q('.undo-toast-undo')!.textContent).toContain('Undo');
    expect(q('.undo-toast-undo')!.getAttribute('aria-describedby')).toBe(message.id);
    expect(q('.undo-toast-close')!.getAttribute('aria-label')).toBe('Close notification');
    expect(document.activeElement).toBe(document.body);
  });

  it('sets the message as text, never as HTML', () => {
    const offers = createUndoOffers();
    unmount = mountUndoToast({ offers });
    offers.offer({ message: '<img src=x onerror=alert(1)> removed', undo: () => {} });
    expect(q('.undo-toast img')).toBeNull();
    expect(q('.undo-toast-message')!.textContent).toBe('<img src=x onerror=alert(1)> removed');
  });

  it('undoes on the Undo button and removes the toast; Close closes', async () => {
    const offers = createUndoOffers();
    const undo = vi.fn();
    unmount = mountUndoToast({ offers });
    offers.offer({ message: 'Removed', undo });
    q<HTMLButtonElement>('.undo-toast-undo')!.click();
    await flush();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(q('.undo-toast')).toBeNull();
    offers.offer({ message: 'Again', undo });
    q<HTMLButtonElement>('.undo-toast-close')!.click();
    expect(q('.undo-toast')).toBeNull();
  });

  it('replaces the toast for a new offer, and shows a failed undo with Try again', async () => {
    const offers = createUndoOffers();
    unmount = mountUndoToast({ offers });
    offers.offer({ message: 'First', undo: () => {} });
    const first = q('.undo-toast')!;
    offers.offer({ message: 'Second', undo: () => { throw new Error('no'); } });
    expect(q('.undo-toast')).not.toBe(first);
    expect(q('.undo-toast-message')!.textContent).toBe('Second');
    q<HTMLButtonElement>('.undo-toast-undo')!.click();
    await flush();
    expect(q('.undo-toast')!.getAttribute('data-status')).toBe('failed');
    expect(q('.undo-toast-undo')!.textContent).toContain('Try again');
  });

  it('F8 moves focus to Undo, and focus returns when the toast closes', () => {
    const offers = createUndoOffers();
    const field = document.createElement('button');
    document.body.append(field);
    unmount = mountUndoToast({ offers });
    offers.offer({ message: 'Removed', undo: () => {} });
    field.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8', bubbles: true }));
    expect(document.activeElement).toBe(q('.undo-toast-undo'));
    q<HTMLButtonElement>('.undo-toast-close')!.click();
    expect(document.activeElement).toBe(field);
    field.remove();
  });
});

describe('mountUndoToast from a <script> in <head>', () => {
  it('waits for the body instead of throwing', () => {
    const body = document.body;
    document.documentElement.removeChild(body); // as while <head> is parsed
    const unmount = mountUndoToast({ offers: createUndoOffers() });
    document.documentElement.appendChild(body);
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(document.querySelector('.undo-toast-region')).not.toBeNull();
    unmount();
  });
});
