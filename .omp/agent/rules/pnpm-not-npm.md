---
name: pnpm-not-npm
description: "Run package binaries via pnpm exec/pnpm dlx, never npx/npm"
condition: ["\\bnpx\\s+[\\w@.-]", "\\bnpm\\s+(run|install|i|exec|ci|test|add|remove|ls)\\b"]
scope: "tool:bash"
---

This repo is pnpm-only. `npx` and `npm` are prohibited in shell commands.

- `npx <bin>` → `pnpm exec <bin>`
- `npx <uninstalled-pkg>` → `pnpm dlx <pkg>`
- `npm run <script>` → `pnpm <script>`
- `npm install` / `npm ci` → `pnpm install --frozen-lockfile`
- `npm add|remove` → `pnpm add|remove`

Mixing npm in a pnpm workspace resolves binaries outside the pnpm store and can rewrite `package-lock.json`, drifting from `pnpm-lock.yaml`.

If a repo script (`pnpm lint`, `pnpm check`) is too slow or times out, scope the underlying binary with `pnpm exec` on the changed paths — do not fall back to `npx`.