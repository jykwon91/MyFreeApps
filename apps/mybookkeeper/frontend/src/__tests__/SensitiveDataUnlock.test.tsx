import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SensitiveDataUnlock from "@/app/features/applicants/SensitiveDataUnlock";

describe("SensitiveDataUnlock", () => {
  it("hides children by default", () => {
    render(
      <SensitiveDataUnlock>
        <p>secret content</p>
      </SensitiveDataUnlock>,
    );
    expect(screen.queryByText("secret content")).not.toBeInTheDocument();
    expect(screen.getByTestId("sensitive-data-hidden")).toBeInTheDocument();
  });

  it("renders the toggle in 'show' state initially", () => {
    render(
      <SensitiveDataUnlock>
        <p>secret content</p>
      </SensitiveDataUnlock>,
    );
    const toggle = screen.getByTestId("sensitive-data-toggle");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle).toHaveTextContent(/Show sensitive data/i);
  });

  it("reveals children when the toggle is clicked", async () => {
    const user = userEvent.setup();
    render(
      <SensitiveDataUnlock>
        <p>secret content</p>
      </SensitiveDataUnlock>,
    );

    await user.click(screen.getByTestId("sensitive-data-toggle"));

    expect(screen.getByText("secret content")).toBeInTheDocument();
    expect(screen.getByTestId("sensitive-data-revealed")).toBeInTheDocument();
    expect(screen.queryByTestId("sensitive-data-hidden")).not.toBeInTheDocument();
  });

  it("hides children again when the toggle is clicked twice", async () => {
    const user = userEvent.setup();
    render(
      <SensitiveDataUnlock>
        <p>secret content</p>
      </SensitiveDataUnlock>,
    );

    const toggle = screen.getByTestId("sensitive-data-toggle");
    await user.click(toggle);
    await user.click(toggle);

    expect(screen.queryByText("secret content")).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("respects custom labels", () => {
    render(
      <SensitiveDataUnlock showLabel="Reveal" hideLabel="Conceal">
        <p>secret</p>
      </SensitiveDataUnlock>,
    );
    expect(screen.getByTestId("sensitive-data-toggle")).toHaveTextContent(/Reveal/);
  });
});
