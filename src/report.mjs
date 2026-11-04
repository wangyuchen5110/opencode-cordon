// Self-contained HTML audit report: no CDN, no fonts, no external assets.
// Everything is inlined so the file can be attached to an issue or opened offline.

import { readFileSync } from "node:fs";
import { summarize, verifyChain } from "./audit.mjs";

const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

/** @param {unknown} value */
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** @param {string} iso */
function timeOf(iso) {
  if (typeof iso !== "string") return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return esc(iso);
  return date.toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
}

/** @param {any} record */
function detailOf(record) {
  if (record.command) return record.command;
  if (Array.isArray(record.paths) && record.paths.length) return record.paths.join(" · ");
  if (record.tool) return record.tool;
  if (record.action) return record.action;
  return "—";
}

/**
 * Render the audit HTML. All record fields are escaped.
 * @param {{ records: any[], policy?: any, policyPath?: string | null, logPath?: string, generatedAt?: string }} input
 */
export function renderAuditReport(input) {
  const records = Array.isArray(input.records) ? input.records : [];
  const summary = summarize(records);
  const chain = verifyChain(records);
  const chainValue = chain.status === "ok" ? "intact" : chain.status;
  const chainClass = chain.status === "broken" ? " deny" : chain.status === "ok" ? " pass" : "";
  const chainNote =
    chain.status === "broken"
      ? ` Chain broken at record ${chain.brokenAt} (${chain.reason}).`
      : chain.status === "ok"
        ? " Hash chain matches. Rewriting the whole file can still recompute it."
        : chain.status === "legacy"
          ? " Legacy log with no hash chain. New logs are chained."
          : "";
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const rules = input.policy?.rules ?? [];
  const preset = input.policy?.preset ?? "balanced";
  const decisionRows = records
    .filter((record) => record && record.event === "decision")
    .slice()
    .reverse();

  const maxRule = summary.topRules.reduce((max, item) => Math.max(max, item.count), 1);
  const topRuleRows = summary.topRules
    .map(
      (item) => `<div class="bar-row">
        <span class="bar-label" title="${esc(item.rule)}">${esc(item.rule)}</span>
        <span class="bar"><span style="width:${Math.max(6, Math.round((item.count / maxRule) * 100))}%"></span></span>
        <span class="bar-count">${item.count}</span>
      </div>`,
    )
    .join("");

  const tableRows = decisionRows
    .map((record) => {
      const decision = ["deny", "ask", "allow", "pass"].includes(record.decision) ? record.decision : "pass";
      const detail = detailOf(record);
      const search = [record.rule, record.action, record.tool, detail, record.reason, record.sessionID].join(" ").toLowerCase();
      return `<tr data-decision="${decision}" data-text="${esc(search)}">
        <td class="mono time">${esc(timeOf(record.ts))}</td>
        <td><span class="badge ${decision}">${decision}</span></td>
        <td class="mono">${esc(record.action ?? record.tool ?? "—")}</td>
        <td class="mono rule">${esc(record.rule ?? "—")}</td>
        <td class="mono detail" title="${esc(detail)}">${esc(detail)}</td>
        <td class="reason">${esc(record.reason ?? "")}</td>
      </tr>`;
    })
    .join("");

  const empty = decisionRows.length === 0;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>opencode-cordon · audit report</title>
<style>
  :root {
    --bg: #0c0f14; --panel: #121722; --panel-2: #0f141d; --line: #1f2633;
    --text: #d7dee8; --muted: #7b8798; --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    --allow: #3fb950; --ask: #d29922; --deny: #f85149; --pass: #58a6ff; --accent: #7ee787;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); }
  body { font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; padding: 32px clamp(16px, 4vw, 56px) 56px; }
  a { color: var(--pass); }
  header.top { display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px 20px; padding-bottom: 18px; border-bottom: 1px solid var(--line); }
  .brand { font-family: var(--mono); font-size: 18px; font-weight: 600; letter-spacing: 0.5px; }
  .brand span { color: var(--accent); }
  .meta { color: var(--muted); font-size: 12px; font-family: var(--mono); }
  h1 { font-size: 15px; font-weight: 600; margin: 26px 0 12px; letter-spacing: 0.3px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; }
  .card .label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; }
  .card .value { font-family: var(--mono); font-size: 26px; margin-top: 4px; }
  .card.deny .value { color: var(--deny); }
  .card.ask .value { color: var(--ask); }
  .card.pass .value { color: var(--pass); }
  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; margin-top: 18px; overflow: hidden; }
  .panel-head { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--line); }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip { background: var(--panel-2); color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 4px 11px; font-size: 12px; cursor: pointer; }
  .chip[aria-selected="true"] { color: var(--text); border-color: #35405a; background: #172031; }
  input#q { background: var(--panel-2); border: 1px solid var(--line); color: var(--text); border-radius: 8px; padding: 7px 10px; font-family: var(--mono); font-size: 12px; min-width: 220px; }
  input#q:focus { outline: 1px solid #35405a; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  thead th { text-align: left; color: var(--muted); font-weight: 500; font-size: 11px; letter-spacing: 0.6px; text-transform: uppercase; padding: 9px 12px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  tbody td { padding: 8px 12px; border-bottom: 1px solid #161c27; vertical-align: top; }
  tbody tr:hover { background: #141a25; }
  .mono { font-family: var(--mono); }
  .time { color: var(--muted); white-space: nowrap; }
  .rule { color: #c9a7ff; }
  .detail { max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .reason { color: var(--muted); max-width: 260px; }
  .badge { display: inline-block; min-width: 46px; text-align: center; border-radius: 999px; padding: 2px 8px; font-family: var(--mono); font-size: 11px; border: 1px solid; }
  .badge.deny { color: var(--deny); border-color: #4d1f1f; background: #2b1213; }
  .badge.ask { color: var(--ask); border-color: #4a3812; background: #241c0d; }
  .badge.allow { color: var(--allow); border-color: #1d3b25; background: #0f2416; }
  .badge.pass { color: var(--pass); border-color: #1c3350; background: #0f1b2b; }
  .bars { padding: 14px 16px; display: grid; gap: 9px; }
  .bar-row { display: grid; grid-template-columns: minmax(140px, 240px) 1fr 44px; gap: 12px; align-items: center; }
  .bar-label { font-family: var(--mono); color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar { height: 8px; border-radius: 999px; background: #172031; overflow: hidden; }
  .bar > span { display: block; height: 100%; background: linear-gradient(90deg, #2f81f7, #7ee787); border-radius: 999px; }
  .bar-count { font-family: var(--mono); color: var(--muted); text-align: right; }
  .empty { padding: 26px 16px; color: var(--muted); font-family: var(--mono); font-size: 12px; }
  footer { margin-top: 22px; color: var(--muted); font-size: 11.5px; font-family: var(--mono); display: flex; flex-wrap: wrap; gap: 6px 18px; }
  .hint { color: var(--muted); font-size: 12px; margin: 6px 0 0; }
  @media print { body { background: #fff; color: #111; } .panel, .card { border-color: #ddd; background: #fff; } }
</style>
</head>
<body>
<header class="top">
  <div class="brand">opencode<span>-cordon</span></div>
  <div class="meta">audit report · generated ${esc(timeOf(generatedAt))} · preset <b>${esc(preset)}</b> · ${rules.length} user rule${rules.length === 1 ? "" : "s"} · v${VERSION}</div>
</header>

<h1>Summary</h1>
<div class="cards">
  <div class="card"><div class="label">events</div><div class="value">${summary.total}</div></div>
  <div class="card deny"><div class="label">denied</div><div class="value">${summary.byDecision.deny}</div></div>
  <div class="card ask"><div class="label">asked</div><div class="value">${summary.byDecision.ask}</div></div>
  <div class="card pass"><div class="label">passed through</div><div class="value">${summary.byDecision.pass}</div></div>
  <div class="card"><div class="label">sessions</div><div class="value">${summary.sessions}</div></div>
  <div class="card"><div class="label">redactions</div><div class="value">${summary.redactions}</div></div>
  <div class="card${chainClass}"><div class="label">chain</div><div class="value">${esc(chainValue)}</div></div>
</div>
<p class="hint">Window: ${esc(timeOf(summary.firstAt))} → ${esc(timeOf(summary.lastAt))}. ${summary.byEvent.tool} tool and ${summary.byEvent.shell} shell events were also recorded.${esc(chainNote)}</p>

${summary.topRules.length ? `<h1>Rules that fired</h1>
<div class="panel"><div class="bars">${topRuleRows}</div></div>` : ""}

<h1>Decisions</h1>
<div class="panel">
  <div class="panel-head">
    <div class="chips" role="tablist">
      <button class="chip" role="tab" aria-selected="true" data-filter="all">all</button>
      <button class="chip" role="tab" aria-selected="false" data-filter="deny">deny</button>
      <button class="chip" role="tab" aria-selected="false" data-filter="ask">ask</button>
      <button class="chip" role="tab" aria-selected="false" data-filter="allow">allow</button>
      <button class="chip" role="tab" aria-selected="false" data-filter="pass">pass</button>
    </div>
    <input id="q" type="search" placeholder="filter by rule, action, command, session…" />
  </div>
  ${empty ? `<div class="empty">No permission decisions in this log yet. Run a session with cordon enabled, then rebuild the report.</div>` : `<table>
    <thead><tr><th>time</th><th>decision</th><th>action</th><th>rule</th><th>detail</th><th>reason</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>`}
</div>

<footer>
  <span>log: ${esc(input.logPath ?? "—")}</span>
  <span>policy: ${esc(input.policyPath ?? "—")}</span>
  <span>cordon never loosens a native decision.</span>
  <span>MIT · opencode-cordon</span>
</footer>

<script>
  (function () {
    var rows = Array.prototype.slice.call(document.querySelectorAll("tbody tr"));
    var chips = Array.prototype.slice.call(document.querySelectorAll(".chip"));
    var query = document.getElementById("q");
    var active = "all";
    function apply() {
      var needle = (query && query.value ? query.value : "").toLowerCase();
      rows.forEach(function (row) {
        var okChip = active === "all" || row.getAttribute("data-decision") === active;
        var okText = !needle || (row.getAttribute("data-text") || "").indexOf(needle) !== -1;
        row.hidden = !(okChip && okText);
      });
    }
    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        active = chip.getAttribute("data-filter");
        chips.forEach(function (other) { other.setAttribute("aria-selected", String(other === chip)); });
        apply();
      });
    });
    if (query) query.addEventListener("input", apply);
    document.addEventListener("keydown", function (event) {
      if (event.key === "/" && document.activeElement !== query) { event.preventDefault(); query && query.focus(); }
    });
  })();
</script>
</body>
</html>`;
}
