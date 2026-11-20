import { redirectSystemPath } from "../app/+native-intent";

describe("the app's handling of Google's answer when it opens the app", () => {
  it.each([
    "mybookkeeper://oauth-callback#code=c0de&state=signed",
    "mybookkeeper://oauth-callback#result=error&reason=expired",
    "mybookkeeper://oauth-callback?code=c0de&state=signed",
    "mybookkeeper://oauth-callback",
    "/oauth-callback#code=c0de&state=signed",
  ])("stays where it is for %s instead of routing to a not-found screen", (path) => {
    expect(redirectSystemPath({ path, initial: false })).toBeNull();
    expect(redirectSystemPath({ path, initial: true })).toBeNull();
  });

  it.each([
    "mybookkeeper://integrations",
    "mybookkeeper://oauth-callbacks",
    "/receipts/t1",
    "/oauth-callback-later",
  ])("leaves every other link alone: %s", (path) => {
    expect(redirectSystemPath({ path, initial: false })).toBe(path);
  });
});
