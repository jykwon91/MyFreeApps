import { fireEvent, render, screen } from "@testing-library/react-native";
import AiSuggestionsCard from "../src/features/leaseTemplates/AiSuggestionsCard";

describe("the AI suggestions card", () => {
  it("tells a screen reader whether the suggestions are showing", async () => {
    const suggestions = { suggestions: [{ key: "TENANT NAME", description: "Who rents", input_type: "text" as const }], truncated: false, pages_note: null };
    await render(<AiSuggestionsCard onDismiss={jest.fn()} savedKeys={new Set()} suggestions={suggestions} />);

    await fireEvent.press(screen.getByRole("button", { name: "Hide suggestions", expanded: true }));
    expect(screen.queryByText("[TENANT NAME]")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Show suggestions", expanded: false }));
    expect(screen.getByText("[TENANT NAME]")).toBeTruthy();
  });
});
