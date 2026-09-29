# Where the test data comes from

The readers are tested against output that real tools printed. Each file below says where it
was read and what was changed. Serial numbers and world wide names were replaced with
`[removed]` or zeroed in every file that carried one.

## pin-current

| File | Source | Changed |
|---|---|---|
| `astral-hwmon-burn-2hz.csv` | [ksokolowski/astral-hwmon](https://github.com/ksokolowski/astral-hwmon), `docs/measurements/2026-08-14/burn-2hz.csv`, at commit `a4a0badd`. A 2.7 minute capture from a ROG Astral RTX 5090 OC. Its README states 322 samples, 235 of them at 35 A total or more, a peak of 48.26 A total and 8.56 A on the busiest pin, and a minimum of 11.944 V; the test checks the reader against those figures. | Nothing |
| `12vhpwr-guard-flight-made-up.csv` | Written for this test in the layout that `FlightRecorder.dump` produces in [humza-khalid/12vhpwr-guard](https://github.com/humza-khalid/12vhpwr-guard), `hwinfo_12vhpwr_guard.py`, at commit `1c230580`. | The values are made up. No card produced them. |

astral-hwmon's documentation and tools are MIT licensed:

> MIT License. Copyright (c) 2026 Krzysztof Sokołowski. Permission is hereby granted, free of
> charge, to any person obtaining a copy of this software and associated documentation files
> (the "Software"), to deal in the Software without restriction, including without limitation
> the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
> the Software, and to permit persons to whom the Software is furnished to do so, subject to the
> following conditions: The above copyright notice and this permission notice shall be included
> in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS",
> WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
> OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
> ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE
> OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## drive-arrival

| File | Source | Changed |
|---|---|---|
| `exos-20tb-smartctl-a.txt`, `exos-20tb-farm.txt` | A comment on [gamestailer94/farm-check issue 14](https://github.com/gamestailer94/farm-check/issues/14): `smartctl -a` and `smartctl -l farm` from a Seagate Exos 20 TB, smartctl 7.4. | Serial number and world wide name removed |
| `exos-24tb-smartctl-x-farm.txt` | The log linked from the same issue, [a public gist by signalhunter](https://gist.github.com/signalhunter/d5e849707e3b684dbe5866beea391102): `smartctl -x` and the FARM log from a Seagate Exos 24 TB. | Nothing; the serial number was already removed at the source |
| `wd-14tb-smartctl-a.json`, `samsung-ssd-smartctl-x.json`, `intel-nvme-smartctl-a.json`, `seagate-sas-smartctl.json` | [AnalogJ/scrutiny](https://github.com/AnalogJ/scrutiny), `webapp/backend/pkg/models/testdata/` (`smart-ata.json`, `smart-ata-full.json`, `smart-nvme.json`, `smart-scsi.json`), at commit `0948f670`. | Serial number replaced, world wide name zeroed, re-indented |

Scrutiny is MIT licensed: Copyright (c) 2020 Jason Kulatunga, under the same MIT terms quoted
above.

The layout of the FARM log, its JSON key names and the two "not supported" messages were read
from `src/farmprint.cpp` and `src/ataprint.cpp` in
[smartmontools/smartmontools](https://github.com/smartmontools/smartmontools).

## post-time and windows-memory

| File | Source | Changed |
|---|---|---|
| `post-time/windows-7800x3d-b650.json` | The POST time command, run on 2026-09-29 on my own machine: Ryzen 7 7800X3D, ROG STRIX B650-A GAMING WIFI, BIOS 3881, Windows 11 build 26200. | Nothing |
| `windows-memory/windows-32gb-in-use.json` | The Windows memory command, run on the same machine the same day, 507 minutes after boot and in use. | Nothing |

The layout of the `systemd-analyze` line was read from `src/analyze/analyze-time-data.c` in
[systemd/systemd](https://github.com/systemd/systemd). The two lines without a firmware time are
the examples in its manual page.
