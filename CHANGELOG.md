# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-03

### Added

- Policy engine (JSONC) with `relaxed` / `balanced` / `strict` presets, glob matching on
  action, tool, path, command and agent, and first-match-wins ordering.
- `permission.evaluate` hook that can only tighten a decision: deny always wins, ask only
  upgrades an allow, and an allow or non-match leaves the native decision untouched.
- Append-only JSONL audit log for permission decisions, tool calls and shell creation.
- Secret redaction (provider keys, tokens, private keys, bearer headers, URL credentials,
  assigned secrets) with stable per-secret hashes.
- `opencode-cordon` CLI: `check`, `evaluate`, `audit`, `init`, `redact`.
- Self-contained HTML audit report with filters, search and top-rule bars.
- 50+ unit tests covering the policy engine, redaction, audit log, report and the plugin adapter.

### Verified

- Live regression on OpenCode 2.2.5 (2026-11-03, `--auto` on): reading `.env` was tightened from
  `ask` to `deny`, `rm -rf ./scratch` was tightened from `allow` to `deny`, both decisions were
  written to the JSONL audit log, and the target file survived. See `docs/REGRESSION.md`.
- `test/plugin.test.mjs` drives the real `@opencode/plugin` hooks through a fake context:
  registration, tightening semantics, audit records, cleanup and policy-file overrides.
