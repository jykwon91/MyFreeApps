import { screen } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import TaxReviewFormRoute from "../app/(app)/tax/review-form";
import VendorRoute from "../app/(app)/vendors/[id]/index";
import SyncSessionRoute from "../app/(app)/integrations/sync/[id]";
import { INVALID_LINK_MESSAGES } from "../src/constants/invalidLink";

const mockVendorScreen = jest.fn();
const mockTaxReviewFormScreen = jest.fn();
const mockSyncSessionScreen = jest.fn();

jest.mock("../src/features/vendors/VendorDetailScreen", () => ({
  __esModule: true,
  default: (props: { id: string }) => {
    mockVendorScreen(props);
    return null;
  },
}));
jest.mock("../src/features/tax/TaxReviewFormScreen", () => ({
  __esModule: true,
  default: (props: { year: number }) => {
    mockTaxReviewFormScreen(props);
    return null;
  },
}));
jest.mock("../src/features/integrations/SyncSessionScreen", () => ({
  __esModule: true,
  default: (props: { id: number }) => {
    mockSyncSessionScreen(props);
    return null;
  },
}));

const VENDOR_ID = "3f2b8c1e-9d4a-4e7b-8a6f-1c2d3e4f5a6b";

beforeEach(() => jest.clearAllMocks());

describe("tax review form route", () => {
  it("says it can't find the form when the year is missing, instead of reading it as NaN", async () => {
    await renderRouter({ "tax/review-form": TaxReviewFormRoute }, { initialUrl: "/tax/review-form?form=schedule_e" });
    expect(screen.getByRole("header", { name: INVALID_LINK_MESSAGES.heading })).toBeTruthy();
    expect(mockTaxReviewFormScreen).not.toHaveBeenCalled();
  });

  it("says it can't find the form when the year is garbage", async () => {
    await renderRouter({ "tax/review-form": TaxReviewFormRoute }, { initialUrl: "/tax/review-form?year=abc&form=schedule_e" });
    expect(screen.getByRole("header", { name: INVALID_LINK_MESSAGES.heading })).toBeTruthy();
    expect(mockTaxReviewFormScreen).not.toHaveBeenCalled();
  });

  it("opens the form for a real year", async () => {
    await renderRouter({ "tax/review-form": TaxReviewFormRoute }, { initialUrl: "/tax/review-form?year=2025&form=schedule_e" });
    expect(mockTaxReviewFormScreen).toHaveBeenCalledWith(expect.objectContaining({ year: 2025 }));
  });
});

describe("vendor route", () => {
  it("says it can't find the vendor for an id that isn't a vendor id, without asking the API", async () => {
    await renderRouter({ "vendors/[id]/index": VendorRoute }, { initialUrl: "/vendors/abc" });
    expect(screen.getByRole("header", { name: INVALID_LINK_MESSAGES.heading })).toBeTruthy();
    expect(mockVendorScreen).not.toHaveBeenCalled();
  });

  it("opens the vendor for a real id", async () => {
    await renderRouter({ "vendors/[id]/index": VendorRoute }, { initialUrl: `/vendors/${VENDOR_ID}` });
    expect(mockVendorScreen).toHaveBeenCalledWith({ id: VENDOR_ID });
  });
});

describe("sync session route", () => {
  it("rejects an id that isn't a whole number", async () => {
    await renderRouter({ "integrations/sync/[id]": SyncSessionRoute }, { initialUrl: "/integrations/sync/abc" });
    expect(screen.getByRole("header", { name: INVALID_LINK_MESSAGES.heading })).toBeTruthy();
    expect(mockSyncSessionScreen).not.toHaveBeenCalled();
  });

  it("opens a numbered session", async () => {
    await renderRouter({ "integrations/sync/[id]": SyncSessionRoute }, { initialUrl: "/integrations/sync/42" });
    expect(mockSyncSessionScreen).toHaveBeenCalledWith({ id: 42 });
  });
});
