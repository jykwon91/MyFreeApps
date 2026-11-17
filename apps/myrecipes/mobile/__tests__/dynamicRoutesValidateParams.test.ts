import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const ROUTES_DIR = join(__dirname, "..", "app");

/** Dynamic routes whose segment is not a record id the API looks up (a client-side result id, a service name), so there is nothing to validate. */
const NOT_RECORD_IDS: readonly string[] = ["discover/[id].tsx"];

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? routeFiles(path) : [path];
  });
}

describe("dynamic routes", () => {
  const dynamicRoutes = routeFiles(ROUTES_DIR)
    .map((path) => path.slice(ROUTES_DIR.length + 1))
    .filter((path) => path.includes("[") && !NOT_RECORD_IDS.includes(path));

  it("finds the dynamic routes", () => {
    expect(dynamicRoutes.length).toBeGreaterThan(0);
  });

  it.each(dynamicRoutes)("%s validates its params before rendering the screen", (path) => {
    expect(readFileSync(join(ROUTES_DIR, path), "utf8")).toContain("<ValidRoute ");
  });
});
