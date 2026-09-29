// RFC 4180 CSV, enough of it for these datasets: quoted fields, doubled quotes,
// commas and line breaks inside quotes, CRLF or LF. No dependencies, runs in Node and in a browser.

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  while (i < src.length) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"' && field === '') {
      quoted = true;
      i += 1;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (c === '\r' || c === '\n') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (quoted) throw new Error('CSV ends inside a quoted field');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Rows as objects keyed by the header. A row whose length differs from the header is an error,
// reported with its 1-based line position in the parsed table.
export function parseTable(text) {
  const rows = parseCsv(text).filter((r) => !(r.length === 1 && r[0] === ''));
  if (rows.length === 0) throw new Error('CSV has no header row');
  const header = rows[0];
  const records = [];
  for (let n = 1; n < rows.length; n += 1) {
    const r = rows[n];
    if (r.length !== header.length) {
      throw new Error(`row ${n + 1} has ${r.length} fields, the header has ${header.length}`);
    }
    const o = {};
    header.forEach((h, k) => {
      o[h] = r[k];
    });
    records.push(o);
  }
  return { header, records };
}

export function escapeField(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function serializeRow(values) {
  return values.map(escapeField).join(',');
}

export function serializeTable(header, records) {
  const lines = [serializeRow(header)];
  for (const r of records) lines.push(serializeRow(header.map((h) => r[h])));
  return `${lines.join('\n')}\n`;
}
