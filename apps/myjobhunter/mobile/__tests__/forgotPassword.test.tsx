import { serve } from "@platform/mobile/test-support/fakeServer";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { passChallenge } from "@platform/mobile/test-support/turnstile";
import { fireEvent, screen } from "@testing-library/react-native";
import { renderApp } from "../test-support/renderApp";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

beforeEach(() => storedItems.clear());

// Password resets used to open the website; now it's a screen opened from sign-in.
it("asks for a password reset link from sign-in, then comes back to sign in", async () => {
  const sent = serve({ "POST /auth/forgot-password": () => ({ status: 202, data: null }) });
  await renderApp("/sign-in");

  await fireEvent.press(await screen.findByRole("link", { name: "Forgot your password?" }));
  expect(screen).toHavePathname("/forgot-password");
  await fireEvent.changeText(screen.getByLabelText(/^Email/), "hunter@example.com");
  await passChallenge("token-1");
  await fireEvent.press(screen.getByRole("button", { name: "Send reset link" }));

  expect(await screen.findByRole("header", { name: "Check your inbox" })).toBeTruthy();
  expect(sent.find(({ route }) => route === "POST /auth/forgot-password")).toMatchObject({
    body: { email: "hunter@example.com" },
    turnstileToken: "token-1",
  });

  await fireEvent.press(screen.getByRole("button", { name: "Back to sign in" }));
  expect(screen).toHavePathname("/sign-in");
  expect(await screen.findByRole("button", { name: "Sign in" })).toBeTruthy();
});

// MyJobHunter is invite-only, so the in-app reset comes without an in-app sign-up.
it("still offers no way to create an account alongside the in-app reset", async () => {
  serve({});
  await renderApp("/sign-in");

  expect(await screen.findByRole("link", { name: "Forgot your password?" })).toBeTruthy();
  expect(
    screen.getByText("MyJobHunter is invite-only. Use the link in your invite email to create an account."),
  ).toBeTruthy();
  expect(screen.queryByRole("link", { name: /Create an account/ })).toBeNull();
});
