import { signedInEmail } from "../auth/signedInEmail";
import type { MobileSession } from "../types/MobileSession";
import type { SessionState } from "../types/SessionState";

function sessionIn(state: SessionState): MobileSession {
  return { getState: () => state } as unknown as MobileSession;
}

it("is the signed-in account's email", () => {
  expect(signedInEmail(sessionIn({ status: "signedIn", email: "a@example.com", sessionId: "s" }))).toBe("a@example.com");
});

it("is null while restoring, unreadable or signed out", () => {
  expect(signedInEmail(sessionIn({ status: "restoring" }))).toBeNull();
  expect(signedInEmail(sessionIn({ status: "unreadable" }))).toBeNull();
  expect(signedInEmail(sessionIn({ status: "signedOut", endedByServer: true, lastEmail: "a@example.com" }))).toBeNull();
});
