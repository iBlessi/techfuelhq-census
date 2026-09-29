// Reads one issue and says what row it would make, or why it cannot make one yet.
import { CENSUSES, IDS } from './censuses.js';
import { buildRow } from './report.js';
import { reportFromIssue, confirmations } from './issue.js';
import { serializeRow } from './csv.js';

export function readIssue(issue, today) {
  const out = { number: issue.number, census: null, ok: false, errors: [], row: null };
  let report;
  try {
    report = reportFromIssue(issue.body);
  } catch (e) {
    out.errors.push(e.message);
    return out;
  }
  const def = CENSUSES[report.census];
  if (!def) {
    out.errors.push(`the report names the census "${report.census}"; the censuses are ${IDS.join(', ')}`);
    return out;
  }
  out.census = def.id;
  const boxes = confirmations(issue.body);
  if (boxes.total > 0 && boxes.ticked < boxes.total) out.errors.push('a box under "Before you send" is not ticked');
  const intake = { submitted_date: String(issue.created_at || '').slice(0, 10), source_issue: issue.number };
  const built = buildRow(def, report, intake, today);
  out.errors.push(...built.errors);
  if (out.errors.length === 0) {
    out.ok = true;
    out.row = built.row;
  }
  return out;
}

export function commentFor(result) {
  if (result.ok) {
    const def = CENSUSES[result.census];
    const header = def.fields.map((f) => f.name);
    return [
      'This report reads cleanly. It makes this row:',
      '',
      '```csv',
      serializeRow(header),
      serializeRow(header.map((h) => result.row[h])),
      '```',
      '',
      'A maintainer looks at every report before it joins the dataset. Nothing more is needed from you unless a question is asked here.',
    ].join('\n');
  }
  return [
    'This report cannot be read yet:',
    '',
    ...result.errors.map((e) => `- ${e}`),
    '',
    'Edit the issue and it is read again. The census page builds the report from your output, so nothing has to be written by hand.',
  ].join('\n');
}
