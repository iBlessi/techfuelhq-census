// Reads per-pin current logs and turns them into the machine half of a pin-current report.
//
// Formats, each taken from the tool's own source or published capture:
//   astral-hwmon   log-session.py CSV: epoch,iso,elapsed,mv1..mv6,ma1..ma6,...,read_error (mV, mA)
//   12vhpwr-guard  flight recorder CSV: time,pin1..pin6 (A), time written "YYYY-MM-DD HH:MM:SS.mmm".
//                  The guard keeps the last minute in memory and writes it only when it limits
//                  the card or shuts the machine down, so the file is the minute before it acted.
// A single reading is six numbers in amps, in pin order.
import { parseCsv } from '../csv.js';
import { fixed } from '../validate.js';
import { IDLE_BELOW_A, HIGH_FROM_A } from '../../censuses/pin-current/definition.js';

export const MIN_BAND_SAMPLES = 20;
const PINS = [1, 2, 3, 4, 5, 6];

export function detectFormat(text) {
  const first = (text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] || '').trim().toLowerCase();
  const cols = first.split(',').map((c) => c.trim());
  if (PINS.every((p) => cols.includes(`ma${p}`))) return 'astral-hwmon';
  if (cols[0] === 'time' && PINS.every((p) => cols.includes(`pin${p}`))) return '12vhpwr-guard';
  return null;
}

function clockSeconds(stamp) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(stamp.trim());
  if (!m) return null;
  const ms = m[7] ? Number(m[7].padEnd(3, '0')) : 0;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], ms) / 1000;
}

// An empty cell is a missing reading. Number('') is 0, which would read as a pin carrying nothing.
function cell(value) {
  const s = String(value === undefined || value === null ? '' : value).trim();
  return s === '' ? NaN : Number(s);
}

// Returns { format, samples: [{ t, pins: [A x6], volts: [V x6] | null }], skipped }.
export function parseLog(text) {
  const format = detectFormat(text);
  if (!format) {
    throw new Error('This is not a log I can read. I read astral-hwmon session files and 12VHPWR Guard flight files; six numbers read from any other tool go in the boxes instead.');
  }
  const rows = parseCsv(text).filter((r) => !(r.length === 1 && r[0].trim() === ''));
  const header = rows[0].map((c) => c.trim().toLowerCase());
  const at = (name) => header.indexOf(name);
  const samples = [];
  let skipped = 0;
  for (let n = 1; n < rows.length; n += 1) {
    const r = rows[n].map((c) => c.trim());
    let t;
    let pins;
    let volts = null;
    if (format === 'astral-hwmon') {
      const bad = at('read_error') >= 0 ? r[at('read_error')] : '';
      if (bad) {
        skipped += 1;
        continue;
      }
      t = cell(r[at('elapsed')]);
      pins = PINS.map((p) => cell(r[at(`ma${p}`)]) / 1000);
      if (PINS.every((p) => at(`mv${p}`) >= 0)) volts = PINS.map((p) => cell(r[at(`mv${p}`)]) / 1000);
    } else {
      t = clockSeconds(r[at('time')] || '');
      pins = PINS.map((p) => cell(r[at(`pin${p}`)]));
    }
    const usable = t !== null && Number.isFinite(t) && pins.every((a) => Number.isFinite(a) && a >= 0 && a <= 30)
      && (volts === null || volts.every((v) => Number.isFinite(v)));
    if (!usable) {
      skipped += 1;
      continue;
    }
    samples.push({ t, pins, volts });
  }
  if (samples.length === 0) throw new Error('The log has a header I recognise and no rows I can read.');
  return { format, samples, skipped };
}

const total = (s) => s.pins.reduce((a, b) => a + b, 0);

// A loop, because a six-hour log at two readings a second is 43,200 rows and spreading that
// many values into Math.max overflows the call stack in some browsers.
function extremes(values) {
  let low = Infinity;
  let high = -Infinity;
  for (const v of values) {
    if (v < low) low = v;
    if (v > high) high = v;
  }
  return { low, high };
}

// Which samples count: the high band if the log holds enough of it, else everything loaded,
// else the whole log. Peaks and the lowest voltage come from every sample.
export function summarize(samples, capture = 'log') {
  const high = samples.filter((s) => total(s) >= HIGH_FROM_A);
  const loaded = samples.filter((s) => total(s) >= IDLE_BELOW_A);
  let counted = samples;
  let basis = 'every sample, because fewer than 20 were under load';
  if (high.length >= MIN_BAND_SAMPLES) {
    counted = high;
    basis = `the ${high.length} samples at ${HIGH_FROM_A} A total and above`;
  } else if (loaded.length >= MIN_BAND_SAMPLES) {
    counted = loaded;
    basis = `the ${loaded.length} samples at ${IDLE_BELOW_A} A total and above`;
  }
  const means = PINS.map((p, k) => counted.reduce((a, s) => a + s.pins[k], 0) / counted.length);
  const pinsOut = means.map((m) => fixed(m, 2));
  // total_a is the sum of the pin values as written, so a row always adds up.
  const totalOut = fixed(pinsOut.reduce((a, b) => a + Number(b), 0), 2);
  const times = extremes(samples.map((s) => s.t));
  const volts = [];
  const pinsSeen = [];
  for (const s of samples) {
    for (const a of s.pins) pinsSeen.push(a);
    if (s.volts) for (const v of s.volts) volts.push(v);
  }
  const out = {
    capture,
    samples: String(counted.length),
    duration_s: String(Math.round(times.high - times.low)),
    total_a: totalOut,
    peak_pin_a: fixed(extremes(pinsSeen).high, 2),
    peak_total_a: fixed(extremes(samples.map(total)).high, 2),
    min_v: volts.length ? fixed(extremes(volts).low, 3) : '',
  };
  PINS.forEach((p, k) => {
    out[`pin${p}_a`] = pinsOut[k];
  });
  return { machine: out, basis, all: samples.length };
}

export function fromSingleReading(values) {
  if (!Array.isArray(values) || values.length !== 6) throw new Error('A reading is six numbers, one per pin.');
  if (values.some((v) => String(v === undefined || v === null ? '' : v).trim() === '')) {
    throw new Error('Each of the six boxes needs a number. A pin that reads nothing is written 0.');
  }
  const pins = values.map((v) => Number(String(v).trim().replace(',', '.')));
  if (pins.some((a) => !Number.isFinite(a) || a < 0 || a > 30)) {
    throw new Error('Each pin is a number of amps from 0 to 30.');
  }
  const pinsOut = pins.map((a) => fixed(a, 2));
  const sum = pinsOut.reduce((a, b) => a + Number(b), 0);
  const out = {
    capture: 'single-reading',
    samples: '1',
    duration_s: '0',
    total_a: fixed(sum, 2),
    peak_pin_a: fixed(Math.max(...pinsOut.map(Number)), 2),
    peak_total_a: fixed(sum, 2),
    min_v: '',
  };
  PINS.forEach((p, k) => {
    out[`pin${p}_a`] = pinsOut[k];
  });
  return { machine: out, basis: 'one reading of six pins', all: 1 };
}

export function readLog(text) {
  const parsed = parseLog(text);
  const event = parsed.format === '12vhpwr-guard';
  const summary = summarize(parsed.samples, event ? 'guard-event' : 'log');
  return { ...summary, format: parsed.format, skipped: parsed.skipped, sensor: parsed.format, event };
}
