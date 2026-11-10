/// <reference types="node" />
import { readdirSync } from "fs";
import { join } from "path";

function walk(directory: string, prefix: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(directory, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`],
  );
}

/** Every route file under a directory as expo-router names it, such as "(app)/vendors/[id]/edit" or "_layout". */
export function listRouteFiles(routesDir: string): string[] {
  return walk(routesDir, "")
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => file.replace(/\.tsx$/, ""));
}
