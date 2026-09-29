import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CENSUSES, IDS, REPO } from '../lib/censuses.js';
import { parseTable } from '../lib/csv.js';
import { summarize } from '../lib/stats.js';
import { schemaOf } from '../scripts/schemas.mjs';
import { readmeOf } from '../scripts/docs.mjs';
import { ROOT, file } from './helpers.mjs';

const lf = (s) => s.replace(/\r\n/g, '\n');

test('there are five censuses and each has every file it needs', () => {
  assert.deepEqual(IDS, ['pin-current', 'oled-burn-in', 'post-time', 'drive-arrival', 'windows-memory']);
  for (const id of IDS) {
    for (const name of ['definition.js', 'schema.json', 'summary.json', 'README.md', 'data/submissions.csv']) {
      assert.ok(existsSync(join(ROOT, 'censuses', id, name)), `${id}/${name}`);
    }
    assert.ok(existsSync(join(ROOT, '.github', 'ISSUE_TEMPLATE', `${id}.yml`)), `${id}.yml`);
  }
});

test('each definition is complete and its field names are unique', () => {
  for (const def of Object.values(CENSUSES)) {
    const names = def.fields.map((f) => f.name);
    assert.equal(new Set(names).size, names.length, `${def.id} repeats a field`);
    assert.deepEqual(names.slice(-2), ['submitted_date', 'source_issue'], `${def.id} ends with the intake fields`);
    assert.equal(names[names.length - 3], 'notes', `${def.id} has notes before the intake fields`);
    for (const f of def.fields) {
      assert.ok(['human', 'machine', 'derived', 'intake'].includes(f.from), `${def.id}.${f.name} has no source`);
      if (f.from !== 'intake') assert.ok(f.label, `${def.id}.${f.name} has no label`);
      if (f.type === 'enum') {
        assert.ok(f.values.length >= 2, `${def.id}.${f.name}`);
        assert.deepEqual(Object.keys(f.labels), f.values, `${def.id}.${f.name} labels match its values`);
      }
    }
    assert.match(def.page, /^https:\/\/techfuelhq\.com\/data\/[a-z-]+-census\/$/);
    assert.equal(def.publish.floor, 5);
    assert.equal(typeof def.title({}), 'string');
    assert.ok(def.about.length > 40 && def.counted.length > 40);
  }
});

test('each CSV has exactly the header its definition gives', () => {
  for (const id of IDS) {
    const { header } = parseTable(file('censuses', id, 'data', 'submissions.csv'));
    assert.deepEqual(header, CENSUSES[id].fields.map((f) => f.name), id);
  }
});

test('schema.json, summary.json and README.md are what the definitions and the data give', () => {
  for (const id of IDS) {
    const def = CENSUSES[id];
    assert.equal(lf(file('censuses', id, 'schema.json')).trim(), JSON.stringify(schemaOf(def), null, 2), `${id} schema.json`);
    const { records } = parseTable(file('censuses', id, 'data', 'submissions.csv'));
    assert.equal(lf(file('censuses', id, 'summary.json')).trim(), JSON.stringify(summarize(def, records), null, 2), `${id} summary.json`);
    assert.equal(lf(file('censuses', id, 'README.md')).trim(), readmeOf(def), `${id} README.md`);
  }
});

test('each issue form carries the report box, the census label and both confirmations', () => {
  for (const id of IDS) {
    const y = lf(file('.github', 'ISSUE_TEMPLATE', `${id}.yml`));
    assert.match(y, /^ {4}id: report$/m, id);
    assert.match(y, /^ {6}label: Report$/m, id);
    assert.match(y, /^ {6}render: json$/m, id);
    assert.ok(y.includes(`labels: ["report", "census:${id}"]`), id);
    assert.ok(y.includes(CENSUSES[id].page), `${id} links its page`);
    assert.equal((y.match(/^ {10}required: true$/gm) || []).length, 2, `${id} has two required boxes`);
  }
  const config = file('.github', 'ISSUE_TEMPLATE', 'config.yml');
  assert.match(config, /blank_issues_enabled: false/);
});

test('the workflow that reads issues never places issue text in a command', () => {
  const y = file('.github', 'workflows', 'read-report.yml');
  assert.ok(!/\$\{\{\s*github\.event\.issue\.(body|title)/.test(y));
  assert.ok(!/\$\{\{\s*github\.event\.comment/.test(y));
  assert.match(y, /permissions:\n {2}contents: read\n {2}issues: write/);
  assert.match(y, /contains\(github\.event\.issue\.labels\.\*\.name, 'report'\)/);
  const respond = file('scripts', 'respond.mjs');
  assert.ok(respond.includes('execFileSync'));
  assert.ok(!/\bexecSync\b|\bexec\(/.test(respond));
});

test('the README names every census page and the repository it lives in', () => {
  const readme = file('README.md');
  for (const def of Object.values(CENSUSES)) assert.ok(readme.includes(def.page), def.id);
  assert.ok(readme.includes(`raw.githubusercontent.com/${REPO}/main/censuses/`));
});

test('the two commands read and print; they write nothing and name no person or machine', async () => {
  const post = (await import('../censuses/post-time/definition.js')).WINDOWS_COMMAND;
  const memory = (await import('../censuses/windows-memory/definition.js')).WINDOWS_COMMAND;
  for (const command of [post, memory]) {
    assert.ok(!/\n/.test(command), 'one line');
    assert.ok(!/Set-|New-|Remove-|Out-File|Invoke-|Start-|Add-Content|iex|>\s*\S/i.test(command), 'nothing that writes or runs');
    assert.ok(!/SerialNumber|UserName|COMPUTERNAME|CSName|Win32_ComputerSystem\b|MACAddress|IPAddress/i.test(command), 'nothing that identifies');
    assert.ok(command.endsWith('|ConvertTo-Json -Compress'));
  }
  assert.ok(post.includes("census='post-time'"));
  assert.ok(memory.includes("census='windows-memory'"));
});

test('no fixture carries a drive serial number or a world wide name', () => {
  const dir = join(ROOT, 'test', 'fixtures', 'drive-arrival');
  for (const name of readdirSync(dir)) {
    const text = file('test', 'fixtures', 'drive-arrival', name);
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*(?:Serial [Nn]umber|LU WWN Device Id|World Wide Name):\s*(.+)$/.exec(line);
      if (m) assert.ok(/^\[(removed|REDACTED)\]$/.test(m[1].trim()), `${name}: ${line.trim()}`);
      const j = /"serial_number":\s*"([^"]*)"/.exec(line);
      if (j) assert.equal(j[1], '[removed]', name);
    }
  }
});

test('every figure a census can publish has a label for the page', async () => {
  const { GOOD } = await import('./helpers.mjs');
  const { buildRow } = await import('../lib/report.js');
  for (const def of Object.values(CENSUSES)) {
    const made = buildRow(def, { census: def.id, v: 1, fields: GOOD[def.id] }, { submitted_date: '2026-09-29' }, '2026-09-29');
    assert.deepEqual(made.errors, [], def.id);
    // Six copies of a good row: enough for every conditional figure to appear.
    const figures = def.publish.figures(Array.from({ length: 6 }, () => ({ ...made.row, panel_hours: '5000', hours_source: 'osd' })));
    for (const key of Object.keys(figures)) assert.ok(def.publish.figureLabels[key], `${def.id}: no label for ${key}`);
    for (const key of Object.keys(def.publish.figureLabels)) assert.ok(key in figures, `${def.id}: label for ${key}, which is never published`);
  }
});
