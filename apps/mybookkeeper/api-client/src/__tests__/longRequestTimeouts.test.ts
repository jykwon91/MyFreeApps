import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  EXPORT_REQUEST_TIMEOUT_MS,
  MODEL_REQUEST_TIMEOUT_MS,
  UPLOAD_REQUEST_TIMEOUT_MS,
} from "@platform/core/constants/requestTimeouts";
import api from "@platform/core/lib/api";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GMAIL_SYNC_TIMEOUT_MS } from "../constants/gmailSync";
import { LEASE_RENDER_TIMEOUT_MS } from "../constants/leaseRender";
import { RENT_REMINDER_SEND_TIMEOUT_MS } from "../constants/rentReminderSend";
import { UTILITY_OFFERS_TIMEOUT_MS } from "../constants/utilityOffers";
import "../store/documentsApi";
import "../store/insurancePoliciesApi";
import "../store/integrationsApi";
import "../store/mortgagesApi";
import "../store/rentReceiptsApi";
import "../store/rentRemindersApi";
import "../store/signedLeasesApi";
import "../store/taxReturnsApi";
import "../store/transactionsApi";
import "../store/utilityOffersApi";
import "../store/utilityPlansApi";
import "../store/welcomeManualsApi";

type Initiate = { initiate: (arg?: unknown) => Parameters<ReturnType<typeof newStore>["dispatch"]>[0] };
const endpoints = baseApi.endpoints as unknown as Record<string, Initiate>;

let seen: InternalAxiosRequestConfig[] = [];

function newStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => "w1" },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    seen.push(config);
    return Promise.resolve({ data: {}, status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  seen = [];
});

const form = (): FormData => new FormData();

// Each of these can outlast the client's default: they send files, wait on a model,
// build a document, or call another service while the user waits.
const LONG_REQUESTS: [endpoint: string, arg: () => unknown, timeout: number][] = [
  ["uploadDocument", () => ({ form: form(), workspaceId: "w1" }), UPLOAD_REQUEST_TIMEOUT_MS],
  ["importBankCsv", () => ({ form: form() }), UPLOAD_REQUEST_TIMEOUT_MS],
  ["uploadSignedLeaseAttachment", () => ({ leaseId: "l1", form: form() }), UPLOAD_REQUEST_TIMEOUT_MS],
  ["importSignedLease", form, UPLOAD_REQUEST_TIMEOUT_MS],
  ["uploadSectionImages", () => ({ manualId: "m1", sectionId: "s1", form: form() }), UPLOAD_REQUEST_TIMEOUT_MS],
  ["extractInsurancePolicy", () => ({ document_id: "d1" }), MODEL_REQUEST_TIMEOUT_MS],
  ["extractMortgage", () => ({ document_id: "d1" }), MODEL_REQUEST_TIMEOUT_MS],
  ["extractUtilityPlan", () => ({ document_id: "d1" }), MODEL_REQUEST_TIMEOUT_MS],
  ["generateAdvisorSuggestions", () => "t1", MODEL_REQUEST_TIMEOUT_MS],
  ["generateSignedLease", () => "l1", LEASE_RENDER_TIMEOUT_MS],
  ["addSignedLeaseTemplates", () => ({ leaseId: "l1", templateIds: ["t1"] }), LEASE_RENDER_TIMEOUT_MS],
  ["emailWelcomeManual", () => ({ manualId: "m1", data: {} }), EXPORT_REQUEST_TIMEOUT_MS],
  ["sendReceipt", () => ({ transaction_id: "x1", data: {} }), EXPORT_REQUEST_TIMEOUT_MS],
  ["syncGmail", () => undefined, GMAIL_SYNC_TIMEOUT_MS],
  ["sendRentReminderNow", () => ({ applicantId: "a1" }), RENT_REMINDER_SEND_TIMEOUT_MS],
  ["findBetterUtilityPlans", () => undefined, UTILITY_OFFERS_TIMEOUT_MS],
];

describe("requests that take longer than the default", () => {
  it.each(LONG_REQUESTS)("%s waits longer than the default", async (endpoint, arg, timeout) => {
    await newStore().dispatch(endpoints[endpoint].initiate(arg()));
    expect(seen).toHaveLength(1);
    expect(seen[0].timeout).toBe(timeout);
    expect(timeout).toBeGreaterThan(DEFAULT_REQUEST_TIMEOUT_MS);
  });
});
