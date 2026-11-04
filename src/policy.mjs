// Policy presets, parsing, validation and rule resolution.
// The policy file is JSONC so it can be commented; there is no YAML dependency.

import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseJsonc } from "./util.mjs";

export const PRESETS = ["relaxed", "balanced", "strict"];

const SECRET_PATHS = [
  "**/.env*",
  "**/*.pem",
  "**/*.key",
  "**/*.p12",
  "**/*.pfx",
  "**/id_rsa*",
  "**/id_ed25519*",
  "**/.ssh/**",
  "**/.aws/credentials",
  "**/.npmrc",
  "**/.netrc",
  "**/credentials.json",
  "**/.config/gh/hosts.yml",
];

const DESTRUCTIVE_SHELL = [
  "rm -rf /",
  "rm -rf /*",
  "rm -rf ~*",
  "rm -rf *",
  "rm -fr *",
  "*/rm -rf *",
  "*/rm -fr *",
  "rm -r -f *",
  "rm -f -r *",
  "rm --recursive --force *",
  "rm --force --recursive *",
  "Remove-Item -Recurse*",
  "Remove-Item * -Recurse*",
  "rmdir /s*",
  "git push * --force*",
  "git push * -f",
  "git push * -f *",
  "sudo *",
  "mkfs*",
  "fdisk*",
  "parted*",
  "dd if=*of=/dev/*",
  "shutdown*",
  "reboot*",
  "halt*",
  "format *",
  "del /f /s /q *",
  "rd /s /q *",
  "git push --force*",
  "git push -f*",
  "curl * | *sh*",
  "wget * | *sh*",
];

const NETWORK_SHELL = ["ssh *", "scp *", "nc *", "ncat *", "telnet *"];

/** Rules contributed by the built-in preset. User rules always win over these. */
export const PRESET_RULES = {
  relaxed: [
    rule("preset:secrets-read", "deny", { action: "read", path: SECRET_PATHS }, "secrets stay out of the context window"),
    rule("preset:secrets-write", "deny", { action: "edit|write|patch", path: SECRET_PATHS }, "secrets are not edited by the agent"),
    rule("preset:destructive", "deny", { action: "shell", command: DESTRUCTIVE_SHELL }, "irreversible shell command"),
    rule("preset:network", "ask", { action: "shell", command: NETWORK_SHELL }, "outbound network command"),
  ],
  balanced: [
    rule("preset:secrets-read", "deny", { action: "read", path: SECRET_PATHS }, "secrets stay out of the context window"),
    rule("preset:secrets-write", "deny", { action: "edit|write|patch", path: SECRET_PATHS }, "secrets are not edited by the agent"),
    rule("preset:destructive", "deny", { action: "shell", command: DESTRUCTIVE_SHELL }, "irreversible shell command"),
    rule("preset:network", "ask", { action: "shell", command: NETWORK_SHELL }, "outbound network command"),
    rule("preset:push", "ask", { action: "shell", command: ["git push*", "gh release *", "npm publish*", "pnpm publish*"] }, "publishing or pushing needs a human"),
    rule("preset:webfetch", "ask", { action: "webfetch|fetch|websearch" }, "outbound web access needs a human"),
  ],
  strict: [
    rule("preset:secrets-read", "deny", { action: "read", path: SECRET_PATHS }, "secrets stay out of the context window"),
    rule("preset:secrets-write", "deny", { action: "edit|write|patch", path: SECRET_PATHS }, "secrets are not edited by the agent"),
    rule("preset:destructive", "deny", { action: "shell", command: DESTRUCTIVE_SHELL }, "irreversible shell command"),
    rule("preset:network", "deny", { action: "shell", command: NETWORK_SHELL }, "outbound network command"),
    rule("preset:push", "ask", { action: "shell", command: ["git push*", "gh release *", "npm publish*", "pnpm publish*"] }, "publishing or pushing needs a human"),
    rule("preset:webfetch", "ask", { action: "webfetch|fetch|websearch" }, "outbound web access needs a human"),
    rule("preset:all-shell", "ask", { action: "shell" }, "strict mode asks before every shell command"),
    rule("preset:all-write", "ask", { action: "edit|write|patch|apply_patch" }, "strict mode asks before every edit"),
  ],
};

function rule(id, effect, match, reason) {
  return { id, effect, match, reason };
}

/** The policy written by `opencode-cordon init`. */
export function starterPolicy(preset = "balanced") {
  return {
    $schema: "https://raw.githubusercontent.com/wangyuchen5110/opencode-cordon/main/schema/cordon.schema.json",
    version: 1,
    preset: PRESETS.includes(preset) ? preset : "balanced",
    audit: {
      enabled: true,
      path: ".opencode/cordon/audit.jsonl",
      redact: true,
      storeCommand: true,
      commandHash: false,
    },
    rules: [
      {
        id: "example-deny-curl-pipe",
        effect: "deny",
        match: { action: "shell", command: "curl * | sh*" },
        reason: "never pipe the internet into a shell",
      },
      {
        id: "example-ask-deploy",
        effect: "ask",
        match: { action: "shell", command: "*.deploy*" },
        reason: "deploys are a human decision",
      },
    ],
  };
}

/**
 * @typedef {object} Rule
 * @property {string} id
 * @property {"allow"|"deny"|"ask"} effect
 * @property {Record<string, string|string[]>} match
 * @property {string} [reason]
 * @property {"user"|"preset"} [origin]
 */

