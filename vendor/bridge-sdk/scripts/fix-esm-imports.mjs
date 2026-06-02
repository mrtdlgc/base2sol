import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";

const dist = resolve("dist");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.isFile() && path.endsWith(".js")) files.push(path);
  }
  return files;
}

async function resolveJsSpecifier(fromFile, specifier) {
  if (!specifier.startsWith(".")) return false;
  if (extname(specifier)) {
    if (specifier.endsWith(".js") || specifier.endsWith(".json")) return false;
    try {
      const target = resolve(dirname(fromFile), `${specifier}.js`);
      if ((await stat(target)).isFile()) return `${specifier}.js`;
    } catch {
      return false;
    }
    return false;
  }
  try {
    const target = resolve(dirname(fromFile), `${specifier}.js`);
    if ((await stat(target)).isFile()) return `${specifier}.js`;
  } catch {
    // Fall through to directory index lookup.
  }
  try {
    const target = resolve(dirname(fromFile), specifier, "index.js");
    if ((await stat(target)).isFile()) return `${specifier}/index.js`;
  } catch {
    return false;
  }
  return false;
}

async function fixFile(file) {
  const input = await readFile(file, "utf8");
  let output = input;

  for (const match of input.matchAll(/\b(from\s+["'])(\.{1,2}(?:\/[^"']*)?)(["'])/g)) {
    const [, prefix, specifier, suffix] = match;
    const resolved = await resolveJsSpecifier(file, specifier);
    if (resolved) {
      output = output.replace(`${prefix}${specifier}${suffix}`, `${prefix}${resolved}${suffix}`);
    }
  }
  for (const match of input.matchAll(/\b(import\s*\(\s*["'])(\.{1,2}(?:\/[^"']*)?)(["']\s*\))/g)) {
    const [, prefix, specifier, suffix] = match;
    const resolved = await resolveJsSpecifier(file, specifier);
    if (resolved) {
      output = output.replace(`${prefix}${specifier}${suffix}`, `${prefix}${resolved}${suffix}`);
    }
  }

  if (output !== input) await writeFile(file, output);
}

for (const file of await walk(dist)) {
  await fixFile(file);
}
