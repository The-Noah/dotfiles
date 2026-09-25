// External programs the synced omp settings rely on, with per-OS install commands.
// Nothing here installs anything: bin/omp-deps.mjs asks before running an install command.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { AGENT_DIR, findBrowser, hasNerdFont, IS_MACOS, IS_WINDOWS, onPath } from "./system.mjs";

const pacman = (...pkgs) => (onPath("pacman") ? ["sudo", "pacman", "-S", "--needed", ...pkgs] : undefined);
const aur = (pkg) => {
  const helper = ["yay", "paru"].find((name) => onPath(name));
  return helper ? [helper, "-S", "--needed", pkg] : undefined;
};
const brew = (...args) => (onPath("brew") ? ["brew", "install", ...args] : undefined);
const winget = (id) => (onPath("winget") ? ["winget", "install", "--exact", "--id", id] : undefined);
const perOs = ({ linux, darwin, win32 }) => (IS_WINDOWS ? win32 : IS_MACOS ? darwin : linux)?.();

function usesNerdSymbols() {
  try {
    return /^symbolPreset:\s*["']?nerd\b/m.test(readFileSync(join(AGENT_DIR, "config.yml"), "utf8"));
  } catch {
    return false;
  }
}

/**
 * `install()` returns the argv to run on this system, or undefined when there is no
 * known installer here; `manual` is the fallback instruction either way.
 */
export const DEPS = [
  {
    id: "node",
    label: "Node.js",
    why: "runs the chrome-devtools MCP launcher (mcp.json) and bin/*.mjs",
    present: () => Boolean(onPath("node")),
    install: () =>
      perOs({
        linux: () => pacman("nodejs"),
        darwin: () => brew("node"),
        win32: () => winget("OpenJS.NodeJS.LTS")
      }),
    manual: "https://nodejs.org/en/download"
  },
  {
    id: "pnpm",
    label: "pnpm",
    why: "pnpx starts chrome-devtools-mcp, and pnpm installs tsgo",
    present: () => Boolean(onPath("pnpm")),
    install: () =>
      perOs({
        linux: () => pacman("pnpm"),
        darwin: () => brew("pnpm"),
        win32: () => winget("pnpm.pnpm")
      }),
    manual: "https://pnpm.io/installation"
  },
  {
    id: "tsgo",
    label: "tsgo",
    why: "TypeScript language server in lsp.json",
    present: () => Boolean(onPath("tsgo")),
    install: () => (onPath("pnpm") ? ["pnpm", "add", "--global", "@typescript/native-preview"] : undefined),
    manual: "install pnpm, run `pnpm setup` once, then `pnpm add --global @typescript/native-preview`"
  },
  {
    id: "edge",
    label: "Microsoft Edge",
    why: "browser for the chrome-devtools MCP and /browser-login",
    present: () => Boolean(findBrowser()),
    install: () =>
      perOs({
        linux: () => aur("microsoft-edge-stable-bin"),
        darwin: () => brew("--cask", "microsoft-edge"),
        win32: () => winget("Microsoft.Edge")
      }),
    manual: "https://www.microsoft.com/edge/download, or point OMP_BROWSER_EXECUTABLE at another Chromium browser"
  },
  {
    id: "nerd-font",
    label: "a Nerd Font",
    why: "config.yml sets symbolPreset: nerd",
    applies: usesNerdSymbols,
    present: hasNerdFont,
    install: () =>
      perOs({
        linux: () => pacman("ttf-0xproto-nerd"),
        darwin: () => brew("--cask", "font-0xproto-nerd-font")
      }),
    manual: "download 0xProto.zip from https://github.com/ryanoasis/nerd-fonts/releases/latest, install it, and select it in your terminal"
  }
];

/** Dependencies that apply to this setup and are not installed. */
export function missingDeps() {
  return DEPS.filter((dep) => (dep.applies?.() ?? true) && !dep.present());
}
