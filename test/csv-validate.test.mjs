import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseTable, serializeRow, serializeTable } from '../lib/csv.js';
import { checkField, fixed, near, quoted, unknownNames } from '../lib/validate.js';
import { median, summarize } from '../lib/stats.js';
import { TODAY } from './helpers.mjs';

test('csv: quoted commas, doubled quotes and line breaks survive a round trip', () => {
  const values = ['plain', 'has, comma', 'has "quote"', 'two\nlines', ''];
  const line = serializeRow(values);
  assert.equal(line, 'plain,"has, comma","has ""quote""","two\nlines",');
  assert.deepEqual(parseCsv(`${line}\n`), [values]);
});

test('csv: CRLF, a byte order mark and a missing final newline are read', () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n1,2\r\n3,4'), [['a', 'b'], ['1', '2'], ['3', '4']]);
});

test('csv: a row of the wrong length and an unclosed quote are errors', () => {
  assert.throws(() => parseTable('a,b\n1,2,3\n'), /row 2 has 3 fields/);
  assert.throws(() => parseCsv('a,"b\n'), /quoted field/);
});

test('csv: a header-only file is a table with no records', () => {
  const t = parseTable('a,b\n');
  assert.deepEqual(t.header, ['a', 'b']);
  assert.equal(t.records.length, 0);
  assert.equal(serializeTable(t.header, t.records), 'a,b\n');
});

test('fields: each type refuses what it should', () => {
  const bad = (field, value, pattern) => {
    const errors = checkField({ name: 'x', ...field }, value, TODAY);
    assert.equal(errors.length, 1, `${JSON.stringify(field)} accepted ${JSON.stringify(value)}`);
    assert.match(errors[0], pattern);
  };
  const good = (field, value) => assert.deepEqual(checkField({ name: 'x', ...field }, value, TODAY), []);

  bad({ type: 'string', required: true }, '', /required/);
  good({ type: 'string' }, '');
  bad({ type: 'string' }, ' padded', /space/);
  bad({ type: 'string' }, 'two\nlines', /line break/);
  bad({ type: 'string', maxLength: 3 }, 'four', /longer than 3/);
  bad({ type: 'string', pattern: '^[0-9]{4}$' }, '12a4', /does not match/);
  bad({ type: 'enum', values: ['a', 'b'] }, 'c', /not one of/);
  good({ type: 'enum', values: ['a', 'b'] }, 'b');
  bad({ type: 'integer' }, '1.5', /whole number/);
  bad({ type: 'integer' }, '1e3', /whole number/);
  bad({ type: 'integer', min: 0 }, '-1', /below 0/);
  bad({ type: 'integer', max: 9 }, '10', /above 9/);
  good({ type: 'integer', min: 0, max: 9 }, '9');
  bad({ type: 'number' }, 'abc', /not a number/);
  bad({ type: 'number' }, '1.', /not a number/);
  bad({ type: 'number', decimals: 2 }, '1.234', /decimal places/);
  good({ type: 'number', decimals: 2 }, '1.23');
  bad({ type: 'date' }, '2026-02-30', /not a date/);
  bad({ type: 'date' }, '09/29/2026', /not a date/);
  bad({ type: 'date' }, '2026-09-30', /future/);
  good({ type: 'date' }, '2026-09-29');
  bad({ type: 'month' }, '2026-13', /not a month/);
  bad({ type: 'month' }, '2026-10', /future/);
  good({ type: 'month' }, '2026-09');
});

test('fields: text a spreadsheet would run as a formula is refused', () => {
  const text = { name: 'seller', type: 'string', maxLength: 60 };
  for (const value of ['=HYPERLINK("https://e.example","A1")', "=cmd|' /C calc'!A0", '+1+1', '-2+3', '@SUM(A1:A2)']) {
    const errors = checkField(text, value, TODAY);
    assert.equal(errors.length, 1, value);
    assert.match(errors[0], /a spreadsheet reads as a formula/, value);
  }
  // The same characters are harmless anywhere but the start, and a negative number is a number.
  assert.deepEqual(checkField(text, 'A+ Drives = good', TODAY), []);
  assert.deepEqual(checkField(text, 'user@example', TODAY), []);
  assert.deepEqual(checkField({ name: 'gap', type: 'integer', min: -10 }, '-5', TODAY), []);
});

