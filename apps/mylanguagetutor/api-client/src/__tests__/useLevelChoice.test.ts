// @vitest-environment jsdom
// renderHook needs a DOM; the package's own code still runs DOM-free in every other test.
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLevelChoice } from "../hooks/useLevelChoice";
import type { LevelSaveOutcome } from "../types/onboarding/level-save-outcome";
import type { Profile } from "../types/tutor/profile";

const api = vi.hoisted(() => ({
  profile: { data: undefined as Profile | null | undefined, isError: false, isFetching: false, refetch: vi.fn() },
  languages: { data: [{ code: "es" }, { code: "fr" }] as { code: string }[] | undefined, isError: false },
  save: vi.fn(),
  saveState: { isLoading: false, error: undefined as unknown, reset: vi.fn() },
}));

vi.mock("../store/catalogApi", () => ({
  useListLanguagesQuery: () => api.languages,
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
    api.profile = { ...api.profile, data: undefined, isError: false };
    api.save.mockReset();
    api.profile.refetch.mockReset();
    api.saveState = { isLoading: false, error: undefined, reset: vi.fn() };
    api.languages = { data: [{ code: "es" }, { code: "fr" }], isError: false };
    saves(Promise.resolve(PROFILE));
  });

  it("waits for the profile, then starts onboarding when there is none", () => {
    const { result, rerender } = renderHook(() => useLevelChoice(null));
    expect(result.current.isPending).toBe(true);
    expect(result.current.languageCode).toBeNull();

    api.profile = { ...api.profile, data: null, isError: false };
    rerender();
    expect(result.current.isPending).toBe(false);
    expect(result.current.isFirstTime).toBe(true);
    expect(result.current.languageCode).toBeNull();
  });

  it("offers a retry, rather than a language step, when the profile can't load and no language was chosen", async () => {
    api.profile = { ...api.profile, data: undefined, isError: true };
    const { result } = renderHook(() => useLevelChoice(null));
    expect(result.current.isPending).toBe(false);
    expect(result.current.languageCode).toBeNull();
    expect(result.current.loadFailed).toBe(true);

    await act(async () => result.current.retry());
    expect(api.profile.refetch).toHaveBeenCalledTimes(1);
  });

  it("doesn't call a profile that can't load a failure when a language was chosen", () => {
    api.profile = { ...api.profile, data: undefined, isError: true };
    const { result } = renderHook(() => useLevelChoice("es"));
    expect(result.current.loadFailed).toBe(false);
    expect(result.current.languageCode).toBe("es");
  });

  it("treats a language that isn't on offer as none, so the learner is sent back to choose one", () => {
    api.profile = { ...api.profile, data: PROFILE, isError: false };
    const { result } = renderHook(() => useLevelChoice("xx"));
    expect(result.current.languageCode).toBeNull();
    expect(result.current.isPending).toBe(false);
    expect(result.current.loadFailed).toBe(false);
  });

  it("waits for the languages before accepting a chosen language", () => {
    api.languages = { data: undefined, isError: false };
    const { result } = renderHook(() => useLevelChoice("es"));
    expect(result.current.isPending).toBe(true);
    expect(result.current.languageCode).toBeNull();
  });

  it("leaves a chosen language to the server when the languages can't load", () => {
    api.languages = { data: undefined, isError: true };
    const { result } = renderHook(() => useLevelChoice("es"));
    expect(result.current.isPending).toBe(false);
    expect(result.current.languageCode).toBe("es");
  });

  it("clears a save failure when another level is picked", () => {
    api.profile = { ...api.profile, data: PROFILE, isError: false };
    const { result } = renderHook(() => useLevelChoice(null));
    act(() => result.current.pick("beginner"));
    expect(api.saveState.reset).toHaveBeenCalledTimes(1);
    expect(result.current.selected).toBe("beginner");
  });

  it("changes the level of the learner's own language, starting from their level", () => {
    api.profile = { ...api.profile, data: PROFILE, isError: false };
    const { result } = renderHook(() => useLevelChoice(null));

    expect(result.current.languageCode).toBe("es");
    expect(result.current.selected).toBe("some_phrases");
    expect(result.current.isFirstTime).toBe(false);
  });

  it("takes the language the language step passed on over the profile's", () => {
    api.profile = { ...api.profile, data: PROFILE, isError: false };
    const { result } = renderHook(() => useLevelChoice("fr"));
    expect(result.current.languageCode).toBe("fr");
  });

  it("treats an empty language as none, even with a profile", () => {
    api.profile = { ...api.profile, data: PROFILE, isError: false };
    const { result } = renderHook(() => useLevelChoice(""));
    expect(result.current.languageCode).toBeNull();
  });

  it("saves the language and the level picked", async () => {
    api.profile = { ...api.profile, data: null, isError: false };
    const { result } = renderHook(() => useLevelChoice("es"));
    expect(result.current.selected).toBeNull();

    act(() => result.current.pick("conversational"));
    expect(result.current.selected).toBe("conversational");
    let saved: LevelSaveOutcome | undefined;
    await act(async () => {
      saved = await result.current.save();
    });

    expect(saved).toBe("saved");
    expect(api.save).toHaveBeenCalledWith({ language_code: "es", level: "conversational" });
  });

  it.each([
    ["no answer came back", { status: "FETCH_ERROR" }, "unsure"],
    ["a proxy error gave no reason", { status: 502, data: "<html>Bad Gateway</html>" }, "unsure"],
    ["the server refused it", { status: 400, data: { detail: "Bad level" } }, "failed"],
    ["the server didn't accept the language", { status: 422, data: { detail: "Unsupported language" } }, "language"],
  ])("tells a lost answer, which may have saved, from a real failure: %s", async (_case, error, expected) => {
    saves(Promise.reject(error));
    api.profile = { ...api.profile, data: PROFILE, isError: false };
    const { result } = renderHook(() => useLevelChoice(null));

    let saved: LevelSaveOutcome | undefined;
    await act(async () => {
      saved = await result.current.save();
    });
    expect(saved).toBe(expected);
  });

  it("says when the save failed", async () => {
    saves(Promise.reject({ status: 400, data: { detail: "Bad request" } }));
    api.profile = { ...api.profile, data: PROFILE, isError: false };
    const { result } = renderHook(() => useLevelChoice(null));

    let saved: LevelSaveOutcome | undefined;
    await act(async () => {
      saved = await result.current.save();
    });
    expect(saved).toBe("failed");
  });

  it("says a save a cache reset called off was cancelled, not failed", async () => {
    // RTK Query rejects a request it aborts when the cache is reset (sign-out, account change) like this.
    saves(Promise.reject({ name: "AbortError", message: "Aborted" }));
    api.profile = { ...api.profile, data: PROFILE, isError: false };
    const { result } = renderHook(() => useLevelChoice(null));

    let saved: LevelSaveOutcome | undefined;
    await act(async () => {
      saved = await result.current.save();
    });
    expect(saved).toBe("cancelled");
  });

  it("sends nothing until a level is picked", async () => {
    api.profile = { ...api.profile, data: null, isError: false };
    const { result } = renderHook(() => useLevelChoice("es"));

    let saved: LevelSaveOutcome | undefined;
    await act(async () => {
      saved = await result.current.save();
    });
    expect(saved).toBe("failed");
    expect(api.save).not.toHaveBeenCalled();
  });
});
