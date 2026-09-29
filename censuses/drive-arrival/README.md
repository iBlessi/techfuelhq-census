# TechFuelHQ Drive Arrival Census

What a hard drive reports about itself on the day it arrives from a seller: the hours in its SMART attributes, the hours in its Seagate FARM log where it keeps one, and whether it worked.

One row is one drive as it arrived. Every row counts. Rows are grouped by seller and by the condition on the listing, and a group publishes once it holds five rows.

- The page, with what has published and the tool that builds a report: https://techfuelhq.com/data/drive-arrival-census/
- The data: [`data/submissions.csv`](data/submissions.csv)
- The counts and published figures: [`summary.json`](summary.json)
- The row as a JSON Schema: [`schema.json`](schema.json)
- To report: https://github.com/iBlessi/techfuelhq-census/issues/new?template=drive-arrival.yml

Dataset version 0.1.0. Data licensed CC BY 4.0.

## Fields

In the CSV every value is text, and an empty cell means the field was left out.

| Field | Required | Comes from | Allowed | What it records |
|---|---|---|---|---|
| `seller` | yes | you | up to 60 characters | Seller. The shop, or the marketplace and the seller's name on it. |
| `listing_condition` | yes | you | `new`, `manufacturer-recertified`, `seller-refurbished`, `used`, `open-box` | Condition on the listing |
| `purchase_month` | yes | you | YYYY-MM | Bought. Year and month, written 2026-08. |
| `drive_vendor` | yes | the reading | `seagate`, `wd`, `hgst`, `toshiba`, `other` | Drive maker |
| `model_family` | no | the reading | up to 80 characters | Model family |
| `model` | yes | the reading | up to 60 characters | Model |
| `capacity_tb` | yes | the reading | 0.1 to 100, up to 2 decimal places | Capacity (TB) |
| `interface` | yes | the reading | `sata`, `sas` | Interface |
| `smartctl_version` | no | the reading | up to 20 characters | smartctl version |
| `smart_poh` | yes | the reading | 0 to 200000, whole number | Power-on hours, SMART |
| `smart_power_cycles` | no | the reading | 0 to 10000000, whole number | Power cycles, SMART |
| `reallocated` | no | the reading | 0 to 10000000, whole number | Reallocated sectors |
| `pending` | no | the reading | 0 to 10000000, whole number | Pending sectors |
| `offline_uncorrectable` | no | the reading | 0 to 10000000, whole number | Offline uncorrectable |
| `crc_errors` | no | the reading | 0 to 10000000, whole number | Interface CRC errors |
| `load_cycles` | no | the reading | 0 to 100000000, whole number | Load cycles |
| `farm` | yes | the reading | `read`, `not-supported`, `not-provided` | Seagate FARM log |
| `farm_poh` | no | the reading | 0 to 200000, whole number | Power-on hours, FARM |
| `farm_spindle_poh` | no | the reading | 0 to 200000, whole number | Spindle power-on hours, FARM |
| `farm_head_flight_hours` | no | the reading | 0 to 200000, whole number | Head flight hours, FARM |
| `farm_power_cycles` | no | the reading | 0 to 10000000, whole number | Power cycles, FARM |
| `farm_assembly_yyww` | no | the reading | matches `^[0-9]{4}$` | Assembly date as FARM prints it |
| `poh_gap_h` | no | worked out from the row | -200000 to 200000, whole number | FARM hours minus SMART hours |
| `arrived` | yes | you | `working`, `dead`, `errors-on-first-test` | How it arrived |
| `first_test` | yes | you | `none`, `short-smart`, `long-smart`, `full-surface` | Test run before use |
| `notes` | no | you | up to 280 characters | Notes |
| `submitted_date` | yes | the maintainer | YYYY-MM-DD | The day the report was sent |
| `source_issue` | no | the maintainer | 1 or more, whole number | The issue the row came from |

## What each value means

### `listing_condition`

| Value | Meaning |
|---|---|
| `new` | Sold as new |
| `manufacturer-recertified` | Sold as manufacturer recertified |
| `seller-refurbished` | Sold as seller refurbished or renewed |
| `used` | Sold as used |
| `open-box` | Sold as open box |

### `drive_vendor`

| Value | Meaning |
|---|---|
| `seagate` | Seagate |
| `wd` | Western Digital |
| `hgst` | HGST |
| `toshiba` | Toshiba |
| `other` | Another maker |

### `interface`

| Value | Meaning |
|---|---|
| `sata` | SATA |
| `sas` | SAS |

### `farm`

| Value | Meaning |
|---|---|
| `read` | Read |
| `not-supported` | The drive does not keep one |
| `not-provided` | Not pasted |

### `arrived`

| Value | Meaning |
|---|---|
| `working` | Working |
| `dead` | Dead: not detected, or would not spin |
| `errors-on-first-test` | Detected, and failed its first test |

### `first_test`

| Value | Meaning |
|---|---|
| `none` | None yet |
| `short-smart` | SMART short test |
| `long-smart` | SMART extended test |
| `full-surface` | A full write and read of the surface |
