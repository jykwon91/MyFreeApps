/**
 * Real-backend E2E for renting a place by the room.
 *
 * One manual, many rooms: sections stay shared unless the host marks one for a
 * single room, and only that room's emailed guide carries it. The share link is
 * unchanged — it always shows the shared sections and never a room's own.
 *
 * Covers the whole host loop against a live API: add a room, rename it, scope a
 * section to it, watch the guest preview follow the room picker, and confirm the
 * email dialog makes the host say which room the guest is in before it will send.
 */
import { test, expect } from "./fixtures/auth";
import { createWelcomeManual, deleteWelcomeManual } from "./fixtures/welcome-manual";

const SHARED_OPTION = "shared";

test.describe("Welcome manual — rooms", () => {
  let manualId = "";

  test.afterEach(async ({ api }) => {
    if (manualId) {
      await deleteWelcomeManual(api, manualId);
      manualId = "";
    }
  });

  test("a whole-place guide starts with no rooms and no scope pickers", async ({
    api,
    authedPage: page,
  }) => {
    const manual = await createWelcomeManual(api, {
      title: "E2E whole place",
      seed_default_sections: true,
    });
    manualId = manual.id;

    await page.goto(`/welcome-manuals/${manual.id}`);
    await expect(page.getByTestId("welcome-manual-room-manager")).toBeVisible();
    await expect(page.getByTestId("welcome-manual-room-empty-state")).toContainText(
      "goes out whole",
    );
    // Nothing room-shaped intrudes on a host who rents the whole place.
    await expect(page.getByTestId("welcome-manual-section-scope").first()).toBeHidden();
    await expect(page.getByTestId("welcome-manual-preview-scope")).toBeHidden();
  });

  test("add a room, scope a section to it, and the preview follows the picker", async ({
    api,
    authedPage: page,
  }) => {
    const manual = await createWelcomeManual(api, {
      title: "E2E by the room",
      seed_default_sections: false,
    });
    manualId = manual.id;

    const shared = await api.post(`/welcome-manuals/${manual.id}/sections`, {
      data: { title: "House rules", body: "Quiet after 10pm." },
    });
    expect(shared.ok()).toBeTruthy();
    await api.post(`/welcome-manuals/${manual.id}/sections`, {
      data: { title: "Where your room is", body: "First door on the left." },
    });

    await page.goto(`/welcome-manuals/${manual.id}`);

    // 1. Add a room and give it a real name.
    await page.getByTestId("welcome-manual-room-add-button").click();
    const roomName = page.getByTestId("welcome-manual-room-name").first();
    await expect(roomName).toHaveValue("New room");
    await roomName.fill("Front bedroom");
    await roomName.blur();
    await expect(page.getByTestId("welcome-manual-room-name").first()).toHaveValue(
      "Front bedroom",
    );

    // 2. Scope the second section to that room.
    const scopes = page.getByTestId("welcome-manual-section-scope");
    await expect(scopes.first()).toBeVisible();
    const roomScope = scopes.nth(1);
    await roomScope.selectOption({ label: "Front bedroom only" });
    await expect(page.getByTestId("welcome-manual-section-room-badge")).toContainText(
      "Front bedroom only",
    );
    await expect(page.getByTestId("welcome-manual-room-section-count")).toHaveText(
      "1 section",
    );

    // 3. The default preview is the share link: shared sections only.
    const previewScope = page.getByTestId("welcome-manual-preview-scope");
    await expect(previewScope).toHaveValue(SHARED_OPTION);
    const previewed = page.getByTestId("welcome-manual-preview-section");
    await expect(previewed).toHaveCount(1);
    await expect(previewed.first()).toContainText("House rules");

    // 4. Switching to the room previews what that guest's PDF will carry.
    await previewScope.selectOption({ label: "Front bedroom — their emailed PDF" });
    await expect(previewed).toHaveCount(2);
    await expect(page.getByTestId("welcome-manual-preview")).toContainText(
      "Where your room is",
    );
  });

  test("the email dialog makes the host pick a room before it will send", async ({
    api,
    authedPage: page,
  }) => {
    const manual = await createWelcomeManual(api, {
      title: "E2E email by room",
      seed_default_sections: true,
    });
    manualId = manual.id;
    await api.post(`/welcome-manuals/${manual.id}/rooms`, { data: { name: "Front bedroom" } });

    await page.goto(`/welcome-manuals/${manual.id}`);
    await page.getByTestId("email-welcome-manual-button").click();

    const send = page.getByTestId("welcome-manual-email-send");
    await page.getByTestId("welcome-manual-email-input").fill("guest@example.com");
    // Valid email is no longer enough on a by-the-room manual.
    await expect(send).toBeDisabled();

    await page.getByTestId("welcome-manual-email-room").selectOption({ label: "Front bedroom" });
    await expect(send).toBeEnabled();
  });

  test("removing a room warns that its own sections go with it", async ({
    api,
    authedPage: page,
  }) => {
    const manual = await createWelcomeManual(api, {
      title: "E2E room delete",
      seed_default_sections: false,
    });
    manualId = manual.id;
    const roomRes = await api.post(`/welcome-manuals/${manual.id}/rooms`, {
      data: { name: "Front bedroom" },
    });
    const room = await roomRes.json();
    const secRes = await api.post(`/welcome-manuals/${manual.id}/sections`, {
      data: { title: "Where your room is", body: "First door on the left." },
    });
    const section = await secRes.json();
    await api.patch(`/welcome-manuals/${manual.id}/sections/${section.id}`, {
      data: { room_id: room.id },
    });

    await page.goto(`/welcome-manuals/${manual.id}`);
    await page.getByTestId("welcome-manual-room-delete").click();
    await expect(page.getByText("Remove this room?")).toBeVisible();
    await expect(
      page.getByText(/1 section written only for this room will be deleted/),
    ).toBeVisible();

    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByTestId("welcome-manual-room-empty-state")).toBeVisible();
    // The room-only section went with the room.
    await expect(page.getByTestId("welcome-manual-sections-empty")).toBeVisible();
  });
});
