import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import YearFilter from "@/shared/components/ui/YearFilter";
import type { YearOption } from "@/shared/types/dashboard/year-option";

function renderYearFilter(
  value: YearOption,
  availableYears: number[],
  onChange = vi.fn(),
) {
  return render(
    <YearFilter
      value={value}
      onChange={onChange}
      availableYears={availableYears}
    />,
  );
}

describe("YearFilter", () => {
  it('renders "All time" option when value is "all"', () => {
    renderYearFilter("all", [2026, 2025]);

    const select = screen.getByTestId("year-filter");
    expect(select).toBeInTheDocument();
    expect((select as HTMLSelectElement).value).toBe("all");
  });

  it("renders the selected year when value is a number", () => {
    renderYearFilter(2025, [2026, 2025]);

    const select = screen.getByTestId("year-filter");
    expect((select as HTMLSelectElement).value).toBe("2025");
  });

  it("renders year options in descending order", () => {
    renderYearFilter(2026, [2026, 2025, 2024]);

    const options = screen.getAllByRole("option");
    // First option is "All time", then years in order provided
    expect(options[0]).toHaveValue("all");
    expect(options[0]).toHaveTextContent("All time");
    expect(options[1]).toHaveValue("2026");
    expect(options[2]).toHaveValue("2025");
    expect(options[3]).toHaveValue("2024");
  });

  it('calls onChange with "all" when "All time" is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderYearFilter(2026, [2026, 2025], onChange);

    const select = screen.getByTestId("year-filter");
    await user.selectOptions(select, "all");

    expect(onChange).toHaveBeenCalledWith("all");
  });

  it("calls onChange with a number when a year is selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderYearFilter("all", [2026, 2025], onChange);

    const select = screen.getByTestId("year-filter");
    await user.selectOptions(select, "2025");

    expect(onChange).toHaveBeenCalledWith(2025);
  });

  it("renders an option for every available year regardless of the selected value (regression: selecting a year must not drop other options)", () => {
    renderYearFilter(2024, [2026, 2025, 2024, 2023]);

    const select = screen.getByTestId("year-filter") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(["all", "2026", "2025", "2024", "2023"]);
  });

  it("has accessible aria-label", () => {
    renderYearFilter(2026, [2026]);

    const select = screen.getByLabelText("Filter by year");
    expect(select).toBeInTheDocument();
  });

  it("matches snapshot for 'all' value", () => {
    const { container } = renderYearFilter("all", [2026, 2025]);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("matches snapshot for numeric year value", () => {
    const { container } = renderYearFilter(2025, [2026, 2025]);
    expect(container.firstChild).toMatchSnapshot();
  });
});
