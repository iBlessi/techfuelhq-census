# TechFuelHQ GPU Hotspot Delta Census

Core and hotspot temperatures read from the GPU die in software during the same sustained load, with the tool and its version recorded beside every row.

One row is one software sensor reading from one card under one sustained load. A row counts toward published figures when the card keeps its original factory cooler and thermal material, uses stock power settings, ran the load for at least ten minutes, and is not an RTX 50 reading from a tool without a primary-source version floor. Exact models publish at five counted rows; GPU families publish a median and the Q1-to-Q3 interval at twenty counted rows.

- The page, with what has published and the tool that builds a report: https://techfuelhq.com/data/gpu-hotspot-delta-census/
- The data: [`data/submissions.csv`](data/submissions.csv)
- The counts and published figures: [`summary.json`](summary.json)
- The row as a JSON Schema: [`schema.json`](schema.json)
- To report: https://github.com/iBlessi/techfuelhq-census/issues/new?template=gpu-hotspot-delta.yml

Dataset version 0.1.0. Data licensed CC BY 4.0.

## Fields

In the CSV every value is text, and an empty cell means the field was left out.

| Field | Required | Comes from | Allowed | What it records |
|---|---|---|---|---|
| `card_brand` | yes | you | up to 40 characters | Card brand |
| `card_model` | yes | you | up to 80 characters | Card model |
| `exact_sku` | no | you | up to 100 characters | Exact SKU. The full SKU from the card label, if it is handy. |
| `gpu_family` | yes | you | `rtx-50`, `rtx-40`, `rtx-30`, `rx-9000`, `rx-7000`, `rx-6000`, `arc`, `other` | GPU family |
| `core_temp_c` | yes | you | 20 to 100, whole number | GPU core temperature (C) |
| `hotspot_temp_c` | yes | you | 20 to 125, whole number | GPU hotspot temperature (C) |
| `delta_c` | no | worked out from the row | 0 to 105, whole number | Hotspot minus core (C) |
| `reading_type` | yes | you | `both-max-same-session`, `simultaneous-snapshot` | How the two temperatures were read |
| `load_type` | yes | you | `game-sustained`, `furmark`, `3dmark-stress-test`, `other` | Load |
| `load_minutes` | yes | you | 10 or more, whole number | Minutes under load |
| `tool` | yes | you | `hwinfo64`, `hwmonitor`, `gpu-z`, `msi-afterburner`, `lact`, `amd-software`, `other` | Sensor tool |
| `tool_version` | yes | you | up to 40 characters | Sensor tool version |
| `blackwell_tool_unverified` | no | worked out from the row | `no`, `yes` | RTX 50 tool verification flag |
| `cooler_state` | yes | you | `original-factory`, `repasted`, `repasted-and-repadded`, `aftermarket-air`, `waterblock` | Cooler and thermal material |
| `months_since_paste` | yes | you | 0 or more, whole number | Months since the thermal paste was applied. Use the age of the card if it has its factory paste. |
| `power_state` | yes | you | `stock`, `undervolted`, `power-limit-raised`, `overclocked` | Power state |
| `mount` | no | you | `horizontal`, `vertical`, `open-bench` | Card mount |
| `ambient_c` | no | you | whole number | Room temperature (C) |
| `power_draw_w` | no | you | 0 or more, whole number | GPU power draw (W) |
| `fan_mode` | no | you | `auto`, `custom` | Fan control |
| `notes` | no | you | up to 280 characters | Notes |
| `submitted_date` | yes | the maintainer | YYYY-MM-DD | The day the report was sent |
| `source_issue` | no | the maintainer | 1 or more, whole number | The issue the row came from |

## What each value means

### `gpu_family`

| Value | Meaning |
|---|---|
| `rtx-50` | NVIDIA GeForce RTX 50 series |
| `rtx-40` | NVIDIA GeForce RTX 40 series |
| `rtx-30` | NVIDIA GeForce RTX 30 series |
| `rx-9000` | AMD Radeon RX 9000 series |
| `rx-7000` | AMD Radeon RX 7000 series |
| `rx-6000` | AMD Radeon RX 6000 series |
| `arc` | Intel Arc |
| `other` | Another GPU family |

### `reading_type`

| Value | Meaning |
|---|---|
| `both-max-same-session` | Maximum core and hotspot temperatures from the same session |
| `simultaneous-snapshot` | Core and hotspot temperatures at the same moment |

### `load_type`

| Value | Meaning |
|---|---|
| `game-sustained` | A game, sustained |
| `furmark` | FurMark |
| `3dmark-stress-test` | 3DMark stress test |
| `other` | Another sustained load |

### `tool`

| Value | Meaning |
|---|---|
| `hwinfo64` | HWiNFO64 |
| `hwmonitor` | CPUID HWMonitor |
| `gpu-z` | GPU-Z |
| `msi-afterburner` | MSI Afterburner |
| `lact` | LACT |
| `amd-software` | AMD Software |
| `other` | Another software sensor tool |

### `blackwell_tool_unverified`

| Value | Meaning |
|---|---|
| `no` | Not flagged |
| `yes` | Blackwell tool version is not verified from a primary changelog |

### `cooler_state`

| Value | Meaning |
|---|---|
| `original-factory` | Original factory cooler and thermal material |
| `repasted` | Repasted |
| `repasted-and-repadded` | Repasted and repadded |
| `aftermarket-air` | Aftermarket air cooler |
| `waterblock` | Waterblock |

### `power_state`

| Value | Meaning |
|---|---|
| `stock` | Stock power settings |
| `undervolted` | Undervolted |
| `power-limit-raised` | Power limit raised |
| `overclocked` | Overclocked |

### `mount`

| Value | Meaning |
|---|---|
| `horizontal` | Card mounted horizontally |
| `vertical` | Card mounted vertically |
| `open-bench` | Open bench |

### `fan_mode`

| Value | Meaning |
|---|---|
| `auto` | Automatic fan control |
| `custom` | Custom fan control |
