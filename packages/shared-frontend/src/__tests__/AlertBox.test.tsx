import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AlertBox from "../components/ui/AlertBox";
import type { AlertVariant } from "../components/ui/AlertBox";

describe("AlertBox", () => {
  it.each<AlertVariant>(["error", "warning", "info", "success"])(
    "a %s box isn't announced unless the caller asks",
    (variant) => {
      render(<AlertBox variant={variant} data-testid="box">Something happened.</AlertBox>);

      expect(screen.getByTestId("box")).not.toHaveAttribute("role");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    },
  );

  it.each<"alert" | "status">(["alert", "status"])("a given role %s is passed through", (role) => {
    render(<AlertBox variant="error" role={role}>Couldn't load that.</AlertBox>);

    expect(screen.getByRole(role)).toHaveTextContent("Couldn't load that.");
  });

  it("passes other attributes through to the box", () => {
    render(
      <AlertBox variant="info" id="note" data-testid="note-box" aria-label="Note" className="mt-2">
        Saved.
      </AlertBox>,
    );

    const box = screen.getByTestId("note-box");
    expect(box).toHaveAttribute("id", "note");
    expect(box).toHaveAccessibleName("Note");
    expect(box).toHaveClass("mt-2");
  });
});
