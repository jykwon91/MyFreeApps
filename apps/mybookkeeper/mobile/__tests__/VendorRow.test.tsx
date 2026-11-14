import type { VendorSummary } from "@mybookkeeper/api-client/types/vendor/vendor-summary";
import { ToastProvider } from "@platform/mobile";
import { render, screen } from "@testing-library/react-native";
import VendorRow from "../src/features/vendors/VendorRow";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const THREE_DAYS_AGO = new Date(Date.now() - THREE_DAYS_MS).toISOString();

function aSummary(overrides: Partial<VendorSummary> = {}): VendorSummary {
  return {
    id: "v1",
    organization_id: "o1",
    user_id: "u1",
    name: "Reliable Plumbing",
    category: "plumber",
    phone: null,
    hourly_rate: "95.50",
    preferred: false,
    last_used_at: THREE_DAYS_AGO,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

async function show(vendor: VendorSummary) {
  await render(
    <ToastProvider bottomOffset={0}>
      <VendorRow vendor={vendor} onPress={jest.fn()} />
    </ToastProvider>,
  );
}

describe("VendorRow facts", () => {
  it("shows the rate and when the vendor was last used, and says both aloud", async () => {
    await show(aSummary());
    expect(screen.getByText("$95.50/hr · 3 days ago")).toBeTruthy();
    expect(screen.getByLabelText("Reliable Plumbing, Plumber, $95.50/hr · 3 days ago")).toBeTruthy();
  });

  it("says never used when there is no last-used time", async () => {
    await show(aSummary({ last_used_at: null }));
    expect(screen.getByText("$95.50/hr · Never used")).toBeTruthy();
  });

  it("shows a dash when there is no rate", async () => {
    await show(aSummary({ hourly_rate: null }));
    expect(screen.getByText("— · 3 days ago")).toBeTruthy();
  });

  it("shows a dash and never used when both are missing, and keeps Preferred in the label", async () => {
    await show(aSummary({ hourly_rate: null, last_used_at: null, preferred: true }));
    expect(screen.getByLabelText("Reliable Plumbing, Plumber, Preferred, — · Never used")).toBeTruthy();
  });
});
