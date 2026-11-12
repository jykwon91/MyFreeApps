import { useToast } from "@platform/mobile";
import { nodesOfType } from "@platform/mobile/test-support/renderedNodes";
import type { RenderedNode } from "@platform/mobile/test-support/types/RenderedNode";
import { act, render, screen } from "@testing-library/react-native";
import { useEffect } from "react";
import { AppState } from "react-native";
import AppLayout from "../app/(app)/_layout";

jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("expo-router", () => {
  const MockStack = Object.assign(jest.fn(() => null), { Screen: () => null });
  return { Stack: MockStack };
});
jest.mock("../src/features/capture/useResumeUploads", () => ({ useResumeUploads: jest.fn() }));
jest.mock("../src/features/workspace/WorkspaceGate", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("../src/features/workspace/WorkspaceLostToast", () => ({ __esModule: true, default: jest.fn(() => null) }));

const TENANT_TOAST = "Reply sent to Maria Lopez";

function ShowsToast() {
  const { showToast } = useToast();
  useEffect(() => showToast(TENANT_TOAST), [showToast]);
  return null;
}

describe("the privacy cover", () => {
  afterEach(() => jest.restoreAllMocks());

  it("covers a toast that's showing when the app leaves the foreground", async () => {
    let listener: ((state: string) => void) | undefined;
    Object.defineProperty(AppState, "currentState", { value: "active", configurable: true });
    jest.spyOn(AppState, "addEventListener").mockImplementation((_type, callback) => {
      listener = callback as (state: string) => void;
      return { remove: jest.fn() };
    });
    const { default: WorkspaceLostToast } = jest.requireMock("../src/features/workspace/WorkspaceLostToast") as { default: jest.Mock };
    WorkspaceLostToast.mockImplementation(ShowsToast);

    await render(<AppLayout />);
    expect(screen.getByText(TENANT_TOAST)).toBeTruthy();
    await act(async () => listener?.("inactive"));

    // Siblings paint in order, so the cover must come after the toast to be drawn over it. This holds while
    // neither sets a zIndex or elevation; if one ever does, check paint order another way.
    const tree = screen.toJSON() as RenderedNode | RenderedNode[] | null;
    const roots = Array.isArray(tree) ? tree : [tree];
    const order = roots.flatMap((root) => nodesOfType(root, "View")).map((node) => node.props.testID);
    expect(order).toContain("toast");
    expect(order.indexOf("privacy-cover")).toBeGreaterThan(order.indexOf("toast"));
  });
});
