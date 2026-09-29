// Reads the POST time command's output on Windows, and systemd-analyze's line on Linux.
import { parseBlock, text, whole } from './block.js';

export function readWindows(pasted) {
  const b = parseBlock(pasted, 'post-time');
  const ms = Number(b.fw_post_ms);
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new Error('This machine did not record a firmware time. Windows takes it from the firmware, and some boards do not report it.');
  }
  const machine = {
    os: 'windows',
    cpu: text(b.cpu, 80),
    board_vendor: text(b.board_vendor, 60),
    board: text(b.board, 80),
    bios_version: text(b.bios_version, 40),
    bios_date: /^\d{4}-\d{2}-\d{2}$/.test(String(b.bios_date || '')) ? String(b.bios_date) : '',
    dimms: whole(b.dimms, 'dimms'),
    ram_gb: whole(b.ram_gb, 'ram_gb'),
    ram_speed: Number(b.ram_speed) > 0 ? whole(b.ram_speed, 'ram_speed') : '',
    fast_startup: b.fast_startup === 1 ? 'on' : b.fast_startup === 0 ? 'off' : 'unknown',
    fw_post_ms: whole(ms, 'fw_post_ms'),
    os_build: text(b.os_build, 40),
  };
  return { machine, suggested: { platform: suggestPlatform(machine.cpu) } };
}

// systemd writes spans as "1min 2.345s", "12.004s" or "534ms".
export function spanToMs(span) {
  let ms = 0;
  let matched = false;
  const re = /(\d+(?:\.\d+)?)\s*(min|ms|s|h)\b/g;
  let m = re.exec(span);
  while (m) {
    matched = true;
    const n = Number(m[1]);
    if (m[2] === 'h') ms += n * 3600000;
    else if (m[2] === 'min') ms += n * 60000;
    else if (m[2] === 's') ms += n * 1000;
    else ms += n;
    m = re.exec(span);
  }
  if (!matched) throw new Error(`I cannot read the time "${span}".`);
  return Math.round(ms);
}

export function readSystemdAnalyze(pasted) {
  const line = String(pasted || '').split(/\r?\n/).find((l) => /Startup finished in/.test(l));
  if (!line) throw new Error('I cannot find the line that starts "Startup finished in". Paste what systemd-analyze printed.');
  const m = /Startup finished in\s+(.+?)\s+\(firmware\)/.exec(line);
  if (!m) {
    throw new Error('This line has no firmware time. systemd reports one only on a machine that booted through UEFI with a loader that passes it on.');
  }
  return { machine: { os: 'linux', fast_startup: 'not-applicable', fw_post_ms: String(spanToMs(m[1])) }, suggested: {} };
}

// A starting guess for the platform select, from the processor's name. The person confirms it.
export function suggestPlatform(cpu) {
  const name = String(cpu || '');
  const ryzen = /Ryzen\s+(?:\d\s+)?(?:PRO\s+)?(\d)(\d{3})([A-Z0-9]*)/i.exec(name);
  if (ryzen) {
    const series = Number(ryzen[1]);
    const suffix = ryzen[3].toUpperCase();
    if (/^(H|HS|HX|HX3D|U)$/.test(suffix)) return 'other';
    if (series >= 7) return 'am5';
    if (series >= 1) return 'am4';
  }
  const ultra = /Core\(TM\)\s+Ultra\s+\d\s+(\d{3})([A-Z]*)/i.exec(name);
  if (ultra) {
    const suffix = ultra[2].toUpperCase();
    if (/^2/.test(ultra[1]) && /^(K|KF|F|T|)$/.test(suffix)) return 'lga1851';
    return 'other';
  }
  const core = /i[3579]-(1[234])\d{3}([A-Z]*)/i.exec(name);
  if (core) {
    const suffix = core[2].toUpperCase();
    if (/^(K|KF|KS|F|T|)$/.test(suffix)) return 'lga1700';
    return 'other';
  }
  return 'other';
}
