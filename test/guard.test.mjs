import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  globToRegExp,
  looksLikePath,
  matchAlternatives,
  matchGlob,
  parseJsonc,
  sha256,
  stripJsonComments,
  stripTrailingCommas,
} from "../src/util.mjs";
import {
  PRESET_RULES,
  PRESETS,
  auditSettings,
  loadPolicy,
  parsePolicyText,
  resolveRules,
  starterPolicy,
  validatePolicy,
} from "../src/policy.mjs";
import { applyDecision, decide, normalizePermission, normalizeToolCall, ruleMatches } from "../src/decision.mjs";
import { redactText } from "../src/redact.mjs";
import { appendRecord, createAuditWriter, readRecords, summarize } from "../src/audit.mjs";
import { renderAuditReport } from "../src/report.mjs";
import { main, parseArgs } from "../src/cli.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_POLICY = path.join(here, "fixtures", "cordon.jsonc");
const FIXTURE_AUDIT = path.join(here, "fixtures", "audit.jsonl");

function tempDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "cordon-test-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function silent(fn) {
  const logs = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => logs.push(args.join(" "));
  console.error = (...args) => logs.push(args.join(" "));
  try {
    return { value: fn(), logs };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

// ---------------------------------------------------------------- JSONC / util

test("stripJsonComments keeps comment markers inside strings", () => {
  const text = stripJsonComments('{"a":"http://x//y", // real\n "b":1}');
  assert.ok(text.includes("http://x//y"));
  assert.ok(!text.includes("// real"));
});

test("parseJsonc accepts comments, trailing commas and single quotes-like text", () => {
  const parsed = parseJsonc('{\n // hi\n "a": [1,2,],\n "b": {"c": "value,}",},\n}');
  assert.deepEqual(parsed, { a: [1, 2], b: { c: "value,}" } });
});

test("stripTrailingCommas does not eat commas in strings", () => {
  assert.equal(parseJsonc('{"a":"x,}","b":[1,],"c":2,}').a, "x,}");
});

test("glob: single star does not cross path separators", () => {
  assert.ok(matchGlob("/repo/src/a.ts", "**/src/*.ts"));
  assert.ok(!matchGlob("/repo/src/nested/a.ts", "**/src/*.ts"));
  assert.ok(matchGlob("src/nested/a.ts", "src/**/a.ts"));
});

test("glob: ** matches zero directories", () => {
  assert.ok(matchGlob(".env", "**/.env*"));
  assert.ok(matchGlob("/home/dev/.env.local", "**/.env*"));
  assert.ok(matchGlob("/home/dev/app/.env", "**/.env*"));
});

test("glob: brace alternatives and question mark", () => {
  assert.ok(matchGlob("file1.txt", "file{1,2}.txt"));
  assert.ok(matchGlob("file2.txt", "file{1,2}.txt"));
  assert.ok(!matchGlob("file3.txt", "file{1,2}.txt"));
  assert.ok(matchGlob("a1", "a?"));
});

test("glob: command mode lets * cross spaces and is case-insensitive", () => {
  assert.ok(matchGlob("Git Push origin main", "git push*", { pathMode: false }));
  assert.ok(matchGlob("rm -rf /tmp/x", "rm -rf *", { pathMode: false }));
});

test("matchAlternatives splits on pipes", () => {
  assert.ok(matchAlternatives("edit", "read|edit|write"));
  assert.ok(matchAlternatives("Edit", "read|edit|write"));
  assert.ok(!matchAlternatives("bash", "read|edit|write"));
  assert.equal(matchAlternatives(undefined, "read"), false);
});

test("looksLikePath recognises files, windows paths and commands", () => {
  assert.ok(looksLikePath("/etc/passwd"));
  assert.ok(looksLikePath("C:\\Users\\dev\\.env"));
  assert.ok(looksLikePath("package.json"));
  assert.ok(looksLikePath("./src/index.mjs"));
  assert.ok(!looksLikePath("git status"));
});

test("sha256 is stable and truncatable", () => {
  assert.equal(sha256("a", 8), sha256("a", 8));
  assert.equal(sha256("a", 8).length, 8);
  assert.notEqual(sha256("a", 8), sha256("b", 8));
});

// --------------------------------------------------------------------- policy

test("starter policies are valid for every preset", () => {
  for (const preset of PRESETS) {
    const policy = starterPolicy(preset);
    assert.equal(validatePolicy(policy).ok, true, preset);
    assert.equal(policy.preset, preset);
  }
  assert.equal(starterPolicy("nonsense").preset, "balanced");
});

test("validatePolicy reports duplicates, unknown effects and empty matches", () => {
  const bad = {
    version: 1,
    preset: "chaos",
    rules: [
      { id: "x", effect: "permit", match: {} },
      { id: "x", effect: "deny", match: { action: "shell" } },
      { id: "y", effect: "deny", match: { nonsense: "*" } },
    ],
  };
  const result = validatePolicy(bad);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("preset")));
  assert.ok(result.errors.some((e) => e.includes("effect")));
  assert.ok(result.errors.some((e) => e.includes("non-empty")));
  assert.ok(result.errors.some((e) => e.includes("duplicated")));
  assert.ok(result.warnings.some((w) => w.includes("nonsense")));
});

