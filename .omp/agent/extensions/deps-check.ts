import { join } from "node:path";

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

import { missingDeps } from "../bin/lib/deps.mjs";
import { AGENT_DIR } from "../bin/lib/system.mjs";

/**
 * Warns once per process when a program these settings rely on is missing
 * (Edge, tsgo, a Nerd Font, ...). It never installs anything: the warning points
 * at bin/omp-deps.mjs, which asks before each install.
 */

let warned = false;

export default function depsCheck(pi: ExtensionAPI) {
  pi.setLabel("Dependency check");

  pi.on("session_start", async (_event, ctx) => {
    if (warned || !ctx.hasUI) {
      return;
    }
    warned = true;
    // Deferred so the check (an fc-list spawn, capped at 1.5 s) runs after startup, not inside it.
    ctx.setTimeout(() => {
      const missing = missingDeps();
      if (missing.length === 0) {
        return;
      }
      const list = missing.map((dep) => `${dep.label} (${dep.why})`).join("; ");
      const cli = `node "${join(AGENT_DIR, "bin", "omp-deps.mjs")}"`;
      const node = missing.find((dep) => dep.id === "node");
      const next = node
        ? `Install Node.js first (${node.manual}), then run \`${cli}\`.`
        : `Run \`${cli}\` in a terminal; it asks before installing anything.`;
      ctx.ui.notify(`Missing omp dependencies: ${list}. ${next}`, "warning");
    }, 0);
  });
}
