// Reads smartctl output for one hard drive: the -a or -x text, the same in JSON (-j), and the
// Seagate FARM log (-l farm) as text or JSON. Serial numbers and world wide names are read past,
// never copied into a report, and a report that would hold one is refused.
import { fixed } from '../validate.js';
import { objectsIn } from './block.js';
import { derive } from '../../censuses/drive-arrival/definition.js';

const ATTRIBUTES = {
  5: 'reallocated',
  9: 'smart_poh',
  12: 'smart_power_cycles',
  193: 'load_cycles',
  197: 'pending',
  198: 'offline_uncorrectable',
  199: 'crc_errors',
};

// Attributes only a drive with platters reports: spin-up time, seek error rate, spin retries.
const PLATTER_ATTRIBUTES = [3, 7, 10];

// The maker's registered prefix inside a world wide name. Only the maker is kept.
const MAKER_BY_OUI = {
  '000c50': 'seagate',
  '0014ee': 'wd',
  '000cca': 'hgst',
  '000039': 'toshiba',
};

export function vendorOf(model, family, oui) {
  const m = String(model || '').trim().toUpperCase();
  const f = String(family || '').toUpperCase();
  // OOS is the white label Seagate puts on some recertified drives (smartmontools issue 320).
  if (/^ST\d/.test(m) || /^SEAGATE/.test(m) || /^OOS\d/.test(m) || /SEAGATE/.test(f)) return 'seagate';
  if (/^(HGST|HUH|HUS|HDN|HMS)/.test(m) || /HGST|HITACHI/.test(f)) return 'hgst';
  if (/^(WDC|WD|WUH|WUS)/.test(m) || /WESTERN DIGITAL/.test(f)) return 'wd';
  if (/^(TOSHIBA|MG\d|MD\d|MN\d|HDW)/.test(m) || /TOSHIBA/.test(f)) return 'toshiba';
  return MAKER_BY_OUI[String(oui || '').toLowerCase()] || 'other';
}

function leadingInteger(raw) {
  const m = /^(\d+)/.exec(String(raw).trim());
  return m ? m[1] : null;
}

function tb(bytes) {
  return fixed(Number(bytes) / 1e12, 2);
}

function refuse(kind) {
  const why = {
    nvme: 'This is an NVMe drive. The census counts hard drives.',
    ssd: 'This is a solid state drive. The census counts hard drives.',
    unsure: 'I cannot tell whether this is a hard drive: the output gives no rotation rate and none of the attributes a drive with platters reports. The census counts hard drives.',
    several: 'This looks like more than one run of smartctl, or more than one drive. Paste one run, for one drive.',
    leak: 'The output is not laid out the way smartctl prints it, and a serial number would have ended up in the report. Paste what smartctl printed, as it printed it.',
  };
  throw new Error(why[kind]);
}

// A value on the same line as its label. The gap is spaces and tabs only: a label with
// nothing after it has no value, and the next line is not read in its place.
function line(text, label) {
  const re = new RegExp(`^[ \\t]*${label}[ \\t]*(.*)$`, 'm');
  const m = re.exec(text);
  return m ? m[1].trim() : '';
}

function all(text, re) {
  const out = [];
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  let m = g.exec(text);
  while (m) {
    out.push(m[1]);
    m = g.exec(text);
  }
  return out;
}

const bare = (s) => String(s || '').toLowerCase().replace(/^0x/, '').replace(/[^a-z0-9]/g, '');

// A placeholder someone typed over a serial number is not a serial number.
function real(id) {
  const s = bare(id);
  return s.length >= 6 && !/^(.)\1+$/.test(s) && !/(xxx|removed|redacted|hidden|serial)/.test(s);
}