test("validatePolicy warns that allow rules only exempt", () => {
  const result = validatePolicy({ version: 1, rules: [{ id: "ok", effect: "allow", match: { action: "read" } }] });
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((w) => w.includes("exempts")));
});

test("parsePolicyText returns an error for broken JSONC", () => {
  const result = parsePolicyText('{"version": 1,');
  assert.equal(result.policy, null);
  assert.ok(result.errors[0].startsWith("invalid JSONC"));
});

test("resolveRules puts user rules before preset rules", () => {
  const policy = { version: 1, preset: "balanced", rules: [{ id: "mine", effect: "deny", match: { action: "shell" } }] };
  const rules = resolveRules(policy);
  assert.equal(rules[0].id, "mine");
  assert.equal(rules[0].origin, "user");
  assert.equal(rules.length, 1 + PRESET_RULES.balanced.length);
  assert.ok(rules.slice(1).every((rule) => rule.origin === "preset"));
});

test("auditSettings fills defaults", () => {
  const settings = auditSettings({ version: 1 });
  assert.deepEqual(settings, {
    enabled: true,
    path: ".opencode/cordon/audit.jsonl",
    redact: true,
    storeCommand: true,
    commandHash: false,
  });
  const custom = auditSettings({ version: 1, audit: { enabled: false, commandHash: true, path: "x.jsonl" } });
  assert.equal(custom.enabled, false);
  assert.equal(custom.commandHash, true);
  assert.equal(custom.path, "x.jsonl");
});

test("loadPolicy reads an explicit file and reports missing files", () => {
  const loaded = loadPolicy({ policyPath: FIXTURE_POLICY });
  assert.equal(loaded.file, FIXTURE_POLICY);
  assert.ok(loaded.policy);
  assert.deepEqual(loaded.errors, []);
  const missing = loadPolicy({ policyPath: path.join(here, "nope.jsonc") });
  assert.equal(missing.policy, null);
  assert.equal(missing.file, null);
});

// ------------------------------------------------------------------- decision

test("normalizePermission routes shell resources to commands", () => {
  const subject = normalizePermission({ action: "shell", resources: ["rm -rf /tmp/x"], agent: "build" });
  assert.deepEqual(subject.commands, ["rm -rf /tmp/x"]);
  assert.deepEqual(subject.paths, []);
  assert.equal(subject.agent, "build");
});

test("normalizePermission routes file actions to paths", () => {
  const subject = normalizePermission({ action: "read", resources: ["/repo/.env", "/repo/README.md"] });
  assert.deepEqual(subject.paths, ["/repo/.env", "/repo/README.md"]);
  assert.deepEqual(subject.commands, []);
});

