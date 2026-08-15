# Native Pi support — implementation spec

## Goal & why

Make this repository installable as a native Pi package without weakening its Claude Code or Codex behavior. Pi support means a reviewed subset of shared skills can be installed, updated, rolled back, inventoried, and exercised from the repository's HTTPS GitHub source. It does **not** mean that Pi implements either host's plugin protocol or reviewer/workflow/browser capabilities.

Audit baseline: merged main `76f244279605c73d2b3d2d782ffe71bf042ca69d` (tree `428048781b6128b6131e87a43707f41b3955e186`). This is provenance only. Adding Pi metadata creates a new candidate commit; every acceptance result below must name and test that exact candidate SHA. Any candidate change invalidates prior results.

## Definition of Done

### 1. Exact-source classification

- [ ] All 17 `SKILL.md` files at the candidate SHA are re-read and classified together with every script, reference, asset, agent, or other file they transitively reference. The classification records every reviewed file hash, decision, reason, runtime assumptions, candidate commit, and tree. Helpers are runtime surface even when a skill is excluded (for example, `quality-review`'s workflow). A reviewer explicitly approves the complete resource closure before package exposure.
- [ ] The `pi.skills` list contains only approved, explicit file paths: no directory discovery or globs. Its resolved inventory equals the approved list byte-for-byte and contains no duplicate skill names.
- [ ] The following baseline list is **provisional, not approved**: `align`, `clarify`, `design-options`, `explore`, `handoff`, `pre-mortem`, `reflect`, `second-opinion`, `silent-failures`, `spec`, `steel-man-own-position`, `understudy`, `verify-claims`, and `verify-result`.
- [ ] `preflight`, `quality-review`, and `drive-browser` are absent unless their gates below pass on the same candidate. `worktrunk-hook` remains absent because it has no Pi skill/resource.

### 2. Package mechanics

- [ ] Root `package.json` is private and contains Pi metadata, but no `scripts` and no dependency field of any kind (`dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`, or bundled dependencies). It exposes no extensions, prompts, or themes.
- [ ] A lockfile generated from that metadata is committed. With the supported npm versions documented by the implementation, two clean `npm install --ignore-scripts` runs leave both `package.json` and `package-lock.json` byte-identical. The lockfile guard runs in CI.
- [ ] Installing the exact candidate through an HTTPS GitHub source succeeds in isolated `HOME`, `PI_CODING_AGENT_DIR`, cwd, settings, and package cache. The installed clone resolves to the candidate SHA, `git status --porcelain` stays empty after Pi's `npm install`, generated `node_modules/` is ignored, and install/update creates no persistent checkout drift.
- [ ] Static inventories run with extensions explicitly disabled. They report exactly the approved skill paths/names and zero package extensions, prompts, and themes. Because resource loading executes trusted code, no configured or project extension may load during inventory.
- [ ] Any Pi SDK registry inspection is labeled **equivalent-configuration instrumentation**, not proof of what the CLI process loaded. CLI claims require CLI trace or output.
- [ ] A controlled moving HTTPS ref advances from candidate A to candidate B through a targeted package update without changing unrelated packages. Reinstalling/pinning A rolls back its checkout and inventory; restoring the moving source returns to B. Every step records source, ref, resolved SHA, settings, and inventory.
- [ ] Coexistence passes against isolated copies of relevant global, project, cwd, and ancestor skill configuration. Pi emits no unresolved duplicate-name warning, the selected resource for every collision matches documented precedence, and Claude/Codex marketplaces remain unchanged.
- [ ] `ruby scripts/validate_pi_package.rb` fails on an unapproved path, glob, missing file, duplicate name, extension exposure, lifecycle script, dependency field, stale lockfile, or generated install drift.

### 3. Skill behavior

- [ ] `bash scripts/test_pi_skills.sh <candidate-sha>` runs real Pi CLI sessions against inert fixtures with isolated resources, extensions disabled, least-privilege tools, and sanitized logs. Loading, manifest validation, fake-model expansion, or green static CI does not satisfy this gate.
- [ ] Every included skill has a passing semantic black-box case tied to the candidate SHA:

  | Skill(s) | Required observable behavior |
  |---|---|
  | `align`, `clarify` | Surface understanding or unresolved decisions, then wait rather than silently choosing. |
  | `design-options`, `pre-mortem` | Produce genuinely distinct tradeoffs or concrete failure modes without implementing them. |
  | `explore` | Inspect real fixture files, cite grounded findings, and leave the tree unchanged. |
  | `handoff`, `reflect` | Produce accurate durable context; write only to an explicitly allowed isolated destination. |
  | `second-opinion` | With no reviewer channel, label the result as self-critique and make no independence claim. |
  | `silent-failures` | Find the planted swallowed-error defect and identify its concrete user/operational impact. |
  | `spec` | Produce checkable DoDs, boundaries, terrain, and end-to-end verification. |
  | `steel-man-own-position` | Restate the prior position and its goal before accepting or rejecting pushback. |
  | `understudy` | Infer fixture conventions and produce a conforming isolated change. |
  | `verify-claims`, `verify-result` | Separate claims from evidence, run black-box checks, and leave unsupported claims unresolved. |

- [ ] Assertions test semantic safety and artifact correctness separately. Citation style, heading spelling, and prose layout are non-gating diagnostics.
- [ ] A changed skill, harness, model policy, or candidate SHA reruns its behavior gate. Manual stochastic samples are reported as such; they are not called durable regression proof.

### 4. Excluded-skill and reviewer gates

- [ ] `preflight` can enter the allowlist only after exact-candidate Pi runs with `second-opinion` absent and present/no reviewer both complete, inspect the artifact, identify a planted defect, and make no unsupported reviewer claim. Any independent-review claim additionally requires the reviewer proof below.
- [ ] `quality-review` can enter only after every advertised Pi level has a defined implementation and inert black-box coverage. High/xhigh/max require a proven Pi-native replacement for the unavailable `Workflow` lifecycle, including child file access and returned results.
- [ ] `drive-browser` can enter only after its Node/Playwright runtime and dependency source are declared and an isolated, non-authenticated browser fixture proves launch/attach behavior safely. The dependency-free root package may not silently supply Playwright.
- [ ] Pi reviewer independence is **unverified by default**. A future reviewer extension must prove, from host traces: distinct context/session, peer-or-stronger model, sufficient neutral task context, direct access to each required artifact, report return before parent finalization, substantive integration, and no false independence label. `second-opinion` must first define permitted prompt framing and the high-stakes reviewer count. One seeded or self-like child does not pass.

### 5. Documentation and release evidence

- [ ] README and a Pi compatibility document give exact HTTPS install, targeted update, pin/rollback, remove, filtering, and enable/disable instructions. They distinguish catalog/startup notification from installed-content updates.
- [ ] A sanitized durable artifact attached to the candidate's GitHub run records commands, tool versions, resolved SHAs, inventories, behavior verdicts, coexistence results, and exclusions. It contains no credentials, auth symlinks, raw hidden reasoning, or live app state.
- [ ] Codex generation/validation passes, every `plugins/*` directory passes Claude's strict plugin validator, both marketplace inventories are unchanged, and representative shared skills still load on both hosts. Validating one plugin does not support a repository-wide compatibility claim.

## Boundaries

- Do not add Agent Plugins emulation, `pi-agent-plugins`, Pi-specific invocation prose to shared skills, package extensions, runtime dependencies, or lifecycle scripts.
- Do not expose all repository plugins merely because they load. Metadata, manifests, validators, generated files, and CI are not behavioral compatibility.
- Do not modify live Pi/Claude/Codex settings while testing; use isolated copies. Do not claim automatic Pi package updates—Pi startup notification and explicit update are separate behavior.
- Do not include `preflight`, `quality-review`, or `drive-browser` by default. Their gates are independent of core package completion.

## Terrain (advisory)

- `package.json`, `package-lock.json`, `.gitignore`: native Pi package metadata and deterministic install state.
- `scripts/validate.rb`, `.github/workflows/validate.yml`: existing generic validation/CI to extend without encoding skill prose.
- `scripts/generate_codex.rb`: preserve generated Codex metadata and marketplace invariants.
- `plugins/*/skills/*/SKILL.md`: canonical shared skill sources; do not copy them into a Pi-only tree.
- `README.md`, `CODEX-COMPATIBILITY.md`, proposed Pi compatibility doc: host boundaries and user instructions.
- Pi 0.84.1 package and skill rules are defined in `docs/packages.md` and `docs/skills.md`; re-check current upstream docs before implementation.

## Verification

Run, in order, against the final candidate SHA:

```bash
ruby scripts/generate_codex.rb --check
ruby scripts/validate.rb
ruby scripts/validate_pi_package.rb
for plugin in plugins/*; do claude plugin validate "$plugin" --strict; done
npm install --ignore-scripts
git diff --exit-code -- package.json package-lock.json
bash scripts/test_pi_package.sh <candidate-sha>
bash scripts/test_pi_skills.sh <candidate-sha>
```

Then inspect the attached evidence, confirm every DoD references the same candidate SHA, and run a fresh-context review. Any source change sends package mechanics, affected behavior, coexistence, and evidence generation back through verification.
