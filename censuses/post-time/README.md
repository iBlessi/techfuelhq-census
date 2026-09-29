# TechFuelHQ POST Time Census

How long a machine's firmware takes before the operating system's loader starts, as the machine recorded it for its last boot.

One row is one boot of one machine. Every row counts. Rows are grouped by platform and by the state of the memory training shortcut, and a group publishes once it holds five rows.

- The page, with what has published and the tool that builds a report: https://techfuelhq.com/data/post-time-census/
- The data: [`data/submissions.csv`](data/submissions.csv)
- The counts and published figures: [`summary.json`](summary.json)
- The row as a JSON Schema: [`schema.json`](schema.json)
- To report: https://github.com/iBlessi/techfuelhq-census/issues/new?template=post-time.yml

Dataset version 0.1.0. Data licensed CC BY 4.0.

## Fields

In the CSV every value is text, and an empty cell means the field was left out.

| Field | Required | Comes from | Allowed | What it records |
|---|---|---|---|---|
| `os` | yes | the reading | `windows`, `linux` | Read from |
| `platform` | yes | you | `am5`, `am4`, `lga1851`, `lga1700`, `other` | Platform |
| `cpu` | yes | the reading | up to 80 characters | Processor |
| `board_vendor` | yes | the reading | up to 60 characters | Board maker |
| `board` | yes | the reading | up to 80 characters | Board |
| `bios_version` | yes | the reading | up to 40 characters | BIOS version |
| `bios_date` | no | the reading | YYYY-MM-DD | BIOS date |
| `dimms` | yes | the reading | 1 to 16, whole number | Memory modules |
| `ram_gb` | yes | the reading | 2 to 2048, whole number | Memory (GB) |
| `ram_speed` | no | the reading | 400 to 12000, whole number | Memory speed as configured |
| `memory_fast_boot` | yes | you | `on`, `off`, `auto`, `unknown` | Memory training shortcut in the BIOS. Memory Context Restore on AMD boards, MRC Fast Boot on Intel boards. |
| `boot_kind` | yes | you | `restart`, `cold-boot`, `unknown` | How the machine was last started |
| `fast_startup` | yes | the reading | `on`, `off`, `not-applicable`, `unknown` | Windows Fast Startup |
| `fw_post_ms` | yes | the reading | 500 to 900000, whole number | Firmware time (ms) |
| `os_build` | no | the reading | up to 40 characters | System build |
| `notes` | no | you | up to 280 characters | Notes |
| `submitted_date` | yes | the maintainer | YYYY-MM-DD | The day the report was sent |
| `source_issue` | no | the maintainer | 1 or more, whole number | The issue the row came from |

## What each value means

### `os`

| Value | Meaning |
|---|---|
| `windows` | Windows |
| `linux` | Linux |

### `platform`

| Value | Meaning |
|---|---|
| `am5` | AMD AM5 |
| `am4` | AMD AM4 |
| `lga1851` | Intel LGA 1851 |
| `lga1700` | Intel LGA 1700 |
| `other` | Another platform, a laptop or a prebuilt with its own board |

### `memory_fast_boot`

| Value | Meaning |
|---|---|
| `on` | On |
| `off` | Off |
| `auto` | Auto, as the board shipped |
| `unknown` | I have not looked |

### `boot_kind`

| Value | Meaning |
|---|---|
| `restart` | Restarted from the running system |
| `cold-boot` | Powered on from off |
| `unknown` | I do not remember |

### `fast_startup`

| Value | Meaning |
|---|---|
| `on` | On |
| `off` | Off |
| `not-applicable` | Not Windows |
| `unknown` | Not reported |
