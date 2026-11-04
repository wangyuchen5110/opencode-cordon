# Security policy

## What cordon protects

cordon is a defense-in-depth layer around OpenCode 2 permission decisions. It can:

- deny a call before it runs (secrets paths, destructive shell commands, credential exfiltration),
- turn a silent `allow` into an `ask` so a human sees it,
- leave an append-only JSONL trail of decisions, tool calls and shell creations,
- redact common secret formats before they are written to that trail.

## What cordon is not

- **Not a sandbox.** It does not isolate processes, filesystems or the network. A plugin or a
  tool that already has shell access is outside cordon's reach.
- **Not an authorization boundary by itself.** The upstream decision still comes from
  OpenCode. cordon only tightens it; it never widens it.
- **Not a replacement for OS-level isolation** (containers, microVMs, `bubblewrap`,
  macOS `sandbox-exec`) when running untrusted code.
- **Not a secret scanner for your repository.** `cordon redact` handles the patterns listed in
  `src/redact.mjs`; treat it as a safety net, not compliance.

## Trust model

cordon runs inside the OpenCode server process with the same privileges as the agent's tools.
If an attacker can execute arbitrary code in that process, they can disable or tamper with the
audit log. The audit trail is append-only by convention, not by cryptographic guarantee.
From 0.1.5, new logs link each record to the previous one with SHA-256 (`prev` and `hash`).
`cordon audit` exits 5 when that chain breaks, which catches an edited, deleted or reordered line.
A full rewrite can be recomputed, logs from before 0.1.5 stay valid and are reported as legacy,
and two writers appending at once can fork the chain. For a real guarantee, ship the JSONL
records to an external append-only sink.

## Failure behavior

- Missing policy file: the plugin stays idle and logs one line. It does not invent rules.
- Invalid policy file: the plugin stays idle, logs the validation errors, and fails closed in
  the sense that it never weakens a native decision.
- Hook exceptions are caught and logged; a cordon bug must not break a session.
- Audit write failures are logged and never thrown.

## Reporting a vulnerability

Open a private security advisory on
<https://github.com/wangyuchen5110/opencode-cordon/security/advisories/new>.
Please include the policy and audit records needed to reproduce, with secrets replaced by
`[REDACTED]`. Do not open a public issue for a vulnerability.

## Supported versions

Only the latest minor release receives security fixes while the project is pre-1.0.
