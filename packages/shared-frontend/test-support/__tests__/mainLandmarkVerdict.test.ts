import { describe, expect, it } from "vitest";
import { mainLandmarkVerdict } from "../mainLandmarkVerdict";

const LOGIN = "http://localhost:5173/login";
const HOME = "http://localhost:5173/";

describe("mainLandmarkVerdict", () => {
  it("passes when every app page has exactly one main landmark", () => {
    expect(mainLandmarkVerdict([{ kind: "counted", url: LOGIN, count: 1 }, { kind: "counted", url: HOME, count: 1 }])).toBeNull();
  });

  it("passes a test that ended on no app page", () => {
    expect(mainLandmarkVerdict([])).toBeNull();
  });

  it("ignores a page it skipped (closed, or off the app's origin)", () => {
    expect(mainLandmarkVerdict([{ kind: "skipped", url: LOGIN }, { kind: "counted", url: HOME, count: 1 }])).toBeNull();
  });

  it("fails a page with no main landmark, naming it and the fix", () => {
    const verdict = mainLandmarkVerdict([{ kind: "counted", url: LOGIN, count: 0 }]);

    expect(verdict).toContain("exactly one main landmark");
    expect(verdict).toContain("StandaloneLayout");
    expect(verdict).toContain('test.use({ mainLandmarkOptOut: "<why>" })');
    expect(verdict).toContain(`1. no main landmark: ${LOGIN}`);
  });

  it("fails a page with two, listing only the wrong pages", () => {
    const verdict = mainLandmarkVerdict([{ kind: "counted", url: LOGIN, count: 1 }, { kind: "counted", url: HOME, count: 2 }]);

    expect(verdict).toContain(`1. 2 main landmarks: ${HOME}`);
    expect(verdict).not.toContain(LOGIN + "\n");
    expect(verdict).not.toContain(`: ${LOGIN}`);
  });

  it("fails a page it couldn't count", () => {
    expect(mainLandmarkVerdict([{ kind: "counted", url: HOME, count: null }])).toContain(`1. couldn't count its main landmarks (the page stopped answering): ${HOME}`);
  });
});
