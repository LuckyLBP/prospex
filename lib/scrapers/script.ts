import { CollectorError, type Collector, type CollectContext } from "./types";
import { scriptConfigSchema, type ScriptConfig } from "@/lib/sources/schema";
import { getScriptHandler } from "./scripts/index";

/**
 * The "custom script" method: a named handler from the registry.
 *
 * The name is stored in the profile's config and validated against the
 * registry both when it is saved and when it is run, so removing a script
 * turns its profiles into a readable error rather than a crash.
 */
export function createScriptCollector(): Collector<ScriptConfig> {
  return {
    method: "script",

    parseConfig(raw) {
      const parsed = scriptConfigSchema.safeParse(raw);
      if (!parsed.success) {
        throw new CollectorError(
          "Profilens skript finns inte längre. Välj ett annat skript i profilen.",
        );
      }
      return parsed.data;
    },

    collect(config: ScriptConfig, ctx: CollectContext) {
      return getScriptHandler(config.script).collect(ctx);
    },
  };
}
