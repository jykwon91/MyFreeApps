import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InviteForm from "@/app/features/organizations/InviteForm";

const mockCreateInvite = vi.fn(() => ({
  unwrap: () => Promise.resolve({ email_sent: true }),
}));

vi.mock("@/shared/store/membersApi", () => ({
  useCreateInviteMutation: vi.fn(() => [mockCreateInvite, { isLoading: false }]),
}));

vi.mock("@/shared/hooks/useCurrentOrg", () => ({
  useActiveOrgId: vi.fn(() => "org-1"),
}));

describe("InviteForm", () => {
  const onError = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateInvite.mockReturnValue({
      unwrap: () => Promise.resolve({ email_sent: true }),
    });
  });

  it("renders email input and role selector", () => {
    render(<InviteForm onError={onError} onSuccess={onSuccess} />);

    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByLabelText("Role")).toBeInTheDocument();
    expect(screen.getByText("Send invite")).toBeInTheDocument();
  });

  it("submits invite with email and role", async () => {
    const user = userEvent.setup();
    render(<InviteForm onError={onError} onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText("Email address"), "new@test.com");
    await user.click(screen.getByText("Send invite"));

    expect(mockCreateInvite).toHaveBeenCalledWith({
      orgId: "org-1",
      email: "new@test.com",
      orgRole: "user",
    });
  });

  it("calls onSuccess with email sent message when email succeeds", async () => {
    const user = userEvent.setup();
    render(<InviteForm onError={onError} onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText("Email address"), "new@test.com");
    await user.click(screen.getByText("Send invite"));

    expect(onSuccess).toHaveBeenCalledWith("Invite sent to new@test.com");
  });

  it("calls onSuccess with manual share message when email fails", async () => {
    mockCreateInvite.mockReturnValueOnce({
      unwrap: () => Promise.resolve({ email_sent: false }),
    });

    const user = userEvent.setup();
    render(<InviteForm onError={onError} onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText("Email address"), "new@test.com");
    await user.click(screen.getByText("Send invite"));

    expect(onSuccess).toHaveBeenCalledWith(
      "Invite created for new@test.com, but the email could not be sent. Share the invite link manually."
    );
  });

  it("shows role help text below the role selector", () => {
    render(<InviteForm onError={onError} onSuccess={onSuccess} />);

    expect(screen.getByText("Admins can manage members and settings. Users can view and add transactions. Viewers have read-only access.")).toBeInTheDocument();
  });

  it("includes Viewer as a role option", () => {
    render(<InviteForm onError={onError} onSuccess={onSuccess} />);

    const select = screen.getByLabelText("Role") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain("viewer");
  });

  it("calls onError when invite fails", async () => {
    mockCreateInvite.mockReturnValueOnce({
      unwrap: () => Promise.reject({ data: { detail: "Already invited" } }),
    });

    const user = userEvent.setup();
    render(<InviteForm onError={onError} onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText("Email address"), "new@test.com");
    await user.click(screen.getByText("Send invite"));

    expect(onError).toHaveBeenCalledWith("Already invited");
  });
});
