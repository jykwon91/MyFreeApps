import { render, screen, fireEvent } from "@testing-library/react-native";
import PeopleScreen from "../src/features/people/PeopleScreen";

const mockSetParams = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  router: { setParams: (params: unknown) => mockSetParams(params) },
  useLocalSearchParams: () => mockParams,
}));
const mockApplicants = jest.fn();
const mockInquiries = jest.fn();
jest.mock("../src/features/applicants/ApplicantsScreen", () => ({
  __esModule: true,
  default: (props: unknown) => {
    mockApplicants(props);
    const { Text } = jest.requireActual("react-native");
    return <Text>Applicants list</Text>;
  },
}));
jest.mock("../src/features/inquiries/InquiriesScreen", () => ({
  __esModule: true,
  default: (props: unknown) => {
    mockInquiries(props);
    const { Text } = jest.requireActual("react-native");
    return <Text>Inquiries list</Text>;
  },
}));

beforeEach(() => {
  mockParams = {};
  jest.clearAllMocks();
});

describe("PeopleScreen", () => {
  it("opens on inquiries, so existing links keep working", async () => {
    mockParams = { view: "spam", stage: "new" };
    await render(<PeopleScreen />);
    expect(screen.getByText("Inquiries list")).toBeTruthy();
    expect(mockInquiries.mock.calls[0][0]).toMatchObject({ view: "spam", stage: "new" });
  });

  it("clears the other section's filters when switching", async () => {
    mockParams = { view: "spam", stage: "new" };
    await render(<PeopleScreen />);
    await fireEvent.press(screen.getByRole("tab", { name: "Applicants" }));
    expect(mockSetParams).toHaveBeenCalledWith({ section: "applicants", stage: undefined, view: undefined });
  });

  it("shows applicants, and ignores an inquiry stage in the link", async () => {
    mockParams = { section: "applicants", stage: "new" };
    await render(<PeopleScreen />);
    expect(screen.getByText("Applicants list")).toBeTruthy();
    expect(mockApplicants.mock.calls[0][0]).toMatchObject({ stage: null });
  });
});
