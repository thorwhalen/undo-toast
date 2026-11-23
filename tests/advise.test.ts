import { describe, expect, it } from 'vitest';
import { advise, PRESETS, RULES, TIMING, resolveContext } from '../src/index.js';

const rules = (a: ReturnType<typeof advise>) => a.reasons.map((r) => r.rule);

describe('advise', () => {
  it('defaults to a toast that stays while it is the only way back, with a Close (never "Dismiss")', () => {
    const a = advise();
    expect(a.surface).toBe('toast');
    expect(a.durationMs).toBeNull();
    expect(rules(a)).toContain('only-way-back');
    expect(a.closeLabel).toBe('Close notification');
    expect(a.undoLabel).toBe('Undo');
    expect(a.onClose).toBe('forget');
    expect(a.pauseOn).toEqual(['hover', 'focus', 'touch', 'hidden']);
  });

  it('asks for a confirmation, not a toast, when nothing can take the action back', () => {
    const a = advise('pay');
    expect(a.surface).toBe('confirm');
    expect(rules(a)).toEqual(['irreversible']);
  });

  it('shows nothing when the result is its own feedback', () => {
    expect(advise('toggle').surface).toBe('none');
    // ...but not when the change is costly
    expect(advise({ resultStaysInView: true, cost: 'high' }).surface).toBe('toast');
  });

  it('keeps an often-failing action pending instead', () => {
    expect(advise({ failsOften: true }).surface).toBe('pending');
  });

  it('times the toast (10 s) only when undo is also reachable elsewhere', () => {
    expect(advise('remove-item', { hasUndoStack: true }).durationMs).toBe(TIMING.actionMs);
    expect(advise('remove-item', { hasTrash: true }).durationMs).toBe(TIMING.actionMs);
  });

  it('adds reading time to a timed toast for long messages, capped, and never times a persistent one', () => {
    const long = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    expect(advise({ message: long, hasTrash: true }).durationMs).toBe(TIMING.actionMs + 20 * TIMING.msPerExtraWord);
    const huge = Array.from({ length: 500 }, () => 'w').join(' ');
    expect(advise({ message: huge, hasTrash: true }).durationMs).toBe(TIMING.maxMs);
    expect(advise({ message: huge }).durationMs).toBeNull();
  });

  it('gives costly and bulk actions a longer window, and warns when the toast is the only way back', () => {
    const a = advise('bulk-delete', { count: 12 });
    expect(a.durationMs).toBeNull();
    expect(a.warnings.join(' ')).toMatch(/trash/);
    const b = advise('delete-work', { hasTrash: true });
    expect(b.warnings).toEqual([]);
    expect(b.durationMs).toBe(TIMING.highCostMs);
  });

  it('commits a deferred action on expiry and on close, in a finite window the user may set', () => {
    const a = advise('send', { keepNotices: true });
    expect(a.onExpire).toBe('commit');
    expect(a.onClose).toBe('commit');
    expect(a.durationMs).toBe(TIMING.highCostMs);
    expect(rules(a)).not.toContain('keep-notices');
    expect(advise({ reversal: 'deferred' }).durationMs).toBe(TIMING.deferredMs);
    expect(advise({ reversal: 'deferred' }, {}, { timing: { deferredMs: 30_000 } }).durationMs).toBe(30_000);
  });

  it('honours the user setting to keep notices until closed (WCAG 2.2.1)', () => {
    expect(advise('remove-item', { keepNotices: true, hasUndoStack: true }).durationMs).toBeNull();
  });

  it("leaves Ctrl/Cmd+Z to the app's own undo history", () => {
    expect(advise().hotkeys.undo).toBe('$mod+z');
    expect(advise({ hasUndoStack: true }).hotkeys.undo).toBeNull();
  });

  it('coalesces frequent actions', () => {
    expect(advise({ frequency: 'frequent' }).coalesce).toBe(true);
  });

  it('takes timing, rule and field overrides, and says so', () => {
    expect(advise({ hasTrash: true }, {}, { timing: { actionMs: 5000 } }).durationMs).toBe(5000);
    const a = advise({}, {}, { overrides: { undoLabel: 'Undo send' } });
    expect(a.undoLabel).toBe('Undo send');
    expect(rules(a).at(-1)).toBe('override');
    const custom = advise({}, {}, { rules: [...RULES, { id: 'mine', when: () => true, then: () => ({ durationMs: 1 }), why: 'test', source: 'test' }] });
    expect(custom.durationMs).toBe(1);
  });

  it('every reason cites a source, and every preset resolves', () => {
    for (const name of Object.keys(PRESETS)) {
      const a = advise(name as keyof typeof PRESETS);
      for (const r of a.reasons) expect(r.source).toMatch(/§\d|caller/);
    }
  });

  it('rejects unknown fields and values with the choices', () => {
    expect(() => resolveContext({ cost: 'huge' } as never)).toThrow(/"low", "high"/);
    expect(() => resolveContext({ costt: 'low' } as never)).toThrow(/unknown context field "costt"/);
    expect(() => advise('nope' as never)).toThrow(/presets are remove-item/);
  });
});

