import type { CollectBatch, CollectContext } from "../types";
import type { ScriptKey } from "./manifest";
import { bokadirektTableSync } from "./bokadirekt-table-sync";
import { brabyggare } from "./brabyggare";
import { eniroTableSync } from "./eniro-table-sync";
import { exampleScript } from "./example";
import { servicefinder } from "./servicefinder";
import { dorunner } from "./dorunner";
import { boka } from "./boka";

/**
 * A registered custom script.
 *
 * The contract is exactly the collectors' own: yield batches, say where to
 * resume. That is why a script can page through 16 708 rows without the worker
 * knowing anything about it.
 */
export interface ScriptHandler {
  key: ScriptKey;
  collect: (ctx: CollectContext) => AsyncGenerator<CollectBatch>;
}

const HANDLERS: Record<ScriptKey, ScriptHandler> = {
  "bokadirekt-table-sync": bokadirektTableSync,
  brabyggare,
  "eniro-table-sync": eniroTableSync,
  example: exampleScript,
  servicefinder,
  dorunner,
  boka,
};

export function getScriptHandler(key: ScriptKey): ScriptHandler {
  return HANDLERS[key];
}
