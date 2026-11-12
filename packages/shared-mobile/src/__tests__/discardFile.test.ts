import { fakeFiles, resetFakeFiles } from "../../test-support/fakeFileSystem";
import { discardFile } from "../utils/discardFile";

jest.mock("expo-file-system", () => jest.requireActual("../../test-support/fakeFileSystem"));

describe("discardFile", () => {
  it("deletes the file, and doesn't throw when it's already gone", () => {
    resetFakeFiles(["cache:/picked.jpg", "cache:/kept.jpg"]);
    discardFile("cache:/picked.jpg");
    expect(fakeFiles()).toEqual(["cache:/kept.jpg"]);
    expect(() => discardFile("cache:/picked.jpg")).not.toThrow();
  });
});
