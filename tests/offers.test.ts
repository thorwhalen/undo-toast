import { describe, expect, it, vi } from 'vitest';
import { advise, createUndoOffers } from '../src/index.js';

/** A fake clock: `tick(ms)` advances it and fires due timers. */
function fakeTimers() {
  let now = 0;
  let seq = 0;
  const due = new Map<number, { at: number; fn: () => void }>();
  return {
    timers: {
      setTimeout: (fn: () => void, ms: number) => (due.set(++seq, { at: now + ms, fn }), seq),
      clearTimeout: (h: unknown) => void due.delete(h as number),
      now: () => now,
    },
    tick(ms: number) {
      now += ms;
      for (const [id, t] of [...due].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at <= now && due.has(id)) {
          due.delete(id);
          t.fn();
        }
      }
    },
  };
}

describe('createUndoOffers', () => {
  it('keeps a toast that is the only way back until closed or replaced', () => {
    const clock = fakeTimers();
    const offers = createUndoOffers({ timers: clock.timers });
    offers.offer({ message: 'Removed', undo: () => {}, context: 'remove-item' });
    clock.tick(3_600_000);
    expect(offers.current()?.message).toBe('Removed');
    offers.offer({ message: 'Archived', undo: () => {}, context: 'archive' });
    expect(offers.current()?.message).toBe('Archived');
  });

  it('shows a timed offer for its duration, then forgets it', () => {
    const clock = fakeTimers();
    const offers = createUndoOffers({ timers: clock.timers });
    offers.offer({ message: 'Removed', undo: () => {}, context: { hasUndoStack: true } });
    expect(offers.current()?.message).toBe('Removed');
    clock.tick(9_999);
    expect(offers.current()).not.toBeNull();
    clock.tick(1);
    expect(offers.current()).toBeNull();
  });

  it('pauses while held and resumes with at least resumeMinMs left', () => {
    const clock = fakeTimers();
    const offers = createUndoOffers({ timers: clock.timers });
    offers.offer({ message: 'Removed', undo: () => {}, context: { hasTrash: true } });
    clock.tick(9_000);
    offers.hold('hover', true);
    expect(offers.current()?.paused).toBe(true);
    clock.tick(60_000);
    expect(offers.current()).not.toBeNull();
    offers.hold('focus', true);
    offers.hold('hover', false);
    clock.tick(60_000);
    expect(offers.current()).not.toBeNull(); // still focused
    offers.hold('focus', false);
    clock.tick(3_999);
    expect(offers.current()).not.toBeNull();
    clock.tick(1);
    expect(offers.current()).toBeNull();
  });

  it('runs undo once, guards repeat presses, and does not show a second toast', async () => {
    const undo = vi.fn(async () => {});
    const offers = createUndoOffers();
    offers.offer({ message: 'Removed', undo });
    const first = offers.undo();
    expect(offers.current()?.status).toBe('undoing');
    expect(await offers.undo()).toBe(false);
    expect(await first).toBe(true);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(offers.current()).toBeNull();
  });

  it('keeps a failed undo on screen, without a timer, for a retry', async () => {
    const clock = fakeTimers();
    const onError = vi.fn();
    const offers = createUndoOffers({ timers: clock.timers, onError });
    let fail = true;
    offers.offer({ message: 'Removed', undo: () => { if (fail) throw new Error('offline'); } });
    expect(await offers.undo()).toBe(false);
    expect(offers.current()?.status).toBe('failed');
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'undo');
    clock.tick(60_000);
    expect(offers.current()?.status).toBe('failed');
    fail = false;
    expect(await offers.undo()).toBe(true);
    expect(offers.current()).toBeNull();
  });

  it('commits a deferred action on expiry, on close, when replaced and on flush, never after undo', async () => {
    const clock = fakeTimers();
    const offers = createUndoOffers({ timers: clock.timers });
    const commit = vi.fn();

    offers.offer({ message: 'Sent', undo: () => {}, commit, context: 'send' });
    clock.tick(14_999);
    expect(commit).not.toHaveBeenCalled();
    clock.tick(1);
    expect(commit).toHaveBeenCalledTimes(1);

    offers.offer({ message: 'Sent', undo: () => {}, commit, context: 'send' });
    offers.close();
    expect(commit).toHaveBeenCalledTimes(2);

    offers.offer({ message: 'Sent', undo: () => {}, commit, context: 'send' });
    offers.offer({ message: 'Removed', undo: () => {} });
    expect(commit).toHaveBeenCalledTimes(3);

    offers.offer({ message: 'Sent', undo: () => {}, commit, context: 'send' });
    offers.flush();
    expect(commit).toHaveBeenCalledTimes(4);

    offers.offer({ message: 'Sent', undo: () => {}, commit, context: 'send' });
    await offers.undo();
    clock.tick(60_000);
    expect(commit).toHaveBeenCalledTimes(4);
  });

  it('closing a compensating offer just hides it', () => {
    const undo = vi.fn();
    const offers = createUndoOffers();
    offers.offer({ message: 'Removed', undo });
    offers.close();
    expect(offers.current()).toBeNull();
    expect(undo).not.toHaveBeenCalled();
  });

  it('coalesces a burst under one key, and one undo takes it all back, newest first', async () => {
    const clock = fakeTimers();
    const offers = createUndoOffers({ timers: clock.timers });
    const order: number[] = [];
    const advice = advise({ frequency: 'frequent', hasUndoStack: true });
    for (const n of [1, 2, 3]) {
      offers.offer({ message: (c) => `${c} removed`, undo: () => void order.push(n), advice, key: 'remove' });
      clock.tick(5_000);
    }
    expect(offers.current()?.message).toBe('3 removed');
    expect(offers.current()?.count).toBe(3);
    await offers.undo();
    expect(order).toEqual([3, 2, 1]);
  });

  it('does nothing when no toast is advised, and refuses an irreversible action', () => {
    const offers = createUndoOffers();
    expect(offers.offer({ message: 'Starred', undo: () => {}, context: 'toggle' })).toBeNull();
    expect(offers.current()).toBeNull();
    expect(() => offers.offer({ message: 'Paid', undo: () => {}, context: 'pay' })).toThrow(/calls for 'confirm'/);
  });

  it('notifies subscribers and keeps the snapshot stable between changes', () => {
    const offers = createUndoOffers();
    const listener = vi.fn();
    const off = offers.subscribe(listener);
    offers.offer({ message: 'Removed', undo: () => {} });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(offers.current()).toBe(offers.current());
    off();
    offers.close();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('createUndoOffers, after review', () => {
  it('never commits a deferred action once Undo was pressed, even if the undo failed', async () => {
    const commit = vi.fn();
    const offers = createUndoOffers({ onError: () => {} });
    offers.offer({ message: 'Sent', undo: () => { throw new Error('x'); }, commit, context: 'send' });
    await offers.undo();
    offers.close();
    offers.flush();
    offers.offer({ message: 'Sent', undo: () => false, commit, context: 'send' });
    await offers.undo();
    offers.offer({ message: 'Other', undo: () => {} });
    expect(commit).not.toHaveBeenCalled();
  });

  it('treats false and { ok: false } as a failed undo', async () => {
    const offers = createUndoOffers({ onError: () => {} });
    offers.offer({ message: 'A', undo: () => false });
    expect(await offers.undo()).toBe(false);
    expect(offers.current()?.status).toBe('failed');
    offers.offer({ message: 'B', undo: () => ({ ok: false }) });
    expect(await offers.undo()).toBe(false);
    offers.offer({ message: 'C', undo: () => ({ ok: true }) });
    expect(await offers.undo()).toBe(true);
  });

  it('carries holds over to a replacing offer (the pointer is still on the toast)', () => {
    const clock = fakeTimers();
    const offers = createUndoOffers({ timers: clock.timers });
    offers.hold('hidden', true);
    offers.offer({ message: 'A', undo: () => {}, context: { hasTrash: true } });
    expect(offers.current()?.paused).toBe(true);
    offers.hold('hidden', false);
    offers.hold('hover', true);
    offers.offer({ message: 'B', undo: () => {}, context: { hasTrash: true } });
    clock.tick(60_000);
    expect(offers.current()?.message).toBe('B');
    offers.hold('hover', false);
    clock.tick(10_000);
    expect(offers.current()).toBeNull();
  });

  it('queues an offer that arrives during an undo, so the undo failure stays visible', async () => {
    let fail!: (e: Error) => void;
    const offers = createUndoOffers({ onError: () => {} });
    offers.offer({ message: 'A', undo: () => new Promise((_, reject) => { fail = reject; }) });
    const pending = offers.undo();
    offers.offer({ message: 'B', undo: () => {} });
    expect(offers.current()?.message).toBe('A');
    fail(new Error('offline'));
    expect(await pending).toBe(false);
    expect(offers.current()?.status).toBe('failed');
    offers.close();
    expect(offers.current()?.message).toBe('B');
  });

  it('a retry after a partial failure does not undo the same entry twice', async () => {
    const offers = createUndoOffers({ onError: () => {} });
    const calls: number[] = [];
    let failOne = true;
    const advice = advise({ frequency: 'frequent', hasUndoStack: true });
    offers.offer({ message: (n) => `${n}`, undo: () => { if (failOne) { failOne = false; throw new Error('x'); } calls.push(1); }, advice, key: 'k' });
    offers.offer({ message: (n) => `${n}`, undo: () => void calls.push(2), advice, key: 'k' });
    expect(await offers.undo()).toBe(false);
    expect(await offers.undo()).toBe(true);
    expect(calls).toEqual([2, 1]);
  });

  it('re-advises a merged burst with its count', () => {
    const offers = createUndoOffers();
    const context = { frequency: 'frequent', hasTrash: true } as const;
    offers.offer({ message: 'x', undo: () => {}, context, key: 'k' });
    expect(offers.current()?.advice.durationMs).toBe(10_000);
    offers.offer({ message: 'x', undo: () => {}, context, key: 'k' });
    expect(offers.current()?.advice.durationMs).toBe(15_000);
  });
});