test("normalizeToolCall extracts path and command payloads", () => {
  const subject = normalizeToolCall({ tool: "edit", agent: "build", input: { filePath: "/repo/a.ts", command: "eslint ." } });
  assert.deepEqual(subject.paths, ["/repo/a.ts"]);
  assert.deepEqual(subject.commands, ["eslint ."]);
  assert.equal(subject.action, "edit");
});

test("ruleMatches requires every field to match", () => {
  const rule = { id: "r", effect: "deny", match: { action: "shell", command: "git push*" } };
  const subject = normalizePermission({ action: "shell", resources: ["git push origin main"] });
  assert.equal(ruleMatches(rule, subject), true);
  const other = normalizePermission({ action: "shell", resources: ["git status"] });
  assert.equal(ruleMatches(rule, other), false);
  const wrongAction = normalizePermission({ action: "read", resources: ["git push origin main"] });
  assert.equal(ruleMatches(rule, wrongAction), false);
});

test("balanced preset denies secrets, destructive shell and asks for push", () => {
  const policy = { version: 1, preset: "balanced", rules: [] };
  assert.equal(decide(policy, normalizePermission({ action: "read", resources: ["/repo/.env"] })).decision, "deny");
  assert.equal(decide(policy, normalizePermission({ action: "read", resources: ["/repo/README.md"] })).decision, null);
  assert.equal(decide(policy, normalizePermission({ action: "shell", resources: ["rm -rf /tmp/x"] })).decision, "deny");
  assert.equal(decide(policy, normalizePermission({ action: "shell", resources: ["git push origin main"] })).decision, "ask");
  assert.equal(decide(policy, normalizePermission({ action: "shell", resources: ["ls -la"] })).decision, null);
});

test("strict preset asks for every shell command", () => {
  const policy = { version: 1, preset: "strict", rules: [] };
  assert.equal(decide(policy, normalizePermission({ action: "shell", resources: ["ls -la"] })).decision, "ask");
});

test("first matching rule wins, so allow exempts from preset rules", () => {
  const policy = {
    version: 1,
    preset: "balanced",
    rules: [{ id: "exempt", effect: "allow", match: { action: "read", path: "test/fixtures/**" } }],
  };
  const exempt = normalizePermission({ action: "read", resources: ["test/fixtures/.env"] });
  assert.equal(decide(policy, exempt).decision, "allow");
  const blocked = normalizePermission({ action: "read", resources: ["/repo/.env"] });
  assert.equal(decide(policy, blocked).decision, "deny");
});

test("applyDecision only ever tightens", () => {
  const deny = { decision: "deny", rule: { id: "d" }, reason: "no" };
  const ask = { decision: "ask", rule: { id: "a" }, reason: "maybe" };
  const allow = { decision: "allow", rule: { id: "x" }, reason: "" };
  const pass = { decision: null, rule: null, reason: "" };

  let input = { effect: "allow" };
  let result = applyDecision(input, deny);
  assert.equal(result.changed, true);
  assert.equal(input.effect, "deny");
  assert.equal(input.message, "no");

  input = { effect: "allow" };
  result = applyDecision(input, ask);
  assert.equal(result.changed, true);
  assert.equal(input.effect, "ask");

  input = { effect: "allow" };
  result = applyDecision(input, allow);
  assert.equal(result.changed, false);
  assert.equal(input.effect, "allow");

  input = { effect: "deny" };
  result = applyDecision(input, ask);
  assert.equal(result.changed, false);
  assert.equal(input.effect, "deny");

  input = { effect: "ask" };
  result = applyDecision(input, deny);
  assert.equal(result.changed, true);
  assert.equal(input.effect, "deny");

  input = { effect: "allow" };
  result = applyDecision(input, pass);
  assert.equal(result.changed, false);
  assert.equal(input.effect, "allow");
});

test("decisions never mutate a deny into something weaker", () => {
  const policy = { version: 1, preset: "relaxed", rules: [] };
  const input = { effect: "deny" };
  const decision = decide(policy, normalizePermission({ action: "shell", resources: ["ls"] }));
  applyDecision(input, decision);
  assert.equal(input.effect, "deny");
});

// ------------------------------------------------------------------ redaction

