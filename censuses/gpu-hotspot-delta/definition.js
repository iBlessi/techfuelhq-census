// GPU core-to-hotspot delta census. One row is one software sensor reading from one card under
// one sustained load. Temperatures measured on a backplate or PCB do not belong in this dataset.
import { fixed } from '../../lib/validate.js';
import { median, quantile } from '../../lib/stats.js';

const FAMILY_LABELS = {
  'rtx-50': 'NVIDIA GeForce RTX 50 series',
  'rtx-40': 'NVIDIA GeForce RTX 40 series',
  'rtx-30': 'NVIDIA GeForce RTX 30 series',
  'rx-9000': 'AMD Radeon RX 9000 series',
  'rx-7000': 'AMD Radeon RX 7000 series',
  'rx-6000': 'AMD Radeon RX 6000 series',
  arc: 'Intel Arc',
  other: 'Another GPU family',
};

const READING_LABELS = {
  'both-max-same-session': 'Maximum core and hotspot temperatures from the same session',
  'simultaneous-snapshot': 'Core and hotspot temperatures at the same moment',
};

const LOAD_LABELS = {
  'game-sustained': 'A game, sustained',
  furmark: 'FurMark',
  '3dmark-stress-test': '3DMark stress test',
  other: 'Another sustained load',
};

const TOOL_LABELS = {
  hwinfo64: 'HWiNFO64',
  hwmonitor: 'CPUID HWMonitor',
  'gpu-z': 'GPU-Z',
  'msi-afterburner': 'MSI Afterburner',
  lact: 'LACT',
  'amd-software': 'AMD Software',
  other: 'Another software sensor tool',
};

const COOLER_LABELS = {
  'original-factory': 'Original factory cooler and thermal material',
  repasted: 'Repasted',
  'repasted-and-repadded': 'Repasted and repadded',
  'aftermarket-air': 'Aftermarket air cooler',
  waterblock: 'Waterblock',
};

const POWER_LABELS = {
  stock: 'Stock power settings',
  undervolted: 'Undervolted',
  'power-limit-raised': 'Power limit raised',
  overclocked: 'Overclocked',
};

const MOUNT_LABELS = {
  horizontal: 'Card mounted horizontally',
  vertical: 'Card mounted vertically',
  'open-bench': 'Open bench',
};

const FAN_LABELS = { auto: 'Automatic fan control', custom: 'Custom fan control' };

const BLACKWELL_FLOORS = {
  hwmonitor: [1, 65, 1],
  lact: [0, 10, 1],
};

export function versionParts(value) {
  const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?(?:[ ._-].*)?$/i.exec(String(value || '').trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3] || 0)] : null;
}

export function versionAtLeast(value, floor) {
  const parts = versionParts(value);
  if (!parts) return false;
  for (let k = 0; k < floor.length; k += 1) {
    if (parts[k] !== floor[k]) return parts[k] > floor[k];
  }
  return true;
}

