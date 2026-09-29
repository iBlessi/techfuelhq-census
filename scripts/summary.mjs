// Writes censuses/<id>/summary.json: report counts per group, and figures only for groups that
// have reached the floor. With --check it writes nothing and fails if a file is out of date.
import { CENSUSES, IDS } from '../lib/censuses.js';
import { summarize } from '../lib/stats.js';
import { readRows, summaryPath, writeText, sameOnDisk } from './common.mjs';

const check = process.argv.includes('--check');
let stale = 0;

for (const id of IDS) {
  const { records } = readRows(id);
  const text = JSON.stringify(summarize(CENSUSES[id], records), null, 2);
  if (check) {
    if (sameOnDisk(summaryPath(id), text)) console.log(`PASS ${id}: summary.json matches the data`);
    else {
      stale += 1;
      console.error(`FAIL ${id}: summary.json does not match the data; run "npm run summary"`);
    }
  } else {
    writeText(summaryPath(id), text);
    console.log(`wrote ${id}: ${records.length} row${records.length === 1 ? '' : 's'}`);
  }
}

process.exit(stale ? 1 : 0);
