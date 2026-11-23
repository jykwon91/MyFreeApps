/**
 * Stubs the shared `/auth/mobile/sessions` endpoints the way platform_shared answers
 * them: GET lists the account's signed-in phones, DELETE /<id> signs one out (204), or
 * answers 404 "Session not found" for one that isn't listed. For E2E tests only.
 */
import type { Page } from "@playwright/test";
import type { SignedInDevice } from "@platform/core/types/security/signed-in-device";
import { DEFAULT_API_BASE } from "./constants/defaultApiBase";
import { escapeRegExp } from "./escapeRegExp";
import { json } from "./mockResponse";
import type { DeviceSessionsStubOptions } from "./types/DeviceSessionsStubOptions";

export const DEVICE_SESSIONS_PATH = "/auth/mobile/sessions";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** A phone last used `lastUsedHoursAgo` hours ago, signed in a month ago. */
export function testDevice(id: string, deviceName: string | null, lastUsedHoursAgo: number): SignedInDevice {
  const now = Date.now();
  return {
    id,
    device_name: deviceName,
    created_at: new Date(now - 30 * DAY_MS).toISOString(),
    last_used_at: new Date(now - lastUsedHoursAgo * HOUR_MS).toISOString(),
  };
}

/** The list matcher, for holdReads / failReads in front of the stub. */
export function deviceSessionsListUrl(apiBase: string = DEFAULT_API_BASE): RegExp {
  return new RegExp(`${escapeRegExp(apiBase + DEVICE_SESSIONS_PATH)}$`);
}

/** Returns the ids the page asked to sign out, in order. */
export async function stubDeviceSessions(
  page: Page,
  { apiBase = DEFAULT_API_BASE, devices = [], refuseSignOut }: DeviceSessionsStubOptions = {},
): Promise<string[]> {
  let current = [...devices];
  const signedOut: string[] = [];
  await page.route(deviceSessionsListUrl(apiBase), (route) => route.fulfill(json(current)));
  await page.route(new RegExp(`${escapeRegExp(apiBase + DEVICE_SESSIONS_PATH)}/([^/]+)$`), (route) => {
    const request = route.request();
    if (request.method() !== "DELETE") return route.fallback();
    const id = decodeURIComponent(new URL(request.url()).pathname.split("/").pop() ?? "");
    signedOut.push(id);
    if (refuseSignOut) return route.fulfill(json({ detail: refuseSignOut.detail }, refuseSignOut.status));
    if (!current.some((device) => device.id === id)) return route.fulfill(json({ detail: "Session not found" }, 404));
    current = current.filter((device) => device.id !== id);
    return route.fulfill({ status: 204 });
  });
  return signedOut;
}
