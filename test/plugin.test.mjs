// Integration test for the OpenCode 2 plugin adapter, without a running server.
// A fake plugin context records the hooks the adapter registers, then we drive those
// hooks exactly like OpenCode does and assert on the mutation + audit log.

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import plugin from "../src/plugin.mjs";
import { readRecords } from "../src/audit.mjs";

function makeProject(policyText) {
  const dir = mkdtempSync(path.join(tmpdir(), "cordon-plugin-"));
  mkdirSync(path.join(dir, ".opencode"), { recursive: true });
  writeFileSync(path.join(dir, ".opencode", "cordon.jsonc"), policyText, "utf8");
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function fakeContext(directory, options = {}) {
  /** @type {Record<string, Function>} */ const hooks = {};
  /** @type {string[]} */ const disposed = [];
  const ctx = {
    location: { directory },
    options,
    permission: {
      hook: async (name, callback) => {
        hooks[`permission.${name}`] = callback;
        return { dispose: async () => disposed.push(`permission.${name}`) };
      },
    },
    tool: {
      hook: async (name, callback) => {
        hooks[`tool.${name}`] = callback;
        return { dispose: async () => disposed.push(`tool.${name}`) };
      },
    },
    shell: {
      hook: async (name, callback) => {
        hooks[`shell.${name}`] = callback;
        return { dispose: async () => disposed.push(`shell.${name}`) };
      },
    },
  };
  return { ctx, hooks, disposed };
}

const POLICY = `{
  "version": 1,
  "preset": "balanced",
  "audit": { "enabled": true, "path": ".opencode/cordon/audit.jsonl", "redact": true },
  "rules": [
    { "id": "deny-env-read", "effect": "deny", "match": { "action": "read", "path": "**/.env" }, "reason": "env is off limits" },
    { "id": "deny-rm", "effect": "deny", "match": { "action": "shell", "command": "rm -rf *" }, "reason": "no destructive rm" }
  ]
}`;

test("plugin setup registers all four hooks and cleans them up", async () => {
  const project = makeProject(POLICY);
  try {
    const { ctx, hooks, disposed } = fakeContext(project.dir);
    const cleanup = await plugin.setup(ctx);
    assert.deepEqual(Object.keys(hooks).sort(), [
      "permission.evaluate",
      "shell.create.before",
      "tool.execute.after",
      "tool.execute.before",
    ]);
    await cleanup();
    assert.equal(disposed.length, 4);
  } finally {
    project.cleanup();
  }
});

test("evaluate hook tightens read of .env to deny", async () => {
  const project = makeProject(POLICY);
  try {
    const { ctx, hooks } = fakeContext(project.dir);
    await plugin.setup(ctx);

    const input = { sessionID: "ses_1", agent: "build", action: "read", resources: [path.join(project.dir, ".env")], effect: "allow" };
    await hooks["permission.evaluate"](input);
    assert.equal(input.effect, "deny");
    assert.equal(input.message, "env is off limits");

    const records = readRecords(path.join(project.dir, ".opencode", "cordon", "audit.jsonl")).records;
    assert.equal(records.length, 1);
    assert.equal(records[0].event, "decision");
    assert.equal(records[0].decision, "deny");
    assert.equal(records[0].rule, "deny-env-read");
    assert.equal(records[0].nativeEffect, "allow");
    assert.equal(records[0].effect, "deny");
  } finally {
    project.cleanup();
  }
});

test("evaluate hook blocks the rm -rf command and leaves harmless commands alone", async () => {
  const project = makeProject(POLICY);
  try {
    const { ctx, hooks } = fakeContext(project.dir);
    await plugin.setup(ctx);

    const rm = { sessionID: "ses_1", agent: "build", action: "shell", resources: ["rm -rf ./scratch"], effect: "allow" };
    await hooks["permission.evaluate"](rm);
    assert.equal(rm.effect, "deny");

    const status = { sessionID: "ses_1", agent: "build", action: "shell", resources: ["git status"], effect: "allow" };
    await hooks["permission.evaluate"](status);
    assert.equal(status.effect, "allow");
    assert.equal(status.message, undefined);
  } finally {
    project.cleanup();
  }
});

test("evaluate hook never weakens an existing deny or ask", async () => {
  const project = makeProject(POLICY);
  try {
    const { ctx, hooks } = fakeContext(project.dir);
    await plugin.setup(ctx);

    const denied = { action: "shell", resources: ["git push origin main"], effect: "deny" };
    await hooks["permission.evaluate"](denied);
    assert.equal(denied.effect, "deny");

    const asked = { action: "read", resources: [path.join(project.dir, "README.md")], effect: "ask" };
    await hooks["permission.evaluate"](asked);
    assert.equal(asked.effect, "ask");
  } finally {
    project.cleanup();
  }
});

test("tool and shell hooks write audit records", async () => {
  const project = makeProject(POLICY);
  try {
    const { ctx, hooks } = fakeContext(project.dir);
    await plugin.setup(ctx);

    await hooks["tool.execute.before"]({ id: "call_1", sessionID: "ses_1", agent: "build", tool: "read" });
    await hooks["tool.execute.after"]({ id: "call_1", sessionID: "ses_1", agent: "build", tool: "read", status: "completed" });
    await hooks["shell.create.before"]({ command: "npm test", cwd: project.dir, shell: "bash" });

    const { records } = readRecords(path.join(project.dir, ".opencode", "cordon", "audit.jsonl"));
    assert.equal(records.length, 3);
    assert.equal(records[0].event, "tool");
    assert.equal(records[0].phase, "before");
    assert.equal(records[2].event, "shell");
    assert.equal(records[2].command, "npm test");
  } finally {
    project.cleanup();
  }
});

test("plugin stays idle when the project has no policy", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "cordon-nopolicy-"));
  try {
    const { ctx, hooks } = fakeContext(dir);
    const cleanup = await plugin.setup(ctx);
    assert.deepEqual(Object.keys(hooks), []);
    assert.equal(cleanup, undefined);
    assert.equal(existsSync(path.join(dir, ".opencode", "cordon", "audit.jsonl")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("plugin honours the options.policy override", async () => {
  const project = makeProject(POLICY);
  const outside = mkdtempSync(path.join(tmpdir(), "cordon-policy-"));
  try {
    const override = path.join(outside, "other.jsonc");
    writeFileSync(
      override,
      JSON.stringify({ version: 1, preset: "relaxed", rules: [{ id: "no-read-at-all", effect: "deny", match: { action: "read" }, reason: "locked down" }] }),
      "utf8",
    );
    const { ctx, hooks } = fakeContext(project.dir, { policy: override });
    await plugin.setup(ctx);
    const input = { action: "read", resources: [path.join(project.dir, "README.md")], effect: "allow" };
    await hooks["permission.evaluate"](input);
    assert.equal(input.effect, "deny");
    assert.equal(input.message, "locked down");
  } finally {
    project.cleanup();
    rmSync(outside, { recursive: true, force: true });
  }
});
