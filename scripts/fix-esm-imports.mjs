import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await walk(fullPath);
      files.push(...nested);
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }
  return files;
}

async function resolveSpecifier(file, specifier) {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return specifier;
  if (extname(specifier)) return specifier;

  const target = resolve(dirname(file), specifier);
  if (await exists(`${target}.js`)) return `${specifier}.js`;
  if (await exists(join(target, "index.js"))) return `${specifier}/index.js`;
  return specifier;
}

for (const file of await walk(distDir)) {
  const input = await readFile(file, "utf8");
  const pattern = /((?:from|import|export)\s*(?:\(\s*)?["'])(\.{1,2}\/[^"']+)(["'])/g;
  const matches = [...input.matchAll(pattern)];
  let output = input;

  for (const match of matches) {
    const [full, prefix, specifier, suffix] = match;
    const resolved = await resolveSpecifier(file, specifier);
    if (resolved !== specifier) {
      output = output.replace(full, `${prefix}${resolved}${suffix}`);
    }
  }

  if (output !== input) {
    await writeFile(file, output);
  }
}
