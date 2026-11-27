import { serve } from "@platform/mobile/test-support/fakeServer";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { passChallenge } from "@platform/mobile/test-support/turnstile";
import { fireEvent, screen } from "@testing-library/react-native";
import { renderSignedOutApp } from "../test-support/renderSignedOutApp";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

beforeEach(() => storedItems.clear());

// Sign-up and password resets used to open the website; now they're screens opened from sign-in.
it("creates an account from sign-in, then comes back to sign in", async () => {
  const sent = serve({ "POST /auth/register": () => ({ status: 201, data: {} }) });
  await renderSignedOutApp("/sign-in");

  await fireEvent.press(await screen.findByRole("link", { name: "New here? Create an account" }));
  expect(screen).toHavePathname("/register");
  await fireEvent.changeText(screen.getByLabelText(/^Name/), "Pat");
  await fireEvent.changeText(screen.getByLabelText(/^Email/), "owner@example.com");
  await fireEvent.changeText(screen.getByLabelText(/^Password/), "a long bookkeeping password");
  await fireEvent.press(screen.getByRole("switch", { name: "I agree to use this service responsibly." }));
  await passChallenge("token-1");
  await fireEvent.press(screen.getByRole("button", { name: "Sign up" }));

  expect(await screen.findByRole("header", { name: "Check your inbox" })).toBeTruthy();
  // MyBookkeeper's sign-up takes the name as `name`, not `display_name` like the other apps.
  expect(sent.find(({ route }) => route === "POST /auth/register")).toMatchObject({
    body: { email: "owner@example.com", password: "a long bookkeeping password", name: "Pat" },
    turnstileToken: "token-1",
  });
  expect(sent.find(({ route }) => route === "POST /auth/register")?.body).not.toHaveProperty("display_name");

  await fireEvent.press(screen.getByRole("button", { name: "Back to sign in" }));
  expect(screen).toHavePathname("/sign-in");
  expect(await screen.findByRole("button", { name: "Sign in" })).toBeTruthy();
});

it("asks for a password reset link from sign-in, then comes back to sign in", async () => {
  const sent = serve({ "POST /auth/forgot-password": () => ({ status: 202, data: null }) });
  await renderSignedOutApp("/sign-in");

  await fireEvent.press(await screen.findByRole("link", { name: "Forgot your password?" }));
  expect(screen).toHavePathname("/forgot-password");
  await fireEvent.changeText(screen.getByLabelText(/^Email/), "owner@example.com");
  await passChallenge("token-2");
  await fireEvent.press(screen.getByRole("button", { name: "Send reset link" }));

  expect(await screen.findByRole("header", { name: "Check your inbox" })).toBeTruthy();
  expect(sent.find(({ route }) => route === "POST /auth/forgot-password")).toMatchObject({
    body: { email: "owner@example.com" },
    turnstileToken: "token-2",
  });

  await fireEvent.press(screen.getByRole("button", { name: "Back to sign in" }));
  expect(screen).toHavePathname("/sign-in");
});
