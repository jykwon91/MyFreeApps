import { NOT_FOUND_COPY } from "@mylanguagetutor/api-client/constants/notFoundCopy";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { storeSession } from "@platform/mobile/test-support/storedSession";
import { screen } from "@testing-library/react-native";
import { renderApp } from "../test-support/renderApp";

beforeEach(() => {
  storedItems.clear();
  storeSession();
});

describe("not-found screen", () => {
  it("shows the shared not-found copy for an unknown address", async () => {
    await renderApp("/no-such-page");

    expect(await screen.findByText(NOT_FOUND_COPY.heading)).toBeTruthy();
    expect(screen.getByText(NOT_FOUND_COPY.body)).toBeTruthy();
    expect(screen.getByText(NOT_FOUND_COPY.homeLabel)).toBeTruthy();
  });
});
