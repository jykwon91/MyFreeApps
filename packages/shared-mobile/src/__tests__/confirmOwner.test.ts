import { authenticateAsync, getEnrolledLevelAsync, SecurityLevel } from "expo-local-authentication";
import { confirmOwner } from "../auth/confirmOwner";
import { confirmSecurityChange } from "../auth/confirmSecurityChange";
import { OWNER_CHECK_MESSAGES } from "../constants/ownerCheck";

jest.mock("expo-local-authentication", () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_STRONG: 3 },
  authenticateAsync: jest.fn(),
  getEnrolledLevelAsync: jest.fn(),
}));

const level = jest.mocked(getEnrolledLevelAsync);
const authenticate = jest.mocked(authenticateAsync);

beforeEach(() => {
  jest.clearAllMocks();
  level.mockResolvedValue(SecurityLevel.BIOMETRIC_STRONG);
});

it("passes a phone with no lock, without asking", async () => {
  level.mockResolvedValue(SecurityLevel.NONE);
  expect(await confirmOwner("Show it")).toEqual({ confirmed: true, problem: null });
  expect(authenticate).not.toHaveBeenCalled();
});

it("asks with the prompt it's given, and passes when the owner confirms", async () => {
  authenticate.mockResolvedValue({ success: true });
  expect(await confirmOwner("Show it")).toEqual({ confirmed: true, problem: null });
  expect(authenticate).toHaveBeenCalledWith({ promptMessage: "Show it" });
});

it.each(["user_cancel", "system_cancel", "app_cancel"] as const)("stops quietly on %s: nothing went wrong", async (error) => {
  authenticate.mockResolvedValue({ success: false, error });
  expect(await confirmOwner("Show it")).toEqual({ confirmed: false, problem: null });
});

it("says it couldn't confirm when the check fails", async () => {
  authenticate.mockResolvedValue({ success: false, error: "lockout" });
  expect(await confirmOwner("Show it")).toEqual({ confirmed: false, problem: OWNER_CHECK_MESSAGES.couldntConfirm });
});

it("says it couldn't confirm when asking throws", async () => {
  authenticate.mockRejectedValue(new Error("no hardware"));
  expect(await confirmOwner("Show it")).toEqual({ confirmed: false, problem: OWNER_CHECK_MESSAGES.couldntConfirm });
});

it("asks about a security change in those words", async () => {
  authenticate.mockResolvedValue({ success: true });
  await confirmSecurityChange();
  expect(authenticate).toHaveBeenCalledWith({ promptMessage: OWNER_CHECK_MESSAGES.securityChangePrompt });
});
