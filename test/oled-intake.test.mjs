import { test } from 'node:test';
import assert from 'node:assert/strict';
import oled, { monthsBetween } from '../censuses/oled-burn-in/definition.js';
import { buildRow, issueUrl, linkFits, formUrl, makeReport, LINK_LIMIT } from '../lib/report.js';
import { reportFromIssue, section, confirmations } from '../lib/issue.js';
import { readIssue, commentFor } from '../lib/intake.js';
import { summarize } from '../lib/stats.js';
import { CENSUSES, REPO } from '../lib/censuses.js';
import { report, TODAY } from './helpers.mjs';

test('OLED: planted faults in a report are each caught', () => {
  const caught = (changes, pattern) => {
    const r = buildRow(oled, report('oled-burn-in', changes), { submitted_date: TODAY }, TODAY);
    assert.ok(r.errors.some((e) => pattern.test(e)), `${JSON.stringify(changes)} gave ${JSON.stringify(r.errors)}`);
  };
  assert.deepEqual(buildRow(oled, report('oled-burn-in'), { submitted_date: TODAY }, TODAY).errors, []);
  caught({ severity: '5' }, /above 4/);
  caught({ severity: '2' }, /severity 0 goes with location none/);
  caught({ location: 'taskbar' }, /severity 0 goes with location none/);
  caught({ panel_hours: '9000' }, /panel_hours needs hours_source/);
  caught({ hours_source: 'osd' }, /hours_source is set and panel_hours is empty/);
  caught({ purchase_month: '2021-9' }, /not a month/);
  caught({ panel_type: 'oled' }, /not one of/);
  caught({ warranty_claim: undefined }, /warranty_claim: required/);
});

test('OLED: a monitor cannot have been in use for longer than it has been owned', () => {
  const made = (changes) => buildRow(oled, report('oled-burn-in', changes), { submitted_date: TODAY }, TODAY);
  // Bought last month and in use for ten years was once accepted.
  assert.ok(made({ purchase_month: '2026-08', months_in_use: '120' }).errors.some((e) => /longer than the monitor has been owned/.test(e)));
  assert.ok(made({ purchase_month: '2024-09', months_in_use: '26' }).errors.some((e) => /longer than the monitor has been owned/.test(e)));
  // 2024-09 to 2026-09 is 24 months, and a month of slack is allowed because both ends are whole months.
  assert.deepEqual(made({ purchase_month: '2024-09', months_in_use: '25' }).errors, []);
  assert.deepEqual(made({ purchase_month: '2024-09', months_in_use: '3' }).errors, []);
  assert.equal(monthsBetween('2021-09', '2026-09'), 60);
  assert.equal(monthsBetween('2026-08', '2026-09'), 1);
  assert.equal(monthsBetween('2026-8', '2026-09'), null);
});

test('OLED: five counted monitors publish a severity count, and menu hours only with five of them', () => {
  const row = (severity, hours) => buildRow(oled, report('oled-burn-in', {
    severity: String(severity),
    location: severity === 0 ? 'none' : 'taskbar',
    months_in_use: '20',
    ...(hours ? { panel_hours: String(hours), hours_source: 'osd' } : {}),
  }), { submitted_date: TODAY }, TODAY).row;
  const rows = [row(0, 4000), row(0, 5000), row(1, 6000), row(2, 7000), row(3)];
  const s = summarize(oled, rows);
  assert.equal(s.groups[0].state, 'published');
  assert.deepEqual(s.groups[0].figures, {
    n: 5, severity_0: 2, severity_1: 1, severity_2: 1, severity_3: 1, severity_4: 0,
    months_in_use_median: '20.0', rows_with_menu_hours: 4, claims_approved: 0, claims_denied: 0,
  });
  const s2 = summarize(oled, [...rows, row(0, 9000)]);
  assert.equal(s2.groups[0].figures.menu_hours_median, '6000');
});

test('OLED: a monitor in use for under a month is kept and not counted', () => {
  const fresh = buildRow(oled, report('oled-burn-in', { months_in_use: '0' }), { submitted_date: TODAY }, TODAY).row;
  const s = summarize(oled, [fresh]);
  assert.equal(s.reports, 1);
  assert.equal(s.counted, 0);
});

