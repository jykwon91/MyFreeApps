import { screen } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import CompanyRoute from "../app/(app)/companies/[id]";
import { INVALID_LINK_MESSAGES } from "../src/constants/invalidLink";

const mockCompanyScreen = jest.fn();

jest.mock("../src/features/companyDetail/CompanyDetailScreen", () => ({
  __esModule: true,
  default: (props: { id: string }) => {
    mockCompanyScreen(props);
    return null;
  },
}));

const COMPANY_ID = "3f2b8c1e-9d4a-4e7b-8a6f-1c2d3e4f5a6b";

beforeEach(() => jest.clearAllMocks());

describe("company route", () => {
  it("says it can't find the company for an id that isn't a company id, without asking the API", async () => {
    await renderRouter({ "companies/[id]": CompanyRoute }, { initialUrl: "/companies/abc" });
    expect(screen.getByRole("header", { name: INVALID_LINK_MESSAGES.heading })).toBeTruthy();
    expect(mockCompanyScreen).not.toHaveBeenCalled();
  });

  it("opens the company for a real id", async () => {
    await renderRouter({ "companies/[id]": CompanyRoute }, { initialUrl: `/companies/${COMPANY_ID}` });
    expect(mockCompanyScreen).toHaveBeenCalledWith({ id: COMPANY_ID });
  });
});
