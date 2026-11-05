import api from "@platform/core/lib/api";
import { _resetPlatformForTests, configurePlatform } from "@platform/core/platform/configurePlatform";
import type { AxiosAdapter } from "axios";
import { requestTwoStepDisable, requestTwoStepSetup, requestTwoStepVerify } from "../auth/twoStepApi";
import { TWO_STEP_DETAILS } from "../constants/twoStep";

const originalAdapter = api.defaults.adapter;

function answerWith(status: number, detail?: string, data?: unknown): void {
  const adapter: AxiosAdapter = (config) => {
    const response = { config, data: data ?? { detail }, headers: {}, status, statusText: "" };
    if (status < 300) return Promise.resolve(response);
    return Promise.reject(Object.assign(new Error("refused"), { config, isAxiosError: true, response }));
  };
  api.defaults.adapter = adapter;
}

function noAnswer(): void {
  api.defaults.adapter = (config) =>
    Promise.reject(Object.assign(new Error("Network Error"), { config, isAxiosError: true }));
}

beforeEach(() => {
  _resetPlatformForTests();
  configurePlatform({
    baseURL: "https://api.test",
    tokenStore: { get: () => null, set: () => {}, clear: () => {} },
    orgStore: { get: () => null },
    isOnLogin: () => false,
    refreshSession: async () => "unavailable",
  });
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("requestTwoStepSetup", () => {
  it.each([
    [403, TWO_STEP_DETAILS.wrongPassword, "wrong_password"],
    [400, TWO_STEP_DETAILS.alreadyOn, "already_on"],
    [429, "locked", "rate_limited"],
    [500, "boom", "failed"],
  ])("%i %s is %s", async (status, detail, outcome) => {
    answerWith(status, detail);
    expect((await requestTwoStepSetup("pw")).outcome).toBe(outcome);
  });

  it("returns the setup, and no answer is a failure", async () => {
    const setup = { secret: "S", provisioning_uri: "otpauth://x", algorithm: "sha256", digits: 6, period: 30 };
    answerWith(200, undefined, setup);
    expect(await requestTwoStepSetup("pw")).toEqual({ outcome: "started", setup });
    noAnswer();
    expect(await requestTwoStepSetup("pw")).toEqual({ outcome: "failed" });
  });
});

describe("requestTwoStepVerify", () => {
  it.each([
    [400, "Invalid verification code", "wrong_code"],
    [400, TWO_STEP_DETAILS.notStarted, "not_started"],
    [400, TWO_STEP_DETAILS.alreadyOn, "already_on"],
    [429, "locked", "rate_limited"],
    [503, "boom", "unknown"],
  ])("%i %s is %s", async (status, detail, outcome) => {
    answerWith(status, detail);
    expect((await requestTwoStepVerify("123456")).outcome).toBe(outcome);
  });

  it("returns the codes, and no answer is unknown because it may have turned on", async () => {
    answerWith(200, undefined, { verified: true, recovery_codes: ["AAAA1111"] });
    expect(await requestTwoStepVerify("123456")).toEqual({ outcome: "turned_on", recoveryCodes: ["AAAA1111"] });
    noAnswer();
    expect(await requestTwoStepVerify("123456")).toEqual({ outcome: "unknown" });
  });
});

describe("requestTwoStepDisable", () => {
  it.each([
    [400, "Invalid code", "wrong_code"],
    [400, TWO_STEP_DETAILS.alreadyOff, "already_off"],
    [429, "locked", "rate_limited"],
    [502, "boom", "unknown"],
  ])("%i %s is %s", async (status, detail, result) => {
    answerWith(status, detail);
    expect(await requestTwoStepDisable("123456")).toBe(result);
  });

  it("turns off, and no answer is unknown", async () => {
    answerWith(200, undefined, { disabled: true });
    expect(await requestTwoStepDisable("123456")).toBe("turned_off");
    noAnswer();
    expect(await requestTwoStepDisable("123456")).toBe("unknown");
  });
});
