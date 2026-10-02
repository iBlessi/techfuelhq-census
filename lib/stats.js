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

// A quantile by deterministic linear interpolation between adjacent sorted values. The rank is
// (n - 1) * p, so Q1 and Q3 are the values one quarter and three quarters of the way through
// the observed rows. No population estimate is made.
export function quantile(values, p) {
  if (values.length === 0) return null;
  if (!Number.isFinite(p) || p < 0 || p > 1) throw new RangeError('a quantile is between 0 and 1');
  const s = sorted(values);
  const rank = (s.length - 1) * p;
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return s[low];
  return s[low] + (s[high] - s[low]) * (rank - low);
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

// One grouping: every group with its count, and the published figures only where the group has
// reached the floor. A group below the floor is "collecting" and carries no figures.
function groupSummary(view, rows) {
  const counted = rows.filter((r) => view.counts(r));
  const groups = new Map();
  for (const row of rows) {
    const key = view.group(row);
    if (!groups.has(key)) groups.set(key, { key, reports: 0, all: [], rows: [] });
    const g = groups.get(key);
    g.reports += 1;
    g.all.push(row);
    if (view.counts(row)) g.rows.push(row);
  }
  const out = [];
  for (const g of groups.values()) {
    // A label may depend on the rows: a seller is shown as most of its reports spell it.
    const entry = { key: g.key, label: view.label(g.key, g.all), reports: g.reports, counted: g.rows.length };
    if (g.rows.length >= view.floor) {
      entry.state = 'published';
      entry.figures = view.figures(g.rows);
    } else {
      entry.state = 'collecting';
    }
    out.push(entry);
  }
  out.sort((a, b) => b.counted - a.counted || b.reports - a.reports || a.key.localeCompare(b.key));
  return {
    floor: view.floor,
    reports: rows.length,
    counted: counted.length,
    groups: out,
  };
}

// One census summary. Existing definitions have one primary grouping. A definition may also
// declare named rollups with their own grouping and floor; definitions without them retain the
// exact summary shape they had before rollups existed.
export function summarize(def, rows) {
  const primary = groupSummary(def.publish, rows);
  const summary = {
    census: def.id,
    version: def.version,
    ...primary,
  };
  const rollups = (def.publish.rollups || []).map((view) => ({
    id: view.id,
    label: view.labelForView,
    ...groupSummary(view, rows),
  }));
  if (rollups.length) summary.rollups = rollups;
  return summary;
}
