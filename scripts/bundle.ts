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

const ORDER = ["config.ts", "gates.ts", "state.ts", "guards.ts", "tools.ts", "extension.ts"];

let output = `// PRIDES PI Extension — bundled from src/*.ts\n\n`;

for (const file of ORDER) {
  const path = join(SRC, file);
  let content = readFileSync(path, "utf-8");
  // Strip local imports and re-exports for bundled context
  content = content.replace(/^import\s+.*from\s+["']\.[^"']*["'];?\s*\n/gm, "");
  // Re-exports may be one line or span many (e.g. long type lists). The brace list
  // is greedy within a single statement, so we match the full `export { ... } from "...";`
  // block via the `;` terminator instead of relying on line structure.
  content = content.replace(/export\s+\{[\s\S]*?\}\s*from\s+["'][^"']*["'];?/g, "");
  output += `/* ─── ${file} ─── */\n`;
  output += content.trim();
  output += "\n\n";
}

writeFileSync(OUT, output);
console.log(`Bundled ${ORDER.length} modules → prides.ts`);
