import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import "../store/educationApi";
import { resumesApi } from "../store/resumesApi";
import "../store/skillsApi";
import "../store/workHistoryApi";
import type { ResumeUploadJob } from "../types/resume-upload-job/resume-upload-job";
import type { ResumeUploadJobStatus } from "../types/resume-upload-job/resume-upload-job-status";
import { resumeUploadJob } from "./support/resumeUploadJob";

const sent: InternalAxiosRequestConfig[] = [];
let jobStatus: ResumeUploadJobStatus = "processing";

const job = (): ResumeUploadJob => resumeUploadJob({ id: "j1", status: jobStatus });

type Initiate = { initiate: () => Parameters<ReturnType<typeof makeStore>["dispatch"]>[0] };
const profileEndpoints = baseApi.endpoints as unknown as Record<"listWorkHistory" | "listEducation" | "listSkills", Initiate>;

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => null },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    sent.push(config);
    const url = String(config.url);
    const data = url === "/resume-upload-jobs" ? [job()] : url.startsWith("/resume-upload-jobs/") ? job() : { items: [], total: 0 };
    return Promise.resolve({ data, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
  jobStatus = "processing";
});

const loads = (url: string) => sent.filter((config) => config.method === "get" && String(config.url) === url).length;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function storeShowingProfile() {
  const store = makeStore();
  await store.dispatch(profileEndpoints.listWorkHistory.initiate());
  await store.dispatch(profileEndpoints.listEducation.initiate());
  await store.dispatch(profileEndpoints.listSkills.initiate());
  return store;
}

const profileLoads = () => [loads("/work-history"), loads("/education"), loads("/skills")];

describe("the profile lists after a resume finishes parsing", () => {
  it("refetch when a polled upload list turns a job complete", async () => {
    const store = await storeShowingProfile();
    await store.dispatch(resumesApi.endpoints.listResumeJobs.initiate());
    expect(profileLoads()).toEqual([1, 1, 1]);

    jobStatus = "complete";
    await store.dispatch(resumesApi.endpoints.listResumeJobs.initiate(undefined, { forceRefetch: true }));
    await settle();

    expect(profileLoads()).toEqual([2, 2, 2]);
  });

  it("refetch when a polled single job turns complete", async () => {
    const store = await storeShowingProfile();
    await store.dispatch(resumesApi.endpoints.getResumeJob.initiate("j1"));

    jobStatus = "complete";
    await store.dispatch(resumesApi.endpoints.getResumeJob.initiate("j1", { forceRefetch: true }));
    await settle();

    expect(profileLoads()).toEqual([2, 2, 2]);
  });

  it("stay as they are when a poll finds no newly completed job", async () => {
    const store = await storeShowingProfile();
    await store.dispatch(resumesApi.endpoints.listResumeJobs.initiate());
    await store.dispatch(resumesApi.endpoints.listResumeJobs.initiate(undefined, { forceRefetch: true }));

    jobStatus = "complete";
    await store.dispatch(resumesApi.endpoints.getResumeJob.initiate("j1"));
    await settle();

    expect(profileLoads()).toEqual([1, 1, 1]);
  });
});
