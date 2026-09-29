import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const fixture = (...parts) => readFileSync(join(ROOT, 'test', 'fixtures', ...parts), 'utf8');
export const file = (...parts) => readFileSync(join(ROOT, ...parts), 'utf8');

export const TODAY = '2026-09-29';

// A valid report for each census, used as the starting point for planted faults.
export const GOOD = {
  'pin-current': {
    card_brand: 'ASUS', card_model: 'ROG Astral RTX 5090 OC', gpu: 'RTX 5090', sensor: 'astral-hwmon',
    capture: 'log', cable_type: 'native-16pin', inline_part: 'none', psu_brand: 'Seasonic',
    psu_model: 'PRIME TX-1600', psu_watts: '1600', months_in_use: '7', load_kind: 'stress-test',
    load_name: 'CUDA burn', samples: '238', duration_s: '161', total_a: '47.07',
    pin1_a: '7.46', pin2_a: '7.64', pin3_a: '8.08', pin4_a: '7.73', pin5_a: '8.35', pin6_a: '7.81',
    peak_pin_a: '8.56', peak_total_a: '48.26', min_v: '11.944',
  },
  'oled-burn-in': {
    monitor_brand: 'Gigabyte', monitor_model: 'AORUS FO48U', panel_type: 'woled', size_in: '48',
    purchase_month: '2021-09', months_in_use: '60', use_mix: 'mixed', care_cycles: 'as-prompted',
    severity: '0', location: 'none', warranty_claim: 'none',
  },
  'post-time': {
    os: 'windows', platform: 'am5', cpu: 'AMD Ryzen 7 7800X3D 8-Core Processor',
    board_vendor: 'ASUSTeK COMPUTER INC.', board: 'ROG STRIX B650-A GAMING WIFI', bios_version: '3881',
    bios_date: '2026-06-16', dimms: '1', ram_gb: '32', ram_speed: '6000', memory_fast_boot: 'unknown',
    boot_kind: 'cold-boot', fast_startup: 'off', fw_post_ms: '63981', os_build: '26200',
  },
  'drive-arrival': {
    seller: 'ServerPartDeals', listing_condition: 'manufacturer-recertified', purchase_month: '2026-08',
    drive_vendor: 'seagate', model: 'ST20000NM007D-3DJ103', capacity_tb: '20.00', interface: 'sata',
    smartctl_version: '7.4', smart_poh: '940', smart_power_cycles: '4', reallocated: '0', pending: '0',
    offline_uncorrectable: '0', crc_errors: '0', load_cycles: '1007', farm: 'read', farm_poh: '940',
    farm_spindle_poh: '940', farm_head_flight_hours: '198', farm_power_cycles: '5', farm_assembly_yyww: '2264',
    arrived: 'working', first_test: 'long-smart',
  },
  'windows-memory': {
    installed_gb: '32', visible_mb: '32424', available_mb: '24000', committed_mb: '9000',
    commit_limit_mb: '47784', cache_mb: '300', standby_mb: '9000', modified_mb: '100', free_mb: '15000',
    paged_pool_mb: '600', nonpaged_pool_mb: '500', processes: '180', startup_items: '5',
    uptime_min: '12', os_caption: 'Microsoft Windows 11 Home', os_build: '26200', state: 'fresh-boot-idle',
  },
};

export const report = (id, changes = {}) => {
  const fields = { ...GOOD[id], ...changes };
  for (const k of Object.keys(fields)) if (fields[k] === undefined) delete fields[k];
  return { census: id, v: 1, fields };
};
