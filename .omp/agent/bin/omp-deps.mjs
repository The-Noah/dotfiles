#!/usr/bin/env node
// Checks the programs the omp settings rely on and offers to install each missing one.
// Every install asks first; answering anything but "y" skips it.
// Usage: node ~/.omp/agent/bin/omp-deps.mjs

import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";

import { missingDeps } from "./lib/deps.mjs";
import { IS_WINDOWS, onPath } from "./lib/system.mjs";

async function ask(question) {
  // A fresh interface per question, closed before any installer inherits stdin.
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

const missing = missingDeps();
if (missing.length === 0) {
  console.log("All omp dependencies are installed.");
  process.exit(0);
}

console.log("Missing omp dependencies:");
for (const dep of missing) {
  console.log(`  - ${dep.label}: ${dep.why}`);
}

if (!process.stdin.isTTY) {
  console.log("\nNot a terminal, so nothing was installed. To install:");
  for (const dep of missing) {
    const command = dep.install();
    console.log(`  - ${dep.label}: ${command ? command.join(" ") : dep.manual}`);
  }
  process.exit(1);
}

for (const dep of missing) {
  if (dep.present()) {
    continue;
  }
  const command = dep.install();
  // Absolute path, run from home: on Windows a bare name would also match a file in the cwd.
  const exe = command && onPath(command[0]);
  if (!exe) {
    console.log(`\n${dep.label}: no installer known for this system. Manual install: ${dep.manual}`);
    continue;
  }
  const answer = await ask(`\nInstall ${dep.label} with \`${[exe, ...command.slice(1)].join(" ")}\`? [y/N] `);
  if (!/^y(es)?$/i.test(answer)) {
    console.log(`Skipped. Manual install: ${dep.manual}`);
    continue;
  }
  // Node refuses to spawn .cmd/.bat shims (pnpm.cmd) without a shell; quote the path for it.
  const shell = IS_WINDOWS && /\.(cmd|bat)$/i.test(exe);
  const result = spawnSync(shell ? `"${exe}"` : exe, command.slice(1), { stdio: "inherit", shell, cwd: homedir() });
  if (result.status !== 0) {
    console.log(`Install failed (${result.error?.message ?? `exit ${result.status}`}). Manual install: ${dep.manual}`);
  }
}

const remaining = missingDeps();
if (remaining.length === 0) {
  console.log("\nAll omp dependencies are installed.");
} else {
  console.log(`\nStill missing: ${remaining.map((dep) => dep.label).join(", ")}.`);
  console.log("If you just installed one, open a new terminal so PATH updates, then run this again.");
}
process.exit(remaining.length === 0 ? 0 : 1);
