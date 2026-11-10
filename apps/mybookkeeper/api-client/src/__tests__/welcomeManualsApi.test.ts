import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { configurePlatform } from "@platform/core/platform/configurePlatform";
import { configureStore } from "@reduxjs/toolkit";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import "../store/welcomeManualsApi";

const sent: InternalAxiosRequestConfig[] = [];

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

type Initiate = { initiate: (arg?: unknown) => Parameters<ReturnType<typeof makeStore>["dispatch"]>[0] };
const endpoints = baseApi.endpoints as unknown as Record<string, Initiate>;

beforeAll(() => {
  configurePlatform({
    baseURL: "/api",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => "w1" },
    isOnLogin: () => false,
  });
  const adapter: AxiosAdapter = (config) => {
    sent.push(config);
    return Promise.resolve({ data: [], status: 200, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
});

beforeEach(() => {
  sent.length = 0;
});

function body(i: number): unknown {
  return JSON.parse(sent[i].data as string);
}

describe("welcomeManualsApi", () => {
  it("reorders sections with one atomic PUT", async () => {
    await makeStore().dispatch(endpoints.reorderSections.initiate({ manualId: "m1", sectionIds: ["b", "a"] }));
    expect(sent).toHaveLength(1);
    expect(sent[0].method).toBe("put");
    expect(sent[0].url).toBe("/welcome-manuals/m1/sections/order");
    expect(body(0)).toEqual({ section_ids: ["b", "a"] });
  });

  it("reorders fields with one atomic PUT", async () => {
    await makeStore().dispatch(
      endpoints.reorderSectionFields.initiate({ manualId: "m1", sectionId: "s1", fieldIds: ["y", "x"] }),
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("/welcome-manuals/m1/sections/s1/fields/order");
    expect(body(0)).toEqual({ field_ids: ["y", "x"] });
  });

  it("reorders photos with one atomic PUT", async () => {
    await makeStore().dispatch(
      endpoints.reorderSectionImages.initiate({ manualId: "m1", sectionId: "s1", imageIds: ["q", "p"] }),
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("/welcome-manuals/m1/sections/s1/images/order");
    expect(body(0)).toEqual({ image_ids: ["q", "p"] });
  });

  it("sends the request body as given for an update", async () => {
    await makeStore().dispatch(
      endpoints.updateSectionField.initiate({ manualId: "m1", sectionId: "s1", fieldId: "f1", data: { value: null } }),
    );
    expect(sent[0].method).toBe("patch");
    expect(body(0)).toEqual({ value: null });
  });

  it("posts the built form for a photo upload", async () => {
    const form = new FormData();
    await makeStore().dispatch(
      endpoints.uploadSectionImages.initiate({ manualId: "m1", sectionId: "s1", form }),
    );
    expect(sent[0].method).toBe("post");
    expect(sent[0].url).toBe("/welcome-manuals/m1/sections/s1/images");
    expect(sent[0].data).toBe(form);
  });

  it("sends the email request to the manual", async () => {
    await makeStore().dispatch(
      endpoints.emailWelcomeManual.initiate({ manualId: "m1", data: { recipient_email: "a@b.co" } }),
    );
    expect(sent[0].url).toBe("/welcome-manuals/m1/email");
    expect(body(0)).toEqual({ recipient_email: "a@b.co" });
  });
});
