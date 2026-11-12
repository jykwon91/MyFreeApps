// @vitest-environment jsdom
// renderHook needs a DOM; the package's own code still runs DOM-free in every other test.
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLevelChoice } from "../hooks/useLevelChoice";
import type { Profile } from "../types/tutor/profile";

const api = vi.hoisted(() => ({
  profile: { data: undefined as Profile | null | undefined, isError: false },
  save: vi.fn(),
  saveState: { isLoading: false, isError: false },
}));

vi.mock("../store/profileApi", () => ({
  useGetProfileQuery: () => api.profile,
  useSaveProfileMutation: () => [api.save, api.saveState],
}));

const PROFILE: Profile = { language_code: "es", level: "some_phrases", updated_at: "2026-11-01T00:00:00Z" };

function saves(outcome: Promise<Profile>): void {
  api.save.mockReturnValue({ unwrap: () => outcome });
}

describe("useLevelChoice", () => {
  beforeEach(() => {
    api.profile = { data: undefined, isError: false };
    api.save.mockReset();
    saves(Promise.resolve(PROFILE));
  });

  it("waits for the profile, then starts onboarding when there is none", () => {
    const { result, rerender } = renderHook(() => useLevelChoice(null));
    expect(result.current.isProfilePending).toBe(true);
    expect(result.current.languageCode).toBeNull();

    api.profile = { data: null, isError: false };
    rerender();
    expect(result.current.isProfilePending).toBe(false);
    expect(result.current.isFirstTime).toBe(true);
    expect(result.current.languageCode).toBeNull();
  });

  it("stops waiting when the profile can't load", () => {
    api.profile = { data: undefined, isError: true };
    const { result } = renderHook(() => useLevelChoice(null));
    expect(result.current.isProfilePending).toBe(false);
  });

  it("changes the level of the learner's own language, starting from their level", () => {
    api.profile = { data: PROFILE, isError: false };
    const { result } = renderHook(() => useLevelChoice(null));

    expect(result.current.languageCode).toBe("es");
    expect(result.current.selected).toBe("some_phrases");
    expect(result.current.isFirstTime).toBe(false);
  });

  it("takes the language the language step passed on over the profile's", () => {
    api.profile = { data: PROFILE, isError: false };
    const { result } = renderHook(() => useLevelChoice("fr"));
    expect(result.current.languageCode).toBe("fr");
  });

  it("treats an empty language as none, even with a profile", () => {
    api.profile = { data: PROFILE, isError: false };
    const { result } = renderHook(() => useLevelChoice(""));
    expect(result.current.languageCode).toBeNull();
  });

  it("saves the language and the level picked", async () => {
    api.profile = { data: null, isError: false };
    const { result } = renderHook(() => useLevelChoice("es"));
    expect(result.current.selected).toBeNull();

    act(() => result.current.pick("conversational"));
    expect(result.current.selected).toBe("conversational");
    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.save();
    });

    expect(saved).toBe(true);
    expect(api.save).toHaveBeenCalledWith({ language_code: "es", level: "conversational" });
  });

  it("says when the save failed", async () => {
    saves(Promise.reject(new Error("down")));
    api.profile = { data: PROFILE, isError: false };
    const { result } = renderHook(() => useLevelChoice(null));

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.save();
    });
    expect(saved).toBe(false);
  });

  it("sends nothing until a level is picked", async () => {
    api.profile = { data: null, isError: false };
    const { result } = renderHook(() => useLevelChoice("es"));

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.save();
    });
    expect(saved).toBe(false);
    expect(api.save).not.toHaveBeenCalled();
  });
});
