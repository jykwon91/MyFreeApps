import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmDialogFocusList from "./ConfirmDialogFocusList";
import ConfirmDialogFocusEditor from "./ConfirmDialogFocusEditor";

async function archive(name: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: `Archive ${name}` }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Archive" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  return user;
}

afterEach(() => vi.restoreAllMocks());

describe("ConfirmDialog — focus after closing", () => {
  it("returns focus to the opener on Cancel", async () => {
    render(<ConfirmDialogFocusList initialItems={["a", "b"]} removal="now" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Archive a" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Archive a" })).toHaveFocus());
  });

  it("returns focus to the opener on Escape", async () => {
    render(<ConfirmDialogFocusList initialItems={["a", "b"]} removal="now" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Archive a" }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Archive a" })).toHaveFocus());
  });

  it("moves to the next row's matching control when confirming removes the opener", async () => {
    render(<ConfirmDialogFocusList initialItems={["a", "b", "c"]} removal="now" />);
    await archive("b");
    await waitFor(() => expect(screen.getByRole("button", { name: "Archive c" })).toHaveFocus());
  });

  it("moves to the previous row when the last row is removed", async () => {
    render(<ConfirmDialogFocusList initialItems={["a", "b"]} removal="now" />);
    await archive("b");
    await waitFor(() => expect(screen.getByRole("button", { name: "Archive a" })).toHaveFocus());
  });

  it("goes to the fallback when no row is left", async () => {
    render(<ConfirmDialogFocusList initialItems={["a"]} removal="now" withFallback />);
    await archive("a");
    await waitFor(() => expect(screen.getByRole("button", { name: "New" })).toHaveFocus());
  });

  it("follows a row that's removed later, once the list reloads", async () => {
    render(<ConfirmDialogFocusList initialItems={["a", "b", "c"]} removal="later" />);
    await archive("b");
    await waitFor(() => expect(screen.getByRole("button", { name: "Archive b" })).toHaveFocus());
    // Removing the row without moving focus, as a background refetch would.
    screen.getByRole("button", { name: "Reload" }).click();
    await waitFor(() => expect(screen.queryByText("b")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Archive c" })).toHaveFocus());
  });

  it("leaves focus alone if the user moved on before the row was removed", async () => {
    render(<ConfirmDialogFocusList initialItems={["a", "b"]} removal="later" />);
    const user = await archive("a");
    await waitFor(() => expect(screen.getByRole("button", { name: "Archive a" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(screen.queryByText("a")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Reload" })).toHaveFocus();
  });

  it("skips a neighbour that won't take focus and tries the other side", async () => {
    render(<ConfirmDialogFocusList initialItems={["a", "b", "c"]} removal="now" />);
    // As if the next row were hidden: focusing it does nothing.
    Object.defineProperty(screen.getByRole("button", { name: "Archive c" }), "focus", { value: () => undefined });
    await archive("b");
    await waitFor(() => expect(screen.getByRole("button", { name: "Archive a" })).toHaveFocus());
  });

  it("doesn't take a button after the rows for a row", async () => {
    render(<ConfirmDialogFocusList initialItems={["a", "b"]} removal="now" withLoadMore />);
    await archive("b");
    await waitFor(() => expect(screen.getByRole("button", { name: "Archive a" })).toHaveFocus());
  });

  it("stops watching once the user clicks elsewhere", async () => {
    render(<ConfirmDialogFocusList initialItems={["a", "b"]} removal="later" />);
    const user = await archive("a");
    await waitFor(() => expect(screen.getByRole("button", { name: "Archive a" })).toHaveFocus());
    await user.click(screen.getByText("b"));
    screen.getByRole("button", { name: "Reload" }).click();
    await waitFor(() => expect(screen.queryByText("a")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Archive b" })).not.toHaveFocus();
  });

  it("leaves focus where the caller put it after confirming", async () => {
    render(<ConfirmDialogFocusEditor />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Rename" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveFocus();
  });

  it("returns focus but starts no watcher when the dialog unmounts as it closes", async () => {
    render(<ConfirmDialogFocusEditor mountWhileOpen />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = await screen.findByRole("dialog");
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Open" })).toHaveFocus());
    expect(observe.mock.calls.filter(([target]) => target === document.body)).toHaveLength(0);
  });
});
