// The labels this repository depends on, from .github/labels.json.
//   node scripts/labels.mjs            lists them and says which are missing on GitHub
//   node scripts/labels.mjs --apply    creates the missing ones and updates the rest
//
// An issue form adds a label only if the label exists, and the read-report workflow runs only
// on an issue that carries "report". Without these labels a report is opened and never read.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { REPO } from '../lib/censuses.js';
import { ROOT } from './common.mjs';

export const LABELS = JSON.parse(readFileSync(join(ROOT, '.github', 'labels.json'), 'utf8'));

function main() {
  const apply = process.argv.includes('--apply');
  const gh = (args) => execFileSync('gh', args, { encoding: 'utf8' });
  const have = new Set(JSON.parse(gh(['label', 'list', '-R', REPO, '--limit', '200', '--json', 'name'])).map((l) => l.name));
  let missing = 0;
  for (const l of LABELS) {
    if (apply) {
      gh(['label', 'create', l.name, '-R', REPO, '--color', l.color, '--description', l.description, '--force']);
      console.log(`${have.has(l.name) ? 'updated' : 'created'} ${l.name}`);
    } else if (have.has(l.name)) {
      console.log(`present ${l.name}`);
    } else {
      missing += 1;
      console.log(`MISSING ${l.name}`);
    }
  }
  if (!apply && missing) {
    console.error(`${missing} label${missing === 1 ? ' is' : 's are'} missing. Run: node scripts/labels.mjs --apply`);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/labels.mjs')) main();
