// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindPage, contextJsonSchema, createUndoOffers, offerFromHistory, offerFromMutationFeedback } from '../src/index.js';
import { UndoToast, useBottomDock } from '../src/react/index.js';

afterEach(cleanup);

const setHidden = (hidden: boolean) =>
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });

describe('bindPage', () => {
  it('pauses for a tab that is already hidden, and on every change', () => {
    const offers = createUndoOffers();
    setHidden(true);
    const off = bindPage(offers);
    offers.offer({ message: 'A', undo: () => {}, context: { hasTrash: true } });
    expect(offers.current()?.paused).toBe(true);
    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(offers.current()?.paused).toBe(false);
    off();
  });

  it('commits a deferred offer on pagehide', () => {
    const offers = createUndoOffers();
    const commit = vi.fn();
    const off = bindPage(offers);
    offers.offer({ message: 'Sent', undo: () => {}, commit, context: 'send' });
    window.dispatchEvent(new Event('pagehide'));
    expect(commit).toHaveBeenCalledTimes(1);
    off();
  });

  it('leaves Ctrl/Cmd+Z alone when another handler took it, or on key repeat', () => {
    const offers = createUndoOffers();
    const undo = vi.fn();
    const off = bindPage(offers);
    offers.offer({ message: 'A', undo });
    const taken = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, metaKey: true, cancelable: true });
    taken.preventDefault();
    window.dispatchEvent(taken);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, repeat: true }));
    expect(undo).not.toHaveBeenCalled();
    off();
  });
});

describe('focus', () => {
  it('goes back where it was when the toast leaves', () => {
    const offers = createUndoOffers();
    render(
      <>
        <button>before</button>
        <UndoToast offers={offers} />
      </>,
    );
    act(() => void offers.offer({ message: 'Removed', undo: () => {} }));
    screen.getByText('before').focus();
    fireEvent.keyDown(window, { key: 'F8' });
    expect(document.activeElement?.className).toBe('undo-toast-undo');
    act(() => void fireEvent.keyDown(window, { key: 'Escape' }));
    expect(document.activeElement).toBe(screen.getByText('before'));
  });
});

describe('useBottomDock', () => {
  it('writes the bar height to --undo-toast-dock and removes it when the bar goes', () => {
    function Bar() {
      const ref = useRef<HTMLDivElement>(null);
      useBottomDock(ref);
      return <div ref={ref}>player</div>;
    }
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 120 } as DOMRect);
    const { unmount } = render(<Bar />);
    expect(document.documentElement.style.getPropertyValue('--undo-toast-dock')).toBe('120px');
    unmount();
    expect(document.documentElement.style.getPropertyValue('--undo-toast-dock')).toBe('');
    spy.mockRestore();
  });
});

describe('adapters', () => {
  it('turns zodal scheduled feedback into a deferred offer that zodal times, and a too-late undo into a failure', async () => {
    expect(offerFromMutationFeedback({ kind: 'committed' }, { message: 'x' })).toBeNull();
    const input = offerFromMutationFeedback({ kind: 'scheduled', seconds: 5, undo: () => false }, { message: 'Row deleted' })!;
    expect(input.advice?.durationMs).toBe(5000);
    expect(input.advice?.pauseOn).toEqual([]);
    const offers = createUndoOffers({ onError: () => {} });
    offers.offer(input);
    expect(await offers.undo()).toBe(false);
  });

  it('turns an acture-style history into a timed offer that leaves Ctrl/Cmd+Z to the app', async () => {
    const history = { undo: vi.fn(() => ({ ok: true })) };
    const input = offerFromHistory(history, { message: 'Removed', context: 'remove-item' });
    expect(input.advice?.durationMs).toBe(10_000);
    expect(input.advice?.hotkeys.undo).toBeNull();
    const offers = createUndoOffers();
    offers.offer(input);
    expect(await offers.undo()).toBe(true);
    expect(history.undo).toHaveBeenCalledTimes(1);
  });

  it('exports the context as a JSON Schema', () => {
    const schema = contextJsonSchema() as { properties: Record<string, { enum?: unknown[]; type: string }> };
    expect(schema.properties.reversal?.enum).toEqual(['deferred', 'compensating', 'manual', 'none']);
    expect(schema.properties.hasTrash?.type).toBe('boolean');
  });
});
