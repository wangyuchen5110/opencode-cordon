[**English**](README.md) | [简体中文](README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/opencode-cordon.svg)](https://www.npmjs.com/package/opencode-cordon)
[![node](https://img.shields.io/node/v/opencode-cordon.svg)](https://nodejs.org)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![OpenCode 2](https://img.shields.io/badge/OpenCode-2.2.x-1f2937)](#compatibility--status)

# opencode-cordon

**A declarative permission cordon with an audit trail for OpenCode 2.**

> 给 OpenCode 2 的权限警戒线：声明式策略 + 可审计的决策日志。

opencode-cordon hooks the OpenCode 2 permission decision. One `.opencode/cordon.jsonc` decides
which actions get tightened, every decision is appended to a JSONL log, and `cordon audit`
turns that log into a self-contained HTML report. It **only tightens, never loosens** — the
worst case is "too strict", never "silently allowed".

```
$ cordon evaluate --action shell --command "rm -rf /tmp/x"
deny  rule preset:destructive — irreversible shell command

$ cordon audit --log .opencode/cordon/audit.jsonl --html audit.html
cordon audit …  decisions 12  deny 3 · ask 2 · pass 7  …  html audit.html
```

## Why this exists

1. **Leaked credentials are not hypothetical.** The 2026-10-17 HN thread
   ["OpenCode Hacked: User credentials leaked"](https://news.ycombinator.com/item?id=50133401)
   reached **977 points / 185 comments**. In the repo,
   [#46745](https://github.com/anomalyco/opencode/issues/46745) records provider plugins writing
   stored API keys into `process.env`, leaking them to every child process.
2. **There is still no sandbox.** [#2242 "Is there a way to sandbox the agent?"](https://github.com/anomalyco/opencode/issues/2242)
   has been open since 2025-08 with **106 comments / 👍82**. OpenCode 2.0 removed LSP, session
   sharing and a pile of other features; permission is still a coarse config switch.
3. **Every existing tool solves one point.** Permission plugins all sit below 40★:
   opencode-auto-permissions 38★, opencode-permission-reviewer 20★, opencode-warden 16★. The
   highest-star project in this space, opencode-vibeguard (217★), stopped in 2026-03. **Nobody
   ships a policy engine plus an audit trail.** (See
   [`docs/research/scout-tooling.md`](docs/research/scout-tooling.md) §2.4 and
   [`docs/WHY.md`](docs/WHY.md).)

## What it is

- **A permission decision layer.** It hooks `ctx.permission.hook("evaluate")` and can only
  tighten the native effect. Server part only (`Plugin.define`): no patch, no fork, no change to
  OpenCode's own permission config.
- **A declarative policy.** `.opencode/cordon.jsonc` rules match on `action`, `tool`, `path`,
  `command` and `agent`; the file lives in your repo, diffs in review, and ships with the project.
- **An append-only log.** Every permission decision, tool call and shell creation is one JSONL
  line. `cordon audit` summarises it and renders a single-file HTML report.
- **A zero-dependency CLI.** `check`, `evaluate`, `audit`, `init`, `redact` — offline, stable exit
  codes, usable from CI without OpenCode running.

## What it is not

- **Not a sandbox.** No process, filesystem or network isolation. It only sees what goes through
  OpenCode's permission decisions and tool/shell events.
- **Not a replacement for native permissions.** cordon only tightens. To loosen something, edit
  OpenCode's own permission config.
- **Not a secrets manager / DLP product.** `redact` is best effort by pattern; the reliable move
  is a rule that keeps secret paths out of the context window in the first place.
- **Not a cryptographically tamper-proof log.** "Tamper-evident" here means each record is bound
  to a rule and reason, remote commands are stored as SHA-256, secrets are redacted by default and
  the file is append-only. Anyone with local write access can still edit it; ship the JSONL to an
  external sink if you need real guarantees.
- **Not a V1 compatibility layer.** OpenCode 1.18.x has no equivalent permission hook.
- **Not an LLM permission reviewer.** Decisions are local, deterministic rules: no tokens, no
  network calls.

The full threat model and vulnerability reporting flow live in [SECURITY.md](SECURITY.md).

## The one rule that matters: tighten only

| native `effect` | cordon `deny` | cordon `ask` | cordon `allow` / no match |
| --- | --- | --- | --- |
| `allow` | **deny** | **ask** | allow (untouched) |
| `ask` | **deny** | ask (untouched) | ask (untouched) |
| `deny` | deny (untouched) | deny (untouched) | deny (untouched) |

A user rule with `effect: "allow"` does not widen anything — it *exempts* the matching call from
later cordon rules, so the native decision passes through unchanged. That is the intended way to
carve out exceptions from a preset.

## Install

The plugin part needs **OpenCode 2.2.x**. The CLI needs **Node ≥ 20** (ESM, zero runtime
dependencies).

```bash
# 1) install the plugin (written to your OpenCode config, loaded on next start)
opencode plugin add opencode-cordon

# 2) install the CLI (or just use npx)
npm install -g opencode-cordon     # the short alias is `cordon`
npx opencode-cordon --version
```

The CLI is useful on its own: policy validation and audit reports do not require a running
OpenCode.

## Quick start (5 minutes)

```bash
# 1. drop a policy into the current project (balanced by default)
npx opencode-cordon init
# → .opencode/cordon.jsonc

# 2. validate it. 0 = ok, 2 = invalid
npx opencode-cordon check

# 3. try a few decisions and their exit codes
npx opencode-cordon evaluate --action shell --command "rm -rf ./build"        # 20 = deny
npx opencode-cordon evaluate --action shell --command "git push origin main"  # 10 = ask
npx opencode-cordon evaluate --action read  --path "/repo/README.md"          #  0 = pass

# 4. render the audit report from a log
npx opencode-cordon audit --log .opencode/cordon/audit.jsonl --html audit.html --open
```

A rendered example lives at [`docs/demo/audit.html`](docs/demo/audit.html) — open it in a browser.
It is a single file with no external assets.

## Policy file

Two locations, same format:

| Location | Purpose |
| --- | --- |
| `.opencode/cordon.jsonc` | project policy, committed and reviewed with the repo |
| `~/.config/opencode/cordon.jsonc` | global policy, shared across projects |

```jsonc
{
  "version": 1,
  "preset": "balanced",            // balanced (default) | strict | relaxed
  "audit": {
    "enabled": true,
    "path": ".opencode/cordon/audit.jsonl",
    "redact": true,
    "storeCommand": true,
    "commandHash": false           // true = only sha256 of the command, no plaintext
  },
  "rules": [
    {
      "id": "no-destructive",
      "effect": "deny",            // deny | ask | allow
      "match": { "action": "shell", "command": "rm -rf *" },
      "reason": "destructive shell command"
    },
    {
      "id": "protect-env",
      "effect": "deny",
      "match": { "action": "read|edit|write", "path": ["**/.env*", "**/.ssh/**"] },
      "reason": "secrets never enter the context"
    },
    {
      "id": "exempt-fixtures",
      "effect": "allow",
      "match": { "action": "read", "path": "test/fixtures/**" },
      "reason": "tests may read fixtures"
    }
  ]
}
```

### Top-level fields

| Field | Type | Notes |
| --- | --- | --- |
| `version` | number | currently `1` |
| `preset` | string | `balanced` (default) / `strict` / `relaxed` |
| `audit.enabled` | boolean | write the JSONL log (default `true`) |
| `audit.path` | string | default `.opencode/cordon/audit.jsonl` |
| `audit.redact` | boolean | redact secrets before writing (default `true`) |
| `audit.storeCommand` | boolean | store redacted command text (default `true`) |
| `audit.commandHash` | boolean | store only the SHA-256 of commands (default `false`) |
| `rules` | array | user rules, evaluated before preset rules |

A policy file without `preset` evaluates with the `balanced` preset rules. **No policy file at
all means the plugin stays idle** (one log line, no invented rules).

### Rule matching

`match` supports five fields; all fields present on a rule must match (AND), array values are OR:

| Field | Matches against | Path mode |
| --- | --- | --- |
| `action` | the permission action (`shell`, `read`, `edit`, …) | no |
| `tool` | the tool name (falls back to `action`) | no |
| `command` | the shell command(s) of the request | no (`*` crosses spaces) |
| `path` | file paths of the request | yes (`*` stays in one segment) |
| `agent` | the agent id | no |

Globs: `*` (any characters except `/` in path mode), `**` (across directories, and `**/` may
match zero directories), `?` (one character), `{a,b}` (alternatives), `a|b` (alternatives, for
action/tool/agent). Matching is case-insensitive.

Evaluation order: **user rules in declaration order, then preset rules; first match wins**. No
match leaves the native decision untouched.

### Presets

| Preset | What it adds |
| --- | --- |
| `relaxed` | denies secret paths, irreversible shell commands; asks for outbound network commands |
| `balanced` | `relaxed` + asks for `git push`, publish/release commands and web fetch |
| `strict` | `balanced` + asks for every shell command and every edit |

Run `cordon check` to print how many user and preset rules are active.

## CLI

| Command | What it does | Exit codes |
| --- | --- | --- |
| `check [--policy f] [--json]` | validate the policy, print effective rules | 0 ok, 2 invalid |
| `evaluate --action a [--command c] [--path p] [--tool t] [--agent id]` | decide a single call | 0 pass, 10 ask, 20 deny |
| `audit --log f [--html out] [--open] [--json]` | summarise a log, render HTML | 0 ok, 4 missing log |
| `init [--preset p] [--out f] [--force]` | write a starter policy | 0 ok, 1 exists/usage |
| `redact [file]` | redact secrets from a file or stdin | 0 |

## Audit log and report

Each JSONL line is one event (`decision`, `tool` or `shell`), for example:

```json
{"v":1,"ts":"2026-11-03T02:14:05.120Z","event":"decision","sessionID":"ses_9f2c1","agent":"build","action":"shell","decision":"deny","nativeEffect":"allow","effect":"deny","rule":"preset:destructive","reason":"irreversible shell command","command":"rm -rf /tmp/scratch","commandHash":"a1b2…"}
```

Fields: `ts`, `event`, `sessionID`, `agent`, `action`, `tool`, `decision` (deny/ask/allow/pass),
`nativeEffect`, `effect`, `rule`, `reason`, `paths`, `command` (redacted), `commandHash`,
`redactions`, `status` / `durationMs` for tool events.

`cordon audit --html report.html` renders the summary cards, the top rules that fired, and a
filterable timeline. Secrets are redacted before they reach the log, and every command always
gets a stable hash so records can be correlated without the plaintext.

## Compatibility & status

| Item | Status |
| --- | --- |
| OpenCode 2.2.x plugin | implemented against `@opencode/plugin` 2.2.5 typings |
| OpenCode 1.x | not supported (no `permission.evaluate` hook) |
| CLI | works standalone on Node 20/22/24 |
| Tests | `node --test test/guard.test.mjs` (50 tests) |
| Real-machine regression | pending: the development machine runs OpenCode 1.18.4, so the plugin hasn't been exercised on a live 2.2.x server yet |

The core engine, redaction, audit writer and HTML report are fully unit-tested. The plugin file is
a thin adapter (load policy → register hooks → write audit records); the remaining risk is hook
payload drift across 2.2.x minors. Treat 0.1.x as a preview, pin the OpenCode minor, and open an
issue with the log if a hook shape differs.

## Roadmap

- [ ] Live regression run on OpenCode 2.2.x and a recorded fixture of hook payloads
- [ ] `session.panel` TUI part: a live "what is being blocked right now" panel
- [ ] Policy diff in `cordon check --explain` (why a call matched)
- [ ] Import/export presets, community policy packs
- [ ] GitHub Action that fails a PR when dangerous rules are removed

## Research

This project started from a survey of the OpenCode ecosystem. The raw reports are committed:

- [`docs/research/scout-tooling.md`](docs/research/scout-tooling.md) — tooling, security, DB ops, migration
- [`docs/research/scout-visual.md`](docs/research/scout-visual.md) — TUI/visual plugins and the gaps
- [`docs/WHY.md`](docs/WHY.md) — why a policy engine + audit trail, and what a cordon is not

## Contributing

Issues and pull requests are welcome. Run `node --test test/guard.test.mjs` before sending a PR;
keep the package dependency-free (`node:` built-ins only) and add a test for every new rule
matcher or redaction pattern.

## License

[MIT](LICENSE) © 2026 wangyuchen5110
