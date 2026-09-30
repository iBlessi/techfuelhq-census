import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDrive, readSmart, readFarm, vendorOf } from '../lib/readers/drive-arrival.js';
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

const SERIAL = 'ZX9ABCDE';
const WITH_SERIAL = EXOS20_A.replace('Serial Number:    [removed]', `Serial Number:    ${SERIAL}`)
  .replace('LU WWN Device Id: [removed]', 'LU WWN Device Id: 5 000c50 0aabbccdd');
const FARM_WITH_SERIAL = EXOS20_FARM.replace('Serial Number: [removed]', `Serial Number: ${SERIAL}`)
  .replace('World Wide Name: [removed]', 'World Wide Name: 0x5000c500aabbccdd');

// Made up, in the layout smartctl prints for a SAS drive. The empty Vendor line is what Seagate's
// white-label recertified SAS drives report (opensvc/multipath-tools issue 56).
const SAS_BLANK_VENDOR = [
  'smartctl 7.4 2023-08-01 r5530 [x86_64-linux-6.8.0] (local build)',
  '',
  '=== START OF INFORMATION SECTION ===',
  'Vendor:               ',
  'Product:              OOS16000G',
  'Revision:             OOS1',
  'User Capacity:        16,000,900,608,000 bytes [16.0 TB]',
  'Rotation Rate:        7200 rpm',
  'Logical Unit id:      0x5000c500d1e2f3a4',
  'Serial number:        ZL2ABCDE0000',
  'Device type:          disk',
  'Transport protocol:   SAS (SPL-4)',
  '',
  '=== START OF READ SMART DATA SECTION ===',
  'SMART Health Status: OK',
  'Accumulated start-stop cycles:  61',
  'Elements in grown defect list: 0',
  '  Accumulated power on time, hours:minutes 31204:17',
  '',
].join('\n');

const everyValue = (machine) => Object.values(machine).join(' ');

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
    farm_assembly_printed: '2264',
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
  assert.equal(machine.farm_assembly_printed, '4232');
  assert.equal(machine.poh_gap_h, '0');
});

