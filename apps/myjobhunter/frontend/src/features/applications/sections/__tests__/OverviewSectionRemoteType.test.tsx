/** The overview's Remote field reads as a label, with a dash when unknown. */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import OverviewSection from "../OverviewSection";
import type { Application } from "@myjobhunter/api-client/types/application";

function renderWith(remoteType: string) {
  render(<OverviewSection application={{ remote_type: remoteType, events: [] } as unknown as Application} />);
  return screen.getByText("Remote", { selector: "p" }).parentElement as HTMLElement;
}

describe("OverviewSection remote type", () => {
  it("shows the formatted label", () => {
    expect(renderWith("onsite")).toHaveTextContent("Onsite");
  });

  it("shows a dash when the application doesn't say", () => {
    expect(renderWith("unknown")).toHaveTextContent("—");
  });
});
