# TechFuelHQ 12V-2x6 Pin Current Census

How evenly the six 12 V pins of a 16-pin graphics card connector share the current, read from hardware that measures each pin.

One row is one connector on one card, read once under one load. A row counts toward a published distribution when its total current is 6 A or more and it is an ordinary reading. The minute a guard tool saved as it stepped in is kept as a row and left out of the distribution. Rows are grouped by cable type, and a group publishes once it holds five counted rows.

- The page, with what has published and the tool that builds a report: https://techfuelhq.com/data/pin-current-census/
- The data: [`data/submissions.csv`](data/submissions.csv)
- The counts and published figures: [`summary.json`](summary.json)
- The row as a JSON Schema: [`schema.json`](schema.json)
- To report: https://github.com/iBlessi/techfuelhq-census/issues/new?template=pin-current.yml

Dataset version 0.1.0. Data licensed CC BY 4.0.

## Fields

In the CSV every value is text, and an empty cell means the field was left out.

| Field | Required | Comes from | Allowed | What it records |
|---|---|---|---|---|
| `card_brand` | yes | you | up to 40 characters | Card brand. As printed on the box: ASUS, MSI, Gigabyte. |
| `card_model` | yes | you | up to 80 characters | Card model. The model line: ROG Astral RTX 5080 OC. |
| `gpu` | yes | you | up to 24 characters, matches `^(RTX\|RX\|Arc) [0-9A-Za-z ]{3,18}$` | GPU. The chip, written like RTX 5080 or RX 9070 XT. |
| `sensor` | yes | you | `asus-power-detector`, `astral-hwmon`, `12vhpwr-guard`, `hwinfo`, `wireview-pro-ii`, `other` | What measured it |
| `capture` | yes | the reading | `log`, `single-reading`, `guard-event` | Capture |
| `cable_type` | yes | you | `native-16pin`, `native-8pin-psu-side`, `boxed-adapter`, `third-party` | Cable. What carries power from the supply to the card. |
| `inline_part` | yes | you | `none`, `angled-adapter`, `extension`, `inline-meter` | Anything between cable and card |
| `psu_brand` | yes | you | up to 40 characters | Power supply brand |
| `psu_model` | yes | you | up to 80 characters | Power supply model. With its wattage if that is part of the name: RM1000x. |
| `psu_watts` | no | you | 300 to 3000, whole number | Power supply watts |
| `months_in_use` | yes | you | 0 to 120, whole number | Months this cable has been in this card. Whole months since it was last plugged in. A cable reseated last week is 0. |
| `load_kind` | yes | you | `gaming`, `stress-test`, `compute`, `desktop` | What the card was doing |
| `load_name` | no | you | up to 60 characters | Which one. The game or test by name. |
| `samples` | yes | the reading | 1 to 10000000, whole number | Samples counted |
| `duration_s` | yes | the reading | 0 to 864000, whole number | Seconds covered |
| `total_a` | yes | the reading | 0.5 to 80, up to 2 decimal places | Total current, mean (A) |
| `pin1_a` | yes | the reading | 0 to 30, up to 2 decimal places | Pin 1, mean (A) |
| `pin2_a` | yes | the reading | 0 to 30, up to 2 decimal places | Pin 2, mean (A) |
| `pin3_a` | yes | the reading | 0 to 30, up to 2 decimal places | Pin 3, mean (A) |
| `pin4_a` | yes | the reading | 0 to 30, up to 2 decimal places | Pin 4, mean (A) |
| `pin5_a` | yes | the reading | 0 to 30, up to 2 decimal places | Pin 5, mean (A) |
| `pin6_a` | yes | the reading | 0 to 30, up to 2 decimal places | Pin 6, mean (A) |
| `peak_pin_a` | yes | the reading | 0 to 30, up to 2 decimal places | Highest single pin seen (A) |
| `peak_total_a` | yes | the reading | 0.5 to 80, up to 2 decimal places | Highest total seen (A) |
| `min_v` | no | the reading | 9 to 14, up to 3 decimal places | Lowest pin voltage seen (V) |
| `imbalance` | yes | worked out from the row | 1 to 6, up to 3 decimal places | Busiest pin over the average pin |
| `max_share_pct` | yes | worked out from the row | 16.6 to 100, up to 1 decimal place | Busiest pin's share of the total (%) |
| `band` | yes | worked out from the row | `idle`, `moderate`, `high` | Load band |
| `notes` | no | you | up to 280 characters | Notes |
| `submitted_date` | yes | the maintainer | YYYY-MM-DD | The day the report was sent |
| `source_issue` | no | the maintainer | 1 or more, whole number | The issue the row came from |

## What each value means

### `sensor`

| Value | Meaning |
|---|---|
| `asus-power-detector` | ASUS GPU Tweak III, Power Detector+ |
| `astral-hwmon` | astral-hwmon (Linux) |
| `12vhpwr-guard` | 12VHPWR Guard (Windows) |
| `hwinfo` | HWiNFO |
| `wireview-pro-ii` | Thermal Grizzly WireView Pro II |
| `other` | Something else (say what in the notes) |

### `capture`

| Value | Meaning |
|---|---|
| `log` | A log over time |
| `single-reading` | Six numbers read once |
| `guard-event` | The minute 12VHPWR Guard saved as it stepped in |

### `cable_type`

| Value | Meaning |
|---|---|
| `native-16pin` | The supply maker's cable, 16-pin at both ends |
| `native-8pin-psu-side` | The supply maker's cable, 8-pin sockets at the supply, 16-pin at the card |
| `boxed-adapter` | The adapter that came in the card's box |
| `third-party` | A cable or adapter from another company |

### `inline_part`

| Value | Meaning |
|---|---|
| `none` | Nothing |
| `angled-adapter` | An angled adapter |
| `extension` | An extension cable |
| `inline-meter` | An inline meter |

### `load_kind`

| Value | Meaning |
|---|---|
| `gaming` | A game |
| `stress-test` | A stress test or benchmark |
| `compute` | Rendering, training or inference |
| `desktop` | Sitting at the desktop |

### `band`

| Value | Meaning |
|---|---|
| `idle` | Under 6 A total |
| `moderate` | 6 to 25 A total |
| `high` | 25 A total and above |
