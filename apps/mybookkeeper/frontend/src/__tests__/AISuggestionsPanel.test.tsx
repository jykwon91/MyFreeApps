import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AISuggestionsPanel from "@/app/features/leases/AISuggestionsPanel";
import type { SuggestedPlaceholderItem } from "@/shared/types/lease/suggest-placeholders-response";

const suggestions: SuggestedPlaceholderItem[] = [
  {
    key: "TENANT FULL NAME",
    description: "Legal name of the tenant.",
    input_type: "text",
  },
  {
    key: "MOVE-IN DATE",
    description: "Date the tenant takes possession.",
    input_type: "date",
  },
];

describe("AISuggestionsPanel", () => {
  it("renders suggestion count in header", () => {
    render(
      <AISuggestionsPanel
        suggestions={suggestions}
        truncated={false}
        pagesNote={null}
        templatePlaceholderKeys={new Set()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByTestId("ai-suggestions-panel")).toBeInTheDocument();
    expect(screen.getByText(/2 placeholders/i)).toBeInTheDocument();
  });

  it("shows suggestions in the list", () => {
    render(
      <AISuggestionsPanel
        suggestions={suggestions}
        truncated={false}
        pagesNote={null}
        templatePlaceholderKeys={new Set()}
        onDismiss={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("ai-suggestion-TENANT FULL NAME"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("ai-suggestion-MOVE-IN DATE")).toBeInTheDocument();
  });

  it("marks suggestions already in template spec as not 'not in bracket spec'", () => {
    render(
      <AISuggestionsPanel
        suggestions={suggestions}
        truncated={false}
        pagesNote={null}
        templatePlaceholderKeys={new Set(["TENANT FULL NAME"])}
        onDismiss={vi.fn()}
      />,
    );
    // Only MOVE-IN DATE is "new" — TENANT FULL NAME was already detected by regex.
    const newBadges = screen.getAllByText(/not in bracket spec/i);
    expect(newBadges).toHaveLength(1);
  });

  it("shows truncation notice when truncated=true", () => {
    render(
      <AISuggestionsPanel
        suggestions={suggestions}
        truncated={true}
        pagesNote="The document was too long to analyse in full"
        templatePlaceholderKeys={new Set()}
        onDismiss={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/too long to analyse/i),
    ).toBeInTheDocument();
  });

  it("calls onDismiss when dismiss button clicked", () => {
    const onDismiss = vi.fn();
    render(
      <AISuggestionsPanel
        suggestions={suggestions}
        truncated={false}
        pagesNote={null}
        templatePlaceholderKeys={new Set()}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByTestId("ai-suggestions-dismiss"));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("shows empty message when no suggestions", () => {
    render(
      <AISuggestionsPanel
        suggestions={[]}
        truncated={false}
        pagesNote={null}
        templatePlaceholderKeys={new Set()}
        onDismiss={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/didn't find any placeholders/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("ai-suggestions-list"),
    ).not.toBeInTheDocument();
  });
});
