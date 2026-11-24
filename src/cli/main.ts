#!/usr/bin/env node
/**
 * The agent's command line: ask for advice on an action, and list the vocabulary (fields, presets,
 * rules). Every command prints JSON. The flags are derived from `CONTEXT_FIELDS`, so a new field
 * is a new flag with no edit here.
 *
 *   npx undo-toast advise remove-item
 *   npx undo-toast advise --reversal deferred --cost high --message "Message sent"
 *   npx undo-toast fields | presets | rules
 */

import { parseArgs } from 'node:util';
import { advise, RULES } from '../advise.js';
import { CONTEXT_FIELDS, PRESETS, contextJsonSchema, type ActionContext } from '../spec.js';

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const fields = Object.entries(CONTEXT_FIELDS) as Array<[string, { values: unknown; describe: string }]>;
const isBool = (values: unknown) => Array.isArray(values) && values.every((v) => typeof v === 'boolean');

const HELP = `undo-toast: decide how to offer undo for an action.

  undo-toast advise [preset] [flags]   the advice, with the reason for each part (JSON)
  undo-toast fields                    what you can say about an action
  undo-toast schema                    the same, as a JSON Schema (for an MCP tool or a form)
  undo-toast presets                   named actions (remove-item, send, pay, ...)
  undo-toast rules                     the rules advise applies, in order

advise flags:
${fields.map(([k, f]) => `  --${kebab(k)}${isBool(f.values) ? '' : ' <value>'}`).join('\n')}
`;

function main(argv: string[]): number {
  const [command, ...rest] = argv;
  const out = (value: unknown) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(HELP);
    return 0;
  }
  if (command === 'fields') return out(CONTEXT_FIELDS), 0;
  if (command === 'schema') return out(contextJsonSchema()), 0;
  if (command === 'presets') return out(PRESETS), 0;
  if (command === 'rules') return out(RULES.map(({ id, why, source, final }) => ({ id, why, source, final: !!final }))), 0;
  if (command !== 'advise') {
    process.stderr.write(`undo-toast: unknown command "${command}".\n\n${HELP}`);
    return 2;
  }
  const options = Object.fromEntries(fields.map(([k, f]) => [kebab(k), { type: isBool(f.values) ? 'boolean' : 'string' } as const]));
  // A boolean field is set by its flag (`--has-trash`), and unset with `--no-<field>` or
  // `--<field>=false` (`takesAway` defaults to true, so false must be expressible).
  const booleans = new Map(fields.filter(([, f]) => isBool(f.values)).map(([k]) => [kebab(k), k]));
  const explicit: Record<string, boolean> = {};
  const args = rest.filter((arg) => {
    const neg = /^--no-(.+)$/.exec(arg);
    if (neg && booleans.has(neg[1]!)) return (explicit[booleans.get(neg[1]!)!] = false), false;
    const eq = /^--([^=]+)=(true|false)$/.exec(arg);
    if (eq && booleans.has(eq[1]!)) return (explicit[booleans.get(eq[1]!)!] = eq[2] === 'true'), false;
    return true;
  });
  const { values, positionals } = parseArgs({ args, options, allowPositionals: true, strict: true });
  const context: Record<string, unknown> = { ...explicit };
  for (const [k, f] of fields) {
    const v = (values as Record<string, unknown>)[kebab(k)];
    if (v === undefined) continue;
    context[k] = f.values === 'number' ? Number(v) : v;
  }
  const preset = positionals[0];
  out(preset ? advise(preset as keyof typeof PRESETS, context as ActionContext) : advise(context as ActionContext));
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
