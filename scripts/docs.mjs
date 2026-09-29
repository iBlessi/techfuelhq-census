// Writes censuses/<id>/README.md from the definition, so the field table a person reads is the
// one the validator enforces. With --check it writes nothing and fails if a file is out of date.
import { join } from 'node:path';
import { CENSUSES, IDS, REPO } from '../lib/censuses.js';
import { ROOT, writeText, sameOnDisk } from './common.mjs';

export const SOURCE = {
  human: 'you',
  machine: 'the reading',
  derived: 'worked out from the row',
  intake: 'the maintainer',
};

export function allowed(f) {
  if (f.type === 'enum') return f.values.map((v) => `\`${v}\``).join(', ');
  if (f.type === 'integer' || f.type === 'number') {
    const parts = [];
    if (f.min !== undefined && f.max !== undefined) parts.push(`${f.min} to ${f.max}`);
    else if (f.min !== undefined) parts.push(`${f.min} or more`);
    if (f.type === 'integer') parts.push('whole number');
    else if (f.decimals !== undefined) parts.push(`up to ${f.decimals} decimal place${f.decimals === 1 ? '' : 's'}`);
    return parts.join(', ');
  }
  if (f.type === 'date') return 'YYYY-MM-DD';
  if (f.type === 'month') return 'YYYY-MM';
  const parts = [];
  if (f.maxLength !== undefined) parts.push(`up to ${f.maxLength} characters`);
  if (f.pattern) parts.push(`matches \`${f.pattern}\``);
  return parts.join(', ') || 'text';
}

const cell = (s) => String(s).replace(/\|/g, '\\|');

export function readmeOf(def) {
  const lines = [];
  lines.push(`# ${def.name}`);
  lines.push('');
  lines.push(def.about);
  lines.push('');
  lines.push(`One row is ${def.unit}. ${def.counted}`);
  lines.push('');
  lines.push(`- The page, with what has published and the tool that builds a report: ${def.page}`);
  lines.push(`- The data: [\`data/submissions.csv\`](data/submissions.csv)`);
  lines.push(`- The counts and published figures: [\`summary.json\`](summary.json)`);
  lines.push(`- The row as a JSON Schema: [\`schema.json\`](schema.json)`);
  lines.push(`- To report: https://github.com/${REPO}/issues/new?template=${def.id}.yml`);
  lines.push('');
  lines.push(`Dataset version ${def.version}. Data licensed CC BY 4.0.`);
  lines.push('');
  lines.push('## Fields');
  lines.push('');
  lines.push('In the CSV every value is text, and an empty cell means the field was left out.');
  lines.push('');
  lines.push('| Field | Required | Comes from | Allowed | What it records |');
  lines.push('|---|---|---|---|---|');
  for (const f of def.fields) {
    const what = [f.label, f.help].filter(Boolean).join('. ').replace(/\.\.$/, '.');
    lines.push(`| \`${f.name}\` | ${f.required ? 'yes' : 'no'} | ${SOURCE[f.from]} | ${cell(allowed(f))} | ${cell(what || '')} |`);
  }
  const anchored = def.fields.filter((f) => f.labels);
  if (anchored.length) {
    lines.push('');
    lines.push('## What each value means');
    for (const f of anchored) {
      lines.push('');
      lines.push(`### \`${f.name}\``);
      lines.push('');
      lines.push('| Value | Meaning |');
      lines.push('|---|---|');
      for (const [value, meaning] of Object.entries(f.labels)) lines.push(`| \`${value}\` | ${cell(meaning)} |`);
    }
  }
  return lines.join('\n');
}

const readmePath = (id) => join(ROOT, 'censuses', id, 'README.md');

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/docs.mjs');
if (isMain) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const id of IDS) {
    const text = readmeOf(CENSUSES[id]);
    if (check) {
      if (sameOnDisk(readmePath(id), text)) console.log(`PASS ${id}: README.md matches the definition`);
      else {
        stale += 1;
        console.error(`FAIL ${id}: README.md does not match the definition; run "node scripts/docs.mjs"`);
      }
    } else {
      writeText(readmePath(id), text);
      console.log(`wrote ${id}`);
    }
  }
  process.exit(stale ? 1 : 0);
}