test("redacts provider keys, tokens and bursts", () => {
  const raw = [
    "OPENAI=sk-abcdefghijklmnopqrstuvwxyz123456",
    "GH=gho_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    "AWS=AKIAIOSFODNN7EXAMPLE",
    "Authorization: Bearer abcdefghijklmnopqrstuvwxyz.1234",
  ].join("\n");
  const { text, hits, total } = redactText(raw);
  assert.ok(total >= 4);
  assert.ok(!text.includes("sk-abcdefghijklmnopqrstuvwxyz123456"));
  assert.ok(!text.includes("gho_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"));
  assert.ok(!text.includes("AKIAIOSFODNN7EXAMPLE"));
  assert.ok(text.includes("[REDACTED:openai_key"));
  assert.ok(text.includes("[REDACTED:github_token"));
  assert.ok(text.includes("[REDACTED:aws_key"));
  assert.ok(hits.openai_key >= 1);
});

test("redacts assigned secrets and url credentials but keeps structure", () => {
  const { text } = redactText("password=hunter2hunter2\nhttps://user:supersecret@example.com/x");
  assert.ok(text.includes("password=[REDACTED:assigned_secret"));
  assert.ok(text.includes("https://user:[REDACTED:url_credentials"));
  assert.ok(text.includes("example.com/x"));
});

test("redacts private key blocks", () => {
  const pem = "-----BEGIN OPENSSH PRIVATE KEY-----\nAAAAbbbb\n-----END OPENSSH PRIVATE KEY-----";
  const { text } = redactText(pem);
  assert.ok(!text.includes("AAAAbbbb"));
  assert.ok(text.includes("[REDACTED:private-key"));
});

test("redaction hashes are stable and do not leak the secret", () => {
  const a = redactText("token=abcdefgh12345678").text;
  const b = redactText("token=abcdefgh12345678").text;
  assert.equal(a, b);
  assert.ok(!a.includes("abcdefgh12345678"));
});

test("plain text is untouched", () => {
  const raw = "git status\nnpm run build\nREADME.md";
  assert.equal(redactText(raw).text, raw);
  assert.equal(redactText(raw).total, 0);
});

// ---------------------------------------------------------------------- audit

test("appendRecord and readRecords round-trip JSONL", () => {
  const { dir, cleanup } = tempDir();
  try {
    const log = path.join(dir, "nested", "audit.jsonl");
    appendRecord(log, { v: 1, event: "decision", decision: "deny" });
    appendRecord(log, { v: 1, event: "tool", tool: "read" });
    writeFileSync(log, readFileSync(log, "utf8") + "not json\n", "utf8");
    const { records, invalid } = readRecords(log);
    assert.equal(records.length, 2);
    assert.equal(invalid, 1);
    assert.equal(records[0].decision, "deny");
  } finally {
    cleanup();
  }
});

test("summarize counts decisions, rules, sessions and redactions", () => {
  const { records } = readRecords(FIXTURE_AUDIT);
  const summary = summarize(records);
  assert.ok(summary.total >= 10);
  assert.equal(summary.byEvent.tool, 3);
  assert.equal(summary.byDecision.deny, 2);
  assert.equal(summary.byDecision.ask, 1);
  assert.equal(summary.byDecision.pass, 2);
  assert.equal(summary.sessions, 2);
  assert.equal(summary.redactions, 1);
  assert.ok(summary.topRules.some((item) => item.rule === "preset:secrets-read"));
  assert.equal(summary.firstAt, "2026-11-03T02:14:02.004Z");
});

test("audit writer redacts commands and hashes them", () => {
  const { dir, cleanup } = tempDir();
  try {
    const writer = createAuditWriter({ logPath: "audit.jsonl", projectDirectory: dir, redact: true, storeCommand: true });
    writer.shellBefore({ command: "curl -H 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz.1234567890' https://x.dev", cwd: dir, shell: "bash" });
    const { records } = readRecords(path.join(dir, "audit.jsonl"));
    assert.equal(records.length, 1);
    assert.ok(records[0].command.includes("[REDACTED:bearer"));
    assert.ok(!records[0].command.includes("abcdefghijklmnopqrstuvwxyz.1234567890"));
    assert.equal(records[0].commandHash.length, 64);
    assert.equal(records[0].redactions[0].kind, "bearer");
  } finally {
    cleanup();
  }
});

