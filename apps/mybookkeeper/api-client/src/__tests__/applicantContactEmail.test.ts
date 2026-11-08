import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import "../store/applicantsApi";
import "../store/rentRemindersApi";
import "../store/rentReceiptsApi";
import { applicantEventLabel } from "../utils/applicantEvents";

const sent: InternalAxiosRequestConfig[] = [];

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

type Initiate = { initiate: (arg?: unknown) => Parameters<ReturnType<typeof makeStore>["dispatch"]>[0] };
const endpoints = baseApi.endpoints as unknown as Record<string, Initiate>;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => "w1" },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    sent.push(config);
    return Promise.resolve({ data: {}, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
});

describe("updateApplicantContactEmail", () => {
  it("sends the address and refreshes everything that says whether there's one", async () => {
    const store = makeStore();
    store.dispatch(endpoints.getApplicantById.initiate("a1"));
    store.dispatch(endpoints.getRentReminderOverview.initiate("a1"));
    store.dispatch(endpoints.getPendingReceipts.initiate());
    await tick();
    sent.length = 0;

    await store.dispatch(
      endpoints.updateApplicantContactEmail.initiate({ applicantId: "a1", data: { contact_email: "a@example.com" } }),
    );
    await tick();

    expect(sent[0]).toMatchObject({ method: "patch", url: "/applicants/a1/contact-email" });
    expect(JSON.parse(sent[0].data as string)).toEqual({ contact_email: "a@example.com" });
    expect(sent.slice(1).map((c) => c.url).sort()).toEqual(
      ["/applicants/a1", "/rent-receipts/pending", "/rent-reminders/tenants/a1"],
    );
  });

  it("labels the event on the applicant's history", () => {
    expect(applicantEventLabel("contact_email_changed")).toBe("Contact email updated");
  });
});
