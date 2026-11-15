import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter } from "axios";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { resumeRefinementApi } from "../store/resumeRefinementApi";

const started = { id: "new-session", status: "preparing", turns: [] };
let sentUrls: string[] = [];

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => null },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    sentUrls.push(`${config.method} ${config.url}`);
    return Promise.resolve({ data: started, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

describe("startRefinementSession", () => {
  it("puts the started session in the cache so it shows without a first fetch", async () => {
    sentUrls = [];
    const store = configureStore({
      reducer: { [resumeRefinementApi.reducerPath]: resumeRefinementApi.reducer },
      middleware: (getDefault) => getDefault().concat(resumeRefinementApi.middleware),
    });

    await store.dispatch(resumeRefinementApi.endpoints.startRefinementSession.initiate({ source_resume_job_id: "job-1" }));

    const select = resumeRefinementApi.endpoints.getRefinementSession.select("new-session");
    await vi.waitFor(() => expect(select(store.getState()).data).toEqual(started));
    expect(sentUrls).toEqual(["post /resume-refinement/sessions"]);
  });
});
