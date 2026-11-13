/**
 * StandaloneLayout / StandaloneMain — the one main landmark of a page an app
 * renders outside its shell (login, support, 404), and of a screen shown in
 * place of the shell.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, Link, RouterProvider } from "react-router-dom";
import StandaloneLayout from "../components/layout/StandaloneLayout";
import StandaloneMain from "../components/layout/StandaloneMain";

function renderStandalone(path: string) {
  const router = createMemoryRouter(
    [
      {
        element: <StandaloneLayout />,
        children: [
          { path: "/login", element: <Link to="/forgot-password">Forgot password?</Link> },
          { path: "/forgot-password", element: <h1>Reset your password</h1> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

describe("StandaloneLayout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("wraps the matched page in exactly one main landmark", () => {
    renderStandalone("/login");

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("main")).toContainElement(screen.getByRole("link", { name: "Forgot password?" }));
  });

  it("scrolls back to the top on a new path, as the shells do", async () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    renderStandalone("/login");
    const main = screen.getByRole("main");
    main.scrollTop = 400;

    await userEvent.click(screen.getByRole("link", { name: "Forgot password?" }));

    expect(await screen.findByRole("heading", { name: "Reset your password" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toBe(main);
    expect(main.scrollTop).toBe(0);
  });

  it("also puts the window back at the top on a new path, for an app whose window scrolls (MBK)", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    renderStandalone("/login");
    scrollTo.mockClear();

    await userEvent.click(screen.getByRole("link", { name: "Forgot password?" }));

    expect(await screen.findByRole("heading", { name: "Reset your password" })).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });
});

describe("StandaloneMain", () => {
  it("renders its children in one main landmark that scrolls itself, with no router", () => {
    render(
      <StandaloneMain>
        <p>Something went wrong</p>
      </StandaloneMain>,
    );

    const main = screen.getByRole("main");
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(main).toHaveTextContent("Something went wrong");
    expect(main).toHaveClass("h-full", "overflow-y-auto");
  });
});
