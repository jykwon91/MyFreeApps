import { onAccountLeft } from "@platform/mobile";
import { fakeFiles, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import { render } from "@testing-library/react-native";
import RootLayout from "../app/_layout";

jest.mock("@platform/mobile", () => ({
  ...jest.requireActual("@platform/mobile"),
  onAccountLeft: jest.fn(),
}));
jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("../src/features/account/RootStack", () => ({ __esModule: true, default: () => null }));

// The whole workspace, as the Security screen's export downloads it.
const LEFT_BEHIND = "cache:/exports/mybookkeeper-export-2026-11-11T09-30-00.json";
const accountLeft = jest.mocked(onAccountLeft).mock.calls[0]![1];

describe("a data export left on the phone", () => {
  it("is removed at launch, in case the app was killed while it was open", async () => {
    resetFakeFiles([LEFT_BEHIND, "cache:/other/keep.txt"]);
    await render(<RootLayout />);
    expect(fakeFiles()).toEqual(["cache:/other/keep.txt"]);
  });

  it("goes when the account leaves the phone", () => {
    resetFakeFiles([LEFT_BEHIND]);
    accountLeft();
    expect(fakeFiles()).toEqual([]);
  });
});
