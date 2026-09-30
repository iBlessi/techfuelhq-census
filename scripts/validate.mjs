// Validates every census CSV against its definition. Exit 0 when every row is valid.
//   node scripts/validate.mjs              all five
//   node scripts/validate.mjs post-time    one
import { CENSUSES, IDS } from '../lib/censuses.js';
import { validateTable } from '../lib/validate.js';
import { readRows, latestToday } from './common.mjs';

const wanted = process.argv.slice(2);
const ids = wanted.length ? wanted : IDS;
let failed = 0;

for (const id of ids) {
  const def = CENSUSES[id];
  if (!def) {
    console.error(`FAIL ${id}: there is no census with this name`);
    failed += 1;
    continue;
  }
  let table;
  try {
    table = readRows(id);
  } catch (e) {
    console.error(`FAIL ${id}: ${e.message}`);
    failed += 1;
    continue;
  }
  const errors = validateTable(def, table.header, table.records, latestToday());
  if (errors.length) {
    failed += 1;
    console.error(`FAIL ${id}: ${errors.length} problem${errors.length === 1 ? '' : 's'}`);
    for (const e of errors) console.error(`  ${e}`);
  } else {
    console.log(`PASS ${id}: ${table.records.length} row${table.records.length === 1 ? '' : 's'}`);
  }
}

process.exit(failed ? 1 : 0);