const BODY = (json, ticks = ['X', 'X']) => [
  '### Report',
  '',
  '```json',
  json,
  '```',
  '',
  '### Notes',
  '',
  '_No response_',
  '',
  '### Before you send',
  '',
  `- [${ticks[0]}] This is my own hardware, and I took this reading myself.`,
  `- [${ticks[1]}] I release this report under CC BY 4.0.`,
].join('\n');

test('issue text: the report is found under its heading, fenced or bare', () => {
  const rep = report('post-time');
  assert.deepEqual(reportFromIssue(BODY(JSON.stringify(rep))), rep);
  assert.deepEqual(reportFromIssue(`### Report\n\n${JSON.stringify(rep)}\n\n### Notes\n\nhello`), rep);
  assert.equal(section(BODY('{}'), 'Notes'), '');
  assert.equal(section(BODY('{}'), 'Nothing'), null);
  assert.deepEqual(confirmations(BODY('{}', ['X', ' '])), { total: 2, ticked: 1 });
  assert.throws(() => reportFromIssue('### Report\n\n_No response_\n'), /Report box is empty/);
  assert.throws(() => reportFromIssue('### Report\n\n```json\n{"census": "post-time"\n```\n'), /cut off|complete JSON/);
});

test('intake: a good issue makes a row stamped with its number and its date', () => {
  const issue = { number: 12, created_at: '2026-09-29T18:04:11Z', body: BODY(JSON.stringify(report('post-time'))) };
  const r = readIssue(issue, TODAY);
  assert.equal(r.ok, true);
  assert.equal(r.census, 'post-time');
  assert.equal(r.row.source_issue, '12');
  assert.equal(r.row.submitted_date, '2026-09-29');
  const comment = commentFor(r);
  assert.match(comment, /reads cleanly/);
  assert.match(comment, /^os,platform,cpu,/m);
  assert.match(comment, /^windows,am5,AMD Ryzen 7 7800X3D 8-Core Processor,/m);
});

test('intake: what goes wrong is said in the comment, one line each', () => {
  const bad = report('post-time', { fw_post_ms: '12', platform: 'am6' });
  const r = readIssue({ number: 13, created_at: '2026-09-29T18:04:11Z', body: BODY(JSON.stringify(bad), ['X', ' ']) }, TODAY);
  assert.equal(r.ok, false);
  const comment = commentFor(r);
  assert.match(comment, /cannot be read yet/);
  assert.match(comment, /^- both boxes under "Before you send" have to be ticked$/m);
  assert.match(comment, /^- platform: "am6" is not one of/m);
  assert.match(comment, /^- fw_post_ms: 12 is below 500$/m);

  const unknown = readIssue({ number: 14, created_at: '2026-09-29T18:04:11Z', body: BODY('{"census":"fan-noise","v":1,"fields":{}}') }, TODAY);
  assert.match(unknown.errors[0], /names the census "fan-noise"/);
  const empty = readIssue({ number: 15, created_at: '2026-09-29T18:04:11Z', body: '' }, TODAY);
  assert.equal(empty.ok, false);
});

test('intake: both boxes have to be there and ticked, so deleting them is no way round them', () => {
  const good = JSON.stringify(report('post-time'));
  const at = { number: 20, created_at: '2026-09-29T18:04:11Z' };
  assert.equal(readIssue({ ...at, body: BODY(good) }, TODAY).ok, true);
  const noBoxes = BODY(good).split('### Before you send')[0];
  const r = readIssue({ ...at, body: noBoxes }, TODAY);
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, ['both boxes under "Before you send" have to be ticked']);
  assert.equal(readIssue({ ...at, body: BODY(good, ['x', ' ']) }, TODAY).ok, false);
  assert.equal(readIssue({ ...at, body: BODY(good).replace(/^- \[X\] I release.*$/m, '') }, TODAY).ok, false);
  // The words of the boxes are the forms' words; two ticked boxes saying something else are not consent.
  assert.equal(readIssue({ ...at, body: BODY(good).replace('I release this report under CC BY 4.0.', 'I release nothing.') }, TODAY).ok, false);
  assert.equal(readIssue({ ...at, body: BODY(good).replace('- [X] This is my own hardware', '- [X] This is my own hardware!') }, TODAY).ok, false);
  assert.deepEqual(confirmations(BODY(good)), { total: 2, ticked: 2 });
  assert.deepEqual(confirmations(BODY(good, ['x', 'X'])), { total: 2, ticked: 2 });
});

