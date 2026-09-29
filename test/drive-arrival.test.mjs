import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDrive, readSmart, readFarm, redact, vendorOf } from '../lib/readers/drive-arrival.js';
import def, { sellerKey } from '../censuses/drive-arrival/definition.js';
import { buildRow, makeReport } from '../lib/report.js';
import { fixture, report, TODAY } from './helpers.mjs';

const EXOS20_A = fixture('drive-arrival', 'exos-20tb-smartctl-a.txt');
const EXOS20_FARM = fixture('drive-arrival', 'exos-20tb-farm.txt');
const EXOS24_X = fixture('drive-arrival', 'exos-24tb-smartctl-x-farm.txt');
const WD14 = fixture('drive-arrival', 'wd-14tb-smartctl-a.json');
const SSD = fixture('drive-arrival', 'samsung-ssd-smartctl-x.json');
const NVME = fixture('drive-arrival', 'intel-nvme-smartctl-a.json');
const SAS = fixture('drive-arrival', 'seagate-sas-smartctl.json');

test('Seagate Exos 20 TB: smartctl -a text and the FARM log, two boxes', () => {
  const { machine } = readDrive(EXOS20_A, EXOS20_FARM);
  assert.deepEqual(machine, {
    drive_vendor: 'seagate',
    model_family: '',
    model: 'ST20000NM007D-3DJ103',
    capacity_tb: '20.00',
    interface: 'sata',
    smartctl_version: '7.4',
    smart_poh: '940',
    smart_power_cycles: '4',
    reallocated: '0',
    pending: '0',
    offline_uncorrectable: '0',
    crc_errors: '0',
    load_cycles: '1007',
    farm: 'read',
    farm_poh: '940',
    farm_spindle_poh: '940',
    farm_head_flight_hours: '198',
    farm_power_cycles: '5',
    farm_assembly_yyww: '2264',
    poh_gap_h: '0',
  });
});

test('Seagate Exos 24 TB: smartctl -x brief table with the FARM log in the same paste', () => {
  const { machine } = readDrive(EXOS24_X, '');
  assert.equal(machine.model, 'ST24000NM000C-3WD103');
  assert.equal(machine.capacity_tb, '24.00');
  assert.equal(machine.smart_poh, '438');
  assert.equal(machine.smart_power_cycles, '9');
  assert.equal(machine.load_cycles, '25');
  assert.equal(machine.reallocated, '0');
  assert.equal(machine.farm, 'read');
  assert.equal(machine.farm_poh, '438');
  assert.equal(machine.farm_spindle_poh, '437');
  assert.equal(machine.farm_head_flight_hours, '437');
  assert.equal(machine.farm_power_cycles, '10');
  assert.equal(machine.farm_assembly_yyww, '4232');
  assert.equal(machine.poh_gap_h, '0');
});

test('raw values with text after the number are read by their leading number', () => {
  const smart = readSmart(EXOS20_A.replace(/(  9 Power_On_Hours .* )940$/m, '$112345h+12m+34.567s'));
  assert.equal(smart.smart_poh, '12345');
});

test('Western Digital 14 TB in JSON: no FARM log exists, and the row says so', () => {
  const { machine } = readDrive(WD14, '');
  assert.equal(machine.drive_vendor, 'wd');
  assert.equal(machine.model, 'WDC WD140EDFZ-11A0VA0');
  assert.equal(machine.capacity_tb, '14.00');
  assert.equal(machine.smartctl_version, '7.0');
  assert.equal(machine.smart_poh, '1730');
  assert.equal(machine.smart_power_cycles, '9');
  assert.equal(machine.load_cycles, '329');
  assert.equal(machine.farm, 'not-supported');
  assert.equal(machine.farm_poh, '');
  assert.equal(machine.poh_gap_h, '');
});

test('a Seagate SAS drive in JSON: hours and grown defects, FARM not pasted', () => {
  const { machine } = readDrive(SAS, '');
  assert.equal(machine.drive_vendor, 'seagate');
  assert.equal(machine.interface, 'sas');
  assert.equal(machine.capacity_tb, '4.00');
  assert.equal(machine.smart_poh, '43549');
  assert.equal(machine.reallocated, '56');
  assert.equal(machine.farm, 'not-provided');
});

test('what smartctl prints when a drive keeps no FARM log', () => {
  assert.deepEqual(readFarm('FARM log (GP Log 0xa6) not supported\n'), { farm: 'not-supported' });
  assert.deepEqual(readFarm('FARM log (GP Log 0xa6) not supported for non-Seagate drives\n'), { farm: 'not-supported' });
  assert.deepEqual(readFarm(''), { farm: 'not-provided' });
  assert.throws(() => readFarm('some other text'), /cannot find a FARM log/);
});

