/** An upload still being read: the panel says so, polls, and offers the resume once it is read. */
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import { act, render, screen } from "@testing-library/react";
import type { AxiosAdapter } from "axios";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { RESUME_JOBS_POLL_INTERVAL_MS } from "@myjobhunter/api-client/constants/resumeJobsPolling";
import "@myjobhunter/api-client/store/resumesApi";
import SessionStartPanel from "../SessionStartPanel";

vi.mock("@/features/resume_refinement/ResumeJobOption", () => ({
  default: () => <div>pick resume</div>,
}));

let jobStatus = "processing";
let listRequests = 0;

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => null },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    listRequests += 1;
    return Promise.resolve({ data: [{ id: "job-1", status: jobStatus }], status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

describe("SessionStartPanel while an upload is being read", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    jobStatus = "processing";
    listRequests = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the reading state, then the resume once the upload finishes", async () => {
    const store = configureStore({
      reducer: { [baseApi.reducerPath]: baseApi.reducer },
      middleware: (getDefault) => getDefault().concat(baseApi.middleware),
    });
    render(
      <Provider store={store}>
        <MemoryRouter><SessionStartPanel onSessionStarted={vi.fn()} /></MemoryRouter>
      </Provider>,
    );

    expect(await screen.findByText("Reading your resume")).toBeInTheDocument();
    expect(screen.queryByText("Upload a resume first")).toBeNull();

    jobStatus = "complete";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESUME_JOBS_POLL_INTERVAL_MS + 100);
    });

    expect(await screen.findByText("pick resume")).toBeInTheDocument();
    expect(screen.queryByText("Reading your resume")).toBeNull();
    expect(listRequests).toBeGreaterThanOrEqual(2);
  });
});
