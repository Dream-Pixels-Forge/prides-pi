#!/usr/bin/env node

/**
 * Bundle PRIDES PI extension src/*.ts → prides.ts
 * Concatenates modules with header comments, then appends the extension entry point.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src");
const OUT = join(__dirname, "..", "prides.ts");

const ORDER = ["config.ts", "gates.ts", "state.ts", "guards.ts", "tools.ts", "index.ts", "extension.ts"];

let output = `"""PRIDES PI Extension — bundled from src/*.ts"""\n\n`;

for (const file of ORDER) {
  const path = join(SRC, file);
  let content = readFileSync(path, "utf-8");
  // Strip local imports and re-exports for bundled context
  content = content.replace(/^import\s+.*from\s+["']\.[^"']*["'];?\s*\n/gm, "");
  content = content.replace(/^export\s+\{.*\}\s+from\s+["'][^"']*["'];?\s*\n/gm, "");
  output += `/* ─── ${file} ─── */\n`;
  output += content.trim();
  output += "\n\n";
}

writeFileSync(OUT, output);
console.log(`Bundled ${ORDER.length} modules → prides.ts`);
