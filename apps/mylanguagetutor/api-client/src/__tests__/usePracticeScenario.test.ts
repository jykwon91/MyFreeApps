// @vitest-environment jsdom
// renderHook needs a DOM; the package's own code still runs DOM-free in every other test.
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePracticeScenario } from "../hooks/usePracticeScenario";
import type { Language } from "../types/catalog/language";
import type { Scenario } from "../types/catalog/scenario";
import type { Profile } from "../types/tutor/profile";

function query<T>() {
  return { data: undefined as T | undefined, isError: false, error: undefined as unknown, refetch: vi.fn() };
}

const api = vi.hoisted(() => ({
  languages: undefined as unknown as ReturnType<typeof query<Language[]>>,
  scenarios: undefined as unknown as ReturnType<typeof query<Scenario[]>>,
  scenarioLanguage: vi.fn(),
}));

vi.mock("../store/catalogApi", () => ({
  useListLanguagesQuery: () => api.languages,
  useListScenariosQuery: (language: string) => {
    api.scenarioLanguage(language);
    return api.scenarios;
  },
}));

const PROFILE: Profile = { language_code: "es", level: "some_phrases", updated_at: "2026-11-01T00:00:00Z" };
const SPANISH: Language = { code: "es", display_name: "Spanish", dialect_label: "Latin American", stt_locale: "es-MX", tts_locale: "es-MX" };
const CAFE: Scenario = { slug: "cafe", title: "At the cafe", goal: "Order a drink.", goals: ["Order"], order: 1 };

describe("usePracticeScenario", () => {
  beforeEach(() => {
    api.languages = query<Language[]>();
    api.scenarios = query<Scenario[]>();
    api.scenarioLanguage.mockReset();
  });

  it("waits for both lists, then finds the learner's language and the scenario", () => {
    api.scenarios.data = [CAFE];
    const { result, rerender } = renderHook(() => usePracticeScenario(PROFILE, "cafe"));
    expect(api.scenarioLanguage).toHaveBeenCalledWith("es");
    expect(result.current.target).toBeUndefined();

    api.languages.data = [SPANISH];
    rerender();
    expect(result.current.target).toEqual({ language: SPANISH, scenario: CAFE });
  });

  it("is null when the scenario isn't offered", () => {
    api.languages.data = [SPANISH];
    api.scenarios.data = [CAFE];
    const { result } = renderHook(() => usePracticeScenario(PROFILE, "opera"));
    expect(result.current.target).toBeNull();
  });

  it("is null when the learner's language isn't offered", () => {
    api.languages.data = [];
    api.scenarios.data = [CAFE];
    const { result } = renderHook(() => usePracticeScenario(PROFILE, "cafe"));
    expect(result.current.target).toBeNull();
  });

  it("reports either list failing, with its error, and reloads both", async () => {
    const failure = { status: 500 };
    api.languages = { ...api.languages, isError: true, error: failure };
    const { result } = renderHook(() => usePracticeScenario(PROFILE, "cafe"));
    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBe(failure);

    await result.current.refetch();
    expect(api.languages.refetch).toHaveBeenCalledTimes(1);
    expect(api.scenarios.refetch).toHaveBeenCalledTimes(1);
  });
});
