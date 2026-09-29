// The few statistics the censuses publish. Every function takes plain numbers.

export function sorted(values) {
  return [...values].sort((a, b) => a - b);
}

export function median(values) {
  if (values.length === 0) return null;
  const s = sorted(values);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function mean(values) {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function range(values) {
  if (values.length === 0) return { min: null, max: null };
  const s = sorted(values);
  return { min: s[0], max: s[s.length - 1] };
}

export function countBy(items, keyOf) {
  const counts = new Map();
  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

// One census summary: every group with its count, and the published figures only where the
// group has reached the floor. A group below the floor is "collecting" and carries no figures.
export function summarize(def, rows) {
  const counted = rows.filter((r) => def.publish.counts(r));
  const groups = new Map();
  for (const row of rows) {
    const key = def.publish.group(row);
    if (!groups.has(key)) groups.set(key, { key, reports: 0, all: [], rows: [] });
    const g = groups.get(key);
    g.reports += 1;
    g.all.push(row);
    if (def.publish.counts(row)) g.rows.push(row);
  }
  const out = [];
  for (const g of groups.values()) {
    // A label may depend on the rows: a seller is shown as most of its reports spell it.
    const entry = { key: g.key, label: def.publish.label(g.key, g.all), reports: g.reports, counted: g.rows.length };
    if (g.rows.length >= def.publish.floor) {
      entry.state = 'published';
      entry.figures = def.publish.figures(g.rows);
    } else {
      entry.state = 'collecting';
    }
    out.push(entry);
  }
  out.sort((a, b) => b.counted - a.counted || b.reports - a.reports || a.key.localeCompare(b.key));
  return {
    census: def.id,
    version: def.version,
    floor: def.publish.floor,
    reports: rows.length,
    counted: counted.length,
    groups: out,
  };
}
