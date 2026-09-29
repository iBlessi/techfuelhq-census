// Posts the answer that intake.mjs wrote. Runs inside the read-report workflow.
//   node scripts/respond.mjs <result.json> <comment.md>
// Every value reaches gh as its own argument; nothing is joined into a shell line.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [resultPath, commentPath] = process.argv.slice(2);
const issue = process.env.ISSUE_NUMBER;
if (!resultPath || !commentPath || !/^\d+$/.test(issue || '')) {
  console.error('usage: ISSUE_NUMBER=<n> node scripts/respond.mjs <result.json> <comment.md>');
  process.exit(2);
}

const result = JSON.parse(readFileSync(resultPath, 'utf8'));
const allowed = /^(census:[a-z-]+|reads-cleanly|needs-a-fix)$/;
const add = (result.labels || []).filter((l) => allowed.test(l));
const remove = allowed.test(result.remove || '') ? result.remove : null;

const gh = (args) => execFileSync('gh', args, { stdio: 'inherit' });

// One answer per issue: the last answer is rewritten when the issue is edited.
gh(['issue', 'comment', issue, '--body-file', commentPath, '--edit-last', '--create-if-none']);
if (add.length) gh(['issue', 'edit', issue, '--add-label', add.join(',')]);
if (remove) {
  try {
    gh(['issue', 'edit', issue, '--remove-label', remove]);
  } catch (e) {
    // The label was not on the issue.
  }
}
