import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";

describe("LoadErrorAlert", () => {
  it("says what didn't load and retries on click", async () => {
    const onRetry = vi.fn();
    render(<LoadErrorAlert message="I couldn't load your tenants." isRetrying={false} onRetry={onRetry} />);

    expect(screen.getByText("I couldn't load your tenants.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("never submits a form it sits in", async () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <LoadErrorAlert message="I couldn't load your tenants." isRetrying={false} onRetry={vi.fn()} />
      </form>,
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the retry is in flight and ignores more clicks", async () => {
    const onRetry = vi.fn();
    render(<LoadErrorAlert message="I couldn't load your tenants." isRetrying onRetry={onRetry} />);

    const button = screen.getByRole("button", { name: /Retrying/ });
    expect(button).toBeDisabled();
    await userEvent.setup().click(button);
    expect(onRetry).not.toHaveBeenCalled();
  });
});
