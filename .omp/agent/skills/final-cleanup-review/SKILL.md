---
name: final-cleanup-review
description: "Final cleanup pass on finished-but-uncommitted work: fan out four parallel read-only reviewers (bugs, security, performance, code reuse) over the diff, triage findings, apply fixes, then tighten comments. Use when a feature is functionally done and the user asks to review, clean up, harden, or polish before committing."
---

# Final cleanup review

Run when work is functionally complete and about to be committed. Four reviewers with distinct lenses read the same diff in parallel, you triage their findings, apply the real ones, then do a comment pass. Order matters: review before editing, comments last (they touch the same lines as the fixes).

## 0. Prerequisites

1. Read the project's context files (`AGENTS.md`/`CLAUDE.md`) and any matching skills FIRST. The reviewers inherit none of your conversation, so project rules must be restated in the batch `context` or they will report violations that aren't, and miss ones that are.
2. Scope the diff: `git status --porcelain` and `git diff --stat`. Untracked files are part of the change; name them explicitly, reviewers won't find them in `git diff`.
3. Do NOT edit anything yet.

## 1. Fan out exactly four reviewers, one `task` batch

One batch, four items, all read-only. They never edit, so they can't conflict.

Agent typing: `reviewer` for correctness, `security-reviewer` for the security lens, `task` for performance (it needs to run `EXPLAIN`/probes), `scout` for reuse (fast, read-heavy grepping). If a spawn fails with a model 404 for a configured agent, respawn that one item on `reviewer` or `task` — don't drop the lens.

Batch `context` (shared, do not duplicate into tasks):

```
# Goal
<what the change does, one paragraph>. Four reviewers run in parallel over the SAME diff, each with a distinct lens. Report findings only; do NOT edit files (the parent agent applies fixes).

# How to see the change
Run `git --no-pager diff` for modified files and read these new untracked files directly:
<list every untracked file with a one-line purpose>
Modified: <list>.

# What the change does
<data flow: entry point -> loader/helper -> storage; caching; gating; what renders>

# Constraints (project rules reviewers must apply)
<the handful of repo rules that touch this diff: auth/tenancy model, gating rules, query
conventions, framework version, styling/token rules, row limits, migration policy>

# Contract
Every finding MUST include: file:line, what is wrong, why it matters, and a concrete fix. Rank by
severity and drop speculative nits. State explicitly if you find nothing in your lens.
```

Per-lens `task` bodies — keep the `# Target / # Change / # Acceptance` shape and name concrete suspicions, not "look for bugs":

- **Correctness** (`reviewer`): edge cases in the new logic; both branches of every early return; error propagation (does a failure in a secondary feature now break the whole page/request?); cache read/write/invalidate correctness and whether a cached shape can drift from a freshly computed one; query filters that can silently drop or double-count rows; null/undefined handling; enumerate every table/resource the new code reads, then check every write path to those for missing invalidation, and check no added call sits after an early return where it can never run.
- **Security** (`security-reviewer`): tenant/user isolation on every new query and cache key; per-user authorization on **all** return paths including cached ones; exactly what data reaches the client (no wildcard selects, nothing sensitive added); unauthenticated/public entry points reachable by the new code (input bounds, cost amplification, cache churn); entitlement/plan gating present or correctly absent.
- **Performance** (`task`): count the round trips the diff adds per request, for the cheap and expensive cases; name serialization that could be parallel; find unbounded sweeps and whether an aggregate/RPC or index is warranted (check the repo for an existing pattern first); verify each read isn't already available upstream; cache reads/writes per request and whether TTL plus invalidation set is coherent. Ask for a table of measured counts, not adjectives.
- **Reuse** (`scout`): for each helper/type/style the diff introduces, find the existing symbol it duplicates with file:line, or state that none exists and name the best home for a shared one; check whether an existing component fits the new markup; check whether the new module duplicates a generic utility elsewhere. Demand real file:line for every claim.

## 2. Triage — verify before applying

Reviewers are confident and sometimes wrong. For each finding: confirm it against the actual file, then apply, reject with a reason, or defer.

Apply: correctness defects, isolation/authorization gaps, missing invalidation, unbounded input from untrusted sources, duplicated logic where a canonical owner already exists (especially when the existing one is dead code the diff re-implements).

Reject (say why, don't silently drop):
- A suggested component/style swap whose semantics differ (e.g. a shared rule whose sizing depends on a container the new context doesn't establish).
- Extracting a "shared" helper for two callers that need genuinely different shapes.
- Cross-cutting refactors the diff didn't cause (migrating a signature across 20 unrelated call sites, consolidating pre-existing duplicate modules).
- Style nits that fight the touched file's own established convention.

Defer with a note: pre-existing violations outside the diff.

Sequencing when fixes interact: schema/data layer first (so generated types exist), then server, then UI, then comments. If a perf fix supersedes a bug fix (e.g. a filter moving into SQL), apply the superseding one and say so.

## 3. Data-layer fixes (if any)

Follow the project's migration policy exactly — usually: edit the declarative schema file, write/generate the migration, apply locally, regenerate types, never push. Grants on security-definer functions are typically NOT captured by diff tooling: write them by hand. Verify the new object by calling it and comparing against the value the old code produced.

## 4. Comment cleanup pass (last)

Go through every comment the change added (`git --no-pager diff -U0 | grep "^+.*//"` and the doc-comment equivalents):

- One claim per comment. Cut the second sentence unless it carries a distinct fact.
- Delete comments that restate the code.
- Keep comments that explain **why**: a non-obvious constraint, a cost tradeoff, an invariant a future edit would break.
- Fix docstrings the change made false — a stale invariant on a caching, auth, or invalidation boundary is how the next change reintroduces the bug.
- Match the file's existing comment voice and width.

## 5. Verify

- Type check. If the project's check script disables type checking for one file class (common with `svelte-check --no-type-check`), run the real compiler over the app tsconfig too and filter to the touched files — otherwise a load/type mismatch ships silently.
- Formatter, then linter (some linters fail only after formatting).
- Test suite.
- Re-verify behavior, don't just trust green gates: exercise the changed surface (fetch the rendered route and grep the server HTML for the values, drive the UI, hit the endpoint) and confirm the numbers still match the source of truth.
- Screenshot every dependent page you refactored, not only the new one.

## 6. Hygiene

- `git status --porcelain`: delete subagent scratch files (probe tests, temp scripts). Reviewers that measure things tend to leave harnesses behind.
- Confirm no unintended file is in the diff, and that generated files (types, lockfiles) changed only as expected.

## Report

Group by lens: fixed / rejected-with-reason / deferred. For perf, quote the before/after counts. Close with the verification evidence, including the one number that proves the behavior is unchanged.
