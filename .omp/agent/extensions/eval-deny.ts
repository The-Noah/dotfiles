import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { lookup } from "@oh-my-pi/pi-coding-agent/config/registry";

/**
 * Applies the `bash.patterns` deny rules to `eval` code.
 *
 * omp checks those rules only for the `bash` tool. `eval` sits at the exec tier
 * and can shell out (`!cmd`, `subprocess`, `Bun.$`), so under yolo a command the
 * bash policy refuses (`wrangler deploy`, `git push --force`) runs unchecked once
 * it moves into an eval cell. This closes that path for `deny` rules only;
 * `prompt` rules would turn every matching eval into an approval card.
 *
 * The rules are globs written for a shell line, so each one is tried against the
 * whole cell, every line (minus a leading `!` magic), and the cell with quotes,
 * commas and brackets dropped, which turns an argv list such as
 * `["git", "push", "-f", "origin"]` back into `git push -f origin`.
 */

type Rule = { match: string; approval?: string; reason?: string };

const patterns = lookup("bash.patterns");
const compiled = new Map<string, RegExp>();

/** Same semantics as bash.patterns: `*` is the only wildcard, whitespace runs collapse to one space. */
function globRegExp(glob: string): RegExp {
  let regex = compiled.get(glob);
  if (!regex) {
    const body = collapse(glob)
      .split("*")
      .map((part) => part.replaceAll(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join("[\\s\\S]*");
    regex = new RegExp(`^${body}$`);
    compiled.set(glob, regex);
  }
  return regex;
}

function collapse(text: string): string {
  return text.replaceAll(/\s+/g, " ").trim();
}

function denyRules(pi: ExtensionAPI): Rule[] {
  const value = patterns?.get(pi.pi.settings);
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (rule): rule is Rule =>
      Boolean(rule) && typeof rule === "object" && typeof rule.match === "string" && rule.approval === "deny"
  );
}

function candidates(code: string): string[] {
  const lines = code
    .split("\n")
    .map((line) => collapse(line.replace(/^\s*!/, "")))
    .filter((line) => line.length > 0);
  const argv = collapse(code.replaceAll(/["'`,[\]]/g, " "));
  return [collapse(code), argv, ...lines];
}

export default function evalDeny(pi: ExtensionAPI) {
  pi.setLabel("Eval deny patterns");

  pi.on("tool_call", async (event) => {
    if (event.toolName.toLowerCase() !== "eval") {
      return;
    }
    const code = (event.input as Record<string, unknown> | undefined)?.code;
    if (typeof code !== "string" || code.length === 0) {
      return;
    }
    const rules = denyRules(pi);
    if (rules.length === 0) {
      return;
    }
    const texts = candidates(code);
    const hit = rules.find((rule) => {
      const regex = globRegExp(rule.match);
      return texts.some((text) => regex.test(text));
    });
    if (!hit) {
      return;
    }
    return {
      block: true,
      reason: [
        `[eval-deny] blocked: this eval code matches the bash.patterns deny rule \`${hit.match}\`.`,
        ...(hit.reason ? [hit.reason] : []),
        "The rule refuses the command in bash, and eval does not get around it. Do not retry it",
        "through eval, a script file, or another tool. If the user wants it run, they run it."
      ].join("\n")
    };
  });
}
