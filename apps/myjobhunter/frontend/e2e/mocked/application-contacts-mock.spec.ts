/**
 * No-backend E2E for an application's contacts, on the full page and in the
 * kanban drawer: add one (the request body and the refetched list), refuse a
 * form with neither name nor email, remove one after confirming, keep it on
 * cancel, treat a 404 on remove as already removed, and say so when the
 * server refuses.
 *
 * The stubs hold the contacts in memory, so the list the UI shows after each
 * write is what the refetched GET /applications/{id} returned.
 */
import { test, expect, type Page } from "@playwright/test";
import type { ApplicationContact } from "@myjobhunter/api-client/types/contact/application-contact";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { mockApplication, mockCompany } from "./fixtures/mockData";

const APPLICATION = mockApplication();
const TIMESTAMP = "2026-11-01T00:00:00+00:00";
const DETAIL = new RegExp(`/api/applications/${APPLICATION.id}$`);
const CONTACTS = new RegExp(`/api/applications/${APPLICATION.id}/contacts(/[^/?]+)?$`);

function contact(overrides: Partial<ApplicationContact> & Pick<ApplicationContact, "id">): ApplicationContact {
  return {
    user_id: APPLICATION.user_id,
    application_id: APPLICATION.id,
    name: null,
    email: null,
    linkedin_url: null,
    role: null,
    notes: null,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    ...overrides,
  };
}

interface ContactsStub {
  posted: unknown[];
  deleted: string[];
}

async function stubApplication(
  page: Page,
  initial: ApplicationContact[],
  { failWrites = false }: { failWrites?: boolean } = {},
): Promise<ContactsStub> {
  let contacts = [...initial];
  const stub: ContactsStub = { posted: [], deleted: [] };
  await stubSignedInShell(page);
  await page.route(DETAIL, (route) => route.fulfill(json({ ...APPLICATION, events: [], contacts })));
  await page.route(new RegExp(`/api/applications/${APPLICATION.id}/events`), (route) =>
    route.fulfill(json({ items: [], total: 0 })),
  );
  await page.route(/\/api\/documents(\?|$)/, (route) => route.fulfill(json({ items: [], total: 0 })));
  await page.route(new RegExp(`/api/companies/${APPLICATION.company_id}$`), (route) => route.fulfill(json(mockCompany())));
  await page.route(/\/api\/applications\?view=kanban/, (route) =>
    route.fulfill(json({ items: [], total: 0 })),
  );
  await page.route(CONTACTS, async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const body = request.postDataJSON() as Partial<ApplicationContact>;
      stub.posted.push(body);
      if (failWrites) return route.fulfill(json({ detail: "Application not found" }, 404));
      const created = contact({ id: `k-${stub.posted.length + 100}`, ...body });
      contacts = [...contacts, created];
      return route.fulfill(json(created, 201));
    }
    if (request.method() === "DELETE") {
      const contactId = request.url().split("/").pop() ?? "";
      stub.deleted.push(contactId);
      if (failWrites) return route.fulfill(json({ detail: "Server error" }, 500));
      contacts = contacts.filter(({ id }) => id !== contactId);
      return route.fulfill({ status: 204 });
    }
    return route.fallback();
  });
  return stub;
}

const SAM = contact({ id: "k-1", name: "Sam Lee", email: "sam@acme.com", role: "recruiter" });

