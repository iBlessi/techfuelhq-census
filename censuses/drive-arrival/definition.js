// Drive arrival census. One row is one hard drive as it arrived from a seller, read with smartctl
// before it went into service.
import { fixed } from '../../lib/validate.js';
import { median } from '../../lib/stats.js';

export const GAP_FLAG_H = 24; // FARM hours beyond SMART hours by more than a day

// One key for a seller however its name was typed: the letters and digits of any script, in
// lower case.
export function sellerKey(seller) {
  return String(seller).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

export function derive(row) {
  const out = { ...row };
  if (row.farm === 'read' && (row.farm_poh || '') !== '') {
    out.poh_gap_h = String(Number(row.farm_poh) - Number(row.smart_poh));
  } else {
    out.poh_gap_h = '';
  }
  return out;
}

const CONDITION_LABELS = {
  new: 'Sold as new',
  'manufacturer-recertified': 'Sold as manufacturer recertified',
  'seller-refurbished': 'Sold as seller refurbished or renewed',
  used: 'Sold as used',
  'open-box': 'Sold as open box',
};

const FARM_FIELDS = ['farm_poh', 'farm_spindle_poh', 'farm_head_flight_hours', 'farm_power_cycles', 'farm_assembly_printed'];

const definition = {
  id: 'drive-arrival',
  name: 'TechFuelHQ Drive Arrival Census',
  version: '0.1.0',
  page: 'https://techfuelhq.com/data/drive-arrival-census/',
  unit: 'one drive as it arrived',
  about: 'What a hard drive reports about itself on the day it arrives from a seller: the hours in its SMART attributes, the hours in its Seagate FARM log where it keeps one, and whether it worked.',
  counted: 'Every row counts. Rows are grouped by seller and by the condition on the listing, and a group publishes once it holds five rows.',
  title: (row) => `[drive-arrival] ${row.model} from ${row.seller}, ${row.smart_poh} h`,
  fields: [
    { name: 'seller', type: 'string', required: true, maxLength: 60, from: 'human', label: 'Seller', help: 'The shop, or the marketplace and the seller\'s name on it.' },
    { name: 'listing_condition', type: 'enum', required: true, from: 'human', label: 'Condition on the listing', values: Object.keys(CONDITION_LABELS), labels: CONDITION_LABELS },
    { name: 'purchase_month', type: 'month', required: true, from: 'human', label: 'Bought', help: 'Year and month, written 2026-08.' },
    { name: 'drive_vendor', type: 'enum', required: true, from: 'machine', label: 'Drive maker', values: ['seagate', 'wd', 'hgst', 'toshiba', 'other'], labels: { seagate: 'Seagate', wd: 'Western Digital', hgst: 'HGST', toshiba: 'Toshiba', other: 'Another maker' } },
    { name: 'model_family', type: 'string', maxLength: 80, from: 'machine', label: 'Model family' },
    { name: 'model', type: 'string', required: true, maxLength: 60, from: 'machine', label: 'Model' },
    { name: 'capacity_tb', type: 'number', required: true, min: 0.1, max: 100, decimals: 2, from: 'machine', label: 'Capacity (TB)' },
    { name: 'interface', type: 'enum', required: true, from: 'machine', label: 'Interface', values: ['sata', 'sas'], labels: { sata: 'SATA', sas: 'SAS' } },
    { name: 'smartctl_version', type: 'string', maxLength: 20, from: 'machine', label: 'smartctl version' },
    { name: 'smart_poh', type: 'integer', required: true, min: 0, max: 200000, from: 'machine', label: 'Power-on hours, SMART' },
    { name: 'smart_power_cycles', type: 'integer', min: 0, max: 10000000, from: 'machine', label: 'Power cycles, SMART' },
    { name: 'reallocated', type: 'integer', min: 0, max: 10000000, from: 'machine', label: 'Reallocated sectors' },
    { name: 'pending', type: 'integer', min: 0, max: 10000000, from: 'machine', label: 'Pending sectors' },
    { name: 'offline_uncorrectable', type: 'integer', min: 0, max: 10000000, from: 'machine', label: 'Offline uncorrectable' },
    { name: 'crc_errors', type: 'integer', min: 0, max: 10000000, from: 'machine', label: 'Interface CRC errors' },
    { name: 'load_cycles', type: 'integer', min: 0, max: 100000000, from: 'machine', label: 'Load cycles' },
    {
      name: 'farm', type: 'enum', required: true, from: 'machine', label: 'Seagate FARM log',
      values: ['read', 'not-supported', 'not-provided'],
      labels: { read: 'Read', 'not-supported': 'The drive does not keep one', 'not-provided': 'Not read' },
    },
    { name: 'farm_poh', type: 'integer', min: 0, max: 200000, from: 'machine', label: 'Power-on hours, FARM' },
    { name: 'farm_spindle_poh', type: 'integer', min: 0, max: 200000, from: 'machine', label: 'Spindle power-on hours, FARM' },
    { name: 'farm_head_flight_hours', type: 'integer', min: 0, max: 200000, from: 'machine', label: 'Head flight hours, FARM' },
    { name: 'farm_power_cycles', type: 'integer', min: 0, max: 10000000, from: 'machine', label: 'Power cycles, FARM' },
    {
      name: 'farm_assembly_printed', type: 'string', pattern: '^[0-9]{4}$', from: 'machine', label: 'Assembly date, as smartctl printed it',
      help: 'Four digits, kept as printed. smartctl labels them year and week. On the two Seagate drives in the test data each pair arrives with its digits swapped, so 2264 reads as week 46 of 2022.',
    },
    { name: 'poh_gap_h', type: 'integer', min: -200000, max: 200000, from: 'derived', label: 'FARM hours minus SMART hours' },
    {
      name: 'arrived', type: 'enum', required: true, from: 'human', label: 'How it arrived',
      values: ['working', 'dead', 'errors-on-first-test'],
      labels: { working: 'Working', dead: 'Dead: not detected, or would not spin', 'errors-on-first-test': 'Detected, and failed its first test' },
    },
    {
      name: 'first_test', type: 'enum', required: true, from: 'human', label: 'Test run before use',
      values: ['none', 'short-smart', 'long-smart', 'full-surface'],
      labels: { none: 'None yet', 'short-smart': 'SMART short test', 'long-smart': 'SMART extended test', 'full-surface': 'A full write and read of the surface' },
    },
    { name: 'notes', type: 'string', maxLength: 280, from: 'human', label: 'Notes' },
    { name: 'submitted_date', type: 'date', required: true, from: 'intake', label: 'The day the report was sent' },
    { name: 'source_issue', type: 'integer', min: 1, from: 'intake', label: 'The issue the row came from' },
  ],

  derive,

  check(row) {
    const errors = [];
    if (row.farm === 'read') {
      if ((row.farm_poh || '') === '') errors.push('farm is read and farm_poh is empty');
    } else {
      for (const name of FARM_FIELDS) {
        if ((row[name] || '') !== '') errors.push(`${name} is set and farm is ${row.farm}`);
      }
    }
    const d = derive(row);
    if ((row.poh_gap_h || '') !== d.poh_gap_h) errors.push(`poh_gap_h is "${row.poh_gap_h || ''}" and the hours give "${d.poh_gap_h}"`);
    if (sellerKey(row.seller) === '') errors.push('seller has no letters or digits');
    return errors;
  },

  publish: {
    floor: 5,
    figureLabels: {
      n: "Rows",
      smart_hours_median: "SMART power-on hours, median",
      rows_with_farm: "Rows with a FARM log",
      rows_not_working: "Rows that arrived dead or failed their first test",
      rows_with_reallocated_sectors: "Rows with reallocated sectors",
      farm_hours_median: "FARM power-on hours, median",
      rows_where_farm_exceeds_smart_by_over_24_h: "Rows where FARM is more than 24 hours above SMART",
    },
    group: (row) => `${sellerKey(row.seller)}/${row.listing_condition}`,
    label(key, rows = []) {
      const [seller, condition] = key.split('/');
      // The spelling most reports used; the earliest one wins a tie.
      const spellings = new Map();
      for (const r of rows) spellings.set(r.seller, (spellings.get(r.seller) || 0) + 1);
      let name = seller;
      let most = 0;
      for (const [spelling, count] of spellings) {
        if (count > most) {
          name = spelling;
          most = count;
        }
      }
      return `${name}, ${(CONDITION_LABELS[condition] || condition).toLowerCase()}`;
    },
    counts: () => true,
    figures(rows) {
      const withFarm = rows.filter((r) => r.farm === 'read');
      const out = {
        n: rows.length,
        smart_hours_median: fixed(median(rows.map((r) => Number(r.smart_poh))), 0),
        rows_with_farm: withFarm.length,
        rows_not_working: rows.filter((r) => r.arrived !== 'working').length,
        rows_with_reallocated_sectors: rows.filter((r) => Number(r.reallocated || 0) > 0).length,
      };
      if (withFarm.length >= 5) {
        out.farm_hours_median = fixed(median(withFarm.map((r) => Number(r.farm_poh))), 0);
        out.rows_where_farm_exceeds_smart_by_over_24_h = withFarm.filter((r) => Number(r.poh_gap_h) > GAP_FLAG_H).length;
      }
      return out;
    },
  },
};

export default definition;