test('FARM in JSON, with the key names smartctl writes', () => {
  const json = JSON.stringify({ seagate_farm_log: { supported: true, page_1_drive_information: { poh: 31204, spoh: 31100, head_flight_hours: 30990, power_cycle_count: 41, date_of_assembly: '2119' } } });
  assert.deepEqual(readFarm(json), { farm: 'read', farm_poh: '31204', farm_spindle_poh: '31100', farm_head_flight_hours: '30990', farm_power_cycles: '41', farm_assembly_yyww: '2119' });
  assert.deepEqual(readFarm(JSON.stringify({ seagate_farm_log: { supported: false } })), { farm: 'not-supported' });
});

test('a drive whose FARM hours are far above its SMART hours', () => {
  const farm = EXOS20_FARM.replace(/(\s+Power on Hours: )940/, '$131204');
  const { machine } = readDrive(EXOS20_A, farm);
  assert.equal(machine.smart_poh, '940');
  assert.equal(machine.farm_poh, '31204');
  assert.equal(machine.poh_gap_h, '30264');
});

test('solid state and NVMe drives are refused with the reason', () => {
  assert.throws(() => readDrive(SSD, ''), /solid state drive/);
  assert.throws(() => readDrive(NVME, ''), /NVMe drive/);
  assert.throws(() => readSmart(EXOS20_A.replace('Rotation Rate:    7200 rpm', 'Rotation Rate:    Solid State Device')), /solid state drive/);
});

test('incomplete pastes say what is missing', () => {
  assert.throws(() => readSmart(''), /Nothing is pasted/);
  assert.throws(() => readSmart('smartctl 7.4\n'), /cannot find the drive's model/);
  assert.throws(() => readSmart(EXOS20_A.split('ID# ATTRIBUTE_NAME')[0]), /cannot find the attribute table/);
  assert.throws(() => readSmart(WD14.slice(0, 300)), /cut off/);
});

test('serial numbers and world wide names never reach a report', () => {
  const withSerial = EXOS20_A.replace('Serial Number:    [removed]', 'Serial Number:    ZX9ABCDE')
    .replace('LU WWN Device Id: [removed]', 'LU WWN Device Id: 5 000c50 0aabbccdd');
  const farm = EXOS20_FARM.replace('Serial Number: [removed]', 'Serial Number: ZX9ABCDE')
    .replace('World Wide Name: [removed]', 'World Wide Name: 0x5000c500aabbccdd');
  const { machine } = readDrive(withSerial, farm);
  const rep = JSON.stringify(makeReport(def, { ...machine, seller: 'ServerPartDeals', listing_condition: 'manufacturer-recertified', purchase_month: '2026-08', arrived: 'working', first_test: 'none' }));
  assert.ok(!/ZX9ABCDE|aabbccdd/i.test(rep));
  const shown = redact(`${withSerial}\n${farm}\n{"serial_number": "ZX9ABCDE", "world_wide_name": "0x5000c500aabbccdd"}`);
  assert.ok(!/ZX9ABCDE|aabbccdd/i.test(shown));
  assert.match(shown, /Serial Number:\s+\[removed\]/);
});

test('drive makers from model names', () => {
  assert.equal(vendorOf('ST16000NM001G-2KK103', 'Seagate Exos X16'), 'seagate');
  assert.equal(vendorOf('WDC WD140EDFZ-11A0VA0', ''), 'wd');
  assert.equal(vendorOf('WDC  WUH721816ALE6L4', 'Western Digital Ultrastar DC HC550'), 'wd');
  assert.equal(vendorOf('HGST HUH721212ALE604', ''), 'hgst');
  assert.equal(vendorOf('TOSHIBA MG08ACA16TE', ''), 'toshiba');
  assert.equal(vendorOf('SomethingElse 123', ''), 'other');
});

test('seller names group whatever their spacing and case', () => {
  assert.equal(sellerKey('ServerPartDeals'), 'serverpartdeals');
  assert.equal(sellerKey('Server Part Deals'), 'serverpartdeals');
  assert.equal(sellerKey('goHardDrive.com'), 'goharddrivecom');
  assert.equal(def.publish.group({ seller: 'Server Part Deals', listing_condition: 'used' }), 'serverpartdeals/used');
});

test('planted faults in a report are each caught', () => {
  const caught = (changes, pattern) => {
    const r = buildRow(def, report('drive-arrival', changes), { submitted_date: TODAY }, TODAY);
    assert.ok(r.errors.some((e) => pattern.test(e)), `${JSON.stringify(changes)} gave ${JSON.stringify(r.errors)}`);
  };
  const ok = buildRow(def, report('drive-arrival'), { submitted_date: TODAY }, TODAY);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.row.poh_gap_h, '0');
  caught({ farm: 'not-supported' }, /farm_poh is set and farm is not-supported/);
  caught({ farm_poh: undefined }, /farm is read and farm_poh is empty/);
  caught({ poh_gap_h: '5' }, /the report says 5 and its values give 0/);
  caught({ smart_poh: '-1' }, /below 0/);
  caught({ farm_assembly_yyww: '22w4' }, /does not match/);
  caught({ purchase_month: '2026-13' }, /not a month/);
  caught({ seller: '???' }, /no letters or digits/);
  caught({ listing_condition: 'like-new' }, /not one of/);
  caught({ capacity_tb: '20.004' }, /decimal places/);
});
