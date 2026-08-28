#!/usr/bin/env bash
# Security gate: fail on any high/critical advisory that is NOT in the reviewed
# allowlist (scripts/security-audit-allowlist.txt). We wrap `pnpm audit` because
# pnpm 9.5's own `auditConfig.ignoreGhsas` is not honoured by `pnpm audit`, and a
# plain `pnpm audit --audit-level=high` can never pass while an unfixable
# transitive advisory (e.g. extract-zip, patched=<0.0.0) is in the tree.
#
# Criticals that HAVE a fix are never allowlisted — they are bumped/overridden in
# package.json. This gate only tolerates advisories a human has consciously
# accepted, each with a justification in the allowlist file.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
allowlist="$here/security-audit-allowlist.txt"

report="$(pnpm audit --audit-level=high --json 2>/dev/null)"

ALLOWLIST_FILE="$allowlist" node -e '
const fs = require("fs");
let report;
try { report = JSON.parse(fs.readFileSync(0, "utf8")); }
catch { console.error("audit-check: could not parse pnpm audit JSON"); process.exit(2); }

const allow = new Set(
  fs.readFileSync(process.env.ALLOWLIST_FILE, "utf8")
    .split("\n")
    .map((l) => l.replace(/#.*$/, "").trim())
    .filter(Boolean)
);

const found = new Map(); // ghsa -> `module (severity)`
for (const a of Object.values(report.advisories || {})) {
  if (a.severity !== "high" && a.severity !== "critical") continue;
  const id = a.github_advisory_id;
  if (id) found.set(id, `${a.module_name} (${a.severity})`);
}

const unlisted = [...found.keys()].filter((id) => !allow.has(id)).sort();
const stale = [...allow].filter((id) => !found.has(id)).sort();

if (stale.length) {
  console.log(`audit-check: ${stale.length} allowlisted advisory(ies) no longer reported — prune them:`);
  for (const id of stale) console.log(`  - ${id}`);
}

if (unlisted.length) {
  console.error(`\naudit-check: ${unlisted.length} high/critical advisory(ies) NOT in the allowlist:`);
  for (const id of unlisted) console.error(`  ✗ ${id}  ${found.get(id)}`);
  console.error(`\nFix them (bump/override) or, if consciously accepted, add to`);
  console.error(`scripts/security-audit-allowlist.txt with a justification.`);
  process.exit(1);
}

console.log(`\naudit-check: OK — ${found.size} high/critical advisory(ies), all reviewed & allowlisted.`);
' <<<"$report"