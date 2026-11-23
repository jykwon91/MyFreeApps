import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ConfirmDialogProps } from "../components/ui/ConfirmDialog";
import type { UseDevicesResult } from "@platform/core/types/security/use-devices-result";

vi.mock("../hooks/useDevices", () => ({ useDevices: vi.fn() }));
vi.mock("../lib/toast-store", () => ({ showSuccess: vi.fn(), showError: vi.fn() }));
// A real dialog fades out after `open` turns false, still showing its title. This stand-in
// stays rendered when closed, so the test sees the props a closing dialog is given.
vi.mock("../components/ui/ConfirmDialog", () => ({
  default: ({ open, title, onConfirm, onCancel }: ConfirmDialogProps) => (
    <div data-open={String(open)} data-testid="confirm">
      <p>{title}</p>
      <button onClick={() => void onConfirm()}>Confirm</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

import { useDevices } from "../hooks/useDevices";
import SignedInDevices from "../components/auth/SignedInDevices";

function setUp(): void {
  const result: UseDevicesResult = {
    devices: [{ id: "p", device_name: "Pixel 9", created_at: "2026-10-01T00:00:00Z", last_used_at: "2026-10-02T00:00:00Z" }],
    hasError: false,
    reload: vi.fn().mockResolvedValue(undefined),
    signOutDevice: vi.fn().mockResolvedValue("signedOut"),
  };
  vi.mocked(useDevices).mockReturnValue(result);
  render(<SignedInDevices appName="MyJobHunter" />);
}

describe("SignedInDevices confirm dialog while closing", () => {
  it.each(["Confirm", "Cancel"])("keeps the device's name in the title after %s", async (button) => {
    setUp();
    await userEvent.click(screen.getByRole("button", { name: "Sign out Pixel 9" }));
    expect(screen.getByTestId("confirm")).toHaveAttribute("data-open", "true");
    await userEvent.click(screen.getByRole("button", { name: button }));
    expect(await screen.findByTestId("confirm")).toHaveAttribute("data-open", "false");
    expect(screen.getByTestId("confirm")).toHaveTextContent("Sign out Pixel 9?");
  });
});