test('raw values with text after the number are read by their leading number', () => {
  const { smart } = readSmart(EXOS20_A.replace(/(  9 Power_On_Hours .* )940$/m, '$112345h+12m+34.567s'));
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

test('JSON is read with a prompt line around it, a byte order mark, or a second document after it', () => {
  const plain = readDrive(WD14, '').machine;
  assert.deepEqual(readDrive(`﻿${WD14}`, '').machine, plain);
  assert.deepEqual(readDrive(`root@nas:~# smartctl -a -j /dev/sda\n${WD14}\nroot@nas:~# `, '').machine, plain);
  assert.deepEqual(readDrive(`${WD14}\n{"smartctl":{"version":[7,0]},"seagate_farm_log":{"supported":false}}`, '').machine, plain);
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

test('a SAS drive whose FARM log is in JSON, under the names smartctl uses for SAS', () => {
  // Key names from scsiPrintFarmLog in smartmontools' farmprint.cpp; the values are made up.
  const farm = JSON.stringify({ smartctl: { version: [7, 4] }, seagate_farm_log: { drive_information: { power_on_hour: 61204, power_cycle_count: 88, date_of_assembled: '1912' } } });
  const { machine } = readDrive(SAS, farm);
  assert.equal(machine.farm, 'read');
  assert.equal(machine.farm_poh, '61204');
  assert.equal(machine.farm_power_cycles, '88');
  assert.equal(machine.farm_assembly_printed, '1912');
  assert.equal(machine.poh_gap_h, String(61204 - 43549));
});

test('a SAS drive with an empty Vendor line: the model is the product, and nothing else', () => {
  const { machine } = readDrive(SAS_BLANK_VENDOR, '');
  assert.equal(machine.model, 'OOS16000G');
  assert.equal(machine.interface, 'sas');
  assert.equal(machine.drive_vendor, 'seagate');
  assert.equal(machine.capacity_tb, '16.00');
  assert.equal(machine.smart_poh, '31204');
  assert.equal(machine.smart_power_cycles, '61');
  assert.ok(!/ZL2ABCDE|d1e2f3a4|Product/i.test(everyValue(machine)));
});

test('what smartctl prints when it has no FARM log to show', () => {
  const seagate = { seagate: true, listed: true };
  const rebranded = { seagate: true, listed: false };
  const other = { seagate: false, listed: false };
  assert.deepEqual(readFarm('FARM log (GP Log 0xa6) not supported\n', seagate), { farm: 'not-supported' });
  assert.deepEqual(readFarm('FARM log (GP Log 0xa6) not supported for non-Seagate drives\n', other), { farm: 'not-supported' });
  // A rebranded Seagate drive keeps the log and smartctl never asks it.
  const asked = readFarm('FARM log (GP Log 0xa6) not supported for non-Seagate drives\n(override with \'-T permissive\' option)\n', rebranded);
  assert.equal(asked.farm, 'not-provided');
  assert.match(asked.note, /did not ask this drive/);
  const hinted = readFarm('Seagate FARM log (GP Log 0xa6) supported [try: -l farm]\n', seagate);
  assert.equal(hinted.farm, 'not-provided');
  assert.match(hinted.note, /smartctl -l farm/);
  assert.deepEqual(readFarm('', seagate), { farm: 'not-provided' });
  assert.equal(readFarm('some other text', seagate), null);
  assert.throws(() => readDrive(EXOS20_A, 'some other text'), /cannot find a FARM log/);
});

test('a rebranded Seagate drive is a Seagate drive, and its unread log is recorded as not read', () => {
  // The model and the refusal are the ones in smartmontools issue 320.
  const oos = WITH_SERIAL.replace(/^Device Model:.*$/m, 'Device Model:     OOS6000G');
  const out = readDrive(oos, 'FARM log (GP Log 0xa6) not supported for non-Seagate drives\n(override with \'-T permissive\' option)\n');
  assert.equal(out.machine.model, 'OOS6000G');
  assert.equal(out.machine.drive_vendor, 'seagate');
  assert.equal(out.machine.farm, 'not-provided');
  assert.match(out.note, /did not ask this drive/);
  // With a model nobody knows, the maker still comes from the world wide name, and only the maker.
  const unknown = readDrive(WITH_SERIAL.replace(/^Device Model:.*$/m, 'Device Model:     XYZ123 NEW'), '');
  assert.equal(unknown.machine.drive_vendor, 'seagate');
  assert.ok(!/aabbccdd/i.test(everyValue(unknown.machine)));
});

test('FARM in JSON, with the key names smartctl writes', () => {
  const json = JSON.stringify({ seagate_farm_log: { supported: true, page_1_drive_information: { poh: 31204, spoh: 31100, head_flight_hours: 30990, power_cycle_count: 41, date_of_assembly: '2119' } } });
  assert.deepEqual(readFarm(json), { farm: 'read', farm_poh: '31204', farm_spindle_poh: '31100', farm_head_flight_hours: '30990', farm_power_cycles: '41', farm_assembly_printed: '2119' });
  assert.deepEqual(readFarm(JSON.stringify({ seagate_farm_log: { supported: false } })), { farm: 'not-supported' });
  assert.equal(readFarm(JSON.stringify({ seagate_farm_log: { supported: true } })).farm, 'not-provided');
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

test('a drive that gives no sign of platters is refused, and an old hard drive is not', () => {
  // No rotation rate line, and the attributes a solid state drive reports.
  const noRate = EXOS20_A.replace(/^Rotation Rate:.*\n/m, '');
  assert.notEqual(noRate, EXOS20_A);
  // The Exos still reports spin-up time, so it is read as the hard drive it is.
  assert.equal(readSmart(noRate).smart.smart_poh, '940');
  const noPlatters = noRate.split('\n').filter((l) => !/^\s*(3|7|10)\s+\S+/.test(l)).join('\n');
  assert.throws(() => readSmart(noPlatters), /cannot tell whether this is a hard drive/);
  const json = JSON.parse(WD14);
  delete json.rotation_rate;
  json.ata_smart_attributes.table = json.ata_smart_attributes.table.filter((a) => ![3, 7, 10].includes(a.id));
  assert.throws(() => readSmart(JSON.stringify(json)), /cannot tell whether this is a hard drive/);
});

test('incomplete pastes say what is missing', () => {
  assert.throws(() => readSmart(''), /Nothing is pasted/);
  assert.throws(() => readSmart('smartctl 7.4\n'), /cannot find the drive's model/);
  assert.throws(() => readSmart(EXOS20_A.split('ID# ATTRIBUTE_NAME')[0]), /cannot find the attribute table/);
  assert.throws(() => readSmart(WD14.slice(0, 300)), /cut off/);
  // Cut inside the table, where the end of a number may be missing.
  const at = EXOS20_A.indexOf('Power_On_Hours');
  const lineEnd = EXOS20_A.indexOf('\n', at);
  assert.throws(() => readSmart(EXOS20_A.slice(0, lineEnd - 2)), /stops inside the attribute table/);
});

test('two drives in one paste are refused', () => {
  const second = WITH_SERIAL.replace(SERIAL, 'ZX9ZZZZZ').replace(/(  9 Power_On_Hours .* )940$/m, '$131204');
  assert.throws(() => readDrive(`${WITH_SERIAL}\n${second}`, ''), /more than one run of smartctl, or more than one drive/);
  // The first drive's output cut short, then a second drive: one information section is gone, the serials differ.
  const cut = WITH_SERIAL.split('=== START OF READ SMART DATA SECTION ===')[0].replace('=== START OF INFORMATION SECTION ===', '');
  assert.throws(() => readDrive(`${cut}\n${second}`, ''), /more than one/);
  // A FARM log from another drive.
  assert.throws(() => readDrive(WITH_SERIAL, FARM_WITH_SERIAL.replace(SERIAL, 'ZX9ZZZZZ')), /more than one/);
});

test('serial numbers and world wide names never reach a report', () => {
  const { machine } = readDrive(WITH_SERIAL, FARM_WITH_SERIAL);
  const rep = JSON.stringify(makeReport(def, { ...machine, seller: 'ServerPartDeals', listing_condition: 'manufacturer-recertified', purchase_month: '2026-08', arrived: 'working', first_test: 'none' }));
  assert.ok(!/ZX9ABCDE|aabbccdd/i.test(rep));
  // In JSON, where the same things have other names.
  const json = JSON.parse(WD14);
  json.serial_number = 'WD-9ABCDEFG';
  json.wwn = { naa: 5, oui: 5358, id: 11259375 };
  const fromJson = readDrive(JSON.stringify(json), '').machine;
  assert.ok(!/9ABCDEFG|abcdef/i.test(everyValue(fromJson)));
});

test('a paste edited so that a serial number sits where the model belongs is refused', () => {
  // An empty model label: the next line is the serial number, and it is not read in its place.
  assert.throws(() => readDrive(WITH_SERIAL.replace(/^Device Model:.*$/m, 'Device Model:'), ''), /cannot find the drive's model/);
  // The serial number typed in as the model.
  assert.throws(() => readDrive(WITH_SERIAL.replace(/^Device Model:.*$/m, `Device Model:     ${SERIAL}`), ''), /a serial number would have ended up in the report/);
  assert.throws(() => readDrive(WITH_SERIAL.replace(/^Device Model:.*$/m, `Device Model:     Serial Number: ${SERIAL}`), ''), /a serial number would have ended up in the report/);
});

test('a family or model with "Serial ATA" in its name is a name, not a serial number', () => {
  // Ten families in smartmontools' drivedb.h carry the words, "Western Digital Caviar Blue Serial ATA" among them.
  const wd = WITH_SERIAL.replace(/^Device Model:.*$/m, 'Device Model:     WDC WD5000AAKS-00V1A0')
    .replace(/^(=== START OF INFORMATION SECTION ===\n)/m, '$1Model Family:     Western Digital Caviar Blue Serial ATA\n');
  const { machine } = readDrive(wd, '');
  assert.equal(machine.model_family, 'Western Digital Caviar Blue Serial ATA');
  assert.equal(machine.model, 'WDC WD5000AAKS-00V1A0');
  assert.equal(machine.drive_vendor, 'wd');
  // The words that mean a serial number was read as a model are still refused, even a short one.
  assert.throws(() => readDrive(WITH_SERIAL.replace(/^Device Model:.*$/m, 'Device Model:     Serial Number: ZX9AB'), ''), /serial number would have ended up/);
});

test('a SAS drive prints its serial number long in one place and short in another, and is one drive', () => {
  const sas = SAS_BLANK_VENDOR.replace('Serial number:        ZL2ABCDE0000', 'Serial number:        00000ZL2ABCDE0000RXB');
  const farm = [
    'Seagate Field Access Reliability Metrics log (FARM) (SCSI Log page 0x3d, sub-page 0x3)',
    '\tFARM Log Parameter 1: Drive Information',
    '\t\tSerial Number: ZL2ABCDE',
    '\t\tPower on Hour: 31300',
    '\t\tPower Cycle count: 62',
    '',
  ].join('\n');
  // The long form starts with zeros, as multipath-tools issue 56 shows; the base is the middle of it.
  const { machine } = readDrive(sas.replace('00000ZL2ABCDE0000RXB', 'ZL2ABCDE0000RXB'), farm);
  assert.equal(machine.farm, 'read');
  assert.equal(machine.farm_poh, '31300');
  assert.ok(!/ZL2ABCDE/i.test(everyValue(machine)));
  // Two different drives are still two.
  assert.throws(() => readDrive(sas, farm.replace('ZL2ABCDE', 'ZL2ZZZZZ')), /more than one/);
});

test('a model that carries part of the serial number after it is refused', () => {
  // Sun-branded drives print a date code and part of the serial after the model.
  const sun = WITH_SERIAL.replace(/^Device Model:.*$/m, 'Device Model:     HITACHI HDS7250SASUN500G 0726K9ZW5H')
    .replace(`Serial Number:    ${SERIAL}`, 'Serial Number:    K9ZW5HGN');
  assert.throws(() => readDrive(sun, ''), /a serial number would have ended up in the report/);
  // A model that shares a short run with the serial, as models and serials often do, is not.
  const plain = WITH_SERIAL.replace(`Serial Number:    ${SERIAL}`, 'Serial Number:    3DJ1ABCD');
  assert.equal(readDrive(plain, '').machine.model, 'ST20000NM007D-3DJ103');
});

test('thousands separators of every kind in the capacity line', () => {
  for (const sep of [',', '.', "'", '\u2019', '\u00a0', '\u202f', ' ']) {
    const text = EXOS20_A.replace(/^User Capacity:.*$/m, `User Capacity:    20${sep}000${sep}588${sep}851${sep}200 bytes [20.0 TB]`);
    assert.equal(readSmart(text).smart.capacity_tb, '20.00', JSON.stringify(sep));
  }
});

test('drive makers from model names, and from the maker part of a world wide name', () => {
  assert.equal(vendorOf('ST16000NM001G-2KK103', 'Seagate Exos X16'), 'seagate');
  assert.equal(vendorOf('OOS6000G', ''), 'seagate');
  assert.equal(vendorOf('WDC WD140EDFZ-11A0VA0', ''), 'wd');
  assert.equal(vendorOf('WDC  WUH721816ALE6L4', 'Western Digital Ultrastar DC HC550'), 'wd');
  assert.equal(vendorOf('HGST HUH721212ALE604', ''), 'hgst');
  assert.equal(vendorOf('TOSHIBA MG08ACA16TE', ''), 'toshiba');
  assert.equal(vendorOf('SomethingElse 123', ''), 'other');
  assert.equal(vendorOf('SomethingElse 123', '', '000c50'), 'seagate');
  assert.equal(vendorOf('SomethingElse 123', '', '0014EE'), 'wd');
  assert.equal(vendorOf('SomethingElse 123', '', 'ffffff'), 'other');
});

test('seller names group whatever their spacing, case or script', () => {
  assert.equal(sellerKey('ServerPartDeals'), 'serverpartdeals');
  assert.equal(sellerKey('Server Part Deals'), 'serverpartdeals');
  assert.equal(sellerKey('goHardDrive.com'), 'goharddrivecom');
  assert.equal(sellerKey('ヨドバシ カメラ'), 'ヨドバシカメラ');
  assert.equal(sellerKey('Ситилинк'), 'ситилинк');
  assert.equal(sellerKey('???'), '');
  assert.equal(def.publish.group({ seller: 'Server Part Deals', listing_condition: 'used' }), 'serverpartdeals/used');
  const r = buildRow(def, report('drive-arrival', { seller: 'ヨドバシカメラ' }), { submitted_date: TODAY }, TODAY);
  assert.deepEqual(r.errors, []);
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
  caught({ poh_gap_h: '5' }, /the report says "5" and its values give 0/);
  caught({ smart_poh: '-1' }, /below 0/);
  caught({ farm_assembly_printed: '22w4' }, /does not match/);
  caught({ purchase_month: '2026-13' }, /not a month/);
  caught({ seller: '???' }, /no letters or digits/);
  caught({ listing_condition: 'like-new' }, /not one of/);
  caught({ capacity_tb: '20.004' }, /decimal places/);
});
