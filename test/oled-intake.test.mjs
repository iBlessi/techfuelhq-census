import { test } from 'node:test';
import assert from 'node:assert/strict';
import oled from '../censuses/oled-burn-in/definition.js';
import { buildRow, issueUrl, makeReport } from '../lib/report.js';
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
  assert.match(comment, /- a box under "Before you send" is not ticked/);
  assert.match(comment, /- platform: "am6" is not one of/);
  assert.match(comment, /- fw_post_ms: 12 is below 500/);

  const unknown = readIssue({ number: 14, created_at: '2026-09-29T18:04:11Z', body: BODY('{"census":"fan-noise","v":1,"fields":{}}') }, TODAY);
  assert.match(unknown.errors[0], /names the census "fan-noise"/);
  const empty = readIssue({ number: 15, created_at: '2026-09-29T18:04:11Z', body: '' }, TODAY);
  assert.equal(empty.ok, false);
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
  assert.ok(url.toString().length < 4000, `link is ${url.toString().length} characters`);
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
