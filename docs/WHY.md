# Why cordon exists

`opencode-cordon` is a permission policy engine with an audit trail for OpenCode 2. This note records the evidence and the reasoning behind it: what is missing in the opencode ecosystem, why the gap is *policy + audit* rather than another sandbox or another LLM reviewer, and what the project deliberately refuses to do.

Data snapshot: 2026-11-03. Stars, issue counts and HN scores below are from that date; sources are the two research notes in this directory and the links given inline.

## The evidence

1. **Credential leaks are not hypothetical.** On 2026-10-17 the HN thread *"OpenCode Hacked: User credentials leaked"* reached **977 points / 185 comments** ([HN 50133401](https://news.ycombinator.com/item?id=50133401)); press coverage put it at roughly 1.4% of Console users. In the repo, [issue #46745](https://github.com/anomalyco/opencode/issues/46745) documents the same class of failure at plugin level: the Amazon Bedrock and SAP AI Core plugins write stored API keys into `process.env`, leaking them to every child process.
2. **Upstream has never shipped a sandbox.** [Issue #2242, "Is there a way to sandbox the agent?"](https://github.com/anomalyco/opencode/issues/2242) has been open since 2025-08 and is now at **106 comments / 👍82**. OpenCode 2.0 removed LSP support and session sharing, but not the gap around agent permissions; permissions remain coarse switches in core config, and [issue #7006](https://github.com/anomalyco/opencode/issues/7006) (closed) reported that the `permission.ask` hook was defined but never triggered.
3. **The existing tools are single points.** Every permission-decision plugin is under 40 stars: [opencode-auto-permissions](https://github.com/hueyexe/opencode-auto-permissions) (38★), [opencode-permission-reviewer](https://github.com/warc0s/opencode-permission-reviewer) (20★), [opencode-warden](https://github.com/toreuyar/opencode-warden) (16★). The highest-star project in the area, [opencode-vibeguard](https://github.com/inkdust2021/opencode-vibeguard) (217★), is a redaction proxy that has been stale since March 2026. Nobody combines a **declarative policy engine** with an **audit trail**. Details: [`scout-tooling.md` §2.4](research/scout-tooling.md).

## What exists today

| Project | ★ (2026-11-03) | What it does | Gap |
|---|---|---|---|
| [opencode-vibeguard](https://github.com/inkdust2021/opencode-vibeguard) | 217 | Replaces secrets/PII with placeholders before the model sees them, restores locally | Redaction only; stale since 2026-03; V1-era; no policy, no decision log |
| [envsitter-guard](https://github.com/boxpositron/envsitter-guard) | 84 | Blocks reads/edits of `.env*`, exposes key fingerprints | One path pattern; no policy, no audit |
| [opencode-auto-permissions](https://github.com/hueyexe/opencode-auto-permissions) | 38 | A model decides allow/deny for permission asks | Non-deterministic, token cost per decision, no audit trail |
| [opencode-permission-reviewer](https://github.com/warc0s/opencode-permission-reviewer) | 20 | Routes each `ask` to a tool-free model; one JSONL line per review | An LLM in the hot path; a reviewer, not a policy you can version and test |
| [opencode-warden](https://github.com/toreuyar/opencode-warden) | 16 | Intercepts tool calls, detects secrets, redacts | Detection only; no rules, no report |
| [opencode-sandbox-plugin](https://github.com/isanchez31/opencode-sandbox-plugin) | 69 | Wraps command execution in a sandbox runtime | Process-level; blind to permission decisions |
| OS sandboxes: [agentbox](https://github.com/madarco/agentbox) 566★, [cplt](https://github.com/navikt/cplt) 141★, [opencode-bwrap](https://github.com/didvc/opencode-bwrap) 23★ | — | microVM / container / bubblewrap isolation around the whole process | Heavy; no structured permission events; V2 runs tool calls in the daemon, so wrappers around the CLI no longer contain everything |
| Official [ecosystem page](https://opencode.ai/docs/ecosystem) (31 plugins) | — | Lists exactly one security plugin, vibeguard | Same stale redaction tool; no policy engine or audit product anywhere |

## The failure mode today

OpenCode runs an agent in a repo. It reads `.env.local` "to check configuration", deletes a build directory, pushes a branch, and fetches a URL. The session completes, nothing errors out, and afterwards nobody can say which of those steps was allowed by a default, which by a human prompt, and which by a plugin that meant well. The transcript has tool calls but no decision record; the config has coarse switches and no per-repo rule for `.env*`.

That is the shape of the problem cordon targets, at the granularity OpenCode already exposes:

```jsonc
{
  "version": 1,
  "preset": "balanced",
  "rules": [
    { "id": "protect-env", "effect": "deny", "match": { "action": "read|edit|write", "path": "**/.env*" } },
    { "id": "ask-push", "effect": "ask", "match": { "action": "shell", "command": "git push*" } }
  ]
}
```

Two rules, checked into the repo, reviewed like code, evaluated deterministically before the agent acts — and one JSONL line per decision that can be turned into a report.

## Why policy + audit

**Not another sandbox.** Sandboxes are orthogonal to this problem, but they are blind: they enforce at the process and network level and cannot answer "which rule allowed this, and who changed it". With V2, tool calls are executed by the daemon, so a wrapper around the `opencode` process no longer contains the whole agent (a complaint repeated in the [2.0 HN thread](https://news.ycombinator.com/item?id=50094994)). The permission event, on the other hand, carries structured data — `action`, `resources`, `agent`, `effect`, `message` — which is exactly the right place to enforce a policy and to record the outcome.

**Not another LLM reviewer.** Putting a model in the permission path means latency and tokens per decision, non-determinism, and no artifact you can pin in git and test. For "should this run unattended?" a human can answer; for "is this class of operation ever allowed in this repo?", a rule file is the right unit. cordon keeps human-in-the-loop where it already exists (native `ask`) and never weakens anything.

**What is actually missing.** (a) A declarative policy that lives in the repo, reviewable and diffable like code; (b) deterministic evaluation that CI can assert on; (c) a per-decision log that carries rule id and reason, redacted and safe to share; (d) semantics where a misconfiguration fails **closed**. Those four are the project.

## Design trade-offs

- **Tighten-only.** Rules can make a decision stricter, never looser. `deny` always wins; `ask` upgrades a native `allow` only; `allow` or no match leaves the native decision untouched. A broken policy therefore produces extra prompts or extra blocks, not a silent `rm -rf`. This is the single most important property in the design.
- **Keep the native decision.** cordon is an overlay on `ctx.permission.hook("evaluate")`, not a fork, patch or config rewrite. Whatever the core decides stays in force whenever a rule does not apply. It also means cordon can never weaken a deny that an organization already set.
- **Deterministic, local, zero dependency.** No model, no network call, no tokens spent per decision. Plain ESM on Node ≥ 20 with no runtime dependencies, so policy is testable in CI. `evaluate` exits `0 / 10 / 20` for pass / ask / deny.
- **Append-only, redacted by default.** Decisions are one JSONL line each; remote commands are stored as SHA-256 only when enabled; secrets are redacted before they hit the log. "Tamper-evident" here means each record is bound to a rule id and reason and the log is append-only — it is not a cryptographic proof against a local admin, and the threat model says so.
- **Plugin thin, CLI independent.** The plugin is a server part that only wires hooks to the engine. The CLI does not need a running OpenCode, so policy can be written and tested before anything is installed.

## Alternatives considered

| Approach | Why it is not the default here |
|---|---|
| Ship another sandbox | Orthogonal and heavy; it does not see permission decisions, and V2 daemon execution escapes CLI-level wrappers. Stack it if you can. |
| Put an LLM in front of every `ask` | Latency and token cost on the critical path, non-deterministic outcomes, nothing to pin in git. Existing reviewer plugins already cover this niche. |
| Patch or fork core permissions | Maintenance burden against a fast-moving V2 (2.0.32 → 2.2.5 in under three weeks) and no upgrade path for users. |
| Audit-only (log everything, enforce nothing) | Cheaper, but logs after the fact do not stop the `rm -rf`. Enforcement and logging must share the same rules to stay honest. |
| Do nothing | The credential-leak incident and the 15-month-old sandbox issue say the default is not acceptable. |

## What cordon will not do

- **No sandbox, no isolation.** No process isolation, no network isolation, no syscall filtering. Those are separate tools and can be stacked.
- **No V1 support.** OpenCode 1.18.x has no equivalent permission hook; only the CLI works there.
- **No LLM in the decision path.** No remote policy service in 0.1.0 either.
- **No secrets management.** `redact` is a best-effort rule-based scrubber, not a PII/DLP classifier or a vault.
- **No claim of tamper-proof logs.** A local user with write access can edit the JSONL; that needs external log shipping and file permissions.
- **No visual dashboard.** A status line or token HUD would be late to a saturated market: 20+ statusline plugins, and the core now ships per-response `t/s`, token usage and context display (see [`scout-visual.md` §0 / §7](research/scout-visual.md)). The unclaimed space is the safety control plane, not another footer.

## Who it is for

- Teams running agents on shared repos who want a reviewable rule file and a per-run decision report.
- People who already run a sandbox and want the *inside* of the permission boundary to be explicit.
- Tooling and CI authors who want to assert policy without starting an OpenCode session.

## Status and scope

0.1.5 is verified on OpenCode 2.2.5 (see [`REGRESSION.md`](REGRESSION.md)). The plugin only tightens `permission.evaluate`. New logs carry a hash chain that detects an edited, deleted or reordered line; a local rewrite can still be recomputed, so this is not a tamper-proof log. A TUI `session.panel` for recent decisions is still later. Cordon has no visual dashboard and no sandbox.

## Sources

- [`scout-tooling.md`](research/scout-tooling.md) — §2.4 permission/security landscape, §3 ecosystem audit, §4 G1 (strongest evidence), §5 recommendation.
- [`scout-visual.md`](research/scout-visual.md) — §0 and §7, the negative results on token/statusline visuals and session search.
- HN 50133401 — <https://news.ycombinator.com/item?id=50133401>
- Issues — <https://github.com/anomalyco/opencode/issues/2242>, <https://github.com/anomalyco/opencode/issues/46745>, <https://github.com/anomalyco/opencode/issues/7006>
- OpenCode V2 plugin docs — <https://opencode.ai/v2/docs/build/plugins>
