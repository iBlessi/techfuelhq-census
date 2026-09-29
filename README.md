# TechFuelHQ open census

Five open datasets about things PC owners argue over and nobody has counted. Each one is a census:
one row is one card, monitor, machine or drive that its owner read or judged. The pages publish
distributions with the number of reports beside them. They never publish a verdict on a model, a
brand or a seller.

| Census | One row is | Page |
|---|---|---|
| [12V-2x6 pin current](censuses/pin-current/) | one connector on one card, read once under one load | https://techfuelhq.com/data/pin-current-census/ |
| [OLED monitor burn-in](censuses/oled-burn-in/) | one monitor, judged once | https://techfuelhq.com/data/oled-burn-in-census/ |
| [POST time](censuses/post-time/) | one boot of one machine | https://techfuelhq.com/data/post-time-census/ |
| [Drive arrival](censuses/drive-arrival/) | one drive as it arrived | https://techfuelhq.com/data/drive-arrival-census/ |
| [Windows idle memory](censuses/windows-memory/) | one machine, read once | https://techfuelhq.com/data/windows-memory-census/ |

All five opened on 2026-09-29 with zero rows. Nothing was seeded from reviews or forum posts.

## Send a report

Open the census page. It reads your output in your own browser, shows you what it read, and opens
an issue here with the report already filled in. Nothing is uploaded to TechFuelHQ, and a drive's
serial number and world wide name are left out of the report.

A report is one JSON object. If you would rather write it yourself, each census folder lists its
fields, and the issue forms take the same object:

```json
{ "census": "post-time", "v": 1, "fields": { "os": "windows", "fw_post_ms": "63981" } }
```

## How a report becomes a row

1. When the issue is opened or edited, a workflow reads the report and answers on the issue with
   the row it makes, or with each thing that has to be fixed.
2. I read every report before it joins a dataset. What I look for is in
   [CONTRIBUTING.md](CONTRIBUTING.md).
3. Accepted reports are added with `scripts/accept.mjs`, which refuses any row the validator
   would refuse and any issue already in the data. Each row names its issue in `source_issue`.

## What publishes

Every census groups its rows and publishes a group's figures once the group holds five counted
rows. Below that a group is listed as collecting, with its count and no figures. Each census
folder says how it groups and what counts. `summary.json` in each folder holds the counts and
the published figures, and is rebuilt from the CSV.

Reports are sent by people who chose to send them. The figures describe the rows in the dataset
and do not estimate what any one card, monitor, machine or drive will do.

## Use the data

Each dataset is one CSV with a header row, UTF-8, LF line endings:

```
https://raw.githubusercontent.com/iBlessi/techfuelhq-census/main/censuses/<census>/data/submissions.csv
```

The data is licensed [CC BY 4.0](LICENSE). Attribute it as "TechFuelHQ open census" with a link
to the census page. The code is licensed [MIT](LICENSE-CODE).

## Run the checks

Node 20 or later, no packages to install.

```
npm test
npm run validate
```

`npm test` plants faults and proves each check catches them. The readers are tested against
real output: a published capture from a ROG Astral card, smartctl output from Seagate, Western
Digital, SAS, solid state and NVMe drives, and the two Windows commands as they ran on my own
machine. Where that output comes from is in [test/fixtures/README.md](test/fixtures/README.md).

## The two commands

The POST time and Windows memory pages each give one PowerShell line to paste. Both read the
registry and WMI, write nothing, and print no serial number, host name, user name or process
name. They are kept in the census definitions
([post-time](censuses/post-time/definition.js),
[windows-memory](censuses/windows-memory/definition.js)) so the page, this repository and the
tests all use the same text.

Maintained by Lowell K. Wood IV at [TechFuelHQ](https://techfuelhq.com/).
