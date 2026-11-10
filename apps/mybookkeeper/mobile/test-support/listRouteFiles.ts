/// <reference types="node" />
import { readdirSync } from "fs";
import { join } from "path";

const ROUTES_DIR = join(__dirname, "..", "app", "(app)");

function walk(directory: string, prefix: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(directory, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`],
  );
}

/** Every screen file under app/(app) as its route, such as "vendors/[id]/edit", leaving out layouts. */
export function listRouteFiles(): string[] {
  return walk(ROUTES_DIR, "")
    .filter((file) => file.endsWith(".tsx") && !file.endsWith("_layout.tsx"))
    .map((file) => file.replace(/\.tsx$/, ""));
}