// What GitHub would draw from a comment, were it read as markdown outside a code block.
const outsideFences = (comment) => comment.split('\n').reduce((acc, line) => {
  if (/^```/.test(line)) return { ...acc, inside: !acc.inside };
  return acc.inside ? acc : { ...acc, lines: [...acc.lines, line] };
}, { inside: false, lines: [] });

test('intake: nothing a report says is read as markdown in the answer', () => {
  const at = { number: 21, created_at: '2026-09-29T18:04:11Z' };
  const payload = 'x\n\n## Report accepted\n\n@octocat confirm your account [here](https://evil.example/login) ![i](https://evil.example/p.png)\n```\n# out';
  const cases = [
    { census: payload, v: 1, fields: {} },
    { census: 'post-time', v: payload, fields: report('post-time').fields },
    { census: 'post-time', v: 1, fields: { ...report('post-time').fields, [payload]: '1' } },
    { census: 'post-time', v: 1, fields: { ...report('post-time').fields, platform: payload } },
    { census: 'post-time', v: 1, fields: { ...report('post-time').fields, fw_post_ms: payload } },
    { census: 'post-time', v: 1, fields: { ...report('post-time').fields, bios_date: payload } },
  ];
  for (const rep of cases) {
    const r = readIssue({ ...at, body: BODY(JSON.stringify(rep)) }, TODAY);
    assert.equal(r.ok, false);
    const comment = commentFor(r);
    const drawn = outsideFences(comment);
    assert.equal(drawn.inside, false, 'every code block is closed');
    assert.ok(!/octocat|evil\.example|Report accepted|# out/.test(drawn.lines.join('\n')), `markdown escaped its block:\n${comment}`);
    // Inside the block each message is one line.
    for (const line of comment.split('\n')) assert.ok(line.length <= 310, `a line of ${line.length} characters`);
  }
});

test('intake: a report with hundreds of unknown names gets one short answer', () => {
  const fields = { ...report('post-time').fields };
  for (let k = 0; k < 900; k += 1) fields[`made_up_name_number_${k}_${'x'.repeat(60)}`] = 'v';
  const r = readIssue({ number: 22, created_at: '2026-09-29T18:04:11Z', body: BODY(JSON.stringify({ census: 'post-time', v: 1, fields })) }, TODAY);
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /^900 names are not fields of the post-time census, among them /);
  // GitHub refuses a comment over 65,536 characters.
  assert.ok(commentFor(r).length < 2000);
  const many = { ok: false, census: 'post-time', errors: Array.from({ length: 500 }, (_, k) => `message ${k} ${'y'.repeat(400)}`) };
  const long = commentFor(many);
  assert.ok(long.length < 12000, `${long.length} characters`);
  assert.match(long, /^- and 470 more$/m);
});

test('intake: a census named after something every object has is no census, and nothing breaks', () => {
  for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
    const body = BODY(`{"census":"${name}","v":1,"fields":{}}`);
    const r = readIssue({ number: 23, created_at: '2026-09-29T18:04:11Z', body }, TODAY);
    assert.equal(r.ok, false, name);
    assert.equal(r.census, null, name);
    assert.match(r.errors[0], /names the census/, name);
    assert.equal(typeof commentFor(r), 'string');
  }
  for (const census of [null, 7, ['post-time'], { id: 'post-time' }]) {
    const r = readIssue({ number: 24, created_at: '2026-09-29T18:04:11Z', body: BODY(JSON.stringify({ census, v: 1, fields: {} })) }, TODAY);
    assert.equal(r.ok, false);
  }
  assert.equal(Object.prototype.polluted, undefined);
});

