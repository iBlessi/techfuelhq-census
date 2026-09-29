# Contributing

## What a report is

One report is one thing you own, read or judged by you: one connector on your card, your monitor,
one boot of your machine, one drive that arrived at your door. A report about something you read
in a thread or watched in a video is not a report.

Reports that show nothing wrong are wanted as much as any other. A monitor with no burn-in after
four years, a drive that arrived with the hours its seller said, a connector that shares its
current evenly: these are the half of each distribution that never gets posted anywhere.

## Before it joins a dataset

The workflow checks that a report is complete and that its numbers agree with each other. After
that a maintainer reads it. A report is held back, with a question on its issue, when it shows:

- several new accounts reporting the same thing in the same hour;
- a second report of a unit that is already in the data;
- values that cannot go together, such as a purchase month before the product was sold;
- a reading outside what the hardware can do, where a typing slip is the likely cause;
- a report that names a seller or a brand in its notes in a way the reading does not support.

A report with an open question stays out of the data until it is answered. If no answer comes
the issue is closed and the report is not used.

## Corrections

If a row of yours is wrong, comment on its issue. The row is corrected or removed and the census
page's change log says so. Rows are never edited silently.

## Privacy

The census pages work in your browser and send nothing to TechFuelHQ. A report carries hardware
models and readings. It carries no serial number, world wide name, host name or user name, and
the drive page removes serial numbers from smartctl output before it shows the output back to
you. Your GitHub account name is public on the issue you open, as on any issue.

## Changes to the code or a schema

Open a pull request. `npm test` and `npm run validate` have to pass. A change to a census
definition changes that census's version: a new optional field is a minor version, and anything
that changes what an existing value means is a major version with the old rows marked.
The scale anchors, the load bands and the publication floors are fixed on purpose, so that a row
from this year and a row from next year can sit in the same table.

## Conduct

Be civil on issues. Reports are data about hardware, and the people who send them are doing the
census a favour.
