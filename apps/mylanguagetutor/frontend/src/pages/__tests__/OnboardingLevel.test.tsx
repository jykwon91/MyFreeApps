import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOG_COPY } from "@mylanguagetutor/api-client/constants/catalogCopy";
import { ONBOARDING_COPY } from "@mylanguagetutor/api-client/constants/onboardingCopy";
import type { Profile } from "@mylanguagetutor/api-client/types/tutor/profile";
import type { ProfileUpdate } from "@mylanguagetutor/api-client/types/tutor/profile-update";
import OnboardingLevel from "@/pages/OnboardingLevel";

const save = vi.fn<(update: ProfileUpdate) => Promise<Profile>>();
const refetch = vi.fn();
let profile: { data: Profile | null | undefined; isError: boolean; isFetching: boolean; refetch: () => void };

vi.mock("@mylanguagetutor/api-client/store/catalogApi", () => ({
  useListLanguagesQuery: () => ({ data: [{ code: "es" }], isError: false }),
}));

vi.mock("@mylanguagetutor/api-client/store/profileApi", async () => {
  const { useState } = await import("react");
  return {
    useGetProfileQuery: () => profile,
    // Holds the save's failure in state, as RTK Query does, so the page re-renders with it.
    useSaveProfileMutation: () => {
      const [error, setError] = useState<unknown>(undefined);
      const trigger = (update: ProfileUpdate) => ({
        unwrap: () =>
          save(update).then(
            (saved) => {
              setError(undefined);
              return saved;
            },
            (failure: unknown) => {
              setError(failure);
              throw failure;
            },
          ),
      });
      return [trigger, { isLoading: false, error, reset: () => setError(undefined) }];
    },
  };
});

const PROFILE: Profile = { language_code: "es", level: "some_phrases", updated_at: "2026-11-01T00:00:00Z" };

function renderPage(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/onboarding/level" element={<OnboardingLevel />} />
        <Route path="/onboarding/language" element={<p>Language step</p>} />
        <Route path="/scenarios" element={<p>Scenarios</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OnboardingLevel page", () => {
  beforeEach(() => {
    save.mockReset();
    refetch.mockReset();
    profile = { data: null, isError: false, isFetching: false, refetch };
  });

  it("asks a new learner for their level, then saves it and opens the scenarios", async () => {
    save.mockImplementation(async (update) => ({ ...update, updated_at: PROFILE.updated_at }));
    renderPage("/onboarding/level?language=es");

    expect(screen.getByText(ONBOARDING_COPY.levelStep)).toBeInTheDocument();
    const continueButton = screen.getByRole("button", { name: ONBOARDING_COPY.continue });
    expect(continueButton).toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: /Just starting/ }));
    fireEvent.click(continueButton);

    expect(await screen.findByText("Scenarios")).toBeInTheDocument();
    expect(save).toHaveBeenCalledWith({ language_code: "es", level: "beginner" });
  });

  it("changes the level of the learner's language, starting from their level", async () => {
    profile = { data: PROFILE, isError: false, isFetching: false, refetch };
    save.mockResolvedValue({ ...PROFILE, level: "conversational" });
    renderPage("/onboarding/level");

    expect(screen.queryByText(ONBOARDING_COPY.levelStep)).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /I know some phrases/ })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /I can hold a conversation/ }));
    fireEvent.click(screen.getByRole("button", { name: ONBOARDING_COPY.continue }));

    expect(await screen.findByText("Scenarios")).toBeInTheDocument();
    expect(save).toHaveBeenCalledWith({ language_code: "es", level: "conversational" });
  });

  it("waits for the profile before deciding there's no language", () => {
    profile = { data: undefined, isError: false, isFetching: false, refetch };
    renderPage("/onboarding/level");
    expect(screen.getByRole("status")).toHaveTextContent("Loading your level");
  });

  it("offers a retry when the saved profile can't load and no language was chosen, instead of the language step", () => {
    profile = { data: undefined, isError: true, isFetching: false, refetch };
    renderPage("/onboarding/level");

    expect(screen.queryByText("Language step")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: CATALOG_COPY.retry }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("sends a language that isn't on offer back to the language step instead of trying to save it", () => {
    renderPage("/onboarding/level?language=xx");
    expect(screen.getByText("Language step")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it.each(["/onboarding/level", "/onboarding/level?language="])("sends %s back to the language step", (url) => {
    renderPage(url);
    expect(screen.getByText("Language step")).toBeInTheDocument();
  });

  it("doesn't call a save whose answer was lost a failure, and says trying again is safe", async () => {
    save.mockRejectedValueOnce({ status: "FETCH_ERROR", error: "TypeError: Failed to fetch" });
    renderPage("/onboarding/level?language=es");

    fireEvent.click(screen.getByRole("radio", { name: /I can hold a conversation/ }));
    fireEvent.click(screen.getByRole("button", { name: ONBOARDING_COPY.continue }));

    expect(await screen.findByText(ONBOARDING_COPY.saveUnsure)).toBeInTheDocument();
    expect(screen.queryByText(ONBOARDING_COPY.saveFailed)).not.toBeInTheDocument();
  });

  it("says when the level couldn't be saved, keeps the choice, and saves on a second try", async () => {
    save.mockRejectedValueOnce({ status: 400, data: { detail: "Bad request" } }).mockImplementation(async (update) => ({ ...update, updated_at: PROFILE.updated_at }));
    renderPage("/onboarding/level?language=es");

    fireEvent.click(screen.getByRole("radio", { name: /I can hold a conversation/ }));
    fireEvent.click(screen.getByRole("button", { name: ONBOARDING_COPY.continue }));

    expect(await screen.findByText(ONBOARDING_COPY.saveFailed)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /I can hold a conversation/ })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: ONBOARDING_COPY.continue }));
    await waitFor(() => expect(screen.getByText("Scenarios")).toBeInTheDocument());
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("tells the learner to choose a language again when the server doesn't accept the one they had", async () => {
    save.mockRejectedValueOnce({ status: 422, data: { detail: "Unsupported language" } });
    renderPage("/onboarding/level?language=es");

    fireEvent.click(screen.getByRole("radio", { name: /I can hold a conversation/ }));
    fireEvent.click(screen.getByRole("button", { name: ONBOARDING_COPY.continue }));

    expect(await screen.findByText(ONBOARDING_COPY.saveBadLanguage)).toBeInTheDocument();
    expect(screen.queryByText(ONBOARDING_COPY.saveFailed)).not.toBeInTheDocument();
  });

  it("takes the save error down as soon as another level is picked", async () => {
    save.mockRejectedValueOnce({ status: 400, data: { detail: "Bad request" } });
    renderPage("/onboarding/level?language=es");

    fireEvent.click(screen.getByRole("radio", { name: /I can hold a conversation/ }));
    fireEvent.click(screen.getByRole("button", { name: ONBOARDING_COPY.continue }));
    expect(await screen.findByText(ONBOARDING_COPY.saveFailed)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /Just starting/ }));
    expect(screen.queryByText(ONBOARDING_COPY.saveFailed)).not.toBeInTheDocument();
  });
});
