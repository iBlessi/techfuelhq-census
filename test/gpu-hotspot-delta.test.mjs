import { test } from 'node:test';
import assert from 'node:assert/strict';
import hotspot, { modelKey, versionAtLeast, versionParts } from '../censuses/gpu-hotspot-delta/definition.js';
import { buildRow } from '../lib/report.js';
import { summarize } from '../lib/stats.js';
import { validateTable } from '../lib/validate.js';
import { report, TODAY } from './helpers.mjs';

function made(changes = {}, issue = 1) {
  return buildRow(hotspot, report('gpu-hotspot-delta', changes), {
    submitted_date: TODAY,
    source_issue: String(issue),
  }, TODAY);
}

function row(changes = {}, issue = 1) {
  const result = made(changes, issue);
  assert.deepEqual(result.errors, [], JSON.stringify(changes));
  return result.row;
}

test('GPU hotspot: a valid report derives its delta and Blackwell tool flag', () => {
  const result = made();
  assert.deepEqual(result.errors, []);
  assert.equal(result.row.delta_c, '16');
  assert.equal(result.row.blackwell_tool_unverified, 'no');

  const other = row({ tool: 'hwinfo64', tool_version: '8.30' });
  assert.equal(other.blackwell_tool_unverified, 'yes');
  const notBlackwell = row({ gpu_family: 'rtx-40', tool: 'hwinfo64', tool_version: '8.30' });
  assert.equal(notBlackwell.blackwell_tool_unverified, 'no');
});

test('GPU hotspot: temperature, load and derived-value faults are rejected', () => {
  const caught = (changes, pattern) => {
    const errors = made(changes).errors;
    assert.ok(errors.some((error) => pattern.test(error)), `${JSON.stringify(changes)} gave ${JSON.stringify(errors)}`);
  };
  caught({ core_temp_c: '19' }, /below 20/);
  caught({ core_temp_c: '101' }, /above 100/);
  caught({ hotspot_temp_c: '126' }, /above 125/);
  caught({ hotspot_temp_c: '255' }, /above 125/);
  caught({ core_temp_c: '80', hotspot_temp_c: '79' }, /delta_c: -1 is below 0/);
  caught({ load_minutes: '9' }, /below 10/);
  caught({ delta_c: '12' }, /report says.*values give 16/);
  caught({ blackwell_tool_unverified: 'yes' }, /report says.*values give no/);
  assert.equal(row({ core_temp_c: '70', hotspot_temp_c: '70' }).delta_c, '0');
});

test('GPU hotspot: RTX 50 version floors are enforced and unverified tools stay visibly flagged', () => {
  const errors = (changes) => made(changes).errors.join('; ');
  assert.match(errors({ tool: 'hwmonitor', tool_version: '1.65.0' }), /needs version 1\.65\.1 or later/);
  assert.match(errors({ tool: 'hwmonitor', tool_version: 'current' }), /needs version 1\.65\.1 or later/);
  assert.deepEqual(made({ tool: 'hwmonitor', tool_version: '1.65.1' }).errors, []);
  assert.deepEqual(made({ tool: 'hwmonitor', tool_version: 'v1.66' }).errors, []);
  assert.match(errors({ tool: 'lact', tool_version: '0.9.1' }), /needs version 0\.10\.0 or later/);
  assert.deepEqual(made({ tool: 'lact', tool_version: '0.10.0' }).errors, []);
  assert.equal(row({ tool: 'gpu-z', tool_version: '2.68.0' }).blackwell_tool_unverified, 'yes');
  assert.deepEqual(made({ gpu_family: 'rtx-40', tool: 'hwmonitor', tool_version: '1.64' }).errors, []);

  assert.deepEqual(versionParts('v1.65.1 beta'), [1, 65, 1]);
  assert.equal(versionParts('release'), null);
  assert.equal(versionAtLeast('1.65.1', [1, 65, 1]), true);
  assert.equal(versionAtLeast('1.65', [1, 65, 1]), false);
});

test('GPU hotspot: model keys normalize spelling without merging different brands', () => {
  assert.equal(modelKey({ card_brand: 'ASUS', card_model: 'ROG Astral RTX 5080 OC' }), 'asus/rogastralrtx5080oc');
  assert.equal(modelKey({ card_brand: 'Asus ', card_model: 'ROG-Astral RTX 5080 OC' }), 'asus/rogastralrtx5080oc');
  assert.notEqual(
    modelKey({ card_brand: 'ASUS', card_model: 'RTX 5080 OC' }),
    modelKey({ card_brand: 'MSI', card_model: 'RTX 5080 OC' }),
  );
  assert.ok(made({ card_brand: '...' }).errors.some((error) => /card_brand needs/.test(error)));
  assert.ok(made({ card_model: '...' }).errors.some((error) => /card_model needs/.test(error)));
});

