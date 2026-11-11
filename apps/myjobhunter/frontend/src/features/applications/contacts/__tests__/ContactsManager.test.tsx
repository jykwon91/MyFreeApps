/**
 * ContactsManager — the contacts list shared by the drawer and the full page.
 *
 * Covers: the empty state, listing (with unsafe links shown as text), adding
 * (request body, validation, field limits, in-flight button, failure), and
 * removing (confirm, cancel, in-flight button, failure).
 *
 * The mutation hooks are stand-ins that track `isLoading` the way RTK Query
 * does, so the in-flight states are exercised.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ApplicationContact } from "@myjobhunter/api-client/types/contact/application-contact";
import type { ApplicationContactCreateRequest } from "@myjobhunter/api-client/types/contact/application-contact-create-request";
import {
  CONTACT_EMAIL_MAX_LENGTH,
  CONTACT_LINKEDIN_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  CONTACT_NOTES_MAX_LENGTH,
} from "@myjobhunter/api-client/constants/contactFieldLimits";
import { CONTACT_MESSAGES as MESSAGES } from "@/constants/contact-messages";
import { CONTACT_FIELD_PROBLEM_MESSAGES as PROBLEMS } from "@/constants/contact-field-problem-messages";

type AddArg = { applicationId: string; body: ApplicationContactCreateRequest };
type RemoveArg = { applicationId: string; contactId: string };

const addImpl = vi.fn<(arg: AddArg) => Promise<unknown>>();
const removeImpl = vi.fn<(arg: RemoveArg) => Promise<unknown>>();

vi.mock("@myjobhunter/api-client/store/applicationsApi", async () => {
  const { useState } = await import("react");
  function stateful<Arg>(impl: (arg: Arg) => Promise<unknown>) {
    return () => {
      const [isLoading, setIsLoading] = useState(false);
      const trigger = (arg: Arg) => {
        setIsLoading(true);
        const pending = impl(arg);
        return { unwrap: () => pending.finally(() => setIsLoading(false)) };
      };
      return [trigger, { isLoading }] as const;
    };
  }
  return {
    useAddApplicationContactMutation: stateful<AddArg>((arg) => addImpl(arg)),
    useRemoveApplicationContactMutation: stateful<RemoveArg>((arg) => removeImpl(arg)),
  };
});

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    showSuccess: vi.fn(),
    showError: vi.fn(),
    extractErrorMessage: (err: unknown) => (err as { message?: string }).message ?? "error",
    Badge: ({ label }: { label: string }) => <span>{label}</span>,
  };
});

vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return { ...actual, Portal: ({ children }: { children: React.ReactNode }) => children };
});

import { showError, showSuccess } from "@platform/ui";
import ContactsManager from "../ContactsManager";

const APP_ID = "app-1";
const TIMESTAMP = "2026-11-01T00:00:00Z";

function contact(overrides: Partial<ApplicationContact> & Pick<ApplicationContact, "id">): ApplicationContact {
  return {
    user_id: "u1",
    application_id: APP_ID,
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

const SAM = contact({
  id: "k-1",
  name: "Sam Lee",
  email: "sam@stripe.com",
  role: "recruiter",
  linkedin_url: "https://linkedin.com/in/sam",
  notes: "Prefers email.",
});

function deferred() {
  let resolve: (value: unknown) => void = () => undefined;
  const promise = new Promise<unknown>((r) => (resolve = r));
  return { promise, resolve };
}

function renderManager(contacts: ApplicationContact[] = [SAM]) {
  return render(<ContactsManager applicationId={APP_ID} contacts={contacts} />);
}

async function openAddDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: MESSAGES.add }));
  return screen.getByRole("dialog", { name: MESSAGES.dialogTitle });
}

beforeEach(() => {
  vi.clearAllMocks();
  addImpl.mockReset().mockResolvedValue({});
  removeImpl.mockReset().mockResolvedValue(undefined);
});

describe("ContactsManager list", () => {
  it("says there are none, and how to add one, when the application has no contacts", () => {
    renderManager([]);
    expect(screen.getByText(MESSAGES.none)).toBeInTheDocument();
    expect(screen.getByText("(0)")).toBeInTheDocument();
    expect(screen.queryByText(/full application page/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: MESSAGES.add })).toBeInTheDocument();
  });

  it("shows each contact with safe links, and unsafe values as plain text", () => {
    const eve = contact({ id: "k-2", name: "Eve", email: "javascript:alert(1)", linkedin_url: "javascript:alert(2)" });
    renderManager([SAM, eve]);

    const sam = screen.getByTestId("contact-k-1");
    expect(within(sam).getByText("Recruiter")).toBeInTheDocument();
    expect(within(sam).getByRole("link", { name: MESSAGES.emailLinkLabel("Sam Lee") })).toHaveAttribute("href", "mailto:sam@stripe.com");
    expect(within(sam).getByRole("link", { name: MESSAGES.linkedInLinkLabel("Sam Lee") })).toHaveAttribute("href", "https://linkedin.com/in/sam");

    const evil = screen.getByTestId("contact-k-2");
    expect(within(evil).queryAllByRole("link")).toHaveLength(0);
    expect(within(evil).getByText("javascript:alert(1)")).toBeInTheDocument();
  });
});

describe("adding a contact", () => {
  it("sends the trimmed fields for this application, toasts, and closes", async () => {
    const user = userEvent.setup();
    renderManager([]);
    const dialog = await openAddDialog(user);

    await user.type(within(dialog).getByLabelText(MESSAGES.nameLabel), "  Sam Lee ");
    await user.type(within(dialog).getByLabelText(MESSAGES.emailLabel), "sam@stripe.com");
    await user.selectOptions(within(dialog).getByLabelText(MESSAGES.roleLabel), "hiring_manager");
    await user.type(within(dialog).getByLabelText(MESSAGES.linkedInLabel), "https://linkedin.com/in/sam");
    await user.type(within(dialog).getByLabelText(MESSAGES.notesLabel), "Met at the meetup.");
    await user.click(within(dialog).getByRole("button", { name: MESSAGES.submit }));

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(MESSAGES.added));
    expect(addImpl).toHaveBeenCalledTimes(1);
    expect(addImpl).toHaveBeenCalledWith({
      applicationId: APP_ID,
      body: {
        name: "Sam Lee",
        email: "sam@stripe.com",
        role: "hiring_manager",
        linkedin_url: "https://linkedin.com/in/sam",
        notes: "Met at the meetup.",
      },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("leaves out blank optional fields", async () => {
    const user = userEvent.setup();
    renderManager([]);
    const dialog = await openAddDialog(user);
    await user.type(within(dialog).getByLabelText(MESSAGES.emailLabel), "sam@stripe.com");
    await user.click(within(dialog).getByRole("button", { name: MESSAGES.submit }));
    await waitFor(() => expect(addImpl).toHaveBeenCalledWith({ applicationId: APP_ID, body: { email: "sam@stripe.com" } }));
  });

  it("asks for a name or an email, and checks the email and link, before sending", async () => {
    const user = userEvent.setup();
    renderManager([]);
    const dialog = await openAddDialog(user);

    await user.click(within(dialog).getByRole("button", { name: MESSAGES.submit }));
    expect(await within(dialog).findByText(PROBLEMS.name.identity_required ?? "")).toBeInTheDocument();
    expect(within(dialog).getByLabelText(MESSAGES.nameLabel)).toHaveAttribute("aria-invalid", "true");

    await user.type(within(dialog).getByLabelText(MESSAGES.emailLabel), "sam at stripe");
    await user.type(within(dialog).getByLabelText(MESSAGES.linkedInLabel), "javascript:alert(1)");
    await user.click(within(dialog).getByRole("button", { name: MESSAGES.submit }));
    expect(await within(dialog).findByText(PROBLEMS.email.invalid ?? "")).toBeInTheDocument();
    expect(within(dialog).getByText(PROBLEMS.linkedin_url.invalid ?? "")).toBeInTheDocument();
    expect(addImpl).not.toHaveBeenCalled();
  });

  it("says a pasted value is too long, rather than cutting it, and sends nothing", async () => {
    const user = userEvent.setup();
    renderManager([]);
    const dialog = await openAddDialog(user);
    const paste = async (label: string, text: string) => {
      await user.click(within(dialog).getByLabelText(label));
      await user.paste(text);
    };
    await paste(MESSAGES.nameLabel, "n".repeat(CONTACT_NAME_MAX_LENGTH + 1));
    await paste(MESSAGES.emailLabel, `${"e".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(58)}.com`);
    await paste(MESSAGES.linkedInLabel, `https://${"l".repeat(CONTACT_LINKEDIN_MAX_LENGTH)}`);
    await paste(MESSAGES.notesLabel, "o".repeat(CONTACT_NOTES_MAX_LENGTH + 1));
    expect(within(dialog).getByLabelText(MESSAGES.nameLabel)).not.toHaveAttribute("maxLength");
    expect((within(dialog).getByLabelText(MESSAGES.emailLabel) as HTMLInputElement).value).toHaveLength(CONTACT_EMAIL_MAX_LENGTH + 1);
    await user.click(within(dialog).getByRole("button", { name: MESSAGES.submit }));

    expect(await within(dialog).findByText(PROBLEMS.name.too_long ?? "")).toBeInTheDocument();
    expect(within(dialog).getByText(PROBLEMS.email.too_long ?? "")).toBeInTheDocument();
    expect(within(dialog).getByText(PROBLEMS.linkedin_url.too_long ?? "")).toBeInTheDocument();
    expect(within(dialog).getByText(PROBLEMS.notes.too_long ?? "")).toBeInTheDocument();
    expect(addImpl).not.toHaveBeenCalled();
  });

  it("adds https:// to a LinkedIn link pasted without one", async () => {
    const user = userEvent.setup();
    renderManager([]);
    const dialog = await openAddDialog(user);
    await user.type(within(dialog).getByLabelText(MESSAGES.nameLabel), "Sam");
    await user.type(within(dialog).getByLabelText(MESSAGES.linkedInLabel), "linkedin.com/in/sam");
    await user.click(within(dialog).getByRole("button", { name: MESSAGES.submit }));
    await waitFor(() =>
      expect(addImpl).toHaveBeenCalledWith({ applicationId: APP_ID, body: { name: "Sam", linkedin_url: "https://linkedin.com/in/sam" } }),
    );
  });

  it("puts the server's 422 reason under the field it names", async () => {
    addImpl.mockRejectedValue({
      status: 422,
      data: { detail: [{ loc: ["body", "email"], msg: "value is not a valid email address: bad domain", type: "value_error" }] },
    });
    const user = userEvent.setup();
    renderManager([]);
    const dialog = await openAddDialog(user);
    await user.type(within(dialog).getByLabelText(MESSAGES.emailLabel), "sam@stripe.com");
    await user.click(within(dialog).getByRole("button", { name: MESSAGES.submit }));

    expect(await within(dialog).findByText("value is not a valid email address: bad domain")).toBeInTheDocument();
    expect(within(dialog).getByLabelText(MESSAGES.emailLabel)).toHaveAttribute("aria-invalid", "true");
    expect(showError).toHaveBeenCalled();
  });

  it("opens blank again after a cancel or a successful add", async () => {
    const user = userEvent.setup();
    renderManager([]);
    let dialog = await openAddDialog(user);
    await user.type(within(dialog).getByLabelText(MESSAGES.nameLabel), "Draft");
    await user.click(within(dialog).getByRole("button", { name: MESSAGES.cancel }));
    dialog = await openAddDialog(user);
    expect(within(dialog).getByLabelText(MESSAGES.nameLabel)).toHaveValue("");

    await user.type(within(dialog).getByLabelText(MESSAGES.nameLabel), "Sam");
    await user.click(within(dialog).getByRole("button", { name: MESSAGES.submit }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    dialog = await openAddDialog(user);
    expect(within(dialog).getByLabelText(MESSAGES.nameLabel)).toHaveValue("");
  });

  it("shows the add in flight at once and holds both buttons until it lands", async () => {
    const pending = deferred();
    addImpl.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    renderManager([]);
    const dialog = await openAddDialog(user);
    await user.type(within(dialog).getByLabelText(MESSAGES.nameLabel), "Sam");
    await user.click(within(dialog).getByRole("button", { name: MESSAGES.submit }));

    expect(await within(dialog).findByRole("button", { name: MESSAGES.submitting })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: MESSAGES.cancel })).toBeDisabled();
    pending.resolve({});
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the dialog and what was typed, and says why, when the add fails", async () => {
    addImpl.mockRejectedValue(new Error("Application not found"));
    const user = userEvent.setup();
    renderManager([]);
    const dialog = await openAddDialog(user);
    await user.type(within(dialog).getByLabelText(MESSAGES.nameLabel), "Sam");
    await user.click(within(dialog).getByRole("button", { name: MESSAGES.submit }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith(MESSAGES.couldntAdd("Application not found")));
    expect(showSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: MESSAGES.dialogTitle })).toBeInTheDocument();
    expect(within(dialog).getByLabelText(MESSAGES.nameLabel)).toHaveValue("Sam");
    expect(within(dialog).getByRole("button", { name: MESSAGES.submit })).toBeEnabled();
  });
});

describe("removing a contact", () => {
  async function askToRemove(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: MESSAGES.removeLabel("Sam Lee") }));
    return screen.getByRole("dialog", { name: MESSAGES.removeTitle });
  }

  it("removes it from this application after confirming, then toasts", async () => {
    const user = userEvent.setup();
    renderManager();
    const dialog = await askToRemove(user);
    expect(within(dialog).getByText(MESSAGES.removeBody("Sam Lee"))).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: MESSAGES.remove }));

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(MESSAGES.removed));
    expect(removeImpl).toHaveBeenCalledWith({ applicationId: APP_ID, contactId: "k-1" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("does nothing when they keep it", async () => {
    const user = userEvent.setup();
    renderManager();
    const dialog = await askToRemove(user);
    await user.click(within(dialog).getByRole("button", { name: MESSAGES.keep }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(removeImpl).not.toHaveBeenCalled();
  });

  it("shows the removal in flight at once and holds the buttons", async () => {
    const pending = deferred();
    removeImpl.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    renderManager();
    const dialog = await askToRemove(user);
    await user.click(within(dialog).getByRole("button", { name: MESSAGES.remove }));

    expect(await within(dialog).findByRole("button", { name: /Processing/ })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: MESSAGES.keep })).toBeDisabled();
    pending.resolve(undefined);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("treats a 404 as already removed: closes the confirm and says it's removed", async () => {
    removeImpl.mockRejectedValue({ status: 404, data: { detail: "Contact not found" } });
    const user = userEvent.setup();
    renderManager();
    const dialog = await askToRemove(user);
    await user.click(within(dialog).getByRole("button", { name: MESSAGES.remove }));

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(MESSAGES.removed));
    expect(showError).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("says why and keeps the confirm open when the removal fails", async () => {
    removeImpl.mockRejectedValue(new Error("Server error"));
    const user = userEvent.setup();
    renderManager();
    const dialog = await askToRemove(user);
    await user.click(within(dialog).getByRole("button", { name: MESSAGES.remove }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith(MESSAGES.couldntRemove("Server error")));
    expect(showSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: MESSAGES.removeTitle })).toBeInTheDocument();
  });
});
