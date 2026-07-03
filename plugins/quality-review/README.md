# quality-review

Audit any artifact through 13 quality lenses. `/quality-review [level] [--fix] [--domain docs|code] [<target>]`.

The 13 adjectives (unity, vividness, authority, economy, sensitivity, clarity, emphasis, flow, suspense, brilliance, precision, proportion, depth) define artifact quality; the canonical table is in the skill. Every domain needs a translation before use — domains ship as lens sheets under `skills/quality-review/references/`, and adding a domain means adding one sheet file.

Levels mirror the built-in /code-review: low and medium run inline, high and above launch a multi-agent workflow (scope block, per-location verification with a verdict ladder, gap sweep at xhigh+, synthesis by index). All 13 lenses run at every workflow level; effort decides how many get a dedicated finder, and the rest share one finder per overlap bucket. Per-lens yield is reported after every run — it is the tuning surface for the lens order.
