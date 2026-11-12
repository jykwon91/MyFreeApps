import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";
import { profileApi } from "../store/profileApi";
import { tutorBaseApi } from "../store/tutorBaseApi";
import type { Profile } from "../types/tutor/profile";

const SAVED: Profile = { language_code: "es", level: "beginner", updated_at: "2026-11-12T00:00:00Z" };

vi.mock("@platform/core/store/baseQuery", () => ({
  axiosBaseQuery: async ({ method }: { method: string }) => ({ data: method === "PUT" ? SAVED : null }),
}));

describe("saveProfile", () => {
  it("has the saved profile in the cache by the time the save resolves", async () => {
    const store = configureStore({
      reducer: { [tutorBaseApi.reducerPath]: tutorBaseApi.reducer },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(tutorBaseApi.middleware),
    });
    const selectProfile = profileApi.endpoints.getProfile.select();
    await store.dispatch(profileApi.endpoints.getProfile.initiate());
    expect(selectProfile(store.getState()).data).toBeNull();

    await store.dispatch(profileApi.endpoints.saveProfile.initiate({ language_code: "es", level: "beginner" })).unwrap();

    // Read straight away, as a gate rendering after the save would: no old null left behind.
    expect(selectProfile(store.getState()).data).toEqual(SAVED);
  });
});
