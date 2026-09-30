// Row validation against a census definition. Every value in a row is a string, as it is in the CSV;
// an empty string means the field was left out.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const INTEGER = /^-?\d+$/;
const NUMBER = /^-?\d+(\.\d+)?$/;
// A spreadsheet that opens the CSV runs a cell starting with one of these as a formula.
const FORMULA_START = /^[=+\-@]/;
// Control characters, the line and paragraph separators, a byte order mark, and the marks that
// reorder text on screen. None of them prints, and any of them can make a row read as it is not.
const UNPRINTABLE = '\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069\\ufeff';
const HAS_UNPRINTABLE = new RegExp(`[${UNPRINTABLE}]`);
const ALL_UNPRINTABLE = new RegExp(`[${UNPRINTABLE}]+`, 'g');

function realDate(s) {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// What a report said, quoted back inside a message: on one line, with nothing unprintable, and
// cut short if it is long. Messages are shown on the census pages and posted on issues.
export function quoted(value, max = 60) {
  const s = String(value).replace(ALL_UNPRINTABLE, ' ').replace(/\s+/g, ' ').trim();
  return `"${s.length > max ? `${s.slice(0, max)}...` : s}"`;
}

export function checkField(field, raw, today) {
  const value = raw === undefined || raw === null ? '' : String(raw);
  if (value === '') return field.required ? [`${field.name}: required`] : [];
  if (value !== value.trim()) return [`${field.name}: leading or trailing space`];
  if (/[\r\n\t]/.test(value)) return [`${field.name}: line break or tab`];
  if (HAS_UNPRINTABLE.test(value)) return [`${field.name}: holds a character that does not print`];
  const errors = [];
  switch (field.type) {
    case 'enum':
      if (!field.values.includes(value)) {
        errors.push(`${field.name}: ${quoted(value)} is not one of ${field.values.join(', ')}`);
      }
      break;
    case 'integer':
    case 'number': {
      const ok = field.type === 'integer' ? INTEGER.test(value) : NUMBER.test(value);
      if (!ok) {
        errors.push(`${field.name}: ${quoted(value)} is not ${field.type === 'integer' ? 'a whole number' : 'a number'}`);
        break;
      }
      const n = Number(value);
      if (field.min !== undefined && n < field.min) errors.push(`${field.name}: ${value} is below ${field.min}`);
      if (field.max !== undefined && n > field.max) errors.push(`${field.name}: ${value} is above ${field.max}`);
      if (field.type === 'number' && field.decimals !== undefined) {
        const places = (value.split('.')[1] || '').length;
        if (places > field.decimals) errors.push(`${field.name}: more than ${field.decimals} decimal places`);
      }
      break;
    }
    case 'date':
      if (!DATE.test(value) || !realDate(value)) {
        errors.push(`${field.name}: ${quoted(value)} is not a date written YYYY-MM-DD`);
      } else if (today && value > today) {
        errors.push(`${field.name}: ${value} is in the future`);
      }
      break;
    case 'month':
      if (!MONTH.test(value) || !realDate(`${value}-01`)) {
        errors.push(`${field.name}: ${quoted(value)} is not a month written YYYY-MM`);
      } else if (today && value > today.slice(0, 7)) {
        errors.push(`${field.name}: ${value} is in the future`);
      }
      break;
    case 'string':
      if (FORMULA_START.test(value)) {
        errors.push(`${field.name}: starts with ${value[0]}, which a spreadsheet reads as a formula. Start with a letter or a digit`);
      }
      if (field.maxLength !== undefined && value.length > field.maxLength) {
        errors.push(`${field.name}: longer than ${field.maxLength} characters`);
      }
      if (field.pattern && !new RegExp(field.pattern).test(value)) {
        errors.push(`${field.name}: ${quoted(value)} does not match ${field.pattern}`);
      }
      break;
    default:
      errors.push(`${field.name}: unknown field type ${field.type}`);
  }
  return errors;
}

// Names a report used that the census does not have, as one message however many there are.
export function unknownNames(def, names) {
  const known = new Set(def.fields.map((f) => f.name));
  const unknown = names.filter((n) => !known.has(n));
  if (unknown.length === 0) return [];
  if (unknown.length <= 5) return unknown.map((n) => `${quoted(n, 40)} is not a field of the ${def.id} census`);
  return [`${unknown.length} names are not fields of the ${def.id} census, among them ${unknown.slice(0, 3).map((n) => quoted(n, 40)).join(', ')}`];
}

// Returns a list of plain sentences. An empty list means the row is valid.
export function validateRow(def, row, today) {
  const errors = unknownNames(def, Object.keys(row));
  for (const field of def.fields) errors.push(...checkField(field, row[field.name], today));
  if (errors.length === 0 && def.check) errors.push(...def.check(row));
  return errors;
}

export function validateTable(def, header, records, today) {
  const errors = [];
  const expected = def.fields.map((f) => f.name);
  if (header.join(',') !== expected.join(',')) {
    errors.push(`header does not match the definition. Expected: ${expected.join(',')}`);
    return errors;
  }
  const seen = new Map();
  records.forEach((row, k) => {
    for (const e of validateRow(def, row, today)) errors.push(`row ${k + 2}: ${e}`);
    if (row.source_issue) {
      if (seen.has(row.source_issue)) {
        errors.push(`row ${k + 2}: source_issue ${row.source_issue} already used on row ${seen.get(row.source_issue)}`);
      } else {
        seen.set(row.source_issue, k + 2);
      }
    }
  });
  return errors;
}

// Number formatting used everywhere a derived value is written into a row, so that a value
// computed in the browser and the same value recomputed by the validator print alike.
export function fixed(n, decimals) {
  if (!Number.isFinite(n)) throw new Error(`cannot format ${n}`);
  const s = n.toFixed(decimals);
  return Number(s) === 0 ? (0).toFixed(decimals) : s;
}

export function near(a, b, tolerance) {
  return Math.abs(Number(a) - Number(b)) <= tolerance + 1e-9;
}