test("audit writer records decisions and tool durations", async () => {
  const { dir, cleanup } = tempDir();
  try {
    const writer = createAuditWriter({ logPath: "audit.jsonl", projectDirectory: dir, redact: true });
    const subject = normalizePermission({ action: "shell", resources: ["rm -rf /tmp/x"] });
    const decision = decide({ version: 1, preset: "balanced", rules: [] }, subject);
    const input = { effect: "allow" };
    const applied = applyDecision(input, decision);
    writer.decision({ sessionID: "ses_1", subject, decision, applied });

    writer.toolBefore({ id: "call_1", sessionID: "ses_1", tool: "read" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    writer.toolAfter({ id: "call_1", sessionID: "ses_1", tool: "read", status: "completed" });

    const { records } = readRecords(path.join(dir, "audit.jsonl"));
    assert.equal(records.length, 3);
    assert.equal(records[0].decision, "deny");
    assert.equal(records[0].effect, "deny");
    assert.equal(records[0].nativeEffect, "allow");
    assert.equal(records[0].rule, "preset:destructive");
    assert.equal(records[2].status, "completed");
    assert.ok(records[2].durationMs >= 0);
  } finally {
    cleanup();
  }
});

test("audit writer hash-only mode omits plaintext commands", () => {
  const { dir, cleanup } = tempDir();
  try {
    const writer = createAuditWriter({ logPath: "audit.jsonl", projectDirectory: dir, commandHash: true });
    writer.shellBefore({ command: "npm publish --access public", cwd: dir, shell: "bash" });
    const { records } = readRecords(path.join(dir, "audit.jsonl"));
    assert.equal(records[0].command, undefined);
    assert.equal(records[0].commandHash.length, 64);
  } finally {
    cleanup();
  }
});

// --------------------------------------------------------------------- report

test("renderAuditReport escapes user-controlled values", () => {
  const records = [
    {
      v: 1,
      ts: "2026-11-03T00:00:00.000Z",
      event: "decision",
      decision: "deny",
      action: "shell",
      rule: "r<script>",
      reason: "\"><img src=x onerror=alert(1)>",
      command: "echo <script>alert(1)</script>",
    },
  ];
  const html = renderAuditReport({ records, policy: { version: 1, preset: "balanced", rules: [] }, logPath: "audit.jsonl", policyPath: null });
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!/src="http/.test(html));
  assert.ok(html.includes("opencode-cordon"));
  assert.ok(html.includes("100%"));
});

test("renderAuditReport shows an empty state without decisions", () => {
  const html = renderAuditReport({ records: [], policy: { version: 1, preset: "strict", rules: [] } });
  assert.ok(html.includes("No permission decisions"));
  assert.ok(html.includes("strict"));
});

// ------------------------------------------------------------------------ cli

async function run(argv) {
  const logs = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => logs.push(args.join(" "));
  console.error = (...args) => logs.push(args.join(" "));
  try {
    const value = await main(argv);
    return { value, logs };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

test("parseArgs handles flags, values and inline values", () => {
  const args = parseArgs(["evaluate", "--action", "shell", "--command=rm -rf /", "--json", "extra"]);
  assert.deepEqual(args._, ["evaluate", "extra"]);
  assert.equal(args.action, "shell");
  assert.equal(args.command, "rm -rf /");
  assert.equal(args.json, true);
});

test("cli check validates the fixture policy", async () => {
  const { value, logs } = await run(["check", "--policy", FIXTURE_POLICY]);
  assert.equal(value, 0);
  assert.ok(logs.join("\n").includes("ok"));
  assert.ok(logs.join("\n").includes("preset   balanced"));
});

test("cli check rejects a broken policy with exit 2", async () => {
  const { dir, cleanup } = tempDir();
  try {
    const broken = path.join(dir, "broken.jsonc");
    writeFileSync(broken, '{"version": 2, "rules": "nope"}', "utf8");
    const { value } = await run(["check", "--policy", broken]);
    assert.equal(value, 2);
  } finally {
    cleanup();
  }
});

test("cli check rejects a missing policy with exit 2", async () => {
  const { value } = await run(["check", "--policy", path.join(here, "nope.jsonc")]);
  assert.equal(value, 2);
});

test("cli evaluate returns ask/deny/pass exit codes", async () => {
  assert.equal((await run(["evaluate", "--policy", FIXTURE_POLICY, "--action", "shell", "--command", "rm -rf /tmp/x"])).value, 20);
  assert.equal((await run(["evaluate", "--policy", FIXTURE_POLICY, "--action", "shell", "--command", "git push origin main"])).value, 10);
  assert.equal((await run(["evaluate", "--policy", FIXTURE_POLICY, "--action", "read", "--path", "/repo/README.md"])).value, 0);
  assert.equal((await run(["evaluate", "--policy", FIXTURE_POLICY, "--action", "read", "--path", "/repo/.env"])).value, 20);
  assert.equal((await run(["evaluate", "--policy", FIXTURE_POLICY, "--action", "read", "--path", "test/fixtures/.env"])).value, 0);
});

test("cli evaluate can emit json", async () => {
  const { value, logs } = await run(["evaluate", "--policy", FIXTURE_POLICY, "--action", "shell", "--command", "rm -rf /tmp/x", "--json"]);
  assert.equal(value, 20);
  const payload = JSON.parse(logs[0]);
  assert.equal(payload.decision, "deny");
  assert.equal(payload.rule, "deny-rm-rf");
  assert.equal(payload.effect, "deny");
});

test("cli audit summarises a log and renders html", async () => {
  const { dir, cleanup } = tempDir();
  try {
    const html = path.join(dir, "report.html");
    const { value, logs } = await run(["audit", "--log", FIXTURE_AUDIT, "--html", html, "--policy", FIXTURE_POLICY]);
    assert.equal(value, 0);
    assert.ok(existsSync(html));
    assert.ok(readFileSync(html, "utf8").includes("opencode-cordon"));
    assert.ok(logs.join("\n").includes("cordon audit"));
  } finally {
    cleanup();
  }
});

test("cli audit exits 4 for a missing log", async () => {
  const { value } = await run(["audit", "--log", path.join(here, "missing.jsonl")]);
  assert.equal(value, 4);
});

test("cli init writes a starter policy and refuses to overwrite", async () => {
  const { dir, cleanup } = tempDir();
  try {
    const out = path.join(dir, "cordon.jsonc");
    assert.equal((await run(["init", "--out", out, "--preset", "strict"])).value, 0);
    assert.ok(existsSync(out));
    const parsed = parseJsonc(readFileSync(out, "utf8"));
    assert.equal(parsed.preset, "strict");
    assert.equal(validatePolicy(parsed).ok, true);
    assert.equal((await run(["init", "--out", out])).value, 1);
    assert.equal((await run(["init", "--out", out, "--force"])).value, 0);
  } finally {
    cleanup();
  }
});

test("cli init rejects an unknown preset", async () => {
  const { dir, cleanup } = tempDir();
  try {
    assert.equal((await run(["init", "--out", path.join(dir, "x.jsonc"), "--preset", "chaos"])).value, 1);
  } finally {
    cleanup();
  }
});

test("cli help and version work", async () => {
  assert.equal((await run(["--version"])).value, 0);
  assert.equal((await run(["help"])).value, 0);
  assert.equal((await run([])).value, 0);
});

test("cli redact reads a file argument and prints the redacted text", async () => {
  const { dir, cleanup } = tempDir();
  try {
    const file = path.join(dir, "input.txt");
    writeFileSync(file, "token=abcdefghijklmnop\n", "utf8");
    const { value } = await run(["redact", file]);
    assert.equal(value, 0);
  } finally {
    cleanup();
  }
});
