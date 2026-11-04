// Append-only JSONL audit log.
//
// One line per event, UTF-8, no external storage. New logs link each record to
// the previous hash so an edited, deleted or reordered line is detectable.
// A local rewrite can recompute the chain; this is not a tamper-proof log.
// Every command is also hashed so records can be correlated without the plaintext.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { redactText } from "./redact.mjs";
import { clip, sha256 } from "./util.mjs";
import { describeSubject } from "./decision.mjs";

export const AUDIT_VERSION = 1;

/** SHA-256 of the empty string. The first record in a new log uses this as `prev`. */
export const GENESIS = sha256("");

/**
 * Stable JSON for hashing. Keys are sorted and `undefined` values are omitted,
 * so a parse/stringify that reorders keys does not break the chain.
 * @param {unknown} value
 * @returns {string | undefined}
 */
export function canonicalJson(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map((item) => (item === undefined ? "null" : canonicalJson(item))).join(",") + "]";
  }
  const keys = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort();
  return "{" + keys.map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}";
}

/**
 * Attach `prev` and `hash` without mutating the input.
 * `hash` is sha256(canonicalJson(record without hash)).
 * @param {Record<string, unknown>} record
 * @param {string} prev
 */
export function sealRecord(record, prev) {
  const body = { ...record, prev };
  delete body.hash;
  return { ...body, hash: sha256(canonicalJson(body)) };
}

/**
 * Check a hash chain.
 * Empty → intact. No `hash` fields at all → legacy (intact). Any mix of hashed
 * and unhashed lines, a bad `prev`, or a recomputed hash that differs → broken.
 * @param {any[]} records
 * @returns {{ status: "empty" | "legacy" | "ok" | "broken", intact: boolean, brokenAt?: number, reason?: "missing" | "prev" | "hash" }}
 */
export function verifyChain(records) {
  if (!records.length) return { status: "empty", intact: true };
  const anyHash = records.some((record) => typeof record?.hash === "string" && record.hash);
  if (!anyHash) return { status: "legacy", intact: true };

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (typeof record?.hash !== "string" || !record.hash || typeof record.prev !== "string" || !record.prev) {
      return { status: "broken", intact: false, brokenAt: i, reason: "missing" };
    }
    const expectedPrev = i === 0 ? GENESIS : records[i - 1].hash;
    if (record.prev !== expectedPrev) return { status: "broken", intact: false, brokenAt: i, reason: "prev" };
    const body = { ...record };
    delete body.hash;
    if (sha256(canonicalJson(body)) !== record.hash) return { status: "broken", intact: false, brokenAt: i, reason: "hash" };
  }
  return { status: "ok", intact: true };
}

/**
 * A new or already-chained log keeps the chain. A log whose last line has no
 * hash stays legacy, so upgrading cordon does not mark old files as broken.
 * @param {string} logPath
 */
function loadChainState(logPath) {
  if (!existsSync(logPath)) return { mode: "chain", prev: GENESIS };
  const { records } = readRecords(logPath);
  if (records.length === 0) return { mode: "chain", prev: GENESIS };
  const last = records[records.length - 1];
  if (typeof last?.hash === "string" && last.hash) return { mode: "chain", prev: last.hash };
  return { mode: "legacy", prev: "" };
}

/**
 * Append one record to a JSONL file, creating parent directories as needed.
 * @param {string} logPath
 * @param {Record<string, unknown>} record
 */
export function appendRecord(logPath, record) {
  mkdirSync(path.dirname(logPath), { recursive: true });
  appendFileSync(logPath, JSON.stringify(record) + "\n", "utf8");
}

/**
 * Read a JSONL audit log, skipping lines that cannot be parsed.
 * @param {string} file
 * @returns {{ records: any[], invalid: number }}
 */
export function readRecords(file) {
  if (!existsSync(file)) return { records: [], invalid: 0 };
  const text = readFileSync(file, "utf8");
  /** @type {any[]} */ const records = [];
  let invalid = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object") records.push(parsed);
      else invalid++;
    } catch {
      invalid++;
    }
  }
  return { records, invalid };
}

/**
 * Aggregate records for the CLI summary and the HTML report.
 * @param {any[]} records
 */
