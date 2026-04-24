import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Pagination from "../components/data/Pagination";

describe("Pagination", () => {
  it("renders nothing when total is 0", () => {
    const { container } = render(
      <Pagination page={1} pageSize={10} total={0} onPageChange={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders showing text", () => {
    render(
      <Pagination page={1} pageSize={10} total={25} onPageChange={() => {}} />
    );
    expect(screen.getByText("Showing 1–10 of 25")).toBeInTheDocument();
  });

  it("renders correct showing text on page 2", () => {
    render(
      <Pagination page={2} pageSize={10} total={25} onPageChange={() => {}} />
    );
    expect(screen.getByText("Showing 11–20 of 25")).toBeInTheDocument();
  });

  it("disables Previous button on first page", () => {
    render(
      <Pagination page={1} pageSize={10} total={30} onPageChange={() => {}} />
    );
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
  });

  it("disables Next button on last page", () => {
    render(
      <Pagination page={3} pageSize={10} total={30} onPageChange={() => {}} />
    );
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("enables both Prev and Next on middle pages", () => {
    render(
      <Pagination page={2} pageSize={10} total={30} onPageChange={() => {}} />
    );
    expect(screen.getByRole("button", { name: "Previous page" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).not.toBeDisabled();
  });

  it("calls onPageChange with correct page when Next is clicked", async () => {
    const onPageChange = vi.fn();
    render(
      <Pagination page={1} pageSize={10} total={30} onPageChange={onPageChange} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("calls onPageChange with correct page when Previous is clicked", async () => {
    const onPageChange = vi.fn();
    render(
      <Pagination page={3} pageSize={10} total={30} onPageChange={onPageChange} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("calls onPageSizeChange when page size selector changes", async () => {
    const onPageSizeChange = vi.fn();
    render(
      <Pagination
        page={1}
        pageSize={10}
        total={100}
        onPageChange={() => {}}
        onPageSizeChange={onPageSizeChange}
        pageSizeOptions={[10, 25, 50]}
      />
    );
    const select = screen.getByLabelText("Rows per page:");
    await userEvent.selectOptions(select, "25");
    expect(onPageSizeChange).toHaveBeenCalledWith(25);
  });

  it("does not render page size selector when onPageSizeChange is not provided", () => {
    render(
      <Pagination page={1} pageSize={10} total={30} onPageChange={() => {}} />
    );
    expect(screen.queryByLabelText("Rows per page:")).toBeNull();
  });
});
