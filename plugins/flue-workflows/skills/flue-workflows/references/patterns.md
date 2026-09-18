# Choose the shape from the dependencies

These are ways to author programs, not built-in modes. There are no prescribed
worker roles, phases, panel sizes or acceptance votes. Use the smallest structure
that can answer the question honestly; add independence where it changes what
you can trust.

## Discover a bounded unit of work

Start by deciding what counts as an input. A directory, symbol list, failing-test
list or source inventory is usually easier to audit than an open-ended request
to “find everything.” Discovery may happen in ordinary code or in a worker; its
output still needs a completeness check.

| Question | Record |
|---|---|
| What did we inspect for possible work? | Discovery roots, queries, source types and errors |
| What was requested? | Explicit selection or inclusion rules |
| What did we actually attempt? | Stable item identities and attempted stages |
| What remains? | Failures, unchecked items and omissions with reasons |

Do not convert a failed directory listing/search into an empty successful
inventory. If the inputs can change, decide how the new work becomes a new run;
a source path alone is not a snapshot of every external input.

## Pipeline independent items; wait when comparison needs it

Use a pipeline when each item can move forward without its neighbors:

```js
const outcomes = await run.pipeline(items,
  item => investigate(item),
  async (finding, item) => {
    if (finding === null) return null;
    if (!finding.needsAction) return { item, status: 'unchanged', finding };
    return actAndCheck(item, finding);
  },
);
```

Use a barrier when the next decision genuinely needs the entire set—for example
choosing among competing designs, deduplicating overlapping findings, or
checking that two proposed patches agree on an interface. Results being in
separate conceptual “phases” is not itself a dependency.

```js
const proposals = await run.parallel(questions.map(question => () => propose(question)));
const failed = questions.filter((_, i) => proposals[i] === null);
const available = proposals.filter(value => value !== null);
// Compare available proposals, while keeping failed attempts in the report.
```

Composition preserves input order, not completion order. An explicit `null`
continues through a pipeline; an ordinary thrown error stops only that chain.
Configuration/safety/cancellation errors are fatal. See the [exact contract](api.md).

## Independence should break the same failure path

| Risk | Useful check | What it does not establish |
|---|---|---|
| A plausible but false finding | Ask another worker for a reproducer and the strongest counterexample | Agreement is not proof |
| One lens misses another kind of defect | Separate correctness, compatibility, security or operational checks | Different labels alone do not create different evidence |
| Several good-looking designs hide the same assumption | Independent proposals first, comparison after | A scoring rubric is still a judgment call |
| Discovery misses a whole area | Compare the inventory against another source or enumeration method | Several searches of the same index are not exhaustive |
| A change works only in the author's environment | Run trusted checks against retained output in a separate copy | A private directory is not OS containment |
| The final answer hides gaps | Give a reviewer the request, inventory and attempted/omitted ledger | Fluent synthesis cannot replace missing work |

Give verifiers the claim or candidate plus primary evidence and the requested
check. Avoid feeding them a long persuasive defense before they inspect. If a
check fails, retain the failure and candidate; don't quietly remove the item.
For coding, keep the original checkout untouched, keep candidate patches
separate, and run consumer-side tests before any merge.

## If you use voting, define abstention

Choose an acceptance rule in code **before** reading the votes. Missing,
uncertain and failed votes are different from support. Record the denominator
and preserve dissent. For example, requiring two explicit supports is not the
same as accepting anything that lacks two refutations.

A majority can still share a false premise. Use a decisive external check when
one exists: a reproducer, an executable test, an authoritative source or a
measured artifact. Votes organize judgment; they do not create evidence.

## Repeated discovery needs a stopping argument

Loops can stop because the requested inventory is checked, a defined sequence
of independent searches finds nothing new, or an explicitly authorized resource
limit is reached. Those are different conclusions; report which happened.

- Deduplicate against **all examined candidates**, including rejected ones, so
  the same rejected finding does not masquerade as fresh progress forever.
- A dry round with failed workers is not evidence that discovery is exhausted.
- Keep stopping parameters in the authored program/arguments, not a hidden
  runtime policy.
- Announce sampling, ranking cutoffs, unsupported inputs and exhausted resources.
  Name the omitted work; don't just report the number of workers that ran.

`run.budget` measures saved-job admissions, not tokens or dollars. It is finite
under the configured `maxJobs`, but checking `remaining()` does not reserve a
future parallel batch. Plan the batch size or leave a visible omission rather
than launching more than the declared ceiling. A fatal limit refusal may leave
no final result file; the journal and retained outputs still matter.

## Separate execution, coverage and correctness

| Layer | Example evidence | Honest conclusion |
|---|---|---|
| Execution | Native job settled; program returned | The machinery ran |
| Output shape | Result matched JSON Schema | The fields have the requested shape |
| Coverage | Every selected input has an outcome; omitted items named | The declared inventory was accounted for |
| Correctness | Independent trusted checks against the actual output | The tested behavior passed those checks |

An example domain classification:

- **Complete:** every selected item has a successful required check, with no
  failures or omissions. An explicitly empty selection is complete with zero
  work—not evidence about an unexamined repository.
- **Partial:** some selected work succeeded, but failed or omitted work remains.
- **Failed:** selected work existed and none met the required checks.

Report `discovered`, `selected`, `attempted`, `completed`, `failed`, `omitted` and
explicitly out-of-scope items separately. State whether a “passed” check is only
a worker report or was independently rerun by the consumer.

## Keep re-entry boring

Stable keys should describe stable concerns, not arrival times. Pass changing
external inputs deliberately and avoid making required later calls depend on
which model happens to finish first. A child workflow's invocation order also
participates in its key namespace.

On resume the ordinary program starts again; saved worker results do not restore
its call stack or external side effects. An unknown command outcome means
inspect what happened before repeating it. A live old writer means **stop and
investigate**, not “try a new key.” Do not overwrite or remove retained artifacts
to make a cached result pass validation.

The [coding example](../../../README.md#a-disposable-coding-example) shows discovery, a per-item
branch, separate candidate/check copies and an explicit coverage ledger. The
[custom-tool example](../examples/custom-tool/README.md) shows the native raw-tool
seam plus a deterministic consumer check. Neither is the default workflow for
all tasks.
