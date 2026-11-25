import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LeaseHouseCard from "@/app/features/leases/LeaseHouseCard";
import PropertySelect from "@/app/features/properties/PropertySelect";
import { LEASE_PROPERTY_MESSAGES } from "@/shared/lib/lease-property-messages";

const mockProperties = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@mybookkeeper/api-client/store/propertiesApi", () => ({
  useGetPropertiesQuery: () => mockProperties(),
}));

vi.mock("@mybookkeeper/api-client/store/signedLeasesApi", () => ({
  useUpdateSignedLeaseMutation: () => [mockUpdate, { isLoading: false }],
}));

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const HOUSES = [
  { id: "prop-1", name: "Main House", is_active: true },
  { id: "prop-2", name: "Back Cottage", is_active: true },
  { id: "prop-3", name: "Sold Duplex", is_active: false },
];

function loaded(data: unknown = HOUSES) {
  return { data, error: undefined, isFetching: false, isError: false, refetch: vi.fn() };
}

describe("LeaseHouseCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProperties.mockReturnValue(loaded());
  });

  it("shows the lease's house and no warning", () => {
    render(<LeaseHouseCard leaseId="lease-1" propertyId="prop-1" canWrite />);

    expect(screen.getByTestId("lease-house-name")).toHaveTextContent("Main House");
    expect(screen.queryByTestId("lease-house-missing-warning")).toBeNull();
    expect(screen.getByTestId("lease-house-save")).toBeDisabled();
  });

  it("warns when the lease has no house", () => {
    render(<LeaseHouseCard leaseId="lease-1" propertyId={null} canWrite />);

    expect(screen.getByTestId("lease-house-missing-warning")).toHaveTextContent(LEASE_PROPERTY_MESSAGES.missingWarning);
    expect(screen.queryByTestId("lease-house-name")).toBeNull();
  });

  it("saves a new house and says so", async () => {
    const { showSuccess } = await import("@platform/ui");
    mockUpdate.mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) });
    render(<LeaseHouseCard leaseId="lease-1" propertyId="prop-1" canWrite />);

    fireEvent.change(screen.getByTestId("lease-house-select"), { target: { value: "prop-2" } });
    fireEvent.click(screen.getByTestId("lease-house-save"));

    expect(mockUpdate).toHaveBeenCalledWith({ leaseId: "lease-1", data: { property_id: "prop-2" } });
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(LEASE_PROPERTY_MESSAGES.saved));
  });

  it("says so when the save fails", async () => {
    const { showError } = await import("@platform/ui");
    mockUpdate.mockReturnValue({ unwrap: vi.fn().mockRejectedValue({ status: 500 }) });
    render(<LeaseHouseCard leaseId="lease-1" propertyId={null} canWrite />);

    fireEvent.change(screen.getByTestId("lease-house-select"), { target: { value: "prop-1" } });
    fireEvent.click(screen.getByTestId("lease-house-save"));

    await waitFor(() => expect(showError).toHaveBeenCalledWith(LEASE_PROPERTY_MESSAGES.saveFailed));
  });

  it("gives a viewer the house but no way to change it", () => {
    render(<LeaseHouseCard leaseId="lease-1" propertyId="prop-1" canWrite={false} />);

    expect(screen.getByTestId("lease-house-name")).toHaveTextContent("Main House");
    expect(screen.queryByTestId("lease-house-select")).toBeNull();
    expect(screen.queryByTestId("lease-house-save")).toBeNull();
  });
});

describe("PropertySelect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a skeleton while the houses load", () => {
    mockProperties.mockReturnValue({ data: undefined, error: undefined, isFetching: true, refetch: vi.fn() });
    render(<PropertySelect id="p" value="" onChange={vi.fn()} testId="house" />);

    expect(screen.getByTestId("house-skeleton")).toBeInTheDocument();
  });

  it("offers Retry when the houses can't load", () => {
    const refetch = vi.fn();
    mockProperties.mockReturnValue({ data: undefined, error: { status: 500 }, isFetching: false, refetch });
    render(<PropertySelect id="p" value="" onChange={vi.fn()} testId="house" />);

    expect(screen.getByRole("alert")).toHaveTextContent(LEASE_PROPERTY_MESSAGES.loadFailed);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("says there are no houses yet", () => {
    mockProperties.mockReturnValue(loaded([]));
    render(<PropertySelect id="p" value="" onChange={vi.fn()} testId="house" />);

    expect(screen.getByTestId("house-empty")).toHaveTextContent(LEASE_PROPERTY_MESSAGES.noHouses);
  });

  it("lists active houses, plus an inactive one only when it is the current value", () => {
    mockProperties.mockReturnValue(loaded());
    const { rerender } = render(<PropertySelect id="p" value="" onChange={vi.fn()} testId="house" />);
    const labels = () => Array.from((screen.getByTestId("house") as HTMLSelectElement).options).map((o) => o.textContent);

    expect(labels()).toEqual([LEASE_PROPERTY_MESSAGES.choose, "Main House", "Back Cottage"]);
    rerender(<PropertySelect id="p" value="prop-3" onChange={vi.fn()} testId="house" />);
    expect(labels()).toContain("Sold Duplex");
  });
});
