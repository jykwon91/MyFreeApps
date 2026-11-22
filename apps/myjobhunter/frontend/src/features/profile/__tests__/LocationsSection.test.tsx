/**
 * Unit tests for LocationsSection's remote-preference buttons.
 *
 * Covers: the chosen button shows saving and the group is switched off while the save is in flight,
 * a success toast on save, an error toast on failure, and no second save from a second click.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { REMOTE_PREFERENCE_MESSAGES } from "@myjobhunter/api-client/constants/remotePreferenceMessages";
import type { Profile } from "@myjobhunter/api-client/types/profile/profile";
import LocationsSection from "../LocationsSection";

const { updateProfile, isLoading, showSuccess, showError } = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  isLoading: { current: false },
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

// `isLoading` is flipped by the test, then the component is re-rendered, standing in for the real hook's state.
vi.mock("@myjobhunter/api-client/store/profileApi", () => ({
  useUpdateProfileMutation: () => [updateProfile, { isLoading: isLoading.current }],
}));

vi.mock("@platform/ui", () => ({ showSuccess, showError }));

const PROFILE = { locations: ["Austin, TX"], remote_preference: "any" } as unknown as Profile;

describe("LocationsSection remote preference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isLoading.current = false;
  });

  it("shows saving on the chosen button and switches the group off while the save is in flight", async () => {
    let finish: () => void = () => undefined;
    updateProfile.mockImplementation(() => {
      isLoading.current = true;
      return { unwrap: () => new Promise<void>((resolve) => { finish = resolve; }) };
    });
    const { rerender } = render(<LocationsSection profile={PROFILE} />);

    await userEvent.click(screen.getByRole("button", { name: "Hybrid" }));
    rerender(<LocationsSection profile={PROFILE} />);

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Saving…" })).toHaveAttribute("aria-pressed", "true");
    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(REMOTE_PREFERENCE_MESSAGES.saving);

    isLoading.current = false;
    await act(async () => finish());
    rerender(<LocationsSection profile={PROFILE} />);
    for (const button of screen.getAllByRole("button")) expect(button).toBeEnabled();
  });

  it("shows a success toast once saved", async () => {
    updateProfile.mockReturnValue({ unwrap: () => Promise.resolve({}) });
    render(<LocationsSection profile={PROFILE} />);

    await userEvent.click(screen.getByRole("button", { name: "Hybrid" }));

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(REMOTE_PREFERENCE_MESSAGES.saved));
    expect(showError).not.toHaveBeenCalled();
  });

  it("shows an error toast and puts the old choice back when the save fails", async () => {
    updateProfile.mockReturnValue({ unwrap: () => Promise.reject({ status: 422, data: { detail: "nope" } }) });
    render(<LocationsSection profile={PROFILE} />);

    await userEvent.click(screen.getByRole("button", { name: "Hybrid" }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith(REMOTE_PREFERENCE_MESSAGES.couldntSave));
    expect(showSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Open to all" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Hybrid" })).toHaveAttribute("aria-pressed", "false");
  });

  it("doesn't save the choice that is already saved", async () => {
    render(<LocationsSection profile={PROFILE} />);

    await userEvent.click(screen.getByRole("button", { name: "Open to all" }));

    expect(updateProfile).not.toHaveBeenCalled();
  });
});
