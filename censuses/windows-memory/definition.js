// Windows idle memory census. One row is one machine, read once with the counters Windows keeps.
import { fixed, near } from '../../lib/validate.js';
import { median, range } from '../../lib/stats.js';

// Printed by Windows PowerShell 5.1 and later. Reads WMI; writes nothing; carries no serial
// number, host name, user name or process name.
export const WINDOWS_COMMAND = "$o=Get-CimInstance Win32_OperatingSystem;$m=Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory;$d=@(Get-CimInstance Win32_PhysicalMemory);$s=$m.StandbyCacheNormalPriorityBytes+$m.StandbyCacheReserveBytes+$m.StandbyCacheCoreBytes;[ordered]@{census='windows-memory';v=1;installed_gb=[int](($d|Measure-Object Capacity -Sum).Sum/1GB);visible_mb=[int]($o.TotalVisibleMemorySize/1KB);available_mb=[int]($m.AvailableBytes/1MB);committed_mb=[int]($m.CommittedBytes/1MB);commit_limit_mb=[int]($m.CommitLimit/1MB);cache_mb=[int]($m.CacheBytes/1MB);standby_mb=[int]($s/1MB);modified_mb=[int]($m.ModifiedPageListBytes/1MB);free_mb=[int]($m.FreeAndZeroPageListBytes/1MB);paged_pool_mb=[int]($m.PoolPagedBytes/1MB);nonpaged_pool_mb=[int]($m.PoolNonpagedBytes/1MB);processes=@(Get-Process).Count;startup_items=@(Get-CimInstance Win32_StartupCommand).Count;uptime_min=[int]((Get-Date)-$o.LastBootUpTime).TotalMinutes;os_caption=$o.Caption;os_build=$o.BuildNumber}|ConvertTo-Json -Compress";

export const IDLE_UPTIME_MIN = 5;
export const IDLE_UPTIME_MAX = 60;

export function bucketOf(installedGb) {
  const gb = Number(installedGb);
  if (gb <= 8) return '8';
  if (gb <= 16) return '16';
  if (gb <= 32) return '32';
  if (gb <= 64) return '64';
  return 'over-64';
}

const BUCKET_LABELS = {
  8: '8 GB installed or less',
  16: 'Over 8 and up to 16 GB installed',
  32: 'Over 16 and up to 32 GB installed',
  64: 'Over 32 and up to 64 GB installed',
  'over-64': 'More than 64 GB installed',
};

// Both follow Microsoft's table of counters against Task Manager ("Memory Performance
// Information", learn.microsoft.com/windows/win32/memory/memory-performance-information):
// the usage Task Manager draws is total minus available, and its Cached figure is the system
// cache plus the modified list plus the three standby lists.
export function derive(row) {
  return {
    ...row,
    in_use_mb: String(Number(row.visible_mb) - Number(row.available_mb)),
    cached_mb: String(Number(row.cache_mb) + Number(row.modified_mb) + Number(row.standby_mb)),
  };
}

const mb = (name, label, required = true) => ({ name, type: 'integer', required, min: 0, max: 4194304, from: 'machine', label });

