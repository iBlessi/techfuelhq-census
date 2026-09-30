// A report is what one person sends: { census, v: 1, fields: { name: value, ... } }.
// A row is what the dataset keeps: every field of the definition, as a string, in order.
import { validateRow, unknownNames, quoted } from './validate.js';
import { REPO } from './censuses.js';

export const REPORT_VERSION = 1;

export function makeReport(def, fields) {
  const out = {};
  for (const f of def.fields) {
    if (f.from === 'intake' || f.from === 'derived') continue;
    const v = fields[f.name];
    if (v === undefined || v === null || String(v).trim() === '') continue;
    out[f.name] = String(v).replace(/\s+/g, ' ').trim();
  }
  return { census: def.id, v: REPORT_VERSION, fields: out };
}

// Builds the row a report makes. Derived fields are computed here and never taken from the
// report; a report that carries one must agree with what its own values give.
export function buildRow(def, report, intake = {}, today) {
  const errors = [];
  if (!report || typeof report !== 'object' || Array.isArray(report)) return { row: null, errors: ['the report is not a JSON object'] };
  if (report.census !== def.id) errors.push(`the report is for ${quoted(report.census, 30)} and this is the ${def.id} census`);
  if (report.v !== REPORT_VERSION) errors.push(`the report is format ${quoted(report.v, 12)}; this repository reads format ${REPORT_VERSION}`);
  const given = report.fields;
  if (!given || typeof given !== 'object' || Array.isArray(given)) {
    errors.push('the report has no "fields" object');
    return { row: null, errors };
  }
  const byName = new Map(def.fields.map((f) => [f.name, f]));
  errors.push(...unknownNames(def, Object.keys(given)));
  for (const key of Object.keys(given)) {
    const f = byName.get(key);
    if (!f) continue;
    if (f.from === 'intake') errors.push(`${key}: set by the maintainer, not by a report`);
    else if (typeof given[key] === 'object' && given[key] !== null) errors.push(`${key}: a value, not a list or an object`);
  }
  if (errors.length) return { row: null, errors };

  let row = {};
  for (const f of def.fields) {
    if (f.from === 'intake') row[f.name] = intake[f.name] === undefined ? '' : String(intake[f.name]);
    else if (f.from === 'derived') row[f.name] = '';
    else row[f.name] = given[f.name] === undefined || given[f.name] === null ? '' : String(given[f.name]).trim();
  }
  // Required plain fields first, so derive() never runs on missing numbers.
  const plain = def.fields.filter((f) => f.from !== 'derived');
  const early = validateRow({ ...def, fields: plain, check: null }, pick(row, plain), today);
  if (early.length) return { row: null, errors: early };

  let derived;
  try {
    derived = def.derive(row);
  } catch (e) {
    // The message is one of this library's own and quotes nothing from the report.
    return { row: null, errors: [`the values do not work together: ${e.message}`] };
  }
  for (const f of def.fields) {
    if (f.from !== 'derived') continue;
    const claimed = given[f.name];
    if (claimed !== undefined && String(claimed).trim() !== derived[f.name]) {
      errors.push(`${f.name}: the report says ${quoted(claimed, 20)} and its values give ${derived[f.name]}`);
    }
  }
  row = {};
  for (const f of def.fields) row[f.name] = derived[f.name] === undefined ? '' : derived[f.name];
  errors.push(...validateRow(def, row, today));
  return { row: errors.length ? null : row, errors };
}

function pick(row, fields) {
  const out = {};
  for (const f of fields) out[f.name] = row[f.name];
  return out;
}

export function formUrl(def) {
  return `https://github.com/${REPO}/issues/new?template=${def.id}.yml`;
}

export function issueUrl(def, report, title) {
  const q = new URLSearchParams();
  q.set('template', `${def.id}.yml`);
  q.set('title', title);
  q.set('report', JSON.stringify(report));
  return `https://github.com/${REPO}/issues/new?${q.toString()}`;
}

// GitHub answers 500 once an address passes about 6,900 characters and 414 past about 8,300
// (measured signed out on a public repository's new-issue page, 2026-09-29). A visitor who is
// signed out is sent to the sign-in page with the whole link encoded again inside that page's
// address, so the longer address is the one that has to fit.
export const LINK_LIMIT = 6000;

export function linkFits(url) {
  return `https://github.com/login?return_to=${encodeURIComponent(url)}`.length <= LINK_LIMIT;
}
