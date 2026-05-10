import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StepUpCancelledError } from "../auth/errors/StepUpCancelledError";
import {
  _resetForTests,
  cancel,
  getState,
  request,
  signalReauth,
  signalSuccess,
  signalWrongCode,
  submitCode,
  subscribe,
} from "../auth/stepUpController";

describe("stepUpController", () => {
  beforeEach(() => {
    _resetForTests();
  });
  afterEach(() => {
    _resetForTests();
  });

  it("opens pending state on first request", () => {
    const p = request("totp");
    p.catch(() => {});
    expect(getState().pending).toEqual({ kind: "totp" });
    expect(getState().errorMessage).toBeNull();
    expect(getState().submitting).toBe(false);
  });

  it("resolves the pending Promise with the submitted code", async () => {
    const p = request("totp");
    submitCode("123456");
    await expect(p).resolves.toBe("123456");
    expect(getState().submitting).toBe(true);
  });

  it("queues concurrent requests behind one modal", async () => {
    const p1 = request("totp");
    const p2 = request("totp");
    const p3 = request("totp");
    submitCode("654321");
    const codes = await Promise.all([p1, p2, p3]);
    expect(codes).toEqual(["654321", "654321", "654321"]);
  });

  it("rejects pending Promise on cancel with StepUpCancelledError", async () => {
    const p = request("totp");
    cancel("user_cancelled");
    await expect(p).rejects.toBeInstanceOf(StepUpCancelledError);
    expect(getState().pending).toBeNull();
  });

  it("rejects all queued Promises on cancel", async () => {
    const p1 = request("totp");
    const p2 = request("totp");
    cancel("user_cancelled");
    await expect(p1).rejects.toBeInstanceOf(StepUpCancelledError);
    await expect(p2).rejects.toBeInstanceOf(StepUpCancelledError);
  });

  it("preserves pending state on signalWrongCode (modal stays open)", async () => {
    const p = request("totp");
    submitCode("111111");
    await p;
    signalWrongCode("That code didn't match.");
    expect(getState().pending).toEqual({ kind: "totp" });
    expect(getState().errorMessage).toBe("That code didn't match.");
    expect(getState().submitting).toBe(false);
    expect(getState().attempt).toBe(1);
  });

  it("clears all state on signalSuccess", async () => {
    const p = request("totp");
    submitCode("111111");
    await p;
    signalSuccess();
    expect(getState().pending).toBeNull();
    expect(getState().errorMessage).toBeNull();
    expect(getState().submitting).toBe(false);
    expect(getState().attempt).toBe(0);
  });

  it("clears state on signalReauth", async () => {
    const p = request("totp");
    p.catch(() => {});
    signalReauth();
    await expect(p).rejects.toBeInstanceOf(StepUpCancelledError);
    expect(getState().pending).toBeNull();
  });

  it("notifies subscribers on state changes", () => {
    let calls = 0;
    const unsub = subscribe(() => {
      calls += 1;
    });
    const p = request("totp");
    p.catch(() => {});
    expect(calls).toBeGreaterThanOrEqual(1);
    cancel();
    expect(calls).toBeGreaterThanOrEqual(2);
    unsub();
  });
});
