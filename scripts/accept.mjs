// The maintainer's step: add reviewed reports to a census CSV.
//   node scripts/accept.mjs <census> <issue.json> [<issue.json> ...]
// Each file is one issue as the GitHub API returns it (gh api repos/OWNER/REPO/issues/N).
// Nothing is posted anywhere; this only edits the CSV, and refuses a row that is not valid
// or an issue that is already in the data.
import { readFileSync } from 'node:fs';
import { censusOf } from '../lib/censuses.js';
import { readIssue } from '../lib/intake.js';
import { serializeTable } from '../lib/csv.js';
import { validateTable } from '../lib/validate.js';
import { csvPath, readRows, writeText, todayUtc } from './common.mjs';

const [id, ...files] = process.argv.slice(2);
if (!id || files.length === 0) {
  console.error('usage: node scripts/accept.mjs <census> <issue.json> [<issue.json> ...]');
  process.exit(2);
}

const def = censusOf(id);
const table = readRows(id);
const have = new Set(table.records.map((r) => r.source_issue));
let refused = 0;

const taken = [];

for (const file of files) {
  let issue;
  let result;
  try {
    issue = JSON.parse(readFileSync(file, 'utf8'));
    result = readIssue(issue, todayUtc());
  } catch (e) {
    refused += 1;
    console.error(`REFUSED ${file}: it could not be read as an issue`);
    continue;
  }
  if (!result.ok) {
    refused += 1;
    console.error(`REFUSED #${issue.number}: ${result.errors.join('; ')}`);
    continue;
  }
  if (result.census !== id) {
    refused += 1;
    console.error(`REFUSED #${issue.number}: the report is for ${result.census}`);
    continue;
  }
  if (have.has(String(issue.number))) {
    refused += 1;
    console.error(`REFUSED #${issue.number}: already in the data`);
    continue;
  }
  table.records.push(result.row);
  have.add(String(issue.number));
  taken.push(issue.number);
}

table.records.sort((a, b) => Number(a.source_issue || 0) - Number(b.source_issue || 0));
const errors = validateTable(def, table.header, table.records, todayUtc());
if (errors.length) {
  console.error('The data would not be valid, so nothing was written:');
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
writeText(csvPath(id), serializeTable(table.header, table.records));
// Said only now, when the rows are on disk.
for (const n of taken) console.log(`added #${n}`);
console.log(`${id}: ${table.records.length} row${table.records.length === 1 ? '' : 's'} on disk`);
process.exit(refused ? 1 : 0);