test('GPU hotspot: an exact model publishes only after five qualifying rows in the frozen bands', () => {
  const deltas = [5, 10, 20, 30, 40];
  const qualifying = deltas.map((delta, k) => row({
    card_brand: k < 3 ? 'ASUS' : 'Asus',
    card_model: k === 4 ? 'ROG-Astral RTX 5080 OC' : 'ROG Astral RTX 5080 OC',
    core_temp_c: '70', hotspot_temp_c: String(70 + delta),
    ...(k === 4 ? { tool: 'lact', tool_version: '0.10.0' } : {}),
  }, k + 1));
  const extra = [
    row({ cooler_state: 'repasted' }, 10),
    row({ power_state: 'undervolted' }, 11),
  ];
  const four = summarize(hotspot, qualifying.slice(0, 4));
  assert.equal(four.groups[0].state, 'collecting');
  assert.equal(four.groups[0].figures, undefined);

  const summary = summarize(hotspot, [...qualifying, ...extra]);
  assert.equal(summary.reports, 7);
  assert.equal(summary.counted, 5);
  assert.equal(summary.groups[0].label, 'ASUS ROG Astral RTX 5080 OC');
  assert.deepEqual(summary.groups[0].figures, {
    n: 5,
    delta_0_9_c: 1,
    delta_10_19_c: 1,
    delta_20_29_c: 1,
    delta_30_39_c: 1,
    delta_40_plus_c: 1,
  });
});

test('GPU hotspot: family rollup publishes at twenty rows with interpolated Q1, median and Q3', () => {
  const rows = Array.from({ length: 20 }, (_, delta) => row({
    card_brand: `Brand ${delta}`,
    card_model: `Model ${delta}`,
    core_temp_c: '70',
    hotspot_temp_c: String(70 + delta),
    ...(delta % 2 ? { tool: 'lact', tool_version: '0.10.0' } : {}),
  }, delta + 1));
  const nineteen = summarize(hotspot, rows.slice(0, 19)).rollups[0];
  assert.equal(nineteen.floor, 20);
  assert.equal(nineteen.groups[0].state, 'collecting');
  assert.equal(nineteen.groups[0].figures, undefined);

  const family = summarize(hotspot, rows).rollups[0];
  assert.equal(family.id, 'gpu-family');
  assert.equal(family.label, 'GPU family');
  assert.equal(family.groups[0].label, 'NVIDIA GeForce RTX 50 series');
  assert.deepEqual(family.groups[0].figures, {
    n: 20,
    delta_q1_c: '4.75',
    delta_median_c: '9.50',
    delta_q3_c: '14.25',
  });
  const labels = hotspot.publish.rollups[0].figureLabels;
  assert.match(labels.delta_q1_c, /25th percentile of these rows/);
  assert.match(labels.delta_q3_c, /75th percentile of these rows/);
});

test('GPU hotspot: unverified Blackwell tools remain reported but cannot publish either view', () => {
  const rows = Array.from({ length: 20 }, (_, k) => row({
    tool: 'hwinfo64', tool_version: '8.30',
    card_brand: 'Example', card_model: 'Unverified RTX 5080',
  }, k + 1));
  assert.ok(rows.every((item) => item.blackwell_tool_unverified === 'yes'));
  const summary = summarize(hotspot, rows);
  assert.equal(summary.reports, 20);
  assert.equal(summary.counted, 0);
  assert.equal(summary.groups[0].reports, 20);
  assert.equal(summary.groups[0].counted, 0);
  assert.equal(summary.groups[0].state, 'collecting');
  assert.equal(summary.groups[0].figures, undefined);
  const family = summary.rollups[0];
  assert.equal(family.reports, 20);
  assert.equal(family.counted, 0);
  assert.equal(family.groups[0].state, 'collecting');
  assert.equal(family.groups[0].figures, undefined);
});

test('GPU hotspot: the table rejects a duplicate source issue', () => {
  const one = row({}, 4);
  const header = hotspot.fields.map((field) => field.name);
  const errors = validateTable(hotspot, header, [one, { ...one }], TODAY);
  assert.ok(errors.some((error) => /source_issue 4 already used/.test(error)));
});
