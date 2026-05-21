/**
 * PaneReplaceOverlay unit tests — PR1 per-pane local-upload Replace.
 *
 * Focused on the rendered affordance + the file-picker MIME guard. The upload
 * state machine itself (idle → uploading → error) lives in usePaneUpload;
 * end-to-end XHR + RTK-mutation orchestration would need heavy mocking and is
 * better covered by a follow-up hook test or a vitest fixture.
 */
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { baseApi } from "@platform/ui";

import PaneReplaceOverlay from "@/components/lineup/PaneReplaceOverlay";

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (gdm) => gdm().concat(baseApi.middleware),
  });
}

function renderWithStore(ui: React.ReactElement) {
  return render(<Provider store={makeStore()}>{ui}</Provider>);
}

describe("PaneReplaceOverlay", () => {
  it("renders the Replace button with pane-specific aria-label", () => {
    renderWithStore(
      <PaneReplaceOverlay lineupId="abc-123" pane="stand" />,
    );
    expect(
      screen.getByRole("button", { name: /replace stand pane content/i }),
    ).toBeInTheDocument();
  });

  it("file input accepts both image and video MIME for STAND pane", () => {
    const { container } = renderWithStore(
      <PaneReplaceOverlay lineupId="abc-123" pane="stand" />,
    );
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input).toBeTruthy();
    // STAND accepts both still and clip → image/* and video/* MIMEs
    expect(input.accept).toMatch(/image\/png/);
    expect(input.accept).toMatch(/video\/mp4/);
  });

  it("file input accepts video MIME ONLY for THROW pane (no still column)", () => {
    const { container } = renderWithStore(
      <PaneReplaceOverlay lineupId="abc-123" pane="throw" />,
    );
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input.accept).toMatch(/video\/mp4/);
    expect(input.accept).not.toMatch(/image\//);
  });

  it("file input accepts video MIME ONLY for LANDING pane", () => {
    const { container } = renderWithStore(
      <PaneReplaceOverlay lineupId="abc-123" pane="landing" />,
    );
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input.accept).toMatch(/video\/mp4/);
    expect(input.accept).not.toMatch(/image\//);
  });

  it("file input accepts both image and video MIME for AIM pane", () => {
    const { container } = renderWithStore(
      <PaneReplaceOverlay lineupId="abc-123" pane="aim" />,
    );
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input.accept).toMatch(/image\/png/);
    expect(input.accept).toMatch(/video\/mp4/);
  });
});
