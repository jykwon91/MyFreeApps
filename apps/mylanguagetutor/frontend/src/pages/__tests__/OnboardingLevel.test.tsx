import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ONBOARDING_COPY } from "@mylanguagetutor/api-client/constants/onboardingCopy";
import type { Profile } from "@mylanguagetutor/api-client/types/tutor/profile";
import type { ProfileUpdate } from "@mylanguagetutor/api-client/types/tutor/profile-update";
import OnboardingLevel from "@/pages/OnboardingLevel";

const save = vi.fn<(update: ProfileUpdate) => Promise<Profile>>();
let profile: { data: Profile | null | undefined; isError: boolean };

vi.mock("@mylanguagetutor/api-client/store/profileApi", async () => {
  const { useState } = await import("react");
  return {
    useGetProfileQuery: () => profile,
    // Holds the save's failure in state, as RTK Query does, so the page re-renders with it.
    useSaveProfileMutation: () => {
      const [isError, setIsError] = useState(false);
      const trigger = (update: ProfileUpdate) => ({
        unwrap: () =>
          save(update).then(
            (saved) => {
              setIsError(false);
              return saved;
            },
            (error: unknown) => {
              setIsError(true);
              throw error;
            },
          ),
      });
      return [trigger, { isLoading: false, isError }];
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
    profile = { data: null, isError: false };
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
    profile = { data: PROFILE, isError: false };
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
    profile = { data: undefined, isError: false };
    renderPage("/onboarding/level");
    expect(screen.getByLabelText("Loading")).toHaveAttribute("aria-busy", "true");
  });

  it.each(["/onboarding/level", "/onboarding/level?language="])("sends %s back to the language step", (url) => {
    renderPage(url);
    expect(screen.getByText("Language step")).toBeInTheDocument();
  });

  it("says when the level couldn't be saved, keeps the choice, and saves on a second try", async () => {
    save.mockRejectedValueOnce(new Error("down")).mockImplementation(async (update) => ({ ...update, updated_at: PROFILE.updated_at }));
    renderPage("/onboarding/level?language=es");

    fireEvent.click(screen.getByRole("radio", { name: /I can hold a conversation/ }));
    fireEvent.click(screen.getByRole("button", { name: ONBOARDING_COPY.continue }));

    expect(await screen.findByText(ONBOARDING_COPY.saveFailed)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /I can hold a conversation/ })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: ONBOARDING_COPY.continue }));
    await waitFor(() => expect(screen.getByText("Scenarios")).toBeInTheDocument());
    expect(save).toHaveBeenCalledTimes(2);
  });
});