describe('bulk actions: confirm unless one Undo takes it all back', () => {
  it("asks first, with the count in the verb, when the bulk action is only recoverable by hand (reversal 'manual')", () => {
    const a = advise({ reversal: 'manual', count: 12 });
    expect(a.surface).toBe('confirm');
    expect(a.durationMs).toBeNull();
    expect(rules(a)).toEqual(['bulk-confirm']);
    expect(advise('bulk-move-to-trash', { reversal: 'manual', count: 12 }).confirmLabel).toBe('Move 12 items to Trash');
    expect(advise({ reversal: 'manual', count: 30, verb: 'Add to playlist' }).confirmLabel).toBe('Add to playlist (30)');
    expect(advise({ reversal: 'manual', count: 12 }).confirmLabel).toBeNull();
  });

  it('gives a timed toast, and says why, when one Undo takes the whole bulk action back', () => {
    const a = advise('bulk-delete', { count: 12, hasTrash: true });
    expect(a.surface).toBe('toast');
    expect(a.durationMs).toBe(TIMING.highCostMs);
    expect(rules(a)).toContain('bulk-one-step-undo');
    const b = advise('bulk-move-to-trash', { count: 12 });
    expect(b.surface).toBe('toast');
    expect(b.durationMs).toBe(TIMING.highCostMs);
  });

  it('handles one manual item: confirm when costly, acknowledge in place when cheap', () => {
    expect(advise({ reversal: 'manual', cost: 'high', verb: 'Remove' })).toMatchObject({ surface: 'confirm', confirmLabel: 'Remove' });
    expect(advise({ reversal: 'manual' }).surface).toBe('none');
  });

  it('always confirms Delete permanently and Empty Trash, typed above the threshold', () => {
    const few = advise('delete-permanently', { count: 3, verb: 'Delete {count} tracks permanently' });
    expect(few).toMatchObject({ surface: 'confirm', typeToConfirm: false, confirmLabel: 'Delete 3 tracks permanently' });
    expect(advise('empty-trash', { count: TIMING.confirmTypeAbove + 1 }).typeToConfirm).toBe(true);
    expect(advise('empty-trash', { count: 50 }, { timing: { confirmTypeAbove: 100 } }).typeToConfirm).toBe(false);
  });

  it('ships the trash and collection presets', () => {
    for (const name of ['move-to-trash', 'bulk-move-to-trash', 'add-to-collection', 'delete-permanently', 'empty-trash']) {
      expect(PRESETS).toHaveProperty(name);
    }
    expect(advise('move-to-trash').durationMs).toBe(TIMING.actionMs);
    expect(advise('add-to-collection', { count: 30 }).surface).toBe('toast');
    expect(advise('add-to-collection', { count: 30, reversal: 'manual' }).surface).toBe('confirm');
  });
});
