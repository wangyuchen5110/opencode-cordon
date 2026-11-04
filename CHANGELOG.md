# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.5] - 2026-11-04

### Added

- New audit logs link each record to the previous one with SHA-256 (`prev`, `hash`). `cordon audit` checks the chain and exits 5 when a line was edited, removed or reordered. Logs written before this version stay valid and are reported as legacy.
- The HTML report shows that chain status. Its version comes from `package.json`.

The chain detects an in-place edit. Rewriting the file and recomputing the hashes still passes, and two writers appending at once can fork the chain. It is not a tamper-proof log.

### Changed

- A command rule is also tried against the text inside `bash -c`, `sh -c`, `powershell -Command` and `cmd /c`, including a path prefix such as `/bin/bash`. The raw command is still tested, so a wrapper can only add a match.
- The destructive preset also denies split `rm` flags (`rm -r -f`, `rm --recursive --force`), `Remove-Item -Recurse`, `rmdir /s`, and a force-push whose `--force` or `-f` comes after the remote (`git push origin --force`, `git push origin main -f`). `git push origin main` still asks. `git push origin feature-f` does not count as `-f`.
- `git -C repo push --force` still misses these globs. Cordon does not reorder git's global options.

## [0.1.4] - 2026-11-03

### Fixed

- Command globs collapse whitespace before matching, so `rm  -rf /tmp` and `git\tpush origin` hit the same rules as the single-spaced form.
- Path globs treat `\` as `/`, so a Windows pattern such as `**\.env*` matches `C:\repo\.env`.
- The destructive preset also denies `rm -fr` and a path-prefixed `rm` (`/bin/rm -rf …`).

## [0.1.3] - 2026-11-03

### Changed

- README images now use absolute raw.githubusercontent.com URLs so the banner, architecture diagram and report screenshot also render on the npm package page.

## [0.1.2] - 2026-11-03

### Changed

- Moved the Chinese README to `docs/README.zh-CN.md` so `README.md` is the single root readme and
  the npm package page shows the English one (the Chinese page is linked from it).
- npm package no longer lists the removed root `README.zh-CN.md` in `files`.

## [0.1.1] - 2026-11-03

### Changed

- README (English and Chinese) rewritten around the problem, the live regression evidence, a
  banner, an architecture diagram and a real audit-report screenshot.
- The HTML report now shows the audit log path exactly as given instead of an absolute path.

### Fixed

- CI: the "evaluate does not loosen a deny" step now asserts exit code 20 and the JSON decision
  through `scripts/ci-evaluate.mjs`, instead of treating a correct deny as a failed step.

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
