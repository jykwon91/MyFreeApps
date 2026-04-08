import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RequireOrgRole from "@/shared/components/RequireOrgRole";

vi.mock("@/shared/hooks/useOrgRole", () => ({
  useOrgRole: vi.fn(),
  useCanWrite: vi.fn(() => true),
}));

import { useOrgRole } from "@/shared/hooks/useOrgRole";

describe("RequireOrgRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders children when user has required role", () => {
    vi.mocked(useOrgRole).mockReturnValue("owner");

    render(
      <MemoryRouter>
        <RequireOrgRole roles={["owner", "admin"]}>
          <div>Protected content</div>
        </RequireOrgRole>
      </MemoryRouter>,
    );

    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });

  it("redirects when user does not have required role", () => {
    vi.mocked(useOrgRole).mockReturnValue("user");

    render(
      <MemoryRouter>
        <RequireOrgRole roles={["owner", "admin"]}>
          <div>Protected content</div>
        </RequireOrgRole>
      </MemoryRouter>,
    );

    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("shows skeleton when role is not yet loaded", () => {
    vi.mocked(useOrgRole).mockReturnValue(null);

    const { container } = render(
      <MemoryRouter>
        <RequireOrgRole roles={["owner"]}>
          <div>Protected content</div>
        </RequireOrgRole>
      </MemoryRouter>,
    );

    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });
});
