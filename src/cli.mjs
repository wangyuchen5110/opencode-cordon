// Command line interface. Keep it dependency-free so `npx opencode-cordon`
// stays fast and works on any Node >= 20.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { auditSettings, loadPolicy, PRESETS, resolveRules, starterPolicy } from "./policy.mjs";
import { decide } from "./decision.mjs";
import { readRecords, summarize } from "./audit.mjs";
import { renderAuditReport } from "./report.mjs";
import { redactText } from "./redact.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const VERSION = pkg.version;

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code) => (text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : String(text));
const bold = paint("1");
const dim = paint("2");
const red = paint("31");
const green = paint("32");
const yellow = paint("33");
const cyan = paint("36");

const EXIT = { ok: 0, usage: 1, invalidPolicy: 2, missingLog: 4, deny: 20, ask: 10 };

/** Tiny `--key value` / `--flag` parser. */
export function parseArgs(argv) {
  const booleanFlags = new Set(["json", "open", "force", "help", "version"]);
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      if (eq !== -1) {
        args[token.slice(2, eq)] = token.slice(eq + 1);
        continue;
      }
      const key = token.slice(2);
      if (booleanFlags.has(key)) {
        args[key] = true;
        continue;
      }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
      continue;
    }
    if (token === "-h") args.help = true;
    else if (token === "-v") args.version = true;
    else args._.push(token);
  }
  return args;
}

function fail(message) {
  console.error(`${red("cordon:")} ${message}`);
}

function usage() {
  return `${bold("opencode-cordon")} v${VERSION} — a declarative permission cordon with an audit trail for OpenCode 2.

${bold("USAGE")}
  opencode-cordon <command> [options]

${bold("COMMANDS")}
  check                       Validate the policy file and print the effective rules
  evaluate --action <a>       Decide how a single call would be treated
      [--command <c>] [--path <p>] [--tool <t>] [--agent <id>]
  audit --log <file>          Summarise an audit log, optionally render HTML
      [--html <out.html>] [--open] [--json]
  init [--preset <name>]      Write a starter .opencode/cordon.jsonc
      [--out <file>] [--force]
  redact [<file>]             Redact secrets from a file (or stdin) to stdout

${bold("GLOBAL")}
  --policy <file>   Use a specific policy file
  --json            Machine-readable output (check / evaluate / audit)
  -h, --help        Show this help
  -v, --version     Print the version

${bold("EXIT CODES")}
  0 ok · 1 usage · 2 invalid policy · 4 missing audit log
  evaluate only: 10 ask · 20 deny

${bold("PRESETS")}  ${PRESETS.join(" · ")}`;
}

/** @param {any} args */
function check(args) {
  const loaded = args.policy ? loadPolicy({ policyPath: String(args.policy) }) : loadPolicy({});
  if (!loaded.file) {
    fail("no policy found. Run `opencode-cordon init` to create .opencode/cordon.jsonc");
    return EXIT.invalidPolicy;
  }
  if (loaded.errors.length > 0) {
    if (args.json) console.log(JSON.stringify({ ok: false, file: loaded.file, errors: loaded.errors }, null, 2));
    else for (const error of loaded.errors) fail(`${loaded.file}: ${error}`);
    return EXIT.invalidPolicy;
  }

  const rules = resolveRules(loaded.policy);
  const userRules = loaded.policy.rules?.length ?? 0;
  const settings = auditSettings(loaded.policy);

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          file: loaded.file,
          preset: loaded.policy.preset ?? "balanced",
          rules: { user: userRules, preset: rules.length - userRules, total: rules.length },
          audit: settings,
          warnings: loaded.warnings,
        },
        null,
        2,
      ),
    );
    return EXIT.ok;
  }

  console.log(`${bold("cordon check")} ${green("ok")}`);
  console.log(`  policy   ${loaded.file}`);
  console.log(`  preset   ${loaded.policy.preset ?? "balanced"}`);
  console.log(`  rules    ${userRules} user + ${rules.length - userRules} preset = ${rules.length}`);
  console.log(`  audit    ${settings.enabled ? settings.path + (settings.redact ? dim(" (redact on)") : "") : dim("off")}`);
  for (const warning of loaded.warnings) console.log(`  ${yellow("warning")}  ${warning}`);
  return EXIT.ok;
}

