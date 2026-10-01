/**
 * loadDiscordActivityClientId: the Activity's application id comes from the
 * app's public config endpoint (GET /api/discord/activity-config).
 */
import { AxiosError, type AxiosAdapter, type AxiosResponse } from "axios";
import { afterEach, describe, expect, it } from "vitest";
import api from "../lib/api";
import {
  DISCORD_ACTIVITY_CONFIG_PATH,
  loadDiscordActivityClientId,
} from "../discord-activity/loadDiscordActivityClientId";

const originalAdapter = api.defaults.adapter;
let requestedUrls: string[] = [];

/** Answer every request on the shared API client with `status` / `data`. */
function serve(status: number, data: unknown): void {
  const adapter: AxiosAdapter = async (config) => {
    requestedUrls.push(`${config.baseURL ?? ""}${config.url ?? ""}`);
    const response: AxiosResponse = { data, status, statusText: String(status), headers: {}, config };
    if (status >= 400) {
      throw new AxiosError(`Request failed with status code ${status}`, AxiosError.ERR_BAD_REQUEST, config, null, response);
    }
    return response;
  };
  api.defaults.adapter = adapter;
}

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  requestedUrls = [];
});

describe("loadDiscordActivityClientId", () => {
  it("returns the client id from the public config endpoint", async () => {
    serve(200, { client_id: "1555249458542022666" });
    await expect(loadDiscordActivityClientId()).resolves.toBe("1555249458542022666");
    expect(requestedUrls).toEqual([`/api${DISCORD_ACTIVITY_CONFIG_PATH}`]);
  });

  it("rejects when the backend has Discord switched off (404)", async () => {
    serve(404, { detail: "Not Found" });
    await expect(loadDiscordActivityClientId()).rejects.toBeInstanceOf(AxiosError);
  });

  it.each([
    ["an HTML page", "<!doctype html><html></html>"],
    ["an empty object", {}],
    ["a numeric id", { client_id: 42 }],
    ["null", null],
  ])("rejects an unexpected answer: %s", async (_label, body) => {
    serve(200, body);
    await expect(loadDiscordActivityClientId()).rejects.toThrow(`Unexpected response from ${DISCORD_ACTIVITY_CONFIG_PATH}.`);
  });
});
