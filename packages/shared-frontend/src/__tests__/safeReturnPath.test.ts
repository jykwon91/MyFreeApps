import { describe, it, expect } from "vitest";
import { safeReturnPath } from "../utils/safeReturnPath";

describe("safeReturnPath", () => {
  it("keeps an in-app path with its query and hash, as given", () => {
    expect(safeReturnPath("/scenarios?language=es#cafe")).toBe("/scenarios?language=es#cafe");
  });

  it("keeps the home path", () => {
    expect(safeReturnPath("/")).toBe("/");
  });

  it.each([
    ["a protocol-relative URL", "//evil.example"],
    ["a backslash host", "/\\evil.example"],
    ["a tab before the second slash", "/\t/evil.example"],
    ["a line feed before the second slash", "/\n/evil.example"],
    ["a carriage return before a backslash", "/\r\\evil.example"],
    ["a NUL character", "/\u0000/evil.example"],
    ["a DEL character", "/\u007F/evil.example"],
    ["an absolute URL", "https://evil.example/"],
    ["a relative path", "scenarios"],
    ["an empty string", ""],
    ["a non-string", 42],
    ["null", null],
    ["undefined", undefined],
  ])("refuses %s", (_label, value) => {
    expect(safeReturnPath(value)).toBeNull();
  });
});
