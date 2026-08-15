# Native Pi support — Definition of Done

Pi support is done when this repository can expose an approved subset of its shared skills as a native Pi package without regressing Claude Code or Codex.

Audit baseline: merged main `76f244279605c73d2b3d2d782ffe71bf042ca69d`. This is provenance only. All acceptance evidence must bind to the exact implementation candidate SHA; any candidate change invalidates affected evidence.

## Approved scope

- [ ] Every skill and its referenced scripts, agents, references, and assets are hashed, reviewed, classified, and approved at the candidate SHA.
- [ ] The package exposes only an explicit approved-path allowlist. No globs, accidental discovery, missing paths, or duplicate skill names remain.
- [ ] The provisional list is reclassified before exposure: `align`, `clarify`, `design-options`, `explore`, `handoff`, `pre-mortem`, `preflight`, `reflect`, `second-opinion`, `silent-failures`, `spec`, `steel-man-own-position`, `understudy`, `verify-claims`, and `verify-result`. The entire list is unapproved; package exposure waits for exact-candidate classification and all applicable runtime gates.
- [ ] `quality-review` and `drive-browser` remain excluded unless their workflow and browser/runtime dependencies pass Pi-specific black-box gates. `worktrunk-hook` remains outside the Pi skill package.

## Package lifecycle

- [ ] Root Pi metadata is dependency-free and script-free, exposes no extensions/prompts/themes, and has a committed deterministic lockfile.
- [ ] The exact candidate installs from its HTTPS GitHub source in an isolated Pi environment. At every install, update, pin, rollback, and return-to-moving-source state, the resolved checkout is correct and `git status --porcelain` is empty after Pi's install step; no lifecycle operation leaves persistent drift.
- [ ] Extension-disabled inventories show exactly the approved skills and no Pi extensions, prompts, or themes. Resource loading is treated as trusted-code execution; SDK registry inspection is labeled equivalent-configuration instrumentation, not CLI-process proof.
- [ ] Targeted update, pin/rollback, return to the moving source, coexistence with relevant global/project/ancestor configuration, and removal all work without changing unrelated packages or configuration.
- [ ] After removal and restart, package resources disappear. Checkout/cache retention behavior is documented and matches observation.

## Behavioral compatibility

- [ ] A support matrix names exact Pi CLI, OS/architecture, Node/npm, provider/model, and relevant runtime versions. Every applicable execution/fallback branch passes on every supported matrix row; matrix changes rerun the affected cross-product. Evidence records exact versions.
- [ ] Classification enumerates every Pi-relevant execution and fallback branch. Every approved branch passes an exact-candidate Pi black-box test against an inert fixture; loading, manifests, static checks, or another branch's pass cannot substitute.
- [ ] Semantic safety and artifact correctness are judged separately. Formatting and citation style are non-gating unless the skill itself requires them.
- [ ] Every shared skill/helper changed by Pi support passes its relevant Claude Code and Codex black-box branches. Static validation or loading alone is insufficient.
- [ ] Reviewer independence is never inferred from a manifest or child spawn. Any claimed independent review proves distinct context, peer strength, sufficient neutral context, direct artifact access, returned findings, and substantive integration. High-stakes reviewer count follows an explicit `second-opinion` policy.

## Evidence and compatibility

- [ ] Generic repository validation, Codex generation, and strict validation of every Claude plugin pass; marketplace inventories remain unchanged except for deliberate version metadata.
- [ ] An approved support policy defines the supported-release lifetime and deprecation window. Sanitized release evidence records the candidate SHA, support matrix, lifecycle results, branch coverage, behavior verdicts, coexistence/removal results, and exclusions; its policy-backed storage retains it through both periods, and availability is checked before release. Expiring CI artifacts alone are not durable proof. It contains no credentials, auth symlinks, hidden reasoning, or live app state.
- [ ] README and Pi compatibility documentation explain install, update, rollback, removal, filtering, exclusions, and the difference between startup notification and installed-content updates.
- [ ] Manual or stochastic samples are labeled as such. Green CI, package loading, generated manifests, and validators are never presented as behavioral proof.

Pi support is not done until every checked item above refers to the same candidate SHA and an identified maintainer or release reviewer approves the evidence.
