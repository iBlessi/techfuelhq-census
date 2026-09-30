// POST time census. One row is one boot of one machine: the time its firmware took before the
// operating system's loader started, as the machine itself recorded it.
import { fixed } from '../../lib/validate.js';
import { median, range, countBy } from '../../lib/stats.js';

// Printed by Windows PowerShell 5.1 and later. Reads the registry and WMI; writes nothing;
// carries no serial number, host name or user name. The BIOS date is read in universal time,
// because Windows holds it as midnight UTC and a clock west of Greenwich would print the day
// before. fast_startup is -1 where Windows holds no value for it.
export const WINDOWS_COMMAND = "$p=Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power';$o=Get-CimInstance Win32_OperatingSystem;$b=Get-CimInstance Win32_BaseBoard;$f=Get-CimInstance Win32_BIOS;$c=Get-CimInstance Win32_Processor|Select-Object -First 1;$d=@(Get-CimInstance Win32_PhysicalMemory);[ordered]@{census='post-time';v=1;os='windows';fw_post_ms=[int]$p.FwPOSTTime;fast_startup=$(if($null -eq $p.HiberbootEnabled){-1}else{[int]$p.HiberbootEnabled});board_vendor=$b.Manufacturer;board=$b.Product;bios_version=$f.SMBIOSBIOSVersion;bios_date=$(if($f.ReleaseDate){$f.ReleaseDate.ToUniversalTime().ToString('yyyy-MM-dd')}else{''});cpu=$c.Name.Trim();dimms=$d.Count;ram_gb=[int](($d|Measure-Object Capacity -Sum).Sum/1GB);ram_speed=[int]($d|Select-Object -First 1).ConfiguredClockSpeed;os_build=$o.BuildNumber}|ConvertTo-Json -Compress";

export const LINUX_COMMAND = 'systemd-analyze';

const PLATFORM_LABELS = {
  am5: 'AMD AM5',
  am4: 'AMD AM4',
  lga1851: 'Intel LGA 1851',
  lga1700: 'Intel LGA 1700',
  other: 'Another platform, a laptop or a prebuilt with its own board',
};

const FAST_BOOT_LABELS = {
  on: 'On',
  off: 'Off',
  auto: 'Auto, as the board shipped',
  unknown: 'I have not looked',
};

const FAST_BOOT_IN_A_GROUP = {
  on: 'memory shortcut on',
  off: 'memory shortcut off',
  auto: 'memory shortcut on auto',
  unknown: 'memory shortcut not checked',
};

const definition = {
  id: 'post-time',
  name: 'TechFuelHQ POST Time Census',
  version: '0.1.0',
  page: 'https://techfuelhq.com/data/post-time-census/',
  unit: 'one boot of one machine',
  about: "How long a machine's firmware takes before the operating system's loader starts, as the machine recorded it for its last boot.",
  counted: 'Every row counts. Rows are grouped by platform and by the state of the memory training shortcut, and a group publishes once it holds five rows.',
  title: (row) => `[post-time] ${row.board}, ${(Number(row.fw_post_ms) / 1000).toFixed(1)} s`,
  fields: [
    { name: 'os', type: 'enum', required: true, from: 'machine', label: 'Read from', values: ['windows', 'linux'], labels: { windows: 'Windows', linux: 'Linux' } },
    { name: 'platform', type: 'enum', required: true, from: 'human', label: 'Platform', values: Object.keys(PLATFORM_LABELS), labels: PLATFORM_LABELS },
    { name: 'cpu', type: 'string', required: true, maxLength: 80, from: 'machine', label: 'Processor' },
    { name: 'board_vendor', type: 'string', required: true, maxLength: 60, from: 'machine', label: 'Board maker' },
    { name: 'board', type: 'string', required: true, maxLength: 80, from: 'machine', label: 'Board' },
    { name: 'bios_version', type: 'string', required: true, maxLength: 40, from: 'machine', label: 'BIOS version' },
    { name: 'bios_date', type: 'date', from: 'machine', label: 'BIOS date' },
    { name: 'dimms', type: 'integer', required: true, min: 1, max: 16, from: 'machine', label: 'Memory modules' },
    { name: 'ram_gb', type: 'integer', required: true, min: 2, max: 2048, from: 'machine', label: 'Memory (GB)' },
    { name: 'ram_speed', type: 'integer', min: 400, max: 12000, from: 'machine', label: 'Memory speed as configured' },
    {
      name: 'memory_fast_boot', type: 'enum', required: true, from: 'human', label: 'Memory training shortcut in the BIOS',
      help: 'Memory Context Restore on AMD boards, MRC Fast Boot on Intel boards.',
      values: Object.keys(FAST_BOOT_LABELS), labels: FAST_BOOT_LABELS,
    },
    {
      name: 'boot_kind', type: 'enum', required: true, from: 'human', label: 'How the machine was last started',
      values: ['restart', 'cold-boot', 'unknown'],
      labels: { restart: 'Restarted from the running system', 'cold-boot': 'Powered on from off', unknown: 'I do not remember' },
    },
    {
      name: 'fast_startup', type: 'enum', required: true, from: 'machine', label: 'Windows Fast Startup',
      values: ['on', 'off', 'not-applicable', 'unknown'],
      labels: { on: 'On', off: 'Off', 'not-applicable': 'Not Windows', unknown: 'Not reported' },
    },
    { name: 'fw_post_ms', type: 'integer', required: true, min: 500, max: 900000, from: 'machine', label: 'Firmware time (ms)' },
    { name: 'os_build', type: 'string', maxLength: 40, from: 'machine', label: 'System build' },
    { name: 'notes', type: 'string', maxLength: 280, from: 'human', label: 'Notes' },
    { name: 'submitted_date', type: 'date', required: true, from: 'intake', label: 'The day the report was sent' },
    { name: 'source_issue', type: 'integer', min: 1, from: 'intake', label: 'The issue the row came from' },
  ],

  derive: (row) => ({ ...row }),

  check(row) {
    const errors = [];
    if (row.os === 'linux' && row.fast_startup !== 'not-applicable') errors.push('fast_startup is not-applicable on Linux');
    if (row.os === 'windows' && row.fast_startup === 'not-applicable') errors.push('fast_startup on Windows is on, off or unknown');
    return errors;
  },

  publish: {
    floor: 5,
    figureLabels: {
      n: "Rows",
      seconds_median: "Firmware time, median (s)",
      seconds_min: "Firmware time, shortest (s)",
      seconds_max: "Firmware time, longest (s)",
      board_makers: "Board makers among the rows",
      cold_boots: "Rows read after a cold boot",
    },
    group: (row) => `${row.platform}/${row.memory_fast_boot}`,
    label(key) {
      const [platform, state] = key.split('/');
      const where = platform === 'other' ? 'Other platforms' : (PLATFORM_LABELS[platform] || platform);
      return `${where}, ${FAST_BOOT_IN_A_GROUP[state] || state}`;
    },
    counts: () => true,
    figures(rows) {
      const seconds = rows.map((r) => Number(r.fw_post_ms) / 1000);
      const vendors = countBy(rows, (r) => r.board_vendor);
      return {
        n: rows.length,
        seconds_median: fixed(median(seconds), 1),
        seconds_min: fixed(range(seconds).min, 1),
        seconds_max: fixed(range(seconds).max, 1),
        board_makers: vendors.size,
        cold_boots: rows.filter((r) => r.boot_kind === 'cold-boot').length,
      };
    },
  },
};

export default definition;
