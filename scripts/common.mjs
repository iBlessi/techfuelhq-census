// File paths and small helpers shared by the scripts. Node only.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseTable } from '../lib/csv.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const csvPath = (id) => join(ROOT, 'censuses', id, 'data', 'submissions.csv');
export const summaryPath = (id) => join(ROOT, 'censuses', id, 'summary.json');
export const schemaPath = (id) => join(ROOT, 'censuses', id, 'schema.json');

export function readText(path) {
  return readFileSync(path, 'utf8');
}

export function readRows(id) {
  return parseTable(readText(csvPath(id)));
}

// Writes with LF line endings and one trailing newline, whatever the platform.
export function writeText(path, text) {
  writeFileSync(path, `${text.replace(/\r\n/g, '\n').replace(/\n+$/, '')}\n`, 'utf8');
}

export function sameOnDisk(path, text) {
  if (!existsSync(path)) return false;
  const want = `${text.replace(/\r\n/g, '\n').replace(/\n+$/, '')}\n`;
  return readText(path).replace(/\r\n/g, '\n') === want;
}

export function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}
