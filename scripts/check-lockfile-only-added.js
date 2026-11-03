#!/usr/bin/env node
// Fails if generating a mobile app changed any locked package other than its own.
// Usage: check-lockfile-only-added.js <before.json> <after.json> <app-slug>
const fs = require("node:fs");

const [beforePath, afterPath, slug] = process.argv.slice(2);
const read = (path) => JSON.parse(fs.readFileSync(path, "utf8")).packages;
const before = read(beforePath);
const after = read(afterPath);

const appDir = `apps/${slug}/mobile`;
const belongsToApp = (key) =>
  key === `node_modules/${slug}-mobile` || key === appDir || key.startsWith(`${appDir}/`);

const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
  (key) =>
    key !== "" && // The root entry lists workspaces.
    !belongsToApp(key) &&
    JSON.stringify(before[key]) !== JSON.stringify(after[key]),
);

if (changed.length > 0) {
  console.error(`Generating ${slug} changed locked packages:\n${changed.join("\n")}`);
  process.exit(1);
}
