// 12V-2x6 pin current census. One row is one connector on one card, read once under one load.
import { fixed, near } from '../../lib/validate.js';
import { median, range } from '../../lib/stats.js';

export const IDLE_BELOW_A = 6; // below this total the sensor's step is a large share of each pin's reading
export const HIGH_FROM_A = 25;
export const VENDOR_WARNING_A = 9.2; // the per-pin figure ASUS Power Detector+ warns at

const PINS = [1, 2, 3, 4, 5, 6];

export function bandOf(totalA) {
  if (totalA < IDLE_BELOW_A) return 'idle';
  if (totalA < HIGH_FROM_A) return 'moderate';
  return 'high';
}

// Derived values are always computed from the pin values as written in the row, so the browser
// and the validator reach the same digits.
export function derive(row) {
  const pins = PINS.map((p) => Number(row[`pin${p}_a`]));
  const sum = pins.reduce((a, b) => a + b, 0);
  const top = Math.max(...pins);
  return {
    ...row,
    imbalance: fixed(top / (sum / 6), 3),
    max_share_pct: fixed((100 * top) / sum, 1),
    band: bandOf(Number(row.total_a)),
  };
}

const definition = {
  id: 'pin-current',
  name: 'TechFuelHQ 12V-2x6 Pin Current Census',
  version: '0.1.0',
  page: 'https://techfuelhq.com/data/pin-current-census/',
  unit: 'one connector on one card, read once under one load',
  about: 'How evenly the six 12 V pins of a 16-pin graphics card connector share the current, read from hardware that measures each pin.',
  counted: 'A row counts toward a published distribution when its total current is 6 A or more. Rows are grouped by cable type, and a group publishes once it holds five counted rows.',
  title: (row) => `[pin-current] ${row.card_model}, busiest pin ${Math.max(...[1, 2, 3, 4, 5, 6].map((p) => Number(row[`pin${p}_a`]))).toFixed(2)} A of ${row.total_a} A`,
  fields: [
    { name: 'card_brand', type: 'string', required: true, maxLength: 40, from: 'human', label: 'Card brand', help: 'As printed on the box: ASUS, MSI, Gigabyte.' },
    { name: 'card_model', type: 'string', required: true, maxLength: 80, from: 'human', label: 'Card model', help: 'The model line: ROG Astral RTX 5080 OC.' },
    { name: 'gpu', type: 'string', required: true, maxLength: 24, pattern: '^(RTX|RX|Arc) [0-9A-Za-z ]{3,18}$', from: 'human', label: 'GPU', help: 'The chip, written like RTX 5080 or RX 9070 XT.' },
    {
      name: 'sensor', type: 'enum', required: true, from: 'human', label: 'What measured it',
      values: ['asus-power-detector', 'astral-hwmon', '12vhpwr-guard', 'hwinfo', 'wireview-pro-ii', 'other'],
      labels: {
        'asus-power-detector': 'ASUS GPU Tweak III, Power Detector+',
        'astral-hwmon': 'astral-hwmon (Linux)',
        '12vhpwr-guard': '12VHPWR Guard (Windows)',
        hwinfo: 'HWiNFO',
        'wireview-pro-ii': 'Thermal Grizzly WireView Pro II',
        other: 'Something else (say what in the notes)',
      },
    },
    { name: 'capture', type: 'enum', required: true, from: 'machine', label: 'Capture', values: ['log', 'single-reading'], labels: { log: 'A log over time', 'single-reading': 'Six numbers read once' } },
    {
      name: 'cable_type', type: 'enum', required: true, from: 'human', label: 'Cable',
      help: 'What carries power from the supply to the card.',
      values: ['native-16pin', 'native-8pin-psu-side', 'boxed-adapter', 'third-party'],
      labels: {
        'native-16pin': 'The supply maker\'s cable, 16-pin at both ends',
        'native-8pin-psu-side': 'The supply maker\'s cable, 8-pin sockets at the supply, 16-pin at the card',
        'boxed-adapter': 'The adapter that came in the card\'s box',
        'third-party': 'A cable or adapter from another company',
      },
    },
    {
      name: 'inline_part', type: 'enum', required: true, from: 'human', label: 'Anything between cable and card',
      values: ['none', 'angled-adapter', 'extension', 'inline-meter'],
      labels: { none: 'Nothing', 'angled-adapter': 'An angled adapter', extension: 'An extension cable', 'inline-meter': 'An inline meter' },
    },
    { name: 'psu_brand', type: 'string', required: true, maxLength: 40, from: 'human', label: 'Power supply brand' },
    { name: 'psu_model', type: 'string', required: true, maxLength: 80, from: 'human', label: 'Power supply model', help: 'With its wattage if that is part of the name: RM1000x.' },
    { name: 'psu_watts', type: 'integer', min: 300, max: 3000, from: 'human', label: 'Power supply watts' },
    { name: 'months_in_use', type: 'integer', required: true, min: 0, max: 120, from: 'human', label: 'Months this cable has been in this card', help: 'Whole months since it was last plugged in. A cable reseated last week is 0.' },
    {
      name: 'load_kind', type: 'enum', required: true, from: 'human', label: 'What the card was doing',
      values: ['gaming', 'stress-test', 'compute', 'desktop'],
      labels: { gaming: 'A game', 'stress-test': 'A stress test or benchmark', compute: 'Rendering, training or inference', desktop: 'Sitting at the desktop' },
    },
    { name: 'load_name', type: 'string', maxLength: 60, from: 'human', label: 'Which one', help: 'The game or test by name.' },
    { name: 'samples', type: 'integer', required: true, min: 1, max: 10000000, from: 'machine', label: 'Samples counted' },
    { name: 'duration_s', type: 'integer', required: true, min: 0, max: 864000, from: 'machine', label: 'Seconds covered' },
    { name: 'total_a', type: 'number', required: true, min: 0.5, max: 80, decimals: 2, from: 'machine', label: 'Total current, mean (A)' },
    ...PINS.map((p) => ({ name: `pin${p}_a`, type: 'number', required: true, min: 0, max: 30, decimals: 2, from: 'machine', label: `Pin ${p}, mean (A)` })),
    { name: 'peak_pin_a', type: 'number', required: true, min: 0, max: 30, decimals: 2, from: 'machine', label: 'Highest single pin seen (A)' },
    { name: 'peak_total_a', type: 'number', required: true, min: 0.5, max: 80, decimals: 2, from: 'machine', label: 'Highest total seen (A)' },
    { name: 'min_v', type: 'number', min: 9, max: 14, decimals: 3, from: 'machine', label: 'Lowest pin voltage seen (V)' },
    { name: 'imbalance', type: 'number', required: true, min: 1, max: 6, decimals: 3, from: 'derived', label: 'Busiest pin over the average pin' },
    { name: 'max_share_pct', type: 'number', required: true, min: 16.6, max: 100, decimals: 1, from: 'derived', label: 'Busiest pin\'s share of the total (%)' },
    { name: 'band', type: 'enum', required: true, from: 'derived', label: 'Load band', values: ['idle', 'moderate', 'high'], labels: { idle: `Under ${IDLE_BELOW_A} A total`, moderate: `${IDLE_BELOW_A} to ${HIGH_FROM_A} A total`, high: `${HIGH_FROM_A} A total and above` } },
    { name: 'notes', type: 'string', maxLength: 280, from: 'human', label: 'Notes' },
    { name: 'submitted_date', type: 'date', required: true, from: 'intake', label: 'The day the report was sent' },
    { name: 'source_issue', type: 'integer', min: 1, from: 'intake', label: 'The issue the row came from' },
  ],

  derive,

  check(row) {
    const errors = [];
    const pins = PINS.map((p) => Number(row[`pin${p}_a`]));
    const sum = pins.reduce((a, b) => a + b, 0);
    if (!near(sum, row.total_a, 0.05)) errors.push(`the six pins add to ${fixed(sum, 2)} A and total_a says ${row.total_a}`);
    if (Number(row.peak_pin_a) < Math.max(...pins) - 0.011) errors.push('peak_pin_a is below the busiest pin\'s mean');
    if (Number(row.peak_total_a) < Number(row.total_a) - 0.011) errors.push('peak_total_a is below total_a');
    if (row.capture === 'single-reading' && (row.samples !== '1' || row.duration_s !== '0')) {
      errors.push('a single reading has samples 1 and duration_s 0');
    }
    const d = derive(row);
    for (const key of ['imbalance', 'max_share_pct', 'band']) {
      if (d[key] !== row[key]) errors.push(`${key} is ${row[key]} and the pins give ${d[key]}`);
    }
    return errors;
  },

  publish: {
    floor: 5,
    figureLabels: {
      n: "Counted rows",
      imbalance_median: "Busiest pin over the average pin, median",
      imbalance_min: "Busiest pin over the average pin, lowest row",
      imbalance_max: "Busiest pin over the average pin, highest row",
      max_share_pct_median: "Busiest pin's share of the total, median (%)",
      peak_pin_a_highest: "Highest single pin reading in any row (A)",
      rows_with_a_pin_at_or_above_9_2_a: "Rows where a pin reached 9.2 A or more",
      rows_in_high_band: "Rows at 25 A total and above",
    },
    group: (row) => row.cable_type,
    label: (key) => definition.fields.find((f) => f.name === 'cable_type').labels[key] || key,
    counts: (row) => row.band !== 'idle',
    figures(rows) {
      const imbalance = rows.map((r) => Number(r.imbalance));
      const peaks = rows.map((r) => Number(r.peak_pin_a));
      return {
        n: rows.length,
        imbalance_median: fixed(median(imbalance), 3),
        imbalance_min: fixed(range(imbalance).min, 3),
        imbalance_max: fixed(range(imbalance).max, 3),
        max_share_pct_median: fixed(median(rows.map((r) => Number(r.max_share_pct))), 1),
        peak_pin_a_highest: fixed(range(peaks).max, 2),
        rows_with_a_pin_at_or_above_9_2_a: peaks.filter((p) => p >= VENDOR_WARNING_A).length,
        rows_in_high_band: rows.filter((r) => r.band === 'high').length,
      };
    },
  },
};

export default definition;
