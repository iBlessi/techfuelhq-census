// The censuses this repository holds, by id.
import pinCurrent from '../censuses/pin-current/definition.js';
import oledBurnIn from '../censuses/oled-burn-in/definition.js';
import postTime from '../censuses/post-time/definition.js';
import driveArrival from '../censuses/drive-arrival/definition.js';
import windowsMemory from '../censuses/windows-memory/definition.js';
import gpuHotspotDelta from '../censuses/gpu-hotspot-delta/definition.js';

export const REPO = 'iBlessi/techfuelhq-census';

export const CENSUSES = {
  'pin-current': pinCurrent,
  'oled-burn-in': oledBurnIn,
  'post-time': postTime,
  'drive-arrival': driveArrival,
  'windows-memory': windowsMemory,
  'gpu-hotspot-delta': gpuHotspotDelta,
};

export const IDS = Object.keys(CENSUSES);

export function censusOf(id) {
  const def = CENSUSES[id];
  if (!def) throw new Error(`There is no census called "${id}". The censuses are: ${IDS.join(', ')}.`);
  return def;
}
