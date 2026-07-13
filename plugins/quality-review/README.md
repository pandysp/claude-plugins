# quality-review

Audit any artifact through 13 quality lenses. The rubric audits the artifact, not its effect, and grades craft, not truth. `/quality-review [level] [--fix] [--domain docs|code] <target>`.

The 13 adjectives (unity, vividness, authority, economy, sensitivity, clarity, emphasis, flow, suspense, brilliance, precision, proportion, depth) define artifact quality; the canonical table is in the skill. Every domain needs a translation before use. Domains ship as lens sheets under `skills/quality-review/references/`, and adding a domain means adding one sheet file.

Levels mirror the built-in /code-review: low and medium run inline, high and above launch a multi-agent audit workflow. All 13 lenses run at every workflow level. The top 3 lenses in the priority order get a dedicated finder at high, the top 6 at xhigh, and all 13 at max. The rest share one finder per overlap bucket. Per-lens yield is reported after every workflow run. It is the tuning surface for the lens order.
