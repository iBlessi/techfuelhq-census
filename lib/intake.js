// Reads one issue and says what row it would make, or why it cannot make one yet.
import { CENSUSES, IDS } from './censuses.js';
import { buildRow } from './report.js';
import { quoted } from './validate.js';
import { reportFromIssue, confirmations, BOXES } from './issue.js';
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
  // Only a census's own name names it: "constructor" and the like are on every object.
  const named = typeof report.census === 'string' && Object.prototype.hasOwnProperty.call(CENSUSES, report.census);
  const def = named ? CENSUSES[report.census] : null;
  if (!def) {
    out.errors.push(`the report names the census ${quoted(report.census, 30)}; the censuses are ${IDS.join(', ')}`);
    return out;
  }
  out.census = def.id;
  if (confirmations(issue.body).ticked < BOXES) out.errors.push('both boxes under "Before you send" have to be ticked');
  const intake = { submitted_date: String(issue.created_at || '').slice(0, 10), source_issue: issue.number };
  const built = buildRow(def, report, intake, today);
  out.errors.push(...built.errors);
  if (out.errors.length === 0) {
    out.ok = true;
    out.row = built.row;
  }
  return out;
}

const MAX_LINES = 30;
const MAX_LINE = 300;

// Everything that quotes a report is posted inside a fenced block, where nothing is read as
// markdown: no heading, link, image or mention. A line cannot close the block, because it holds
// no line break and its backticks are replaced.
function fencedLines(lines) {
  const shown = lines.slice(0, MAX_LINES).map((l) => {
    const one = String(l).replace(/\s+/g, ' ').replace(/`/g, "'").trim();
    return `- ${one.length > MAX_LINE ? `${one.slice(0, MAX_LINE)}...` : one}`;
  });
  if (lines.length > MAX_LINES) shown.push(`- and ${lines.length - MAX_LINES} more`);
  return shown;
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
      // A row is one line with a comma in it, so it cannot be read as the end of the block.
      serializeRow(header.map((h) => result.row[h])),
      '```',
      '',
      'A maintainer looks at every report before it joins the dataset. Nothing more is needed from you unless a question is asked here.',
    ].join('\n');
  }
  return [
    'This report cannot be read yet:',
    '',
    '```text',
    ...fencedLines(result.errors),
    '```',
    '',
    'Edit the issue and it is read again. The census page builds the report from your output, so nothing has to be written by hand.',
  ].join('\n');
}
