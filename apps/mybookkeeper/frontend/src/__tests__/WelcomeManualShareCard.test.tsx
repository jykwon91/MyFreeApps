/**
 * Unit tests for WelcomeManualShareCard.
 *
 * Verifies:
 *   - Unshared state shows only the "Create share link" button.
 *   - Shared state shows the URL, PIN, copy buttons, regenerate, and revoke.
 *   - Clicking "Create share link" invokes the enable mutation.
 *   - Clicking "Revoke link" opens the confirm dialog before actually revoking.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import WelcomeManualShareCard from "@/app/features/welcome-manuals/WelcomeManualShareCard";

const enableShareMock = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const updateShareMock = vi.fn(() => ({
  unwrap: () => Promise.resolve({ share_token: "tok", share_path: "/guide/tok", share_pin: "5678" }),
}));
const revokeShareMock = vi.fn(() => ({ unwrap: () => Promise.resolve(undefined) }));

vi.mock("@/shared/lib/toast-store", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock("@/shared/store/welcomeManualsApi", () => ({
  useEnableWelcomeManualShareMutation: () => [enableShareMock, { isLoading: false }],
  useUpdateWelcomeManualShareMutation: () => [updateShareMock, { isLoading: false }],
  useRevokeWelcomeManualShareMutation: () => [revokeShareMock, { isLoading: false }],
}));

describe("WelcomeManualShareCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows only the create button when the manual is not shared", () => {
    render(<WelcomeManualShareCard manualId="m-1" shareToken={null} sharePin={null} />);
    expect(screen.getByTestId("create-share-link-button")).toBeInTheDocument();
    expect(screen.queryByTestId("share-link-url-input")).not.toBeInTheDocument();
    expect(screen.queryByTestId("revoke-share-link-button")).not.toBeInTheDocument();
  });

  it("calls the enable mutation when Create share link is clicked", () => {
    render(<WelcomeManualShareCard manualId="m-1" shareToken={null} sharePin={null} />);
    fireEvent.click(screen.getByTestId("create-share-link-button"));
    expect(enableShareMock).toHaveBeenCalledWith("m-1");
  });

  it("shows the URL, PIN, copy buttons, regenerate, and revoke once shared", () => {
    render(<WelcomeManualShareCard manualId="m-1" shareToken="tok-123" sharePin="4321" />);
    expect(screen.getByTestId("share-link-url-input")).toHaveValue(
      `${window.location.origin}/guide/tok-123`,
    );
    expect(screen.getByTestId("share-pin-input")).toHaveValue("4321");
    expect(screen.getByTestId("copy-share-link-button")).toBeInTheDocument();
    expect(screen.getByTestId("copy-share-pin-button")).toBeInTheDocument();
    expect(screen.getByTestId("regenerate-share-pin-button")).toBeInTheDocument();
    expect(screen.getByTestId("revoke-share-link-button")).toBeInTheDocument();
    expect(screen.queryByTestId("create-share-link-button")).not.toBeInTheDocument();
  });

  it("calls the regenerate mutation when Regenerate code is clicked", () => {
    render(<WelcomeManualShareCard manualId="m-1" shareToken="tok-123" sharePin="4321" />);
    fireEvent.click(screen.getByTestId("regenerate-share-pin-button"));
    expect(updateShareMock).toHaveBeenCalledWith({ manualId: "m-1", data: {} });
  });

  it("opens the confirm dialog instead of revoking immediately", () => {
    render(<WelcomeManualShareCard manualId="m-1" shareToken="tok-123" sharePin="4321" />);
    fireEvent.click(screen.getByTestId("revoke-share-link-button"));
    expect(revokeShareMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Revoke this share link\?/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(revokeShareMock).toHaveBeenCalledWith("m-1");
  });
});
