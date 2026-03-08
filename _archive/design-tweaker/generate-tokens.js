#!/usr/bin/env node
// generate-tokens.js
// Usage: node generate-tokens.js  OR  bun generate-tokens.js
// Reads primitive.json + semantic.json, writes tokens.css
// No external dependencies.

import { readFileSync, writeFileSync } from "fs";

const primitives = JSON.parse(readFileSync("primitive.json", "utf8"));
const semantics  = JSON.parse(readFileSync("semantic.json", "utf8"));

// Flatten nested token object → { "group.key": rawValue }
function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && "value" in v) {
      out[key] = v.value;
    } else if (v !== null && typeof v === "object") {
      Object.assign(out, flatten(v, key));
    }
  }
  return out;
}

// "bg.appPad" → "--bg-app-pad"  |  "accent.trimHandleStart" → "--accent-trim-handle-start"
function toCssVar(tokenPath) {
  return "--" + tokenPath
    .replace(/\./g, "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

// Resolve "{group.key}" references against primitive flat map
function resolve(value, primFlat) {
  if (typeof value !== "string") return String(value);
  return value.replace(/\{([^}]+)\}/g, (_, ref) => {
    if (!(ref in primFlat)) throw new Error(`Unresolved reference: {${ref}}`);
    return primFlat[ref];
  });
}

const primFlat = flatten(primitives);
const semFlat  = flatten(semantics);

const lines   = [":root {"];
const skipped = [];

for (const [tokenPath, rawValue] of Object.entries(semFlat)) {
  try {
    const resolved = resolve(rawValue, primFlat);
    lines.push(`  ${toCssVar(tokenPath)}: ${resolved};`);
  } catch (e) {
    skipped.push(`  ${tokenPath}: ${e.message}`);
  }
}

lines.push("}");

const output = [
  "/* AUTO-GENERATED — do not edit by hand */",
  "/* Source: primitive.json + semantic.json  |  Run: bun tokens */",
  "",
  ...lines,
  "",
].join("\n");

writeFileSync("tokens.css", output, "utf8");

const count = lines.length - 2; // exclude opening/closing braces
console.log(`tokens.css written — ${count} properties`);
if (skipped.length) {
  console.warn(`Skipped (${skipped.length}):`);
  skipped.forEach(s => console.warn(s));
}
