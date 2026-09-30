// Reads the issue in a GitHub event and writes what the workflow posts back.
//   node scripts/intake.mjs <event.json> <comment-out.md>
// Prints one line of JSON: { ok, census, labels }. The issue's text is only ever parsed as data.
import { readFileSync, writeFileSync } from 'node:fs';
import { readIssue, commentFor } from '../lib/intake.js';
import { latestToday } from './common.mjs';

const [eventPath, commentPath] = process.argv.slice(2);
if (!eventPath || !commentPath) {
  console.error('usage: node scripts/intake.mjs <event.json> <comment-out.md>');
  process.exit(2);
}

const event = JSON.parse(readFileSync(eventPath, 'utf8'));
const issue = event.issue;
if (!issue) {
  console.error('the event carries no issue');
  process.exit(2);
}

const result = readIssue(issue, latestToday());
writeFileSync(commentPath, `${commentFor(result)}\n`, 'utf8');

const labels = [];
if (result.census) labels.push(`census:${result.census}`);
labels.push(result.ok ? 'reads-cleanly' : 'needs-a-fix');
console.log(JSON.stringify({ ok: result.ok, census: result.census, labels, remove: result.ok ? 'needs-a-fix' : 'reads-cleanly' }));
