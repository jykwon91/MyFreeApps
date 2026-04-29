import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import VendorForm from "@/app/features/vendors/VendorForm";
import type { VendorResponse } from "@/shared/types/vendor/vendor-response";

const createVendor = vi.fn<(arg: Record<string, unknown>) => { unwrap: () => Promise<unknown> }>(() => ({
  unwrap: () => Promise.resolve({}),
}));
const updateVendor = vi.fn<(arg: { id: string; data: Record<string, unknown> }) => { unwrap: () => Promise<unknown> }>(() => ({
  unwrap: () => Promise.resolve({}),
}));

vi.mock("@/shared/store/vendorsApi", () => ({
  useCreateVendorMutation: () => [createVendor, { isLoading: false }],
  useUpdateVendorMutation: () => [updateVendor, { isLoading: false }],
}));

const successToast = vi.fn();
const errorToast = vi.fn();

vi.mock("@/shared/lib/toast-store", () => ({
  showSuccess: (...a: unknown[]) => successToast(...a),
  showError: (...a: unknown[]) => errorToast(...a),
}));

const existingVendor: VendorResponse = {
  id: "vendor-1",
  organization_id: "org-1",
  user_id: "user-1",
  name: "Bob's Plumbing",
  category: "plumber",
  phone: "555-0101",
  email: "bob@example.com",
  address: "123 Main St",
  hourly_rate: "125.00",
  flat_rate_notes: "Flat $200 for drain",
  preferred: true,
  notes: "Reliable",
  last_used_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function renderForm(props: Partial<React.ComponentProps<typeof VendorForm>> = {}) {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  const onUpdated = vi.fn();
  return {
    onClose,
    onCreated,
    onUpdated,
    ...render(
      <Provider store={store}>
        <VendorForm
          onClose={onClose}
          onCreated={onCreated}
          onUpdated={onUpdated}
          {...props}
        />
      </Provider>,
    ),
  };
}

describe("VendorForm", () => {
  beforeEach(() => {
    createVendor.mockClear();
    updateVendor.mockClear();
    successToast.mockClear();
    errorToast.mockClear();
  });

  describe("create mode", () => {
    it("renders empty defaults and the Add vendor heading", () => {
      renderForm();
      expect(screen.getByRole("heading", { name: /Add vendor/i })).toBeInTheDocument();
      expect(screen.getByTestId("vendor-form-name")).toHaveValue("");
      // Default category falls on the first option (handyman).
      expect(screen.getByTestId("vendor-form-category")).toHaveValue("handyman");
    });

    it("blocks submit when name is empty", async () => {
      renderForm();
      // No name typed — submit should not call createVendor.
      fireEvent.submit(screen.getByTestId("vendor-form"));
      await waitFor(() => {
        expect(createVendor).not.toHaveBeenCalled();
      });
    });

    it("submits the create payload with trimmed strings and null for blank optionals", async () => {
      renderForm();
      fireEvent.input(screen.getByTestId("vendor-form-name"), {
        target: { value: "  Acme HVAC  " },
      });
      fireEvent.change(screen.getByTestId("vendor-form-category"), {
        target: { value: "hvac" },
      });
      fireEvent.input(screen.getByTestId("vendor-form-phone"), {
        target: { value: "555-1234" },
      });
      // Email left blank — should serialise to null.
      fireEvent.submit(screen.getByTestId("vendor-form"));
      await waitFor(() => {
        expect(createVendor).toHaveBeenCalledTimes(1);
      });
      const payload = createVendor.mock.calls[0][0];
      expect(payload.name).toBe("Acme HVAC");
      expect(payload.category).toBe("hvac");
      expect(payload.phone).toBe("555-1234");
      expect(payload.email).toBeNull();
      expect(payload.address).toBeNull();
      expect(payload.hourly_rate).toBeNull();
    });
  });

  describe("edit mode", () => {
    it("pre-fills from the supplied vendor", () => {
      renderForm({ vendor: existingVendor });
      expect(screen.getByRole("heading", { name: /Edit vendor/i })).toBeInTheDocument();
      expect(screen.getByTestId("vendor-form-name")).toHaveValue("Bob's Plumbing");
      expect(screen.getByTestId("vendor-form-category")).toHaveValue("plumber");
      expect(screen.getByTestId("vendor-form-phone")).toHaveValue("555-0101");
      expect(screen.getByTestId("vendor-form-hourly-rate")).toHaveValue(125);
      expect(screen.getByTestId("vendor-form-preferred")).toBeChecked();
    });

    it("only sends changed fields in PATCH (dirty-field tracking)", async () => {
      renderForm({ vendor: existingVendor });
      fireEvent.input(screen.getByTestId("vendor-form-name"), {
        target: { value: "Bob's Plumbing & Heating" },
      });
      // Don't touch any other field.
      fireEvent.submit(screen.getByTestId("vendor-form"));
      await waitFor(() => {
        expect(updateVendor).toHaveBeenCalledTimes(1);
      });
      const payload = updateVendor.mock.calls[0][0];
      expect(payload.id).toBe("vendor-1");
      // Only name should be in the patch.
      expect(Object.keys(payload.data)).toEqual(["name"]);
      expect(payload.data.name).toBe("Bob's Plumbing & Heating");
    });

    it("closes without calling updateVendor if nothing changed", async () => {
      const { onClose } = renderForm({ vendor: existingVendor });
      fireEvent.submit(screen.getByTestId("vendor-form"));
      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
      expect(updateVendor).not.toHaveBeenCalled();
    });
  });
});
