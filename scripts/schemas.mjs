// Writes censuses/<id>/schema.json, a JSON Schema for one row, from the definition.
// With --check it writes nothing and fails if a file is out of date.
import { CENSUSES, IDS } from '../lib/censuses.js';
import { schemaPath, writeText, sameOnDisk } from './common.mjs';

export function schemaOf(def) {
  const properties = {};
  const required = [];
  for (const f of def.fields) {
    const p = {};
    if (f.label) p.title = f.label;
    if (f.help) p.description = f.help;
    if (f.type === 'enum') {
      p.type = 'string';
      p.enum = f.values;
    } else if (f.type === 'integer' || f.type === 'number') {
      p.type = f.type;
      if (f.min !== undefined) p.minimum = f.min;
      if (f.max !== undefined) p.maximum = f.max;
      if (f.labels) p['x-anchors'] = f.labels;
    } else if (f.type === 'date') {
      p.type = 'string';
      p.format = 'date';
    } else if (f.type === 'month') {
      p.type = 'string';
      p.pattern = '^[0-9]{4}-[0-9]{2}$';
    } else {
      p.type = 'string';
      if (f.maxLength !== undefined) p.maxLength = f.maxLength;
      if (f.pattern) p.pattern = f.pattern;
    }
    p['x-source'] = f.from;
    properties[f.name] = p;
    if (f.required) required.push(f.name);
  }
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `https://raw.githubusercontent.com/iBlessi/techfuelhq-census/main/censuses/${def.id}/schema.json`,
    title: def.name,
    description: `One row is ${def.unit}. In the CSV every value is text and an empty cell means the field was left out. Dataset version ${def.version}.`,
    type: 'object',
    additionalProperties: false,
    properties,
    required,
  };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/schemas.mjs');
if (isMain) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const id of IDS) {
    const text = JSON.stringify(schemaOf(CENSUSES[id]), null, 2);
    if (check) {
      if (sameOnDisk(schemaPath(id), text)) console.log(`PASS ${id}: schema.json matches the definition`);
      else {
        stale += 1;
        console.error(`FAIL ${id}: schema.json does not match the definition; run "npm run schemas"`);
      }
    } else {
      writeText(schemaPath(id), text);
      console.log(`wrote ${id}`);
    }
  }
  process.exit(stale ? 1 : 0);
}