test("on the full page: adds a contact and shows it once the application refetches", async ({ page }) => {
  const stub = await stubApplication(page, []);
  await page.goto(`/applications/${APPLICATION.id}`);

  await expect(page.getByText(/No contacts yet\. Add the recruiter/)).toBeVisible();
  await page.getByRole("button", { name: "Add contact" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a contact" });

  await dialog.getByRole("button", { name: "Add contact" }).click();
  await expect(dialog.getByText("Add a name or an email.")).toBeVisible();
  expect(stub.posted).toHaveLength(0);

  await dialog.getByLabel("Name").fill("Grace Hopper");
  await dialog.getByLabel("Email").fill("grace@acme.com");
  await dialog.getByLabel("Role").selectOption("hiring_manager");
  await dialog.getByLabel("LinkedIn profile").fill("https://www.linkedin.com/in/grace");
  await dialog.getByRole("button", { name: "Add contact" }).click();

  await expect(page.getByText("Contact added", { exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect(stub.posted).toEqual([
    { name: "Grace Hopper", email: "grace@acme.com", role: "hiring_manager", linkedin_url: "https://www.linkedin.com/in/grace" },
  ]);
  const row = page.getByTestId("contact-k-101");
  await expect(row.getByText("Grace Hopper")).toBeVisible();
  await expect(row.getByText("Hiring manager")).toBeVisible();
  await expect(page.getByText(/No contacts yet/)).toHaveCount(0);
});

test("on the full page: removes a contact only after confirming", async ({ page }) => {
  const stub = await stubApplication(page, [SAM]);
  await page.goto(`/applications/${APPLICATION.id}`);

  await page.getByRole("button", { name: "Remove Sam Lee" }).click();
  await page.getByRole("dialog", { name: "Remove this contact?" }).getByRole("button", { name: "Keep" }).click();
  await expect(page.getByTestId("contact-k-1")).toBeVisible();
  expect(stub.deleted).toHaveLength(0);

  await page.getByRole("button", { name: "Remove Sam Lee" }).click();
  await page.getByRole("dialog", { name: "Remove this contact?" }).getByRole("button", { name: "Remove" }).click();

  await expect(page.getByText("Contact removed", { exact: true })).toBeVisible();
  await expect(page.getByTestId("contact-k-1")).toHaveCount(0);
  await expect(page.getByText(/No contacts yet/)).toBeVisible();
  expect(stub.deleted).toEqual(["k-1"]);
});

test("in the kanban drawer: the same add, above the drawer", async ({ page }) => {
  const stub = await stubApplication(page, [SAM]);
  await page.goto(`/dashboard?app=${APPLICATION.id}`);

  await expect(page.getByTestId("contact-k-1")).toBeVisible();
  await page.getByRole("button", { name: "Add contact" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a contact" });
  await dialog.getByLabel("Email").fill("ada@acme.com");
  await dialog.getByRole("button", { name: "Add contact" }).click();

  await expect(page.getByText("Contact added", { exact: true })).toBeVisible();
  expect(stub.posted).toEqual([{ email: "ada@acme.com" }]);
  await expect(page.getByTestId("contact-k-101").getByText("ada@acme.com").first()).toBeVisible();
});

test("says so, and keeps the form, when the server refuses an add or a remove", async ({ page }) => {
  await stubApplication(page, [SAM], { failWrites: true });
  await page.goto(`/applications/${APPLICATION.id}`);

  await page.getByRole("button", { name: "Add contact" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a contact" });
  await dialog.getByLabel("Name").fill("Grace");
  await dialog.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByText("Couldn't add contact: Application not found", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Name")).toHaveValue("Grace");
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Remove Sam Lee" }).click();
  const confirm = page.getByRole("dialog", { name: "Remove this contact?" });
  await confirm.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Couldn't remove contact: Server error", { exact: true })).toBeVisible();
  await expect(confirm).toBeVisible();
  await expect(page.getByTestId("contact-k-1")).toBeVisible();
});

test("a remove that 404s means it's already gone: the confirm closes and it says removed", async ({ page }) => {
  await stubApplication(page, [SAM]);
  await page.route(new RegExp(`/api/applications/${APPLICATION.id}/contacts/k-1$`), (route) =>
    route.fulfill(json({ detail: "Contact not found" }, 404)),
  );
  await page.goto(`/applications/${APPLICATION.id}`);

  await page.getByRole("button", { name: "Remove Sam Lee" }).click();
  const confirm = page.getByRole("dialog", { name: "Remove this contact?" });
  await confirm.getByRole("button", { name: "Remove" }).click();

  await expect(page.getByText("Contact removed", { exact: true })).toBeVisible();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByText(/Couldn't remove contact/)).toHaveCount(0);
});
