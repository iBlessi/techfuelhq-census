// A report block is one JSON object. People paste it with the command echoed above it, a prompt
// line under it, a trailing newline, or wrapped by the terminal; this finds the object and
// nothing else.

const MAX_TRIES = 64;

// The index of the brace that closes the one at `start`, or -1 if the text ends first.
function closing(src, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < src.length; i += 1) {
    const c = src[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// A terminal that wraps a long line can insert line breaks inside the JSON. Breaks between
// tokens are harmless; a break inside a string is removed so the value reads as it was printed.
function parsed(raw) {
  for (const candidate of [raw, raw.replace(/\r?\n/g, '')]) {
    try {
      const value = JSON.parse(candidate);
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value;
    } catch (e) {
      // Not JSON as it stands; the next form is tried.
    }
  }
  return undefined;
}

// Every JSON object that stands on its own in the text, in order. An opening brace that does
// not start one, such as the @{ of an echoed PowerShell command, is passed over.
export function objectsIn(text, limit = 8) {
  const src = String(text || '').replace(/^﻿/, '');
  const found = [];
  let cut = false;
  let tries = 0;
  let from = src.indexOf('{');
  while (from >= 0 && found.length < limit && tries < MAX_TRIES) {
    tries += 1;
    const end = closing(src, from);
    if (end < 0) {
      cut = true;
      from = src.indexOf('{', from + 1);
      continue;
    }
    const value = parsed(src.slice(from, end + 1));
    if (value === undefined) {
      from = src.indexOf('{', from + 1);
      continue;
    }
    found.push({ value, text: src.slice(from, end + 1) });
    from = src.indexOf('{', end + 1);
  }
  return { found, cut, any: src.indexOf('{') >= 0 };
}

export function readObject(text) {
  const { found, cut, any } = objectsIn(text, 1);
  if (found.length) return found[0].value;
  if (!any) throw new Error('I cannot find the output. It starts with { and ends with }.');
  if (cut) throw new Error('The output is cut off: it opens with { and never closes. Copy the whole line.');
  throw new Error('The output is not complete JSON. Copy the whole line the command printed.');
}

export function parseBlock(text, census) {
  const value = readObject(text);
  if (value.census !== census) {
    throw new Error(typeof value.census === 'string' && /^[a-z-]{3,20}$/.test(value.census)
      ? `This output is for the ${value.census} census, and this page takes ${census}.`
      : `This is not the output of the ${census} command.`);
  }
  if (value.v !== 1) throw new Error('This output is in a format this page does not read. This page reads format 1.');
  return value;
}

export function text(value, max) {
  return String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

export function whole(value, name) {
  const n = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : NaN;
  if (!Number.isFinite(n) || Math.round(n) !== n) throw new Error(`${name} is not a whole number in this output.`);
  return String(n);
}
