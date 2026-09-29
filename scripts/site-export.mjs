// Copies what the TechFuelHQ site needs from this repository into a checkout of the site:
//   assets/js/census/vendor/   the library and the five definitions, byte for byte
//   assets/js/census/vendor/VENDOR.json   the commit they came from and a hash of each file
//   data/census/<id>.json      the fields, commands and summary each page prints
//
//   node scripts/site-export.mjs <path to the site checkout>
//
// It refuses to export from a working tree with uncommitted changes, so the commit recorded
// in VENDOR.json always names the exact text that was copied.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, dirname, relative } from 'node:path';
import { CENSUSES, IDS, REPO } from '../lib/censuses.js';
import { summarize } from '../lib/stats.js';
import { allowed, SOURCE } from './docs.mjs';
import { ROOT, readRows } from './common.mjs';

const site = process.argv[2];
if (!site) {
  console.error('usage: node scripts/site-export.mjs <path to the site checkout>');
  process.exit(2);
}

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const dirty = git(['status', '--porcelain']);
if (dirty && !process.argv.includes('--allow-dirty')) {
  console.error('This repository has uncommitted changes. Commit them, then export:');
  console.error(dirty);
  process.exit(1);
}
const commit = git(['rev-parse', 'HEAD']);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const vendor = join(site, 'assets', 'js', 'census', 'vendor');
rmSync(vendor, { recursive: true, force: true });
const sources = [
  ...walk(join(ROOT, 'lib')),
  ...IDS.map((id) => join(ROOT, 'censuses', id, 'definition.js')),
];
const files = {};
for (const src of sources.sort()) {
  const rel = relative(ROOT, src).replace(/\\/g, '/');
  const text = readFileSync(src, 'utf8').replace(/\r\n/g, '\n');
  const dest = join(vendor, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, text, 'utf8');
  files[rel] = createHash('sha256').update(text, 'utf8').digest('hex');
}
writeFileSync(
  join(vendor, 'VENDOR.json'),
  `${JSON.stringify({ repo: REPO, commit, dirty: Boolean(dirty), files }, null, 2)}\n`,
  'utf8',
);

const dataDir = join(site, 'data', 'census');
mkdirSync(dataDir, { recursive: true });
for (const id of IDS) {
  const def = CENSUSES[id];
  const module = await import(`../censuses/${id}/definition.js`);
  const { records } = readRows(id);
  const out = {
    id: def.id,
    name: def.name,
    version: def.version,
    page: def.page,
    unit: def.unit,
    about: def.about,
    counted: def.counted,
    floor: def.publish.floor,
    repo: REPO,
    commit,
    csv: `https://raw.githubusercontent.com/${REPO}/main/censuses/${id}/data/submissions.csv`,
    form: `https://github.com/${REPO}/issues/new?template=${id}.yml`,
    folder: `https://github.com/${REPO}/tree/main/censuses/${id}`,
    commands: {
      windows: module.WINDOWS_COMMAND || '',
      linux: module.LINUX_COMMAND || '',
    },
    fields: def.fields.map((f) => ({
      name: f.name,
      required: Boolean(f.required),
      from: f.from,
      source: SOURCE[f.from],
      allowed: allowed(f),
      label: f.label || '',
      help: f.help || '',
      values: f.labels ? Object.entries(f.labels).map(([value, meaning]) => ({ value, meaning })) : [],
    })),
    summary: summarize(def, records),
  };
  writeFileSync(join(dataDir, `${id}.json`), `${JSON.stringify(out, null, 2)}\n`, 'utf8');
}

console.log(`exported ${Object.keys(files).length} library files and ${IDS.length} data files from ${commit.slice(0, 8)}`);
