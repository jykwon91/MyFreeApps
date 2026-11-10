import { render, screen } from "@testing-library/react-native";
import Constants from "expo-constants";
import AppVersion from "../components/AppVersion";

jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "1.2.3" } } }));

describe("AppVersion", () => {
  it("shows the version this phone runs", async () => {
    await render(<AppVersion />);
    expect(screen.getByText("Version 1.2.3")).toBeTruthy();
  });

  it("shows nothing when the build has no version", async () => {
    Constants.expoConfig = null;
    await render(<AppVersion />);
    expect(screen.queryByText(/Version/)).toBeNull();
  });
});
