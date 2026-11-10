import api from "@platform/core/lib/api";
import { act, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { FORM_MESSAGES } from "../src/constants/forms";
import { WRITE_ACCESS_MESSAGES } from "../src/constants/writeAccess";
import RequireWrite from "../src/features/workspace/RequireWrite";
import { renderScreen, resetSignedInStore } from "../test-support/renderScreen";
import { serveRole, serveRoleLater } from "../test-support/serveRole";

const originalAdapter = api.defaults.adapter;

beforeEach(() => resetSignedInStore());
afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

async function showGuarded(loading?: React.ReactElement) {
  await renderScreen(
    <RequireWrite loading={loading}>
      <Text>the form</Text>
    </RequireWrite>,
  );
}

describe("RequireWrite", () => {
  it("tells a viewer why, and never mounts the form", async () => {
    serveRole("viewer");
    await showGuarded();
    await screen.findByText(FORM_MESSAGES.viewOnlyHeading);
    expect(screen.getByText(FORM_MESSAGES.viewOnlyBody)).toBeTruthy();
    expect(screen.queryByText("the form")).toBeNull();
    expect(screen.queryByTestId("write-access-skeleton")).toBeNull();
  });

  it.each(["user", "admin", "owner"] as const)("shows the form to a %s", async (role) => {
    serveRole(role);
    await showGuarded();
    await screen.findByText("the form");
    expect(screen.queryByText(FORM_MESSAGES.viewOnlyHeading)).toBeNull();
  });

  it("shows a neutral loading state, not the form or the view-only message, while the role is unknown", async () => {
    serveRoleLater("owner");
    await showGuarded();
    expect(await screen.findByTestId("write-access-skeleton")).toBeTruthy();
    expect(screen.getByLabelText(WRITE_ACCESS_MESSAGES.loading)).toBeTruthy();
    expect(screen.queryByText("the form")).toBeNull();
    expect(screen.queryByText(FORM_MESSAGES.viewOnlyHeading)).toBeNull();
  });

  it("shows the screen's own skeleton while the role is unknown, when it has one", async () => {
    serveRoleLater("owner");
    await showGuarded(<Text>my skeleton</Text>);
    expect(await screen.findByText("my skeleton")).toBeTruthy();
    expect(screen.queryByTestId("write-access-skeleton")).toBeNull();
  });

  it("shows the skeleton first, then the form once the role is known to allow it", async () => {
    const later = serveRoleLater("owner");
    await showGuarded();
    expect(await screen.findByTestId("write-access-skeleton")).toBeTruthy();
    expect(screen.queryByText("the form")).toBeNull();

    await act(async () => later.release());
    await waitFor(() => expect(screen.getByText("the form")).toBeTruthy());
    expect(screen.queryByTestId("write-access-skeleton")).toBeNull();
  });

  it("shows the skeleton first, then the view-only message, for a viewer", async () => {
    const later = serveRoleLater("viewer");
    await showGuarded();
    expect(await screen.findByTestId("write-access-skeleton")).toBeTruthy();
    expect(screen.queryByText(FORM_MESSAGES.viewOnlyHeading)).toBeNull();

    await act(async () => later.release());
    await screen.findByText(FORM_MESSAGES.viewOnlyHeading);
    expect(screen.queryByText("the form")).toBeNull();
  });

  it("lets everyone through when it isn't required", async () => {
    serveRole("viewer");
    await renderScreen(
      <RequireWrite required={false}>
        <Text>the form</Text>
      </RequireWrite>,
    );
    await screen.findByText("the form");
  });

  it("uses a screen's own wording and way out in place of the default", async () => {
    serveRole("viewer");
    const onPress = jest.fn();
    await renderScreen(
      <RequireWrite action={{ label: "Go back", onPress }} body="Custom body" heading="Custom heading">
        <Text>the form</Text>
      </RequireWrite>,
    );
    await screen.findByText("Custom heading");
    expect(screen.getByText("Custom body")).toBeTruthy();
    expect(screen.getByText("Go back")).toBeTruthy();
    expect(screen.queryByText(FORM_MESSAGES.viewOnlyHeading)).toBeNull();
  });
});
