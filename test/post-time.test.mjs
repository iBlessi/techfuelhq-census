import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readWindows, readSystemdAnalyze, spanToMs, suggestPlatform } from '../lib/readers/post-time.js';
import def, { WINDOWS_COMMAND } from '../censuses/post-time/definition.js';
import { buildRow, makeReport } from '../lib/report.js';
import { fixture, report, TODAY } from './helpers.mjs';

const RIG = fixture('post-time', 'windows-7800x3d-b650.json');

test('the command\'s real output from a Ryzen 7 7800X3D on a B650 board', () => {
  const r = readWindows(RIG);
  assert.deepEqual(r.machine, {
    os: 'windows',
    cpu: 'AMD Ryzen 7 7800X3D 8-Core Processor',
    board_vendor: 'ASUSTeK COMPUTER INC.',
    board: 'ROG STRIX B650-A GAMING WIFI',
    bios_version: '3881',
    // The firmware gives 06/17/2026. Read in local time west of Greenwich it printed as the 16th.
    bios_date: '2026-06-17',
    dimms: '1',
    ram_gb: '32',
    ram_speed: '6000',
    fast_startup: 'off',
    fw_post_ms: '63981',
    os_build: '26200',
  });
  assert.equal(r.suggested.platform, 'am5');
});

test('the output with a prompt line above it, wrapped by the terminal, still reads', () => {
  const wrapped = `PS C:\\Users\\me> $p=Get-ItemProperty ...\r\n${RIG.trim().replace('"board":"ROG STRIX', '"board":"ROG\r\n STRIX')}\r\nPS C:\\Users\\me>`;
  assert.equal(readWindows(wrapped).machine.fw_post_ms, '63981');
});

test('the whole console block, with the command echoed above its output, still reads', () => {
  // The command holds braces of its own, and the first of them does not open the output.
  const block = `PS C:\\Users\\me> ${WINDOWS_COMMAND}\r\n${RIG.trim()}\r\nPS C:\\Users\\me> `;
  assert.ok(block.indexOf('{') < block.indexOf('{"census"'));
  assert.equal(readWindows(block).machine.fw_post_ms, '63981');
  assert.equal(readWindows(block).machine.bios_date, '2026-06-17');
});

test('a machine where Windows holds no Fast Startup value is recorded as not reported', () => {
  assert.equal(readWindows(RIG.replace('"fast_startup":0', '"fast_startup":-1')).machine.fast_startup, 'unknown');
  assert.equal(readWindows(RIG.replace('"fast_startup":0', '"fast_startup":1')).machine.fast_startup, 'on');
  assert.equal(readWindows(RIG.replace('"bios_date":"2026-06-17"', '"bios_date":""')).machine.bios_date, '');
});

test('output for another census, a cut-off line and a machine with no firmware time say so', () => {
  assert.throws(() => readWindows('{"census":"windows-memory","v":1}'), /for the windows-memory census/);
  assert.throws(() => readWindows(RIG.slice(0, 120)), /cut off/);
  assert.throws(() => readWindows('no braces here'), /cannot find the output/);
  assert.throws(() => readWindows(RIG.replace('"fw_post_ms":63981', '"fw_post_ms":0')), /did not record a firmware time/);
  assert.throws(() => readWindows(RIG.replace('"v":1', '"v":2')), /This page reads format 1/);
  // What the output said is never repeated back where it could be read as something else.
  assert.throws(() => readWindows('{"census":"<img src=x onerror=alert(1)>","v":1}'), (e) => !/img|onerror/.test(e.message));
});

test('systemd time spans, in the units systemd writes', () => {
  assert.equal(spanToMs('8.601s'), 8601);
  assert.equal(spanToMs('534ms'), 534);
  assert.equal(spanToMs('1min 9.608s'), 69608);
  assert.equal(spanToMs('1h 2min 3s'), 3723000);
  assert.throws(() => spanToMs('soon'), /cannot read the firmware time/);
});

test('a time span with a part the reader does not know is refused whole, never read short', () => {
  // "1d 900ms" once read as 900 ms, and "17,412s" as 412 s.
  for (const span of ['1d 900ms', '17,412s', '2w 3s', '12.004 s', '1min2s', '5s extra', '']) {
    assert.throws(() => spanToMs(span), /cannot read the firmware time/, span);
  }
  assert.throws(() => readSystemdAnalyze('Startup finished in 1d 900ms (firmware) + 2s (loader) = 3s'), /cannot read the firmware time/);
});

