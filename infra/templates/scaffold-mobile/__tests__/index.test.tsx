import { createMobileSession, SessionProvider } from "@platform/mobile";
import { render, screen } from "@testing-library/react-native";
import Home from "../app/(app)/index";

describe("Home", () => {
  it("renders the placeholder through @platform/mobile", async () => {
    await render(
      <SessionProvider session={createMobileSession()}>
        <Home />
      </SessionProvider>,
    );

    expect(screen.getByRole("header", { name: "__APP_DISPLAY_NAME__" })).toBeTruthy();
    expect(screen.getByText("This screen is a placeholder.")).toBeTruthy();
  });
});
