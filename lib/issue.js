// Finds the report inside the text of an issue opened through one of the issue forms.
import { findObject } from './readers/block.js';

// GitHub writes each form field as "### Label", a blank line, then the value. A textarea with
// render: json arrives inside a fenced block. Returns the text under one heading.
export function section(body, label) {
  const lines = String(body || '').replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `### ${label}`.toLowerCase());
  if (start < 0) return null;
  const out = [];
  for (let n = start + 1; n < lines.length; n += 1) {
    if (/^### \S/.test(lines[n])) break;
    out.push(lines[n]);
  }
  const text = out.join('\n').trim();
  return text === '_No response_' ? '' : text;
}

export function reportFromIssue(body) {
  const under = section(body, 'Report');
  const source = under === null ? String(body || '') : under;
  if (source.trim() === '') throw new Error('the Report box is empty');
  const fenced = /```(?:json)?\s*\n([\s\S]*?)\n```/.exec(source);
  const text = findObject(fenced ? fenced[1] : source);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('the Report box does not hold complete JSON');
  }
}

export function confirmations(body) {
  const lines = String(body || '').split(/\r?\n/).filter((l) => /^\s*- \[[ xX]\]/.test(l));
  return { total: lines.length, ticked: lines.filter((l) => /^\s*- \[[xX]\]/.test(l)).length };
}