export function summarize(records) {
  const byEvent = { decision: 0, tool: 0, shell: 0, other: 0 };
  const byDecision = { deny: 0, ask: 0, allow: 0, pass: 0 };
  const byAction = {};
  const byRule = {};
  const sessions = new Set();
  /** @type {any[]} */ const denied = [];
  /** @type {any[]} */ const asked = [];
  let redactions = 0;
  let firstAt = null;
  let lastAt = null;

  for (const record of records) {
    const event = typeof record.event === "string" ? record.event : "other";
    if (event in byEvent) byEvent[event]++;
    else byEvent.other++;

    if (record.sessionID) sessions.add(String(record.sessionID));
    if (typeof record.ts === "string") {
      if (!firstAt || record.ts < firstAt) firstAt = record.ts;
      if (!lastAt || record.ts > lastAt) lastAt = record.ts;
    }
    if (Array.isArray(record.redactions)) redactions += record.redactions.length;

    if (event === "decision") {
      const decision = ["deny", "ask", "allow", "pass"].includes(record.decision) ? record.decision : "pass";
      byDecision[decision]++;
      const action = String(record.action ?? record.tool ?? "unknown");
      byAction[action] = (byAction[action] ?? 0) + 1;
      if (record.rule) byRule[record.rule] = (byRule[record.rule] ?? 0) + 1;
      if (decision === "deny") denied.push(record);
      if (decision === "ask") asked.push(record);
    }
  }

  const topRules = Object.entries(byRule)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([rule, count]) => ({ rule, count }));

  return {
    total: records.length,
    byEvent,
    byDecision,
    byAction,
    topRules,
    sessions: sessions.size,
    denied: denied.slice(-20),
    asked: asked.slice(-20),
    redactions,
    firstAt,
    lastAt,
  };
}

/**
 * Create a writer bound to one log file. The plugin wires its hooks into this.
 * @param {{ logPath: string, projectDirectory?: string, redact?: boolean, storeCommand?: boolean, commandHash?: boolean }} options
 */
export function createAuditWriter(options) {
  const logPath = path.isAbsolute(options.logPath) ? options.logPath : path.resolve(options.projectDirectory ?? process.cwd(), options.logPath);
  const redactEnabled = options.redact !== false;
  const storeCommand = options.storeCommand !== false;
  const hashCommands = options.commandHash === true;
  const state = loadChainState(logPath);
  /** @type {Map<string, number>} */ const pending = new Map();

  function sanitize(value) {
    if (!redactEnabled) return { text: clip(value, 400), redactions: [] };
    const result = redactText(clip(value, 400));
    const redactions = Object.entries(result.hits).map(([kind, count]) => ({ kind, count }));
    return { text: result.text, redactions };
  }

  function write(record) {
    try {
      const stamped = { v: AUDIT_VERSION, ts: new Date().toISOString(), ...record };
      const line = state.mode === "chain" ? sealRecord(stamped, state.prev) : stamped;
      appendRecord(logPath, line);
      if (state.mode === "chain") state.prev = line.hash;
    } catch (error) {
      // Never let the audit log break a session.
      console.error(`[cordon] audit write failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    logPath,

    /**
     * @param {{ sessionID?: string, agent?: string, subject: import("./decision.mjs").Subject, decision: import("./decision.mjs").Decision, applied: { before: string, after: string, changed: boolean } }} event
     */
    decision({ sessionID, agent, subject, decision, applied }) {
      const summary = describeSubject(subject);
      const sanitized = sanitize(summary);
      /** @type {Record<string, unknown>} */
      const record = {
        event: "decision",
        sessionID,
        agent: agent ?? subject.agent ?? undefined,
        action: subject.action ?? subject.tool ?? undefined,
        tool: subject.tool || undefined,
        decision: decision.decision ?? "pass",
        nativeEffect: applied.before,
        effect: applied.after,
        rule: decision.rule?.id,
        reason: decision.reason || undefined,
        paths: subject.paths.length ? subject.paths.map((p) => sanitize(p).text) : undefined,
        commandHash: subject.commands.length ? sha256(subject.commands.join(" ; ")) : undefined,
        redactions: sanitized.redactions.length ? sanitized.redactions : undefined,
      };
      if (storeCommand && subject.commands.length && !hashCommands) record.command = sanitized.text;
      write(record);
    },

    /** @param {any} input `tool.execute.before` payload */
    toolBefore(input) {
      if (input?.id) pending.set(String(input.id), Date.now());
      write({
        event: "tool",
        phase: "before",
        sessionID: input?.sessionID,
        agent: input?.agent,
        tool: input?.tool,
        callID: input?.id,
        messageID: input?.messageID,
      });
    },

    /** @param {any} input `tool.execute.after` payload */
    toolAfter(input) {
      const key = input?.id ? String(input.id) : "";
      const started = key ? pending.get(key) : undefined;
      if (key) pending.delete(key);
      write({
        event: "tool",
        phase: "after",
        sessionID: input?.sessionID,
        agent: input?.agent,
        tool: input?.tool,
        callID: key || undefined,
        status: input?.status,
        durationMs: started ? Date.now() - started : undefined,
        error: input?.status === "error" && input?.error?.message ? sanitize(String(input.error.message)).text : undefined,
      });
    },

    /** @param {{ command: string, cwd: string, shell: string }} input `shell.create.before` payload */
    shellBefore(input) {
      const sanitized = sanitize(String(input?.command ?? ""));
      write({
        event: "shell",
        command: storeCommand && !hashCommands ? sanitized.text : undefined,
        commandHash: input?.command ? sha256(String(input.command)) : undefined,
        cwd: input?.cwd,
        shell: input?.shell,
        redactions: sanitized.redactions.length ? sanitized.redactions : undefined,
      });
    },
  };
}
