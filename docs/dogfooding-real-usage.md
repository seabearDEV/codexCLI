# Dogfooding, Part Two: What Real Usage Revealed

Two weeks after v1.11.1 shipped, we looked at 584 real MCP tool calls spanning 15 days across multiple work projects. The freeze fixes held. The data also surfaced three things no stress test could have: validation of the codex's core value prop, an emergent pattern nobody designed, and a list of issues that just became v1.13.0 scope.

## The freezes really did disappear

The v1.11.1 cycle's headline was "found and fixed three freezes." How do you know the fixes held outside synthetic tests?

Duration distribution from 15 days of real use:

- **Pre-fix era (04-07 to 04-14):** one 131-second hang. Nine of the thirteen calls over 5 seconds clustered here.
- **Post-fix era (04-15 onward):** no multi-minute events. Longest was 40 seconds on a `codex_get` — annoying, but not the server-down class of failure the earlier freezes caused.

The catastrophic-freeze class cleanly disappears from the data. Remaining performance costs map to `context.logQueryOnCost` (audit/stats O(N) scan) and the #57 eager-store-scan work that shipped in v1.12.0 — known, tracked, non-freeze.

Synthetic stress tests proved the fixes were correct. Real usage proved they were sufficient.

## cascadeDelete immunized a later session

During v1.11.1 work we stored `context.cascadeDelete`:

> when you `codex_remove` an entry, aliases pointing at it are auto-cleaned — don't write defensive alias/confirm cleanup after a remove.

The entry exists precisely to prevent future agents from doing redundant cleanup.

The dataset contains the counter-example: a later Claude session that didn't bootstrap that entry attempted four `codex_alias_remove` calls against aliases that had already been cascade-deleted. The note exists to prevent exactly this.

This is the codex's value proposition in one story: stored insights immunize future sessions against known failure modes. Not "knowledge storage" — **failure-mode inoculation**. Each entry is a class of mistake a future agent will not make.

## An emergent handoff pattern

`context.next_session` was the most-written key across the dataset — 20 writes across 6 sessions. One session rewrote it 6 times in a single sitting, refining "what's next" as priorities shifted.

No one designed this. The tool didn't document a convention. Agents reached for it because the project vision — *every session starts with full context, every insight gets stored for the next session* — made it the natural shape.

The usage is strong enough that it earned its own v1.13 issue (#91): formalize cross-session handoff as a first-class concept. Maybe a dedicated `codex_handoff` tool. Maybe auto-surfaced in `codex_context` output. The right answer isn't obvious yet — but the pattern is real, and it's the clearest expression of the project vision we have.

## What real data exposed that stress tests couldn't

Three v1.13.0 issues came directly from mining this dataset:

- **#91 — Formalize handoff protocol.** The emergent pattern above.
- **#92 — Audit MCP tool descriptions.** 48% of `codex_get` calls passed an empty key — agents were reaching for it to browse when `codex_context` is the dedicated browsing tool. Descriptions likely don't disambiguate clearly enough.
- **#93 — Audit log data quality gaps.** `codex_remove` logs with `op: "write"` (conflates with actual writes); alias resolution inconsistently logged across CLI and MCP. Only visible by mining real logs.

None of these would surface in correctness tests or stress tests. They require population-level data from real use.

## The loop, again

v1.11 taught us how to dogfood a fix. v1.13 is teaching us how to dogfood a roadmap.

1. Ship a release.
2. Use it in real work.
3. Mine the audit log.
4. File issues grounded in what the data actually shows.
5. Iterate.

The audit log becomes the mirror. You see what works, what earns its complexity, what users — human or agent — actually reach for. You stop guessing what to build next.

Real usage is the only stress test that tells you what to build.

## Addendum: the loop closed

A day after filing the issues above, v1.13.0 shipped — eleven issues closed in a single cleanup session. Three came directly from the dataset (#91, #92, #93). The rest fell naturally once the milestone was trimmed to match:

- **#94** was a narrow aliasResolved follow-up the #93 audit surfaced. No alias-using `codex_copy` calls in the 584-call window, so the bug stayed silently wrong until we looked with the right question.
- **#82** (seed-quality lint) and **#83** (topology) are Layer 2 tools from the seedRoadmap. They weren't blocked on code — they were blocked on calibration data. Fifteen days of real use finally gave them something to tune against.
- **#86/#89/#90** were soak findings from v1.12.2's release flog — same dogfooding loop, earlier turn of the crank.

What the data surfaced beyond the filed issues: sequencing. **#92 was the lowest-risk highest-leverage move** — shipping it first makes every future agent session better at tool selection, including the session that would later design #91. **#93 followed as plumbing** so the next dataset cycle's signal would be cleaner. Only then did **#91 get its design pass**, with the tool descriptions already improved and the audit log already trustworthy.

That ordering didn't come from a random walk through the milestone. It came from reading the data and picking the move that makes every subsequent move cheaper.

The loop doesn't just tell you what to build. It tells you the order.
