import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFormat, parseLog, readLog, fromSingleReading, summarize } from '../lib/readers/pin-current.js';
import def, { bandOf, derive } from '../censuses/pin-current/definition.js';
import { buildRow } from '../lib/report.js';
import { fixture, report, TODAY } from './helpers.mjs';

const BURN = fixture('pin-current', 'astral-hwmon-burn-2hz.csv');
const FLIGHT = fixture('pin-current', '12vhpwr-guard-flight-made-up.csv');
const total = (s) => s.pins.reduce((a, b) => a + b, 0);

test('astral-hwmon burn capture: the reader reproduces the figures its author published', () => {
  // docs/measurements/2026-08-14/README.md in ksokolowski/astral-hwmon: 322 samples, 235 of them
  // at 35 A total or more, peak 48.26 A total, 8.56 A on the busiest pin, minimum 11.944 V.
  const { samples, skipped, format } = parseLog(BURN);
  assert.equal(format, 'astral-hwmon');
  assert.equal(samples.length, 322);
  assert.equal(skipped, 0);
  assert.equal(samples.filter((s) => total(s) >= 35).length, 235);
  const { machine } = summarize(samples);
  assert.equal(machine.peak_total_a, '48.26');
  assert.equal(machine.peak_pin_a, '8.56');
  assert.equal(machine.min_v, '11.944');
});

test('astral-hwmon burn capture: the row, against arithmetic done separately in Python', () => {
  const r = readLog(BURN);
  assert.equal(r.all, 322);
  assert.match(r.basis, /238 samples at 25 A/);
  assert.deepEqual(r.machine, {
    capture: 'log', samples: '238', duration_s: '161', total_a: '47.07',
    peak_pin_a: '8.56', peak_total_a: '48.26', min_v: '11.944',
    pin1_a: '7.46', pin2_a: '7.64', pin3_a: '8.08', pin4_a: '7.73', pin5_a: '8.35', pin6_a: '7.81',
  });
  const d = derive(r.machine);
  assert.equal(d.imbalance, '1.064');
  assert.equal(d.max_share_pct, '17.7');
  assert.equal(d.band, 'high');
});

test('CRLF line endings read the same as LF', () => {
  const crlf = BURN.replace(/\r?\n/g, '\r\n');
  assert.deepEqual(readLog(crlf).machine, readLog(BURN).machine);
});

test('a row marked read_error is left out and counted as skipped', () => {
  const lines = BURN.split('\n');
  lines[5] = lines[5].replace(/,$/, ',i2c timeout');
  const { samples, skipped } = parseLog(lines.join('\n'));
  assert.equal(samples.length, 321);
  assert.equal(skipped, 1);
});

test('12VHPWR Guard flight file, in the layout its writer produces', () => {
  assert.equal(detectFormat(FLIGHT), '12vhpwr-guard');
  const r = readLog(FLIGHT);
  assert.equal(r.all, 120);
  assert.equal(r.machine.samples, '34'); // the samples at 25 A and above
  assert.equal(r.machine.duration_s, '60'); // 119 half-second steps is 59.5 s
  assert.equal(r.machine.peak_total_a, '25.20');
  assert.equal(r.machine.peak_pin_a, '4.56');
  assert.equal(r.machine.min_v, '');
  const want = [4.041, 4.1415, 4.1665, 3.966, 4.543, 4.242];
  want.forEach((w, k) => assert.ok(Math.abs(Number(r.machine[`pin${k + 1}_a`]) - w) <= 0.0051, `pin ${k + 1}`));
  const sum = [1, 2, 3, 4, 5, 6].reduce((a, p) => a + Number(r.machine[`pin${p}_a`]), 0);
  assert.equal(r.machine.total_a, sum.toFixed(2));
});

test('a log with little load is summarised over every sample and lands in the idle band', () => {
  const idle = ['time,pin1,pin2,pin3,pin4,pin5,pin6'];
  for (let k = 0; k < 30; k += 1) idle.push(`2026-09-20 10:00:${String(k).padStart(2, '0')}.000,0.400,0.420,0.440,0.400,0.460,0.440`);
  const r = readLog(idle.join('\n'));
  assert.equal(r.machine.samples, '30');
  assert.match(r.basis, /every sample/);
  assert.equal(derive(r.machine).band, 'idle');
});

test('band edges', () => {
  assert.equal(bandOf(5.99), 'idle');
  assert.equal(bandOf(6), 'moderate');
  assert.equal(bandOf(24.99), 'moderate');
  assert.equal(bandOf(25), 'high');
});

test('a single reading: six numbers, a decimal comma accepted, anything else refused', () => {
  const r = fromSingleReading(['4,1', '4.2', '4.3', '4.0', '4.6', '4.2']);
  assert.equal(r.machine.capture, 'single-reading');
  assert.equal(r.machine.total_a, '25.40');
  assert.equal(r.machine.peak_pin_a, '4.60');
  assert.equal(derive(r.machine).imbalance, '1.087'); // 4.6 / (25.4 / 6)
  assert.throws(() => fromSingleReading([1, 2, 3, 4, 5]), /six numbers/);
  assert.throws(() => fromSingleReading([1, 2, 3, 4, 5, 31]), /0 to 30/);
  assert.throws(() => fromSingleReading([1, 2, 3, 4, 5, 'x']), /0 to 30/);
});

test('text that is not a log says what is read and what to do instead', () => {
  assert.equal(detectFormat('Date,Time,CPU [C]\n'), null);
  assert.throws(() => parseLog('hello'), /astral-hwmon session files and 12VHPWR Guard flight files/);
  assert.throws(() => parseLog('time,pin1,pin2,pin3,pin4,pin5,pin6\n'), /no rows/);
});

test('planted faults in a report are each caught', () => {
  const ok = buildRow(def, report('pin-current'), { submitted_date: TODAY }, TODAY);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.row.imbalance, '1.064');
  assert.equal(ok.row.band, 'high');

  const caught = (changes, pattern) => {
    const r = buildRow(def, report('pin-current', changes), { submitted_date: TODAY }, TODAY);
    assert.ok(r.errors.some((e) => pattern.test(e)), `${JSON.stringify(changes)} gave ${JSON.stringify(r.errors)}`);
    assert.equal(r.row, null);
  };
  caught({ total_a: '40.00' }, /six pins add to 47\.07/);
  caught({ pin5_a: '31' }, /above 30/);
  caught({ peak_pin_a: '8.00' }, /peak_pin_a is below/);
  caught({ peak_total_a: '40.00' }, /peak_total_a is below/);
  caught({ cable_type: 'mystery' }, /not one of/);
  caught({ gpu: '5090' }, /does not match/);
  caught({ capture: 'single-reading' }, /single reading has samples 1/);
  caught({ months_in_use: undefined }, /months_in_use: required/);
  caught({ imbalance: '1.000' }, /the report says 1\.000 and its values give 1\.064/);
  caught({ band: 'idle' }, /the report says idle/);
  caught({ submitted_date: '2026-01-01' }, /set by the maintainer/);
  caught({ favourite_colour: 'blue' }, /not a field/);
});