test('intake: text in an issue is data and nothing else', () => {
  const hostile = report('post-time', { board: '$(rm -rf /) `id` <script>alert(1)</script>', cpu: 'x"; DROP TABLE rows; --' });
  const r = readIssue({ number: 16, created_at: '2026-09-29T18:04:11Z', body: BODY(JSON.stringify(hostile)) }, TODAY);
  assert.equal(r.ok, true);
  assert.equal(r.row.board, '$(rm -rf /) `id` <script>alert(1)</script>');
  const comment = commentFor(r);
  assert.ok(comment.includes('"x""; DROP TABLE rows; --"'), 'the quote is doubled inside a quoted CSV field');
  const fence = report('post-time', { board: 'a ``` b' });
  const fenced = readIssue({ number: 17, created_at: '2026-09-29T18:04:11Z', body: BODY(JSON.stringify(fence)) }, TODAY);
  assert.equal(fenced.ok, true);
});

test('reports: only what a person or a machine supplies goes in, and the link carries it', () => {
  const def = CENSUSES['post-time'];
  const rep = makeReport(def, { ...report('post-time').fields, submitted_date: '2020-01-01', source_issue: '9', notes: '  two   spaces  ', bios_date: '' });
  assert.equal(rep.fields.submitted_date, undefined);
  assert.equal(rep.fields.source_issue, undefined);
  assert.equal(rep.fields.bios_date, undefined);
  assert.equal(rep.fields.notes, 'two spaces');
  const url = new URL(issueUrl(def, rep, '[post-time] ROG STRIX B650-A GAMING WIFI, 64.0 s'));
  assert.equal(url.origin + url.pathname, `https://github.com/${REPO}/issues/new`);
  assert.equal(url.searchParams.get('template'), 'post-time.yml');
  assert.deepEqual(JSON.parse(url.searchParams.get('report')), rep);
  assert.equal(linkFits(url.toString()), true);
  assert.equal(formUrl(def), `https://github.com/${REPO}/issues/new?template=post-time.yml`);
});

test('reports: a link too long to survive GitHub\'s sign-in page is known to be too long', () => {
  // The longest report each census can make: every text field at its full length, in characters
  // that are written as three bytes each and encoded twice on the way through the sign-in page.
  for (const def of Object.values(CENSUSES)) {
    const fields = { ...report(def.id).fields };
    for (const f of def.fields) {
      if (f.type === 'string' && f.maxLength && !f.pattern && f.from !== 'intake') fields[f.name] = 'ヨ'.repeat(f.maxLength);
    }
    const url = issueUrl(def, { census: def.id, v: 1, fields }, def.title(fields));
    const viaSignIn = `https://github.com/login?return_to=${encodeURIComponent(url)}`;
    assert.equal(linkFits(url), viaSignIn.length <= LINK_LIMIT, def.id);
    assert.equal(linkFits(url), false, `${def.id}: ${viaSignIn.length} characters through the sign-in page`);
  }
  assert.ok(LINK_LIMIT <= 6000, 'GitHub answered 500 at 6,961 characters on 2026-09-29');
  // An ordinary report is far inside the limit.
  for (const def of Object.values(CENSUSES)) {
    const rep = makeReport(def, report(def.id).fields);
    assert.equal(linkFits(issueUrl(def, rep, def.title(rep.fields))), true, def.id);
  }
});

test('group labels read as sentences a page can print', () => {
  const post = CENSUSES['post-time'].publish;
  assert.equal(post.label('am5/unknown'), 'AMD AM5, memory shortcut not checked');
  assert.equal(post.label('am5/auto'), 'AMD AM5, memory shortcut on auto');
  assert.equal(post.label('other/off'), 'Other platforms, memory shortcut off');
  const drive = CENSUSES['drive-arrival'].publish;
  const rows = [{ seller: 'Server Part Deals' }, { seller: 'ServerPartDeals' }, { seller: 'ServerPartDeals' }];
  assert.equal(drive.label('serverpartdeals/manufacturer-recertified', rows), 'ServerPartDeals, sold as manufacturer recertified');
  assert.equal(drive.label('serverpartdeals/used'), 'serverpartdeals, sold as used');
  assert.equal(CENSUSES['windows-memory'].publish.label('32'), 'Over 16 and up to 32 GB installed');
  assert.equal(CENSUSES['pin-current'].publish.label('boxed-adapter'), "The adapter that came in the card's box");
  assert.equal(CENSUSES['oled-burn-in'].publish.label('qd-oled'), 'QD-OLED');
});
