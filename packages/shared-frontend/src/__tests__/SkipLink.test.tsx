import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import SkipLink from "../components/layout/SkipLink";
import { MAIN_CONTENT_ID } from "../constants/main-content";

function renderPage() {
  render(
    <>
      <SkipLink />
      <button>Sidebar item</button>
      <main id={MAIN_CONTENT_ID} tabIndex={-1}>
        content
      </main>
    </>,
  );
}

describe("SkipLink", () => {
  it("is the first thing Tab reaches", async () => {
    renderPage();
    await userEvent.tab();
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveFocus();
  });

  it("moves focus to main when activated, without changing the URL", async () => {
    renderPage();
    const before = window.location.href;
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("main")).toHaveFocus();
    expect(window.location.href).toBe(before);
  });
});