/** @param {any} args */
function evaluate(args) {
  const loaded = args.policy ? loadPolicy({ policyPath: String(args.policy) }) : loadPolicy({});
  if (!loaded.policy || loaded.errors.length > 0) {
    if (loaded.file && loaded.errors.length) {
      for (const error of loaded.errors) fail(`${loaded.file}: ${error}`);
      return EXIT.invalidPolicy;
    }
    fail("no policy found. Run `opencode-cordon init` first, or pass --policy <file>");
    return EXIT.invalidPolicy;
  }

  const action = args.action ?? args.tool;
  if (!action) {
    fail("evaluate needs --action <action> (for example: --action shell)");
    return EXIT.usage;
  }

  /** @type {{ action: string, tool: string, agent: string, paths: string[], commands: string[] }} */
  const subject = {
    action: String(action),
    tool: args.tool ? String(args.tool) : "",
    agent: args.agent ? String(args.agent) : "",
    paths: args.path ? String(args.path).split(",").map((p) => p.trim()).filter(Boolean) : [],
    commands: args.command ? [String(args.command)] : [],
  };

  const decision = decide(loaded.policy, subject);
  if (args.json) {
    console.log(
      JSON.stringify(
        {
          action: subject.action,
          tool: subject.tool || null,
          agent: subject.agent || null,
          paths: subject.paths,
          commands: subject.commands,
          decision: decision.decision,
          rule: decision.rule?.id ?? null,
          reason: decision.reason || null,
          effect: decision.decision ?? "unchanged",
        },
        null,
        2,
      ),
    );
  } else if (!decision.decision) {
    console.log(`${green("pass")}  no cordon rule matched; the native decision is untouched`);
  } else {
    const label = decision.decision === "deny" ? red("deny") : decision.decision === "ask" ? yellow("ask") : green("allow");
    console.log(`${label}  rule ${cyan(decision.rule?.id ?? "?")}${decision.reason ? dim(" — " + decision.reason) : ""}`);
  }

  if (decision.decision === "deny") return EXIT.deny;
  if (decision.decision === "ask") return EXIT.ask;
  return EXIT.ok;
}

