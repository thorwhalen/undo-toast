// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUndoOffers } from '../src/index.js';
import { matchesHotkey, UndoToast } from '../src/react/index.js';

afterEach(cleanup);

describe('UndoToast', () => {
  it('keeps its polite live region mounted before any message', () => {
    render(<UndoToast offers={createUndoOffers()} />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('');
  });

  it('shows the message, Undo and a Close (×) button, and never takes focus', () => {
    const offers = createUndoOffers();
    render(<UndoToast offers={offers} />);
    act(() => void offers.offer({ message: '“Intro” removed', undo: () => {} }));
    expect(screen.getByText('“Intro” removed')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Undo/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close notification' })).toBeTruthy();
    expect(screen.queryByText('Dismiss')).toBeNull();
    expect(screen.getByRole('button', { name: /Undo/ }).getAttribute('aria-describedby')).toBe(screen.getByText('“Intro” removed').id);
    expect(document.activeElement).toBe(document.body);
  });

  it('undoes on the Undo button, and Enter elsewhere does nothing to it', async () => {
    const offers = createUndoOffers();
    const undo = vi.fn();
    render(<UndoToast offers={offers} />);
    act(() => void offers.offer({ message: 'Removed', undo }));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(undo).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Undo/ })));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(offers.current()).toBeNull();
  });

  it('F8 moves focus to Undo; Escape inside closes; Ctrl+Z undoes outside text fields', async () => {
    const offers = createUndoOffers();
    const undo = vi.fn();
    render(
      <>
        <input aria-label="field" />
        <UndoToast offers={offers} />
      </>,
    );
    act(() => void offers.offer({ message: 'Removed', undo }));
    fireEvent.keyDown(window, { key: 'F8' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Undo/ }));
    expect(offers.current()?.paused).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(offers.current()).toBeNull();

    act(() => void offers.offer({ message: 'Removed', undo }));
    screen.getByLabelText('field').focus();
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(undo).not.toHaveBeenCalled(); // the text field's own undo wins
    screen.getByLabelText('field').blur();
    await act(async () => void fireEvent.keyDown(window, { key: 'z', ctrlKey: true }));
    expect(undo).toHaveBeenCalledTimes(1);
  });
});

describe('matchesHotkey', () => {
  const ev = (key: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey', boolean>> = {}) => ({
    key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods,
  });
  it('maps mod to Cmd on Apple and Ctrl elsewhere, and requires exact modifiers', () => {
    expect(matchesHotkey(ev('z', { metaKey: true }), 'mod+z', true)).toBe(true);
    expect(matchesHotkey(ev('z', { ctrlKey: true }), 'mod+z', false)).toBe(true);
    expect(matchesHotkey(ev('z', { ctrlKey: true, shiftKey: true }), 'mod+z', false)).toBe(false);
    expect(matchesHotkey(ev('z', { metaKey: true }), '$mod+z', true)).toBe(true);
    expect(matchesHotkey(ev('F8'), 'F8')).toBe(true);
    expect(matchesHotkey(ev('z'), null)).toBe(false);
  });
});
