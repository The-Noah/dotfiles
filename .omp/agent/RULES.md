# Batch tool calls

A turn costs ~13s of wall clock: time to first token, then generation, no matter how
little it does. Turns are the scarce resource; extra calls inside one turn are nearly free.
Measured over 14 days, this agent averaged **1.06 tool calls per turn** and spent hours
on solo `read` calls that returned in under a second. The `batch-guard` extension counts
this and appends a reminder to the tool result when a streak builds. Do not wait for it.

- Decide the whole next step, then issue every call it needs in ONE message.
- A turn containing a single `read`, `grep`, or `glob` is a defect unless that call's
  arguments were unknowable before the previous result.
- Reading four files you might need beats four turns discovering you needed them.
- Compound bash is encouraged: `cd` is not needed (use `cwd`), but `a && b && c` in one
  call is one turn instead of three. Only a *bare* `rg`/`find`/`grep -r`/`sed -i` gets
  rerouted to its tool; the same command inside a pipeline runs.
- Serialize only on a true data dependency, where the next call's arguments come out of
  this call's output.

## The summary-then-range two-step

`read` on a file over 100 lines returns a structural summary, so the ranged follow-up is a
second turn. That pair fired 342 times in 14 days. Collapse it:

- Know the range already? Read `path:120-260` directly, first time.
- Do not know it? `grep` the symbol **in the same turn** as the reads of the other files
  you need, then read the range it reports alongside your next batch.
- Never send a lone ranged read of a file you just summarized.

# Verify once, with the language server

`tsgo` (registered globally in `~/.omp/agent/lsp.json`) serves TypeScript and omp's built-in
`svelteserver` serves Svelte; both answer in well under a second.

- Type errors arrive **inline on the write/edit result** (`lsp.diagnosticsOnWrite`). Read
  them there. Do not shell out to confirm what the result already told you.
- Symbol work (`definition`, `references`, `rename`, `code_actions`) goes through `lsp`,
  never a grep sweep. In a SvelteKit repo, `references` also returns
  `.svelte-kit/types/**/proxy+*.ts`: those are generated mirrors of the real route file
  next to them, not extra call sites.
- `pnpm check`, `pnpm lint`, `pnpm full-svelte-check` and the test suite run **once, at the
  end of the task**, chained into a single bash call. Running them mid-task costs 20-35s
  each and re-reports what the LSP already showed. 454 such runs in 14 days is the record
  to beat.

# Route subagents by tier, and give them a shape

The agent name selects the model, so pick it by what the work needs, not by habit.

- `scout`, `code-explorer`, `librarian` run Sonnet: read-only mapping, breadth searches,
  dependency and API lookups.
- `sonic` runs Haiku: strictly mechanical edits and data collection against a pattern you
  already worked out.
- `task`, `code-architect`, `code-reviewer`, `reviewer`, `security-reviewer` run Opus:
  design, judgment, correctness and security review.
- Pass `effort: lo|med|hi` per spawn to dial thinking inside the tier. Reach for `hi` only
  when the task genuinely turns on it.
- Never hand read-only research to an Opus agent because the question feels important.
  Give `scout` a sharper brief instead.

Shape matters as much as tier:

- **Never spawn exactly one subagent.** Half of all `task` calls did, and a single child is
  pure overhead: spawn, wait, integrate, no parallelism. Either do it inline or fan out two
  or more genuinely independent slices.
- **Bound every brief.** State the budget in the task text ("≤20 tool calls, then report
  what you found"). Unbounded scouts have run 400 messages and an hour.
- **Do not idle in `hub wait`.** 5.5h in 14 days went to a blocked main agent. Wait only
  when there is no remaining work; otherwise keep implementing and collect results later.
- **Push breadth reading down.** A `read` result averages ~3.8k characters. Landing those
  in a scout's context instead of yours is the cheapest way to keep the main session under
  300k tokens, where time to first token is 2s instead of 5s.

# Reuse the running dev server

A dev server for the project is already up. The user starts it outside the session and
leaves it running.

- NEVER start, restart, or `hub start` a dev server, watcher, or `preview` process on your
  own initiative. A global `tool_call` guard blocks the attempt when one is already listening.
- Locate it instead: run `node ~/.omp/agent/bin/dev-servers.mjs` from the repo. It lists the
  ports owned by processes running inside the repo on Linux, macOS and Windows (5173 vite,
  8787 wrangler, 3000 next, 4321 astro). Use `http://localhost:<port>`.
- Nothing listening means it crashed. Say so, start at most one replacement when you
  actually need it to verify a change, and tell the user you started it.
- Output from a server you did not start is not visible to `hub logs`. Verify through the
  app itself (HTTP response, devtools, screenshots), not by tailing logs.

# Drive the browser, do not script it

When `chrome-devtools` MCP devices are mounted, they are the way you look at a page.
Authoring a playwright or puppeteer script to check a route costs several failed iterations
before it renders anything, and the scripted browser starts unauthenticated.

- Navigate with `navigate_page` on the page id from `list_pages`; reuse that page instead of
  opening new ones.
- Assert with `take_snapshot`: the accessibility tree carries structure, labels and state as
  text, and its `uid`s feed `click`, `fill_form`, `hover`, `press_key`, `wait_for`.
- Screenshot with `emulate` (`viewport: "<w>x<h>x<dpr>[,mobile,touch]"`) then `take_screenshot`
  with `filePath`, and read the file. `resize_page` is window resizing, not emulation: the
  window manager clamps it and the image silently records the wrong size.
- Diagnose with `list_console_messages`, `list_network_requests`, `evaluate_script` before
  theorizing.
- Committed e2e suites stay scripted. Run them with the project's own test command; do not
  fork a throwaway variant to inspect one page.
