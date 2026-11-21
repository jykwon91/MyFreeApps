/**
 * CreateInviteDialog is a modal dialog: it is named by its heading, takes
 * focus on open, and Escape or a backdrop click closes it like Cancel.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreateInviteDialog from "../CreateInviteDialog";

const createInvite = vi.fn();

vi.mock("@myjobhunter/api-client/store/invitesApi", () => ({
  useCreateInviteMutation: () => [createInvite, { isLoading: false }],
}));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return { ...actual, showSuccess: vi.fn(), showError: vi.fn() };
});

describe("CreateInviteDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing while closed", () => {
    render(<CreateInviteDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is a dialog named and described by its heading and text, with focus on the email field", () => {
    render(<CreateInviteDialog open onOpenChange={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Invite someone to MyJobHunter" });
    expect(dialog).toHaveAccessibleDescription(/one-time link to register/);
    expect(screen.getByLabelText("Email")).toHaveFocus();
  });

  it("closes on Escape without sending, and forgets the typed address", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { rerender } = render(<CreateInviteDialog open onOpenChange={onOpenChange} />);
    await user.type(screen.getByLabelText("Email"), "a@example.com");

    await user.keyboard("{Escape}");

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(createInvite).not.toHaveBeenCalled();
    rerender(<CreateInviteDialog open={false} onOpenChange={onOpenChange} />);
    rerender(<CreateInviteDialog open onOpenChange={onOpenChange} />);
    expect(screen.getByLabelText("Email")).toHaveValue("");
  });

  it("closes on a click on the backdrop but not on the dialog itself", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<CreateInviteDialog open onOpenChange={onOpenChange} />);
    const dialog = screen.getByRole("dialog");

    await user.click(dialog);
    expect(onOpenChange).not.toHaveBeenCalled();

    await user.click(dialog.parentElement as HTMLElement);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
