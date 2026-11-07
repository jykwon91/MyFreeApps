import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Login from "@/pages/Login";
import { TRIAGE_PAGE_PATH } from "@/games/wow-forever/data/featureRequests/triage/triageConfig";

vi.mock("@/lib/serveOnly", () => ({ isServeOnly: () => true }));

vi.mock("@/lib/auth", () => ({
  signIn: vi.fn(),
  requestVerifyToken: vi.fn(),
}));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return { ...actual, useIsAuthenticated: vi.fn(() => false) };
});

import { signIn } from "@/lib/auth";

const mockSignIn = vi.mocked(signIn);

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<div>Home</div>} />
        <Route path={TRIAGE_PAGE_PATH} element={<div>Triage screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Login page in the serve-only build", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers no password reset (prod has no reset flow)", () => {
    renderLogin();
    expect(screen.queryByRole("link", { name: /forgot password/i })).not.toBeInTheDocument();
  });

  it("lands on triage after signing in from /login directly", async () => {
    mockSignIn.mockResolvedValueOnce({ status: "ok" } as Awaited<ReturnType<typeof signIn>>);
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText("Email"), "operator@fixture.test");
    await user.type(screen.getByLabelText("Password"), "fixture-password-123");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByText("Triage screen")).toBeInTheDocument();
  });
});