test('systemd-analyze: a line with a firmware time, in the layout its source builds', () => {
  // src/analyze/analyze-time-data.c: "Startup finished in " then "<span> (firmware) + <span> (loader) + ..."
  const line = 'Startup finished in 17.412s (firmware) + 3.204s (loader) + 1.937s (kernel) + 5.566s (userspace) = 28.121s \ngraphical.target reached after 5.540s in userspace.';
  assert.deepEqual(readSystemdAnalyze(line).machine, { os: 'linux', fast_startup: 'not-applicable', fw_post_ms: '17412' });
  assert.equal(readSystemdAnalyze('Startup finished in 1min 2.500s (firmware) + 900ms (loader) + 2s (kernel) + 4s (userspace) = 1min 9.400s').machine.fw_post_ms, '62500');
});

test('systemd-analyze: the two examples in its manual have no firmware time, and the reader says why', () => {
  assert.throws(() => readSystemdAnalyze('Startup finished in 2.584s (kernel) + 19.176s (initrd) + 47.847s (userspace) = 1min 9.608s'), /no firmware time/);
  assert.throws(() => readSystemdAnalyze('Startup finished in 296ms (userspace)'), /no firmware time/);
  assert.throws(() => readSystemdAnalyze('command not found'), /cannot find the line/);
});

test('platform guess from the processor name', () => {
  const cases = {
    'AMD Ryzen 7 7800X3D 8-Core Processor': 'am5',
    'AMD Ryzen 7 9800X3D 8-Core Processor': 'am5',
    'AMD Ryzen 5 7600 6-Core Processor': 'am5',
    'AMD Ryzen 5 8600G w/ Radeon 760M Graphics': 'am5',
    'AMD Ryzen 7 5800X3D 8-Core Processor': 'am4',
    'AMD Ryzen 5 3600 6-Core Processor': 'am4',
    'AMD Ryzen 7 7840HS w/ Radeon 780M Graphics': 'other',
    'AMD Ryzen 9 7945HX3D 16-Core Processor': 'other',
    'AMD Ryzen 7 PRO 7840U w/ Radeon 780M Graphics': 'other',
    'Intel(R) Core(TM) Ultra 9 285K': 'lga1851',
    'Intel(R) Core(TM) Ultra 7 265KF': 'lga1851',
    'Intel(R) Core(TM) Ultra 7 155H': 'other',
    'Intel(R) Core(TM) Ultra 7 258V': 'other',
    '13th Gen Intel(R) Core(TM) i7-13700K': 'lga1700',
    '12th Gen Intel(R) Core(TM) i5-12400F': 'lga1700',
    'Intel(R) Core(TM) i9-14900K': 'lga1700',
    '13th Gen Intel(R) Core(TM) i7-13700H': 'other',
    'Intel(R) Core(TM) i7-9700K CPU @ 3.60GHz': 'other',
    'AMD Ryzen Threadripper 7970X 32-Cores': 'other',
  };
  for (const [name, want] of Object.entries(cases)) assert.equal(suggestPlatform(name), want, name);
});

test('a report made from the real output builds a valid row', () => {
  const { machine } = readWindows(RIG);
  const rep = makeReport(def, { ...machine, platform: 'am5', memory_fast_boot: 'unknown', boot_kind: 'cold-boot' });
  const built = buildRow(def, rep, { submitted_date: TODAY, source_issue: 1 }, TODAY);
  assert.deepEqual(built.errors, []);
  assert.equal(built.row.fw_post_ms, '63981');
  assert.equal(built.row.source_issue, '1');
  assert.deepEqual(Object.keys(built.row), def.fields.map((f) => f.name));
});

test('planted faults in a report are each caught', () => {
  const caught = (changes, pattern) => {
    const r = buildRow(def, report('post-time', changes), { submitted_date: TODAY }, TODAY);
    assert.ok(r.errors.some((e) => pattern.test(e)), `${JSON.stringify(changes)} gave ${JSON.stringify(r.errors)}`);
  };
  assert.deepEqual(buildRow(def, report('post-time'), { submitted_date: TODAY }, TODAY).errors, []);
  caught({ fw_post_ms: '120' }, /below 500/);
  caught({ fw_post_ms: '63.9' }, /whole number/);
  caught({ fw_post_ms: '9000000' }, /above 900000/);
  caught({ os: 'linux' }, /not-applicable on Linux/);
  caught({ fast_startup: 'not-applicable' }, /on Windows is on, off or unknown/);
  caught({ platform: 'am6' }, /not one of/);
  caught({ bios_date: '2027-01-01' }, /future/);
  caught({ memory_fast_boot: undefined }, /memory_fast_boot: required/);
  caught({ board: 'x'.repeat(81) }, /longer than 80/);
});