function keyPart(value) {
  return String(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

export function modelKey(row) {
  return `${keyPart(row.card_brand)}/${keyPart(row.card_model)}`;
}

function mostUsedModel(rows, fallback) {
  const spellings = new Map();
  for (const row of rows) {
    const name = `${row.card_brand} ${row.card_model}`;
    spellings.set(name, (spellings.get(name) || 0) + 1);
  }
  let label = fallback;
  let most = 0;
  for (const [spelling, count] of spellings) {
    if (count > most) {
      label = spelling;
      most = count;
    }
  }
  return label;
}

export function qualifies(row) {
  return row.cooler_state === 'original-factory'
    && row.power_state === 'stock'
    && Number(row.load_minutes) >= 10
    && row.blackwell_tool_unverified === 'no';
}

export function derive(row) {
  const blackwellToolUnverified = row.gpu_family === 'rtx-50'
    && !Object.prototype.hasOwnProperty.call(BLACKWELL_FLOORS, row.tool);
  return {
    ...row,
    delta_c: String(Number(row.hotspot_temp_c) - Number(row.core_temp_c)),
    blackwell_tool_unverified: blackwellToolUnverified ? 'yes' : 'no',
  };
}

function bandOf(delta) {
  if (delta < 10) return 'delta_0_9_c';
  if (delta < 20) return 'delta_10_19_c';
  if (delta < 30) return 'delta_20_29_c';
  if (delta < 40) return 'delta_30_39_c';
  return 'delta_40_plus_c';
}

const MODEL_FIGURE_LABELS = {
  n: 'Counted rows',
  delta_0_9_c: 'Rows with a 0-9 C delta',
  delta_10_19_c: 'Rows with a 10-19 C delta',
  delta_20_29_c: 'Rows with a 20-29 C delta',
  delta_30_39_c: 'Rows with a 30-39 C delta',
  delta_40_plus_c: 'Rows with a 40 C or higher delta',
};

const FAMILY_FIGURE_LABELS = {
  n: 'Counted rows',
  delta_q1_c: 'Hotspot delta Q1, the 25th percentile of these rows (C)',
  delta_median_c: 'Hotspot delta median of these rows (C)',
  delta_q3_c: 'Hotspot delta Q3, the 75th percentile of these rows (C)',
};

function modelFigures(rows) {
  const figures = Object.fromEntries(Object.keys(MODEL_FIGURE_LABELS).map((key) => [key, 0]));
  figures.n = rows.length;
  for (const row of rows) figures[bandOf(Number(row.delta_c))] += 1;
  return figures;
}

function familyFigures(rows) {
  const values = rows.map((row) => Number(row.delta_c));
  return {
    n: rows.length,
    delta_q1_c: fixed(quantile(values, 0.25), 2),
    delta_median_c: fixed(median(values), 2),
    delta_q3_c: fixed(quantile(values, 0.75), 2),
  };
}

const definition = {
  id: 'gpu-hotspot-delta',
  name: 'TechFuelHQ GPU Hotspot Delta Census',
  version: '0.1.0',
  page: 'https://techfuelhq.com/data/gpu-hotspot-delta-census/',
  unit: 'one software sensor reading from one card under one sustained load',
  about: 'Core and hotspot temperatures read from the GPU die in software during the same sustained load, with the tool and its version recorded beside every row.',
  counted: 'A row counts toward published figures when the card keeps its original factory cooler and thermal material, uses stock power settings, ran the load for at least ten minutes, and is not an RTX 50 reading from a tool without a primary-source version floor. Exact models publish at five counted rows; GPU families publish a median and the Q1-to-Q3 interval at twenty counted rows.',
  title: (row) => `[gpu-hotspot-delta] ${row.card_brand} ${row.card_model}, ${row.delta_c || '?'} C delta`,
  fields: [
    { name: 'card_brand', type: 'string', required: true, maxLength: 40, from: 'human', label: 'Card brand' },
    { name: 'card_model', type: 'string', required: true, maxLength: 80, from: 'human', label: 'Card model' },
    { name: 'exact_sku', type: 'string', maxLength: 100, from: 'human', label: 'Exact SKU', help: 'The full SKU from the card label, if it is handy.' },
    { name: 'gpu_family', type: 'enum', required: true, from: 'human', label: 'GPU family', values: Object.keys(FAMILY_LABELS), labels: FAMILY_LABELS },
    { name: 'core_temp_c', type: 'integer', required: true, min: 20, max: 100, from: 'human', label: 'GPU core temperature (C)' },
    { name: 'hotspot_temp_c', type: 'integer', required: true, min: 20, max: 125, from: 'human', label: 'GPU hotspot temperature (C)' },
    { name: 'delta_c', type: 'integer', min: 0, max: 105, from: 'derived', label: 'Hotspot minus core (C)' },
    { name: 'reading_type', type: 'enum', required: true, from: 'human', label: 'How the two temperatures were read', values: Object.keys(READING_LABELS), labels: READING_LABELS },
    { name: 'load_type', type: 'enum', required: true, from: 'human', label: 'Load', values: Object.keys(LOAD_LABELS), labels: LOAD_LABELS },
    { name: 'load_minutes', type: 'integer', required: true, min: 10, from: 'human', label: 'Minutes under load' },
    { name: 'tool', type: 'enum', required: true, from: 'human', label: 'Sensor tool', values: Object.keys(TOOL_LABELS), labels: TOOL_LABELS },
    { name: 'tool_version', type: 'string', required: true, maxLength: 40, from: 'human', label: 'Sensor tool version' },
    {
      name: 'blackwell_tool_unverified', type: 'enum', from: 'derived', label: 'RTX 50 tool verification flag',
      values: ['no', 'yes'], labels: { no: 'Not flagged', yes: 'Blackwell tool version is not verified from a primary changelog' },
    },
    { name: 'cooler_state', type: 'enum', required: true, from: 'human', label: 'Cooler and thermal material', values: Object.keys(COOLER_LABELS), labels: COOLER_LABELS },
    { name: 'months_since_paste', type: 'integer', required: true, min: 0, from: 'human', label: 'Months since the thermal paste was applied', help: 'Use the age of the card if it has its factory paste.' },
    { name: 'power_state', type: 'enum', required: true, from: 'human', label: 'Power state', values: Object.keys(POWER_LABELS), labels: POWER_LABELS },
    { name: 'mount', type: 'enum', from: 'human', label: 'Card mount', values: Object.keys(MOUNT_LABELS), labels: MOUNT_LABELS },
    { name: 'ambient_c', type: 'integer', from: 'human', label: 'Room temperature (C)' },
    { name: 'power_draw_w', type: 'integer', min: 0, from: 'human', label: 'GPU power draw (W)' },
    { name: 'fan_mode', type: 'enum', from: 'human', label: 'Fan control', values: Object.keys(FAN_LABELS), labels: FAN_LABELS },
    { name: 'notes', type: 'string', maxLength: 280, from: 'human', label: 'Notes' },
    { name: 'submitted_date', type: 'date', required: true, from: 'intake', label: 'The day the report was sent' },
    { name: 'source_issue', type: 'integer', min: 1, from: 'intake', label: 'The issue the row came from' },
  ],

  derive,

  check(row) {
    const errors = [];
    const expected = derive(row);
    if (Number(row.hotspot_temp_c) < Number(row.core_temp_c)) errors.push('hotspot_temp_c is below core_temp_c');
    if (row.delta_c !== expected.delta_c) errors.push(`delta_c is ${row.delta_c || 'empty'} and the two temperatures give ${expected.delta_c}`);
    if (row.blackwell_tool_unverified !== expected.blackwell_tool_unverified) {
      errors.push(`blackwell_tool_unverified is ${row.blackwell_tool_unverified || 'empty'} and the tool gives ${expected.blackwell_tool_unverified}`);
    }
    if (keyPart(row.card_brand) === '') errors.push('card_brand needs a letter or digit');
    if (keyPart(row.card_model) === '') errors.push('card_model needs a letter or digit');
    if (row.gpu_family === 'rtx-50' && Object.prototype.hasOwnProperty.call(BLACKWELL_FLOORS, row.tool)) {
      const floor = BLACKWELL_FLOORS[row.tool];
      if (!versionAtLeast(row.tool_version, floor)) {
        errors.push(`${row.tool} on RTX 50 needs version ${floor.join('.')} or later`);
      }
    }
    return errors;
  },

  publish: {
    floor: 5,
    figureLabels: MODEL_FIGURE_LABELS,
    group: modelKey,
    label: (key, rows) => mostUsedModel(rows, key),
    counts: qualifies,
    figures: modelFigures,
    rollups: [{
      id: 'gpu-family',
      labelForView: 'GPU family',
      floor: 20,
      figureLabels: FAMILY_FIGURE_LABELS,
      group: (row) => row.gpu_family,
      label: (key) => FAMILY_LABELS[key] || key,
      counts: qualifies,
      figures: familyFigures,
    }],
  },
};

export default definition;
