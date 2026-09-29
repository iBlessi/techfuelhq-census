// OLED monitor burn-in census. One row is one monitor, judged once by its owner on the anchored scale.
import { fixed } from '../../lib/validate.js';
import { median } from '../../lib/stats.js';

export const SEVERITY = {
  0: 'Nothing visible on a full-screen gray slide',
  1: 'Visible on a test slide, never in normal content',
  2: 'Visible in normal content when I look for it',
  3: 'Visible in normal use without looking',
  4: 'Replaced, returned or retired because of it',
};

const definition = {
  id: 'oled-burn-in',
  name: 'TechFuelHQ OLED Monitor Burn-In Census',
  version: '0.1.0',
  page: 'https://techfuelhq.com/data/oled-burn-in-census/',
  unit: 'one monitor, judged once',
  about: 'What owners of OLED monitors see on their own panels after months and years of use, on a fixed five-step scale.',
  counted: 'A row counts once the monitor has been in regular use for a month or more. Rows are grouped by panel type, and a group publishes once it holds five counted rows.',
  title: (row) => `[oled-burn-in] ${row.monitor_brand} ${row.monitor_model}, ${row.months_in_use} months, severity ${row.severity}`,
  fields: [
    { name: 'monitor_brand', type: 'string', required: true, maxLength: 40, from: 'human', label: 'Monitor brand' },
    { name: 'monitor_model', type: 'string', required: true, maxLength: 80, from: 'human', label: 'Monitor model', help: 'The model number on the back label: AW3423DWF, FO48U, PG32UCDM.' },
    {
      name: 'panel_type', type: 'enum', required: true, from: 'human', label: 'Panel',
      values: ['qd-oled', 'woled', 'other-oled'],
      labels: { 'qd-oled': 'QD-OLED', woled: 'WOLED', 'other-oled': 'Another OLED type, or I do not know' },
    },
    { name: 'size_in', type: 'integer', min: 10, max: 100, from: 'human', label: 'Size (inches)' },
    { name: 'purchase_month', type: 'month', required: true, from: 'human', label: 'Bought', help: 'Year and month, written 2024-03.' },
    { name: 'months_in_use', type: 'integer', required: true, min: 0, max: 180, from: 'human', label: 'Months in regular use' },
    { name: 'panel_hours', type: 'integer', min: 0, max: 100000, from: 'human', label: 'Panel hours', help: 'From the monitor\'s own menu if it shows them. Leave empty if it does not and you would be guessing.' },
    { name: 'hours_source', type: 'enum', from: 'human', label: 'Where the hours come from', values: ['osd', 'estimate'], labels: { osd: 'The monitor\'s menu', estimate: 'My estimate' } },
    {
      name: 'use_mix', type: 'enum', required: true, from: 'human', label: 'What is on it most of the time',
      values: ['mostly-static', 'mixed', 'mostly-moving'],
      labels: { 'mostly-static': 'Desktop and office work, more than half the hours', mixed: 'About even', 'mostly-moving': 'Games and video, more than half the hours' },
    },
    {
      name: 'brightness', type: 'enum', from: 'human', label: 'Brightness',
      values: ['low', 'medium', 'high'],
      labels: { low: 'Bottom third of the slider', medium: 'Middle third', high: 'Top third, or HDR most of the time' },
    },
    {
      name: 'care_cycles', type: 'enum', required: true, from: 'human', label: 'Panel care cycles',
      values: ['as-prompted', 'often-postponed', 'disabled', 'unknown'],
      labels: { 'as-prompted': 'Run when the monitor asks', 'often-postponed': 'Often postponed or interrupted', disabled: 'Turned off', unknown: 'I do not know' },
    },
    {
      name: 'static_mitigation', type: 'enum', from: 'human', label: 'Habits',
      values: ['none', 'taskbar-hidden', 'dark-theme', 'both'],
      labels: { none: 'Neither', 'taskbar-hidden': 'Taskbar hidden', 'dark-theme': 'Dark theme', both: 'Both' },
    },
    { name: 'severity', type: 'integer', required: true, min: 0, max: 4, from: 'human', label: 'What you see', labels: SEVERITY },
    {
      name: 'location', type: 'enum', required: true, from: 'human', label: 'Where',
      values: ['none', 'taskbar', 'static-ui', 'centre', 'whole-panel-tint', 'other'],
      labels: { none: 'Nowhere', taskbar: 'Taskbar edge', 'static-ui': 'A game HUD, window edge or other fixed element', centre: 'Centre of the panel', 'whole-panel-tint': 'A tint across the panel', other: 'Somewhere else' },
    },
    {
      name: 'warranty_claim', type: 'enum', required: true, from: 'human', label: 'Warranty claim for burn-in',
      values: ['none', 'approved', 'denied', 'pending'],
      labels: { none: 'None made', approved: 'Made and approved', denied: 'Made and denied', pending: 'Made, no answer yet' },
    },
    { name: 'notes', type: 'string', maxLength: 280, from: 'human', label: 'Notes' },
    { name: 'submitted_date', type: 'date', required: true, from: 'intake', label: 'The day the report was sent' },
    { name: 'source_issue', type: 'integer', min: 1, from: 'intake', label: 'The issue the row came from' },
  ],

  derive: (row) => ({ ...row }),

  check(row) {
    const errors = [];
    if ((row.severity === '0') !== (row.location === 'none')) {
      errors.push('severity 0 goes with location none, and any other severity names a location');
    }
    if ((row.panel_hours || '') !== '' && (row.hours_source || '') === '') errors.push('panel_hours needs hours_source');
    if ((row.panel_hours || '') === '' && (row.hours_source || '') !== '') errors.push('hours_source is set and panel_hours is empty');
    return errors;
  },

  publish: {
    floor: 5,
    group: (row) => row.panel_type,
    label: (key) => definition.fields.find((f) => f.name === 'panel_type').labels[key] || key,
    counts: (row) => Number(row.months_in_use) >= 1,
    figures(rows) {
      const by = [0, 1, 2, 3, 4].map((s) => rows.filter((r) => Number(r.severity) === s).length);
      const hours = rows.filter((r) => (r.panel_hours || '') !== '' && r.hours_source === 'osd').map((r) => Number(r.panel_hours));
      const out = {
        n: rows.length,
        severity_0: by[0],
        severity_1: by[1],
        severity_2: by[2],
        severity_3: by[3],
        severity_4: by[4],
        months_in_use_median: fixed(median(rows.map((r) => Number(r.months_in_use))), 1),
        rows_with_menu_hours: hours.length,
        claims_approved: rows.filter((r) => r.warranty_claim === 'approved').length,
        claims_denied: rows.filter((r) => r.warranty_claim === 'denied').length,
      };
      if (hours.length >= 5) out.menu_hours_median = fixed(median(hours), 0);
      return out;
    },
  },
};

export default definition;
