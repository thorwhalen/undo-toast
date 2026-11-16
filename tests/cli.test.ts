/** The one-command test: the built CLI advises on a preset and on raw fields. Run `npm run build` first. */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const cli = new URL('../dist/cli/main.js', import.meta.url).pathname;
const run = (...args: string[]) => JSON.parse(execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' }));

describe.skipIf(!existsSync(cli))('undo-toast CLI', () => {
  it('advises on a preset, with reasons', () => {
    const a = run('advise', 'remove-item', '--message', '“Intro” removed');
    expect(a.surface).toBe('toast');
    expect(a.durationMs).toBeNull();
    expect(a.reasons[0].rule).toBe('only-way-back');
  });
  it('advises from flags derived from the field table', () => {
    const a = run('advise', '--reversal', 'deferred', '--cost', 'high', '--has-undo-stack');
    expect(a.onClose).toBe('commit');
    expect(a.hotkeys.undo).toBeNull();
  });
  it('lists the vocabulary', () => {
    expect(Object.keys(run('fields'))).toContain('reversal');
    expect(Object.keys(run('presets'))).toContain('send');
    expect(run('rules').map((r: { id: string }) => r.id)).toContain('irreversible');
  });
});
