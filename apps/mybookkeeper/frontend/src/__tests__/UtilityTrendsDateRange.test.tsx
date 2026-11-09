import { describe, it, expect, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { store } from "@/shared/store";
import UtilityTrends from "@/app/features/analytics/UtilityTrends";

vi.mock("@mybookkeeper/api-client/store/analyticsApi", () => ({
  useGetUtilityTrendsQuery: vi.fn(() => ({
    data: {
      trends: [
        { period: "2025-01", property_id: "p1", property_name: "Beach House", sub_category: "electricity", total: 120 },
        { period: "2025-02", property_id: "p1", property_name: "Beach House", sub_category: "electricity", total: 135 },
      ],
      summary: { electricity: 255 },
      total_spend: 255,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })),
}));

vi.mock("@mybookkeeper/api-client/store/propertiesApi", () => ({
  useGetPropertiesQuery: vi.fn(() => ({ data: [], isLoading: false })),
}));

describe("UtilityTrends date range", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  // Both dates change before React re-renders, as when a user (or a test)
  // types one date right after the other. The second change must build on
  // the first, not on the query of the last render.
  it("keeps both dates when they change in the same render", () => {
    window.history.replaceState(null, "", "/analytics");
    render(
      <Provider store={store}>
        <BrowserRouter>
          <UtilityTrends />
        </BrowserRouter>
      </Provider>,
    );

    act(() => {
      fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2000-01-01" } });
      fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2000-12-31" } });
    });

    const params = new URLSearchParams(window.location.search);
    expect(params.get("from")).toBe("2000-01-01");
    expect(params.get("to")).toBe("2000-12-31");
    expect(screen.getByLabelText("From date")).toHaveValue("2000-01-01");
  });
});
