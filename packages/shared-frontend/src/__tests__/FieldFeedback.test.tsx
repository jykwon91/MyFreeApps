import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FieldFeedback from "../components/ui/FieldFeedback";
import { fieldFeedbackAria } from "../components/ui/fieldFeedbackAria";

const ERROR = "Keep this to 5,000 characters or fewer.";

function Field({ counter }: { counter: string }) {
  const feedback = { id: "notes", error: ERROR, counter };
  return (
    <>
      <textarea id="notes" aria-label="Notes" {...fieldFeedbackAria(feedback)} />
      <FieldFeedback {...feedback} />
    </>
  );
}

describe("FieldFeedback", () => {
  it("renders nothing without an error or a counter", () => {
    const { container } = render(<FieldFeedback id="x" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("makes only the error an alert, and links both to the control", () => {
    render(<Field counter="5,100 / 5,000" />);

    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(ERROR);
    const control = screen.getByLabelText("Notes");
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(control).toHaveAccessibleDescription(`${ERROR} 5,100 / 5,000`);
  });

  it("keeps the alert's text the same while the counter changes between two over-limit values", () => {
    const { rerender } = render(<Field counter="5,100 / 5,000" />);
    const first = screen.getByRole("alert").textContent;
    rerender(<Field counter="5,101 / 5,000" />);

    expect(screen.getByRole("alert").textContent).toBe(first);
    expect(screen.getByText("5,101 / 5,000")).not.toHaveAttribute("role");
  });

  it("describes a control by its counter alone when there is no error", () => {
    expect(fieldFeedbackAria({ id: "n", counter: "4,600 / 5,000" })).toEqual({ "aria-describedby": "n-counter" });
    expect(fieldFeedbackAria({ id: "n" })).toEqual({});
  });
});
