// @vitest-environment jsdom
// renderHook needs a DOM; the package's own code still runs DOM-free in every other test.
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useScenarioPath } from "../hooks/useScenarioPath";
import type { Language } from "../types/catalog/language";
import type { Scenario } from "../types/catalog/scenario";
import type { Profile } from "../types/tutor/profile";
import type { UsageToday } from "../types/tutor/usage-today";

function query<T>() {
  return { data: undefined as T | undefined, isError: false, error: undefined as unknown, refetch: vi.fn() };
}

const api = vi.hoisted(() => ({
  languages: undefined as unknown as ReturnType<typeof query<Language[]>>,
  scenarios: undefined as unknown as ReturnType<typeof query<Scenario[]>>,
  usage: undefined as unknown as ReturnType<typeof query<UsageToday>>,
  scenarioLanguage: vi.fn(),
}));

vi.mock("../store/catalogApi", () => ({
  useListLanguagesQuery: () => api.languages,
  useListScenariosQuery: (language: string) => {
    api.scenarioLanguage(language);
    return api.scenarios;
  },
}));

vi.mock("../store/usageApi", () => ({
  useGetUsageTodayQuery: () => api.usage,
}));

const PROFILE: Profile = { language_code: "es", level: "some_phrases", updated_at: "2026-11-01T00:00:00Z" };
const SPANISH: Language = { code: "es", display_name: "Spanish", dialect_label: "Latin American", stt_locale: "es-MX", tts_locale: "es-MX" };
const SCENARIOS: Scenario[] = [{ slug: "cafe", title: "At the cafe", goal: "Order a drink.", goals: ["Order"], order: 1 }];

describe("useScenarioPath", () => {
  beforeEach(() => {
    api.languages = query<Language[]>();
    api.scenarios = query<Scenario[]>();
    api.usage = query<UsageToday>();
    api.scenarioLanguage.mockReset();
  });

  it("asks for the scenarios of the learner's language", () => {
    renderHook(() => useScenarioPath(PROFILE));
    expect(api.scenarioLanguage).toHaveBeenCalledWith("es");
  });

  it("waits for both the languages and the scenarios, naming the language by its code until then", () => {
    api.scenarios.data = SCENARIOS;
    const { result, rerender } = renderHook(() => useScenarioPath(PROFILE));
    expect(result.current.scenarios).toBeUndefined();
    expect(result.current.languageName).toBe("es");

    api.languages.data = [SPANISH];
    rerender();
    expect(result.current.scenarios).toEqual(SCENARIOS);
    expect(result.current.languageName).toBe("Spanish");
  });

  it("reports either list failing, with its error", () => {
    const failure = { status: 500 };
    api.scenarios = { ...api.scenarios, isError: true, error: failure };
    const { result } = renderHook(() => useScenarioPath(PROFILE));
    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBe(failure);
  });

  it("says when today's practice is used up", () => {
    const { result, rerender } = renderHook(() => useScenarioPath(PROFILE));
    expect(result.current.isCapReached).toBe(false);

    api.usage.data = { remaining_fraction: 0, cap_reached: true, tutor_available: true };
    rerender();
    expect(result.current.isCapReached).toBe(true);
  });

  it("reloads the catalog and today's usage together", async () => {
    const { result } = renderHook(() => useScenarioPath(PROFILE));
    await result.current.refetch();
    expect(api.languages.refetch).toHaveBeenCalledTimes(1);
    expect(api.scenarios.refetch).toHaveBeenCalledTimes(1);
    expect(api.usage.refetch).toHaveBeenCalledTimes(1);
  });
});
