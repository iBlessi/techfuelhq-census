// Reads smartctl output for one hard drive: the -a or -x text, the same in JSON (-j), and the
// Seagate FARM log (-l farm) as text or JSON. Serial numbers and world wide names are read past
// and never copied into a report.
import { fixed } from '../validate.js';
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

export function vendorOf(model, family) {
  const m = String(model || '').trim().toUpperCase();
  const f = String(family || '').toUpperCase();
  if (/^ST\d/.test(m) || /^SEAGATE/.test(m) || /SEAGATE/.test(f)) return 'seagate';
  if (/^(HGST|HUH|HUS|HDN|HMS)/.test(m) || /HGST|HITACHI/.test(f)) return 'hgst';
  if (/^(WDC|WD|WUH|WUS)/.test(m) || /WESTERN DIGITAL/.test(f)) return 'wd';
  if (/^(TOSHIBA|MG\d|MD\d|MN\d|HDW)/.test(m) || /TOSHIBA/.test(f)) return 'toshiba';
  return 'other';
}

// Serial numbers, world wide names and the like, blanked in any text shown back to the person.
export function redact(text) {
  return String(text || '')
    .replace(/^(\s*Serial [Nn]umber:\s*)\S.*$/gm, '$1[removed]')
    .replace(/^(\s*LU WWN Device Id:\s*)\S.*$/gm, '$1[removed]')
    .replace(/^(\s*World Wide Name:\s*)\S.*$/gm, '$1[removed]')
    .replace(/^(\s*Logical Unit id:\s*)\S.*$/gm, '$1[removed]')
    .replace(/("serial_number"\s*:\s*)"[^"]*"/g, '$1"[removed]"')
    .replace(/("world_wide_name"\s*:\s*)"[^"]*"/g, '$1"[removed]"');
}

function leadingInteger(raw) {
  const m = /^(\d+)/.exec(String(raw).trim());
  return m ? m[1] : null;
}