// Every serial number and world wide name in a paste, so that a report can be checked for them.
function identifiersInText(text) {
  const serials = all(text, /^[ \t]*Serial [Nn]umber:[ \t]*(\S.*)$/m);
  const names = [
    ...all(text, /^[ \t]*LU WWN Device Id:[ \t]*(\S.*)$/m),
    ...all(text, /^[ \t]*Logical Unit id:[ \t]*(\S.*)$/m),
    ...all(text, /^[ \t]*World Wide Name:[ \t]*(\S.*)$/m),
  ];
  return { serials: serials.filter(real).map(bare), names: names.filter(real).map(bare) };
}

function identifiersInJson(d) {
  const serials = [];
  const names = [];
  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 6) return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'serial_number' && typeof value === 'string') serials.push(value);
      else if ((key === 'world_wide_name' || key === 'logical_unit_id') && typeof value === 'string') names.push(value);
      else if (key === 'wwn' && value && typeof value === 'object' && Number.isFinite(value.id)) {
        names.push(`${Number(value.naa).toString(16)}${Number(value.oui).toString(16).padStart(6, '0')}${Number(value.id).toString(16).padStart(9, '0')}`);
      } else walk(value, depth + 1);
    }
  };
  walk(d, 0);
  return { serials: serials.filter(real).map(bare), names: names.filter(real).map(bare) };
}

function ouiOf(names) {
  for (const n of names) {
    const m = /^5([0-9a-f]{6})/.exec(n);
    if (m) return m[1];
  }
  return '';
}

function fromJson(d) {
  const protocol = String((d.device && d.device.protocol) || '').toUpperCase();
  if (protocol === 'NVME' || d.nvme_smart_health_information_log) refuse('nvme');
  if (d.rotation_rate === 0) refuse('ssd');
  const out = {};
  out.model_family = String(d.model_family || '').trim();
  out.model = String(d.model_name || d.scsi_model_name || '').trim();
  if (!out.model) throw new Error('I cannot find the drive\'s model in this output.');
  if (!d.user_capacity || !d.user_capacity.bytes) throw new Error('I cannot find the drive\'s capacity in this output.');
  out.capacity_tb = tb(d.user_capacity.bytes);
  out.interface = protocol === 'SCSI' ? 'sas' : 'sata';
  out.smartctl_version = d.smartctl && Array.isArray(d.smartctl.version) ? d.smartctl.version.join('.') : '';
  const table = (d.ata_smart_attributes && d.ata_smart_attributes.table) || [];
  let platters = Number(d.rotation_rate) > 0;
  for (const a of table) {
    if (PLATTER_ATTRIBUTES.includes(a.id)) platters = true;
    const name = ATTRIBUTES[a.id];
    if (!name || !a.raw) continue;
    const n = leadingInteger(a.raw.string !== undefined ? a.raw.string : a.raw.value);
    if (n !== null) out[name] = n;
  }
  if (out.interface === 'sata' && !platters) refuse('unsure');
  if (out.smart_poh === undefined && d.power_on_time && Number.isFinite(d.power_on_time.hours)) {
    out.smart_poh = String(d.power_on_time.hours);
  }
  if (out.smart_power_cycles === undefined && Number.isFinite(d.power_cycle_count)) {
    out.smart_power_cycles = String(d.power_cycle_count);
  }
  if (out.interface === 'sas' && Number.isFinite(d.scsi_grown_defect_list)) out.reallocated = String(d.scsi_grown_defect_list);
  return out;
}

