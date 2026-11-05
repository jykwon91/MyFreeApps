import { render } from "@testing-library/react-native";
import RootLayout from "../app/_layout";
import { clearDocumentFiles } from "../src/features/documents/openDocumentFile";
import { clearHeldFiles } from "../src/features/uploads/heldFile";

jest.mock("../src/features/account/RootStack", () => ({ __esModule: true, default: () => null }));
jest.mock("../src/features/documents/openDocumentFile", () => ({
  ...jest.requireActual("../src/features/documents/openDocumentFile"),
  clearDocumentFiles: jest.fn(),
}));
jest.mock("../src/features/uploads/heldFile", () => ({
  ...jest.requireActual("../src/features/uploads/heldFile"),
  clearHeldFiles: jest.fn(),
}));

describe("RootLayout", () => {
  it("removes copies of files left behind when the app was killed", async () => {
    await render(<RootLayout />);
    expect(clearDocumentFiles).toHaveBeenCalledTimes(1);
    expect(clearHeldFiles).toHaveBeenCalledTimes(1);
  });
});