test('fields: a character that does not print is refused, whatever the type', () => {
  const NUL = String.fromCharCode(0);
  const hidden = {
    'a null': `a${NUL}b`,
    'an escape': `a${String.fromCharCode(27)}[31mb`,
    'a delete': `a${String.fromCharCode(127)}b`,
    'a C1 control': `a${String.fromCharCode(0x85)}b`,
    'a line separator': `a${String.fromCharCode(0x2028)}b`,
    'a paragraph separator': `a${String.fromCharCode(0x2029)}b`,
    'a right-to-left override': `a${String.fromCharCode(0x202e)}b`,
    'an isolate': `a${String.fromCharCode(0x2066)}b`,
    'a byte order mark': `a${String.fromCharCode(0xfeff)}b`,
  };
  for (const [what, value] of Object.entries(hidden)) {
    for (const field of [{ type: 'string' }, { type: 'enum', values: ['ab'] }]) {
      const errors = checkField({ name: 'x', ...field }, value, TODAY);
      assert.equal(errors.length, 1, what);
      assert.match(errors[0], /does not print/, what);
    }
  }
  assert.deepEqual(checkField({ name: 'x', type: 'string' }, 'ヨドバシ Ситилинк café', TODAY), []);
});

test('messages quote what a report said on one line, short, with nothing hidden in it', () => {
  assert.equal(quoted('plain'), '"plain"');
  assert.equal(quoted('two\n\n## lines'), '"two ## lines"');
  assert.equal(quoted(`a${String.fromCharCode(0)}${String.fromCharCode(0x202e)}b`), '"a b"');
  assert.equal(quoted('x'.repeat(200)).length, 65);
  assert.equal(quoted(12), '"12"');
  assert.equal(quoted(undefined), '"undefined"');
  const def = { id: 'demo', fields: [{ name: 'a' }] };
  assert.deepEqual(unknownNames(def, ['a']), []);
  assert.deepEqual(unknownNames(def, ['a', 'b\nc']), ['"b c" is not a field of the demo census']);
  assert.equal(unknownNames(def, ['1', '2', '3', '4', '5', '6', '7']).length, 1);
});

test('numbers: fixed() prints the same digits every time, and never minus zero', () => {
  assert.equal(fixed(1.064374, 3), '1.064');
  assert.equal(fixed(17.7395, 1), '17.7');
  assert.equal(fixed(-0.0001, 2), '0.00');
  assert.throws(() => fixed(Number.NaN, 2));
  assert.equal(near('47.07', 47.1, 0.05), true);
  assert.equal(near('47.07', 47.2, 0.05), false);
});

test('stats: median of odd, even and empty lists', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test('summary: four counted rows stay collecting, the fifth publishes, uncounted rows never count', () => {
  const def = {
    id: 'demo',
    version: '0.0.0',
    publish: {
      floor: 5,
      group: (r) => r.g,
      label: (k) => `group ${k}`,
      counts: (r) => r.ok === 'yes',
      figures: (rows) => ({ n: rows.length, median: fixed(median(rows.map((r) => Number(r.v))), 1) }),
    },
  };
  const row = (g, v, ok = 'yes') => ({ g, v: String(v), ok });
  const four = [row('a', 1), row('a', 2), row('a', 3), row('a', 4), row('a', 99, 'no')];
  let s = summarize(def, four);
  assert.equal(s.reports, 5);
  assert.equal(s.counted, 4);
  assert.deepEqual(s.groups, [{ key: 'a', label: 'group a', reports: 5, counted: 4, state: 'collecting' }]);

  s = summarize(def, [...four, row('a', 10), row('b', 7)]);
  assert.equal(s.groups[0].state, 'published');
  assert.deepEqual(s.groups[0].figures, { n: 5, median: '3.0' });
  assert.equal(s.groups[1].state, 'collecting');
  assert.equal(s.groups[1].figures, undefined);
});