/** @param {any} args */
function audit(args) {
  const logPath = path.resolve(args.log ? String(args.log) : ".opencode/cordon/audit.jsonl");
  if (!existsSync(logPath)) {
    fail(`audit log not found: ${logPath}`);
    return EXIT.missingLog;
  }

  const { records, invalid } = readRecords(logPath);
  const summary = summarize(records);
  const loaded = args.policy ? loadPolicy({ policyPath: String(args.policy) }) : loadPolicy({});

  let htmlPath = null;
  if (args.html) {
    htmlPath = path.resolve(args.html === true ? "cordon-audit.html" : String(args.html));
    mkdirSync(path.dirname(htmlPath), { recursive: true });
    const html = renderAuditReport({
      records,
      policy: loaded.policy,
      policyPath: loaded.file,
      logPath: args.log ? String(args.log) : ".opencode/cordon/audit.jsonl",
      generatedAt: new Date().toISOString(),
    });
    writeFileSync(htmlPath, html, "utf8");
    if (args.open) openBrowser(htmlPath);
  }

  if (args.json) {
    console.log(JSON.stringify({ logPath, htmlPath, invalid, summary }, null, 2));
    return EXIT.ok;
  }

  const decisions = summary.byDecision.deny + summary.byDecision.ask + summary.byDecision.allow + summary.byDecision.pass;
  console.log(`${bold("cordon audit")} ${dim(logPath)}`);
  console.log(`  records    ${summary.total}${invalid ? yellow(` (${invalid} unreadable)`) : ""}`);
  console.log(`  decisions  ${decisions}  ${red("deny " + summary.byDecision.deny)} · ${yellow("ask " + summary.byDecision.ask)} · ${dim("pass " + summary.byDecision.pass)}`);
  console.log(`  tools      ${summary.byEvent.tool}   shells ${summary.byEvent.shell}`);
  console.log(`  sessions   ${summary.sessions}`);
  if (summary.firstAt && summary.lastAt) console.log(`  window     ${summary.firstAt} → ${summary.lastAt}`);
  if (summary.topRules.length) {
    console.log(`  ${bold("top rules")}`);
    for (const item of summary.topRules) console.log(`    ${String(item.count).padStart(4)}  ${cyan(item.rule)}`);
  }
  if (summary.denied.length) {
    console.log(`  ${bold("last denied")}`);
    for (const record of summary.denied.slice(-5)) {
      console.log(`    ${dim(record.ts ?? "")}  ${red("deny")}  ${record.rule ?? "?"}  ${clipText(record.command ?? (record.paths ?? []).join(" "), 70)}`);
    }
  }
  if (htmlPath) console.log(`  ${green("html")}       ${htmlPath}${args.open ? dim(" (opened)") : ""}`);
  return EXIT.ok;
}

/** @param {any} args */
function init(args) {
  const preset = args.preset ? String(args.preset) : "balanced";
  if (!PRESETS.includes(preset)) {
    fail(`unknown preset "${preset}"; pick one of ${PRESETS.join(", ")}`);
    return EXIT.usage;
  }
  const target = path.resolve(args.out ? String(args.out) : path.join(".opencode", "cordon.jsonc"));
  if (existsSync(target) && !args.force) {
    fail(`${target} already exists; pass --force to overwrite`);
    return EXIT.usage;
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(starterPolicy(preset), null, 2) + "\n", "utf8");
  console.log(`${green("created")} ${target} ${dim(`(preset ${preset})`)}`);
  console.log(`  next: ${cyan("opencode-cordon check")}  then  ${cyan("opencode-cordon evaluate --action shell --command \"rm -rf /\"")}`);
  return EXIT.ok;
}

/** @param {any} args */
function redact(args) {
  const file = args._[1];
  const text = file ? readFileSync(path.resolve(String(file)), "utf8") : readFileSync(0, "utf8");
  const result = redactText(text);
  process.stdout.write(result.text);
  if (result.total > 0) {
    console.error(dim(`cordon: redacted ${result.total} secret${result.total === 1 ? "" : "s"} (${Object.keys(result.hits).join(", ")})`));
  }
  return EXIT.ok;
}

function clipText(value, max) {
  const text = String(value ?? "");
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

function openBrowser(target) {
  const platform = process.platform;
  const command = platform === "win32" ? "cmd" : platform === "darwin" ? "open" : "xdg-open";
  const argv = platform === "win32" ? ["/c", "start", "", target] : [target];
  try {
    const child = spawn(command, argv, { detached: true, stdio: "ignore" });
    child.unref();
  } catch {
    // Opening a browser is best effort.
  }
}

/**
 * CLI entry point.
 * @param {string[]} [argv]
 */
export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.version) {
    console.log(VERSION);
    return EXIT.ok;
  }
  const command = args._[0] ?? (args.help ? "help" : "help");

  switch (command) {
    case "check":
      return check(args);
    case "evaluate":
      return evaluate(args);
    case "audit":
      return audit(args);
    case "init":
      return init(args);
    case "redact":
      return redact(args);
    case "version":
      console.log(VERSION);
      return EXIT.ok;
    case "help":
    default:
      console.log(usage());
      return command === "help" ? EXIT.ok : EXIT.usage;
  }
}
