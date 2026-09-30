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

// What a workflow may read from the event, in full. Anything else a person can type into an
// issue, and none of it belongs in an expression: the title, the body, a label's name, a login.
const EXPRESSIONS = ['github.event.issue.number', 'github.token', 'github.repository'];
const CONDITION = "contains(github.event.issue.labels.*.name, 'report') && github.event.issue.state == 'open'";

function workflowFaults(y) {
  const faults = [];
  for (const m of y.matchAll(/\$\{\{\s*(.*?)\s*\}\}/g)) {
    if (!EXPRESSIONS.includes(m[1])) faults.push(`expression ${m[1]}`);
  }
  for (const m of y.matchAll(/^\s*if:\s*(.+)$/gm)) {
    if (m[1].trim() !== CONDITION) faults.push(`condition ${m[1].trim()}`);
  }
  for (const m of y.matchAll(/^\s*(?:- )?uses:\s*(\S+)(.*)$/gm)) {
    if (!/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/.test(m[1])) faults.push(`${m[1]} is not pinned to a commit`);
  }
  for (const m of y.matchAll(/^\s*run:\s*(.+)$/gm)) {
    if (/github\.|\$\{\{/.test(m[1])) faults.push(`run line reads the event: ${m[1]}`);
  }
  if (/pull_request_target|workflow_run/.test(y)) faults.push('a trigger that runs with secrets on code from a fork');
  return faults;
}

test('the workflows read only the issue number from the event, and every action is pinned to a commit', () => {
  const read = lf(file('.github', 'workflows', 'read-report.yml'));
  const validate = lf(file('.github', 'workflows', 'validate.yml'));
  assert.deepEqual(workflowFaults(read), []);
  assert.deepEqual(workflowFaults(validate), []);
  assert.match(read, /permissions:\n {2}contents: read\n {2}issues: write/);
  assert.match(validate, /permissions:\n {2}contents: read\n/);
  assert.ok(read.includes(`if: ${CONDITION}`));
  // The checkout step keeps no token behind for the scripts that run after it.
  for (const y of [read, validate]) {
    assert.equal((y.match(/uses: actions\/checkout@/g) || []).length, 1);
    assert.match(y, /uses: actions\/checkout@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}persist-credentials: false\n/);
  }
  const respond = file('scripts', 'respond.mjs');
  assert.ok(respond.includes('execFileSync'));
  assert.ok(!/\bexecSync\b|\bexec\(/.test(respond));

  // Each of these was once let through by this test.
  const planted = {
    'the sender\'s login': read.replace('ISSUE_NUMBER: ${{ github.event.issue.number }}', 'ISSUE_NUMBER: ${{ github.event.issue.user.login }}'),
    'the whole issue': read.replace('ISSUE_NUMBER: ${{ github.event.issue.number }}', 'ISSUE: ${{ toJSON(github.event.issue) }}'),
    'the title': read.replace('GH_REPO: ${{ github.repository }}', 'TITLE: ${{ github.event.issue.title }}'),
    'the title in a condition': read.replace(CONDITION, "contains(github.event.issue.title, 'x')"),
    'an action by tag': read.replace(/actions\/checkout@[0-9a-f]{40}/, 'actions/checkout@v5'),
    'the event in a run line': read.replace('run: node scripts/respond.mjs result.json comment.md', 'run: echo "${{ github.event.issue.number }}"'),
  };
  for (const [what, text] of Object.entries(planted)) {
    assert.notEqual(text, read, `${what}: the fault was not planted`);
    assert.notDeepEqual(workflowFaults(text), [], what);
  }
});

test('every issue form carries the two boxes in the words the intake requires', async () => {
  const { BOX_TEXTS } = await import('../lib/issue.js');
  for (const id of IDS) {
    const y = lf(file('.github', 'ISSUE_TEMPLATE', `${id}.yml`));
    for (const text of BOX_TEXTS) assert.ok(y.includes(`- label: ${text}\n`), `${id}.yml: ${text}`);
  }
});

test('the maintainer\'s accept script says "added" only after the rows are on disk', () => {
  const s = file('scripts', 'accept.mjs');
  const wrote = s.indexOf('writeText(csvPath(id)');
  const said = s.indexOf('console.log(`added #');
  assert.ok(wrote > 0 && said > wrote, 'the rows are written before "added" is said');
  assert.ok(!/console\.log\(`added #[^`]*`\)[\s\S]*writeText\(csvPath/.test(s), '"added" is never said before the write');
});

test('every label the forms and the workflow use is in the list the repository is set up from', async () => {
  const { LABELS } = await import('../scripts/labels.mjs');
  const names = LABELS.map((l) => l.name);
  assert.equal(new Set(names).size, names.length);
  for (const l of LABELS) {
    assert.match(l.color, /^[0-9a-f]{6}$/, l.name);
    assert.ok(l.description.length > 10 && l.description.length <= 100, l.name);
  }
  for (const id of IDS) {
    const y = lf(file('.github', 'ISSUE_TEMPLATE', `${id}.yml`));
    const used = JSON.parse(/^labels: (\[.*\])$/m.exec(y)[1]);
    for (const name of used) assert.ok(names.includes(name), `${id}.yml uses ${name}`);
    assert.ok(names.includes(`census:${id}`));
  }
  for (const name of ['report', 'reads-cleanly', 'needs-a-fix']) assert.ok(names.includes(name), name);
  const respond = file('scripts', 'respond.mjs');
  for (const name of names.filter((n) => /^(census:|reads-cleanly|needs-a-fix)/.test(n))) {
    assert.match(name, /^(census:[a-z-]+|reads-cleanly|needs-a-fix)$/);
  }
  assert.ok(respond.includes('/^(census:[a-z-]+|reads-cleanly|needs-a-fix)$/'));
});

test('the README names every census page and the repository it lives in', () => {
  const readme = file('README.md');
  for (const def of Object.values(CENSUSES)) assert.ok(readme.includes(def.page), def.id);
  assert.ok(readme.includes(`raw.githubusercontent.com/${REPO}/main/censuses/`));
});

// Every word the two commands use. A command is checked against this list, word by word, so a
// new word has to be added here by hand, where a reviewer sees it. A list of words to refuse
// was tried first and let nine identifying commands through.
const WORDS = new Set([
  // the language
  'if', 'else', 'eq', 'null', 'int', 'ordered', 'KB', 'MB', 'GB', 'First', 'Sum', 'Count', 'Compress',
  // the commands that read
  'Get-ItemProperty', 'Get-CimInstance', 'Get-Process', 'Get-Date', 'Select-Object', 'Measure-Object', 'ConvertTo-Json',
  // one registry key, which holds the last boot's firmware time and the Fast Startup switch
  'HKLM', 'SYSTEM', 'CurrentControlSet', 'Control', 'Session', 'Manager', 'Power', 'FwPOSTTime', 'HiberbootEnabled',
  // the classes read, and what is read from each
  'Win32_OperatingSystem', 'BuildNumber', 'Caption', 'LastBootUpTime', 'TotalVisibleMemorySize',
  'Win32_BaseBoard', 'Manufacturer', 'Product',
  'Win32_BIOS', 'SMBIOSBIOSVersion', 'ReleaseDate',
  'Win32_Processor', 'Name',
  'Win32_PhysicalMemory', 'Capacity', 'ConfiguredClockSpeed',
  'Win32_StartupCommand',
  'Win32_PerfFormattedData_PerfOS_Memory', 'AvailableBytes', 'CacheBytes', 'CommitLimit', 'CommittedBytes',
  'FreeAndZeroPageListBytes', 'ModifiedPageListBytes', 'PoolNonpagedBytes', 'PoolPagedBytes',
  'StandbyCacheCoreBytes', 'StandbyCacheNormalPriorityBytes', 'StandbyCacheReserveBytes',
  // what is done to a value
  'ToString', 'ToUniversalTime', 'Trim', 'TotalMinutes', 'yyyy-MM-dd',
  // variables
  'b', 'c', 'd', 'f', 'm', 'o', 'p', 's',
  // the names printed
  'census', 'v', 'os', 'windows', 'post-time', 'windows-memory',
  'fw_post_ms', 'fast_startup', 'board_vendor', 'board', 'bios_version', 'bios_date', 'cpu', 'dimms', 'ram_gb', 'ram_speed', 'os_build',
  'installed_gb', 'visible_mb', 'available_mb', 'committed_mb', 'commit_limit_mb', 'cache_mb', 'standby_mb', 'modified_mb', 'free_mb',
  'paged_pool_mb', 'nonpaged_pool_mb', 'processes', 'startup_items', 'uptime_min', 'os_caption',
]);

// Which class each variable holds, and what may be read from it. Name is the processor's name
// and nothing else's: the same word on a process or on the machine would identify.
const HOLDS = {
  p: { from: "Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power'", read: ['FwPOSTTime', 'HiberbootEnabled'] },
  o: { from: 'Get-CimInstance Win32_OperatingSystem', read: ['BuildNumber', 'Caption', 'LastBootUpTime', 'TotalVisibleMemorySize'] },
  b: { from: 'Get-CimInstance Win32_BaseBoard', read: ['Manufacturer', 'Product'] },
  f: { from: 'Get-CimInstance Win32_BIOS', read: ['SMBIOSBIOSVersion', 'ReleaseDate'] },
  c: { from: 'Get-CimInstance Win32_Processor|Select-Object -First 1', read: ['Name'] },
  d: { from: '@(Get-CimInstance Win32_PhysicalMemory)', read: ['Count'] },
  m: {
    from: 'Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory',
    read: ['AvailableBytes', 'CacheBytes', 'CommitLimit', 'CommittedBytes', 'FreeAndZeroPageListBytes', 'ModifiedPageListBytes',
      'PoolNonpagedBytes', 'PoolPagedBytes', 'StandbyCacheCoreBytes', 'StandbyCacheNormalPriorityBytes', 'StandbyCacheReserveBytes'],
  },
  s: { from: '$m.StandbyCacheNormalPriorityBytes+$m.StandbyCacheReserveBytes+$m.StandbyCacheCoreBytes', read: [] },
};
// What may be read from a value in brackets, and the only things counted.
const FROM_A_VALUE = ['Count', 'Sum', 'ConfiguredClockSpeed', 'TotalMinutes'];
const COUNTED = ['@(Get-Process).Count', '@(Get-CimInstance Win32_StartupCommand).Count', '$d.Count'];

function commandFaults(command) {
  const faults = [];
  for (const word of command.match(/[A-Za-z_][A-Za-z0-9_]*(?:-[A-Za-z]+)*/g) || []) {
    if (!WORDS.has(word)) faults.push(`the word ${word}`);
  }
  // The statements before the table that is printed, each "$x=...;".
  const head = command.slice(0, command.indexOf('[ordered]@{'));
  for (const statement of head.split(';').filter((s) => s !== '')) {
    const m = /^\$([a-z])=(.+)$/.exec(statement);
    if (!m || !HOLDS[m[1]] || HOLDS[m[1]].from !== m[2]) faults.push(`the statement ${statement}`);
  }
  for (const m of command.matchAll(/\$([a-z])\.([A-Za-z_]+)/g)) {
    if (!HOLDS[m[1]] || !HOLDS[m[1]].read.includes(m[2])) faults.push(`$${m[1]}.${m[2]}`);
  }
  for (const m of command.matchAll(/\)\.([A-Za-z_]+)(\()?/g)) {
    const method = m[2] === '(';
    if (method ? !['ToString', 'ToUniversalTime', 'Trim'].includes(m[1]) : !FROM_A_VALUE.includes(m[1])) faults.push(`).${m[1]}`);
  }
  for (const m of command.matchAll(/(@\([^()]*\)|\$[a-z])\.Count/g)) {
    if (!COUNTED.includes(m[0])) faults.push(`the count ${m[0]}`);
  }
  for (const m of command.matchAll(/Get-(?:CimInstance|Process|ItemProperty|Date)[^;|)]*/g)) {
    const known = Object.values(HOLDS).some((h) => h.from.includes(m[0])) || ['Get-Process', 'Get-Date', 'Get-CimInstance Win32_StartupCommand'].includes(m[0]);
    if (!known) faults.push(`the read ${m[0]}`);
  }
  if (/\n/.test(command)) faults.push('more than one line');
  if (/::/.test(command)) faults.push('a call into .NET');
  if (/[>&`]/.test(command)) faults.push('a redirect, a call operator or an escape');
  if (/\$env:|\$\{/.test(command)) faults.push('the environment');
  if (!command.endsWith('|ConvertTo-Json -Compress')) faults.push('it does not end by printing JSON');
  for (const m of command.matchAll(/\|\s*([A-Za-z-]+)/g)) {
    if (!['Select-Object', 'Measure-Object', 'ConvertTo-Json'].includes(m[1])) faults.push(`a pipe into ${m[1]}`);
  }
  for (const m of command.matchAll(/Get-ItemProperty\s+'([^']*)'/g)) {
    if (m[1] !== 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power') faults.push(`the registry key ${m[1]}`);
  }
  return [...new Set(faults)];
}

test('the two commands read and print; they write nothing and name no person or machine', async () => {
  const post = (await import('../censuses/post-time/definition.js')).WINDOWS_COMMAND;
  const memory = (await import('../censuses/windows-memory/definition.js')).WINDOWS_COMMAND;
  assert.deepEqual(commandFaults(post), []);
  assert.deepEqual(commandFaults(memory), []);
  assert.ok(post.includes("census='post-time'"));
  assert.ok(memory.includes("census='windows-memory'"));
  for (const word of WORDS) assert.ok(post.includes(word) || memory.includes(word), `${word} is on the list and in neither command`);

  // Commands that would name the machine or its owner, or write. Each has to be caught.
  const planted = [
    post.replace('os_build=$o.BuildNumber', 'os_build=[Environment]::MachineName'),
    post.replace('os_build=$o.BuildNumber', 'os_build=(whoami)'),
    post.replace('os_build=$o.BuildNumber', 'os_build=$env:USERNAME'),
    post.replace('os_build=$o.BuildNumber', 'os_build=$o.CSName'),
    post.replace('os_build=$o.BuildNumber', 'os_build=$o.RegisteredUser'),
    post.replace('os_build=$o.BuildNumber', 'os_build=(Get-CimInstance Win32_ComputerSystemProduct).UUID'),
    post.replace('os_build=$o.BuildNumber', 'os_build=(Get-CimInstance Win32_ComputerSystem).Name'),
    post.replace('os_build=$o.BuildNumber', 'os_build=$f.SerialNumber'),
    post.replace('os_build=$o.BuildNumber', 'os_build=$b.SerialNumber'),
    post.replace('os_build=$o.BuildNumber', 'os_build=(Get-NetAdapter).MacAddress'),
    post.replace('os_build=$o.BuildNumber', "os_build=[IO.File]::WriteAllText('C:\\x','y')"),
    post.replace('os_build=$o.BuildNumber', 'os_build=(hostname)'),
    post.replace("'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power'", "'HKLM:\\SYSTEM\\CurrentControlSet\\Control'"),
    memory.replace('processes=@(Get-Process).Count', 'processes=@(Get-Process).Name'),
    memory.replace('os_caption=$o.Caption', 'os_caption=(Get-Process|Select-Object -First 1).Path'),
    `${memory}|Out-File C:\\memory.json`,
    `${memory}>C:\\memory.json`,
    `${post};Invoke-WebRequest https://example.com`,
  ];
  for (const command of planted) {
    assert.ok(command !== post && command !== memory, 'the fault was not planted');
    assert.notDeepEqual(commandFaults(command), [], command.slice(-120));
  }
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