/**
 * Validate a parsed policy object. Returns errors and warnings instead of throwing,
 * so the CLI can print every problem at once.
 * @param {any} policy
 */
export function validatePolicy(policy) {
  /** @type {string[]} */ const errors = [];
  /** @type {string[]} */ const warnings = [];

  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    return { ok: false, errors: ["policy must be a JSON object"], warnings };
  }
  if (policy.version !== 1) errors.push("version must be 1");
  if (policy.preset !== undefined && !PRESETS.includes(policy.preset)) {
    errors.push(`preset must be one of ${PRESETS.join(", ")}`);
  }
  if (policy.audit !== undefined) {
    if (typeof policy.audit !== "object" || policy.audit === null) {
      errors.push("audit must be an object");
    } else {
      if (policy.audit.path !== undefined && typeof policy.audit.path !== "string") errors.push("audit.path must be a string");
      if (policy.audit.enabled !== undefined && typeof policy.audit.enabled !== "boolean") errors.push("audit.enabled must be a boolean");
      if (policy.audit.redact !== undefined && typeof policy.audit.redact !== "boolean") errors.push("audit.redact must be a boolean");
    }
  }
  if (!Array.isArray(policy.rules)) {
    errors.push("rules must be an array");
  } else {
    const seen = new Set();
    policy.rules.forEach((r, index) => {
      const where = `rules[${index}]`;
      if (!r || typeof r !== "object" || Array.isArray(r)) {
        errors.push(`${where} must be an object`);
        return;
      }
      if (typeof r.id !== "string" || r.id.trim() === "") errors.push(`${where}.id must be a non-empty string`);
      else if (seen.has(r.id)) errors.push(`${where}.id "${r.id}" is duplicated`);
      else seen.add(r.id);
      if (!["allow", "deny", "ask"].includes(r.effect)) errors.push(`${where}.effect must be allow, deny or ask`);
      if (!r.match || typeof r.match !== "object" || Array.isArray(r.match) || Object.keys(r.match).length === 0) {
        errors.push(`${where}.match must be a non-empty object`);
      } else {
        for (const key of Object.keys(r.match)) {
          if (!["action", "tool", "command", "path", "agent"].includes(key)) warnings.push(`${where}.match.${key} is not a known field`);
          const value = r.match[key];
          if (typeof value !== "string" && !(Array.isArray(value) && value.every((v) => typeof v === "string"))) {
            errors.push(`${where}.match.${key} must be a string or an array of strings`);
          }
        }
      }
      if (r.reason !== undefined && typeof r.reason !== "string") errors.push(`${where}.reason must be a string`);
      if (r.effect === "allow" && r.id && !String(r.id).startsWith("preset:")) {
        warnings.push(`${where} ("${r.id}") is an allow rule: it exempts matching calls from later cordon rules, but never loosens the native decision`);
      }
    });
    if (policy.rules.length === 0 && policy.preset === undefined) warnings.push("no rules and no preset: the cordon will never intervene");
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Flatten user rules + the preset's rules into evaluation order.
 * User rules come first (first match wins), preset rules afterwards.
 * @param {any} policy
 * @returns {Rule[]}
 */
export function resolveRules(policy) {
  const user = Array.isArray(policy?.rules) ? policy.rules : [];
  const preset = PRESET_RULES[policy?.preset] ?? PRESET_RULES.balanced;
  return [
    ...user.map((r) => ({ ...r, origin: "user" })),
    ...preset.map((r) => ({ ...r, origin: "preset" })),
  ];
}

/** Normalised audit settings for a policy. */
export function auditSettings(policy) {
  const audit = policy?.audit ?? {};
  return {
    enabled: audit.enabled !== false,
    path: typeof audit.path === "string" && audit.path.trim() ? audit.path : ".opencode/cordon/audit.jsonl",
    redact: audit.redact !== false,
    storeCommand: audit.storeCommand !== false,
    commandHash: audit.commandHash === true,
  };
}

/**
 * Parse policy text into the canonical object.
 * @param {string} text
 * @returns {{ policy: any, errors: string[], warnings: string[] }}
 */
export function parsePolicyText(text) {
  let policy;
  try {
    policy = parseJsonc(text);
  } catch (error) {
    return { policy: null, errors: [`invalid JSONC: ${error instanceof Error ? error.message : String(error)}`], warnings: [] };
  }
  const { errors, warnings } = validatePolicy(policy);
  return { policy, errors, warnings };
}

/** Candidates, highest priority first. */
export function policyCandidates(directory) {
  const project = directory || process.cwd();
  return [
    path.join(project, ".opencode", "cordon.jsonc"),
    path.join(project, "cordon.jsonc"),
    path.join(os.homedir(), ".config", "opencode", "cordon.jsonc"),
  ];
}

/**
 * Load the first policy file that exists. Returns null when the user has not opted in.
 * @param {{ directory?: string, policyPath?: string }} [options]
 */
export function loadPolicy(options = {}) {
  const files = options.policyPath ? [options.policyPath] : policyCandidates(options.directory);
  for (const file of files) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    const { policy, errors, warnings } = parsePolicyText(text);
    if (!policy) return { file, policy: null, errors, warnings };
    return { file, policy, errors, warnings };
  }
  return { file: null, policy: null, errors: [], warnings: [] };
}
