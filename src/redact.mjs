// Secret redaction. Used before anything is written to the audit log or printed
// by the CLI. Patterns are intentionally conservative: false positives are cheap,
// leaked provider keys are not.

import { sha256 } from "./util.mjs";

/** @typedef {{ name: string, re: RegExp, key?: number }} Pattern */

/** @type {Pattern[]} */
export const SECRET_PATTERNS = [
  { name: "private-key", re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g },
  { name: "openai_key", re: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { name: "anthropic_key", re: /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g },
  { name: "github_token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { name: "github_pat", re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: "gitlab_token", re: /\bglpat-[A-Za-z0-9_-]{16,}\b/g },
  { name: "aws_key", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "google_key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "slack_token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: "stripe_key", re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { name: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: "bearer", re: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/gi },
  { name: "url_credentials", re: /\b([a-z][a-z0-9+.-]*:\/\/[^/\s:@]{1,64}:)([^/\s@]{1,128})(@)/gi, key: 2 },
  {
    name: "assigned_secret",
    re: /(\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|secret|password|passwd|token)\b\s*[:=]\s*["']?)([^\s"'`,;]{8,})/gi,
    key: 2,
  },
  {
    name: "env_secret",
    re: /(\b[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)\s*=\s*["']?)([^\s"']{8,})/g,
    key: 2,
  },
];

/** Options accepted by {@link redactText}. */
const DEFAULTS = { keepHash: true, placeholder: "REDACTED" };

/**
 * Redact secrets from a string.
 * @param {string} text
 * @param {{ keepHash?: boolean, placeholder?: string, patterns?: Pattern[] }} [options]
 * @returns {{ text: string, hits: Record<string, number>, total: number }}
 */
export function redactText(text, options = {}) {
  const { keepHash, placeholder, patterns } = { ...DEFAULTS, ...options };
  const list = patterns ?? SECRET_PATTERNS;
  let output = String(text ?? "");
  /** @type {Record<string, number>} */ const hits = {};

  for (const pattern of list) {
    output = output.replace(pattern.re, (...args) => {
      // `args` is [match, ...groups, offset, whole]
      const match = args[0];
      const groups = args.slice(1, 1 + countGroups(pattern.re));
      const key = pattern.key ?? 0;
      const secret = key > 0 ? groups[key - 1] : match;
      hits[pattern.name] = (hits[pattern.name] ?? 0) + 1;
      const replacement = `[${placeholder}:${pattern.name}${keepHash && secret ? ":" + sha256(secret, 8) : ""}]`;
      if (key === 0) return replacement;
      const prefix = groups.slice(0, key - 1).join("");
      const suffix = groups.slice(key).join("");
      return prefix + replacement + suffix;
    });
  }

  const total = Object.values(hits).reduce((sum, n) => sum + n, 0);
  return { text: output, hits, total };
}

/** Number of capture groups in a regexp (approximate but reliable for our patterns). */
function countGroups(re) {
  const source = re.source.replace(/\\./g, "").replace(/\[[^\]]*\]/g, "");
  return (source.match(/\((?!\?)/g) ?? []).length;
}

/** Convenience wrapper returning only the redacted string. */
export function redact(text, options) {
  return redactText(text, options).text;
}
