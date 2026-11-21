import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResendStatusAlert from "../components/auth/ResendStatusAlert";
import type { ResendStatus } from "../types/resend-status";

const SENT = "Verification email sent. Check your inbox.";
const FAILED = "Couldn't resend right now. Try again shortly.";

function Harness({ send }: { send: () => Promise<void> }) {
  const [status, setStatus] = useState<ResendStatus>("idle");
  async function onResend() {
    setStatus("sending");
    try {
      await send();
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }
  return <ResendStatusAlert status={status} onResend={onResend} />;
}

describe("ResendStatusAlert", () => {
  it("keeps both message regions on the page before anything is sent", () => {
    render(<ResendStatusAlert status="idle" onResend={vi.fn()} />);

    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "Resend verification email" })).toBeEnabled();
  });

  it("says the email was sent in the status region and keeps focus on the button", async () => {
    const user = userEvent.setup();
    render(<Harness send={() => Promise.resolve()} />);

    await user.click(screen.getByRole("button", { name: "Resend verification email" }));

    expect(await screen.findByRole("status")).toHaveTextContent(SENT);
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "Resend verification email" })).toHaveFocus();
  });

  it("says the resend failed in the alert region and leaves the button to try again", async () => {
    const user = userEvent.setup();
    render(<Harness send={() => Promise.reject(new Error("down"))} />);

    await user.click(screen.getByRole("button", { name: "Resend verification email" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(FAILED);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    const button = screen.getByRole("button", { name: "Resend verification email" });
    expect(button).toBeEnabled();
    expect(button).toHaveFocus();
  });

  it("gives focus back to the button when the browser dropped it while sending", async () => {
    const { rerender } = render(<ResendStatusAlert status="sending" onResend={vi.fn()} />);
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);

    rerender(<ResendStatusAlert status="sent" onResend={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Resend verification email" })).toHaveFocus(),
    );
  });

  it("doesn't take focus from somewhere else the user moved to", () => {
    const page = (status: ResendStatus) => (
      <>
        <input aria-label="Email" />
        <ResendStatusAlert status={status} onResend={vi.fn()} />
      </>
    );
    const { rerender } = render(page("sending"));
    screen.getByLabelText("Email").focus();

    rerender(page("sent"));

    expect(screen.getByLabelText("Email")).toHaveFocus();
  });
});
