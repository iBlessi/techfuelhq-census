# TechFuelHQ Windows Idle Memory Census

How much memory Windows holds on a machine that has just started and is doing nothing, by the amount of memory installed.

One row is one machine, read once. A row counts when the machine was restarted, signed in to, and left alone for 5 to 60 minutes. Rows are grouped by installed memory, and a group publishes once it holds five counted rows.

- The page, with what has published and the tool that builds a report: https://techfuelhq.com/data/windows-memory-census/
- The data: [`data/submissions.csv`](data/submissions.csv)
- The counts and published figures: [`summary.json`](summary.json)
- The row as a JSON Schema: [`schema.json`](schema.json)
- To report: https://github.com/iBlessi/techfuelhq-census/issues/new?template=windows-memory.yml

Dataset version 0.1.0. Data licensed CC BY 4.0.

## Fields

In the CSV every value is text, and an empty cell means the field was left out.

| Field | Required | Comes from | Allowed | What it records |
|---|---|---|---|---|
| `installed_gb` | yes | the reading | 2 to 2048, whole number | Memory installed (GB) |
| `visible_mb` | yes | the reading | 0 to 4194304, whole number | Memory Windows can use (MB) |
| `in_use_mb` | yes | worked out from the row | 0 to 4194304, whole number | In use (MB) |
| `available_mb` | yes | the reading | 0 to 4194304, whole number | Available (MB) |
| `committed_mb` | yes | the reading | 0 to 4194304, whole number | Committed (MB) |
| `commit_limit_mb` | yes | the reading | 0 to 4194304, whole number | Commit limit (MB) |
| `cached_mb` | yes | worked out from the row | 0 to 4194304, whole number | Cached (MB) |
| `cache_mb` | yes | the reading | 0 to 4194304, whole number | System cache (MB) |
| `standby_mb` | yes | the reading | 0 to 4194304, whole number | Standby (MB) |
| `modified_mb` | yes | the reading | 0 to 4194304, whole number | Modified (MB) |
| `free_mb` | yes | the reading | 0 to 4194304, whole number | Free (MB) |
| `paged_pool_mb` | yes | the reading | 0 to 4194304, whole number | Paged pool (MB) |
| `nonpaged_pool_mb` | yes | the reading | 0 to 4194304, whole number | Non-paged pool (MB) |
| `processes` | yes | the reading | 1 to 100000, whole number | Processes running |
| `startup_items` | no | the reading | 0 to 10000, whole number | Startup entries |
| `uptime_min` | yes | the reading | 0 to 5256000, whole number | Minutes since boot |
| `os_caption` | yes | the reading | up to 80 characters | Windows edition |
| `os_build` | yes | the reading | up to 20 characters, matches `^[0-9]{4,6}$` | Windows build |
| `state` | yes | you | `fresh-boot-idle`, `in-use` | What the machine was doing |
| `notes` | no | you | up to 280 characters | Notes |
| `submitted_date` | yes | the maintainer | YYYY-MM-DD | The day the report was sent |
| `source_issue` | no | the maintainer | 1 or more, whole number | The issue the row came from |

## What each value means

### `state`

| Value | Meaning |
|---|---|
| `fresh-boot-idle` | Restarted, signed in, then left alone with nothing opened for 5 to 60 minutes |
| `in-use` | In use, or up for longer than that |
