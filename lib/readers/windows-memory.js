// Reads the Windows memory command's output.
import { parseBlock, text, whole } from './block.js';
import { derive, IDLE_UPTIME_MIN, IDLE_UPTIME_MAX } from '../../censuses/windows-memory/definition.js';

const MB = ['visible_mb', 'available_mb', 'committed_mb', 'commit_limit_mb', 'cache_mb', 'standby_mb', 'modified_mb', 'free_mb', 'paged_pool_mb', 'nonpaged_pool_mb'];

export function readWindows(pasted) {
  const b = parseBlock(pasted, 'windows-memory');
  if (!(Number(b.installed_gb) > 0)) {
    throw new Error('This machine reports no installed memory modules. A virtual machine does that, and the census counts physical machines.');
  }
  const machine = { installed_gb: whole(b.installed_gb, 'installed_gb') };
  for (const name of MB) machine[name] = whole(b[name], name);
  machine.processes = whole(b.processes, 'processes');
  machine.startup_items = b.startup_items === undefined || b.startup_items === null ? '' : whole(b.startup_items, 'startup_items');
  machine.uptime_min = whole(b.uptime_min, 'uptime_min');
  machine.os_caption = text(b.os_caption, 80);
  machine.os_build = text(b.os_build, 20);
  const derived = derive(machine);
  const up = Number(machine.uptime_min);
  return {
    machine: derived,
    suggested: { state: up >= IDLE_UPTIME_MIN && up <= IDLE_UPTIME_MAX ? 'fresh-boot-idle' : 'in-use' },
  };
}
