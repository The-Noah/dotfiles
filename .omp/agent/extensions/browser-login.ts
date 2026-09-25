/**
 * Sign the chrome-devtools browser into the site under test.
 *
 * `/browser-login [url]` and the `browser_login` tool both run the launcher's login
 * mode (`bin/browser-mcp.mjs login`), which opens Edge on this project's saved profile.
 * Closing that window stamps the profile and every running chrome-devtools server of
 * the project restarts on the new sign-in, so no session needs a manual reconnect.
 */

import { spawn } from "node:child_process";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

import { AGENT_DIR } from "../bin/lib/system.mjs";

const LAUNCHER = join(AGENT_DIR, "bin", "browser-mcp.mjs");
const WAIT_LIMIT_MS = 15 * 60_000;
const STATUS_PREFIX = "browser-mcp: signing in";
// The launcher polls the stamp every second; give its restart a moment before the agent retries.
const RESTART_GRACE_MS = 2500;

type Login = { status: string; closed: Promise<void> };

/** Starts login mode detached, so the window outlives omp; resolves once the launcher reports what it opened. */
function startLogin(cwd: string, url: string | undefined): Promise<Login> {
  const started = Promise.withResolvers<Login>();
  const closed = Promise.withResolvers<void>();
  const child = spawn("node", [LAUNCHER, "login", ...(url ? [url] : [])], {
    cwd,
    detached: true,
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true
  });
  let output = "";
  child.once("error", started.reject);
  child.once("exit", (code) => {
    closed.resolve();
    started.reject(new Error(output.trim() || `launcher exited with code ${code}`));
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
    const end = output.indexOf("\n");
    // Anything else (a crash trace) keeps buffering and becomes the exit rejection.
    if (end === -1 || !output.startsWith(STATUS_PREFIX)) {
      return;
    }
    child.stderr?.removeAllListeners("data");
    child.stderr?.destroy();
    child.unref();
    started.resolve({ status: output.slice(0, end).replace(/^browser-mcp: /, ""), closed: closed.promise });
  });
  return started.promise;
}

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }], details: {} };
}

export default function browserLogin(pi: ExtensionAPI): void {
  const z = pi.zod;

  pi.registerCommand("browser-login", {
    description: "Open Edge on this project's browser profile to sign in (optional URL)",
    handler: async (args, ctx) => {
      try {
        const login = await startLogin(ctx.cwd, args.trim() || undefined);
        ctx.ui.notify(`${login.status} Open sessions pick up the sign-in when it closes.`, "info");
      } catch (error) {
        ctx.ui.notify(`browser-login failed: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    }
  });

  pi.registerTool({
    name: "browser_login",
    label: "Browser Login",
    description: [
      "Opens a visible Edge window on this project's saved chrome-devtools browser profile so the user can sign in to the site under test.",
      "Call it as soon as a page opened through the chrome-devtools tools shows a sign-in form or redirects to a login page; never type, guess or ask for credentials.",
      "It asks the user first, then waits until they close the window. The chrome-devtools server then restarts on the new sign-in and its earlier pages are gone, so open the page again with new_page.",
      "In a session with no user attached it returns without opening anything: report that sign-in is required and that the user can run /browser-login."
    ].join(" "),
    parameters: z.object({
      url: z
        .string()
        .optional()
        .describe("Page to open. Omit to use the project's .omp/browser.json url or its running dev server.")
    }),
    async execute(_id, params, signal, onUpdate, ctx) {
      if (!ctx.hasUI) {
        return text(
          "No user is attached to this session, so nobody can sign in. Report that sign-in is required; the user can run /browser-login in omp, then retry."
        );
      }
      const target = params.url ? ` at ${params.url}` : "";
      const accepted = await ctx.ui.confirm(
        "Browser sign-in needed",
        `The browser hit a sign-in page. Open Edge${target} so you can sign in? Close the window when you are done.`
      );
      if (!accepted) {
        return text(
          "The user declined to sign in now. Do not retry browser_login unless they ask; continue with what does not need a signed-in page."
        );
      }
      const login = await startLogin(ctx.cwd, params.url);
      onUpdate?.(text(`${login.status} Waiting for the window to close.`));

      const outcome = Promise.withResolvers<"closed" | "timeout" | "aborted">();
      void login.closed.then(() => outcome.resolve("closed"));
      const timer = setTimeout(() => outcome.resolve("timeout"), WAIT_LIMIT_MS);
      signal?.addEventListener("abort", () => outcome.resolve("aborted"), { once: true });
      const result = await outcome.promise;
      clearTimeout(timer);

      if (result === "aborted") {
        return text("Stopped waiting; the sign-in window stays open.");
      } else if (result === "timeout") {
        return text(
          "The sign-in window is still open after 15 minutes. Ask the user whether they finished; the browser restarts on the sign-in once they close it."
        );
      }
      await sleep(RESTART_GRACE_MS);
      return text(
        "Sign-in saved and the chrome-devtools server restarted on it. Earlier page ids are gone: open the page again with new_page."
      );
    }
  });
}
