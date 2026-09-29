// Row validation against a census definition. Every value in a row is a string, as it is in the CSV;
// an empty string means the field was left out.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const INTEGER = /^-?\d+$/;
const NUMBER = /^-?\d+(\.\d+)?$/;

function realDate(s) {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function checkField(field, raw, today) {
  const value = raw === undefined || raw === null ? '' : String(raw);
  if (value === '') return field.required ? [`${field.name}: required`] : [];
  if (value !== value.trim()) return [`${field.name}: leading or trailing space`];
  if (/[\r\n\t]/.test(value)) return [`${field.name}: line break or tab`];
  const errors = [];
  switch (field.type) {
    case 'enum':
      if (!field.values.includes(value)) {
        errors.push(`${field.name}: "${value}" is not one of ${field.values.join(', ')}`);
      }
      break;
    case 'integer':
    case 'number': {
      const ok = field.type === 'integer' ? INTEGER.test(value) : NUMBER.test(value);
      if (!ok) {
        errors.push(`${field.name}: "${value}" is not ${field.type === 'integer' ? 'a whole number' : 'a number'}`);
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
        errors.push(`${field.name}: "${value}" is not a date written YYYY-MM-DD`);
      } else if (today && value > today) {
        errors.push(`${field.name}: ${value} is in the future`);
      }
      break;
    case 'month':
      if (!MONTH.test(value) || !realDate(`${value}-01`)) {
        errors.push(`${field.name}: "${value}" is not a month written YYYY-MM`);
      } else if (today && value > today.slice(0, 7)) {
        errors.push(`${field.name}: ${value} is in the future`);
      }
      break;
    case 'string':
      if (field.maxLength !== undefined && value.length > field.maxLength) {
        errors.push(`${field.name}: longer than ${field.maxLength} characters`);
      }
      if (field.pattern && !new RegExp(field.pattern).test(value)) {
        errors.push(`${field.name}: "${value}" does not match ${field.pattern}`);
      }
      break;
    default:
      errors.push(`${field.name}: unknown field type ${field.type}`);
  }
  return errors;
}

// Returns a list of plain sentences. An empty list means the row is valid.
export function validateRow(def, row, today) {
  const errors = [];
  const known = new Set(def.fields.map((f) => f.name));
  for (const key of Object.keys(row)) {
    if (!known.has(key)) errors.push(`${key}: not a field of the ${def.id} census`);
  }
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