function fromText(text) {
  if (/NVMe Version:|NVM Commands|SMART\/Health Information \(NVMe/.test(text)) refuse('nvme');
  if (/^[ \t]*Rotation Rate:[ \t]*Solid State Device/m.test(text)) refuse('ssd');
  if (all(text, /^(=== START OF INFORMATION SECTION ===)/m).length > 1) refuse('several');
  const out = {};
  // A SAS drive prints Vendor and Product where a SATA drive prints Device Model. Some
  // recertified SAS drives leave Vendor empty.
  const sas = /^[ \t]*Transport protocol:[ \t]*SAS/m.test(text) || (/^[ \t]*Product:/m.test(text) && !/^[ \t]*Device Model:/m.test(text));
  out.model_family = line(text, 'Model Family:');
  out.model = sas
    ? [line(text, 'Vendor:'), line(text, 'Product:')].filter((s) => s !== '').join(' ')
    : line(text, 'Device Model:');
  if (!out.model) {
    throw new Error('I cannot find the drive\'s model. Paste everything smartctl printed, from its first line.');
  }
  const cap = /^[ \t]*User Capacity:[ \t]*([\d,.'   ]+)[ \t]*bytes/m.exec(text);
  if (!cap) throw new Error('I cannot find the drive\'s capacity. Paste everything smartctl printed, from its first line.');
  out.capacity_tb = tb(cap[1].replace(/[^\d]/g, ''));
  out.interface = sas ? 'sas' : 'sata';
  const version = /^smartctl (\d+\.\d+)/m.exec(text);
  out.smartctl_version = version ? version[1] : '';

  if (sas) {
    const hours = /Accumulated power on time, hours:minutes[ \t]+(\d+):/m.exec(text)
      || /number of hours powered up[ \t]*=[ \t]*(\d+)/m.exec(text);
    if (hours) out.smart_poh = hours[1];
    const defects = /Elements in grown defect list:[ \t]*(\d+)/m.exec(text);
    if (defects) out.reallocated = defects[1];
    const cycles = /Accumulated start-stop cycles:[ \t]*(\d+)/m.exec(text);
    if (cycles) out.smart_power_cycles = cycles[1];
    return out;
  }

  const lines = text.split(/\r?\n/);
  const head = lines.findIndex((l) => /^\s*ID#\s+ATTRIBUTE_NAME/.test(l));
  if (head < 0) throw new Error('I cannot find the attribute table. Run smartctl with -a or -x and paste all of it.');
  // The old table has ten columns and the brief one eight; the raw value is everything after them.
  const before = /WHEN_FAILED/.test(lines[head]) ? 9 : 7;
  let platters = /^[ \t]*Rotation Rate:[ \t]*\d+[ \t]*rpm/m.test(text);
  // The table ends at the first blank line; the flag legend under a brief table is skipped.
  let ended = false;
  for (let n = head + 1; n < lines.length; n += 1) {
    const l = lines[n];
    if (l.trim() === '') {
      ended = true;
      break;
    }
    if (!/^\s*\d{1,3}\s+\S/.test(l)) continue;
    const parts = l.trim().split(/\s+/);
    const id = Number(parts[0]);
    if (PLATTER_ATTRIBUTES.includes(id)) platters = true;
    const name = ATTRIBUTES[id];
    if (!name || parts.length <= before) continue;
    const n2 = leadingInteger(parts.slice(before).join(' '));
    if (n2 !== null) out[name] = n2;
  }
  // smartctl always prints more under the table. A paste that stops inside it may have lost
  // the end of a number, and 9 would be read where the drive said 940.
  if (!ended) throw new Error('The output stops inside the attribute table. Paste all of it, down to its last line.');
  if (!platters) refuse('unsure');
  return out;
}

// What smartctl -l farm prints for a SATA drive and for a SAS drive, which label the same
// things differently.
function farmFromText(text) {
  const poh = /^[ \t]*Power on Hours?:[ \t]*(\d+)/m.exec(text);
  if (!poh) throw new Error('The FARM log is here and its power-on hours are not. Paste all of it.');
  const pick = (re) => {
    const m = re.exec(text);
    return m ? m[1] : '';
  };
  const assembly = pick(/^[ \t]*(?:Assembly Date \(YYWW\)|Date of Assembled):[ \t]*(\S+)/m);
  return {
    farm: 'read',
    farm_poh: poh[1],
    farm_spindle_poh: pick(/^[ \t]*Spindle Power on Hours:[ \t]*(\d+)/m),
    farm_head_flight_hours: pick(/^[ \t]*Head Flight Hours:[ \t]*(\d+)/m),
    farm_power_cycles: pick(/^[ \t]*Power Cycle [Cc]ount:[ \t]*(\d+)/m),
    farm_assembly_printed: /^\d{4}$/.test(assembly) ? assembly : '',
  };
}

// smartctl writes the log under different names for the two interfaces (farmprint.cpp):
// page_1_drive_information with poh for SATA, drive_information with power_on_hour for SAS.
function farmFromJson(log) {
  const n = (v) => (Number.isFinite(v) ? String(v) : '');
  const sata = log && log.page_1_drive_information;
  const sas = log && log.drive_information;
  if (sata && Number.isFinite(sata.poh)) {
    const assembly = String(sata.date_of_assembly || '').trim();
    return {
      farm: 'read',
      farm_poh: n(sata.poh),
      farm_spindle_poh: n(sata.spoh),
      farm_head_flight_hours: n(sata.head_flight_hours),
      farm_power_cycles: n(sata.power_cycle_count),
      farm_assembly_printed: /^\d{4}$/.test(assembly) ? assembly : '',
    };
  }
  if (sas && Number.isFinite(sas.power_on_hour)) {
    const assembly = String(sas.date_of_assembled || '').trim();
    return {
      farm: 'read',
      farm_poh: n(sas.power_on_hour),
      farm_spindle_poh: '',
      farm_head_flight_hours: '',
      farm_power_cycles: n(sas.power_cycle_count),
      farm_assembly_printed: /^\d{4}$/.test(assembly) ? assembly : '',
    };
  }
  return null;
}

// The JSON documents in a paste, if it holds smartctl's JSON. A prompt line above or below,
// a byte order mark, or a second document from a second command are all read past.
function documents(text) {
  return objectsIn(text).found.map((f) => f.value)
    .filter((d) => d.smartctl || d.device || d.model_name || d.seagate_farm_log);
}

// What smartctl says when it has no log to print (ataprint.cpp, scsiprint.cpp). It asks only a
// drive whose model it lists as Seagate's; any other drive is refused without being asked.
const NOT_ASKED = /FARM log \((?:GP Log 0xa6|SCSI Log page 0x3d, sub-page 0x3)\) not supported for non-Seagate drives/;
const NOT_KEPT = /FARM log \((?:GP Log 0xa6|SCSI Log page 0x3d, sub-page 0x3)\) not supported(?! for non-Seagate)/;
const KEPT_NOT_PRINTED = /Seagate FARM log \([^)]*\) supported \[try: -l farm\]/;

const NOTE_NOT_ASKED = 'smartctl did not ask this drive for its FARM log, because it does not list the model as a Seagate drive. The row records the log as not read.';
const NOTE_NOT_PRINTED = 'This drive keeps a FARM log and this output does not hold it. "smartctl -l farm" prints it, and it goes in the second box.';

// Returns { farm, ...values, note }. `drive.seagate` says the drive was made by Seagate, and
// `drive.listed` that its model is one smartctl itself takes for a Seagate drive; together
// they decide what "not supported" means.
export function readFarm(pasted, drive = { seagate: true, listed: true }) {
  const text = String(pasted || '');
  if (text.trim() === '') return { farm: 'not-provided' };
  const notAsked = drive.seagate && !drive.listed;
  const docs = documents(text);
  if (docs.length) {
    const logs = docs.map((d) => d.seagate_farm_log).filter(Boolean);
    for (const log of logs) {
      const read = farmFromJson(log);
      if (read) return read;
    }
    if (logs.some((log) => log.supported === true)) return { farm: 'not-provided', note: NOTE_NOT_PRINTED };
    if (logs.some((log) => log.supported === false)) {
      return notAsked ? { farm: 'not-provided', note: NOTE_NOT_ASKED } : { farm: 'not-supported' };
    }
    return { farm: drive.seagate ? 'not-provided' : 'not-supported' };
  }
  if (/Field Access Reliability Metrics/.test(text)) return farmFromText(text);
  if (NOT_KEPT.test(text)) return { farm: 'not-supported' };
  if (NOT_ASKED.test(text)) return notAsked ? { farm: 'not-provided', note: NOTE_NOT_ASKED } : { farm: 'not-supported' };
  if (KEPT_NOT_PRINTED.test(text)) return { farm: 'not-provided', note: NOTE_NOT_PRINTED };
  return null;
}

export function readSmart(pasted) {
  const text = String(pasted || '').replace(/^﻿/, '');
  if (text.trim() === '') throw new Error('Nothing is pasted in the smartctl box.');
  const docs = documents(text);
  let out;
  let ids;
  if (docs.length) {
    const drives = docs.filter((d) => d.model_name || d.scsi_model_name || d.user_capacity);
    if (drives.length === 0) throw new Error('I cannot find the drive\'s model in this output.');
    out = fromJson(drives[0]);
    ids = identifiersInJson(docs);
  } else {
    if (/^\s*\{/.test(text)) throw new Error('This starts like JSON and is cut off. Paste the whole output.');
    out = fromText(text);
    ids = identifiersInText(text);
  }
  if (new Set(ids.serials).size > 1) refuse('several');
  if (out.smart_poh === undefined) throw new Error('I cannot find the power-on hours in this output.');
  out.drive_vendor = vendorOf(out.model, out.model_family, ouiOf(ids.names));
  return { smart: out, ids };
}

// The machine half of a report, from the two boxes.
export function readDrive(smartText, farmText) {
  const { smart, ids } = readSmart(smartText);
  const drive = {
    seagate: smart.drive_vendor === 'seagate',
    listed: /^(ST\d|SEAGATE)/i.test(smart.model) || /SEAGATE/i.test(smart.model_family || ''),
  };
  let farm;
  if (String(farmText || '').trim() === '') {
    // Whatever the first box says about the log, which may be the log itself.
    farm = readFarm(smartText, drive) || { farm: 'not-provided' };
  } else {
    farm = readFarm(farmText, drive);
    if (!farm) {
      throw new Error('I cannot find a FARM log in the second box. It is what "smartctl -l farm" prints, and it needs smartctl 7.4 or later.');
    }
  }
  if (farm.farm === 'not-provided' && !farm.note && !drive.seagate) farm = { farm: 'not-supported' };

  const farmIds = String(farmText || '').trim() === '' ? { serials: [], names: [] }
    : (documents(String(farmText)).length ? identifiersInJson(documents(String(farmText))) : identifiersInText(String(farmText)));
  const serials = new Set([...ids.serials, ...farmIds.serials]);
  if (serials.size > 1) refuse('several');

  const machine = derive({
    drive_vendor: smart.drive_vendor,
    model_family: smart.model_family || '',
    model: smart.model,
    capacity_tb: smart.capacity_tb,
    interface: smart.interface,
    smartctl_version: smart.smartctl_version || '',
    smart_poh: smart.smart_poh,
    smart_power_cycles: smart.smart_power_cycles || '',
    reallocated: smart.reallocated || '',
    pending: smart.pending || '',
    offline_uncorrectable: smart.offline_uncorrectable || '',
    crc_errors: smart.crc_errors || '',
    load_cycles: smart.load_cycles || '',
    farm: farm.farm,
    farm_poh: farm.farm_poh || '',
    farm_spindle_poh: farm.farm_spindle_poh || '',
    farm_head_flight_hours: farm.farm_head_flight_hours || '',
    farm_power_cycles: farm.farm_power_cycles || '',
    farm_assembly_printed: farm.farm_assembly_printed || '',
  });

  // Nothing that names this one drive may be in the row, whatever shape the paste had.
  const named = [...serials, ...ids.names, ...farmIds.names];
  for (const value of Object.values(machine)) {
    const v = bare(value);
    if (v.length >= 6 && named.some((id) => v.includes(id) || id.includes(v))) refuse('leak');
  }
  if (/serial|wwn|world wide/i.test(`${machine.model} ${machine.model_family}`)) refuse('leak');
  return { machine, suggested: {}, note: farm.note || '' };
}
