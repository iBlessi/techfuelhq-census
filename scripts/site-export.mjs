// Copies what the TechFuelHQ site needs from this repository into a checkout of the site:
//   assets/js/census/vendor/   the library and the five definitions, byte for byte
//   assets/js/census/vendor/VENDOR.json   the commit they came from and a hash of each file
//   data/census/<id>.json      the fields, commands and summary each page prints
//   tests/census/fixtures/     the real output the site's browser tests paste in
//
//   node scripts/site-export.mjs <path to the site checkout>
//
// It refuses to export from a working tree with uncommitted changes, so the commit recorded
// in VENDOR.json always names the exact text that was copied. When the site checkout carries
// ops/scripts/checks/census_pages_check.py, that check is run afterwards with --source pointed
// at this checkout, which holds every copied file to this commit's file.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
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
// The same real output the repository's own tests read, for the site's browser tests, with
// the note that says where each file came from and under what licence.
const FIXTURES = [
  'README.md',
  'pin-current/astral-hwmon-burn-2hz.csv',
  'pin-current/12vhpwr-guard-flight-made-up.csv',
  'drive-arrival/exos-20tb-smartctl-a.txt',
  'drive-arrival/exos-20tb-farm.txt',
  'drive-arrival/wd-14tb-smartctl-a.json',
  'post-time/windows-7800x3d-b650.json',
  'windows-memory/windows-32gb-in-use.json',
];
const fixtureDir = join(site, 'tests', 'census', 'fixtures');
rmSync(fixtureDir, { recursive: true, force: true });
for (const rel of FIXTURES) {
  const text = readFileSync(join(ROOT, 'test', 'fixtures', rel), 'utf8').replace(/\r\n/g, '\n');
  const dest = join(fixtureDir, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, text, 'utf8');
  files[`test/fixtures/${rel}`] = createHash('sha256').update(text, 'utf8').digest('hex');
}

const dataDir = join(site, 'data', 'census');
rmSync(dataDir, { recursive: true, force: true });
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
    // An ordered list, because a template that walks a map sorts its keys.
    figures: Object.entries(def.publish.figureLabels).map(([key, label]) => ({ key, label })),
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
  const text = `${JSON.stringify(out, null, 2)}\n`;
  writeFileSync(join(dataDir, `${id}.json`), text, 'utf8');
  // The data a page prints is held to a hash like the code, so a command or a count edited
  // in the site's copy is seen.
  files[`data/${id}.json`] = createHash('sha256').update(text, 'utf8').digest('hex');
}

// Last, once every file it lists is written.
writeFileSync(
  join(vendor, 'VENDOR.json'),
  `${JSON.stringify({ repo: REPO, commit, dirty: Boolean(dirty), files }, null, 2)}\n`,
  'utf8',
);

console.log(`exported ${Object.keys(files).length} files, ${IDS.length} of them data files, from ${commit.slice(0, 8)}`);

// The site's own check, run the one way that can see a copy and its manifest changed together:
// against this checkout at the commit just recorded.
const check = join(site, 'ops', 'scripts', 'checks', 'census_pages_check.py');
if (existsSync(check)) {
  const pythons = process.platform === 'win32'
    ? ['C:/Techfuel/qdrant-venv/Scripts/python.exe', 'python', 'py']
    : ['python3', 'python'];
  let ran = false;
  for (const python of pythons) {
    const args = python === 'py' ? ['-3', check, '--source', ROOT] : [check, '--source', ROOT];
    const done = spawnSync(python, args, { cwd: site, stdio: 'inherit', env: { ...process.env, PYTHONUTF8: '1' } });
    if (done.error) continue;
    ran = true;
    if (done.status !== 0) {
      console.error("The site's census check failed against this export. Nothing more to do here until it passes.");
      process.exit(done.status || 1);
    }
    break;
  }
  if (!ran) console.error("No python found, so the site's census check was not run. Run it there: python ops/scripts/checks/census_pages_check.py --source " + ROOT);
}
