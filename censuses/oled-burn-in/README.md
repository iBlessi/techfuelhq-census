# TechFuelHQ OLED Monitor Burn-In Census

What owners of OLED monitors see on their own panels after months and years of use, on a fixed five-step scale.

One row is one monitor, judged once. A row counts once the monitor has been in regular use for a month or more. Rows are grouped by panel type, and a group publishes once it holds five counted rows.

- The page, with what has published and the tool that builds a report: https://techfuelhq.com/data/oled-burn-in-census/
- The data: [`data/submissions.csv`](data/submissions.csv)
- The counts and published figures: [`summary.json`](summary.json)
- The row as a JSON Schema: [`schema.json`](schema.json)
- To report: https://github.com/iBlessi/techfuelhq-census/issues/new?template=oled-burn-in.yml

Dataset version 0.1.0. Data licensed CC BY 4.0.

## Fields

In the CSV every value is text, and an empty cell means the field was left out.

| Field | Required | Comes from | Allowed | What it records |
|---|---|---|---|---|
| `monitor_brand` | yes | you | up to 40 characters | Monitor brand |
| `monitor_model` | yes | you | up to 80 characters | Monitor model. The model number on the back label: AW3423DWF, FO48U, PG32UCDM. |
| `panel_type` | yes | you | `qd-oled`, `woled`, `other-oled` | Panel |
| `size_in` | no | you | 10 to 100, whole number | Size (inches) |
| `purchase_month` | yes | you | YYYY-MM | Bought. Year and month, written 2024-03. |
| `months_in_use` | yes | you | 0 to 180, whole number | Months in regular use |
| `panel_hours` | no | you | 0 to 100000, whole number | Panel hours. From the monitor's own menu if it shows them. Leave empty if it does not and you would be guessing. |
| `hours_source` | no | you | `osd`, `estimate` | Where the hours come from |
| `use_mix` | yes | you | `mostly-static`, `mixed`, `mostly-moving` | What is on it most of the time |
| `brightness` | no | you | `low`, `medium`, `high` | Brightness |
| `care_cycles` | yes | you | `as-prompted`, `often-postponed`, `disabled`, `unknown` | Panel care cycles |
| `static_mitigation` | no | you | `none`, `taskbar-hidden`, `dark-theme`, `both` | Habits |
| `severity` | yes | you | 0 to 4, whole number | What you see |
| `location` | yes | you | `none`, `taskbar`, `static-ui`, `centre`, `whole-panel-tint`, `other` | Where |
| `warranty_claim` | yes | you | `none`, `approved`, `denied`, `pending` | Warranty claim for burn-in |
| `notes` | no | you | up to 280 characters | Notes |
| `submitted_date` | yes | the maintainer | YYYY-MM-DD | The day the report was sent |
| `source_issue` | no | the maintainer | 1 or more, whole number | The issue the row came from |

## What each value means

### `panel_type`

| Value | Meaning |
|---|---|
| `qd-oled` | QD-OLED |
| `woled` | WOLED |
| `other-oled` | Another OLED type, or I do not know |

### `hours_source`

| Value | Meaning |
|---|---|
| `osd` | The monitor's menu |
| `estimate` | My estimate |

### `use_mix`

| Value | Meaning |
|---|---|
| `mostly-static` | Desktop and office work, more than half the hours |
| `mixed` | About even |
| `mostly-moving` | Games and video, more than half the hours |

### `brightness`

| Value | Meaning |
|---|---|
| `low` | Bottom third of the slider |
| `medium` | Middle third |
| `high` | Top third, or HDR most of the time |

### `care_cycles`

| Value | Meaning |
|---|---|
| `as-prompted` | Run when the monitor asks |
| `often-postponed` | Often postponed or interrupted |
| `disabled` | Turned off |
| `unknown` | I do not know |

### `static_mitigation`

| Value | Meaning |
|---|---|
| `none` | Neither |
| `taskbar-hidden` | Taskbar hidden |
| `dark-theme` | Dark theme |
| `both` | Both |

### `severity`

| Value | Meaning |
|---|---|
| `0` | Nothing visible on a full-screen gray slide |
| `1` | Visible on a test slide, never in normal content |
| `2` | Visible in normal content when I look for it |
| `3` | Visible in normal use without looking |
| `4` | Replaced, returned or retired because of it |

### `location`

| Value | Meaning |
|---|---|
| `none` | Nowhere |
| `taskbar` | Taskbar edge |
| `static-ui` | A game HUD, window edge or other fixed element |
| `centre` | Centre of the panel |
| `whole-panel-tint` | A tint across the panel |
| `other` | Somewhere else |

### `warranty_claim`

| Value | Meaning |
|---|---|
| `none` | None made |
| `approved` | Made and approved |
| `denied` | Made and denied |
| `pending` | Made, no answer yet |
