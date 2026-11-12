import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOG_COPY } from "@mylanguagetutor/api-client/constants/catalogCopy";
import { ONBOARDING_COPY } from "@mylanguagetutor/api-client/constants/onboardingCopy";
import type { Language } from "@mylanguagetutor/api-client/types/catalog/language";
import OnboardingLanguage from "@/pages/OnboardingLanguage";

const refetch = vi.fn();
let languages: { data: Language[] | undefined; isError: boolean };

vi.mock("@mylanguagetutor/api-client/store/catalogApi", () => ({
  useListLanguagesQuery: () => ({ ...languages, refetch }),
}));

const SPANISH: Language = {
  code: "es",
  display_name: "Spanish",
  dialect_label: "Latin American",
  stt_locale: "es-MX",
  tts_locale: "es-MX",
};

function page() {
  return (
    <MemoryRouter initialEntries={["/onboarding/language"]}>
      <Routes>
        <Route path="/onboarding/language" element={<OnboardingLanguage />} />
        <Route path="/onboarding/level" element={<p>Level step</p>} />
      </Routes>
    </MemoryRouter>
  );
}

function renderPage() {
  return render(page());
}

describe("OnboardingLanguage page", () => {
  beforeEach(() => {
    refetch.mockReset();
    languages = { data: undefined, isError: false };
  });

  it("shows a placeholder while the languages load, then lists them", () => {
    const { rerender } = renderPage();
    expect(screen.getByText(ONBOARDING_COPY.languageStep)).toBeInTheDocument();
    expect(screen.getByLabelText("Loading")).toHaveAttribute("aria-busy", "true");

    languages = { data: [SPANISH], isError: false };
    rerender(page());
    expect(screen.queryByLabelText("Loading")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Spanish/ })).toBeInTheDocument();
  });

  it("goes on to the level step with the language chosen", () => {
    languages = { data: [SPANISH], isError: false };
    renderPage();

    const spanish = screen.getByRole("link", { name: /Spanish/ });
    expect(spanish).toHaveAttribute("href", "/onboarding/level?language=es");
    fireEvent.click(spanish);
    expect(screen.getByText("Level step")).toBeInTheDocument();
  });

  it("says so when no languages are available yet", () => {
    languages = { data: [], isError: false };
    renderPage();
    expect(screen.getByText(CATALOG_COPY.noLanguages)).toBeInTheDocument();
  });

  it("says when the languages can't load, and tries again", () => {
    languages = { data: undefined, isError: true };
    renderPage();

    expect(screen.getByText(CATALOG_COPY.loadFailed)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: CATALOG_COPY.retry }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
