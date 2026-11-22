/**
 * A form with unsaved changes asks before in-app navigation, Cancel or closing the tab throws
 * them away; Keep editing stays, Discard goes; nothing asks when nothing changed, and leaving
 * after a save isn't stopped.
 */
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, Outlet, RouterProvider, createMemoryRouter, useNavigate } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DISCARD_MESSAGES } from "@platform/core/constants/discard";
import UnsavedChangesDialog from "../components/ui/UnsavedChangesDialog";
import { useUnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";

function Editor() {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const guard = useUnsavedChangesGuard(text !== "");
  return (
    <>
      <label>
        Note
        <input value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <Link to="/elsewhere">Elsewhere</Link>
      <button type="button" onClick={() => guard.requestLeave(() => navigate("/cancelled"))}>
        Cancel
      </button>
      <button type="button" onClick={() => guard.leaveWithoutAsking(() => navigate("/saved"))}>
        Save
      </button>
      <UnsavedChangesDialog
        open={guard.isAsking}
        copy={DISCARD_MESSAGES}
        onKeepEditing={guard.keepEditing}
        onDiscard={guard.discard}
      />
    </>
  );
}

function renderEditor() {
  const router = createMemoryRouter(
    [
      { path: "/edit", element: <Editor /> },
      { path: "/elsewhere", element: <p>Elsewhere page</p> },
      { path: "/cancelled", element: <p>Cancelled page</p> },
      { path: "/saved", element: <p>Saved page</p> },
    ],
    { initialEntries: ["/edit"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

function dialog() {
  return screen.queryByRole("alertdialog", { name: DISCARD_MESSAGES.discardTitle });
}

describe("useUnsavedChangesGuard", () => {
  it("lets an untouched form go without asking", async () => {
    renderEditor();
    await userEvent.click(screen.getByRole("link", { name: "Elsewhere" }));
    expect(await screen.findByText("Elsewhere page")).toBeInTheDocument();
  });

  it("asks before a link leaves unsaved changes, and Keep editing stays with them", async () => {
    const router = renderEditor();
    await userEvent.type(screen.getByLabelText("Note"), "half typed");
    await userEvent.click(screen.getByRole("link", { name: "Elsewhere" }));

    expect(dialog()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: DISCARD_MESSAGES.keepEditing })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: DISCARD_MESSAGES.keepEditing }));

    expect(dialog()).toBeNull();
    expect(router.state.location.pathname).toBe("/edit");
    expect(screen.getByLabelText("Note")).toHaveValue("half typed");
    // Focus goes back to what asked to leave.
    expect(screen.getByRole("link", { name: "Elsewhere" })).toHaveFocus();
  });

  it("Escape means Keep editing", async () => {
    renderEditor();
    await userEvent.type(screen.getByLabelText("Note"), "x");
    await userEvent.click(screen.getByRole("link", { name: "Elsewhere" }));
    await userEvent.keyboard("{Escape}");
    expect(dialog()).toBeNull();
    expect(screen.getByLabelText("Note")).toHaveValue("x");
  });

  it("Discard follows the link", async () => {
    renderEditor();
    await userEvent.type(screen.getByLabelText("Note"), "x");
    await userEvent.click(screen.getByRole("link", { name: "Elsewhere" }));
    await userEvent.click(screen.getByRole("button", { name: DISCARD_MESSAGES.discard }));
    expect(await screen.findByText("Elsewhere page")).toBeInTheDocument();
  });

  it("asks before Back throws the changes away", async () => {
    const router = createMemoryRouter(
      [
        { path: "/", element: <p>Start page</p> },
        { path: "/edit", element: <Editor /> },
      ],
      { initialEntries: ["/", "/edit"], initialIndex: 1 },
    );
    render(<RouterProvider router={router} />);
    await userEvent.type(screen.getByLabelText("Note"), "x");
    await router.navigate(-1);
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: DISCARD_MESSAGES.discard }));
    expect(await screen.findByText("Start page")).toBeInTheDocument();
  });

  it("asks before Cancel, and runs it on Discard", async () => {
    renderEditor();
    await userEvent.type(screen.getByLabelText("Note"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(dialog()).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: DISCARD_MESSAGES.discard }));
    expect(await screen.findByText("Cancelled page")).toBeInTheDocument();
  });

  it("doesn't stop leaving after a save", async () => {
    renderEditor();
    await userEvent.type(screen.getByLabelText("Note"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved page")).toBeInTheDocument();
    expect(dialog()).toBeNull();
  });

  it("gets the browser's prompt on closing the tab only while there are changes", async () => {
    renderEditor();
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    await userEvent.type(screen.getByLabelText("Note"), "x");
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it("drops the tab-close prompt before a Discarded Cancel leaves the site", async () => {
    // Cancel on a page opened directly goes Back, off the site, which fires beforeunload.
    let prompted: boolean | null = null;
    function OffSiteEditor() {
      const [text, setText] = useState("");
      const guard = useUnsavedChangesGuard(text !== "");
      function leaveSite() {
        const unload = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(unload);
        prompted = unload.defaultPrevented;
      }
      return (
        <>
          <label>
            Note
            <input value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <button type="button" onClick={() => guard.requestLeave(leaveSite)}>
            Cancel
          </button>
          <UnsavedChangesDialog
            open={guard.isAsking}
            copy={DISCARD_MESSAGES}
            onKeepEditing={guard.keepEditing}
            onDiscard={guard.discard}
          />
        </>
      );
    }
    const router = createMemoryRouter([{ path: "/edit", element: <OffSiteEditor /> }], {
      initialEntries: ["/edit"],
    });
    render(<RouterProvider router={router} />);
    await userEvent.type(screen.getByLabelText("Note"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: DISCARD_MESSAGES.discard }));
    expect(prompted).toBe(false);
  });

  it("guards again once a leave has landed and the form is still there", async () => {
    // The form lives in a layout, so leaving to a child page doesn't unmount it.
    function Layout() {
      return (
        <>
          <Editor />
          <Outlet />
        </>
      );
    }
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <Layout />,
          children: [
            { path: "edit", element: null },
            { path: "saved", element: <p>Saved page</p> },
            { path: "elsewhere", element: <p>Elsewhere page</p> },
          ],
        },
      ],
      { initialEntries: ["/edit"] },
    );
    render(<RouterProvider router={router} />);
    await userEvent.type(screen.getByLabelText("Note"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved page")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("link", { name: "Elsewhere" }));
    expect(dialog()).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/saved");
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
  });

  it("drops a navigation started while a save is in flight, without asking", async () => {
    function SavingEditor() {
      const [text, setText] = useState("");
      const guard = useUnsavedChangesGuard(text !== "", { isBusy: text === "saving" });
      return (
        <>
          <label>
            Note
            <input value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <Link to="/elsewhere">Elsewhere</Link>
          <UnsavedChangesDialog
            open={guard.isAsking}
            copy={DISCARD_MESSAGES}
            onKeepEditing={guard.keepEditing}
            onDiscard={guard.discard}
          />
        </>
      );
    }
    const router = createMemoryRouter(
      [
        { path: "/edit", element: <SavingEditor /> },
        { path: "/elsewhere", element: <p>Elsewhere page</p> },
      ],
      { initialEntries: ["/edit"] },
    );
    render(<RouterProvider router={router} />);
    await userEvent.type(screen.getByLabelText("Note"), "saving");
    await userEvent.click(screen.getByRole("link", { name: "Elsewhere" }));

    expect(dialog()).toBeNull();
    expect(router.state.location.pathname).toBe("/edit");
    expect(screen.queryByText("Elsewhere page")).toBeNull();
    // The dropped navigation is cleared, not left waiting to ask once the save is over.
    await userEvent.type(screen.getByLabelText("Note"), "!");
    expect(dialog()).toBeNull();
    expect(router.state.location.pathname).toBe("/edit");
  });
});
