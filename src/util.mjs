// Small, dependency-free helpers shared by the policy engine, CLI and report.
// Everything here is pure (except readJsoncFile) so it is easy to unit test.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * Remove `//` and block comments from a JSONC document while leaving strings alone.
 * @param {string} text
 * @returns {string}
 */
export function stripJsonComments(text) {
  let out = "";
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (quote) {
      out += ch;
      if (ch === "\\") {
        if (next !== undefined) out += next;
        i++;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
      out += " ";
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Drop trailing commas before a closing brace/bracket, ignoring strings.
 * @param {string} text
 * @returns {string}
 */
export function stripTrailingCommas(text) {
  let out = "";
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      out += ch;
      if (ch === "\\") {
        if (text[i + 1] !== undefined) out += text[++i];
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === "}" || text[j] === "]") continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Parse a JSONC string (comments + trailing commas allowed).
 * @param {string} text
 * @returns {unknown}
 */
export function parseJsonc(text) {
  return JSON.parse(stripTrailingCommas(stripJsonComments(text)));
}

/** @param {string} text @param {number} [length] */
export function sha256(text, length = 64) {
  return createHash("sha256").update(String(text), "utf8").digest("hex").slice(0, length);
}

/** Read and parse a JSONC file. @param {string} file */
export function readJsoncFile(file) {
  return parseJsonc(readFileSync(file, "utf8"));
}

/** @param {string} value */
export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Normalise a path-ish string to forward slashes for matching. */
export function normalizePath(value) {
  return String(value ?? "").replace(/\\/g, "/");
}

/** Collapse runs of whitespace so `rm  -rf` still matches `rm -rf *`. */
export function normalizeCommand(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/** Heuristic: does this string look like a file path instead of a command? */
export function looksLikePath(value) {
  const s = normalizePath(value).trim();
  if (!s) return false;
  if (/^[A-Za-z]:\//.test(s)) return true;
  if (s.startsWith("/") || s.startsWith("./") || s.startsWith("../") || s.startsWith("~/")) return true;
  if (s.includes("/") || s.includes("\\")) return true;
  // A bare filename such as `package.json` or `.env` is still a path.
  return /^[\w.@-]+\.[A-Za-z0-9]{1,12}$/.test(s) || s.startsWith(".");
}

/**
 * Translate a glob into an anchored RegExp.
 *
 * Path mode: `*` never crosses a separator, `**` does, `**\/` may match zero directories.
 * Command mode: `*` matches anything, including spaces.
 * Matching is case-insensitive on every platform so Windows authors are not surprised.
 *
 * @param {string} pattern
 * @param {{ pathMode?: boolean }} [options]
 */
export function globToRegExp(pattern, options = {}) {
  const pathMode = options.pathMode !== false;
  const source = String(pattern);
  let re = "";

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "*") {
      if (source[i + 1] === "*") {
        i++;
        if (pathMode && source[i + 1] === "/") {
          i++;
          re += "(?:.*/)?";
        } else {
          re += ".*";
        }
      } else {
        re += pathMode ? "[^/]*" : ".*";
      }
      continue;
    }
    if (ch === "?") {
      re += pathMode ? "[^/]" : ".";
      continue;
    }
    if (ch === "{" && source.includes("}", i)) {
      const close = source.indexOf("}", i);
      const body = source.slice(i + 1, close);
      if (body && !body.includes("{") && !body.includes("/") ) {
        re += "(?:" + body.split(",").map((part) => globToRegExp(part, options).source.slice(1, -1)).join("|") + ")";
        i = close;
        continue;
      }
    }
    re += escapeRegExp(ch);
  }

  return new RegExp("^" + re + "$", "i");
}

const GLOB_CACHE_LIMIT = 256;
const globCache = new Map();

function compiledGlob(pattern, pathMode) {
  const key = (pathMode ? "p:" : "c:") + pattern;
  let re = globCache.get(key);
  if (!re) {
    re = globToRegExp(pattern, { pathMode });
    if (globCache.size >= GLOB_CACHE_LIMIT) globCache.clear();
    globCache.set(key, re);
  }
  re.lastIndex = 0;
  return re;
}

/**
 * Match one value against one glob.
 * @param {string} value
 * @param {string} pattern
 * @param {{ pathMode?: boolean }} [options]
 */
export function matchGlob(value, pattern, options = {}) {
  const pathMode = options.pathMode !== false;
  const text = pathMode ? normalizePath(value) : normalizeCommand(value);
  const source = pathMode ? normalizePath(pattern) : normalizeCommand(pattern);
  if (!source) return false;
  return compiledGlob(source, pathMode).test(text);
}

/**
 * Match a value against `a|b|c` alternatives (each being a glob).
 * @param {string | undefined} value
 * @param {string | undefined} alternatives
 * @param {{ pathMode?: boolean }} [options]
 */
export function matchAlternatives(value, alternatives, options = {}) {
  if (!alternatives) return false;
  if (value === undefined || value === null) return false;
  return String(alternatives)
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => matchGlob(value, part, options));
}

/** Clamp a string for display / logs. */
export function clip(value, max = 160) {
  const text = String(value ?? "");
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}
