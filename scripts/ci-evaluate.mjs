// CI assertion for the "evaluate does not loosen a deny" behaviour.
//
// The CLI uses exit code 20 for a deny, which is correct for scripts but would make a
// workflow step fail. This wrapper asserts the expected code and the JSON payload, then
// exits 0 so a green CI means "the deny still happens", not "the deny was avoided".

import { main } from "../src/cli.mjs";

const originalLog = console.log;
let output = "";
console.log = (...args) => {
  output += args.join(" ") + "\n";
};

const code = await main([
  "evaluate",
  "--policy",
  "test/fixtures/cordon.jsonc",
  "--action",
  "shell",
  "--command",
  "rm -rf /tmp/x",
  "--json",
]);

console.log = originalLog;

if (code !== 20) {
  console.error(`expected exit code 20 (deny), got ${code}`);
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(output);
} catch (error) {
  console.error(`evaluate did not print JSON: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

if (payload.decision !== "deny") {
  console.error(`expected decision "deny", got ${JSON.stringify(payload.decision)}`);
  process.exit(1);
}
if (!payload.rule) {
  console.error("expected a matched rule id");
  process.exit(1);
}

console.log(`ok: deny enforced by rule ${payload.rule}`);
