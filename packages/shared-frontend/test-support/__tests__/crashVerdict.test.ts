import { describe, expect, it } from "vitest";
import { crashVerdict } from "../crashVerdict";

const CAUGHT = "caught by PageErrorBoundary: TypeError: Cannot convert undefined or null to object\n    at Dashboard";
const TAB = "tab crashed: http://localhost:5173/";

describe("crashVerdict", () => {
  it("passes a test with no crashes", () => {
    expect(crashVerdict([], false)).toBeNull();
  });

  it("fails a test with crashes by default, listing every one", () => {
    const verdict = crashVerdict([CAUGHT, TAB], false);

    expect(verdict).not.toBeNull();
    expect(verdict).toContain("The page crashed.");
    expect(verdict).toContain("test.use({ allowCrashes: true })");
    expect(verdict).toContain(`1. ${CAUGHT}`);
    expect(verdict).toContain(`2. ${TAB}`);
  });

  it("passes a test with crashes when it allows them", () => {
    expect(crashVerdict([CAUGHT, TAB], true)).toBeNull();
  });

  it("passes a test that allows crashes and had none", () => {
    expect(crashVerdict([], true)).toBeNull();
  });
});
