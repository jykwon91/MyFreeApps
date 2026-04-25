import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DemoWelcomeDialog from "@/app/components/DemoWelcomeDialog";

vi.mock("@/shared/hooks/useCurrentOrg", () => ({
  useCurrentOrg: vi.fn(),
}));

import { useCurrentOrg } from "@/shared/hooks/useCurrentOrg";

const STORAGE_KEY = "demo-welcome-dismissed";

function mockOrg(isDemo: boolean) {
  vi.mocked(useCurrentOrg).mockReturnValue({
    id: "org-1",
    name: "Demo Org",
    org_role: "owner",
    is_demo: isDemo,
    created_at: "2024-01-01T00:00:00Z",
  });
}

describe("DemoWelcomeDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it("renders nothing for non-demo orgs", () => {
    mockOrg(false);
    const { container } = render(<DemoWelcomeDialog />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when org is null", () => {
    vi.mocked(useCurrentOrg).mockReturnValue(null);
    const { container } = render(<DemoWelcomeDialog />);
    expect(container.innerHTML).toBe("");
  });

  it("shows welcome dialog for demo orgs", () => {
    mockOrg(true);
    render(<DemoWelcomeDialog />);
    expect(screen.getByText("Welcome to the sandbox!")).toBeInTheDocument();
  });

  it("shows sandbox description", () => {
    mockOrg(true);
    render(<DemoWelcomeDialog />);
    expect(screen.getByText(/feel free to experiment/)).toBeInTheDocument();
  });

  it("shows upload documents bullet", () => {
    mockOrg(true);
    render(<DemoWelcomeDialog />);
    expect(screen.getByText(/Upload your own documents/)).toBeInTheDocument();
  });

  it("shows test features bullet", () => {
    mockOrg(true);
    render(<DemoWelcomeDialog />);
    expect(screen.getByText(/Test out all features/)).toBeInTheDocument();
  });

  it("shows safe to change bullet", () => {
    mockOrg(true);
    render(<DemoWelcomeDialog />);
    expect(screen.getByText(/Edit, delete, or change anything/)).toBeInTheDocument();
  });

  it("shows dismiss button", () => {
    mockOrg(true);
    render(<DemoWelcomeDialog />);
    expect(screen.getByRole("button", { name: "Got it, let me explore" })).toBeInTheDocument();
  });

  it("dismisses and persists to localStorage on button click", async () => {
    mockOrg(true);
    const user = userEvent.setup();
    render(<DemoWelcomeDialog />);

    await user.click(screen.getByRole("button", { name: "Got it, let me explore" }));

    expect(screen.queryByText("Welcome to the sandbox!")).not.toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("1");
  });

  it("does not show when already dismissed in localStorage", () => {
    localStorage.setItem(STORAGE_KEY, "1");
    mockOrg(true);
    const { container } = render(<DemoWelcomeDialog />);
    expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
  });

  it("dismissed state survives re-render", async () => {
    mockOrg(true);
    const user = userEvent.setup();
    const { rerender } = render(<DemoWelcomeDialog />);

    await user.click(screen.getByRole("button", { name: "Got it, let me explore" }));
    rerender(<DemoWelcomeDialog />);

    expect(screen.queryByText("Welcome to the sandbox!")).not.toBeInTheDocument();
  });
});
