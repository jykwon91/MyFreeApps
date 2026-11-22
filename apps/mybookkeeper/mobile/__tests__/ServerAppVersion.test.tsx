import { render, screen } from "@testing-library/react-native";
import { useGetVersionQuery } from "@mybookkeeper/api-client/store/versionApi";
import ServerAppVersion from "../src/features/more/ServerAppVersion";

jest.mock("expo-constants", () => ({ expoConfig: { version: "1.0.0" } }));
jest.mock("@mybookkeeper/api-client/store/versionApi", () => ({ useGetVersionQuery: jest.fn() }));

const mockQuery = (value: { data?: { commit: string; timestamp: string }; isLoading: boolean }) =>
  jest.mocked(useGetVersionQuery).mockReturnValue(value as unknown as ReturnType<typeof useGetVersionQuery>);

describe("ServerAppVersion", () => {
  it("shows the server build beside the app build", async () => {
    mockQuery({ data: { commit: "d8ae75e", timestamp: "2026-04-02T00:00:00+00:00" }, isLoading: false });
    await render(<ServerAppVersion />);
    expect(screen.getByText("Version 1.0.0")).toBeTruthy();
    expect(screen.getByText("Server v.d8ae75e")).toBeTruthy();
  });

  it("holds the server build's place while it loads", async () => {
    mockQuery({ isLoading: true });
    await render(<ServerAppVersion />);
    expect(screen.getByTestId("server-version-skeleton", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText("Version 1.0.0")).toBeTruthy();
  });

  it("keeps only the app build when the request fails", async () => {
    mockQuery({ isLoading: false });
    await render(<ServerAppVersion />);
    expect(screen.getByText("Version 1.0.0")).toBeTruthy();
    expect(screen.queryByText(/Server v\./)).toBeNull();
    expect(screen.queryByTestId("server-version-skeleton", { includeHiddenElements: true })).toBeNull();
  });

  it("hides an unknown server build, as the web does", async () => {
    mockQuery({ data: { commit: "unknown", timestamp: "" }, isLoading: false });
    await render(<ServerAppVersion />);
    expect(screen.queryByText(/Server v\./)).toBeNull();
  });
});