const definition = {
  id: 'windows-memory',
  name: 'TechFuelHQ Windows Idle Memory Census',
  version: '0.1.0',
  page: 'https://techfuelhq.com/data/windows-memory-census/',
  unit: 'one machine, read once',
  about: 'How much memory Windows holds on a machine that has just started and is doing nothing, by the amount of memory installed.',
  counted: 'A row counts when the machine was restarted, signed in to straight away and left alone, and the reading was taken 5 to 60 minutes after the restart. Rows are grouped by installed memory, and a group publishes once it holds five counted rows.',
  title: (row) => `[windows-memory] ${row.installed_gb} GB installed, ${row.in_use_mb} MB in use`,
  fields: [
    { name: 'installed_gb', type: 'integer', required: true, min: 2, max: 2048, from: 'machine', label: 'Memory installed (GB)' },
    mb('visible_mb', 'Memory Windows can use (MB)'),
    { ...mb('in_use_mb', 'In use (MB)'), from: 'derived' },
    mb('available_mb', 'Available (MB)'),
    mb('committed_mb', 'Committed (MB)'),
    mb('commit_limit_mb', 'Commit limit (MB)'),
    { ...mb('cached_mb', 'Cached (MB)'), from: 'derived' },
    mb('cache_mb', 'System cache (MB)'),
    mb('standby_mb', 'Standby (MB)'),
    mb('modified_mb', 'Modified (MB)'),
    mb('free_mb', 'Free (MB)'),
    mb('paged_pool_mb', 'Paged pool (MB)'),
    mb('nonpaged_pool_mb', 'Non-paged pool (MB)'),
    { name: 'processes', type: 'integer', required: true, min: 1, max: 100000, from: 'machine', label: 'Processes running' },
    { name: 'startup_items', type: 'integer', min: 0, max: 10000, from: 'machine', label: 'Startup entries' },
    { name: 'uptime_min', type: 'integer', required: true, min: 0, max: 5256000, from: 'machine', label: 'Minutes since Windows started', help: 'Counted from the start of Windows, not from signing in.' },
    { name: 'os_caption', type: 'string', required: true, maxLength: 80, from: 'machine', label: 'Windows edition' },
    { name: 'os_build', type: 'string', required: true, maxLength: 20, pattern: '^[0-9]{4,6}$', from: 'machine', label: 'Windows build' },
    {
      name: 'state', type: 'enum', required: true, from: 'human', label: 'What the machine was doing',
      values: ['fresh-boot-idle', 'in-use'],
      labels: {
        'fresh-boot-idle': `Restarted, signed in straight away, left alone with nothing opened, and read ${IDLE_UPTIME_MIN} to ${IDLE_UPTIME_MAX} minutes after the restart`,
        'in-use': 'In use, or read at any other time',
      },
    },
    { name: 'notes', type: 'string', maxLength: 280, from: 'human', label: 'Notes' },
    { name: 'submitted_date', type: 'date', required: true, from: 'intake', label: 'The day the report was sent' },
    { name: 'source_issue', type: 'integer', min: 1, from: 'intake', label: 'The issue the row came from' },
  ],

  derive,

  check(row) {
    const errors = [];
    const d = derive(row);
    if (d.in_use_mb !== row.in_use_mb) errors.push(`in_use_mb is ${row.in_use_mb} and the counters give ${d.in_use_mb}`);
    if (d.cached_mb !== row.cached_mb) errors.push(`cached_mb is ${row.cached_mb} and the counters give ${d.cached_mb}`);
    // Available above what the machine has gives a negative in_use_mb, which the field's own
    // floor of 0 refuses before this check runs.
    if (!near(Number(row.standby_mb) + Number(row.free_mb), row.available_mb, 64)) {
      errors.push('standby and free do not add to available, within 64 MB');
    }
    if (Number(row.visible_mb) > Number(row.installed_gb) * 1024) errors.push('visible_mb is more than the memory installed');
    const up = Number(row.uptime_min);
    if (row.state === 'fresh-boot-idle' && (up < IDLE_UPTIME_MIN || up > IDLE_UPTIME_MAX)) {
      errors.push(`state fresh-boot-idle needs uptime_min from ${IDLE_UPTIME_MIN} to ${IDLE_UPTIME_MAX}, and this row has ${up}`);
    }
    return errors;
  },

  publish: {
    floor: 5,
    figureLabels: {
      n: "Counted rows",
      in_use_mb_median: "In use, median (MB)",
      in_use_mb_min: "In use, lowest row (MB)",
      in_use_mb_max: "In use, highest row (MB)",
      committed_mb_median: "Committed, median (MB)",
      processes_median: "Processes running, median",
    },
    group: (row) => bucketOf(row.installed_gb),
    label: (key) => BUCKET_LABELS[key] || key,
    counts: (row) => row.state === 'fresh-boot-idle',
    figures(rows) {
      const inUse = rows.map((r) => Number(r.in_use_mb));
      return {
        n: rows.length,
        in_use_mb_median: fixed(median(inUse), 0),
        in_use_mb_min: fixed(range(inUse).min, 0),
        in_use_mb_max: fixed(range(inUse).max, 0),
        committed_mb_median: fixed(median(rows.map((r) => Number(r.committed_mb))), 0),
        processes_median: fixed(median(rows.map((r) => Number(r.processes))), 0),
      };
    },
  },
};

export default definition;
