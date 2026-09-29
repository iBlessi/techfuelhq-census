import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readWindows } from '../lib/readers/windows-memory.js';
import def, { bucketOf } from '../censuses/windows-memory/definition.js';
import { buildRow, makeReport } from '../lib/report.js';
import { fixture, report, TODAY } from './helpers.mjs';

const RIG = fixture('windows-memory', 'windows-32gb-in-use.json');

test('the command\'s real output from a 32 GB machine that had been up for hours', () => {
  const r = readWindows(RIG);
  assert.equal(r.machine.installed_gb, '32');
  assert.equal(r.machine.visible_mb, '32424');
  assert.equal(r.machine.available_mb, '17009');
  assert.equal(r.machine.modified_mb, '68');
  assert.equal(r.machine.cache_mb, '430');
  // In use as Task Manager draws it, total minus available: 32424 - 17009.
  assert.equal(r.machine.in_use_mb, '15415');
  // Cached is the system cache, the modified list and the standby lists: 430 + 68 + 15738.
  assert.equal(r.machine.cached_mb, '16236');
  assert.equal(r.machine.uptime_min, '527');
  assert.equal(r.suggested.state, 'in-use');
});

test('a machine read 12 minutes after boot is offered as idle', () => {
  assert.equal(readWindows(RIG.replace('"uptime_min":527', '"uptime_min":12')).suggested.state, 'fresh-boot-idle');
  assert.equal(readWindows(RIG.replace('"uptime_min":527', '"uptime_min":4')).suggested.state, 'in-use');
  assert.equal(readWindows(RIG.replace('"uptime_min":527', '"uptime_min":61')).suggested.state, 'in-use');
});

test('a virtual machine with no memory modules is refused with the reason', () => {
  assert.throws(() => readWindows(RIG.replace('"installed_gb":32', '"installed_gb":0')), /virtual machine/);
});

test('size groups', () => {
  assert.deepEqual([4, 8, 12, 16, 24, 32, 48, 64, 96].map(bucketOf), ['8', '8', '16', '16', '32', '32', '64', '64', 'over-64']);
});

test('a report made from the real output builds a valid row, and only as in-use', () => {
  const { machine } = readWindows(RIG);
  const asUse = buildRow(def, makeReport(def, { ...machine, state: 'in-use' }), { submitted_date: TODAY }, TODAY);
  assert.deepEqual(asUse.errors, []);
  assert.equal(asUse.row.in_use_mb, '15415');
  const asIdle = buildRow(def, makeReport(def, { ...machine, state: 'fresh-boot-idle' }), { submitted_date: TODAY }, TODAY);
  assert.ok(asIdle.errors.some((e) => /needs uptime_min from 5 to 60, and this row has 527/.test(e)));
});

test('planted faults in a report are each caught', () => {
  const caught = (changes, pattern) => {
    const r = buildRow(def, report('windows-memory', changes), { submitted_date: TODAY }, TODAY);
    assert.ok(r.errors.some((e) => pattern.test(e)), `${JSON.stringify(changes)} gave ${JSON.stringify(r.errors)}`);
  };
  const ok = buildRow(def, report('windows-memory'), { submitted_date: TODAY }, TODAY);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.row.in_use_mb, '8424'); // 32424 - 24000
  assert.equal(ok.row.cached_mb, '9400'); // 300 + 100 + 9000
  caught({ in_use_mb: '5000' }, /the report says 5000 and its values give 8424/);
  caught({ available_mb: '40000' }, /in_use_mb: -7576 is below 0/);
  caught({ standby_mb: '2000' }, /standby and free do not add to available/);
  caught({ visible_mb: '40000', available_mb: '31576' }, /more than the memory installed/);
  caught({ uptime_min: '90' }, /needs uptime_min from 5 to 60/);
  caught({ os_build: 'Windows 11' }, /does not match/);
  caught({ processes: '0' }, /below 1/);
  caught({ state: 'idle' }, /not one of/);
});
