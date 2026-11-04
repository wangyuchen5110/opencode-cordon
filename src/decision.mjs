// Turn a native permission request into a normalised "subject", evaluate the cordon
// policy against it, and apply the decision. Only ever tightens a decision.

import { commandCandidates, matchAlternatives, matchGlob, looksLikePath } from "./util.mjs";
import { resolveRules } from "./policy.mjs";

const EFFECT_RANK = { allow: 0, ask: 1, deny: 2 };

/**
 * @typedef {object} Subject
 * @property {string} action
 * @property {string} tool
 * @property {string} agent
 * @property {string[]} paths
 * @property {string[]} commands
 * @property {string} [cwd]
 */

/** True for actions that carry a shell command instead of file paths. */
export function isShellAction(action, tool = "") {
  return /shell|bash|exec|command|terminal|spawn/i.test(action) || /^(shell|bash|exec|terminal)$/i.test(tool);
}

/**
 * Normalise a `permission.evaluate` input into a subject the policy can match.
 * @param {any} input
 * @returns {Subject}
 */
export function normalizePermission(input = {}) {
  const action = String(input.action ?? "");
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  const tool = typeof metadata.tool === "string" ? metadata.tool : typeof metadata.toolName === "string" ? metadata.toolName : "";
  const agent = input.agent ? String(input.agent) : "";
  const resources = Array.isArray(input.resources) ? input.resources.map((r) => String(r)) : [];
  const cwd = typeof metadata.cwd === "string" ? metadata.cwd : typeof metadata.directory === "string" ? metadata.directory : undefined;

  /** @type {string[]} */ const paths = [];
  /** @type {string[]} */ const commands = [];

  const shellLike = isShellAction(action, tool);
  for (const resource of resources) {
    if (shellLike) commands.push(resource);
    else if (looksLikePath(resource)) paths.push(resource);
    else commands.push(resource);
  }
  for (const key of ["command", "cmd"]) {
    if (typeof metadata[key] === "string" && !commands.includes(metadata[key])) commands.push(metadata[key]);
  }
  for (const key of ["path", "file", "target"]) {
    if (typeof metadata[key] === "string" && !paths.includes(metadata[key])) paths.push(metadata[key]);
  }

  return { action, tool, agent, paths, commands, cwd };
}

/**
 * Normalise a `tool.execute.before` hook input into a subject.
 * @param {any} input
 */
export function normalizeToolCall(input = {}) {
  const tool = String(input.tool ?? "");
  const payload = input.input && typeof input.input === "object" ? input.input : {};
  const command = typeof payload.command === "string" ? payload.command : typeof payload.cmd === "string" ? payload.cmd : "";
  /** @type {string[]} */ const paths = [];
  for (const key of ["path", "filePath", "file_path", "file", "target"]) {
    if (typeof payload[key] === "string") paths.push(payload[key]);
  }
  return {
    action: tool,
    tool,
    agent: input.agent ? String(input.agent) : "",
    paths,
    commands: command ? [command] : [],
    cwd: typeof payload.cwd === "string" ? payload.cwd : undefined,
  };
}

/**
 * Does one rule match the subject? Every field present on the rule must match (AND);
 * an array value is an OR between its entries.
 * @param {import("./policy.mjs").Rule} rule
 * @param {Subject} subject
 */
export function ruleMatches(rule, subject) {
  const match = rule.match ?? {};
  const fields = Object.keys(match);
  if (fields.length === 0) return false;

  for (const field of fields) {
    const spec = match[field];
    const alternatives = Array.isArray(spec) ? spec : [spec];
    let hit = false;
    switch (field) {
      case "action":
        hit = alternatives.some((alt) => matchAlternatives(subject.action, alt, { pathMode: false }));
        break;
      case "tool":
        hit = alternatives.some((alt) => matchAlternatives(subject.tool || subject.action, alt, { pathMode: false }));
        break;
      case "command":
        hit = alternatives.some((alt) =>
          subject.commands.some((command) => commandCandidates(command).some((candidate) => matchGlob(candidate, alt, { pathMode: false }))),
        );
        break;
      case "path":
        hit = alternatives.some((alt) => subject.paths.some((p) => matchGlob(p, alt, { pathMode: true })));
        break;
      case "agent":
        hit = alternatives.some((alt) => matchAlternatives(subject.agent, alt, { pathMode: false }));
        break;
      default:
        hit = false;
    }
    if (!hit) return false;
  }
  return true;
}

/**
 * @typedef {object} Decision
 * @property {"allow"|"deny"|"ask"|null} decision
 * @property {import("./policy.mjs").Rule | null} rule
 * @property {string} reason
 */

/**
 * Evaluate a policy against a subject. First matching rule wins; no match means
 * "leave the native decision alone".
 * @param {any} policy
 * @param {Subject} subject
 * @returns {Decision}
 */
export function decide(policy, subject) {
  for (const rule of resolveRules(policy)) {
    if (ruleMatches(rule, subject)) {
      return { decision: rule.effect, rule, reason: rule.reason ?? "" };
    }
  }
  return { decision: null, rule: null, reason: "" };
}

/**
 * Apply a decision to a mutable permission input.
 * - deny always wins,
 * - ask only upgrades an allow,
 * - allow / no match never touches the native decision.
 *
 * @param {{ effect?: string, message?: string }} input mutable permission input
 * @param {Decision} result
 */
export function applyDecision(input, result) {
  const before = typeof input.effect === "string" ? input.effect : "allow";
  const target = result?.decision;
  const beforeRank = EFFECT_RANK[before] ?? 0;
  const targetRank = target ? EFFECT_RANK[target] ?? 0 : 0;

  if (!target || targetRank <= beforeRank) {
    return { changed: false, before, after: before, tightened: false, target: target ?? null };
  }

  input.effect = target;
  if (result?.reason) input.message = result.reason;
  return { changed: true, before, after: target, tightened: true, target };
}

/** Human-readable one-liner for logs and reports. */
export function describeSubject(subject) {
  if (subject.commands.length) return subject.commands.join(" ; ");
  if (subject.paths.length) return subject.paths.join(" , ");
  return subject.action || subject.tool || "(unknown)";
}
