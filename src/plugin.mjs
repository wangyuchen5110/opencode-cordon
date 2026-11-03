// OpenCode 2 server part. The plugin is deliberately small: policy loading, two
// hook families, and an audit writer. All decision logic lives in pure modules.

import { Plugin } from "@opencode/plugin";
import { applyDecision, decide, normalizePermission } from "./decision.mjs";
import { auditSettings, loadPolicy } from "./policy.mjs";
import { createAuditWriter } from "./audit.mjs";

/**
 * Loaded once per plugin instance. A missing or invalid policy disables the
 * cordon: an unreadable policy must never silently weaken a decision.
 */
export default Plugin.define({
  id: "opencode-cordon",
  async setup(ctx) {
    const directory = ctx?.location?.directory ?? process.cwd();
    const options = ctx?.options && typeof ctx.options === "object" ? ctx.options : {};
    const policyPath = typeof options.policy === "string" ? options.policy : undefined;
    const loaded = loadPolicy({ directory, policyPath });

    if (!loaded.policy) {
      if (loaded.file) {
        console.error(`[cordon] policy at ${loaded.file} is invalid, cordon is idle: ${loaded.errors.join("; ")}`);
      } else {
        console.error("[cordon] no policy found (.opencode/cordon.jsonc), cordon is idle");
      }
      return;
    }
    if (Array.isArray(loaded.errors) && loaded.errors.length > 0) {
      console.error(`[cordon] policy at ${loaded.file} is invalid, cordon is idle: ${loaded.errors.join("; ")}`);
      return;
    }

    const settings = auditSettings(loaded.policy);
    const writer = settings.enabled
      ? createAuditWriter({
          logPath: settings.path,
          projectDirectory: directory,
          redact: settings.redact,
          storeCommand: settings.storeCommand,
          commandHash: settings.commandHash,
        })
      : null;

    if (loaded.warnings?.length) {
      for (const warning of loaded.warnings) console.error(`[cordon] warning: ${warning}`);
    }

    /** @type {Array<{ dispose?: () => Promise<void> | void }>} */
    const registrations = [];

    const guard = (label, fn) => {
      try {
        return fn();
      } catch (error) {
        console.error(`[cordon] ${label} hook failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    if (typeof ctx?.permission?.hook === "function") {
      registrations.push(
        await ctx.permission.hook("evaluate", (input) =>
          guard("permission.evaluate", () => {
            const subject = normalizePermission(input);
            const decision = decide(loaded.policy, subject);
            const applied = applyDecision(input, decision);
            writer?.decision({
              sessionID: input?.sessionID,
              agent: input?.agent,
              subject,
              decision,
              applied,
            });
          }),
        ),
      );
    } else {
      console.error("[cordon] this OpenCode build has no permission.evaluate hook; decisions are disabled");
    }

    if (typeof ctx?.tool?.hook === "function") {
      registrations.push(
        await ctx.tool.hook("execute.before", (input) => guard("tool.execute.before", () => writer?.toolBefore(input))),
      );
      registrations.push(
        await ctx.tool.hook("execute.after", (input) => guard("tool.execute.after", () => writer?.toolAfter(input))),
      );
    }

    if (typeof ctx?.shell?.hook === "function") {
      registrations.push(
        await ctx.shell.hook("create.before", (input) => guard("shell.create.before", () => writer?.shellBefore(input))),
      );
    }

    console.error(
      `[cordon] active: policy ${loaded.file} · preset ${loaded.policy.preset ?? "balanced"} · ${loaded.policy.rules?.length ?? 0} user rules${writer ? ` · audit ${writer.logPath}` : " · audit off"}`,
    );

    return async () => {
      for (const registration of registrations) {
        try {
          await registration?.dispose?.();
        } catch {
          // Shutdown best effort.
        }
      }
    };
  },
});
