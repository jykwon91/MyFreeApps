import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SignedInDevice } from "@platform/core/types/security/signed-in-device";
import type { UseDevicesResult } from "@platform/core/types/security/use-devices-result";

vi.mock("../hooks/useDevices", () => ({ useDevices: vi.fn() }));
vi.mock("../lib/toast-store", () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

import { useDevices } from "../hooks/useDevices";
import SignedInDevices from "../components/auth/SignedInDevices";
import { showError, showSuccess } from "../lib/toast-store";

const PIXEL: SignedInDevice = { id: "p", device_name: "Pixel 9", created_at: "2026-10-01T00:00:00Z", last_used_at: "2026-10-02T00:00:00Z" };
const IPHONE: SignedInDevice = { id: "i", device_name: null, created_at: "2026-10-01T00:00:00Z", last_used_at: "2026-10-05T00:00:00Z" };

function setUp(overrides: Partial<UseDevicesResult> = {}): UseDevicesResult {
  const result: UseDevicesResult = {
    devices: [PIXEL, IPHONE],
    hasError: false,
    reload: vi.fn().mockResolvedValue(undefined),
    signOutDevice: vi.fn().mockResolvedValue("signedOut"),
    ...overrides,
  };
  vi.mocked(useDevices).mockReturnValue(result);
  render(<SignedInDevices appName="MyJobHunter" />);
  return result;
}

async function confirmSignOut(name: string): Promise<void> {
  await userEvent.click(screen.getByRole("button", { name: `Sign out ${name}` }));
  const dialog = await screen.findByRole("dialog", { name: `Sign out ${name}?` });
  await userEvent.click(within(dialog).getByRole("button", { name: "Sign out" }));
}

describe("SignedInDevices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the list when shown and lists the most recently used first", () => {
    const devices = setUp();
    expect(devices.reload).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/signed in to your MyJobHunter account/)).toBeInTheDocument();
    const names = within(screen.getByRole("list", { name: "Devices signed in" }))
      .getAllByRole("listitem")
      .map((row) => row.querySelector("p")?.textContent);
    expect(names).toEqual(["Unknown device", "Pixel 9"]);
  });

  it("shows a skeleton while the first list loads", () => {
    setUp({ devices: null });
    expect(screen.getAllByTestId("device-skeleton")).toHaveLength(2);
    expect(screen.queryByText("No phones signed in")).not.toBeInTheDocument();
  });

  it("says so when no phone is signed in", () => {
    setUp({ devices: [] });
    expect(screen.getByText("No phones signed in")).toBeInTheDocument();
  });

  it("offers a retry when the list won't load", async () => {
    const devices = setUp({ devices: null, hasError: true });
    expect(screen.getByText("Couldn't load your devices. Check your connection and try again.")).toBeInTheDocument();
    expect(screen.queryByTestId("device-skeleton")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(devices.reload).toHaveBeenCalledTimes(2);
  });

  it("asks first, then signs the device out and says so", async () => {
    const devices = setUp();
    await userEvent.click(screen.getByRole("button", { name: "Sign out Pixel 9" }));
    const dialog = await screen.findByRole("dialog", { name: "Sign out Pixel 9?" });
    expect(within(dialog).getByText(/can stay signed in for up to 30 minutes/)).toBeInTheDocument();
    expect(devices.signOutDevice).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Sign out" }));
    expect(devices.signOutDevice).toHaveBeenCalledWith("p");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(showSuccess).toHaveBeenCalledWith("Signed out Pixel 9. It may stay signed in for up to 30 minutes.");
  });

  it("does nothing when the user cancels", async () => {
    const devices = setUp();
    await userEvent.click(screen.getByRole("button", { name: "Sign out Pixel 9" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(devices.signOutDevice).not.toHaveBeenCalled();
  });

  it("names the device it was opened for when asked again for another", async () => {
    setUp();
    await userEvent.click(screen.getByRole("button", { name: "Sign out Pixel 9" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Sign out Unknown device" }));
    expect(await screen.findByRole("dialog", { name: "Sign out Unknown device?" })).toBeInTheDocument();
  });

  it("shows the confirm button busy while signing out", async () => {
    let finish: (value: "signedOut") => void = () => undefined;
    setUp({ signOutDevice: vi.fn(() => new Promise<"signedOut">((resolve) => { finish = resolve; })) });
    await confirmSignOut("Pixel 9");
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: /Processing/ })).toBeDisabled();
    finish("signedOut");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("calls a device that was already gone a success", async () => {
    setUp({ signOutDevice: vi.fn().mockResolvedValue("alreadyGone") });
    await confirmSignOut("Pixel 9");
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith("That device was already signed out."));
  });

  it("says it isn't sure when the answer was lost", async () => {
    setUp({ signOutDevice: vi.fn().mockResolvedValue("unsure") });
    await confirmSignOut("Pixel 9");
    await waitFor(() =>
      expect(showError).toHaveBeenCalledWith("I didn't get an answer, so I'm not sure Pixel 9 was signed out. Trying again is safe."),
    );
  });

  it("says it couldn't when signing out fails", async () => {
    setUp({ signOutDevice: vi.fn().mockRejectedValue(new Error("refused")) });
    await confirmSignOut("Pixel 9");
    await waitFor(() => expect(showError).toHaveBeenCalledWith("Couldn't sign out Pixel 9. Check your connection and try again."));
    expect(showSuccess).not.toHaveBeenCalled();
  });
});
