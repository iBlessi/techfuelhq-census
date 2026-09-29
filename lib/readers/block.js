// A report block is one JSON object. People paste it with a prompt line above it, a trailing
// newline, or wrapped by the terminal; this finds the object and nothing else.

export function findObject(text) {
  const src = String(text || '');
  const start = src.indexOf('{');
  if (start < 0) throw new Error('I cannot find the output. It starts with { and ends with }.');
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
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('The output is cut off: it opens with { and never closes. Copy the whole line.');
}

// A terminal that wraps a long line can insert line breaks inside the JSON. Breaks between
// tokens are harmless; a break inside a string is removed so the value reads as it was printed.
export function parseBlock(text, census) {
  const raw = findObject(text);
  let value;
  try {
    value = JSON.parse(raw);
  } catch (first) {
    try {
      value = JSON.parse(raw.replace(/\r?\n/g, ''));
    } catch (second) {
      throw new Error('The output is not complete JSON. Copy the whole line the command printed.');
    }
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The output is not a single JSON object.');
  }
  if (value.census !== census) {
    throw new Error(value.census
      ? `This output is for the ${value.census} census, and this page takes ${census}.`
      : `This is not the output of the ${census} command.`);
  }
  if (value.v !== 1) throw new Error(`This output is format ${value.v}. This page reads format 1.`);
  return value;
}

export function text(value, max) {
  return String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

export function whole(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n) || Math.round(n) !== n) throw new Error(`${name} is not a whole number in this output.`);
  return String(n);
}
