import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { baseApi } from "@platform/core/store/baseApi";
import { ONBOARDING_COPY } from "@mylanguagetutor/api-client/constants/onboardingCopy";
import type { Profile } from "@mylanguagetutor/api-client/types/tutor/profile";
import OnboardingLevel from "@/pages/OnboardingLevel";
import Scenarios from "@/pages/Scenarios";
import LocationLog from "@/test/LocationLog";

const server = vi.hoisted(() => ({ profile: null as Profile | null }));

// The real store and endpoints, with the server faked under them, so the save and the gate after it
// run through RTK Query's own cache.
vi.mock("@platform/core/store/baseQuery", () => ({
  axiosBaseQuery: async ({ url, method, data }: { url: string; method: string; data?: unknown }) => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    if (url === "/profile" && method === "PUT") {
      server.profile = { ...(data as Pick<Profile, "language_code" | "level">), updated_at: "2026-11-12T00:00:00Z" };
      return { data: server.profile };
    }
    if (url === "/profile") return { data: server.profile };
    if (url === "/languages") {
      return { data: [{ code: "es", display_name: "Spanish", dialect_label: "Latin American", stt_locale: "es-MX", tts_locale: "es-MX" }] };
    }
    if (url === "/scenarios") return { data: [] };
    if (url === "/usage/today") return { data: { remaining_fraction: 1, cap_reached: false, tutor_available: true } };
    return { error: { status: 404, data: {} } };
  },
}));

describe("saving the level", () => {
  it("opens the scenarios without passing back through the language step", async () => {
    const store = configureStore({
      reducer: { [baseApi.reducerPath]: baseApi.reducer },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware),
    });
    const visited: string[] = [];
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/onboarding/level?language=es"]}>
          <LocationLog visited={visited} />
          <Routes>
            <Route path="/onboarding/level" element={<OnboardingLevel />} />
            <Route path="/onboarding/language" element={<p>Language step</p>} />
            <Route path="/scenarios" element={<Scenarios />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    // The step count shows once the profile has loaded as "not onboarded yet".
    expect(await screen.findByText(ONBOARDING_COPY.levelStep)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Just starting/ }));
    fireEvent.click(screen.getByRole("button", { name: ONBOARDING_COPY.continue }));

    expect(await screen.findByRole("heading", { name: "Practice Spanish" })).toBeInTheDocument();
    expect(visited).toContain("/scenarios");
    expect(visited).not.toContain("/onboarding/language");
  });
});
