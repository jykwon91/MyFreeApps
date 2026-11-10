/// <reference types="node" />
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { listRouteFiles } from "../../test-support/listRouteFiles";

describe("listRouteFiles", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "routes-"));
    for (const file of ["_layout.tsx", "sign-in.tsx", "(app)/_layout.tsx", "(app)/vendors/[id]/edit.tsx", "(app)/notes.md"]) {
      mkdirSync(join(root, file, ".."), { recursive: true });
      writeFileSync(join(root, file), "");
    }
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("names every route file the way expo-router does, layouts included, and nothing else", () => {
    expect(listRouteFiles(root).sort()).toEqual(["(app)/_layout", "(app)/vendors/[id]/edit", "_layout", "sign-in"]);
  });
});