function looksLikeJson(text) {
  return /^\s*\{/.test(text);
}

function tb(bytes) {
  return fixed(Number(bytes) / 1e12, 2);
}

function refuse(kind) {
  const why = {
    nvme: 'This is an NVMe drive. The census counts hard drives.',
    ssd: 'This is a solid state drive. The census counts hard drives.',
  };
  throw new Error(why[kind]);
}

function fromJson(d) {
  const protocol = String((d.device && d.device.protocol) || '').toUpperCase();
  if (protocol === 'NVME') refuse('nvme');
  if (d.rotation_rate === 0) refuse('ssd');
  const out = {};
  out.model_family = String(d.model_family || '').trim();
  out.model = String(d.model_name || '').trim();
  if (!out.model) throw new Error('I cannot find the drive\'s model in this output.');
  if (!d.user_capacity || !d.user_capacity.bytes) throw new Error('I cannot find the drive\'s capacity in this output.');
  out.capacity_tb = tb(d.user_capacity.bytes);
  out.interface = protocol === 'SCSI' ? 'sas' : 'sata';
  out.smartctl_version = d.smartctl && Array.isArray(d.smartctl.version) ? d.smartctl.version.join('.') : '';
  const table = (d.ata_smart_attributes && d.ata_smart_attributes.table) || [];
  for (const a of table) {
    const name = ATTRIBUTES[a.id];
    if (!name || !a.raw) continue;
    const n = leadingInteger(a.raw.string !== undefined ? a.raw.string : a.raw.value);
    if (n !== null) out[name] = n;
  }
  if (out.smart_poh === undefined && d.power_on_time && Number.isFinite(d.power_on_time.hours)) {
    out.smart_poh = String(d.power_on_time.hours);
  }
  if (out.smart_power_cycles === undefined && Number.isFinite(d.power_cycle_count)) {
    out.smart_power_cycles = String(d.power_cycle_count);
  }
  if (out.interface === 'sas' && Number.isFinite(d.scsi_grown_defect_list)) out.reallocated = String(d.scsi_grown_defect_list);
  return out;
}

function line(text, label) {
  const re = new RegExp(`^\\s*${label}\\s*(.*)$`, 'm');
  const m = re.exec(text);
  return m ? m[1].trim() : '';
}

function fromText(text) {
  if (/NVMe Version:|NVM Commands|SMART\/Health Information \(NVMe/.test(text)) refuse('nvme');
  if (/^\s*Rotation Rate:\s*Solid State Device/m.test(text)) refuse('ssd');
  const out = {};
  const sas = /^\s*Transport protocol:\s*SAS/m.test(text) || /^\s*Vendor:\s+\S/m.test(text);
  out.model_family = line(text, 'Model Family:');
  out.model = sas
    ? `${line(text, 'Vendor:')} ${line(text, 'Product:')}`.trim()
    : line(text, 'Device Model:');
  if (!out.model) {
    throw new Error('I cannot find the drive\'s model. Paste everything smartctl printed, from its first line.');
  }
  const cap = /^\s*User Capacity:\s*([\d,.\s]+)\s*bytes/m.exec(text);
  if (!cap) throw new Error('I cannot find the drive\'s capacity. Paste everything smartctl printed, from its first line.');
  out.capacity_tb = tb(cap[1].replace(/[^\d]/g, ''));
  out.interface = sas ? 'sas' : 'sata';
  const version = /^smartctl (\d+\.\d+)/m.exec(text);
  out.smartctl_version = version ? version[1] : '';

  if (sas) {
    const hours = /Accumulated power on time, hours:minutes\s+(\d+):/m.exec(text)
      || /number of hours powered up\s*=\s*(\d+)/m.exec(text);
    if (hours) out.smart_poh = hours[1];
    const defects = /Elements in grown defect list:\s*(\d+)/m.exec(text);
    if (defects) out.reallocated = defects[1];
    const cycles = /Accumulated start-stop cycles:\s*(\d+)/m.exec(text);
    if (cycles) out.smart_power_cycles = cycles[1];
    return out;
  }

  const lines = text.split(/\r?\n/);
  const head = lines.findIndex((l) => /^\s*ID#\s+ATTRIBUTE_NAME/.test(l));
  if (head < 0) throw new Error('I cannot find the attribute table. Run smartctl with -a or -x and paste all of it.');
  // The old table has ten columns and the brief one eight; the raw value is everything after them.
  const before = /WHEN_FAILED/.test(lines[head]) ? 9 : 7;
  // The table ends at the first blank line; the flag legend under a brief table is skipped.
  for (let n = head + 1; n < lines.length; n += 1) {
    const l = lines[n];
    if (l.trim() === '') break;
    if (!/^\s*\d{1,3}\s+\S/.test(l)) continue;
    const parts = l.trim().split(/\s+/);
    const name = ATTRIBUTES[Number(parts[0])];
    if (!name || parts.length <= before) continue;
    const n2 = leadingInteger(parts.slice(before).join(' '));
    if (n2 !== null) out[name] = n2;
  }
  return out;
}

export function readSmart(pasted) {
  const text = String(pasted || '');
  if (text.trim() === '') throw new Error('Nothing is pasted in the smartctl box.');
  let out;
  if (looksLikeJson(text)) {
    let d;
    try {
      d = JSON.parse(text);
    } catch (e) {
      throw new Error('This starts like JSON and is cut off. Paste the whole output.');
    }
    out = fromJson(d);
    if (d.seagate_farm_log && d.seagate_farm_log.page_1_drive_information) out.farmJson = d.seagate_farm_log;
  } else {
    out = fromText(text);
  }
  if (out.smart_poh === undefined) throw new Error('I cannot find the power-on hours in this output.');
  out.drive_vendor = vendorOf(out.model, out.model_family);
  return out;
}

export function readFarm(pasted, embedded) {
  const text = String(pasted || '');
  if (embedded) return farmFromJson(embedded);
  if (text.trim() === '') return { farm: 'not-provided' };
  if (looksLikeJson(text)) {
    let d;
    try {
      d = JSON.parse(text);
    } catch (e) {
      throw new Error('The FARM output starts like JSON and is cut off. Paste the whole output.');
    }
    const log = d.seagate_farm_log;
    if (!log || log.supported === false || !log.page_1_drive_information) return { farm: 'not-supported' };
    return farmFromJson(log);
  }
  if (/FARM log \(GP Log 0xa6\) not supported|FARM log \(SCSI Log page 0x3d, sub-page 0x3\) not supported/.test(text)) {
    return { farm: 'not-supported' };
  }
  if (!/Field Access Reliability Metrics/.test(text)) {
    throw new Error('I cannot find a FARM log in the second box. It is what "smartctl -l farm" prints, and it needs smartctl 7.4 or later.');
  }
  const poh = /^\s*Power on Hours?:\s*(\d+)/m.exec(text);
  if (!poh) throw new Error('The FARM log is here and its power-on hours are not. Paste all of it.');
  const pick = (re) => {
    const m = re.exec(text);
    return m ? m[1] : '';
  };
  const assembly = pick(/^\s*Assembly Date \(YYWW\):\s*(\S+)/m);
  return {
    farm: 'read',
    farm_poh: poh[1],
    farm_spindle_poh: pick(/^\s*Spindle Power on Hours:\s*(\d+)/m),
    farm_head_flight_hours: pick(/^\s*Head Flight Hours:\s*(\d+)/m),
    farm_power_cycles: pick(/^\s*Power Cycle [Cc]ount:\s*(\d+)/m),
    farm_assembly_yyww: /^\d{4}$/.test(assembly) ? assembly : '',
  };
}

function farmFromJson(log) {
  const p = log.page_1_drive_information;
  if (!p || !Number.isFinite(p.poh)) return { farm: 'not-supported' };
  const n = (v) => (Number.isFinite(v) ? String(v) : '');
  const assembly = String(p.date_of_assembly || '').trim();
  return {
    farm: 'read',
    farm_poh: n(p.poh),
    farm_spindle_poh: n(p.spoh),
    farm_head_flight_hours: n(p.head_flight_hours),
    farm_power_cycles: n(p.power_cycle_count),
    farm_assembly_yyww: /^\d{4}$/.test(assembly) ? assembly : '',
  };
}

// The machine half of a report, from the two boxes.
export function readDrive(smartText, farmText) {
  const smart = readSmart(smartText);
  const embedded = smart.farmJson;
  delete smart.farmJson;
  let farm = readFarm(farmText, embedded);
  // A FARM log pasted in with the smartctl text, in one box, is read from there.
  if (farm.farm === 'not-provided' && /Field Access Reliability Metrics/.test(String(smartText))) {
    farm = readFarm(smartText);
  }
  if (farm.farm === 'not-provided' && smart.drive_vendor !== 'seagate') farm = { farm: 'not-supported' };
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
    farm_assembly_yyww: farm.farm_assembly_yyww || '',
  });
  return { machine, suggested: {} };
}
