// Generates TypeScript types from the JSON Schemas in contracts/<version>/ (ADR 0005).
// Usage: node scripts/generate.mjs [--check]
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const here = dirname(fileURLToPath(import.meta.url));
const version = "v1";
const contractsDir = join(here, "../../../contracts", version);
const outDir = join(here, "../src/generated");
const check = process.argv.includes("--check");

const banner = `/* eslint-disable */
// GENERATED from contracts/${version} by packages/schemas/scripts/generate.mjs.
// Do not edit by hand: change the Rust types and run \`pnpm schemas\`.
`;

const files = (await readdir(contractsDir)).filter((f) => f.endsWith(".schema.json")).sort();
const stale = [];
const modules = [];

for (const file of files) {
  const schema = JSON.parse(await readFile(join(contractsDir, file), "utf8"));
  const name = basename(file, ".schema.json");
  const ts = await compile(schema, schema.title ?? name, {
    bannerComment: banner,
    additionalProperties: false,
    style: { singleQuote: false, semi: true },
  });
  const target = join(outDir, `${name}.ts`);
  modules.push(name);
  if (check) {
    const current = await readFile(target, "utf8").catch(() => null);
    if (current !== ts) stale.push(target);
  } else {
    await mkdir(outDir, { recursive: true });
    await writeFile(target, ts);
    console.log(`wrote ${target}`);
  }
}

if (check) {
  if (stale.length) {
    console.error(`stale generated types:\n  ${stale.join("\n  ")}\nrun \`pnpm schemas\``);
    process.exit(1);
  }
  console.log("generated types up to date");
}
